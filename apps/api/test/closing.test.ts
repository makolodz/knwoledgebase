import type {
  AuctionEndedEvent,
  ManagedAuction,
  MyBid,
  MyWin,
  Page,
  PublicAuction,
} from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Auction, Bid, Email, Setting } from '../src/models'
import { placeBid } from '../src/services/bids'
import { closeDueAuctions } from '../src/services/closing'
import { useTestDb } from './db'
import { createTestApp, listen, testConfig } from './helpers'
import { createSeller, uploadKey } from './images'
import {
  collect,
  createLiveAuction,
  createLoggedInUser,
  emitWithAck,
  openSocket,
  settle,
  whenConnected,
  type ClientSocket,
} from './sockets'
import { TestClient } from './trpc'
import { createUser, logIn } from './users'

useTestDb()

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

let app: FastifyInstance
let url: string
let seller: Awaited<ReturnType<typeof createSeller>>
const sockets: ClientSocket[] = []

beforeAll(async () => {
  app = await createTestApp()
  url = await listen(app)
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  seller = await createSeller()
})
afterEach(() => {
  sockets.splice(0).forEach((socket) => socket.disconnect())
})

const deps = () => ({ io: app.io, config: testConfig() })

const buyer = (email: string, name = email.split('@')[0] ?? 'x') =>
  createUser({ email, name, emailVerifiedAt: new Date() })

/** Une enchère `live` déjà arrivée à sa fin, avec les offres demandées. */
async function endedLive(bids: { user: Awaited<ReturnType<typeof buyer>>; amount: number }[] = []) {
  const endsAt = new Date(Date.now() + 10 * MINUTE_MS)
  const auction = await createLiveAuction(seller._id, { endsAt })
  for (const { user, amount } of bids) {
    const result = await placeBid({
      userId: user._id.toString(),
      auctionId: auction._id.toString(),
      amount,
    })
    expect(result.ok).toBe(true)
  }
  // Le job doit se baser sur `endsAt` en base : on l'avance au passé sans toucher au reste.
  const finished = new Date(Date.now() - 1000)
  await Auction.updateOne({ _id: auction._id }, { $set: { endsAt: finished } })
  return { auction, finished }
}

describe('T5.1 — la clôture se fait à endsAt, pas avant', () => {
  it('ne ferme pas une enchère avant sa fin, et la ferme exactement à endsAt', async () => {
    const endsAt = new Date(Date.now() + 10 * MINUTE_MS)
    const auction = await createLiveAuction(seller._id, { endsAt })

    expect(await closeDueAuctions(deps(), new Date(endsAt.getTime() - 1))).toBe(0)
    expect((await Auction.findById(auction._id).orFail()).status).toBe('live')

    expect(await closeDueAuctions(deps(), endsAt)).toBe(1)
    expect((await Auction.findById(auction._id).orFail()).status).toBe('ended')
  })

  it('ne touche ni aux enchères scheduled, draft, cancelled, ni à celles déjà closes', async () => {
    for (const status of ['draft', 'scheduled', 'cancelled', 'ended', 'paid', 'unpaid'] as const) {
      await createLiveAuction(seller._id, { status, endsAt: new Date(Date.now() - HOUR_MS) })
    }

    expect(await closeDueAuctions(deps())).toBe(0)
    expect(await Auction.countDocuments({ status: 'ended' })).toBe(1)
  })

  it('rattrape toutes les enchères en retard après un arrêt du serveur', async () => {
    for (let index = 0; index < 4; index += 1) {
      await createLiveAuction(seller._id, { endsAt: new Date(Date.now() - (index + 1) * HOUR_MS) })
    }

    expect(await closeDueAuctions(deps())).toBe(4)
    expect(await Auction.countDocuments({ status: 'live' })).toBe(0)
  })
})

