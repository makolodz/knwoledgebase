import {
  EMAIL_TEMPLATES,
  type EmailTemplateData,
  type EmailTemplateName,
} from '../emails/templates'
import { Email } from '../models'

/**
 * Ajoute un email à la file d'envoi (ADR-006). Un service n'envoie jamais d'email directement :
 * le job `send-emails` s'en charge, avec des réessais. Les données sont validées ici pour qu'une
 * erreur de code se voie tout de suite, et non au moment de l'envoi.
 */
export async function enqueueEmail<Name extends EmailTemplateName>(
  to: string,
  templateName: Name,
  data: EmailTemplateData<Name>,
): Promise<void> {
  // Les schémas des modèles sont tous des objets.
  const parsed = EMAIL_TEMPLATES[templateName].schema.parse(data) as Record<string, unknown>
  await Email.create({ to, template: templateName, data: parsed })
}
