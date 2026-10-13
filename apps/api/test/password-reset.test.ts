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

async function requestReset(email = 'ana@x.fr') {
  return client.mutate('auth.forgotPassword', { email })
}

describe('T2.10 — mot de passe oublié', () => {
  it('donne la même réponse que l’email existe ou non, et n’écrit qu’à un compte existant', async () => {
    await createUser()

    const known = await requestReset('ana@x.fr')
    const unknown = await requestReset('inconnu@x.fr')

    expect(known.status).toBe(200)
    expect(unknown.status).toBe(known.status)
    expect(unknown.raw).toBe(known.raw)
    expect(unknown.cookies).toEqual(known.cookies)
    const emails = await queuedEmails()
    expect(emails.map((email) => [email.to, email.template])).toEqual([
      ['ana@x.fr', 'password-reset'],
    ])
  })

  it('envoie un lien valable 1 h dont seul le hash est stocké', async () => {
    const user = await createUser()
    await requestReset()

    const token = await lastTokenOf('password-reset', 'ana@x.fr')

    const stored = await authTokenFor(token).orFail()
    expect(stored).toMatchObject({ type: 'password_reset', usedAt: null })
    expect(stored.userId.equals(user._id)).toBe(true)
    expect(stored.tokenHash).toBe(sha256(token))
    expect(JSON.stringify(await AuthToken.find().lean())).not.toContain(token)
    expect(
      Math.abs(stored.expiresAt.getTime() - stored.createdAt.getTime() - 3_600_000),
    ).toBeLessThan(5000)
  })

  it('n’envoie rien à un compte suspendu ou supprimé', async () => {
    await createUser({ suspendedAt: new Date() })
    await createUser({ email: 'sup@x.fr', deletedAt: new Date() })

    await requestReset('ana@x.fr')
    await requestReset('sup@x.fr')

    expect(await Email.countDocuments()).toBe(0)
  })

  it('invalide le lien précédent quand un nouveau est demandé', async () => {
    await createUser()
    await requestReset()
    const first = await lastTokenOf('password-reset')
    await requestReset()
    const second = await lastTokenOf('password-reset')

    const stale = await client.mutate('auth.resetPassword', {
      token: first,
      password: NEW_PASSWORD,
    })
    const fresh = await client.mutate('auth.resetPassword', {
      token: second,
      password: NEW_PASSWORD,
    })

    expect(stale.error?.data.code).toBe('TOKEN_INVALID')
    expect(fresh.error).toBeUndefined()
  })

  it('change le mot de passe, ferme toutes les sessions et prévient l’utilisateur', async () => {
    const user = await createUser()
    const laptop = new TestClient(app)
    const phone = new TestClient(app)
    await logIn(laptop)
    await logIn(phone)
    await requestReset()
    const token = await lastTokenOf('password-reset')

    const result = await client.mutate('auth.resetPassword', { token, password: NEW_PASSWORD })

    expect(result.status).toBe(200)
    expect(result.cookies).toEqual([])
    expect(await Session.countDocuments({ userId: user._id })).toBe(0)
    expect((await laptop.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')
    expect((await phone.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')
    const oldPassword = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })
    expect(oldPassword.error?.data.code).toBe('INVALID_CREDENTIALS')
    const newPassword = await client.mutate('auth.login', {
      email: 'ana@x.fr',
      password: NEW_PASSWORD,
    })
    expect(newPassword.error).toBeUndefined()
    const confirmation = (await queuedEmails({ template: 'password-changed' }))[0]
    expect(confirmation?.to).toBe('ana@x.fr')
  })

  it('stocke le nouveau mot de passe en argon2id', async () => {
    await createUser()
    await requestReset()

    await client.mutate('auth.resetPassword', {
      token: await lastTokenOf('password-reset'),
      password: NEW_PASSWORD,
    })

    const user = await User.findOne().orFail()
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user.passwordHash).not.toContain(NEW_PASSWORD)
  })

  it('n’est utilisable qu’une seule fois', async () => {
    await createUser()
    await requestReset()
    const token = await lastTokenOf('password-reset')

    await client.mutate('auth.resetPassword', { token, password: NEW_PASSWORD })
    const second = await client.mutate('auth.resetPassword', {
      token,
      password: 'encore-un-autre-mot-de-passe',
    })

    expect(second.error?.data.code).toBe('TOKEN_INVALID')
    const login = await client.mutate('auth.login', { email: 'ana@x.fr', password: NEW_PASSWORD })
    expect(login.error).toBeUndefined()
  })

  it('refuse un lien expiré après 1 h', async () => {
    await createUser()
    await requestReset()
    const token = await lastTokenOf('password-reset')
    await AuthToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const result = await client.mutate('auth.resetPassword', { token, password: NEW_PASSWORD })

    expect(result.error?.data.code).toBe('TOKEN_INVALID')
    const login = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })
    expect(login.error).toBeUndefined()
  })

  it('refuse un lien de vérification d’email', async () => {
    await createUser()
    await client.mutate('auth.register', {
      email: 'bob@x.fr',
      password: PASSWORD,
      name: 'Bob',
      acceptTerms: true,
      confirmAdult: true,
    })
    const verificationToken = await lastTokenOf('verify-email', 'bob@x.fr')

    const result = await client.mutate('auth.resetPassword', {
      token: verificationToken,
      password: NEW_PASSWORD,
    })

    expect(result.error?.data.code).toBe('TOKEN_INVALID')
  })

  it('refuse un mot de passe trop court sans consommer le lien', async () => {
    await createUser()
    await requestReset()
    const token = await lastTokenOf('password-reset')

    const tooShort = await client.mutate('auth.resetPassword', { token, password: 'court' })
    expect(tooShort.status).toBe(400)
    expect(tooShort.error?.data.fieldErrors).toHaveProperty('password')

    const valid = await client.mutate('auth.resetPassword', { token, password: NEW_PASSWORD })
    expect(valid.error).toBeUndefined()
  })

  it('refuse le lien d’un compte suspendu depuis la demande', async () => {
    const user = await createUser()
    await requestReset()
    const token = await lastTokenOf('password-reset')
    await User.updateOne({ _id: user._id }, { $set: { suspendedAt: new Date() } })

    const result = await client.mutate('auth.resetPassword', { token, password: NEW_PASSWORD })

    expect(result.error?.data.code).toBe('TOKEN_INVALID')
  })
})
