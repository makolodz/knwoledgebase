import { loginInputSchema, registerInputSchema } from '@encheres/shared'
import { AppError } from '../../errors'
import {
  login,
  logout,
  refresh,
  register,
  toCurrentUser,
  type RequestMeta,
} from '../../services/auth'
import type { Context } from '../context'
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from '../cookies'
import { authedProcedure, publicProcedure, router } from '../trpc'

function requestMeta(ctx: Context): RequestMeta {
  return { userAgent: ctx.req.headers['user-agent'] ?? null }
}

export const authRouter = router({
  /** Même réponse que l'email existe ou non, et aucune session (ADR-014). */
  register: publicProcedure.input(registerInputSchema).mutation(async ({ ctx, input }) => {
    await register(ctx.config, input)
    return { status: 'ok' as const }
  }),

  login: publicProcedure.input(loginInputSchema).mutation(async ({ ctx, input }) => {
    const { user, ...tokens } = await login(ctx.config, input, requestMeta(ctx))
    setSessionCookies(ctx.res, ctx.config, tokens)
    return { user }
  }),

  /** Appelée seule par le front : le cookie du refresh token n'est envoyé qu'à ce chemin. */
  refresh: publicProcedure.mutation(async ({ ctx }) => {
    try {
      const { user, ...tokens } = await refresh(ctx.config, ctx.req.cookies[REFRESH_COOKIE])
      setSessionCookies(ctx.res, ctx.config, tokens)
      return { user }
    } catch (error) {
      // Session perdue : on retire les cookies. Un simple conflit de rotation les laisse
      // intacts, car l'autre requête vient de les renouveler.
      if (error instanceof AppError && error.appCode === 'NOT_AUTHENTICATED') {
        clearSessionCookies(ctx.res, ctx.config)
      }
      throw error
    }
  }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    await logout(ctx.sessionId)
    clearSessionCookies(ctx.res, ctx.config)
    return { status: 'ok' as const }
  }),

  me: authedProcedure.query(({ ctx }) => ({ user: toCurrentUser(ctx.user) })),
})
