import { describe, expect, it } from 'vitest'
import {
  currentUserSchema,
  displayNameSchema,
  emailSchema,
  loginInputSchema,
  passwordSchema,
  registerInputSchema,
} from './auth'

const validRegistration = {
  email: 'ana@x.fr',
  password: 'un-mot-de-passe-long',
  name: 'Ana',
  acceptTerms: true,
  confirmAdult: true,
}

describe('emailSchema', () => {
  it('retire les espaces et passe en minuscules (T2.5)', () => {
    expect(emailSchema.parse('  Ana@X.fr ')).toBe('ana@x.fr')
  })

  it.each(['', 'ana', 'ana@', '@x.fr', 'ana@x', 'a b@x.fr', `${'a'.repeat(250)}@x.fr`])(
    'refuse %j',
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe('passwordSchema (T2.3)', () => {
  it('refuse 11 caractères, accepte 12', () => {
    expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false)
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true)
  })

  it('refuse plus de 128 caractères', () => {
    expect(passwordSchema.safeParse('a'.repeat(128)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false)
  })

  it('n’impose aucune autre règle de complexité', () => {
    expect(passwordSchema.safeParse('aaaaaaaaaaaa').success).toBe(true)
  })
})

describe('displayNameSchema', () => {
  it('accepte de 2 à 30 caractères, espaces de bord retirés', () => {
    expect(displayNameSchema.parse(' Ana ')).toBe('Ana')
    expect(displayNameSchema.safeParse('A').success).toBe(false)
    expect(displayNameSchema.safeParse(' A ').success).toBe(false)
    expect(displayNameSchema.safeParse('a'.repeat(30)).success).toBe(true)
    expect(displayNameSchema.safeParse('a'.repeat(31)).success).toBe(false)
  })
})

describe('registerInputSchema (T2.2)', () => {
  it('accepte une inscription complète et normalise l’email', () => {
    expect(registerInputSchema.parse({ ...validRegistration, email: ' Ana@X.fr' })).toMatchObject({
      email: 'ana@x.fr',
    })
  })

  it.each(['acceptTerms', 'confirmAdult'])(
    'refuse sans %s, ou si la case n’est pas cochée',
    (key) => {
      const without = Object.fromEntries(
        Object.entries(validRegistration).filter(([name]) => name !== key),
      )
      expect(registerInputSchema.safeParse(without).success).toBe(false)
      expect(registerInputSchema.safeParse({ ...validRegistration, [key]: false }).success).toBe(
        false,
      )
      expect(registerInputSchema.safeParse({ ...validRegistration, [key]: 'true' }).success).toBe(
        false,
      )
    },
  )

  it('refuse un champ inconnu : on ne peut pas glisser un rôle', () => {
    expect(registerInputSchema.safeParse({ ...validRegistration, role: 'admin' }).success).toBe(
      false,
    )
  })
})

describe('loginInputSchema', () => {
  it('accepte un mot de passe court : aucune règle de longueur à la connexion', () => {
    expect(loginInputSchema.safeParse({ email: 'ana@x.fr', password: 'court' }).success).toBe(true)
  })

  it('refuse un mot de passe vide ou un champ inconnu', () => {
    expect(loginInputSchema.safeParse({ email: 'ana@x.fr', password: '' }).success).toBe(false)
    expect(
      loginInputSchema.safeParse({ email: 'ana@x.fr', password: 'x', remember: true }).success,
    ).toBe(false)
  })
})

describe('currentUserSchema', () => {
  it('refuse un champ en trop : le hash du mot de passe ne peut pas fuiter par ce schéma', () => {
    const user = { id: '1', name: 'Ana', email: 'ana@x.fr', role: 'buyer', emailVerified: false }

    expect(currentUserSchema.safeParse(user).success).toBe(true)
    expect(currentUserSchema.safeParse({ ...user, passwordHash: 'x' }).success).toBe(false)
  })
})
