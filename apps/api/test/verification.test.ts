import type { CurrentUser } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthToken, Email, User } from '../src/models'
import { issueAuthToken } from '../src/services/auth-tokens'
import { RESEND_VERIFICATION_DELAY_MS } from '../src/services/verification'
import { useTestDb } from './db'
import { createTestApp } from './helpers'
import { authTokenFor, lastTokenOf, queuedEmails } from './outbox'
import { TestClient } from './trpc'
import { createUser, logIn } from './users'

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

/** Inscrit un utilisateur par l'API, comme le ferait le front, et renvoie le token du lien. */
async function registerAndGetToken() {
  await client.mutate('auth.register', {
    email: 'ana@x.fr',
    password: 'un-mot-de-passe-long',
    name: 'Ana',
    acceptTerms: true,
    confirmAdult: true,
  })
  return lastTokenOf('verify-email', 'ana@x.fr')
}

describe('T2.6 — lien de vérification de l’email', () => {
  it('vérifie l’adresse, sans qu’il soit nécessaire d’être connecté', async () => {
    const token = await registerAndGetToken()

    const result = await client.mutate('auth.verifyEmail', { token })

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ status: 'ok' })
    const user = await User.findOne().orFail()
    expect(user.emailVerifiedAt).toBeInstanceOf(Date)
    expect((await authTokenFor(token).orFail()).usedAt).toBeInstanceOf(Date)
    await logIn(client)
    expect((await client.query<{ user: CurrentUser }>('auth.me')).data.user.emailVerified).toBe(
      true,
    )
  })

  it('n’est utilisable qu’une seule fois', async () => {
    const token = await registerAndGetToken()

    await client.mutate('auth.verifyEmail', { token })
    const second = await client.mutate('auth.verifyEmail', { token })

    expect(second.status).toBe(400)
    expect(second.error?.data.code).toBe('TOKEN_INVALID')
  })

  it('ne laisse réussir qu’un seul de deux clics simultanés', async () => {
    const token = await registerAndGetToken()

    const results = await Promise.all([
      client.mutate('auth.verifyEmail', { token }),
      new TestClient(app).mutate('auth.verifyEmail', { token }),
    ])

    expect(results.map((result) => result.error?.data.code ?? 'ok').sort()).toEqual([
      'TOKEN_INVALID',
      'ok',
    ])
  })

  it('refuse un lien expiré après 24 h', async () => {
    const token = await registerAndGetToken()
    await AuthToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const result = await client.mutate('auth.verifyEmail', { token })

    expect(result.error?.data.code).toBe('TOKEN_INVALID')
    expect((await User.findOne().orFail()).emailVerifiedAt).toBeNull()
  })

  it('refuse un token inconnu et un token d’un autre type', async () => {
    const user = await createUser()
    const resetToken = await issueAuthToken({ userId: user._id, type: 'password_reset' })

    for (const token of ['a'.repeat(43), resetToken]) {
      const result = await client.mutate('auth.verifyEmail', { token })
      expect(result.error?.data.code).toBe('TOKEN_INVALID')
    }
    expect((await User.findOne().orFail()).emailVerifiedAt).toBeNull()
    // Le token d'un autre type n'a pas été consommé.
    expect((await authTokenFor(resetToken).orFail()).usedAt).toBeNull()
  })

  it('refuse un token mal formé sans interroger la base', async () => {
    const result = await client.mutate('auth.verifyEmail', { token: 'court' })

    expect(result.status).toBe(400)
    expect(result.error?.data.fieldErrors).toHaveProperty('token')
  })

  it('refuse le lien d’un compte supprimé', async () => {
    const token = await registerAndGetToken()
    await User.updateOne({}, { $set: { deletedAt: new Date() } })

    const result = await client.mutate('auth.verifyEmail', { token })

    expect(result.error?.data.code).toBe('TOKEN_INVALID')
  })
})

describe('T2.7 — nouveau lien de vérification', () => {
  it('refuse une demande moins d’une minute après la précédente', async () => {
    await registerAndGetToken()
    await logIn(client)

    const result = await client.mutate('auth.resendVerification')

    expect(result.status).toBe(429)
    expect(result.error?.data.code).toBe('RATE_LIMITED')
    expect(await queuedEmails({ template: 'verify-email' })).toHaveLength(1)
  })

  it('envoie un nouveau lien après une minute, et l’ancien lien devient invalide', async () => {
    const oldToken = await registerAndGetToken()
    await logIn(client)
    // `createdAt` est immuable pour Mongoose : on passe par la collection pour « vieillir » le lien.
    await AuthToken.collection.updateMany(
      {},
      { $set: { createdAt: new Date(Date.now() - RESEND_VERIFICATION_DELAY_MS - 1000) } },
    )

    const result = await client.mutate<{ status: string }>('auth.resendVerification')

    expect(result.data).toEqual({ status: 'sent' })
    const emails = await queuedEmails({ template: 'verify-email' })
    expect(emails).toHaveLength(2)
    const newToken = await lastTokenOf('verify-email')
    expect(newToken).not.toBe(oldToken)
    expect(await AuthToken.countDocuments({ type: 'email_verification' })).toBe(1)

    const stale = await client.mutate('auth.verifyEmail', { token: oldToken })
    expect(stale.error?.data.code).toBe('TOKEN_INVALID')
    const fresh = await client.mutate('auth.verifyEmail', { token: newToken })
    expect(fresh.error).toBeUndefined()
  })

  it('n’envoie rien à une adresse déjà vérifiée', async () => {
    await createUser({ emailVerifiedAt: new Date() })
    await logIn(client)

    const result = await client.mutate('auth.resendVerification')

    expect(result.data).toEqual({ status: 'already_verified' })
    expect(await Email.countDocuments()).toBe(0)
  })

  it('exige d’être connecté', async () => {
    const result = await client.mutate('auth.resendVerification')

    expect(result.error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})
