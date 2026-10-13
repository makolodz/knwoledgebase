import { model, Schema, type HydratedDocument, type Types } from 'mongoose'

export interface SessionAttributes {
  userId: Types.ObjectId
  /** SHA-256 du refresh token courant (docs/technical/security.md). */
  refreshTokenHash: string
  /** Refresh token remplacé par la dernière rotation : sert à détecter sa réutilisation. */
  previousRefreshTokenHash: string | null
  expiresAt: Date
  /** Date de la dernière rotation (la création, au départ). */
  lastUsedAt: Date
  userAgent: string | null
  createdAt: Date
}

const sessionSchema = new Schema<SessionAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true },
    previousRefreshTokenHash: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    userAgent: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

sessionSchema.index({ refreshTokenHash: 1 }, { unique: true })
sessionSchema.index({ userId: 1 })
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
sessionSchema.index(
  { previousRefreshTokenHash: 1 },
  { partialFilterExpression: { previousRefreshTokenHash: { $type: 'string' } } },
)

export const Session = model<SessionAttributes>('Session', sessionSchema, 'sessions')

export type SessionDocument = HydratedDocument<SessionAttributes>
