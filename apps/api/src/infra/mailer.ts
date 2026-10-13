import { createTransport, type Transporter } from 'nodemailer'
import type { SmtpConfig } from '../config/env'

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Frontière avec le service d'envoi (ADR-006). Le code métier ne parle jamais à SMTP : il ajoute
 * un email à la file, et le job d'envoi appelle `send`. Les tests remplacent cette interface.
 */
export interface Mailer {
  /** Rejette si l'email n'a pas été accepté par le serveur SMTP. */
  send(message: MailMessage): Promise<void>
}

export function createMailer(transport: Transporter, from: string): Mailer {
  return {
    async send({ to, subject, html, text }) {
      await transport.sendMail({ from, to, subject, html, text })
    },
  }
}

/** Mailpit en développement, Brevo en production : seule la configuration change. */
export function createSmtpMailer(smtp: SmtpConfig): Mailer {
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    // Le port 465 est en TLS dès la connexion ; les autres passent en STARTTLS si le serveur le propose.
    secure: smtp.port === 465,
    // Des identifiants ne partent jamais en clair.
    requireTLS: smtp.auth !== null,
    ...(smtp.auth === null ? {} : { auth: { user: smtp.auth.user, pass: smtp.auth.password } }),
    // Le job d'envoi ne doit pas rester bloqué sur un serveur qui ne répond plus.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return createMailer(transport, smtp.from)
}
