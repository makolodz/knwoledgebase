import type { CurrentUser } from '@encheres/shared'
import { User, type UserAttributes } from '../src/models'
import { hashPassword } from '../src/services/password'
import type { TestClient } from './trpc'

export const PASSWORD = 'un-mot-de-passe-long'

let passwordHash: Promise<string> | undefined

/**
 * Crée un utilisateur directement en base. Le hash est calculé une seule fois : argon2 est lent
 * exprès, et les tests qui ne portent pas sur l'inscription n'ont pas à le payer à chaque fois.
 */
export async function createUser(overrides: Partial<UserAttributes> = {}) {
  passwordHash ??= hashPassword(PASSWORD)
  return User.create({
    email: 'ana@x.fr',
    name: 'Ana',
    passwordHash: await passwordHash,
    acceptedTermsAt: new Date(),
    ...overrides,
  })
}

/** Connexion réelle d'un utilisateur créé par `createUser` : le client garde les cookies. */
export async function logIn(client: TestClient, email = 'ana@x.fr', password = PASSWORD) {
  const result = await client.mutate<{ user: CurrentUser }>('auth.login', { email, password })
  if (result.error !== undefined) {
    throw new Error(`Connexion impossible dans le test : ${result.error.data.code}`)
  }
  return result
}
