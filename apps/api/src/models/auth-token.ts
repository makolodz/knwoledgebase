import { model, Schema, type HydratedDocument, type Types } from 'mongoose'

export const AUTH_TOKEN_TYPES = ['email_verification', 'password_reset', 'email_change'] as const

export type AuthTokenType = (typeof AUTH_TOKEN_TYPES)[number]

export interface AuthTokenAttributes {
  userId: Types.ObjectId
  type: AuthTokenType
  /** SHA-256 du token. Le token lui-même n'est jamais stocké (docs/domain/workflows/account.md). */
  tokenHash: string
  /** Nouvelle adresse, seulement pour `email_change`. */
  newEmail: string | null
  expiresAt: Date
  /** Renseigné à la consommation : un token ne sert qu'une fois. */
  usedAt: Date | null
  createdAt: Date
}

const authTokenSchema = new Schema<AuthTokenAttributes>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
    tokenHash: { type: String, required: true },
    newEmail: { type: String, trim: true, lowercase: true, default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

authTokenSchema.index({ tokenHash: 1 }, { unique: true })
// MongoDB purge les tokens expirés (le contrôle de validité reste fait par les requêtes : la
// purge n'a lieu qu'une fois par minute).
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// « Le dernier token de cet utilisateur et de ce type » : renvoi limité à 1 par minute.
authTokenSchema.index({ userId: 1, type: 1, createdAt: -1 })

export const AuthToken = model<AuthTokenAttributes>('AuthToken', authTokenSchema, 'authTokens')

export type AuthTokenDocument = HydratedDocument<AuthTokenAttributes>
