import type { Config } from '../config/env'
import { AppError } from '../errors'
import { AuthToken, User, type UserDocument } from '../models'
import { consumeAuthToken, issueAuthToken } from './auth-tokens'
import { enqueueEmail } from './email-queue'
import { buildWebLink } from './links'

/** Délai minimal entre deux demandes de lien de vérification (docs/domain/workflows/account.md). */
export const RESEND_VERIFICATION_DELAY_MS = 60_000

/**
 * Valide l'adresse email grâce au lien reçu. Le lien est à usage unique : un second clic, un lien
 * expiré ou inconnu donnent tous `TOKEN_INVALID`.
 */
export async function verifyEmail(token: string): Promise<void> {
  const consumed = await consumeAuthToken(token, { type: 'email_verification' })

  const user = await User.findOne({ _id: consumed.userId, deletedAt: null })
  if (user === null) throw new AppError('TOKEN_INVALID')
  if (user.emailVerifiedAt === null) {
    await User.updateOne(
      { _id: user._id, emailVerifiedAt: null },
      { $set: { emailVerifiedAt: new Date() } },
    )
  }
}

/**
 * Envoie un nouveau lien de vérification, au plus un par minute. Il invalide le précédent.
 * Renvoie `already_verified` quand il n'y a rien à vérifier.
 */
export async function resendVerification(
  config: Config,
  user: UserDocument,
): Promise<'sent' | 'already_verified'> {
  if (user.emailVerifiedAt !== null || user.email === null) return 'already_verified'

  const latest = await AuthToken.findOne({ userId: user._id, type: 'email_verification' }).sort({
    createdAt: -1,
  })
  if (latest !== null && Date.now() - latest.createdAt.getTime() < RESEND_VERIFICATION_DELAY_MS) {
    throw new AppError('RATE_LIMITED')
  }

  const token = await issueAuthToken({ userId: user._id, type: 'email_verification' })
  await enqueueEmail(user.email, 'verify-email', {
    name: user.name,
    link: buildWebLink(config, '/verify-email', { token }),
  })
  return 'sent'
}
