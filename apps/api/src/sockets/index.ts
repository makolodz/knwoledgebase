import type { ClientToServerEvents, ServerToClientEvents } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import type { Config } from '../config/env'
import { verifyAccessToken } from '../services/jwt'
import { ACCESS_COOKIE } from '../trpc/cookies'
import { registerAuctionHandlers } from './auction'

/** Ce que le serveur retient d'une connexion, rempli au handshake. */
export interface SocketData {
  /** `null` pour un visiteur : il peut suivre une enchère, pas enchérir. */
  userId: string | null
  /** Fin de validité du JWT du handshake (ms) ; passé ce délai, il faut se reconnecter. */
  expiresAtMs: number
}

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketServer
  }
}

/** Lit un cookie dans l'en-tête `Cookie` d'un handshake. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue
    const raw = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Attache Socket.IO au serveur HTTP de Fastify (un seul process, un seul port) et branche les
 * événements des enchères (docs/technical/realtime.md).
 */
export function attachSocketIo(app: FastifyInstance, config: Config): SocketServer {
  const io: SocketServer = new Server(app.server, {
    cors: { origin: [config.webOrigin], credentials: true },
    // CORS ne protège pas la poignée de main WebSocket : un site tiers pourrait ouvrir un socket
    // avec les cookies de l'utilisateur. On refuse donc toute origine de navigateur inconnue.
    // Les clients sans en-tête Origin (tests, scripts) ne sont pas des navigateurs.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin
      callback(null, origin === undefined || origin === config.webOrigin)
    },
  })

  // Authentification au handshake, avec le JWT du cookie `access_token`.
  // - Pas de cookie : visiteur. Il suit les enchères, mais ses offres reçoivent NOT_AUTHENTICATED.
  // - Cookie invalide (signature, algorithme, expiration) : connexion refusée.
  // Le JWT ne prouve que l'identité : rôle, email vérifié et suspension sont relus en base à
  // chaque offre (docs/technical/security.md).
  io.use((socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE)
    if (token === undefined) {
      socket.data = { userId: null, expiresAtMs: 0 }
      next()
      return
    }
    verifyAccessToken(config.jwtSecret, token)
      .then((claims) => {
        if (claims === null) {
          next(new Error('NOT_AUTHENTICATED'))
          return
        }
        socket.data = { userId: claims.userId, expiresAtMs: claims.expiresAtMs }
        next()
      })
      .catch(() => next(new Error('NOT_AUTHENTICATED')))
  })

  io.on('connection', (socket) => {
    registerAuctionHandlers(io, socket, { app, config })
  })

  app.decorate('io', io)
  // Déconnecte les sockets avant la fermeture du serveur HTTP, sinon elle attend leur fin.
  app.addHook('preClose', () => {
    io.local.disconnectSockets(true)
  })
  app.addHook('onClose', async () => {
    await io.close()
  })

  return io
}