describe('T5.2 — avec au moins une offre', () => {
  it('fixe winnerId, le prix final et paymentDeadline = maintenant + paymentDelayMs', async () => {
    const [ana, bob] = await Promise.all([buyer('ana@x.fr'), buyer('bob@x.fr')])
    const { auction } = await endedLive([
      { user: ana, amount: 1000 },
      { user: bob, amount: 1500 },
    ])
    const now = new Date()

    await closeDueAuctions(deps(), now)

    const stored = await Auction.findById(auction._id).orFail()
    expect(stored.status).toBe('ended')
    expect(stored.winnerId?.toString()).toBe(bob._id.toString())
    expect(stored.currentPrice).toBe(1500)
    // 48 h par défaut ; la valeur vient des paramètres lus au moment de la clôture.
    expect(stored.paymentDeadline?.getTime()).toBe(now.getTime() + 172_800_000)
  })

  it('utilise le délai des paramètres du moment', async () => {
    await Setting.updateOne(
      { _id: 'global' },
      { $set: { paymentDelayMs: 3_600_000 } },
      { upsert: true },
    )
    const ana = await buyer('ana@x.fr')
    const { auction } = await endedLive([{ user: ana, amount: 1000 }])
    const now = new Date()

    await closeDueAuctions(deps(), now)

    expect((await Auction.findById(auction._id).orFail()).paymentDeadline?.getTime()).toBe(
      now.getTime() + 3_600_000,
    )
  })
})

describe('T5.3 — sans offre', () => {
  it('reste ended, sans gagnant ni échéance de paiement', async () => {
    const { auction } = await endedLive()

    await closeDueAuctions(deps())

    const stored = await Auction.findById(auction._id).orFail()
    expect(stored).toMatchObject({ status: 'ended', winnerId: null, paymentDeadline: null })
    expect(stored.currentPrice).toBeNull()
  })
})

describe('T5.4 — auction:ended', () => {
  async function watcher(auctionId: string) {
    const socket = openSocket(url)
    sockets.push(socket)
    await whenConnected(socket)
    await emitWithAck(socket, 'auction:join', { auctionId })
    return { socket, events: collect(socket, 'auction:ended') }
  }

  it('est émis à la room avec le nom du gagnant et le prix final, sans email', async () => {
    const ana = await buyer('ana@x.fr', 'Ana')
    const { auction } = await endedLive([{ user: ana, amount: 1200 }])
    const { events } = await watcher(auction._id.toString())

    await closeDueAuctions(deps())
    await settle()

    expect(events).toEqual<AuctionEndedEvent[]>([
      {
        auctionId: auction._id.toString(),
        winner: { id: ana._id.toString(), name: 'Ana' },
        finalPrice: 1200,
      },
    ])
    expect(JSON.stringify(events)).not.toContain('@')
  })

  it('annonce « pas de gagnant » quand il n’y a eu aucune offre', async () => {
    const { auction } = await endedLive()
    const { events } = await watcher(auction._id.toString())

    await closeDueAuctions(deps())
    await settle()

    expect(events).toEqual([{ auctionId: auction._id.toString(), winner: null, finalPrice: null }])
  })

  it('n’est émis qu’une fois, même si le job tourne deux fois ou en parallèle', async () => {
    const ana = await buyer('ana@x.fr')
    const { auction } = await endedLive([{ user: ana, amount: 1000 }])
    const { events } = await watcher(auction._id.toString())

    const counts = await Promise.all([
      closeDueAuctions(deps()),
      closeDueAuctions(deps()),
      closeDueAuctions(deps()),
    ])
    expect(await closeDueAuctions(deps())).toBe(0)
    await settle()

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
    expect(events).toHaveLength(1)
    expect(await Email.countDocuments({ template: 'auction-won' })).toBe(1)
  })

  it('n’est diffusé qu’à la room de l’enchère close', async () => {
    const ana = await buyer('ana@x.fr')
    const { auction } = await endedLive([{ user: ana, amount: 1000 }])
    const other = await createLiveAuction(seller._id)
    const elsewhere = await watcher(other._id.toString())
    const here = await watcher(auction._id.toString())

    await closeDueAuctions(deps())
    await settle()

    expect(here.events).toHaveLength(1)
    expect(elsewhere.events).toEqual([])
  })
})

