import type { ErrorCode } from '@encheres/shared'
import { initTRPC } from '@trpc/server'
import type { TRPC_ERROR_CODE_KEY } from '@trpc/server/rpc'
import { z } from 'zod'
import { AppError } from '../errors'
import { authenticate } from '../services/auth'
import type { RateLimiter } from '../services/rate-limiter'
import type { RateLimits } from '../services/rate-limits'
import { ACCESS_COOKIE } from './cookies'
import type { Context } from './context'

/** Erreurs de validation : les chemins et les types de problème, jamais les valeurs saisies. */
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    ;(result[path] ??= []).push(issue.code)
  }
  return result
}

interface AppErrorData {
  /** Code métier (`EMAIL_NOT_VERIFIED`…) quand il y en a un, sinon le code tRPC. */
  code: TRPC_ERROR_CODE_KEY | ErrorCode
  httpStatus: number
  path?: string
  /** Présent pour une entrée invalide : chemin du champ → types de problème. */
  fieldErrors?: Record<string, string[]>
}

const t = initTRPC.context<Context>().create({
  // Jamais de stack trace dans une réponse (docs/technical/api.md, « Erreurs »).
  // Sans cette option, tRPC l'ajoute dès que NODE_ENV n'est pas « production ».
  isDev: false,
  errorFormatter({ shape, error }) {
    const data: AppErrorData = {
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      ...(shape.data.path === undefined ? {} : { path: shape.data.path }),
    }
    if (error instanceof AppError) {
      return { ...shape, data: { ...data, code: error.appCode } }
    }
    if (error.cause instanceof z.ZodError) {
      // Le message natif de tRPC est le JSON des erreurs Zod : on ne renvoie que l'essentiel.
      return {
        ...shape,
        message: 'Données invalides.',
        data: { ...data, fieldErrors: fieldErrors(error.cause) },
      }
    }
    return { ...shape, data }
  },
})

export const router = t.router
export const publicProcedure = t.procedure

/**
 * Limite le nombre d'appels par adresse IP, qu'ils réussissent ou non (inscription, mot de passe
 * oublié, renvoi du lien de vérification). À placer avec `.use()` avant la validation de
 * l'entrée : un appel refusé ne coûte ni validation ni accès à la base.
 */
export function limitByIp(select: (limits: RateLimits) => RateLimiter) {
  return t.middleware(({ ctx, next }) => {
    select(ctx.rateLimits).consume(ctx.req.ip)
    return next()
  })
}

/**
 * Procédure réservée aux utilisateurs connectés. L'utilisateur est **relu en base** à chaque
 * appel : le rôle, la suspension ou la suppression d'un compte s'appliquent immédiatement, sans
 * attendre l'expiration du JWT (docs/domain/workflows/account.md, « Règles transverses »).
 */
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { user, sessionId } = await authenticate(ctx.config, ctx.req.cookies[ACCESS_COOKIE])
  return next({ ctx: { user, sessionId } })
})

/**
 * Procédure réservée aux vendeurs (`seller`). Un admin ne vend pas : il valide et modère
 * (docs/domain/business-rules.md). Le rôle vient de la base, relu à chaque appel par `authed`.
 */
export const sellerProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'seller') throw new AppError('FORBIDDEN')
  return next()
})

/** Procédure réservée aux administrateurs (`admin`), rôle relu en base. */
export const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new AppError('FORBIDDEN')
  return next()
})

/** Appelle les procédures sans HTTP : réservé aux tests d'intégration. */
export const createCallerFactory = t.createCallerFactory
