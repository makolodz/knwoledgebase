import type { ClientToServerEvents, ServerToClientEvents } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { Server } from 'socket.io'
import type { Config } from '../config/env'

export type SocketServer = Server<ClientToServerEvents, ServerToClientEvents>

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketServer
  }
}

/**
 * Attache Socket.IO au serveur HTTP de Fastify (un seul process, un seul port).
 * Les handlers d'événements arrivent à l'étape 4 (docs/technical/realtime.md).
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
