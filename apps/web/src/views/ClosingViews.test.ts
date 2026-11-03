import type { CurrentUser } from '@encheres/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA, fill, mountApp, submit } from '../test/app'
import { managedAuction, page, publicAuction } from '../test/auctions'
import { fake } from '../test/fake-socket'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)
vi.mock('../api/socket', async () => ({ socket: (await import('../test/fake-socket')).fakeSocket }))

const ID = 'a'.repeat(24)
const BUYER: CurrentUser = { ...ANA, id: '1'.repeat(24), role: 'buyer', emailVerified: true }
const SELLER: CurrentUser = { ...BUYER, id: 'b'.repeat(24), role: 'seller' }
const BOB = { id: '2'.repeat(24), name: 'Bob' }

beforeEach(() => {
  resetTrpcMock()
  fake.reset()
  trpcMock.auction.get.query.mockResolvedValue(
    publicAuction({ id: ID, status: 'live', endsAt: new Date(Date.now() + 600_000).toISOString() }),
  )
  trpcMock.auction.bids.query.mockResolvedValue(page([]))
})

describe('clôture en direct (T5.9 côté écran)', () => {
  it('auction:ended retire le formulaire et annonce le gagnant et le prix final', async () => {
    const { wrapper } = await mountApp(`/auctions/${ID}`, { user: BUYER })
    expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(true)

    fake.serverSends('auction:ended', { auctionId: ID, winner: BOB, finalPrice: 4200 })
    await flushPromises()

    expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="status-badge"]').text()).toBe('Terminée')
    expect(wrapper.get('[data-testid="winner-note"]').text()).toContain('Remportée par Bob')
    expect(wrapper.get('[data-testid="winner-note"]').text()).toContain('42,00')
    expect(wrapper.find('[data-testid="countdown"]').exists()).toBe(false)
  })

  it('dit au gagnant qu’il a remporté l’enchère, avec un lien vers ses gains', async () => {
    const { wrapper } = await mountApp(`/auctions/${ID}`, { user: BUYER })

    fake.serverSends('auction:ended', {
      auctionId: ID,
      winner: { id: BUYER.id, name: 'Ana' },
      finalPrice: 1500,
    })
    await flushPromises()

    const note = wrapper.get('[data-testid="winner-note"]')
    expect(note.text()).toContain('Vous avez remporté cette enchère pour 15,00')
    expect(note.get('a').attributes('href')).toBe('/account/wins')
  })

  it('annonce « terminée sans offre » quand il n’y a pas de gagnant', async () => {
    const { wrapper } = await mountApp(`/auctions/${ID}`)

    fake.serverSends('auction:ended', { auctionId: ID, winner: null, finalPrice: null })
    await flushPromises()

    expect(wrapper.get('[data-testid="winner-note"]').text()).toBe('Terminée sans offre.')
  })

  it('ignore la clôture d’une autre enchère', async () => {
    const { wrapper } = await mountApp(`/auctions/${ID}`, { user: BUYER })

    fake.serverSends('auction:ended', { auctionId: 'f'.repeat(24), winner: BOB, finalPrice: 100 })
    await flushPromises()

    expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="winner-note"]').exists()).toBe(false)
  })

  it('affiche le gagnant d’une enchère déjà terminée au chargement', async () => {
    trpcMock.auction.get.query.mockResolvedValue(
      publicAuction({ id: ID, status: 'ended', currentPrice: 900, winner: BOB }),
    )

    const { wrapper } = await mountApp(`/auctions/${ID}`)

    expect(wrapper.get('[data-testid="winner-note"]').text()).toContain('Remportée par Bob')
    expect(wrapper.find('[data-testid="ended-note"]').exists()).toBe(true)
  })
})

