import { describe, expect, it, vi } from 'vitest'
import { CLAIM_MS, MAX_ATTEMPTS, RETRY_DELAYS_MS, sendPendingEmails } from '../src/jobs/send-emails'
import { Email } from '../src/models'
import { enqueueEmail } from '../src/services/email-queue'
import { useTestDb } from './db'
import { createFakeMailer } from './mailer'

useTestDb()

const TOKEN = 'jeton-secret-0123456789'
const LINK = `https://encheres.example/verify-email?token=${TOKEN}`

function log() {
  return { warn: vi.fn() }
}

async function queueVerification(to = 'ana@x.fr') {
  await enqueueEmail(to, 'verify-email', { name: 'Ana', link: LINK })
  const email = await Email.findOne({ to }).orFail()
  return email._id
}

/** Fait « passer le temps » : l'email redevient éligible sans attendre le délai de réessai. */
async function makeDue(id: unknown) {
  await Email.updateOne({ _id: id }, { $set: { sendAfter: new Date(Date.now() - 1) } })
}

describe('T2.25 — file d’envoi', () => {
  it('ajoute un email en attente avec ses paramètres validés', async () => {
    await enqueueEmail('ana@x.fr', 'verify-email', { name: 'Ana', link: LINK })

    const email = await Email.findOne().orFail()
    expect(email).toMatchObject({
      to: 'ana@x.fr',
      template: 'verify-email',
      status: 'pending',
      attempts: 0,
      data: { name: 'Ana', link: LINK },
    })
  })

  it('refuse des paramètres invalides, et n’ajoute rien', async () => {
    await expect(
      enqueueEmail('ana@x.fr', 'verify-email', { name: 'Ana', link: 'javascript:alert(1)' }),
    ).rejects.toThrow()

    expect(await Email.countDocuments()).toBe(0)
  })

  it('ne garde dans la file que les champs prévus par le modèle', async () => {
    const data = { name: 'Ana', link: LINK, motDePasse: 'ne-doit-pas-etre-stocke' }

    await enqueueEmail('ana@x.fr', 'verify-email', data)

    const email = await Email.findOne().orFail()
    expect(email.data).toEqual({ name: 'Ana', link: LINK })
  })
})

