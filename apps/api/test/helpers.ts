import { Writable } from 'node:stream'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { buildApp, type BuildAppOptions } from '../src/app'
import type { Config } from '../src/config/env'

export const WEB_ORIGIN = 'http://localhost:5173'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 0,
    webOrigin: WEB_ORIGIN,
    logLevel: 'silent',
    mongoUrl: 'mongodb://127.0.0.1:27017/encheres-test',
    smtp: { host: '127.0.0.1', port: 1025, from: 'Enchères <no-reply@encheres.test>', auth: null },
    ...overrides,
  }
}

/** Flux en mémoire qui conserve chaque ligne de log pino (une ligne = un objet JSON). */
export function captureLogs() {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  })
  return {
    stream,
    /** Texte brut de tous les logs, pour chercher une valeur qui ne doit pas s'y trouver. */
    raw: () => chunks.join(''),
    entries: () =>
      chunks
        .join('')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  }
}

interface TestAppOptions extends BuildAppOptions {
  config?: Partial<Config>
  /** Ajoute des routes propres au test, avant que Fastify ne verrouille la table des routes. */
  routes?: (app: FastifyInstance) => void
}

export async function createTestApp(options: TestAppOptions = {}): Promise<FastifyInstance> {
  const { config, routes, ...buildOptions } = options
  const app = await buildApp(testConfig(config), buildOptions)
  routes?.(app)
  await app.ready()
  return app
}

/** Démarre le serveur sur un port libre et renvoie son URL. */
export async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { port } = app.server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}
