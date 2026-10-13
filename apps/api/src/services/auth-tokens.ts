import type { Types } from 'mongoose'
import { AuthToken, type AuthTokenType } from '../models'
import { generateToken, hashToken } from './tokens'

const HOUR_MS = 60 * 60 * 1000

/** Durée de validité de chaque type de lien (docs/domain/workflows/account.md). */
export const AUTH_TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  email_verification: 24 * HOUR_MS,
  password_reset: 1 * HOUR_MS,
  email_change: 24 * HOUR_MS,
}

interface IssueOptions {
  userId: Types.ObjectId
  type: AuthTokenType
  /** Nouvelle adresse, pour `email_change` seulement. */
  newEmail?: string
}

/**
 * Crée un token à usage unique et renvoie sa valeur, à mettre dans le lien envoyé. Seul son hash
 * est stocké. Un nouveau lien invalide le précédent du même type, s'il n'a pas servi.
 */
export async function issueAuthToken({ userId, type, newEmail }: IssueOptions): Promise<string> {
  await AuthToken.deleteMany({ userId, type, usedAt: null })

  const token = generateToken()
  await AuthToken.create({
    userId,
    type,
    tokenHash: hashToken(token),
    newEmail: newEmail ?? null,
    expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS[type]),
  })
  return token
}
