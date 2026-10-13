import { model, Schema, type HydratedDocument } from 'mongoose'

export const EMAIL_STATUSES = ['pending', 'sent', 'failed'] as const

export type EmailStatus = (typeof EMAIL_STATUSES)[number]

/** File d'envoi (ADR-006) : un service ajoute un document, le job l'envoie. */
export interface EmailAttributes {
  to: string
  /** Nom du modèle d'email (`apps/api/src/emails/`). */
  template: string
  /** Paramètres du modèle. Peut contenir un lien avec un token : vidé dès l'envoi réussi. */
  data: Record<string, unknown>
  status: EmailStatus
  attempts: number
  lastError: string | null
  /** Pas d'envoi avant cette date (réessais, et prise en charge par le job). */
  sendAfter: Date
  sentAt: Date | null
  createdAt: Date
}

const emailSchema = new Schema<EmailAttributes>(
  {
    to: { type: String, required: true },
    template: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    status: { type: String, enum: EMAIL_STATUSES, required: true, default: 'pending' },
    attempts: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null },
    sendAfter: { type: Date, required: true, default: () => new Date() },
    sentAt: { type: Date, default: null },
  },
  // `minimize: false` : un `data` vide reste `{}` au lieu de disparaître.
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
)

emailSchema.index({ status: 1, sendAfter: 1 })

export const Email = model<EmailAttributes>('Email', emailSchema, 'emails')

export type EmailDocument = HydratedDocument<EmailAttributes>