describe('mes offres (T5.7 côté écran)', () => {
  it('liste mes enchères avec ma meilleure offre, le prix actuel et ma position', async () => {
    trpcMock.profile.myBids.query.mockResolvedValue(
      page([
        {
          auction: publicAuction({ id: '1'.repeat(24), title: 'En tête', currentPrice: 1200 }),
          myBestBid: 1200,
          standing: 'leading',
        },
        {
          auction: publicAuction({ id: '2'.repeat(24), title: 'Dépassée', currentPrice: 1500 }),
          myBestBid: 1000,
          standing: 'outbid',
        },
        {
          auction: publicAuction({ id: '3'.repeat(24), title: 'Gagnée', status: 'ended' }),
          myBestBid: 900,
          standing: 'won',
        },
        {
          auction: publicAuction({ id: '4'.repeat(24), title: 'Perdue', status: 'ended' }),
          myBestBid: 800,
          standing: 'lost',
        },
      ]),
    )

    const { wrapper } = await mountApp('/account/bids', { user: BUYER })

    const rows = wrapper.findAll('[data-testid="my-bid"]')
    expect(rows.map((row) => row.get('[data-testid="standing"]').text())).toEqual([
      'En tête',
      'Dépassé',
      'Gagnée',
      'Perdue',
    ])
    expect(rows[1]?.text()).toContain('10,00')
    expect(rows[1]?.text()).toContain('15,00')
    expect(rows[0]?.get('a').attributes('href')).toBe(`/auctions/${'1'.repeat(24)}`)
    expect(trpcMock.profile.myBids.query).toHaveBeenCalledWith({ page: 1, limit: 20 })
  })

  it('affiche un état vide, et une erreur avec « Réessayer »', async () => {
    trpcMock.profile.myBids.query.mockResolvedValueOnce(page([]))
    const empty = await mountApp('/account/bids', { user: BUYER })
    expect(empty.wrapper.get('[data-testid="list-empty"]').text()).toContain('pas encore enchéri')

    trpcMock.profile.myBids.query.mockRejectedValueOnce(apiError('INTERNAL_SERVER_ERROR', 500))
    const broken = await mountApp('/account/bids', { user: BUYER })
    expect(broken.wrapper.find('[data-testid="list-error"]').exists()).toBe(true)
    trpcMock.profile.myBids.query.mockResolvedValue(page([]))
    await broken.wrapper
      .findAll('button')
      .find((button) => button.text() === 'Réessayer')
      ?.trigger('click')
    await flushPromises()
    expect(broken.wrapper.find('[data-testid="list-empty"]').exists()).toBe(true)
  })

  it('demande de se connecter à un visiteur', async () => {
    const { router } = await mountApp('/account/bids')

    expect(router.currentRoute.value.name).toBe('login')
  })
})

describe('mes gains (T5.7 côté écran)', () => {
  it('affiche le prix final et l’échéance, ou le statut de paiement', async () => {
    trpcMock.profile.myWins.query.mockResolvedValue(
      page([
        {
          auction: publicAuction({ id: '1'.repeat(24), title: 'À payer', status: 'ended' }),
          finalPrice: 2500,
          paymentDeadline: '2030-01-03T10:00:00.000Z',
        },
        {
          auction: publicAuction({ id: '2'.repeat(24), title: 'Payée', status: 'paid' }),
          finalPrice: 900,
          paymentDeadline: '2030-01-03T10:00:00.000Z',
        },
        {
          auction: publicAuction({ id: '3'.repeat(24), title: 'En retard', status: 'unpaid' }),
          finalPrice: 700,
          paymentDeadline: '2030-01-03T10:00:00.000Z',
        },
      ]),
    )

    const { wrapper } = await mountApp('/account/wins', { user: BUYER })

    const wins = wrapper.findAll('[data-testid="my-win"]')
    expect(wins[0]?.get('[data-testid="final-price"]').text()).toContain('25,00')
    expect(wins[0]?.get('[data-testid="payment-status"]').text()).toContain('À payer avant le')
    expect(wins[1]?.get('[data-testid="payment-status"]').text()).toBe('Payée')
    expect(wins[2]?.get('[data-testid="payment-status"]').text()).toBe('Délai de paiement dépassé')
  })

  it('affiche un état vide', async () => {
    trpcMock.profile.myWins.query.mockResolvedValue(page([]))

    const { wrapper } = await mountApp('/account/wins', { user: BUYER })

    expect(wrapper.get('[data-testid="list-empty"]').text()).toContain('aucune enchère')
  })
})

