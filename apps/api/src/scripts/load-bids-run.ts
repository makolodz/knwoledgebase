// Lancé par `pnpm load:prepare` et `pnpm load:verify` (voir load/rapport.md).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ConfigError, loadConfig } from '../config/env'
import { connectDb, DbConnectionError, disconnectDb } from '../infra/db'
// Enregistre les modèles avant la connexion, pour que `connectDb` crée leurs index.
import '../models'
import { prepareLoadTest, verifyLoadTest } from './load-bids'
import { assertSeedAllowed, SeedNotAllowedError } from './seed'

const DEFAULT_USERS = 50

/** Nombre d'offres acceptées vu par k6, lu dans l'export de `--summary-export`. */
function acceptedFromSummary(path: string): number {
  const summary = JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? '.', path), 'utf8')) as {
    metrics?: Record<string, { count?: number; values?: { count?: number } }>
  }
  const metric = summary.metrics?.bids_accepted
  const count = metric?.count ?? metric?.values?.count
  if (count === undefined) throw new Error('Métrique bids_accepted absente du résumé k6.')
  return count
}

try {
  const [command, argument, summaryPath] = process.argv.slice(2)
  if (command !== 'prepare' && command !== 'verify') {
    console.error(
      'Usage : load-bids-run prepare [nombre d’acheteurs] | verify <idEnchère> [résumé k6]',
    )
    process.exit(1)
  }
  const config = loadConfig()
  assertSeedAllowed(config)
  await connectDb(config.mongoUrl)
  try {
    if (command === 'prepare') {
      const users = argument === undefined ? DEFAULT_USERS : Number(argument)
      if (!Number.isInteger(users) || users < 1) throw new Error('Nombre d’acheteurs invalide.')
      const fixture = await prepareLoadTest({ users })
      console.log(`Enchère prête : ${fixture.auctionId} (${fixture.users} acheteurs)`)
      console.log(
        `k6 run -e AUCTION_ID=${fixture.auctionId} -e USERS=${fixture.users} --summary-export load/summary.json load/bids-concurrent.js`,
      )
    } else {
      if (argument === undefined) throw new Error('Identifiant d’enchère manquant.')
      const accepted = summaryPath === undefined ? undefined : acceptedFromSummary(summaryPath)
      const verdict = await verifyLoadTest(argument, { accepted })
      console.log(`${verdict.bids} offres en base, prix courant ${verdict.currentPrice}.`)
      if (verdict.violations.length === 0) {
        console.log('Cohérent : aucune offre perdue, historique et enchère concordent.')
      } else {
        for (const violation of verdict.violations) console.error(`✗ ${violation}`)
        process.exitCode = 1
      }
    }
  } finally {
    await disconnectDb()
  }
} catch (error) {
  if (
    error instanceof ConfigError ||
    error instanceof DbConnectionError ||
    error instanceof SeedNotAllowedError ||
    (error instanceof Error && error.message.startsWith('Métrique'))
  ) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}
