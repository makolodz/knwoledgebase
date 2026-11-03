import type { BidNewEvent } from '@encheres/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { page, publicAuction } from '../test/auctions'
import { createFakeSocket } from '../test/fake-socket'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'
import { useAuctionSocket } from './useAuctionSocket'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)
vi.mock('../api/socket', async () => ({ socket: (await import('../test/fake-socket')).fakeSocket }))

const ID = 'a'.repeat(24)
const ANA = { id: '1'.repeat(24), name: 'Ana' }
const BOB = { id: '2'.repeat(24), name: 'Bob' }

function bidEvent(overrides: Partial<BidNewEvent> = {}): BidNewEvent {
  return {
    auctionId: ID,
    amount: 1000,
    bidder: ANA,
    at: '2030-01-01T10:00:00.000Z',
    nextMinBid: 1100,
    bidCount: 1,
    ...overrides,
  }
}

function setup(options: { connected?: boolean; renewSession?: () => Promise<void> } = {}) {
  const fake = createFakeSocket(options.connected ?? true)
  const auctionId = ref(ID)
  let api!: ReturnType<typeof useAuctionSocket>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useAuctionSocket(auctionId, {
          socket: fake.socket,
          ackTimeoutMs: 200,
          ...(options.renewSession ? { renewSession: options.renewSession } : {}),
        })
        return () => h('div')
      },
    }),
  )
  return { fake, api, wrapper, auctionId }
}

beforeEach(() => {
  resetTrpcMock()
  trpcMock.auction.get.query.mockResolvedValue(publicAuction({ id: ID, status: 'live' }))
  trpcMock.auction.bids.query.mockResolvedValue(page([]))
})
afterEach(() => vi.useRealTimers())

describe('chargement et connexion', () => {
  it('rejoint la room puis charge l’enchère et son historique', async () => {
    trpcMock.auction.bids.query.mockResolvedValue(
      page([{ id: 'b1', amount: 1000, bidder: ANA, at: '2030-01-01T10:00:00.000Z' }]),
    )

    const { api, fake } = setup()
    await flushPromises()

    expect(fake.emitted[0]).toEqual({ event: 'auction:join', payload: { auctionId: ID } })
    expect(trpcMock.auction.get.query).toHaveBeenCalledWith({ id: ID })
    expect(trpcMock.auction.bids.query).toHaveBeenCalledWith({ id: ID, page: 1, limit: 20 })
    expect(api.state.value).toEqual({ kind: 'ready' })
    expect(api.auction.value?.status).toBe('live')
    expect(api.bids.value).toHaveLength(1)
    expect(api.connected.value).toBe(true)
  })

  it('charge quand même l’enchère si le socket n’est pas connecté', async () => {
    const { api, fake } = setup({ connected: false })
    await flushPromises()

    expect(fake.emitted).toEqual([])
    expect(api.state.value).toEqual({ kind: 'ready' })
    expect(api.connected.value).toBe(false)
  })

  it('rejoint la room et recharge à chaque (re)connexion : aucune offre perdue entre deux connexions', async () => {
    const { api, fake } = setup()
    await flushPromises()
    fake.serverSends('disconnect')
    expect(api.connected.value).toBe(false)
    trpcMock.auction.get.query.mockClear()

    fake.serverSends('connect')
    await flushPromises()

    expect(api.connected.value).toBe(true)
    expect(fake.emitted.filter((entry) => entry.event === 'auction:join')).toHaveLength(2)
    expect(trpcMock.auction.get.query).toHaveBeenCalledTimes(1)
  })

  it('distingue « introuvable » d’une erreur à réessayer', async () => {
    trpcMock.auction.get.query.mockRejectedValue(apiError('AUCTION_NOT_FOUND', 404))
    const missing = setup()
    await flushPromises()
    expect(missing.api.state.value).toEqual({ kind: 'notFound' })

    trpcMock.auction.get.query.mockRejectedValue(apiError('INTERNAL_SERVER_ERROR', 500))
    const broken = setup()
    await flushPromises()
    expect(broken.api.state.value.kind).toBe('error')
  })

  it('retire ses écouteurs et quitte la room quand la page est quittée', async () => {
    const { fake, wrapper } = setup()
    await flushPromises()
    expect(fake.listenerCount('bid:new')).toBe(1)

    wrapper.unmount()

    expect(fake.listenerCount('bid:new')).toBe(0)
    expect(fake.listenerCount('auction:extended')).toBe(0)
    expect(fake.listenerCount('connect')).toBe(0)
    expect(fake.emitted.at(-1)).toEqual({ event: 'auction:leave', payload: { auctionId: ID } })
  })
})

