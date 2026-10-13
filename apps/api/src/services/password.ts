import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'

/** argon2id avec les paramètres par défaut de la bibliothèque (docs/technical/security.md). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

let dummyHash: Promise<string> | undefined

/**
 * Vérifie un mot de passe. Sans hash (email inconnu, compte anonymisé), on vérifie quand même
 * contre un hash factice : le temps de réponse ne révèle pas si le compte existe.
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
    await argon2.verify(await dummyHash, password)
    return false
  }
  try {
    return await argon2.verify(hash, password)
  } catch {
    // Hash illisible (donnée corrompue) : jamais un accès.
    return false
  }
}
