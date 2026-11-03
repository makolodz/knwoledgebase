import {
  auctionIdInputSchema,
  bidsInputSchema,
  createAuctionInputSchema,
  listAuctionsInputSchema,
  mineAuctionsInputSchema,
  relistAuctionInputSchema,
  updateAuctionInputSchema,
} from '@encheres/shared'
import { listBids } from '../../services/bids'
import {
  cancelOwnAuction,
  createAuction,
  getAuctionRules,
  getOwnAuction,
  getPublicAuction,
  listOwnAuctions,
  listPublicAuctions,
  relistAuction,
  updateAuction,
} from '../../services/auctions'
import { publicProcedure, router, sellerProcedure } from '../trpc'

export const auctionRouter = router({
  list: publicProcedure
    .input(listAuctionsInputSchema)
    .query(({ ctx, input }) => listPublicAuctions(ctx.storage, input)),

  get: publicProcedure
    .input(auctionIdInputSchema)
    .query(({ ctx, input }) => getPublicAuction(ctx.storage, input.id)),

  /** Historique des offres, la plus récente d'abord (nom d'affichage seulement). */
  bids: publicProcedure.input(bidsInputSchema).query(({ input }) => listBids(input.id, input)),

  /** Paramètres utiles au formulaire de création (pas métier : lecture seule). */
  rules: sellerProcedure.query(() => getAuctionRules()),

  create: sellerProcedure
    .input(createAuctionInputSchema)
    .mutation(({ ctx, input }) => createAuction(ctx.storage, ctx.user, input)),

  update: sellerProcedure
    .input(updateAuctionInputSchema)
    .mutation(({ ctx, input }) => updateAuction(ctx.storage, ctx.user, input)),

  cancel: sellerProcedure
    .input(auctionIdInputSchema)
    .mutation(({ ctx, input }) => cancelOwnAuction(ctx.storage, ctx.user, input.id)),

  /** Remise en vente : copie en `draft`, sans offres (depuis `ended` sans gagnant, `unpaid` ou `cancelled`). */
  relist: sellerProcedure
    .input(relistAuctionInputSchema)
    .mutation(({ ctx, input }) => relistAuction(ctx.storage, ctx.user, input)),

  mine: sellerProcedure
    .input(mineAuctionsInputSchema)
    .query(({ ctx, input }) => listOwnAuctions(ctx.storage, ctx.user, input)),

  getMine: sellerProcedure
    .input(auctionIdInputSchema)
    .query(({ ctx, input }) => getOwnAuction(ctx.storage, ctx.user, input.id)),
})