describe('événements reçus', () => {
  it('bid:new met à jour prix, offre minimale, compteur et historique', async () => {
    const { api, fake } = setup()
    await flushPromises()

    fake.serverSends('bid:new', bidEvent())
    fake.serverSends(
      'bid:new',
      bidEvent({
        amount: 1100,
        bidder: BOB,
        nextMinBid: 1200,
        bidCount: 2,
        at: '2030-01-01T10:00:05.000Z',
      }),
    )

    expect(api.auction.value).toMatchObject({ currentPrice: 1100, nextMinBid: 1200, bidCount: 2 })
    expect(api.bids.value.map((bid) => [bid.bidder.name, bid.amount])).toEqual([
      ['Bob', 1100],
      ['Ana', 1000],
    ])
  })

  it('ne duplique pas une offre déjà présente dans l’historique rechargé', async () => {
    trpcMock.auction.bids.query.mockResolvedValue(
      page([{ id: 'b1', amount: 1000, bidder: ANA, at: '2030-01-01T10:00:00.000Z' }]),
    )
    const { api, fake } = setup()
    await flushPromises()

    fake.serverSends('bid:new', bidEvent())

    expect(api.bids.value).toHaveLength(1)
  })

  it('ignore les événements d’une autre enchère', async () => {
    const { api, fake } = setup()
    await flushPromises()

    fake.serverSends('bid:new', bidEvent({ auctionId: 'f'.repeat(24), amount: 9999 }))
    fake.serverSends('auction:extended', {
      auctionId: 'f'.repeat(24),
      endsAt: '2031-01-01T00:00:00.000Z',
    })

    expect(api.auction.value?.currentPrice).toBeNull()
    expect(api.bids.value).toEqual([])
    expect(api.extended.value).toBe(false)
  })

  it('auction:extended décale la fin et signale la prolongation quelques secondes', async () => {
    vi.useFakeTimers()
    const { api, fake } = setup()
    await vi.advanceTimersByTimeAsync(0)

    fake.serverSends('auction:extended', { auctionId: ID, endsAt: '2031-01-01T00:00:00.000Z' })

    expect(api.auction.value?.endsAt).toBe('2031-01-01T00:00:00.000Z')
    expect(api.extended.value).toBe(true)
    await vi.advanceTimersByTimeAsync(6100)
    expect(api.extended.value).toBe(false)
  })

  it('auction:ended passe l’enchère à terminée avec son gagnant et son prix final', async () => {
    const { api, fake } = setup()
    await flushPromises()

    fake.serverSends('auction:ended', { auctionId: ID, winner: BOB, finalPrice: 4200 })

    expect(api.auction.value).toMatchObject({ status: 'ended', currentPrice: 4200, winner: BOB })
  })

  it('auction:ended sans gagnant garde le prix et efface le gagnant', async () => {
    const { api, fake } = setup()
    await flushPromises()

    fake.serverSends('auction:ended', { auctionId: ID, winner: null, finalPrice: null })

    expect(api.auction.value).toMatchObject({ status: 'ended', currentPrice: null, winner: null })
  })

  it('ignore auction:ended d’une autre enchère', async () => {
    const { api, fake } = setup()
    await flushPromises()

    fake.serverSends('auction:ended', { auctionId: 'f'.repeat(24), winner: BOB, finalPrice: 1 })

    expect(api.auction.value?.status).toBe('live')
  })

  it('recharge une enchère à venir quand son heure de début est passée', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T10:00:00Z'))
    trpcMock.auction.get.query.mockResolvedValue(
      publicAuction({ id: ID, status: 'scheduled', startsAt: '2030-01-01T10:00:05.000Z' }),
    )
    const { api } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(trpcMock.auction.get.query).toHaveBeenCalledTimes(1)

    trpcMock.auction.get.query.mockResolvedValue(
      publicAuction({ id: ID, status: 'live', startsAt: '2030-01-01T10:00:05.000Z' }),
    )
    await vi.advanceTimersByTimeAsync(8000)

    expect(api.auction.value?.status).toBe('live')
    // Une fois ouverte, il ne recharge plus en boucle.
    const calls = trpcMock.auction.get.query.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(trpcMock.auction.get.query).toHaveBeenCalledTimes(calls)
  })
})

