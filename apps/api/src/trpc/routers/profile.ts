import {
  changeEmailInputSchema,
  changePasswordInputSchema,
  confirmEmailChangeInputSchema,
  updateProfileInputSchema,
} from '@encheres/shared'
import { toCurrentUser } from '../../services/auth'
import {
  changePassword,
  confirmEmailChange,
  requestEmailChange,
  updateName,
} from '../../services/profile'
import { authedProcedure, router } from '../trpc'

export const profileRouter = router({
  update: authedProcedure.input(updateProfileInputSchema).mutation(async ({ ctx, input }) => ({
    user: toCurrentUser(await updateName(ctx.user, input.name)),
  })),

  changePassword: authedProcedure
    .input(changePasswordInputSchema)
    .mutation(async ({ ctx, input }) => {
      await changePassword(ctx.user, ctx.sessionId, input, ctx.rateLimits)
      return { status: 'ok' as const }
    }),

  /** Même réponse que la nouvelle adresse soit libre ou non. */
  changeEmail: authedProcedure.input(changeEmailInputSchema).mutation(async ({ ctx, input }) => {
    await requestEmailChange(ctx.config, ctx.user, input, ctx.rateLimits)
    return { status: 'ok' as const }
  }),

  confirmEmailChange: authedProcedure
    .input(confirmEmailChangeInputSchema)
    .mutation(async ({ ctx, input }) => ({
      user: toCurrentUser(await confirmEmailChange(ctx.user, input.token)),
    })),
})