describe('T5.5 — emails', () => {
  it('prévient le gagnant (lien vers ses gains, échéance) et le vendeur', async () => {
    const ana = await buyer('ana@x.fr', 'Ana')
    const { auction } = await endedLive([{ user: ana, amount: 1250 }])
    const now = new Date()

    await closeDueAuctions(deps(), now)

    const won = await Email.findOne({ template: 'auction-won' }).orFail()
    expect(won.to).toBe('ana@x.fr')
    expect(won.data).toMatchObject({
      title: 'Vase ancien',
      amount: 1250,
      deadline: new Date(now.getTime() + 172_800_000).toISOString(),
    })
    expect(String((won.data as { link: string }).link)).toMatch(/\/account\/wins$/)

    const sold = await Email.findOne({ template: 'auction-sold' }).orFail()
    expect(sold.to).toBe('vendeur@x.fr')
    expect(sold.data).toMatchObject({ amount: 1250, winnerName: 'Ana', name: 'Vera' })
    expect(await Email.countDocuments()).toBe(2)
    expect(auction._id).toBeDefined()
  })

  it('sans offre : seulement le vendeur, avec l’invitation à remettre en vente', async () => {
    await endedLive()

    await closeDueAuctions(deps())

    expect(await Email.countDocuments({ template: 'auction-won' })).toBe(0)
    const unsold = await Email.findOne({ template: 'auction-unsold' }).orFail()
    expect(unsold.to).toBe('vendeur@x.fr')
    expect(await Email.countDocuments()).toBe(1)
  })

  it('un compte anonymisé (sans email) ne fait pas échouer la clôture', async () => {
    const ana = await buyer('ana@x.fr')
    const { auction } = await endedLive([{ user: ana, amount: 1000 }])
    const { User } = await import('../src/models')
    await User.updateOne({ _id: ana._id }, { $set: { email: null } })

    expect(await closeDueAuctions(deps())).toBe(1)

    expect((await Auction.findById(auction._id).orFail()).status).toBe('ended')
    expect(await Email.countDocuments({ template: 'auction-won' })).toBe(0)
    expect(await Email.countDocuments({ template: 'auction-sold' })).toBe(1)
  })

  it('une panne de la file ne défait pas la clôture et est signalée', async () => {
    const ana = await buyer('ana@x.fr')
    const { auction } = await endedLive([{ user: ana, amount: 1000 }])
    const errors: unknown[] = []
    // Un titre vide fait échouer la validation de l'email, comme le ferait une panne de la file.
    await Auction.updateOne({ _id: auction._id }, { $set: { title: '' } })

    expect(await closeDueAuctions({ ...deps(), onNotifyError: (e) => errors.push(e) })).toBe(1)

    expect((await Auction.findById(auction._id).orFail()).status).toBe('ended')
    expect(errors).toHaveLength(1)
  })
})

describe('clôture et offre : jamais les deux (ADR-005)', () => {
  it('une offre et la clôture simultanées donnent un résultat cohérent', async () => {
    const ana = await buyer('ana@x.fr')
    const bob = await buyer('bob@x.fr')

    for (let round = 0; round < 15; round += 1) {
      const endsAt = new Date(Date.now() + 10 * MINUTE_MS)
      const auction = await createLiveAuction(seller._id, { endsAt })
      const first = await placeBid({
        userId: ana._id.toString(),
        auctionId: auction._id.toString(),
        amount: 1000,
      })
      expect(first.ok).toBe(true)

      const [late] = await Promise.all([
        placeBid({
          userId: bob._id.toString(),
          auctionId: auction._id.toString(),
          amount: 1100,
          now: new Date(endsAt.getTime() - 1),
        }),
        closeDueAuctions(deps(), endsAt),
      ])

      const stored = await Auction.findById(auction._id).orFail()
      const history = await Bid.countDocuments({ auctionId: auction._id })
      if (late.ok) {
        // L'offre est passée avant la clôture : l'enchère est prolongée et reste ouverte.
        expect(stored.status).toBe('live')
        expect(stored.currentBidderId?.toString()).toBe(bob._id.toString())
        expect(history).toBe(2)
      } else {
        // La clôture est passée avant : l'offre est refusée et Ana gagne.
        expect(late.code).toBe('AUCTION_NOT_LIVE')
        expect(stored.status).toBe('ended')
        expect(stored.winnerId?.toString()).toBe(ana._id.toString())
        expect(history).toBe(1)
      }
      // Dans tous les cas, le gagnant d'une enchère close est son meilleur enchérisseur.
      if (stored.status === 'ended') {
        expect(stored.winnerId?.toString()).toBe(stored.currentBidderId?.toString())
      }
    }
  })

  it('une offre arrivée après la clôture est refusée', async () => {
    const ana = await buyer('ana@x.fr')
    const bob = await buyer('bob@x.fr')
    const { auction } = await endedLive([{ user: ana, amount: 1000 }])
    await closeDueAuctions(deps())

    const result = await placeBid({
      userId: bob._id.toString(),
      auctionId: auction._id.toString(),
      amount: 5000,
    })

    expect(result).toEqual({ ok: false, code: 'AUCTION_NOT_LIVE' })
  })
})

