import type { ManagedAuction, Page, PublicAuction } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Auction, Setting } from '../src/models'
import { openDueAuctions } from '../src/services/auctions'
import { getSettings } from '../src/services/settings'
import { useTestDb } from './db'
import { createTestApp } from './helpers'
import { createAdmin, createSeller, logIn, uploadKey } from './images'
import { queuedEmails } from './outbox'
import { TestClient } from './trpc'
import { createUser } from './users'

useTestDb()

const HOUR_MS = 3_600_000

let app: FastifyInstance
let seller: TestClient
let admin: TestClient
let visitor: TestClient
let imageKey: string

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  seller = new TestClient(app)
  admin = new TestClient(app)
  visitor = new TestClient(app)
  await createSeller()
  await createAdmin()
  await logIn(seller, 'vendeur@x.fr')
  await logIn(admin, 'admin@x.fr')
  imageKey = await uploadKey(seller)
})

/** Contenu valide : début dans 2 h, fin 2 h plus tard. */
function content(overrides: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    title: 'Vase ancien',
    description: 'Un beau vase.',
    images: [imageKey],
    startingPrice: 1000,
    startsAt: new Date(now + 2 * HOUR_MS).toISOString(),
    endsAt: new Date(now + 4 * HOUR_MS).toISOString(),
    ...overrides,
  }
}

async function createDraft(overrides: Record<string, unknown> = {}) {
  const result = await seller.mutate<ManagedAuction>('auction.create', content(overrides))
  if (result.error !== undefined) throw new Error(`Création impossible : ${result.error.data.code}`)
  return result.data
}

describe('création — T3.2, T3.3, T3.4', () => {
  it('crée une enchère en draft avec ses valeurs initiales', async () => {
    const auction = await createDraft()

    expect(auction).toMatchObject({
      status: 'draft',
      startingPrice: 1000,
      nextMinBid: 1000,
      currentPrice: null,
      bidCount: 0,
      minIncrement: 100,
      sellerName: 'Vera',
    })
    const stored = await Auction.findById(auction.id).orFail()
    expect(stored.currentBidderId).toBeNull()
    expect(stored.images).toEqual([imageKey])
  })

  it('T3.2 — refuse un prix de départ de 99, accepte 100', async () => {
    expect((await seller.mutate('auction.create', content({ startingPrice: 99 }))).status).toBe(400)
    expect((await seller.mutate('auction.create', content({ startingPrice: 100 }))).error).toBe(
      undefined,
    )
  })

  it('T3.3 — refuse un début dans le passé', async () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const result = await seller.mutate(
      'auction.create',
      content({ startsAt: past, endsAt: new Date(Date.now() + 2 * HOUR_MS).toISOString() }),
    )

    expect(result.error?.data.code).toBe('INVALID_DATES')
    expect(await Auction.countDocuments()).toBe(0)
  })

  it('T3.4 — refuse une durée trop courte ou trop longue, accepte les bornes', async () => {
    const start = Date.now() + HOUR_MS
    const at = (duration: number) =>
      content({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + duration).toISOString(),
      })

    const settings = await getSettings()
    for (const duration of [settings.minDurationMs - 1, settings.maxDurationMs + 1]) {
      const result = await seller.mutate('auction.create', at(duration))
      expect(result.error?.data.code).toBe('INVALID_DATES')
    }
    for (const duration of [settings.minDurationMs, settings.maxDurationMs]) {
      expect((await seller.mutate('auction.create', at(duration))).error).toBeUndefined()
    }
  })

  it('utilise le pas minimum des paramètres quand il est absent', async () => {
    await Setting.updateOne(
      { _id: 'global' },
      { $set: { defaultMinIncrement: 250 } },
      { upsert: true },
    )

    const auction = await createDraft()

    expect(auction.minIncrement).toBe(250)
  })

  it('refuse une clé de photo que le serveur ne connaît pas', async () => {
    const result = await seller.mutate(
      'auction.create',
      content({ images: ['3f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c'] }),
    )

    expect(result.error?.data.code).toBe('INVALID_IMAGE')
  })

  it('refuse un statut, un vendeur ou un prix courant imposés par le client', async () => {
    for (const extra of [{ status: 'live' }, { sellerId: 'x' }, { currentPrice: 5 }]) {
      expect((await seller.mutate('auction.create', content(extra))).status).toBe(400)
    }
  })

  it('est réservée aux vendeurs : ni visiteur, ni acheteur, ni admin', async () => {
    await createUser({ email: 'acheteur@x.fr', emailVerifiedAt: new Date() })
    const buyer = new TestClient(app)
    await logIn(buyer, 'acheteur@x.fr')

    expect((await visitor.mutate('auction.create', content())).error?.data.code).toBe(
      'NOT_AUTHENTICATED',
    )
    for (const client of [buyer, admin]) {
      expect((await client.mutate('auction.create', content())).error?.data.code).toBe('FORBIDDEN')
    }
  })
})

