import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './env'

describe('T1.9 — loadConfig', () => {
  it('applique des valeurs par défaut valides pour le développement', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: 'localhost',
      port: 3000,
      webOrigin: 'http://localhost:5173',
      logLevel: 'info',
      mongoUrl: 'mongodb://127.0.0.1:27017/encheres',
    })
  })

  it('lit les variables fournies et ignore les autres variables du système', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '8080',
      WEB_ORIGIN: 'https://encheres.example',
      LOG_LEVEL: 'warn',
      MONGO_URL: 'mongodb+srv://app:motdepasse@cluster.example/encheres',
      PATH: '/usr/bin',
    })

    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      webOrigin: 'https://encheres.example',
      logLevel: 'warn',
      mongoUrl: 'mongodb+srv://app:motdepasse@cluster.example/encheres',
    })
  })

  it.each([
    ['PORT', { PORT: 'abc' }],
    ['PORT', { PORT: '0' }],
    ['PORT', { PORT: '70000' }],
    ['PORT', { PORT: '3000.5' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'pas une url' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'http://localhost:5173/' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'http://localhost:5173/chemin' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'bavard' }],
    ['MONGO_URL', { MONGO_URL: 'http://localhost:27017' }],
    ['MONGO_URL', { MONGO_URL: 'mongodb://' }],
    ['MONGO_URL', { MONGO_URL: '' }],
  ])('refuse %s invalide', (name, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError)
    expect(() => loadConfig(env)).toThrow(name)
  })

  it('n’affiche jamais la valeur fautive dans le message d’erreur', () => {
    const value = 'valeur-confidentielle-123'

    for (const name of ['PORT', 'WEB_ORIGIN', 'NODE_ENV', 'LOG_LEVEL', 'MONGO_URL']) {
      expect(() => loadConfig({ [name]: value })).toThrow(ConfigError)
      try {
        loadConfig({ [name]: value })
      } catch (error) {
        expect((error as Error).message).not.toContain(value)
      }
    }
  })
})

describe('T2.20 — MONGO_URL', () => {
  it('est obligatoire en production : pas de repli silencieux sur la base locale', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/MONGO_URL : obligatoire/)
  })

  it('a pour défaut la base de docker-compose.yml en développement et en test', () => {
    for (const NODE_ENV of ['development', 'test']) {
      expect(loadConfig({ NODE_ENV }).mongoUrl).toBe('mongodb://127.0.0.1:27017/encheres')
    }
  })

  it('ne laisse pas fuiter les identifiants d’une URL refusée', () => {
    const url = 'postgres://app:motdepasse-secret@db.example/encheres'

    expect(() => loadConfig({ MONGO_URL: url })).toThrow(ConfigError)
    try {
      loadConfig({ MONGO_URL: url })
    } catch (error) {
      expect((error as Error).message).not.toContain('motdepasse-secret')
    }
  })
})
