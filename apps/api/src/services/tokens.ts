import { createHash, randomBytes } from 'node:crypto'

/** Taille des tokens aléatoires, en octets (docs/domain/workflows/account.md : au moins 32). */
const TOKEN_BYTES = 32

/** Token aléatoire à donner à l'utilisateur (cookie ou lien). Seul son hash est stocké. */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/**
 * SHA-256 hexadécimal. Suffisant pour un token à 256 bits d'entropie : un hash lent (argon2)
 * ne protège que les mots de passe, que l'on peut deviner.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
