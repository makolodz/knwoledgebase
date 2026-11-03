import type {
  AckResult,
  AuctionEndedEvent,
  AuctionExtendedEvent,
  BidErrorCode,
  BidNewEvent,
  BidRecord,
  PublicAuction,
} from '@encheres/shared'
import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { errorCodeOf } from '../api/errors'
import { socket as defaultSocket } from '../api/socket'
import { trpc } from '../api/trpc'
import { errorMessage } from '../i18n/errors'
import { useNow } from './now'

/** Ce que le composable attend d'un socket : permet de le remplacer par un faux dans les tests. */
export interface AuctionSocketLike {
  readonly connected: boolean
  on(event: string, listener: (...args: never[]) => void): unknown
  off(event: string, listener: (...args: never[]) => void): unknown
  emit(event: string, ...args: unknown[]): unknown
  connect(): unknown
  disconnect(): unknown
}

export type AuctionState =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' }

export interface UseAuctionSocketOptions {
  socket?: AuctionSocketLike
  /** Renouvelle la session HTTP (cookies) ; utilisé quand le socket a un JWT expiré. */
  renewSession?: () => Promise<void>
  /** Délai d'attente d'un ack avant de conclure que le serveur n'a pas répondu. */
  ackTimeoutMs?: number
}

/** Nombre d'offres chargées dans l'historique affiché. */
const HISTORY_SIZE = 20

const ACK_TIMEOUT_MS = 8000

/** Heure serveur inconnue du client : on laisse un instant au job d'ouverture (1 s, ADR-008). */
const OPENING_GRACE_MS = 1500
const OPENING_RETRY_MS = 2000

const bidKey = (bid: Pick<BidRecord, 'bidder' | 'amount' | 'at'>) =>
  `${bid.bidder.id}:${bid.amount}:${bid.at}`

/**
 * Suit une enchère en direct (docs/technical/frontend.md, « Temps réel ») :
 * - charge l'enchère et son historique par l'API, puis rejoint la room `auction:<id>` ;
 * - applique `bid:new` et `auction:extended` à l'état affiché ;
 * - après chaque (re)connexion, rejoint la room puis recharge l'état : les offres arrivées entre
 *   deux connexions ne sont jamais perdues ;
 * - envoie les offres avec un ack, et renouvelle la session si le JWT du socket a expiré.
 * L'état affiché n'est qu'un reflet : le serveur décide de tout.
 */
