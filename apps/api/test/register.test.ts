import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AuthToken, Email, Session, User } from '../src/models'
import { useTestDb } from './db'
import { createTestApp } from './helpers'
import { PASSWORD } from './users'
import { TestClient } from './trpc'

useTestDb()

let app: FastifyInstance
let client: TestClient

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
// Un client neuf par test : aucun cookie ne traîne d'un test à l'autre.
beforeEach(() => {
  client = new TestClient(app)
})

const registration = {
  email: 'ana@x.fr',
  password: PASSWORD,
  name: 'Ana',
  acceptTerms: true,
  confirmAdult: true,
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

describe('T2.1 — inscription', () => {
  it('crée un acheteur non vérifié dont le mot de passe est hashé en argon2id', async () => {
    const result = await client.mutate('auth.register', registration)

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ status: 'ok' })
    const user = await User.findOne().orFail()
    expect(user).toMatchObject({
      email: 'ana@x.fr',
      name: 'Ana',
      role: 'buyer',
      emailVerifiedAt: null,
      suspendedAt: null,
      deletedAt: null,
    })
    expect(user.acceptedTermsAt).toBeInstanceOf(Date)
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user.passwordHash).not.toContain(PASSWORD)
  })

  it('ne connecte personne : ni cookie, ni session (ADR-014)', async () => {
    const result = await client.mutate('auth.register', registration)

    expect(result.cookies).toEqual([])
    expect(await Session.countDocuments()).toBe(0)
    expect((await client.query('auth.me')).error?.data.code).toBe('NOT_AUTHENTICATED')
  })

  it('met l’email de vérification dans la file : lien valable 24 h, token stocké hashé', async () => {
    await client.mutate('auth.register', registration)

    const email = await Email.findOne().orFail()
    expect(email).toMatchObject({ to: 'ana@x.fr', template: 'verify-email', status: 'pending' })
    const link = new URL((email.data as { link: string }).link)
    expect(link.origin + link.pathname).toBe('http://localhost:5173/verify-email')
    const token = link.searchParams.get('token') ?? ''
    expect(token.length).toBeGreaterThanOrEqual(43) // 32 octets en base64url

    const user = await User.findOne().orFail()
    const stored = await AuthToken.findOne().orFail()
    expect(stored).toMatchObject({ type: 'email_verification', usedAt: null })
    expect(stored.userId.equals(user._id)).toBe(true)
    expect(stored.tokenHash).toBe(sha256(token))
    expect(JSON.stringify(await AuthToken.find().lean())).not.toContain(token)
    const lifetime = stored.expiresAt.getTime() - stored.createdAt.getTime()
    expect(Math.abs(lifetime - 24 * 60 * 60 * 1000)).toBeLessThan(5000)
  })

  it('refuse de choisir son rôle', async () => {
    const result = await client.mutate('auth.register', { ...registration, role: 'admin' })

    expect(result.status).toBe(400)
    expect(result.error?.data.code).toBe('BAD_REQUEST')
    expect(await User.countDocuments()).toBe(0)
  })
})

describe('T2.2 — cases « CGU » et « majeur » obligatoires', () => {
  it.each(['acceptTerms', 'confirmAdult'])('refuse l’inscription sans %s', async (field) => {
    for (const body of [
      { ...registration, [field]: false },
      Object.fromEntries(Object.entries(registration).filter(([key]) => key !== field)),
    ]) {
      const result = await client.mutate('auth.register', body)

      expect(result.status).toBe(400)
      expect(result.error?.data.fieldErrors).toHaveProperty(field)
    }

    expect(await User.countDocuments()).toBe(0)
    expect(await Email.countDocuments()).toBe(0)
  })

  it('ne renvoie jamais le mot de passe saisi dans une erreur de validation', async () => {
    const result = await client.mutate('auth.register', { ...registration, email: 'pas-un-email' })

    expect(result.status).toBe(400)
    expect(result.error?.message).toBe('Données invalides.')
    expect(result.raw).not.toContain(PASSWORD)
    expect(result.raw).not.toContain('pas-un-email')
  })
})

describe('T2.3 — longueur du mot de passe', () => {
  it('refuse 11 caractères et accepte 12', async () => {
    const short = await client.mutate('auth.register', {
      ...registration,
      password: 'a'.repeat(11),
    })
    expect(short.status).toBe(400)
    expect(short.error?.data.fieldErrors).toHaveProperty('password')
    expect(await User.countDocuments()).toBe(0)

    const enough = await client.mutate('auth.register', {
      ...registration,
      password: 'a'.repeat(12),
    })
    expect(enough.status).toBe(200)
    expect(await User.countDocuments()).toBe(1)
  })

  it('refuse plus de 128 caractères', async () => {
    const result = await client.mutate('auth.register', {
      ...registration,
      password: 'a'.repeat(129),
    })

    expect(result.status).toBe(400)
    expect(await User.countDocuments()).toBe(0)
  })
})

describe('T2.4 — inscription avec un email déjà utilisé', () => {
  it('renvoie exactement la même réponse qu’une inscription réussie', async () => {
    const first = await client.mutate('auth.register', registration)
    const second = await client.mutate('auth.register', {
      ...registration,
      name: 'Autre nom',
      password: 'un-autre-mot-de-passe',
    })

    expect(second.status).toBe(first.status)
    expect(second.raw).toBe(first.raw)
    expect(second.cookies).toEqual(first.cookies)
  })

  it('ne crée pas de second compte et ne touche pas au compte existant', async () => {
    await client.mutate('auth.register', registration)
    await client.mutate('auth.register', {
      ...registration,
      name: 'Autre nom',
      password: 'un-autre-mot-de-passe',
    })

    const users = await User.find()
    expect(users).toHaveLength(1)
    expect(users[0]?.name).toBe('Ana')
    expect(await AuthToken.countDocuments()).toBe(1)
    const login = await client.mutate('auth.login', {
      email: 'ana@x.fr',
      password: 'un-autre-mot-de-passe',
    })
    expect(login.error?.data.code).toBe('INVALID_CREDENTIALS')
  })

  it('prévient le propriétaire du compte par un email « tentative d’inscription »', async () => {
    await client.mutate('auth.register', registration)
    await client.mutate('auth.register', { ...registration, name: 'Intrus' })

    const emails = await Email.find().sort({ createdAt: 1 })
    expect(emails.map((email) => [email.to, email.template])).toEqual([
      ['ana@x.fr', 'verify-email'],
      ['ana@x.fr', 'account-exists'],
    ])
    // Le nom est celui du compte existant, pas celui saisi par la personne qui s’inscrit.
    expect(emails[1]?.data).toMatchObject({ name: 'Ana' })
    expect(JSON.stringify(emails[1]?.data)).not.toContain('Intrus')
  })
})

describe('T2.5 — normalisation de l’email', () => {
  it('stocke l’email en minuscules et sans espaces', async () => {
    await client.mutate('auth.register', { ...registration, email: ' Ana@X.fr ' })

    expect((await User.findOne().orFail()).email).toBe('ana@x.fr')
  })

  it('traite « Ana@X.fr » et « ana@x.fr » comme le même compte', async () => {
    await client.mutate('auth.register', { ...registration, email: 'Ana@X.fr ' })
    const second = await client.mutate('auth.register', registration)

    expect(second.status).toBe(200)
    expect(await User.countDocuments()).toBe(1)
    expect((await Email.find()).map((email) => email.template).sort()).toEqual([
      'account-exists',
      'verify-email',
    ])
  })
})
