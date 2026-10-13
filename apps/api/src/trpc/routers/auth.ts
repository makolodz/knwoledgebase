import {
  forgotPasswordInputSchema,
  loginInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  verifyEmailInputSchema,
} from '@encheres/shared'
import { AppError } from '../../errors'
import {
  login,
  logout,
  refresh,
  register,
  toCurrentUser,
  type RequestMeta,
} from '../../services/auth'
import { requestPasswordReset, resetPassword } from '../../services/password-reset'
import { resendVerification, verifyEmail } from '../../services/verification'
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

  /** Public : le lien est cliqué depuis la boîte mail, souvent sans session. */
  verifyEmail: publicProcedure.input(verifyEmailInputSchema).mutation(async ({ input }) => {
    await verifyEmail(input.token)
    return { status: 'ok' as const }
  }),

  /** Un lien par minute au plus ; `already_verified` quand il n'y a rien à vérifier. */
  resendVerification: authedProcedure.mutation(async ({ ctx }) => ({
    status: await resendVerification(ctx.config, ctx.user),
  })),

  /** Même réponse que l'email existe ou non. */
  forgotPassword: publicProcedure
    .input(forgotPasswordInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requestPasswordReset(ctx.config, input.email)
      return { status: 'ok' as const }
    }),

  /** Ferme toutes les sessions et ne connecte pas l'utilisateur. */
  resetPassword: publicProcedure.input(resetPasswordInputSchema).mutation(async ({ input }) => {
    await resetPassword(input)
    return { status: 'ok' as const }
  }),
})
