import mongoose from 'mongoose'

export interface ConnectOptions {
  /** Base à utiliser à la place de celle de l'URL (les tests en prennent une par fichier). */
  dbName?: string
  /** Délai avant d'abandonner quand MongoDB ne répond pas. */
  serverSelectionTimeoutMS?: number
}

/** Connexion impossible. Le message est affichable : il ne contient jamais l'URL. */
export class DbConnectionError extends Error {
  constructor() {
    super(
      'Impossible de joindre MongoDB. En développement, lancer `pnpm infra:up` ; ' +
        'sinon vérifier MONGO_URL.',
    )
    this.name = 'DbConnectionError'
  }
}

/**
 * Ouvre la connexion Mongoose (unique, partagée par tous les modèles) et crée les index des
 * modèles déjà chargés. Les erreurs du pilote peuvent citer l'URL, donc on ne les propage pas.
 */
export async function connectDb(url: string, options: ConnectOptions = {}): Promise<void> {
  try {
    await mongoose.connect(url, {
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 5000,
      ...(options.dbName === undefined ? {} : { dbName: options.dbName }),
    })
    await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()))
  } catch {
    await mongoose.disconnect().catch(() => undefined)
    throw new DbConnectionError()
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
