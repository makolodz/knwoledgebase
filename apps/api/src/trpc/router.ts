import { healthResponseSchema } from '@encheres/shared'
import { getHealth } from '../services/health'
import { adminRouter } from './routers/admin'
import { auctionRouter } from './routers/auction'
import { authRouter } from './routers/auth'
import { profileRouter } from './routers/profile'
import { publicProcedure, router } from './trpc'

export const appRouter = router({
  health: publicProcedure.output(healthResponseSchema).query(() => getHealth()),
  auth: authRouter,
  auction: auctionRouter,
  admin: adminRouter,
  profile: profileRouter,
})

export type AppRouter = typeof appRouter
