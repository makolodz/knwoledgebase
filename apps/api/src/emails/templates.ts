import { z } from 'zod'
import { composeEmail, type RenderedEmail } from './layout'

/** Seuls http et https : un lien `javascript:` ne doit jamais finir dans un `href`. */
const linkSchema = z.url({ protocol: /^https?$/ })

const nameSchema = z.string().min(1)

interface EmailTemplate<Schema extends z.ZodType> {
  schema: Schema
  render(data: z.infer<Schema>): RenderedEmail
}

/** Aide à l'inférence : le schéma et la fonction de rendu partagent le même type de données. */
function template<Schema extends z.ZodType>(definition: EmailTemplate<Schema>) {
  return definition
}

/**
 * Modèles d'email (ADR-006). Les paramètres sont relus depuis la base : ils sont revalidés à
 * l'ajout dans la file puis au rendu. Aucune donnée de l'utilisateur dans l'objet (sujet).
 */
export const EMAIL_TEMPLATES = {
  /** Après l'inscription : lien valable 24 h (docs/domain/workflows/account.md). */
  'verify-email': template({
    schema: z.object({ name: nameSchema, link: linkSchema }),
    render: ({ name, link }) =>
      composeEmail({
        subject: 'Vérifiez votre adresse email',
        greeting: `Bonjour ${name},`,
        paragraphs: [
          'Merci de votre inscription. Pour pouvoir enchérir, vérifiez votre adresse email.',
          'Ce lien est valable 24 heures et ne peut servir qu’une fois.',
        ],
        action: { label: 'Vérifier mon adresse', url: link },
        footer: 'Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message.',
      }),
  }),

  /** Inscription avec une adresse déjà utilisée : on prévient le propriétaire du compte. */
  'account-exists': template({
    schema: z.object({ name: nameSchema, loginLink: linkSchema, resetLink: linkSchema }),
    render: ({ name, loginLink, resetLink }) =>
      composeEmail({
        subject: 'Tentative de création de compte avec votre adresse',
        greeting: `Bonjour ${name},`,
        paragraphs: [
          'Quelqu’un vient d’essayer de créer un compte avec votre adresse email. Vous en avez déjà un : rien n’a été modifié.',
          `Mot de passe oublié ? Vous pouvez le réinitialiser ici : ${resetLink}`,
        ],
        action: { label: 'Me connecter', url: loginLink },
        footer: 'Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer ce message.',
      }),
  }),

  /** Mot de passe oublié : lien valable 1 h. */
  'password-reset': template({
    schema: z.object({ name: nameSchema, link: linkSchema }),
    render: ({ name, link }) =>
      composeEmail({
        subject: 'Réinitialisation de votre mot de passe',
        greeting: `Bonjour ${name},`,
        paragraphs: [
          'Vous avez demandé à réinitialiser votre mot de passe.',
          'Ce lien est valable 1 heure et ne peut servir qu’une fois.',
        ],
        action: { label: 'Choisir un nouveau mot de passe', url: link },
        footer: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
      }),
  }),

  /** Après une réinitialisation ou un changement de mot de passe. */
  'password-changed': template({
    schema: z.object({ name: nameSchema }),
    render: ({ name }) =>
      composeEmail({
        subject: 'Votre mot de passe a été modifié',
        greeting: `Bonjour ${name},`,
        paragraphs: [
          'Le mot de passe de votre compte vient d’être modifié. Vos autres sessions ont été fermées.',
        ],
        footer:
          'Si vous n’êtes pas à l’origine de ce changement, réinitialisez votre mot de passe sans attendre et contactez l’association.',
      }),
  }),

  /** Envoyé à la nouvelle adresse : l'email ne change qu'après le clic (24 h). */
  'email-change-confirm': template({
    schema: z.object({ name: nameSchema, link: linkSchema }),
    render: ({ name, link }) =>
      composeEmail({
        subject: 'Confirmez votre nouvelle adresse email',
        greeting: `Bonjour ${name},`,
        paragraphs: [
          'Vous avez demandé à utiliser cette adresse pour votre compte. Confirmez-la pour finaliser le changement.',
          'Ce lien est valable 24 heures et ne peut servir qu’une fois.',
        ],
        action: { label: 'Confirmer cette adresse', url: link },
        footer: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
      }),
  }),

  /** Envoyé à l'ancienne adresse quand le changement a eu lieu. */
  'email-change-notice': template({
    schema: z.object({ name: nameSchema, newEmail: z.string().min(1) }),
    render: ({ name, newEmail }) =>
      composeEmail({
        subject: 'L’adresse email de votre compte a changé',
        greeting: `Bonjour ${name},`,
        paragraphs: [`Votre compte utilise désormais l’adresse ${newEmail}.`],
        footer:
          'Si vous n’êtes pas à l’origine de ce changement, contactez l’association sans attendre.',
      }),
  }),
}

export type EmailTemplateName = keyof typeof EMAIL_TEMPLATES

export type EmailTemplateData<Name extends EmailTemplateName> = z.infer<
  (typeof EMAIL_TEMPLATES)[Name]['schema']
>

export function isEmailTemplateName(name: string): name is EmailTemplateName {
  return Object.hasOwn(EMAIL_TEMPLATES, name)
}

/**
 * Rend un email à partir de ce qui est stocké dans la file. Lève une erreur si le modèle est
 * inconnu ou si les données sont invalides : l'email est alors inenvoyable, inutile de réessayer.
 */
export function renderEmail(templateName: string, data: unknown): RenderedEmail {
  if (!isEmailTemplateName(templateName)) {
    throw new Error(`Modèle d'email inconnu : ${templateName}`)
  }
  const definition = EMAIL_TEMPLATES[templateName]
  const parsed = definition.schema.parse(data) as never
  return definition.render(parsed)
}
