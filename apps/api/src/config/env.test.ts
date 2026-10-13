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
      smtp: {
        host: '127.0.0.1',
        port: 1025,
        from: 'Enchères <no-reply@encheres.local>',
        auth: null,
      },
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
      SMTP_HOST: 'smtp-relay.example',
      SMTP_PORT: '587',
      SMTP_USER: 'utilisateur',
      SMTP_PASSWORD: 'secret-smtp',
      SMTP_FROM: 'Enchères <no-reply@encheres.example>',
      PATH: '/usr/bin',
    })

    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      webOrigin: 'https://encheres.example',
      logLevel: 'warn',
      mongoUrl: 'mongodb+srv://app:motdepasse@cluster.example/encheres',
      smtp: {
        host: 'smtp-relay.example',
        port: 587,
        from: 'Enchères <no-reply@encheres.example>',
        auth: { user: 'utilisateur', password: 'secret-smtp' },
      },
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
    ['SMTP_PORT', { SMTP_PORT: 'abc' }],
    ['SMTP_PORT', { SMTP_PORT: '70000' }],
    ['SMTP_FROM', { SMTP_FROM: 'sans adresse' }],
  ])('refuse %s invalide', (name, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError)
    expect(() => loadConfig(env)).toThrow(name)
  })

  it('n’affiche jamais la valeur fautive dans le message d’erreur', () => {
    const value = 'valeur-confidentielle-123'

    for (const name of [
      'PORT',
      'WEB_ORIGIN',
      'NODE_ENV',
      'LOG_LEVEL',
      'MONGO_URL',
      'SMTP_PORT',
      'SMTP_FROM',
    ]) {
      expect(() => loadConfig({ [name]: value })).toThrow(ConfigError)
      try {
        loadConfig({ [name]: value })
      } catch (error) {
        expect((error as Error).message).not.toContain(value)
      }
    }
  })
})

describe('T2.20 — MONGO_URL et SMTP', () => {
  const production = {
    NODE_ENV: 'production',
    MONGO_URL: 'mongodb://127.0.0.1:27017/encheres',
    SMTP_HOST: 'smtp-relay.example',
    SMTP_FROM: 'no-reply@encheres.example',
  }

  it('exige MONGO_URL, SMTP_HOST et SMTP_FROM en production : pas de repli sur les services locaux', () => {
    expect(loadConfig(production).smtp.host).toBe('smtp-relay.example')

    for (const name of ['MONGO_URL', 'SMTP_HOST', 'SMTP_FROM']) {
      const env: Record<string, string> = { ...production }
      delete env[name]
      expect(() => loadConfig(env)).toThrow(new RegExp(`${name} : obligatoire`))
    }
  })

  it('a pour défaut la base et le serveur SMTP de docker-compose.yml hors production', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const config = loadConfig({ NODE_ENV })
      expect(config.mongoUrl).toBe('mongodb://127.0.0.1:27017/encheres')
      expect(config.smtp).toMatchObject({ host: '127.0.0.1', port: 1025, auth: null })
    }
  })

  it('refuse un identifiant SMTP sans mot de passe, et un mot de passe sans identifiant', () => {
    expect(() => loadConfig({ SMTP_USER: 'utilisateur' })).toThrow(/SMTP_PASSWORD/)
    expect(() => loadConfig({ SMTP_PASSWORD: 'secret-smtp' })).toThrow(/SMTP_USER/)
  })

  it('ne laisse pas fuiter les identifiants d’une URL ou d’un mot de passe refusés', () => {
    const url = 'postgres://app:motdepasse-secret@db.example/encheres'

    for (const env of [{ MONGO_URL: url }, { SMTP_PASSWORD: 'secret-smtp' }]) {
      try {
        loadConfig(env)
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError)
        expect((error as Error).message).not.toContain('motdepasse-secret')
        expect((error as Error).message).not.toContain('secret-smtp')
      }
    }
  })
})
