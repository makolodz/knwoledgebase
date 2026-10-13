import type { Writable } from 'node:stream'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import type { Config } from './config/env'
import { loggerOptions } from './config/logger'
import { createRateLimits, type RateLimits } from './services/rate-limits'
import { attachSocketIo } from './sockets'
import { createContextFactory } from './trpc/context'
import { appRouter, type AppRouter } from './trpc/router'

declare module 'fastify' {
  interface FastifyInstance {
    /** Limites anti-abus par action (connexion, inscription…), en mémoire. */
    rateLimits: RateLimits
  }
}

/** Limite globale de l'API (docs/technical/security.md, « Limites anti-abus »). */
export const GLOBAL_RATE_LIMIT_PER_MINUTE = 300

export interface BuildAppOptions {
  /** Destination des logs (les tests y branchent un flux en mémoire). */
  logStream?: Writable
  /** Réglages réservés aux tests : une limite globale plus basse, une horloge simulée. */
  rateLimit?: {
    globalMax?: number
    now?: () => number
  }
}

const CLIENT_ERRORS: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'Requête invalide.' },
  404: { code: 'NOT_FOUND', message: 'Ressource introuvable.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Type de contenu non pris en charge.' },
  429: { code: 'RATE_LIMITED', message: 'Trop de requêtes.' },
}

/**
 * Construit le serveur sans l'écouter : `server.ts` appelle `listen`, les tests utilisent
 * `inject` ou écoutent sur un port libre.
 */
export async function buildApp(
  config: Config,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(config, options.logStream) })

  const rateLimits = createRateLimits(options.rateLimit?.now)
  app.decorate('rateLimits', rateLimits)

  await app.register(helmet)
  await app.register(cors, { origin: [config.webOrigin], credentials: true })
  await app.register(cookie)
  // Après CORS : une réponse 429 garde ses en-têtes CORS, le navigateur peut donc la lire.
  await app.register(rateLimit, {
    max: options.rateLimit?.globalMax ?? GLOBAL_RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
  })

  // Erreur renvoyée au client : un code stable et un message court, jamais de détail interne.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500
    if (status >= 500) {
      request.log.error({ err: error }, 'Erreur non gérée')
      return reply
        .status(500)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne.' } })
    }
    const known = CLIENT_ERRORS[status] ?? CLIENT_ERRORS[400]
    return reply.status(status).send({ error: known })
  })
  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: CLIENT_ERRORS[404] }))

  await app.register(fastifyTRPCPlugin, {
    prefix: '/api/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(config, rateLimits),
      // tRPC écrit ses en-têtes sur la réponse brute et remplace le `Vary: Origin` posé par CORS.
      // Sans `Origin` dans Vary, un cache pourrait resservir une réponse sans en-têtes CORS à
      // l'origine autorisée. On reprend donc les valeurs de tRPC en y ajoutant `Origin`.
      responseMeta: () => ({ headers: { vary: 'trpc-accept, accept, Origin' } }),
      onError({ error, path, ctx }) {
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          ctx?.log.error({ err: error, path }, 'Erreur tRPC non gérée')
        }
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  })

  attachSocketIo(app, config)

  return app
}
