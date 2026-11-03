import { AUCTION_STATUSES, type AuctionStatus } from '@encheres/shared'
import { model, Schema, type HydratedDocument, type Types } from 'mongoose'

/** Champs de docs/technical/database.md ; les montants sont en centimes, les dates en UTC. */
export interface AuctionAttributes {
  sellerId: Types.ObjectId
  title: string
  description: string
  /** Clés (UUID) des photos stockées sur disque, jamais d'URL (ADR-007). */
  images: string[]
  startingPrice: number
  minIncrement: number
  currentPrice: number | null
  currentBidderId: Types.ObjectId | null
  nextMinBid: number
  bidCount: number
  startsAt: Date
  endsAt: Date
  status: AuctionStatus
  winnerId: Types.ObjectId | null
  paymentDeadline: Date | null
  paymentReminderSentAt: Date | null
  cancelReason: string | null
  createdAt: Date
}

const auctionSchema = new Schema<AuctionAttributes>(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    images: { type: [String], required: true },
    startingPrice: { type: Number, required: true },
    minIncrement: { type: Number, required: true },
    currentPrice: { type: Number, default: null },
    currentBidderId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    nextMinBid: { type: Number, required: true },
    bidCount: { type: Number, required: true, default: 0 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: { type: String, enum: AUCTION_STATUSES, required: true, default: 'draft' },
    winnerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paymentDeadline: { type: Date, default: null },
    paymentReminderSentAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Index des jobs (ouverture, clôture, paiement) et des listes.
auctionSchema.index({ status: 1, startsAt: 1 })
auctionSchema.index({ status: 1, endsAt: 1 })
auctionSchema.index({ status: 1, paymentDeadline: 1 })
auctionSchema.index({ sellerId: 1, createdAt: -1 })

export const Auction = model<AuctionAttributes>('Auction', auctionSchema, 'auctions')

export type AuctionDocument = HydratedDocument<AuctionAttributes>
