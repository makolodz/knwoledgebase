import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll, inject } from 'vitest'
import { connectDb, disconnectDb } from '../src/infra/db'

/**
 * Branche le fichier de test sur une base MongoDB réelle et neuve (pas de mock, voir
 * docs/technical/testing.md). À appeler une fois, au niveau du fichier :
 * les collections sont vidées entre les tests, les index sont conservés.
 */
export function useTestDb(): void {
  beforeAll(async () => {
    await connectDb(inject('mongoUri'), { dbName: `test_${randomUUID().replaceAll('-', '')}` })
  })

  afterEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
    )
  })

  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await disconnectDb()
  })
}