describe('T5.6 — remise en vente', () => {
  let client: TestClient

  beforeEach(async () => {
    client = new TestClient(app)
    await logIn(client, 'vendeur@x.fr')
  })

  const dates = () => {
    const start = Date.now() + 2 * HOUR_MS
    return {
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + 2 * HOUR_MS).toISOString(),
    }
  }

  async function relistable(status: 'ended' | 'unpaid' | 'cancelled') {
    const key = await uploadKey(client)
    return createLiveAuction(seller._id, {
      status,
      images: [key],
      title: 'À remettre',
      startingPrice: 2000,
      minIncrement: 250,
      nextMinBid: 2300,
      currentPrice: status === 'ended' ? null : 2050,
      bidCount: status === 'ended' ? 0 : 3,
      endsAt: new Date(Date.now() - HOUR_MS),
    })
  }

  it.each(['ended', 'unpaid', 'cancelled'] as const)(
    'crée un nouveau draft sans offres depuis une enchère %s, et laisse l’originale intacte',
    async (status) => {
      const original = await relistable(status)
      const before = (await Auction.findById(original._id).orFail()).toObject()

      const result = await client.mutate<ManagedAuction>('auction.relist', {
        id: original._id.toString(),
        ...dates(),
      })

      expect(result.error).toBeUndefined()
      const copy = await Auction.findById(result.data.id).orFail()
      expect(copy._id.toString()).not.toBe(original._id.toString())
      expect(copy).toMatchObject({
        status: 'draft',
        title: 'À remettre',
        startingPrice: 2000,
        minIncrement: 250,
        nextMinBid: 2000,
        bidCount: 0,
        currentPrice: null,
        currentBidderId: null,
        winnerId: null,
        paymentDeadline: null,
        cancelReason: null,
      })
      expect(copy.sellerId.toString()).toBe(seller._id.toString())
      expect(await Bid.countDocuments({ auctionId: copy._id })).toBe(0)
      // Le document d'origine n'a pas bougé.
      expect((await Auction.findById(original._id).orFail()).toObject()).toEqual(before)
    },
  )

  it('copie les photos sous de nouvelles clés : retirer une photo de la copie épargne l’originale', async () => {
    const original = await relistable('unpaid')
    const copy = (
      await client.mutate<ManagedAuction>('auction.relist', {
        id: original._id.toString(),
        ...dates(),
      })
    ).data
    const [copiedKey] = (await Auction.findById(copy.id).orFail()).images
    const [originalKey] = original.images
    expect(copiedKey).toBeDefined()
    expect(copiedKey).not.toBe(originalKey)
    const files = (key: string) => app.inject({ method: 'GET', url: `/uploads/${key}.webp` })
    expect((await files(copiedKey ?? '')).statusCode).toBe(200)

    // On remplace la photo de la copie par une autre : l'ancienne copie est supprimée du disque.
    const replacement = await uploadKey(client)
    await client.mutate('auction.update', {
      id: copy.id,
      title: 'À remettre',
      description: 'Un beau vase.',
      images: [replacement],
      startingPrice: 2000,
      startsAt: dates().startsAt,
      endsAt: dates().endsAt,
    })

    expect((await files(copiedKey ?? '')).statusCode).toBe(404)
    expect((await files(originalKey ?? '')).statusCode).toBe(200)
  })

  it.each(['live', 'scheduled', 'draft', 'paid'] as const)(
    'refuse de remettre en vente une enchère %s',
    async (status) => {
      const original = await relistable('ended')
      await Auction.updateOne({ _id: original._id }, { $set: { status } })

      const result = await client.mutate('auction.relist', {
        id: original._id.toString(),
        ...dates(),
      })

      expect(result.error?.data.code).toBe('AUCTION_STATE_INVALID')
      expect(await Auction.countDocuments()).toBe(1)
    },
  )

  it('refuse une enchère terminée avec un gagnant (elle attend son paiement)', async () => {
    const ana = await buyer('ana@x.fr')
    const original = await relistable('ended')
    await Auction.updateOne({ _id: original._id }, { $set: { winnerId: ana._id } })

    const result = await client.mutate('auction.relist', {
      id: original._id.toString(),
      ...dates(),
    })

    expect(result.error?.data.code).toBe('AUCTION_STATE_INVALID')
  })

  it('applique les règles de dates : début dans le futur, durée dans les bornes', async () => {
    const original = await relistable('ended')
    const id = original._id.toString()
    const start = Date.now() + HOUR_MS

    const past = await client.mutate('auction.relist', {
      id,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(start + 2 * HOUR_MS).toISOString(),
    })
    const short = await client.mutate('auction.relist', {
      id,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + 60_000).toISOString(),
    })

    expect(past.error?.data.code).toBe('INVALID_DATES')
    expect(short.error?.data.code).toBe('INVALID_DATES')
    expect(await Auction.countDocuments()).toBe(1)
  })

  it('un autre vendeur ne peut pas remettre en vente, ni un acheteur ou un visiteur', async () => {
    const original = await relistable('ended')
    const other = await createLoggedInUser(() => new TestClient(app), 'autre@x.fr', {
      role: 'seller',
    })
    const buyerClient = (await createLoggedInUser(() => new TestClient(app), 'acheteur@x.fr'))
      .client
    const input = { id: original._id.toString(), ...dates() }

    expect((await other.client.mutate('auction.relist', input)).error?.data.code).toBe(
      'AUCTION_NOT_FOUND',
    )
    expect((await buyerClient.mutate('auction.relist', input)).error?.data.code).toBe('FORBIDDEN')
    expect((await new TestClient(app).mutate('auction.relist', input)).error?.data.code).toBe(
      'NOT_AUTHENTICATED',
    )
    expect(await Auction.countDocuments()).toBe(1)
  })
})

