import type { ResetPasswordInput } from '@encheres/shared'
import type { Config } from '../config/env'
import { AppError } from '../errors'
import { User } from '../models'
import { consumeAuthToken, issueAuthToken } from './auth-tokens'
import { enqueueEmail } from './email-queue'
import { buildWebLink } from './links'
import { hashPassword } from './password'
import { revokeAllSessions } from './sessions'

/**
 * Mot de passe oublié. Ne renvoie jamais rien sur l'existence du compte : l'appelant donne la
 * même réponse dans tous les cas. Un compte suspendu ou supprimé ne reçoit pas de lien.
 * Un nouveau lien invalide le précédent.
 */
export async function requestPasswordReset(config: Config, email: string): Promise<void> {
  const user = await User.findOne({ email, deletedAt: null, suspendedAt: null })
  if (user === null) return

  const token = await issueAuthToken({ userId: user._id, type: 'password_reset' })
  await enqueueEmail(email, 'password-reset', {
    name: user.name,
    link: buildWebLink(config, '/reset-password', { token }),
  })
}

/**
 * Choisit un nouveau mot de passe avec le lien reçu (1 h, une seule fois). Toutes les sessions
 * sont fermées, y compris celles d'un éventuel intrus, et un email de confirmation part.
 * L'utilisateur n'est pas connecté pour autant.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const consumed = await consumeAuthToken(input.token, { type: 'password_reset' })

  const user = await User.findOne({ _id: consumed.userId, deletedAt: null, suspendedAt: null })
  if (user === null || user.email === null) throw new AppError('TOKEN_INVALID')

  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash: await hashPassword(input.password) } },
  )
  await revokeAllSessions(user._id)
  await enqueueEmail(user.email, 'password-changed', { name: user.name })
}
