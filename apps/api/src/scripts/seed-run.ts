// Lancé par `pnpm seed` (voir docs/runbooks/local-development.md).
import { ConfigError, loadConfig } from '../config/env'
import { connectDb, DbConnectionError, disconnectDb } from '../infra/db'
// Enregistre les modèles avant la connexion, pour que `connectDb` crée leurs index.
import '../models'
import { assertSeedAllowed, SEED_PASSWORD, seedUsers, SeedNotAllowedError } from './seed'

try {
  const config = loadConfig()
  assertSeedAllowed(config)
  await connectDb(config.mongoUrl)
  try {
    const accounts = await seedUsers()
    console.log('Comptes de développement prêts :')
    for (const { email, role } of accounts) console.log(`  ${role.padEnd(6)} ${email}`)
    console.log(`Mot de passe de tous les comptes : ${SEED_PASSWORD}`)
  } finally {
    await disconnectDb()
  }
} catch (error) {
  if (
    error instanceof ConfigError ||
    error instanceof DbConnectionError ||
    error instanceof SeedNotAllowedError
  ) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