describe('auction.get après la clôture', () => {
  it('expose le gagnant (nom seul) et le prix final', async () => {
    const ana = await buyer('ana@x.fr', 'Ana')
    const { auction } = await endedLive([{ user: ana, amount: 1700 }])
    await closeDueAuctions(deps())

    const result = await new TestClient(app).query<PublicAuction>('auction.get', {
      id: auction._id.toString(),
    })

    expect(result.data).toMatchObject({
      status: 'ended',
      currentPrice: 1700,
      winner: { id: ana._id.toString(), name: 'Ana' },
    })
    expect(result.raw).not.toContain('@')
    expect(result.raw).not.toContain('paymentDeadline')
  })

  it('un enchère sans gagnant n’en affiche pas', async () => {
    const { auction } = await endedLive()
    await closeDueAuctions(deps())

    const result = await new TestClient(app).query<PublicAuction>('auction.get', {
      id: auction._id.toString(),
    })

    expect(result.data.winner).toBeNull()
  })
})

describe('T5.7 et T5.8 — espace utilisateur', () => {
  async function scenario() {
    const ana = await createLoggedInUser(() => new TestClient(app), 'ana@x.fr', { name: 'Ana' })
    const bob = await createLoggedInUser(() => new TestClient(app), 'bob@x.fr', { name: 'Bob' })
    const bid = (user: typeof ana, auctionId: string, amount: number) =>
      placeBid({ userId: user.user._id.toString(), auctionId, amount })
    const id = (auction: { _id: { toString(): string } }) => auction._id.toString()

    // 1. En cours : Ana en tête. 2. En cours : Bob dépasse Ana. 3. Terminée : Ana gagne.
    // 4. Terminée : Bob gagne, Ana perd. 5. Annulée après une offre d'Ana.
    const leading = await createLiveAuction(seller._id, { title: 'En tête' })
    await bid(ana, id(leading), 1000)
    const outbid = await createLiveAuction(seller._id, { title: 'Dépassée' })
    await bid(ana, id(outbid), 1000)
    await bid(bob, id(outbid), 1100)
    const won = await createLiveAuction(seller._id, { title: 'Gagnée' })
    await bid(ana, id(won), 1000)
    await bid(bob, id(won), 1100)
    await bid(ana, id(won), 1200)
    const lost = await createLiveAuction(seller._id, { title: 'Perdue' })
    await bid(ana, id(lost), 1000)
    await bid(bob, id(lost), 1100)
    const cancelled = await createLiveAuction(seller._id, { title: 'Annulée' })
    await bid(ana, id(cancelled), 1000)
    const bobOnly = await createLiveAuction(seller._id, { title: 'Que Bob' })
    await bid(bob, id(bobOnly), 1000)

    const past = new Date(Date.now() - 1000)
    await Auction.updateMany({ _id: { $in: [won._id, lost._id] } }, { $set: { endsAt: past } })
    await closeDueAuctions(deps())
    await Auction.updateOne({ _id: cancelled._id }, { $set: { status: 'cancelled' } })
    return { ana, bob, won, lost }
  }

  it('T5.7 — « mes offres » liste mes enchères avec ma meilleure offre et ma position', async () => {
    const { ana } = await scenario()

    const result = await ana.client.query<Page<MyBid>>('profile.myBids', {})

    const byTitle = Object.fromEntries(
      result.data.items.map((item) => [item.auction.title, [item.myBestBid, item.standing]]),
    )
    expect(byTitle).toEqual({
      'En tête': [1000, 'leading'],
      Dépassée: [1000, 'outbid'],
      Gagnée: [1200, 'won'],
      Perdue: [1000, 'lost'],
      Annulée: [1000, 'cancelled'],
    })
    expect(result.data.total).toBe(5)
    expect(result.raw).not.toContain('@')
  })

  it('T5.7 — « mes gains » ne liste que mes enchères gagnées, avec prix final et échéance', async () => {
    const { ana, bob, won, lost } = await scenario()

    const mine = await ana.client.query<Page<MyWin>>('profile.myWins', {})
    const his = await bob.client.query<Page<MyWin>>('profile.myWins', {})

    expect(mine.data.items.map((item) => item.auction.id)).toEqual([won._id.toString()])
    expect(mine.data.items[0]).toMatchObject({ finalPrice: 1200 })
    expect(mine.data.items[0]?.paymentDeadline).toEqual(expect.any(String))
    expect(his.data.items.map((item) => item.auction.id)).toEqual([lost._id.toString()])
    expect(his.data.items[0]?.finalPrice).toBe(1100)
  })

  it('T5.7 — les listes sont paginées et triées de la plus récente activité', async () => {
    const { ana } = await scenario()

    const first = await ana.client.query<Page<MyBid>>('profile.myBids', { limit: 2 })
    const second = await ana.client.query<Page<MyBid>>('profile.myBids', { limit: 2, page: 2 })

    expect(first.data.items).toHaveLength(2)
    expect(second.data.items).toHaveLength(2)
    expect(first.data.total).toBe(5)
    const ids = [...first.data.items, ...second.data.items].map((item) => item.auction.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('T5.8 — les données d’un autre utilisateur sont inaccessibles', async () => {
    const { ana } = await scenario()
    const carol = await createLoggedInUser(() => new TestClient(app), 'carol@x.fr')

    expect((await carol.client.query<Page<MyBid>>('profile.myBids', {})).data.items).toEqual([])
    expect((await carol.client.query<Page<MyWin>>('profile.myWins', {})).data.items).toEqual([])
    // Aucune entrée ne permet de désigner un autre utilisateur.
    const forged = await ana.client.query('profile.myBids', { userId: 'x' })
    expect(forged.status).toBeLessThan(500)
  })

  it('T5.8 — il faut être connecté', async () => {
    const visitor = new TestClient(app)

    expect((await visitor.query('profile.myBids', {})).error?.data.code).toBe('NOT_AUTHENTICATED')
    expect((await visitor.query('profile.myWins', {})).error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})
