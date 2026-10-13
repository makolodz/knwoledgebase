import { healthResponseSchema } from '@encheres/shared'
import { getHealth } from '../services/health'
import { authRouter } from './routers/auth'
import { profileRouter } from './routers/profile'
import { publicProcedure, router } from './trpc'

export const appRouter = router({
  health: publicProcedure.output(healthResponseSchema).query(() => getHealth()),
  auth: authRouter,
  profile: profileRouter,
})

export type AppRouter = typeof appRouter