describe('remise en vente (T5.6 côté écran)', () => {
  const RID = '9'.repeat(24)
  const original = managedAuction({
    id: RID,
    status: 'unpaid',
    title: 'À remettre',
    startsAt: '2030-01-01T10:00:00.000Z',
    endsAt: '2030-01-01T14:00:00.000Z',
  })
  const rules = { defaultMinIncrement: 100, minDurationMs: 3_600_000, maxDurationMs: 1_209_600_000 }

  beforeEach(() => {
    trpcMock.auction.getMine.query.mockResolvedValue(original)
    trpcMock.auction.rules.query.mockResolvedValue(rules)
    trpcMock.auction.mine.query.mockResolvedValue(page([]))
  })

  it('propose « Remettre en vente » seulement quand c’est permis', async () => {
    trpcMock.auction.mine.query.mockResolvedValue(
      page([
        managedAuction({ id: '1'.repeat(24), status: 'unpaid', title: 'Impayée' }),
        managedAuction({ id: '2'.repeat(24), status: 'cancelled', title: 'Annulée' }),
        managedAuction({ id: '3'.repeat(24), status: 'ended', title: 'Sans offre', winner: null }),
        managedAuction({ id: '4'.repeat(24), status: 'ended', title: 'En attente', winner: BOB }),
        managedAuction({ id: '5'.repeat(24), status: 'live', title: 'En direct' }),
        managedAuction({ id: '6'.repeat(24), status: 'paid', title: 'Payée', winner: BOB }),
        managedAuction({ id: '7'.repeat(24), status: 'draft', title: 'Brouillon' }),
      ]),
    )

    const { wrapper } = await mountApp('/seller/auctions', { user: SELLER })

    const relistable = wrapper
      .findAll('[data-testid="auction-row"]')
      .filter((row) => row.find('[data-testid="relist"]').exists())
      .map((row) => row.find('td').text())
    expect(relistable).toEqual(['Impayée', 'Annulée', 'Sans offre'])
  })

  it('pré-remplit des dates futures avec la même durée, puis envoie la remise en vente', async () => {
    trpcMock.auction.relist.mutate.mockResolvedValue(managedAuction({ status: 'draft' }))
    const { wrapper, router } = await mountApp(`/seller/auctions/${RID}/relist`, { user: SELLER })
    expect(wrapper.text()).toContain('À remettre')
    const start = (wrapper.get('#relist-starts-at').element as HTMLInputElement).value
    const end = (wrapper.get('#relist-ends-at').element as HTMLInputElement).value
    expect(new Date(start).getTime()).toBeGreaterThan(Date.now())
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(4 * 3_600_000)

    await submit(wrapper)

    const sent = trpcMock.auction.relist.mutate.mock.calls[0]?.[0] as {
      id: string
      startsAt: string
      endsAt: string
    }
    expect(sent.id).toBe(RID)
    expect(sent.startsAt).toMatch(/Z$/)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/seller/auctions'))
  })

  it('refuse un début passé ou une durée hors limites, sans appeler l’API', async () => {
    const { wrapper } = await mountApp(`/seller/auctions/${RID}/relist`, { user: SELLER })

    await fill(wrapper, '#relist-starts-at', '2020-01-01T10:00')
    await fill(wrapper, '#relist-ends-at', '2020-01-01T10:30')
    await submit(wrapper)

    expect(wrapper.text()).toContain('Le début doit être dans le futur.')
    expect(wrapper.text()).toContain('La durée doit être comprise entre')
    expect(trpcMock.auction.relist.mutate).not.toHaveBeenCalled()
  })

  it('affiche l’erreur du serveur', async () => {
    trpcMock.auction.relist.mutate.mockRejectedValue(apiError('AUCTION_STATE_INVALID', 409))
    const { wrapper } = await mountApp(`/seller/auctions/${RID}/relist`, { user: SELLER })

    await submit(wrapper)

    expect(wrapper.get('[data-testid="form-error"]').text()).toContain('état actuel')
  })

  it('affiche « introuvable » pour une enchère qui n’est pas à moi', async () => {
    trpcMock.auction.getMine.query.mockRejectedValue(apiError('AUCTION_NOT_FOUND', 404))

    const { wrapper } = await mountApp(`/seller/auctions/${RID}/relist`, { user: SELLER })

    expect(wrapper.find('[data-testid="not-found"]').exists()).toBe(true)
  })
})

describe('navigation', () => {
  it('propose « Mes offres » et « Mes gains » aux acheteurs et vendeurs, pas aux admins ni aux visiteurs', async () => {
    const buyer = await mountApp('/', { user: BUYER })
    expect(buyer.wrapper.get('header').text()).toContain('Mes offres')
    expect(buyer.wrapper.get('header').text()).toContain('Mes gains')

    const admin = await mountApp('/', { user: { ...BUYER, role: 'admin' } })
    expect(admin.wrapper.get('header').text()).not.toContain('Mes offres')

    const visitor = await mountApp('/')
    expect(visitor.wrapper.get('header').text()).not.toContain('Mes gains')
  })
})
