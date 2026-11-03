import {
  MAX_ROOMS_PER_SOCKET,
  auctionRoom,
  auctionRoomPayloadSchema,
  bidPlacePayloadSchema,
  objectIdSchema,
  type AckResult,
  type BidErrorCode,
} from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config/env'
import { Auction, User } from '../models'
import { PUBLIC_STATUSES } from '../services/auctions'
import { placeBid, type PlaceBidResult } from '../services/bids'
import { enqueueEmail } from '../services/email-queue'
import { buildWebLink } from '../services/links'
import type { AppSocket, SocketServer } from '.'

interface Dependencies {
  app: FastifyInstance
  config: Config
}

const failure = (code: BidErrorCode): AckResult => ({ ok: false, code })

/** Un client malveillant peut omettre l'ack : on ne l'appelle que s'il existe. */
function replier(ack: unknown): (result: AckResult) => void {
  return typeof ack === 'function' ? (ack as (result: AckResult) => void) : () => undefined
}

export function registerAuctionHandlers(
  io: SocketServer,
  socket: AppSocket,
  { app, config }: Dependencies,
): void {
  // Suivre une enchère : seules les enchères publiques ont une room.
  socket.on('auction:join', (payload, ack) => {
    const reply = replier(ack)
    void (async () => {
      const parsed = auctionRoomPayloadSchema.safeParse(payload)
      if (!parsed.success) return reply(failure('AUCTION_NOT_LIVE'))
      const { auctionId } = parsed.data
      try {
        if ((await Auction.exists({ _id: auctionId, status: { $in: PUBLIC_STATUSES } })) === null) {
          return reply(failure('AUCTION_NOT_LIVE'))
        }
        const followed = [...socket.rooms].filter((room) => room.startsWith('auction:')).length
        if (!socket.rooms.has(auctionRoom(auctionId)) && followed >= MAX_ROOMS_PER_SOCKET) {
          return reply(failure('RATE_LIMITED'))
        }
        await socket.join(auctionRoom(auctionId))
        reply({ ok: true })
      } catch (error) {
        app.log.error({ err: error }, 'Erreur à auction:join')
        reply(failure('INTERNAL_ERROR'))
      }
    })()
  })

  socket.on('auction:leave', (payload, ack) => {
    const reply = replier(ack)
    const parsed = auctionRoomPayloadSchema.safeParse(payload)
    if (!parsed.success) return reply(failure('AUCTION_NOT_LIVE'))
    void socket.leave(auctionRoom(parsed.data.auctionId))
    reply({ ok: true })
  })

  socket.on('bid:place', (payload, ack) => {
    const reply = replier(ack)
    void (async () => {
      const parsed = bidPlacePayloadSchema.safeParse(payload)
      if (!parsed.success) {
        // L'enchère est introuvable si son identifiant est illisible, sinon c'est le montant.
        const idOk = objectIdSchema.safeParse(
          (payload as { auctionId?: unknown } | null)?.auctionId,
        )
        return reply(failure(idOk.success ? 'INVALID_AMOUNT' : 'AUCTION_NOT_LIVE'))
      }

      const { userId, expiresAtMs } = socket.data
      // Un JWT expiré ne vaut plus identité : le client renouvelle sa session puis se reconnecte.
      if (userId === null || expiresAtMs <= Date.now()) return reply(failure('NOT_AUTHENTICATED'))

      if (app.rateLimits.bid.isBlocked(userId)) return reply(failure('RATE_LIMITED'))
      app.rateLimits.bid.record(userId)

      let result: PlaceBidResult
      try {
        result = await placeBid({
          userId,
          auctionId: parsed.data.auctionId,
          amount: parsed.data.amount,
        })
      } catch (error) {
        app.log.error({ err: error }, 'Erreur à bid:place')
        return reply(failure('INTERNAL_ERROR'))
      }
      if (!result.ok) return reply(failure(result.code))

      // Diffusion à la room de cette enchère seulement : jamais d'email ni de donnée privée.
      const room = auctionRoom(result.event.auctionId)
      io.to(room).emit('bid:new', result.event)
      if (result.extendedTo !== null) {
        io.to(room).emit('auction:extended', {
          auctionId: result.event.auctionId,
          endsAt: result.extendedTo.toISOString(),
        })
      }
      reply({ ok: true })

      // L'email passe par la file : il ne retarde ni ne fait échouer l'offre, déjà acceptée.
      if (result.outbid !== null) {
        try {
          const previous = await User.findById(result.outbid.userId)
          if (previous?.email != null) {
            await enqueueEmail(previous.email, 'outbid', {
              name: previous.name,
              title: result.outbid.auctionTitle,
              amount: result.event.amount,
              link: buildWebLink(config, `/auctions/${result.event.auctionId}`),
            })
          }
        } catch (error) {
          app.log.error({ err: error }, 'Email « offre dépassée » non ajouté à la file')
        }
      }
    })()
  })
}
