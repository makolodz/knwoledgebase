import { renderEmail } from '../emails/templates'
import type { Mailer } from '../infra/mailer'
import { Email } from '../models'

/** Nombre maximal d'envois d'un même email ; au-delà il passe à `failed` (ADR-006). */
export const MAX_ATTEMPTS = 5

const MINUTE_MS = 60_000

/** Délai avant la tentative suivante, selon le nombre de tentatives déjà faites (délai croissant). */
export const RETRY_DELAYS_MS = [1 * MINUTE_MS, 5 * MINUTE_MS, 30 * MINUTE_MS, 120 * MINUTE_MS]

/**
 * Quand le job prend un email en charge, `sendAfter` est repoussé de ce délai : un second passage
 * ou une autre instance ne le prend pas pendant l'envoi, et il est réessayé si le processus meurt
 * sans avoir terminé.
 */
export const CLAIM_MS = 5 * MINUTE_MS

const MAX_ERROR_LENGTH = 300

export interface SendEmailsLogger {
  warn(object: object, message: string): void
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, MAX_ERROR_LENGTH)
}

/**
 * Envoie les emails `pending` dont l'heure est venue, un par un, jusqu'à ce qu'il n'y en ait plus
 * (ADR-006 et ADR-008). Chaque email est pris par une mise à jour atomique : un seul passage
 * l'envoie, même si deux passages se chevauchent. Renvoie le nombre d'emails envoyés.
 */
export async function sendPendingEmails(mailer: Mailer, log: SendEmailsLogger): Promise<number> {
  let sent = 0

  for (;;) {
    const now = new Date()
    const email = await Email.findOneAndUpdate(
      { status: 'pending', sendAfter: { $lte: now } },
      { $set: { sendAfter: new Date(now.getTime() + CLAIM_MS) }, $inc: { attempts: 1 } },
      { sort: { sendAfter: 1 }, returnDocument: 'after' },
    )
    if (email === null) return sent

    let rendered
    try {
      rendered = renderEmail(email.template, email.data)
    } catch (error) {
      // Modèle inconnu ou données invalides : réessayer ne changerait rien.
      await Email.updateOne(
        { _id: email._id },
        { $set: { status: 'failed', lastError: describeError(error) } },
      )
      log.warn({ emailId: email._id.toString() }, 'Email inenvoyable, abandonné')
      continue
    }

    try {
      await mailer.send({ to: email.to, ...rendered })
    } catch (error) {
      const retryDelay = RETRY_DELAYS_MS[email.attempts - 1]
      const exhausted = email.attempts >= MAX_ATTEMPTS || retryDelay === undefined
      await Email.updateOne(
        { _id: email._id },
        {
          $set: {
            lastError: describeError(error),
            ...(exhausted
              ? { status: 'failed' }
              : { sendAfter: new Date(Date.now() + retryDelay) }),
          },
        },
      )
      log.warn(
        { emailId: email._id.toString(), attempts: email.attempts, abandoned: exhausted },
        'Envoi d’email échoué',
      )
      continue
    }

    // Le lien contenait un token en clair : on vide les paramètres dès que l'email est parti.
    await Email.updateOne(
      { _id: email._id },
      { $set: { status: 'sent', sentAt: new Date(), lastError: null, data: {} } },
    )
    sent += 1
  }
}