describe('modification et annulation par le vendeur — T3.8, T3.9, T3.10', () => {
  it('modifie un draft', async () => {
    const draft = await createDraft()

    const result = await seller.mutate<ManagedAuction>('auction.update', {
      ...content({ title: 'Vase XIXe' }),
      id: draft.id,
    })

    expect(result.data).toMatchObject({ id: draft.id, title: 'Vase XIXe', status: 'draft' })
  })

  it('T3.8 — repasse une enchère scheduled en draft', async () => {
    const draft = await createDraft()
    await Auction.updateOne({ _id: draft.id }, { $set: { status: 'scheduled' } })

    const result = await seller.mutate<ManagedAuction>('auction.update', {
      ...content({ title: 'Nouveau titre' }),
      id: draft.id,
    })

    expect(result.data.status).toBe('draft')
    expect((await Auction.findById(draft.id).orFail()).status).toBe('draft')
  })

  it('efface le motif d’un ancien refus quand le vendeur modifie son brouillon', async () => {
    const draft = await createDraft()
    await Auction.updateOne({ _id: draft.id }, { $set: { cancelReason: 'ancien motif' } })

    await seller.mutate('auction.update', { ...content(), id: draft.id })

    expect((await Auction.findById(draft.id).orFail()).cancelReason).toBeNull()
  })

  it('remet nextMinBid au nouveau prix de départ', async () => {
    const draft = await createDraft()

    const result = await seller.mutate<ManagedAuction>('auction.update', {
      ...content({ startingPrice: 2500 }),
      id: draft.id,
    })

    expect(result.data).toMatchObject({ startingPrice: 2500, nextMinBid: 2500 })
  })

  it('supprime du disque les photos retirées', async () => {
    const draft = await createDraft()
    const other = await uploadKey(seller)

    await seller.mutate('auction.update', { ...content({ images: [other] }), id: draft.id })

    const gone = await seller.http('GET', `/uploads/${imageKey}.webp`)
    const kept = await seller.http('GET', `/uploads/${other}.webp`)
    expect([gone.statusCode, kept.statusCode]).toEqual([404, 200])
  })

  it('T3.9 — refuse de modifier ou d’annuler une enchère live, aussi à l’admin', async () => {
    const draft = await createDraft()
    await Auction.updateOne({ _id: draft.id }, { $set: { status: 'live' } })

    const update = await seller.mutate('auction.update', { ...content(), id: draft.id })
    const cancel = await seller.mutate('auction.cancel', { id: draft.id })
    const validate = await admin.mutate('admin.validate', { id: draft.id })
    const reject = await admin.mutate('admin.reject', { id: draft.id, reason: 'non' })
    const adminUpdate = await admin.mutate('auction.update', { ...content(), id: draft.id })

    expect(update.error?.data.code).toBe('AUCTION_STATE_INVALID')
    expect(cancel.error?.data.code).toBe('AUCTION_STATE_INVALID')
    expect(validate.error?.data.code).toBe('AUCTION_STATE_INVALID')
    expect(reject.error?.data.code).toBe('AUCTION_STATE_INVALID')
    expect(adminUpdate.error?.data.code).toBe('FORBIDDEN')
    expect((await Auction.findById(draft.id).orFail()).status).toBe('live')
  })

  it.each(['ended', 'paid', 'unpaid', 'cancelled'] as const)(
    'refuse de modifier une enchère %s',
    async (status) => {
      const draft = await createDraft()
      await Auction.updateOne({ _id: draft.id }, { $set: { status } })

      const result = await seller.mutate('auction.update', { ...content(), id: draft.id })

      expect(result.error?.data.code).toBe('AUCTION_STATE_INVALID')
    },
  )

  it('T3.10 — un vendeur ne touche pas aux enchères d’un autre', async () => {
    const draft = await createDraft()
    await createSeller('autre@x.fr', 'Otto')
    const other = new TestClient(app)
    await logIn(other, 'autre@x.fr')

    const update = await other.mutate('auction.update', { ...content(), id: draft.id })
    const cancel = await other.mutate('auction.cancel', { id: draft.id })
    const get = await other.query('auction.getMine', { id: draft.id })

    for (const result of [update, cancel, get]) {
      expect(result.error?.data.code).toBe('AUCTION_NOT_FOUND')
    }
    expect((await Auction.findById(draft.id).orFail()).status).toBe('draft')
    expect((await other.query<Page<ManagedAuction>>('auction.mine', {})).data.items).toEqual([])
  })

  it('le vendeur annule un draft ou une scheduled', async () => {
    const first = await createDraft()
    const second = await createDraft()
    await Auction.updateOne({ _id: second.id }, { $set: { status: 'scheduled' } })

    for (const { id } of [first, second]) {
      const result = await seller.mutate<ManagedAuction>('auction.cancel', { id })
      expect(result.data.status).toBe('cancelled')
    }
  })

  it('les erreurs de forme (identifiant, statut) sont des 400', async () => {
    expect((await seller.mutate('auction.cancel', { id: 'pas-un-id' })).status).toBe(400)
    expect((await seller.query('auction.mine', { status: 'inconnu' })).status).toBe(400)
  })
})

