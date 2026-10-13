import type { CurrentUser } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthToken, Email, Session, User } from '../src/models'
import { useTestDb } from './db'
import { createTestApp } from './helpers'
import { authTokenFor, lastTokenOf, queuedEmails, sha256 } from './outbox'
import { TestClient } from './trpc'
import { createUser, logIn, PASSWORD } from './users'

useTestDb()

let app: FastifyInstance
let client: TestClient

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(() => {
  client = new TestClient(app)
})

const NEW_PASSWORD = 'un-tout-nouveau-mot-de-passe'

describe('profile.update', () => {
  it('change le nom d’affichage, sans espaces de bord', async () => {
    await createUser()
    await logIn(client)

    const result = await client.mutate<{ user: CurrentUser }>('profile.update', {
      name: '  Ana B. ',
    })

    expect(result.data.user.name).toBe('Ana B.')
    expect((await User.findOne().orFail()).name).toBe('Ana B.')
    expect((await client.query<{ user: CurrentUser }>('auth.me')).data.user.name).toBe('Ana B.')
  })

  it('refuse un nom de 1 ou de 31 caractères', async () => {
    await createUser()
    await logIn(client)

    for (const name of ['A', 'a'.repeat(31)]) {
      const result = await client.mutate('profile.update', { name })
      expect(result.status).toBe(400)
    }
    expect((await User.findOne().orFail()).name).toBe('Ana')
  })

  it('ne laisse pas modifier le rôle, l’email ou la vérification par ce chemin', async () => {
    await createUser()
    await logIn(client)

    for (const extra of [{ role: 'admin' }, { email: 'autre@x.fr' }, { emailVerifiedAt: 'x' }]) {
      const result = await client.mutate('profile.update', { name: 'Ana B.', ...extra })
      expect(result.status).toBe(400)
    }
    expect(await User.findOne().orFail()).toMatchObject({ role: 'buyer', email: 'ana@x.fr' })
  })

  it('exige d’être connecté', async () => {
    const result = await client.mutate('profile.update', { name: 'Ana B.' })

    expect(result.error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})

describe('T2.13 — changement de mot de passe', () => {
  it('demande le mot de passe actuel', async () => {
    await createUser()
    await logIn(client)

    const result = await client.mutate('profile.changePassword', {
      currentPassword: 'mauvais-mot-de-passe',
      newPassword: NEW_PASSWORD,
    })

    expect(result.status).toBe(401)
    expect(result.error?.data.code).toBe('INVALID_CREDENTIALS')
    const login = await new TestClient(app).mutate('auth.login', {
      email: 'ana@x.fr',
      password: PASSWORD,
    })
    expect(login.error).toBeUndefined()
    expect(await Email.countDocuments()).toBe(0)
  })

  it('ferme les autres sessions mais garde la session courante, puis prévient l’utilisateur', async () => {
    const user = await createUser()
    const phone = new TestClient(app)
    await logIn(phone)
    await logIn(client)
    expect(await Session.countDocuments({ userId: user._id })).toBe(2)

    const result = await client.mutate('profile.changePassword', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    })

    expect(result.status).toBe(200)
    expect(await Session.countDocuments({ userId: user._id })).toBe(1)
    expect((await phone.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')
    expect((await client.mutate('auth.refresh')).status).toBe(200)
    expect((await queuedEmails({ template: 'password-changed' }))[0]?.to).toBe('ana@x.fr')
  })

  it('applique le nouveau mot de passe : l’ancien ne marche plus', async () => {
    await createUser()
    await logIn(client)
    await client.mutate('profile.changePassword', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    })

    const anonymous = new TestClient(app)
    const old = await anonymous.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })
    const fresh = await anonymous.mutate('auth.login', {
      email: 'ana@x.fr',
      password: NEW_PASSWORD,
    })

    expect(old.error?.data.code).toBe('INVALID_CREDENTIALS')
    expect(fresh.error).toBeUndefined()
  })

  it('invalide un lien de réinitialisation demandé avant le changement', async () => {
    await createUser()
    await client.mutate('auth.forgotPassword', { email: 'ana@x.fr' })
    const resetToken = await lastTokenOf('password-reset')
    await logIn(client)

    await client.mutate('profile.changePassword', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    })

    const result = await client.mutate('auth.resetPassword', {
      token: resetToken,
      password: 'un-mot-de-passe-pris-par-un-intrus',
    })
    expect(result.error?.data.code).toBe('TOKEN_INVALID')
  })

  it('refuse un nouveau mot de passe de moins de 12 caractères', async () => {
    await createUser()
    await logIn(client)

    const result = await client.mutate('profile.changePassword', {
      currentPassword: PASSWORD,
      newPassword: 'a'.repeat(11),
    })

    expect(result.status).toBe(400)
    expect(result.error?.data.fieldErrors).toHaveProperty('newPassword')
  })

  it('exige d’être connecté', async () => {
    const result = await client.mutate('profile.changePassword', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    })

    expect(result.error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})

describe('T2.12 — changement d’email', () => {
  async function requestChange(newEmail = 'nouvelle@x.fr', currentPassword = PASSWORD) {
    return client.mutate('profile.changeEmail', { currentPassword, newEmail })
  }

  it('demande le mot de passe actuel', async () => {
    await createUser()
    await logIn(client)

    const result = await requestChange('nouvelle@x.fr', 'mauvais-mot-de-passe')

    expect(result.error?.data.code).toBe('INVALID_CREDENTIALS')
    expect(await Email.countDocuments()).toBe(0)
    expect(await AuthToken.countDocuments()).toBe(0)
  })

  it('envoie le lien à la nouvelle adresse seulement, et ne change pas encore l’email', async () => {
    await createUser()
    await logIn(client)

    const result = await requestChange(' Nouvelle@X.fr ')

    expect(result.status).toBe(200)
    expect((await User.findOne().orFail()).email).toBe('ana@x.fr')
    const emails = await queuedEmails()
    expect(emails.map((email) => [email.to, email.template])).toEqual([
      ['nouvelle@x.fr', 'email-change-confirm'],
    ])
    const link = new URL((emails[0]?.data as { link: string }).link)
    expect(link.pathname).toBe('/verify-email')
    expect(link.searchParams.get('kind')).toBe('email-change')
    const token = await lastTokenOf('email-change-confirm')
    const stored = await authTokenFor(token).orFail()
    expect(stored).toMatchObject({ type: 'email_change', newEmail: 'nouvelle@x.fr', usedAt: null })
    expect(stored.tokenHash).toBe(sha256(token))
    expect(
      Math.abs(stored.expiresAt.getTime() - stored.createdAt.getTime() - 86_400_000),
    ).toBeLessThan(5000)
  })

  it('change l’email après le clic, marque l’adresse vérifiée et prévient l’ancienne adresse', async () => {
    await createUser({ emailVerifiedAt: null })
    await logIn(client)
    await requestChange()
    const token = await lastTokenOf('email-change-confirm')

    const result = await client.mutate<{ user: CurrentUser }>('profile.confirmEmailChange', {
      token,
    })

    expect(result.status).toBe(200)
    expect(result.data.user).toMatchObject({ email: 'nouvelle@x.fr', emailVerified: true })
    const user = await User.findOne().orFail()
    expect(user.email).toBe('nouvelle@x.fr')
    expect(user.emailVerifiedAt).toBeInstanceOf(Date)
    const notice = (await queuedEmails({ template: 'email-change-notice' }))[0]
    expect(notice?.to).toBe('ana@x.fr')
    expect(notice?.data).toMatchObject({ newEmail: 'nouvelle@x.fr' })
    // L'utilisateur se connecte désormais avec la nouvelle adresse.
    const anonymous = new TestClient(app)
    expect(
      (await anonymous.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })).error?.data
        .code,
    ).toBe('INVALID_CREDENTIALS')
    expect(
      (await anonymous.mutate('auth.login', { email: 'nouvelle@x.fr', password: PASSWORD })).error,
    ).toBeUndefined()
  })

  it('n’est utilisable qu’une seule fois, et pas après 24 h', async () => {
    await createUser()
    await logIn(client)
    await requestChange()
    const token = await lastTokenOf('email-change-confirm')
    await client.mutate('profile.confirmEmailChange', { token })

    const reused = await client.mutate('profile.confirmEmailChange', { token })
    expect(reused.error?.data.code).toBe('TOKEN_INVALID')

    await requestChange('autre@x.fr')
    const second = await lastTokenOf('email-change-confirm', 'autre@x.fr')
    await AuthToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await client.mutate('profile.confirmEmailChange', { token: second })
    expect(expired.error?.data.code).toBe('TOKEN_INVALID')
    expect((await User.findOne().orFail()).email).toBe('nouvelle@x.fr')
  })

  it('refuse le lien destiné à un autre utilisateur, sans le consommer', async () => {
    await createUser()
    await createUser({ email: 'bob@x.fr', name: 'Bob' })
    await logIn(client)
    await requestChange()
    const token = await lastTokenOf('email-change-confirm')

    const bob = new TestClient(app)
    await logIn(bob, 'bob@x.fr')
    const stolen = await bob.mutate('profile.confirmEmailChange', { token })

    expect(stolen.error?.data.code).toBe('TOKEN_INVALID')
    expect((await authTokenFor(token).orFail()).usedAt).toBeNull()
    expect((await client.mutate('profile.confirmEmailChange', { token })).error).toBeUndefined()
    expect(await User.findOne({ name: 'Bob' })).toMatchObject({ email: 'bob@x.fr' })
  })

  it('ne dit pas qu’une adresse est déjà prise : même réponse, rien n’est envoyé', async () => {
    await createUser()
    await createUser({ email: 'bob@x.fr', name: 'Bob' })
    await logIn(client)

    const taken = await requestChange('bob@x.fr')
    const free = await requestChange('libre@x.fr')

    expect(taken.status).toBe(free.status)
    expect(taken.raw).toBe(free.raw)
    expect((await queuedEmails()).map((email) => email.to)).toEqual(['libre@x.fr'])
    expect(await AuthToken.countDocuments()).toBe(1)
  })

  it('refuse la confirmation si l’adresse a été prise entre-temps', async () => {
    await createUser()
    await logIn(client)
    await requestChange()
    const token = await lastTokenOf('email-change-confirm')
    await createUser({ email: 'nouvelle@x.fr', name: 'Intrus' })

    const result = await client.mutate('profile.confirmEmailChange', { token })

    expect(result.error?.data.code).toBe('TOKEN_INVALID')
    expect(await User.findOne({ name: 'Ana' })).toMatchObject({ email: 'ana@x.fr' })
  })

  it('ne fait rien si la nouvelle adresse est l’adresse actuelle', async () => {
    await createUser()
    await logIn(client)

    const result = await requestChange('ANA@x.fr')

    expect(result.status).toBe(200)
    expect(await Email.countDocuments()).toBe(0)
  })

  it('exige d’être connecté', async () => {
    const result = await client.mutate('profile.changeEmail', {
      currentPassword: PASSWORD,
      newEmail: 'nouvelle@x.fr',
    })

    expect(result.error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})
