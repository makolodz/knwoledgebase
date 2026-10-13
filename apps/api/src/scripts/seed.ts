import type { UserRole } from '@encheres/shared'
import type { Config } from '../config/env'
import { User } from '../models'
import { hashPassword } from '../services/password'

/**
 * Mot de passe des comptes de développement. Il est public (il figure dans le dépôt et dans le
 * runbook) : ces comptes n'existent que sur une base locale, le script refuse d'écrire ailleurs.
 */
export const SEED_PASSWORD = 'mot-de-passe-de-dev-123'

export interface SeedAccount {
  email: string
  name: string
  role: UserRole
}

/** Un admin, un vendeur et deux acheteurs (docs/roadmap.md, étape 2). Domaine `.test` : réservé. */
export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  { email: 'admin@example.test', name: 'Admin', role: 'admin' },
  { email: 'vendeur@example.test', name: 'Vendeur', role: 'seller' },
  { email: 'acheteur1@example.test', name: 'Acheteur Un', role: 'buyer' },
  { email: 'acheteur2@example.test', name: 'Acheteur Deux', role: 'buyer' },
]

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Erreur affichable : elle n'inclut jamais l'URL de la base (elle peut contenir un mot de passe). */
export class SeedNotAllowedError extends Error {
  constructor(reason: string) {
    super(`Seed refusé : ${reason}`)
    this.name = 'SeedNotAllowedError'
  }
}

/**
 * Le seed crée des comptes aux mots de passe connus : il ne doit jamais s'exécuter en production
 * ni sur une base distante, même par erreur de `.env`.
 */
export function assertSeedAllowed(config: Pick<Config, 'nodeEnv' | 'mongoUrl'>): void {
  if (config.nodeEnv === 'production') {
    throw new SeedNotAllowedError('NODE_ENV vaut « production ».')
  }
  let host: string
  try {
    host = new URL(config.mongoUrl).hostname
  } catch {
    throw new SeedNotAllowedError('MONGO_URL illisible.')
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new SeedNotAllowedError('MONGO_URL ne désigne pas une base locale.')
  }
}

/**
 * Crée ou remet dans son état d'origine chaque compte de développement : rôle, mot de passe,
 * email vérifié, ni suspendu ni supprimé. Idempotent, et sans toucher aux autres comptes.
 */
export async function seedUsers(): Promise<readonly SeedAccount[]> {
  const passwordHash = await hashPassword(SEED_PASSWORD)
  const now = new Date()

  for (const account of SEED_ACCOUNTS) {
    await User.updateOne(
      { email: account.email },
      {
        $set: {
          name: account.name,
          role: account.role,
          passwordHash,
          emailVerifiedAt: now,
          suspendedAt: null,
          deletedAt: null,
        },
        $setOnInsert: { acceptedTermsAt: now, createdAt: now },
      },
      { upsert: true },
    )
  }
  return SEED_ACCOUNTS
}
