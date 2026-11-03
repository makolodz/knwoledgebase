import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@encheres/shared'
import { io as connect, type Socket } from 'socket.io-client'
import type { Types } from 'mongoose'
import { Auction, type AuctionAttributes } from '../src/models'
import { WEB_ORIGIN } from './helpers'
import type { TestClient } from './trpc'
import { createUser, logIn } from './users'

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const HOUR_MS = 3_600_000

/** Une enchère `live` créée directement en base (la création par l'API est testée ailleurs). */
export async function createLiveAuction(
  sellerId: Types.ObjectId,
  overrides: Partial<AuctionAttributes> = {},
) {
  return Auction.create({
    sellerId,
    title: 'Vase ancien',
    description: 'Un beau vase.',
    images: [],
    startingPrice: 1000,
    minIncrement: 100,
    nextMinBid: overrides.startingPrice ?? 1000,
    startsAt: new Date(Date.now() - HOUR_MS),
    endsAt: new Date(Date.now() + 3 * HOUR_MS),
    status: 'live',
    ...overrides,
  })
}

/** Un utilisateur vérifié, avec ses cookies de session (comme un navigateur connecté). */
export async function createLoggedInUser(
  makeClient: () => TestClient,
  email: string,
  overrides: Parameters<typeof createUser>[0] = {},
) {
  const user = await createUser({
    email,
    name: email.split('@')[0] ?? 'x',
    emailVerifiedAt: new Date(),
    ...overrides,
  })
  const client = makeClient()
  await logIn(client, email)
  return { user, client, accessToken: client.cookie('access_token') ?? '' }
}

/** Ouvre un socket comme le front : l'origine du front, et le cookie de session s'il y en a un. */
export function openSocket(url: string, accessToken?: string): ClientSocket {
  return connect(url, {
    transports: ['websocket'],
    reconnection: false,
    extraHeaders: {
      origin: WEB_ORIGIN,
      ...(accessToken === undefined ? {} : { cookie: `access_token=${accessToken}` }),
    },
  })
}

export function whenConnected(socket: ClientSocket): Promise<'connected' | 'refused'> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'))
    socket.once('connect_error', () => resolve('refused'))
  })
}

/** Envoie un événement avec un ack, et attend la réponse. */
export function emitWithAck(
  socket: ClientSocket,
  event: 'auction:join' | 'auction:leave' | 'bid:place',
  payload: unknown,
): Promise<AckResult> {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve)
  })
}

/** Collecte les événements reçus d'un type, pour vérifier ce qui a (ou n'a pas) été diffusé. */
export function collect<Event extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: Event,
): Parameters<ServerToClientEvents[Event]>[0][] {
  const received: Parameters<ServerToClientEvents[Event]>[0][] = []
  socket.on(event, ((payload: Parameters<ServerToClientEvents[Event]>[0]) => {
    received.push(payload)
  }) as never)
  return received
}

/** Laisse le temps aux diffusions d'arriver (elles suivent l'ack de quelques millisecondes). */
export const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
