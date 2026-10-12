import { healthResponseSchema } from '@encheres/shared'
import { getHealth } from '../services/health'
import { publicProcedure, router } from './trpc'

export const appRouter = router({
  health: publicProcedure.output(healthResponseSchema).query(() => getHealth()),
})

export type AppRouter = typeof appRouter
