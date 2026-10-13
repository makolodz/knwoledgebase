import { healthResponseSchema } from '@encheres/shared'
import { getHealth } from '../services/health'
import { authRouter } from './routers/auth'
import { publicProcedure, router } from './trpc'

export const appRouter = router({
  health: publicProcedure.output(healthResponseSchema).query(() => getHealth()),
  auth: authRouter,
})

export type AppRouter = typeof appRouter
