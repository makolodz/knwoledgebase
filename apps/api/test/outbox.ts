import { createHash } from 'node:crypto'
import { AuthToken, Email, type EmailDocument } from '../src/models'

/** Emails de la file, du plus ancien au plus récent, éventuellement filtrés. */
export function queuedEmails(filter: { to?: string; template?: string } = {}) {
  return Email.find(filter).sort({ _id: 1 })
}

/** Le token du lien contenu dans un email de la file (`?token=…`). */
export function tokenOf(email: EmailDocument): string {
  const link = (email.data as { link?: string }).link
  const token = link === undefined ? null : new URL(link).searchParams.get('token')
  if (token === null) throw new Error(`Pas de lien avec token dans l'email ${email.template}`)
  return token
}

/** Le token du dernier email d'un modèle donné, tel qu'un utilisateur le lirait dans sa boîte. */
export async function lastTokenOf(template: string, to?: string): Promise<string> {
  const emails = await queuedEmails({ template, ...(to === undefined ? {} : { to }) })
  const last = emails.at(-1)
  if (last === undefined) throw new Error(`Aucun email ${template} dans la file`)
  return tokenOf(last)
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Le document `authTokens` correspondant à un token reçu par email. */
export function authTokenFor(token: string) {
  return AuthToken.findOne({ tokenHash: sha256(token) })
}