describe('placeBid', () => {
  it('envoie l’offre en centimes avec l’identifiant de l’enchère et renvoie l’ack', async () => {
    const { api, fake } = setup()
    await flushPromises()

    expect(await api.placeBid(1250)).toEqual({ ok: true })
    expect(fake.emitted.at(-1)).toEqual({
      event: 'bid:place',
      payload: { auctionId: ID, amount: 1250 },
    })
  })

  it('renvoie le code de refus du serveur', async () => {
    const { api, fake } = setup()
    await flushPromises()
    fake.answer('bid:place', () => ({ ok: false, code: 'BID_TOO_LOW' }))

    expect(await api.placeBid(500)).toEqual({ ok: false, code: 'BID_TOO_LOW' })
  })

  it('conclut à une panne quand le serveur ne répond pas', async () => {
    const { api, fake } = setup()
    await flushPromises()
    fake.answer('bid:place', () => undefined)

    expect(await api.placeBid(1000)).toEqual({ ok: false, code: 'INTERNAL_ERROR' })
  })

  it('NOT_AUTHENTICATED : renouvelle la session, reconnecte le socket et renvoie l’offre une fois', async () => {
    const renewSession = vi.fn().mockResolvedValue(undefined)
    const { api, fake } = setup({ renewSession })
    await flushPromises()
    let attempts = 0
    fake.answer('bid:place', () =>
      ++attempts === 1 ? { ok: false, code: 'NOT_AUTHENTICATED' } : { ok: true },
    )

    expect(await api.placeBid(1000)).toEqual({ ok: true })
    expect(renewSession).toHaveBeenCalledTimes(1)
    expect(fake.disconnect).toHaveBeenCalledTimes(1)
    expect(fake.connect).toHaveBeenCalledTimes(1)
    expect(attempts).toBe(2)
  })

  it('ne boucle pas : un second NOT_AUTHENTICATED est renvoyé tel quel', async () => {
    const renewSession = vi.fn().mockResolvedValue(undefined)
    const { api, fake } = setup({ renewSession })
    await flushPromises()
    let attempts = 0
    fake.answer('bid:place', () => {
      attempts += 1
      return { ok: false, code: 'NOT_AUTHENTICATED' }
    })

    expect(await api.placeBid(1000)).toEqual({ ok: false, code: 'NOT_AUTHENTICATED' })
    expect(attempts).toBe(2)
    expect(renewSession).toHaveBeenCalledTimes(1)
  })

  it('renvoie NOT_AUTHENTICATED si la session ne peut pas être renouvelée', async () => {
    const renewSession = vi.fn().mockRejectedValue(new Error('perdue'))
    const { api, fake } = setup({ renewSession })
    await flushPromises()
    fake.answer('bid:place', () => ({ ok: false, code: 'NOT_AUTHENTICATED' }))

    expect(await api.placeBid(1000)).toEqual({ ok: false, code: 'NOT_AUTHENTICATED' })
    expect(fake.connect).not.toHaveBeenCalled()
  })

  it('ne tente pas de renouveler la session pour un autre refus', async () => {
    const renewSession = vi.fn()
    const { api, fake } = setup({ renewSession })
    await flushPromises()
    fake.answer('bid:place', () => ({ ok: false, code: 'EMAIL_NOT_VERIFIED' }))

    expect(await api.placeBid(1000)).toEqual({ ok: false, code: 'EMAIL_NOT_VERIFIED' })
    expect(renewSession).not.toHaveBeenCalled()
  })
})
