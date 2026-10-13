import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyReply } from 'fastify'
import type { Config } from '../config/env'
import { ACCESS_TOKEN_TTL_SECONDS } from '../services/jwt'
import { REFRESH_TOKEN_TTL_MS } from '../services/sessions'

export const ACCESS_COOKIE = 'access_token'
export const REFRESH_COOKIE = 'refresh_token'

/**
 * Le refresh token n'est envoyé qu'à la procédure de rafraîchissement (docs/technical/security.md).
 * Le front doit donc appeler `auth.refresh` seule, jamais dans une requête groupée.
 */
export const REFRESH_COOKIE_PATH = '/api/trpc/auth.refresh'

/**
 * `Secure` en production seulement : le développement se fait en `http://localhost`
 * (ADR-014). `SameSite=Lax` protège des requêtes d'un autre site.
 */
function baseOptions(config: Config): CookieSerializeOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.nodeEnv === 'production' }
}

export function setSessionCookies(
  reply: FastifyReply,
  config: Config,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const base = baseOptions(config)
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  })
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  })
}

export function clearSessionCookies(reply: FastifyReply, config: Config): void {
  const base = baseOptions(config)
  reply.clearCookie(ACCESS_COOKIE, { ...base, path: '/' })
  reply.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH })
}