export function useAuctionSocket(auctionId: Ref<string>, options: UseAuctionSocketOptions = {}) {
  const socket = options.socket ?? (defaultSocket as unknown as AuctionSocketLike)
  const renewSession = options.renewSession ?? (async () => void (await trpc.auth.me.query()))
  const ackTimeoutMs = options.ackTimeoutMs ?? ACK_TIMEOUT_MS

  const state = ref<AuctionState>({ kind: 'loading' })
  const auction = shallowRef<PublicAuction | null>(null)
  const bids = ref<BidRecord[]>([])
  const connected = ref(socket.connected)
  /** Vrai quelques secondes après une prolongation anti-sniping. */
  const extended = ref(false)

  let extendedTimer: ReturnType<typeof setTimeout> | undefined
  let requestId = 0
  let lastOpeningCheck = 0

  async function load(): Promise<void> {
    const current = ++requestId
    try {
      const [detail, history] = await Promise.all([
        trpc.auction.get.query({ id: auctionId.value }),
        trpc.auction.bids.query({ id: auctionId.value, page: 1, limit: HISTORY_SIZE }),
      ])
      if (current !== requestId) return
      auction.value = detail
      bids.value = history.items
      state.value = { kind: 'ready' }
    } catch (error) {
      if (current !== requestId) return
      const code = errorCodeOf(error)
      state.value =
        code === 'AUCTION_NOT_FOUND' || code === 'BAD_REQUEST'
          ? { kind: 'notFound' }
          : { kind: 'error', message: errorMessage(error) }
    }
  }

  /** Rejoint la room puis recharge : l'ordre évite de perdre une offre entre les deux. */
  function joinAndLoad(): Promise<void> {
    return new Promise((resolve) => {
      socket.emit('auction:join', { auctionId: auctionId.value }, () => {
        void load().then(resolve)
      })
    })
  }

  const onConnect = () => {
    connected.value = true
    void joinAndLoad()
  }
  const onDisconnect = () => {
    connected.value = false
  }

  const onBidNew = (event: BidNewEvent) => {
    if (event.auctionId !== auctionId.value || auction.value === null) return
    auction.value = {
      ...auction.value,
      currentPrice: event.amount,
      nextMinBid: event.nextMinBid,
      bidCount: event.bidCount,
    }
    const record: BidRecord = {
      id: bidKey(event),
      amount: event.amount,
      bidder: event.bidder,
      at: event.at,
    }
    if (!bids.value.some((bid) => bidKey(bid) === bidKey(record))) {
      bids.value = [record, ...bids.value].slice(0, HISTORY_SIZE)
    }
  }

  const onExtended = (event: AuctionExtendedEvent) => {
    if (event.auctionId !== auctionId.value || auction.value === null) return
    auction.value = { ...auction.value, endsAt: event.endsAt }
    extended.value = true
    clearTimeout(extendedTimer)
    extendedTimer = setTimeout(() => (extended.value = false), 6000)
  }

  // La clôture : le serveur annonce le gagnant et le prix final, sans qu'il faille recharger.
  const onEnded = (event: AuctionEndedEvent) => {
    if (event.auctionId !== auctionId.value || auction.value === null) return
    auction.value = {
      ...auction.value,
      status: 'ended',
      currentPrice: event.finalPrice ?? auction.value.currentPrice,
      winner: event.winner,
    }
  }

  socket.on('connect', onConnect)
  socket.on('disconnect', onDisconnect)
  socket.on('bid:new', onBidNew)
  socket.on('auction:extended', onExtended)
  socket.on('auction:ended', onEnded)

  // Première charge : par l'API, que le socket soit connecté ou non (il peut être indisponible).
  void (socket.connected ? joinAndLoad() : load())

  // Une enchère à venir s'ouvre toute seule : on recharge dès l'heure de début passée.
  const now = useNow()
  watch(now, (time) => {
    const current = auction.value
    if (current?.status !== 'scheduled') return
    if (time < new Date(current.startsAt).getTime() + OPENING_GRACE_MS) return
    if (time - lastOpeningCheck < OPENING_RETRY_MS) return
    lastOpeningCheck = time
    void load()
  })

  // Un changement d'enchère (navigation entre deux pages) quitte l'ancienne room.
  watch(auctionId, (next, previous) => {
    socket.emit('auction:leave', { auctionId: previous })
    state.value = { kind: 'loading' }
    auction.value = null
    bids.value = []
    void (socket.connected ? joinAndLoad() : load())
    void next
  })

  onScopeDispose(() => {
    clearTimeout(extendedTimer)
    socket.off('connect', onConnect)
    socket.off('disconnect', onDisconnect)
    socket.off('bid:new', onBidNew)
    socket.off('auction:extended', onExtended)
    socket.off('auction:ended', onEnded)
    if (socket.connected) socket.emit('auction:leave', { auctionId: auctionId.value })
  })

  type Sent = { ok: true } | { ok: false; code: BidErrorCode }

  function send(amount: number): Promise<Sent> {
    return new Promise((resolve) => {
      let answered = false
      const timer = setTimeout(() => {
        if (answered) return
        answered = true
        resolve({ ok: false, code: 'INTERNAL_ERROR' })
      }, ackTimeoutMs)
      socket.emit('bid:place', { auctionId: auctionId.value, amount }, (result: AckResult) => {
        if (answered) return
        answered = true
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  /** Attend que le socket soit de nouveau connecté (au plus quelques secondes). */
  function reconnect(): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer)
        socket.off('connect', onUp)
        socket.off('connect_error', onFail)
        resolve(ok)
      }
      const onUp = () => done(true)
      const onFail = () => done(false)
      const timer = setTimeout(() => done(false), ackTimeoutMs)
      socket.on('connect', onUp)
      socket.on('connect_error', onFail)
      socket.disconnect()
      socket.connect()
    })
  }

  /**
   * Place une offre. Si le serveur répond `NOT_AUTHENTICATED` alors que l'utilisateur est connecté
   * (le JWT du socket a expiré), la session est renouvelée, le socket reconnecté et l'offre
   * renvoyée une seule fois.
   */
  async function placeBid(amount: number, { retryOnExpiry = true } = {}): Promise<Sent> {
    const result = await send(amount)
    if (result.ok || result.code !== 'NOT_AUTHENTICATED' || !retryOnExpiry) return result
    try {
      await renewSession()
    } catch {
      return result
    }
    if (!(await reconnect())) return result
    return placeBid(amount, { retryOnExpiry: false })
  }

  return { state, auction, bids, connected, extended, placeBid, reload: load }
}