describe('modération par l’admin — T3.11, T3.12', () => {
  it('liste les brouillons à valider, les plus anciens d’abord', async () => {
    const first = await createDraft({ title: 'Premier' })
    const second = await createDraft({ title: 'Second' })
    const scheduled = await createDraft({ title: 'Déjà validé' })
    await Auction.updateOne({ _id: scheduled.id }, { $set: { status: 'scheduled' } })

    const result = await admin.query<Page<ManagedAuction>>('admin.pendingAuctions', {})

    expect(result.data.items.map((auction) => auction.id)).toEqual([first.id, second.id])
    expect(result.data.total).toBe(2)
  })

  it('T3.12 — valide un draft : scheduled, publique, email au vendeur', async () => {
    const draft = await createDraft()

    const result = await admin.mutate<ManagedAuction>('admin.validate', { id: draft.id })

    expect(result.data.status).toBe('scheduled')
    const publicView = await visitor.query<PublicAuction>('auction.get', { id: draft.id })
    expect(publicView.data.id).toBe(draft.id)
    const [email] = await queuedEmails({ to: 'vendeur@x.fr', template: 'auction-validated' })
    expect(email?.data).toMatchObject({ title: 'Vase ancien' })
  })

  it('refuse de valider une enchère dont le début est passé', async () => {
    const draft = await createDraft()
    await Auction.updateOne({ _id: draft.id }, { $set: { startsAt: new Date(Date.now() - 1000) } })

    const result = await admin.mutate('admin.validate', { id: draft.id })

    expect(result.error?.data.code).toBe('INVALID_DATES')
    expect((await Auction.findById(draft.id).orFail()).status).toBe('draft')
  })

  it('refuse de valider deux fois', async () => {
    const draft = await createDraft()
    await admin.mutate('admin.validate', { id: draft.id })

    const again = await admin.mutate('admin.validate', { id: draft.id })

    expect(again.error?.data.code).toBe('AUCTION_STATE_INVALID')
    expect(await queuedEmails({ template: 'auction-validated' }).countDocuments()).toBe(1)
  })

  it('T3.11 — refuse sans motif ; avec motif : cancelled et email au vendeur', async () => {
    const draft = await createDraft()

    const missing = await admin.mutate('admin.reject', { id: draft.id })
    const blank = await admin.mutate('admin.reject', { id: draft.id, reason: '  ' })
    expect([missing.status, blank.status]).toEqual([400, 400])
    expect((await Auction.findById(draft.id).orFail()).status).toBe('draft')

    const result = await admin.mutate<ManagedAuction>('admin.reject', {
      id: draft.id,
      reason: 'Photos floues',
    })

    expect(result.data).toMatchObject({ status: 'cancelled', cancelReason: 'Photos floues' })
    const [email] = await queuedEmails({ to: 'vendeur@x.fr', template: 'auction-rejected' })
    expect(email?.data).toMatchObject({ reason: 'Photos floues', title: 'Vase ancien' })
    const own = await seller.query<ManagedAuction>('auction.getMine', { id: draft.id })
    expect(own.data.cancelReason).toBe('Photos floues')
  })

  it('refuse de refuser une enchère scheduled (seule une draft se refuse)', async () => {
    const draft = await createDraft()
    await admin.mutate('admin.validate', { id: draft.id })

    const result = await admin.mutate('admin.reject', { id: draft.id, reason: 'trop tard' })

    expect(result.error?.data.code).toBe('AUCTION_STATE_INVALID')
  })

  it('les procédures admin sont refusées aux autres rôles', async () => {
    const draft = await createDraft()

    for (const client of [seller, visitor]) {
      for (const [procedure, input] of [
        ['admin.pendingAuctions', {}],
        ['admin.validate', { id: draft.id }],
        ['admin.reject', { id: draft.id, reason: 'x' }],
      ] as const) {
        const result =
          procedure === 'admin.pendingAuctions'
            ? await client.query(procedure, input)
            : await client.mutate(procedure, input)
        expect(result.error?.data.code).toMatch(/FORBIDDEN|NOT_AUTHENTICATED/)
      }
    }
    expect((await Auction.findById(draft.id).orFail()).status).toBe('draft')
  })

  it('ne met aucun email en file pour un vendeur anonymisé', async () => {
    const draft = await createDraft()
    const { User } = await import('../src/models')
    await User.updateOne({ email: 'vendeur@x.fr' }, { $set: { email: null } })

    const result = await admin.mutate('admin.validate', { id: draft.id })

    expect(result.error).toBeUndefined()
    expect(await queuedEmails({ template: 'auction-validated' }).countDocuments()).toBe(0)
  })
})

