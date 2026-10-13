import type { Transporter } from 'nodemailer'
import { describe, expect, it, vi } from 'vitest'
import { createMailer } from './mailer'

function fakeTransport(sendMail: Transporter['sendMail']): Transporter {
  return { sendMail } as unknown as Transporter
}

describe('T2.28 — mailer', () => {
  it('transmet l’expéditeur configuré, le destinataire, le sujet et les deux versions du message', async () => {
    const sendMail = vi.fn().mockResolvedValue({})
    const mailer = createMailer(fakeTransport(sendMail), 'Enchères <no-reply@encheres.example>')

    await mailer.send({ to: 'ana@x.fr', subject: 'Sujet', html: '<p>Bonjour</p>', text: 'Bonjour' })

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Enchères <no-reply@encheres.example>',
      to: 'ana@x.fr',
      subject: 'Sujet',
      html: '<p>Bonjour</p>',
      text: 'Bonjour',
    })
  })

  it('rejette quand le serveur SMTP refuse, pour que la file réessaie', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('Connexion SMTP refusée'))
    const mailer = createMailer(fakeTransport(sendMail), 'no-reply@encheres.example')

    await expect(
      mailer.send({ to: 'ana@x.fr', subject: 'Sujet', html: '<p>.</p>', text: '.' }),
    ).rejects.toThrow('Connexion SMTP refusée')
  })
})
