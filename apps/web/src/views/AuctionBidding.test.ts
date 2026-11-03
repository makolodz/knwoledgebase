import type { CurrentUser } from '@encheres/shared'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA, mountApp } from '../test/app'
import { page, publicAuction } from '../test/auctions'
import { fake } from '../test/fake-socket'
import { resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)
vi.mock('../api/socket', async () => ({ socket: (await import('../test/fake-socket')).fakeSocket }))

const ID = 'a'.repeat(24)
const BUYER: CurrentUser = { ...ANA, id: '1'.repeat(24), role: 'buyer', emailVerified: true }
const BOB = { id: '2'.repeat(24), name: 'Bob' }
const live = (overrides = {}) =>
  publicAuction({
    id: ID,
    status: 'live',
    sellerId: 'b'.repeat(24),
    endsAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  })

beforeEach(() => {
  resetTrpcMock()
  fake.reset()
  trpcMock.auction.get.query.mockResolvedValue(live())
  trpcMock.auction.bids.query.mockResolvedValue(page([]))
})

async function open(user?: CurrentUser) {
  const mounted = await mountApp(`/auctions/${ID}`, user ? { user } : {})
  return mounted
}

describe('qui peut enchérir (docs/technical/screens.md)', () => {
  it('propose « Se connecter pour enchérir » à un visiteur', async () => {
    const { wrapper } = await open()

    expect(wrapper.get('[data-testid="login-to-bid"]').text()).toContain(
      'Se connecter pour enchérir',
    )
    expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(false)
  })

  it('explique au vendeur de l’enchère qu’il ne peut pas enchérir', async () => {
    const { wrapper } = await open({ ...BUYER, role: 'seller' })
    expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(true)

    trpcMock.auction.get.query.mockResolvedValue(live({ sellerId: BUYER.id }))
    const own = await open({ ...BUYER, role: 'seller' })

    expect(own.wrapper.get('[data-testid="seller-note"]').text()).toContain(
      'vendeur de cette enchère',
    )
    expect(own.wrapper.find('[data-testid="bid-form"]').exists()).toBe(false)
  })

  it('explique à un admin qu’il n’enchérit pas', async () => {
    const { wrapper } = await open({ ...BUYER, role: 'admin' })

    expect(wrapper.find('[data-testid="admin-note"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(false)
  })

  it('demande de vérifier l’email avant d’enchérir', async () => {
    const { wrapper } = await open({ ...BUYER, emailVerified: false })

    expect(wrapper.get('[data-testid="unverified-note"]').text()).toContain(
      'Vérifiez votre adresse',
    )
    expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(false)
  })

  it('ne propose aucun formulaire pour une enchère à venir ou terminée', async () => {
    for (const status of ['scheduled', 'ended'] as const) {
      trpcMock.auction.get.query.mockResolvedValue(live({ status }))
      const { wrapper } = await open(BUYER)
      expect(wrapper.find('[data-testid="bid-form"]').exists()).toBe(false)
    }
  })
})

describe('formulaire d’offre (T4.26)', () => {
  it('pré-remplit le minimum et propose +1 pas / +5 pas', async () => {
    trpcMock.auction.get.query.mockResolvedValue(live({ nextMinBid: 4600, minIncrement: 100 }))
    const { wrapper } = await open(BUYER)
    const field = wrapper.get('#bid-amount').element as HTMLInputElement
    expect(field.value).toBe('46,00')

    await wrapper.get('[data-testid="quick-1"]').trigger('click')
    expect(field.value).toBe('47,00')
    await wrapper.get('[data-testid="quick-5"]').trigger('click')
    expect(field.value).toBe('51,00')
  })

  it('refuse un montant sous le minimum, illisible ou décimal à plus de 2 chiffres, sans rien envoyer', async () => {
    trpcMock.auction.get.query.mockResolvedValue(live({ nextMinBid: 4600 }))
    const { wrapper } = await open(BUYER)
    const bidsSent = () => fake.emitted.filter((entry) => entry.event === 'bid:place')

    await wrapper.get('#bid-amount').setValue('45,99')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('#bid-amount-error').text()).toContain('au moins 46,00')

    for (const value of ['abc', '', '46,001', '-5']) {
      await wrapper.get('#bid-amount').setValue(value)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('#bid-amount-error').text()).toContain('montant valide')
    }
    expect(bidsSent()).toEqual([])
  })

  it('envoie l’offre en centimes puis confirme', async () => {
    trpcMock.auction.get.query.mockResolvedValue(live({ nextMinBid: 4600 }))
    const { wrapper } = await open(BUYER)

    await wrapper.get('#bid-amount').setValue('47,5')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fake.emitted.at(-1)).toEqual({
      event: 'bid:place',
      payload: { auctionId: ID, amount: 4750 },
    })
    expect(wrapper.find('[data-testid="bid-accepted"]').exists()).toBe(true)
  })

  it('affiche le refus du serveur en français', async () => {
    const { wrapper } = await open(BUYER)
    fake.answer('bid:place', () => ({ ok: false, code: 'BID_TOO_LOW' }))

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('#bid-amount-error').text()).toContain('trop basse')
    expect(wrapper.find('[data-testid="bid-accepted"]').exists()).toBe(false)
  })

  it('demande confirmation au-delà de 10 fois le prix actuel, et n’envoie rien si on refuse', async () => {
    trpcMock.auction.get.query.mockResolvedValue(live({ currentPrice: 1000, nextMinBid: 1100 }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper } = await open(BUYER)

    await wrapper.get('#bid-amount').setValue('150')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(fake.emitted.some((entry) => entry.event === 'bid:place')).toBe(false)

    confirm.mockReturnValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(fake.emitted.at(-1)).toMatchObject({ event: 'bid:place', payload: { amount: 15000 } })
    confirm.mockRestore()
  })

  it('ne demande pas de confirmation pour un montant raisonnable', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { wrapper } = await open(BUYER)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('suit le minimum quand une autre offre arrive', async () => {
    trpcMock.auction.get.query.mockResolvedValue(live({ nextMinBid: 1000 }))
    const { wrapper } = await open(BUYER)

    fake.serverSends('bid:new', {
      auctionId: ID,
      amount: 1000,
      bidder: BOB,
      at: new Date().toISOString(),
      nextMinBid: 1100,
      bidCount: 1,
    })
    await flushPromises()

    expect((wrapper.get('#bid-amount').element as HTMLInputElement).value).toBe('11,00')
  })

  it('désactive le formulaire quand la connexion temps réel est perdue', async () => {
    const { wrapper } = await open(BUYER)

    fake.serverSends('disconnect')
    await flushPromises()

    expect(wrapper.get('[data-testid="reconnecting"]').text()).toContain('Reconnexion')
    expect(wrapper.get('[data-testid="bid-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#bid-amount').attributes('disabled')).toBeDefined()

    fake.serverSends('connect')
    await flushPromises()
    expect(wrapper.find('[data-testid="reconnecting"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="bid-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('désactive le formulaire quand le compte à rebours est terminé', async () => {
    trpcMock.auction.get.query.mockResolvedValue(
      live({ endsAt: new Date(Date.now() - 1000).toISOString() }),
    )
    const { wrapper } = await open(BUYER)

    expect(wrapper.find('[data-testid="time-up"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="bid-submit"]').attributes('disabled')).toBeDefined()
  })
})

describe('en direct (T4.27 côté écran)', () => {
  const event = (overrides = {}) => ({
    auctionId: ID,
    amount: 1000,
    bidder: BOB,
    at: '2030-01-01T10:00:00.000Z',
    nextMinBid: 1100,
    bidCount: 1,
    ...overrides,
  })

  it('affiche la nouvelle offre, le prix et le compteur sans recharger', async () => {
    const { wrapper } = await open()
    expect(wrapper.find('[data-testid="no-bids"]').exists()).toBe(true)

    fake.serverSends('bid:new', event())
    await flushPromises()

    expect(wrapper.get('[data-testid="price"]').text()).toContain('10,00')
    expect(wrapper.get('[data-testid="next-min-bid"]').text()).toContain('11,00')
    expect(wrapper.get('[data-testid="bid-count"]').text()).toBe('1')
    const rows = wrapper.findAll('[data-testid="bid-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text()).toContain('Bob')
    expect(rows[0]?.text()).toContain('10,00')
  })

  it('signale « meilleur enchérisseur », puis « dépassé »', async () => {
    const { wrapper } = await open(BUYER)

    fake.serverSends('bid:new', event({ bidder: { id: BUYER.id, name: 'Ana' } }))
    await flushPromises()
    expect(wrapper.get('[data-testid="highest-note"]').text()).toContain('meilleur enchérisseur')
    expect(wrapper.get('[data-testid="bid-row"]').text()).toContain('(vous)')
    expect(wrapper.find('[data-testid="outbid-note"]').exists()).toBe(false)

    fake.serverSends(
      'bid:new',
      event({
        amount: 1100,
        bidder: BOB,
        nextMinBid: 1200,
        bidCount: 2,
        at: '2030-01-01T10:01:00.000Z',
      }),
    )
    await flushPromises()
    expect(wrapper.get('[data-testid="outbid-note"]').text()).toContain('dépassé')
    expect(wrapper.find('[data-testid="highest-note"]').exists()).toBe(false)
  })

  it('affiche une prolongation et la nouvelle date de fin', async () => {
    const { wrapper } = await open()

    fake.serverSends('auction:extended', { auctionId: ID, endsAt: '2031-06-01T12:00:00.000Z' })
    await flushPromises()

    expect(wrapper.get('[data-testid="extended-notice"]').text()).toContain('prolongée')
    expect(wrapper.get('[data-testid="ends-at"]').text()).toContain('2031')
  })

  it('le compte à rebours part de la date de fin et suit une prolongation', async () => {
    trpcMock.auction.get.query.mockResolvedValue(
      live({ endsAt: new Date(Date.now() + 30_000).toISOString() }),
    )
    const { wrapper } = await open()
    expect(wrapper.get('[data-testid="countdown"]').text()).toMatch(/^00:00:(29|30)$/)

    fake.serverSends('auction:extended', {
      auctionId: ID,
      endsAt: new Date(Date.now() + 150_000).toISOString(),
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="countdown"]').text()).toMatch(/^00:02:(29|30)$/)
  })

  it('rejoint la room de l’enchère affichée', async () => {
    await open()

    expect(fake.emitted).toContainEqual({ event: 'auction:join', payload: { auctionId: ID } })
  })
})
