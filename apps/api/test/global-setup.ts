import { MongoMemoryServer } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL du MongoDB de test, partagée par tous les fichiers (une base chacun, voir db.ts). */
    mongoUri: string
  }
}

/**
 * Même version majeure que l'image `mongo:8.0` de docker-compose.yml. Le binaire est
 * téléchargé au premier lancement puis gardé en cache (docs/technical/testing.md).
 */
const MONGO_VERSION = '8.0.4'

/** Un seul mongod par exécution de `vitest` : plus rapide qu'un démarrage par fichier. */
export default async function setup(project: TestProject) {
  const mongod = await MongoMemoryServer.create({ binary: { version: MONGO_VERSION } })
  project.provide('mongoUri', mongod.getUri())
  return async () => {
    await mongod.stop()
  }
}
