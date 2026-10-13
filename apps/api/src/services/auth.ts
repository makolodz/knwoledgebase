import type { CurrentUser, LoginInput, RegisterInput } from '@encheres/shared'
import { Types } from 'mongoose'
import type { Config } from '../config/env'
import { AppError } from '../errors'
import { User, type UserDocument } from '../models'
import { issueAuthToken } from './auth-tokens'
import { enqueueEmail } from './email-queue'
import { signAccessToken, verifyAccessToken } from './jwt'
import { buildWebLink } from './links'
import { hashPassword, verifyPassword } from './password'
import { createSession, revokeAllSessions, revokeSession, rotateSession } from './sessions'

/** Ce que le contexte HTTP apprend au service sur la requête. */
export interface RequestMeta {
  userAgent: string | null
}

/** Jetons à poser dans les cookies, avec l'utilisateur à renvoyer au front. */
export interface SessionTokens {
  user: CurrentUser
  accessToken: string
  refreshToken: string
}

export function toCurrentUser(user: UserDocument): CurrentUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? '',
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

async function issueTokens(
  config: Config,
  user: UserDocument,
  session: { _id: UserDocument['_id'] },
  refreshToken: string,
): Promise<SessionTokens> {
  const accessToken = await signAccessToken(config.jwtSecret, {
    userId: user._id.toString(),
    sessionId: session._id.toString(),
  })
  return { user: toCurrentUser(user), accessToken, refreshToken }
}

/**
 * Inscription (docs/domain/workflows/account.md). La réponse est la même que l'adresse soit déjà
 * utilisée ou non, et personne n'est connecté : on ne révèle jamais qu'un email existe.
 * Dans le cas d'une adresse déjà utilisée, son propriétaire reçoit un email d'avertissement.
 */
export async function register(config: Config, input: RegisterInput): Promise<void> {
  // Le hash est calculé dans les deux cas : sa durée ne trahit pas l'existence du compte.
  const passwordHash = await hashPassword(input.password)

  let user: UserDocument
  try {
    user = await User.create({
      email: input.email,
      passwordHash,
      name: input.name,
      role: 'buyer',
      acceptedTermsAt: new Date(),
    })
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error
    const existing = await User.findOne({ email: input.email })
    if (existing !== null) {
      await enqueueEmail(input.email, 'account-exists', {
        name: existing.name,
        loginLink: buildWebLink(config, '/login'),
        resetLink: buildWebLink(config, '/forgot-password'),
      })
    }
    return
  }

  const token = await issueAuthToken({ userId: user._id, type: 'email_verification' })
  await enqueueEmail(input.email, 'verify-email', {
    name: user.name,
    link: buildWebLink(config, '/verify-email', { token }),
  })
}

/**
 * Connexion. Un email inconnu et un mauvais mot de passe donnent la même erreur, un compte
 * supprimé est traité comme inconnu, et un compte suspendu n'est signalé qu'à qui connaît le mot
 * de passe. Un compte dont l'email n'est pas vérifié peut se connecter.
 */
export async function login(
  config: Config,
  input: LoginInput,
  meta: RequestMeta,
): Promise<SessionTokens> {
  const user = await User.findOne({ email: input.email })
  const passwordMatches = await verifyPassword(user?.passwordHash ?? null, input.password)
  if (user === null || !passwordMatches || user.deletedAt !== null) {
    throw new AppError('INVALID_CREDENTIALS')
  }
  if (user.suspendedAt !== null) throw new AppError('ACCOUNT_SUSPENDED')

  const { session, refreshToken } = await createSession(user._id, meta.userAgent)
  return issueTokens(config, user, session, refreshToken)
}

/**
 * Renouvelle la session à partir du refresh token : nouveau refresh token (rotation) et nouvel
 * access token. L'utilisateur est relu : un compte suspendu ou supprimé n'obtient rien.
 */
export async function refresh(
  config: Config,
  refreshToken: string | undefined,
): Promise<SessionTokens> {
  if (refreshToken === undefined || refreshToken === '') throw new AppError('NOT_AUTHENTICATED')

  const rotated = await rotateSession(refreshToken)
  const user = await User.findById(rotated.session.userId)
  if (user === null || user.deletedAt !== null || user.suspendedAt !== null) {
    await revokeAllSessions(rotated.session.userId)
    throw new AppError('NOT_AUTHENTICATED')
  }
  return issueTokens(config, user, rotated.session, rotated.refreshToken)
}

/**
 * Identifie l'utilisateur à partir de l'access token. Le token ne contient que `sub` et `sid` :
 * l'utilisateur est **relu en base**, donc un rôle changé, un compte suspendu ou supprimé
 * s'applique tout de suite (docs/technical/security.md).
 */
export async function authenticate(
  config: Config,
  accessToken: string | undefined,
): Promise<{ user: UserDocument; sessionId: string }> {
  const claims = accessToken ? await verifyAccessToken(config.jwtSecret, accessToken) : null
  if (claims === null || !Types.ObjectId.isValid(claims.userId)) {
    throw new AppError('NOT_AUTHENTICATED')
  }
  const user = await User.findById(claims.userId)
  if (user === null || user.deletedAt !== null) throw new AppError('NOT_AUTHENTICATED')
  if (user.suspendedAt !== null) throw new AppError('ACCOUNT_SUSPENDED')
  return { user, sessionId: claims.sessionId }
}

/** Déconnexion : ferme la session courante. */
export async function logout(sessionId: string): Promise<void> {
  await revokeSession(sessionId)
}
