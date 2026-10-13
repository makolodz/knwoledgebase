import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { User } from '../src/models'
import {
  assertSeedAllowed,
  SEED_ACCOUNTS,
  SEED_PASSWORD,
  seedUsers,
  SeedNotAllowedError,
} from '../src/scripts/seed'
import { useTestDb } from './db'
import { createTestApp } from './helpers'
import { TestClient } from './trpc'
import { createUser } from './users'

useTestDb()

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})

describe('T2.38 — seed des comptes de développement', () => {
  it('crée un admin, un vendeur et deux acheteurs, emails vérifiés', async () => {
    await seedUsers()

    const users = await User.find().sort({ email: 1 })
    expect(users.map((user) => [user.email, user.role])).toEqual([
      ['acheteur1@example.test', 'buyer'],
      ['acheteur2@example.test', 'buyer'],
      ['admin@example.test', 'admin'],
      ['vendeur@example.test', 'seller'],
    ])
    expect(users.every((user) => user.emailVerifiedAt instanceof Date)).toBe(true)
    expect(users.every((user) => user.passwordHash?.startsWith('$argon2id$'))).toBe(true)
  })

  it('permet de se connecter avec chaque compte', async () => {
    await seedUsers()

    for (const { email, role } of SEED_ACCOUNTS) {
      const client = new TestClient(app)
      const result = await client.mutate<{ user: { role: string } }>('auth.login', {
        email,
        password: SEED_PASSWORD,
      })

      expect(result.error).toBeUndefined()
      expect(result.data.user.role).toBe(role)
    }
  })

  it('est idempotent : relancé, il ne crée aucun doublon', async () => {
    await seedUsers()
    await seedUsers()

    expect(await User.countDocuments()).toBe(SEED_ACCOUNTS.length)
  })

  it('remet un compte modifié dans son état d’origine, sans toucher aux autres comptes', async () => {
    const other = await createUser({ email: 'vraie@x.fr', name: 'Vraie', role: 'seller' })
    await seedUsers()
    await User.updateOne(
      { email: 'admin@example.test' },
      { $set: { role: 'buyer', suspendedAt: new Date(), emailVerifiedAt: null, name: 'Autre' } },
    )
    await User.updateOne({ email: 'vendeur@example.test' }, { $set: { deletedAt: new Date() } })

    await seedUsers()

    expect(await User.findOne({ email: 'admin@example.test' })).toMatchObject({
      name: 'Admin',
      role: 'admin',
      suspendedAt: null,
    })
    expect(
      (await User.findOne({ email: 'admin@example.test' }).orFail()).emailVerifiedAt,
    ).not.toBeNull()
    expect((await User.findOne({ email: 'vendeur@example.test' }).orFail()).deletedAt).toBeNull()
    expect(await User.findById(other._id)).toMatchObject({ email: 'vraie@x.fr', role: 'seller' })
  })
})

describe('T2.38 — le seed refuse les environnements réels', () => {
  const local = 'mongodb://127.0.0.1:27017/encheres'

  it.each([
    'mongodb://127.0.0.1:27017/encheres',
    'mongodb://localhost:27017/encheres',
    'mongodb://utilisateur:mdp@localhost/encheres',
  ])('accepte une base locale : %s', (mongoUrl) => {
    expect(() => assertSeedAllowed({ nodeEnv: 'development', mongoUrl })).not.toThrow()
  })

  it('refuse NODE_ENV=production, même avec une base locale', () => {
    expect(() => assertSeedAllowed({ nodeEnv: 'production', mongoUrl: local })).toThrow(
      SeedNotAllowedError,
    )
  })

  it.each([
    'mongodb+srv://app:mdp-secret@cluster0.example.net/encheres',
    'mongodb://base.example.org:27017/encheres',
    'mongodb://10.0.0.5:27017/encheres',
    'pas une url',
  ])('refuse une base distante ou illisible, sans afficher l’URL : %s', (mongoUrl) => {
    try {
      assertSeedAllowed({ nodeEnv: 'development', mongoUrl })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(SeedNotAllowedError)
      expect((error as Error).message).not.toContain('mdp-secret')
      expect((error as Error).message).not.toContain('cluster0')
    }
  })
})
