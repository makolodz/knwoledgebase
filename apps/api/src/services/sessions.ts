import type { Types } from 'mongoose'
import { AppError } from '../errors'
import { Session, type SessionDocument } from '../models'
import { generateToken, hashToken } from './tokens'

const DAY_MS = 24 * 60 * 60 * 1000

/** Durée de vie du refresh token (docs/technical/security.md). */
export const REFRESH_TOKEN_TTL_MS = 30 * DAY_MS

/**
 * Délai pendant lequel la présentation du refresh token qui vient d'être remplacé n'est qu'un
 * conflit, et non un vol : deux onglets peuvent rafraîchir en même temps (ADR-014).
 */
export const REFRESH_GRACE_MS = 10_000

const MAX_USER_AGENT_LENGTH = 256

export interface IssuedSession {
  session: SessionDocument
  /** Valeur du refresh token, à mettre dans le cookie. Seul son hash est stocké. */
  refreshToken: string
}

export async function createSession(
  userId: Types.ObjectId,
  userAgent: string | null,
): Promise<IssuedSession> {
  const now = new Date()
  const refreshToken = generateToken()
  const session = await Session.create({
    userId,
    refreshTokenHash: hashToken(refreshToken),
    previousRefreshTokenHash: null,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    lastUsedAt: now,
    userAgent: userAgent === null ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH),
  })
  return { session, refreshToken }
}

/**
 * Remplace un refresh token par un nouveau (rotation). Une seule mise à jour conditionnelle :
 * de deux requêtes simultanées avec le même token, une seule réussit.
 *
 * - Token inconnu ou expiré : `NOT_AUTHENTICATED`.
 * - Token déjà remplacé, depuis moins de `REFRESH_GRACE_MS` : `REFRESH_CONFLICT`, sans rien révoquer
 *   (l'autre requête a déjà renouvelé le cookie).
 * - Token déjà remplacé depuis plus longtemps : probablement volé, toutes les sessions de
 *   l'utilisateur sont révoquées.
 */
export async function rotateSession(
  refreshToken: string,
): Promise<{ session: SessionDocument; refreshToken: string }> {
  const now = new Date()
  const presentedHash = hashToken(refreshToken)
  const nextToken = generateToken()

  const session = await Session.findOneAndUpdate(
    { refreshTokenHash: presentedHash, expiresAt: { $gt: now } },
    {
      $set: {
        refreshTokenHash: hashToken(nextToken),
        previousRefreshTokenHash: presentedHash,
        lastUsedAt: now,
      },
    },
    { returnDocument: 'after' },
  )
  if (session !== null) return { session, refreshToken: nextToken }

  const reused = await Session.findOne({ previousRefreshTokenHash: presentedHash })
  if (reused !== null) {
    if (now.getTime() - reused.lastUsedAt.getTime() < REFRESH_GRACE_MS) {
      throw new AppError('REFRESH_CONFLICT')
    }
    await revokeAllSessions(reused.userId)
  }
  throw new AppError('NOT_AUTHENTICATED')
}

/** Ferme une session (déconnexion). */
export async function revokeSession(sessionId: Types.ObjectId | string): Promise<void> {
  await Session.deleteOne({ _id: sessionId })
}

/** Ferme les sessions d'un utilisateur, sauf éventuellement une (mot de passe changé). */
export async function revokeAllSessions(
  userId: Types.ObjectId,
  except?: Types.ObjectId | string,
): Promise<void> {
  await Session.deleteMany({ userId, ...(except === undefined ? {} : { _id: { $ne: except } }) })
}