describe('T2.26 — job d’envoi des emails', () => {
  it('envoie l’email en attente avec le contenu du modèle, puis le marque envoyé', async () => {
    const { mailer, send } = createFakeMailer()
    const id = await queueVerification()

    const sent = await sendPendingEmails(mailer, log())

    expect(sent).toBe(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@x.fr',
        subject: 'Vérifiez votre adresse email',
        text: expect.stringContaining(LINK) as string,
        html: expect.stringContaining(LINK) as string,
      }),
    )
    const email = await Email.findById(id).orFail()
    expect(email).toMatchObject({ status: 'sent', attempts: 1, lastError: null })
    expect(email.sentAt).toBeInstanceOf(Date)
  })

  it('vide les paramètres dès l’envoi : le token en clair ne reste pas en base', async () => {
    const { mailer } = createFakeMailer()
    const id = await queueVerification()

    await sendPendingEmails(mailer, log())

    const raw = await Email.collection.findOne({ _id: id })
    expect(raw).toHaveProperty('data', {})
    expect(JSON.stringify(raw)).not.toContain(TOKEN)
  })

  it('n’envoie pas deux fois le même email', async () => {
    const { mailer, send } = createFakeMailer()
    await queueVerification()

    await sendPendingEmails(mailer, log())
    const second = await sendPendingEmails(mailer, log())

    expect(second).toBe(0)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('n’envoie pas un email avant son heure', async () => {
    const { mailer, send } = createFakeMailer()
    const id = await queueVerification()
    await Email.updateOne({ _id: id }, { $set: { sendAfter: new Date(Date.now() + 60_000) } })

    expect(await sendPendingEmails(mailer, log())).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('en cas d’échec, réessaie avec un délai croissant puis abandonne à la cinquième tentative', async () => {
    const { mailer, send } = createFakeMailer()
    send.mockRejectedValue(new Error('Serveur SMTP indisponible'))
    const id = await queueVerification()

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      const before = Date.now()
      expect(await sendPendingEmails(mailer, log())).toBe(0)
      const after = Date.now()

      const email = await Email.findById(id).orFail()
      expect(email).toMatchObject({
        status: 'pending',
        attempts: attempt,
        lastError: 'Serveur SMTP indisponible',
      })
      const delay = RETRY_DELAYS_MS[attempt - 1] as number
      expect(email.sendAfter.getTime()).toBeGreaterThanOrEqual(before + delay)
      expect(email.sendAfter.getTime()).toBeLessThanOrEqual(after + delay)

      // Tant que le délai n'est pas écoulé, l'email n'est pas retenté.
      expect(await sendPendingEmails(mailer, log())).toBe(0)
      expect(send).toHaveBeenCalledTimes(attempt)
      await makeDue(id)
    }

    await sendPendingEmails(mailer, log())
    expect(await Email.findById(id).orFail()).toMatchObject({
      status: 'failed',
      attempts: MAX_ATTEMPTS,
    })

    // Un email abandonné n'est plus jamais pris en charge.
    await makeDue(id)
    await sendPendingEmails(mailer, log())
    expect(send).toHaveBeenCalledTimes(MAX_ATTEMPTS)
  })

  it('envoie l’email à la tentative suivante quand le serveur SMTP revient', async () => {
    const { mailer, send } = createFakeMailer()
    send.mockRejectedValueOnce(new Error('Serveur SMTP indisponible'))
    const id = await queueVerification()

    await sendPendingEmails(mailer, log())
    await makeDue(id)
    const sent = await sendPendingEmails(mailer, log())

    expect(sent).toBe(1)
    expect(await Email.findById(id).orFail()).toMatchObject({
      status: 'sent',
      attempts: 2,
      lastError: null,
      data: {},
    })
  })

  it('prend l’email en charge pour la durée d’un envoi : un second passage ne le voit pas', async () => {
    const { mailer } = createFakeMailer()
    const id = await queueVerification()
    const before = Date.now()

    await sendPendingEmails(
      {
        async send() {
          const claimed = await Email.findById(id).orFail()
          expect(claimed.sendAfter.getTime()).toBeGreaterThanOrEqual(before + CLAIM_MS)
          expect(await sendPendingEmails(mailer, log())).toBe(0)
        },
      },
      log(),
    )

    expect(await Email.findById(id).orFail()).toMatchObject({ status: 'sent', attempts: 1 })
  })

  it('abandonne tout de suite un email dont le modèle est inconnu ou les paramètres invalides', async () => {
    const { mailer, send } = createFakeMailer()
    await Email.create({ to: 'a@x.fr', template: 'inexistant', data: {} })
    await Email.create({
      to: 'b@x.fr',
      template: 'verify-email',
      data: { name: 'Ana', link: 'javascript:alert(1)' },
    })

    expect(await sendPendingEmails(mailer, log())).toBe(0)

    expect(send).not.toHaveBeenCalled()
    const emails = await Email.find().sort({ to: 1 })
    expect(emails.map((email) => [email.status, email.attempts])).toEqual([
      ['failed', 1],
      ['failed', 1],
    ])
    expect(emails.every((email) => email.lastError !== null)).toBe(true)
  })

  it('envoie chaque email une seule fois quand plusieurs passages se chevauchent', async () => {
    const { mailer, send } = createFakeMailer()
    const addresses = ['a@x.fr', 'b@x.fr', 'c@x.fr', 'd@x.fr', 'e@x.fr']
    for (const address of addresses) await queueVerification(address)

    const results = await Promise.all([
      sendPendingEmails(mailer, log()),
      sendPendingEmails(mailer, log()),
      sendPendingEmails(mailer, log()),
    ])

    expect(results.reduce((total, count) => total + count, 0)).toBe(addresses.length)
    const recipients = send.mock.calls.map(([message]) => message.to).sort()
    expect(recipients).toEqual(addresses)
  })

  it('ne met ni l’adresse ni le token dans les logs', async () => {
    const { mailer, send } = createFakeMailer()
    send.mockRejectedValue(new Error('Serveur SMTP indisponible'))
    await queueVerification('ana@x.fr')
    await Email.create({ to: 'b@x.fr', template: 'inexistant', data: { link: LINK } })
    const logger = log()

    await sendPendingEmails(mailer, logger)

    expect(logger.warn).toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain('@x.fr')
    expect(logged).not.toContain(TOKEN)
  })
})