describe('liste et détail publics — T3.13, T3.14', () => {
  async function publish(overrides: Record<string, unknown> = {}, status = 'scheduled') {
    const draft = await createDraft(overrides)
    await Auction.updateOne({ _id: draft.id }, { $set: { status } })
    return draft
  }

  it('T3.13 — une enchère draft ou cancelled n’apparaît jamais, ni en liste ni en détail', async () => {
    const draft = await createDraft()
    const cancelled = await publish({}, 'cancelled')

    for (const filter of ['live', 'upcoming', 'ended'] as const) {
      const list = await visitor.query<Page<PublicAuction>>('auction.list', { filter })
      expect(list.data.items).toEqual([])
    }
    for (const { id } of [draft, cancelled]) {
      const get = await visitor.query('auction.get', { id })
      expect(get.error?.data.code).toBe('AUCTION_NOT_FOUND')
    }
  })

  it('T3.14 — liste paginée, sans email du vendeur', async () => {
    for (let index = 0; index < 3; index += 1) await publish({ title: `Objet ${index}` })

    const first = await visitor.query<Page<PublicAuction>>('auction.list', {
      filter: 'upcoming',
      limit: 2,
    })
    const second = await visitor.query<Page<PublicAuction>>('auction.list', {
      filter: 'upcoming',
      limit: 2,
      page: 2,
    })

    expect(first.data).toMatchObject({ total: 3, page: 1, limit: 2 })
    expect(first.data.items).toHaveLength(2)
    expect(second.data.items).toHaveLength(1)
    expect(first.data.items[0]).toMatchObject({ sellerName: 'Vera' })
    expect(first.raw).not.toContain('vendeur@x.fr')
    expect(first.raw).not.toMatch(/passwordHash|email/i)
  })

  it('filtre par statut : en cours, à venir, terminées', async () => {
    const scheduled = await publish({ title: 'À venir' })
    const live = await publish({ title: 'En cours' }, 'live')
    const ended = await publish({ title: 'Terminée' }, 'ended')
    const paid = await publish({ title: 'Payée' }, 'paid')

    const ids = async (filter: 'live' | 'upcoming' | 'ended') =>
      (await visitor.query<Page<PublicAuction>>('auction.list', { filter })).data.items
        .map((auction) => auction.id)
        .sort()

    expect(await ids('upcoming')).toEqual([scheduled.id])
    expect(await ids('live')).toEqual([live.id])
    expect(await ids('ended')).toEqual([ended.id, paid.id].sort())
  })

  it('trie par fin proche, par prix (prix courant ou prix de départ) et par récence', async () => {
    const now = Date.now()
    const cheapLate = await publish(
      {
        title: 'Peu cher, tard',
        startingPrice: 500,
        endsAt: new Date(now + 10 * HOUR_MS).toISOString(),
      },
      'live',
    )
    const dearSoon = await publish(
      {
        title: 'Cher, bientôt',
        startingPrice: 900,
        endsAt: new Date(now + 4 * HOUR_MS).toISOString(),
      },
      'live',
    )
    // Offre en cours : le prix affiché est l'offre, pas le prix de départ.
    const bid = await publish({ title: 'Avec offre', startingPrice: 100 }, 'live')
    await Auction.updateOne({ _id: bid.id }, { $set: { currentPrice: 700, nextMinBid: 800 } })

    const order = async (sort: string) =>
      (
        await visitor.query<Page<PublicAuction>>('auction.list', { filter: 'live', sort })
      ).data.items.map((auction) => auction.id)

    expect((await order('endingSoon'))[0]).toBe(dearSoon.id)
    expect(await order('priceAsc')).toEqual([cheapLate.id, bid.id, dearSoon.id])
    expect(await order('priceDesc')).toEqual([dearSoon.id, bid.id, cheapLate.id])
    expect(await order('recent')).toEqual([bid.id, dearSoon.id, cheapLate.id])
  })

  it('le détail expose les URLs des photos et le nom du vendeur, pas son email', async () => {
    const auction = await publish()

    const result = await visitor.query<PublicAuction>('auction.get', { id: auction.id })

    expect(result.data.images).toEqual([
      {
        key: imageKey,
        url: `/uploads/${imageKey}.webp`,
        thumbUrl: `/uploads/${imageKey}.thumb.webp`,
      },
    ])
    expect(result.data.sellerName).toBe('Vera')
    expect(result.raw).not.toContain('vendeur@x.fr')
  })

  it('mine : le vendeur voit toutes ses enchères, filtrables par statut', async () => {
    await createDraft()
    await publish({}, 'live')

    const all = await seller.query<Page<ManagedAuction>>('auction.mine', {})
    const live = await seller.query<Page<ManagedAuction>>('auction.mine', { status: 'live' })

    expect(all.data.total).toBe(2)
    expect(live.data.items.map((auction) => auction.status)).toEqual(['live'])
  })

  it('rules : les paramètres utiles au formulaire, aux vendeurs seulement', async () => {
    const result = await seller.query('auction.rules')

    expect(result.data).toEqual({
      defaultMinIncrement: 100,
      minDurationMs: HOUR_MS,
      maxDurationMs: 14 * 24 * HOUR_MS,
    })
    expect((await visitor.query('auction.rules')).error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})

describe('T3.15 — job d’ouverture', () => {
  it('ouvre les scheduled dont startsAt est atteint, pas avant', async () => {
    const early = await createDraft()
    const late = await createDraft()
    await Auction.updateMany(
      { _id: { $in: [early.id, late.id] } },
      { $set: { status: 'scheduled' } },
    )
    const startsAt = new Date(early.startsAt).getTime()
    await Auction.updateOne({ _id: late.id }, { $set: { startsAt: new Date(startsAt + HOUR_MS) } })

    expect(await openDueAuctions(new Date(startsAt - 1))).toBe(0)
    expect(await openDueAuctions(new Date(startsAt))).toBe(1)

    expect((await Auction.findById(early.id).orFail()).status).toBe('live')
    expect((await Auction.findById(late.id).orFail()).status).toBe('scheduled')
  })

  it('deux passages successifs ne produisent qu’un seul effet', async () => {
    const draft = await createDraft()
    await Auction.updateOne({ _id: draft.id }, { $set: { status: 'scheduled' } })
    const when = new Date(Date.now() + 3 * HOUR_MS)

    expect(await openDueAuctions(when)).toBe(1)
    expect(await openDueAuctions(when)).toBe(0)
  })

  it('deux passages simultanés ouvrent l’enchère une seule fois', async () => {
    const draft = await createDraft()
    await Auction.updateOne({ _id: draft.id }, { $set: { status: 'scheduled' } })
    const when = new Date(Date.now() + 3 * HOUR_MS)

    const counts = await Promise.all([openDueAuctions(when), openDueAuctions(when)])

    expect(counts[0] + counts[1]).toBe(1)
  })

  it('rattrape toutes les enchères en retard, et ignore draft, live et cancelled', async () => {
    const statuses = ['scheduled', 'scheduled', 'draft', 'live', 'cancelled'] as const
    for (const status of statuses) {
      const draft = await createDraft()
      await Auction.updateOne({ _id: draft.id }, { $set: { status } })
    }

    expect(await openDueAuctions(new Date(Date.now() + 10 * HOUR_MS))).toBe(2)

    expect(await Auction.countDocuments({ status: 'live' })).toBe(3)
    expect(await Auction.countDocuments({ status: 'draft' })).toBe(1)
    expect(await Auction.countDocuments({ status: 'cancelled' })).toBe(1)
  })
})

describe('paramètres globaux', () => {
  it('sont créés avec leurs valeurs par défaut à la première lecture, une seule fois', async () => {
    await Setting.deleteMany({})

    const [first, second] = await Promise.all([getSettings(), getSettings()])

    expect(first).toEqual({
      defaultMinIncrement: 100,
      antiSnipingMs: 120_000,
      paymentDelayMs: 172_800_000,
      minDurationMs: 3_600_000,
      maxDurationMs: 1_209_600_000,
    })
    expect(second).toEqual(first)
    expect(await Setting.countDocuments()).toBe(1)
  })

  it('une valeur déjà modifiée n’est pas écrasée', async () => {
    await Setting.updateOne(
      { _id: 'global' },
      { $set: { antiSnipingMs: 60_000 } },
      { upsert: true },
    )

    expect((await getSettings()).antiSnipingMs).toBe(60_000)
  })
})
