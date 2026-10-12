import { buildApp } from './app'
import { ConfigError, loadConfig } from './config/env'

let config
try {
  config = loadConfig()
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
}

const app = await buildApp(config)

async function shutdown(signal: string) {
  app.log.info({ signal }, 'Arrêt demandé')
  await app.close()
  process.exit(0)
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void shutdown(signal))
}

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error({ err: error }, 'Démarrage impossible')
  process.exit(1)
}
