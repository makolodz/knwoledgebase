import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import { connectDb, DbConnectionError } from '../src/infra/db'
import { useTestDb } from './db'

describe('T2.21 — connexion à MongoDB', () => {
  describe('avec une base joignable', () => {
    useTestDb()

    it('écrit et relit un document dans une base réelle', async () => {
      const pings = mongoose.connection.collection('pings')
      await pings.insertOne({ message: 'ok' })

      expect(await pings.findOne({}, { projection: { _id: 0 } })).toEqual({ message: 'ok' })
    })

    it('vide les collections entre deux tests', async () => {
      expect(await mongoose.connection.collection('pings').countDocuments()).toBe(0)
    })
  })

  it('échoue avec un message clair qui ne contient pas l’URL (elle peut avoir un mot de passe)', async () => {
    const url = 'mongodb://application:motdepasse-secret@127.0.0.1:1/encheres'

    const error = await connectDb(url, { serverSelectionTimeoutMS: 300 }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(DbConnectionError)
    const { message } = error as DbConnectionError
    expect(message).toContain('pnpm infra:up')
    expect(message).not.toContain('motdepasse-secret')
    expect(message).not.toContain('127.0.0.1')
  })
})
