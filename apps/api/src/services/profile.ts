import type { ChangeEmailInput, ChangePasswordInput } from '@encheres/shared'
import type { Config } from '../config/env'
import { AppError } from '../errors'
import { User, type UserDocument } from '../models'
import { consumeAuthToken, discardPendingAuthTokens, issueAuthToken } from './auth-tokens'
import { enqueueEmail } from './email-queue'
import { buildWebLink } from './links'
import { hashPassword, verifyPassword } from './password'
import type { RateLimits } from './rate-limits'
import { revokeAllSessions } from './sessions'

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

type PasswordLimits = Pick<RateLimits, 'passwordCheck'>

/**
 * Une opération sensible redemande le mot de passe actuel (docs/domain/workflows/account.md).
 * Les mots de passe refusés sont limités par utilisateur : une session volée ne doit pas
 * permettre de deviner le mot de passe.
 */
async function requireCurrentPassword(
  user: UserDocument,
  password: string,
  limits: PasswordLimits,
): Promise<void> {
  const key = user._id.toString()
  limits.passwordCheck.assertAllowed(key)
  if (!(await verifyPassword(user.passwordHash, password))) {
    limits.passwordCheck.record(key)
    throw new AppError('INVALID_CREDENTIALS')
  }
  limits.passwordCheck.reset(key)
}

export async function updateName(user: UserDocument, name: string): Promise<UserDocument> {
  user.name = name
  return user.save()
}

/**
 * Change le mot de passe. Les autres sessions sont fermées, la session courante reste ouverte.
 * Les liens de réinitialisation en attente deviennent inutilisables.
 */
export async function changePassword(
  user: UserDocument,
  sessionId: string,
  input: ChangePasswordInput,
  limits: PasswordLimits,
): Promise<void> {
  await requireCurrentPassword(user, input.currentPassword, limits)

  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(input.newPassword) } },
  )
  await revokeAllSessions(user._id, sessionId)
  await discardPendingAuthTokens(user._id, 'password_reset')
  if (user.email !== null) await enqueueEmail(user.email, 'password-changed', { name: user.name })
}

/**
 * Demande de changement d'adresse. Un lien part vers la **nouvelle** adresse, et l'adresse du
 * compte ne change qu'après le clic. Si la nouvelle adresse a déjà un compte, la réponse est la
 * même mais rien n'est envoyé : on ne révèle pas qu'un email existe.
 */
export async function requestEmailChange(
  config: Config,
  user: UserDocument,
  input: ChangeEmailInput,
  limits: PasswordLimits,
): Promise<void> {
  await requireCurrentPassword(user, input.currentPassword, limits)

  if (input.newEmail === user.email) return
  if ((await User.exists({ email: input.newEmail })) !== null) return

  const token = await issueAuthToken({
    userId: user._id,
    type: 'email_change',
    newEmail: input.newEmail,
  })
  await enqueueEmail(input.newEmail, 'email-change-confirm', {
    name: user.name,
    link: buildWebLink(config, '/verify-email', { token, kind: 'email-change' }),
  })
}

/**
 * Confirme le changement d'adresse avec le lien reçu à la nouvelle adresse (24 h, une seule
 * fois). Le clic prouve que la boîte est la bonne : l'adresse est donc marquée vérifiée.
 * L'ancienne adresse est prévenue.
 */
export async function confirmEmailChange(user: UserDocument, token: string): Promise<UserDocument> {
  const consumed = await consumeAuthToken(token, { type: 'email_change', userId: user._id })
  if (consumed.newEmail === null) throw new AppError('TOKEN_INVALID')

  const previousEmail = user.email
  let updated: UserDocument | null
  try {
    updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { email: consumed.newEmail, emailVerifiedAt: new Date() } },
      { returnDocument: 'after' },
    )
  } catch (error) {
    // L'adresse a été prise par un autre compte entre la demande et le clic.
    if (isDuplicateKeyError(error)) throw new AppError('TOKEN_INVALID')
    throw error
  }
  if (updated === null) throw new AppError('TOKEN_INVALID')

  await discardPendingAuthTokens(user._id, 'email_verification')
  if (previousEmail !== null) {
    await enqueueEmail(previousEmail, 'email-change-notice', {
      name: user.name,
      newEmail: consumed.newEmail,
    })
  }
  return updated
}
