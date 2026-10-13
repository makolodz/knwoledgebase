import { USER_ROLES, type UserRole } from '@encheres/shared'
import { model, Schema, type HydratedDocument } from 'mongoose'

export interface UserAttributes {
  /** Normalisé (minuscules, sans espaces) ; `null` pour un compte anonymisé. */
  email: string | null
  /** `null` pour un compte anonymisé. Ne jamais l'inclure dans une réponse. */
  passwordHash: string | null
  /** Nom d'affichage public. */
  name: string
  role: UserRole
  emailVerifiedAt: Date | null
  acceptedTermsAt: Date
  suspendedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
}

const userSchema = new Schema<UserAttributes>(
  {
    email: { type: String, trim: true, lowercase: true, default: null },
    passwordHash: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: USER_ROLES, required: true, default: 'buyer' },
    emailVerifiedAt: { type: Date, default: null },
    acceptedTermsAt: { type: Date, required: true },
    suspendedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Unique seulement pour une vraie adresse : plusieurs comptes anonymisés ont `email: null`
// (docs/technical/database.md).
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
)

export const User = model<UserAttributes>('User', userSchema, 'users')

export type UserDocument = HydratedDocument<UserAttributes>
