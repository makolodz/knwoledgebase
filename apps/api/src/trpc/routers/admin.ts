import {
  auctionIdInputSchema,
  pendingAuctionsInputSchema,
  rejectAuctionInputSchema,
} from '@encheres/shared'
import { listPendingAuctions, rejectAuction, validateAuction } from '../../services/auctions'
import { adminProcedure, router } from '../trpc'

export const adminRouter = router({
  pendingAuctions: adminProcedure
    .input(pendingAuctionsInputSchema)
    .query(({ ctx, input }) => listPendingAuctions(ctx.storage, input)),

  validate: adminProcedure
    .input(auctionIdInputSchema)
    .mutation(({ ctx, input }) => validateAuction(ctx.storage, ctx.config, input.id)),

  reject: adminProcedure
    .input(rejectAuctionInputSchema)
    .mutation(({ ctx, input }) => rejectAuction(ctx.storage, ctx.config, input.id, input.reason)),
})
