import type { Writable } from 'node:stream'
import type { FastifyServerOptions } from 'fastify'
import type { Config } from './env'

/** Champs qui ne doivent jamais apparaître dans les logs (docs/technical/security.md, « Logs »). */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
]

/**
 * Chemins `redact` de pino. Le joker `*` ne couvre qu'un niveau : on déclare donc la clé
 * à la racine, à un niveau (`req.authorization`) et à deux niveaux (`req.headers.authorization`).
 */
export const REDACT_PATHS = [
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
  '["set-cookie"]',
  '*["set-cookie"]',
  '*.*["set-cookie"]',
]

export function loggerOptions(
  config: Config,
  stream?: Writable,
): Exclude<FastifyServerOptions['logger'], boolean | undefined> {
  return {
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    ...(stream ? { stream } : {}),
  }
}
