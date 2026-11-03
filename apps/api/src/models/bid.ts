import { model, Schema, type HydratedDocument, type Types } from 'mongoose'

/**
 * Historique des offres acceptées (docs/technical/database.md). Une offre acceptée n'est jamais
 * modifiée ni supprimée : le modèle n'a ni mise à jour ni route de suppression.
 */
export interface BidAttributes {
  auctionId: Types.ObjectId
  userId: Types.ObjectId
  /** Centimes. */
  amount: number
  createdAt: Date
}

const bidSchema = new Schema<BidAttributes>(
  {
    auctionId: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
)

bidSchema.index({ auctionId: 1, createdAt: -1 })
// « Mes offres » (étape 5) : les enchères sur lesquelles un utilisateur a enchéri.
bidSchema.index({ userId: 1, createdAt: -1 })

export const Bid = model<BidAttributes>('Bid', bidSchema, 'bids')

export type BidDocument = HydratedDocument<BidAttributes>
