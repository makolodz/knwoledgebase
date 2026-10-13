import { Types } from 'mongoose'
import { describe, expect, it } from 'vitest'
import { AuthToken, Email, Session, User } from '../src/models'
import { useTestDb } from './db'

useTestDb()

const baseUser = { name: 'Ana', acceptedTermsAt: new Date('2026-10-13T08:00:00Z') }
const inOneDay = new Date('2026-10-14T08:00:00Z')

const DUPLICATE_KEY = { code: 11000 }

/** Données volontairement invalides, que le typage refuserait : la base doit les refuser aussi. */
const unchecked = (value: object) => value as never

describe('T2.22 — modèle users', () => {
  it('applique les valeurs par défaut : acheteur, ni vérifié, ni suspendu, ni supprimé', async () => {
    const user = await User.create({ ...baseUser, email: 'ana@x.fr', passwordHash: 'hash' })

    expect(user).toMatchObject({
      role: 'buyer',
      emailVerifiedAt: null,
      suspendedAt: null,
      deletedAt: null,
    })
    expect(user.createdAt).toBeInstanceOf(Date)
  })

  it('normalise l’email : espaces retirés, minuscules (T2.5)', async () => {
    const user = await User.create({ ...baseUser, email: '  Ana@X.fr ' })

    expect(user.email).toBe('ana@x.fr')
  })

  it('refuse deux comptes avec le même email, quelle que soit la casse', async () => {
    await User.create({ ...baseUser, email: 'ana@x.fr' })

    await expect(User.create({ ...baseUser, email: 'ANA@x.fr ' })).rejects.toMatchObject(
      DUPLICATE_KEY,
    )
  })

  it('autorise plusieurs comptes anonymisés, qui ont tous un email nul', async () => {
    await User.create({ ...baseUser, email: null })
    await User.create({ ...baseUser, email: null })

    expect(await User.countDocuments({ email: null })).toBe(2)
  })

  it('refuse un rôle inconnu', async () => {
    await expect(
      User.create(unchecked({ ...baseUser, email: 'ana@x.fr', role: 'moderator' })),
    ).rejects.toThrow(/role/)
  })

  it('refuse un compte sans nom ou sans acceptation des CGU', async () => {
    await expect(
      User.create(unchecked({ acceptedTermsAt: new Date(), email: 'a@x.fr' })),
    ).rejects.toThrow(/name/)
    await expect(User.create(unchecked({ name: 'Ana', email: 'a@x.fr' }))).rejects.toThrow(
      /acceptedTermsAt/,
    )
  })
})

describe('T2.23 — authTokens, sessions et emails', () => {
  const userId = new Types.ObjectId()

  it('authTokens : le hash d’un token est unique', async () => {
    const token = {
      userId,
      type: 'email_verification' as const,
      tokenHash: 'a'.repeat(64),
      expiresAt: inOneDay,
    }
    await AuthToken.create(token)

    await expect(
      AuthToken.create({ ...token, userId: new Types.ObjectId() }),
    ).rejects.toMatchObject(DUPLICATE_KEY)
  })

  it('authTokens : refuse un type inconnu', async () => {
    await expect(
      AuthToken.create(
        unchecked({
          userId,
          type: 'magic_link',
          tokenHash: 'b'.repeat(64),
          expiresAt: inOneDay,
        }),
      ),
    ).rejects.toThrow(/type/)
  })

  it('sessions : le hash du refresh token est unique', async () => {
    const session = {
      userId,
      refreshTokenHash: 'c'.repeat(64),
      expiresAt: inOneDay,
      lastUsedAt: new Date(),
    }
    await Session.create(session)

    await expect(Session.create(session)).rejects.toMatchObject(DUPLICATE_KEY)
  })

  it('authTokens et sessions : MongoDB purge les documents expirés (index TTL sur expiresAt)', async () => {
    for (const model of [AuthToken, Session]) {
      const indexes = await model.collection.indexes()

      expect(indexes).toContainEqual(
        expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
      )
    }
  })

  it('emails : un nouvel email est en attente, sans tentative, avec des données vides conservées', async () => {
    const email = await Email.create({ to: 'ana@x.fr', template: 'verify-email' })

    expect(email).toMatchObject({ status: 'pending', attempts: 0, lastError: null, sentAt: null })
    expect(email.sendAfter).toBeInstanceOf(Date)
    expect(email.data).toEqual({})
    const stored = await Email.collection.findOne({ _id: email._id })
    expect(stored).toHaveProperty('data', {})
  })

  it('emails : refuse un statut inconnu', async () => {
    await expect(
      Email.create(unchecked({ to: 'ana@x.fr', template: 'verify-email', status: 'sending' })),
    ).rejects.toThrow(/status/)
  })
})
