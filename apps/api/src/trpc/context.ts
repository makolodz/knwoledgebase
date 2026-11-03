// Apporte les types de `req.cookies` et `reply.setCookie`.
import '@fastify/cookie'
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import type { Config } from '../config/env'
import type { Storage } from '../infra/storage'
import type { RateLimits } from '../services/rate-limits'

/** Fabrique le contexte de chaque requête tRPC : la config est celle de l'application. */
export function createContextFactory(config: Config, rateLimits: RateLimits, storage: Storage) {
  return ({ req, res }: CreateFastifyContextOptions) => ({
    log: req.log,
    req,
    res,
    config,
    rateLimits,
    storage,
  })
}

export type Context = ReturnType<ReturnType<typeof createContextFactory>>
