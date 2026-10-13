import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Session, User } from '../src/models'
import { useTestDb } from './db'
import { rateLimitClock as clock } from './clock'
import { createTestApp, WEB_ORIGIN } from './helpers'
import { TestClient } from './trpc'
import { createUser, logIn, PASSWORD } from './users'

useTestDb()

const MINUTE = 60_000

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})

const fromIp = (ip: string) => new TestClient(app, {}, ip)

async function failLogin(client: TestClient, email = 'ana@x.fr') {
  return client.mutate('auth.login', { email, password: 'mauvais-mot-de-passe' })
}

describe('T2.18 — connexion : 5 échecs par 15 min, par IP et par email', () => {
  it('bloque la sixième tentative, même avec le bon mot de passe', async () => {
    await createUser()
    const client = fromIp('10.0.0.1')

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await failLogin(client)).error?.data.code).toBe('INVALID_CREDENTIALS')
    }
    const blocked = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })

    expect(blocked.status).toBe(429)
    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
    expect(blocked.cookies).toEqual([])
    expect(await Session.countDocuments()).toBe(0)
  })

  it('bloque l’email visé même quand les échecs viennent d’adresses IP différentes', async () => {
    await createUser()
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await failLogin(fromIp(`10.0.1.${attempt}`))
    }

    const blocked = await fromIp('10.0.1.99').mutate('auth.login', {
      email: 'ana@x.fr',
      password: PASSWORD,
    })

    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
    // Une autre adresse email, depuis cette même IP, n'est pas touchée.
    await createUser({ email: 'bob@x.fr', name: 'Bob' })
    const other = await fromIp('10.0.1.99').mutate('auth.login', {
      email: 'bob@x.fr',
      password: PASSWORD,
    })
    expect(other.error).toBeUndefined()
  })

  it('bloque l’adresse IP même quand les échecs visent des emails différents ou inconnus', async () => {
    await createUser()
    const client = fromIp('10.0.2.1')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failLogin(client, `inconnu${attempt}@x.fr`)
    }

    const blocked = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })

    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
    const otherIp = await fromIp('10.0.2.2').mutate('auth.login', {
      email: 'ana@x.fr',
      password: PASSWORD,
    })
    expect(otherIp.error).toBeUndefined()
  })

  it('donne la même réponse de blocage pour un email inconnu et pour un email existant', async () => {
    await createUser()
    const known = fromIp('10.0.3.1')
    const unknown = fromIp('10.0.3.2')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failLogin(known, 'ana@x.fr')
      await failLogin(unknown, 'inconnu@x.fr')
    }

    const blockedKnown = await fromIp('10.0.3.3').mutate('auth.login', {
      email: 'ana@x.fr',
      password: 'x',
    })
    const blockedUnknown = await fromIp('10.0.3.4').mutate('auth.login', {
      email: 'inconnu@x.fr',
      password: 'x',
    })

    expect(blockedUnknown.status).toBe(blockedKnown.status)
    expect(blockedUnknown.raw).toBe(blockedKnown.raw)
  })

  it('autorise de nouveau la connexion quand les 15 minutes sont écoulées', async () => {
    await createUser()
    const client = fromIp('10.0.4.1')
    for (let attempt = 0; attempt < 5; attempt += 1) await failLogin(client)
    expect((await failLogin(client)).error?.data.code).toBe('RATE_LIMITED')

    clock.now += 15 * MINUTE + 1000

    const result = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })
    expect(result.error).toBeUndefined()
  })

  it('ne compte plus les échecs plus anciens que la fenêtre', async () => {
    await createUser()
    const client = fromIp('10.0.5.1')
    for (let attempt = 0; attempt < 4; attempt += 1) await failLogin(client)

    clock.now += 16 * MINUTE
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await failLogin(client)).error?.data.code).toBe('INVALID_CREDENTIALS')
    }
  })

  it('remet à zéro le compteur de l’email après une connexion réussie, pas celui de l’IP', async () => {
    await createUser()
    const attacker = fromIp('10.0.6.1')
    for (let attempt = 0; attempt < 4; attempt += 1) await failLogin(attacker)

    // Le propriétaire se connecte depuis une autre IP : le compteur de l'email repart de zéro.
    const owner = fromIp('10.0.6.2')
    expect((await logIn(owner)).error).toBeUndefined()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await failLogin(fromIp('10.0.6.3'))).error?.data.code).toBe('INVALID_CREDENTIALS')
    }

    // L'IP de l'attaquant, elle, garde ses 4 échecs : un de plus et elle est bloquée.
    expect((await failLogin(attacker, 'autre@x.fr')).error?.data.code).toBe('INVALID_CREDENTIALS')
    expect((await failLogin(attacker, 'autre@x.fr')).error?.data.code).toBe('RATE_LIMITED')
  })

  it('ne compte pas comme un échec le bon mot de passe d’un compte suspendu', async () => {
    await createUser({ suspendedAt: new Date() })
    const client = fromIp('10.0.7.1')

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })
      expect(result.error?.data.code).toBe('ACCOUNT_SUSPENDED')
    }
  })
})

describe('T2.35 — inscription, mot de passe oublié, renvoi du lien : 5 par heure et par IP', () => {
  const registration = (index: number) => ({
    email: `utilisateur${index}@x.fr`,
    password: PASSWORD,
    name: 'Ana',
    acceptTerms: true,
    confirmAdult: true,
  })

  it('limite l’inscription, par IP', async () => {
    const client = fromIp('10.1.0.1')
    for (let index = 0; index < 5; index += 1) {
      expect((await client.mutate('auth.register', registration(index))).error).toBeUndefined()
    }

    const blocked = await client.mutate('auth.register', registration(5))

    expect(blocked.status).toBe(429)
    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
    expect(await User.countDocuments()).toBe(5)
    expect(
      (await fromIp('10.1.0.2').mutate('auth.register', registration(5))).error,
    ).toBeUndefined()
  })

  it('limite aussi les inscriptions qui échouent à la validation', async () => {
    const client = fromIp('10.1.1.1')
    for (let index = 0; index < 5; index += 1) {
      await client.mutate('auth.register', { ...registration(index), password: 'court' })
    }

    const blocked = await client.mutate('auth.register', registration(9))

    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
  })

  it('limite le mot de passe oublié, par IP', async () => {
    const client = fromIp('10.1.2.1')
    for (let index = 0; index < 5; index += 1) {
      expect(
        (await client.mutate('auth.forgotPassword', { email: `a${index}@x.fr` })).error,
      ).toBeUndefined()
    }

    const blocked = await client.mutate('auth.forgotPassword', { email: 'a6@x.fr' })

    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
    expect(
      (await fromIp('10.1.2.2').mutate('auth.forgotPassword', { email: 'a6@x.fr' })).error,
    ).toBeUndefined()
  })

  it('limite le renvoi du lien de vérification, par IP', async () => {
    await createUser({ emailVerifiedAt: new Date() })
    const client = fromIp('10.1.3.1')
    await logIn(client)
    for (let index = 0; index < 5; index += 1) {
      expect((await client.mutate('auth.resendVerification')).error).toBeUndefined()
    }

    const blocked = await client.mutate('auth.resendVerification')

    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
  })

  it('autorise de nouveau l’action une heure plus tard', async () => {
    const client = fromIp('10.1.4.1')
    for (let index = 0; index < 5; index += 1) {
      await client.mutate('auth.forgotPassword', { email: `a${index}@x.fr` })
    }
    expect((await client.mutate('auth.forgotPassword', { email: 'b@x.fr' })).error?.data.code).toBe(
      'RATE_LIMITED',
    )

    clock.now += 61 * MINUTE

    expect((await client.mutate('auth.forgotPassword', { email: 'b@x.fr' })).error).toBeUndefined()
  })
})

describe('T2.37 — mot de passe actuel refusé : 5 par 15 min, par utilisateur', () => {
  const changePassword = (client: TestClient, currentPassword: string) =>
    client.mutate('profile.changePassword', {
      currentPassword,
      newPassword: 'un-tout-nouveau-mot-de-passe',
    })

  it('bloque les devinettes sur le changement de mot de passe et d’email, même avec une session valide', async () => {
    await createUser()
    const client = fromIp('10.2.0.1')
    await logIn(client)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await changePassword(client, 'faux-mot-de-passe')).error?.data.code).toBe(
        'INVALID_CREDENTIALS',
      )
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await client.mutate('profile.changeEmail', {
        currentPassword: 'faux-mot-de-passe',
        newEmail: 'nouvelle@x.fr',
      })
      expect(result.error?.data.code).toBe('INVALID_CREDENTIALS')
    }

    const blocked = await changePassword(client, PASSWORD)
    expect(blocked.status).toBe(429)
    expect(blocked.error?.data.code).toBe('RATE_LIMITED')
    expect((await User.findOne().orFail()).passwordHash).not.toBeNull()
  })

  it('ne touche pas aux autres utilisateurs, et se vide après un succès', async () => {
    await createUser()
    await createUser({ email: 'bob@x.fr', name: 'Bob' })
    const ana = fromIp('10.2.1.1')
    const bob = fromIp('10.2.1.2')
    await logIn(ana)
    await logIn(bob, 'bob@x.fr')

    for (let attempt = 0; attempt < 4; attempt += 1) await changePassword(ana, 'faux-mot-de-passe')
    expect((await changePassword(bob, 'faux-mot-de-passe')).error?.data.code).toBe(
      'INVALID_CREDENTIALS',
    )

    // Un succès remet le compteur à zéro : quatre nouveaux échecs ne bloquent pas.
    const success = await ana.mutate('profile.changeEmail', {
      currentPassword: PASSWORD,
      newEmail: 'nouvelle@x.fr',
    })
    expect(success.error).toBeUndefined()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await changePassword(ana, 'faux-mot-de-passe')).error?.data.code).toBe(
        'INVALID_CREDENTIALS',
      )
    }
  })
})

describe('T2.36 — limite globale de l’API par IP', () => {
  it('refuse au-delà de la limite avec RATE_LIMITED, en gardant les en-têtes CORS', async () => {
    const limited = await createTestApp({ rateLimit: { globalMax: 5 } })
    try {
      const request = (remoteAddress: string) =>
        limited.inject({
          method: 'GET',
          url: '/api/trpc/health',
          headers: { origin: WEB_ORIGIN },
          remoteAddress,
        })
      for (let index = 0; index < 5; index += 1) {
        expect((await request('10.3.0.1')).statusCode).toBe(200)
      }

      const blocked = await request('10.3.0.1')

      expect(blocked.statusCode).toBe(429)
      expect(blocked.json()).toEqual({
        error: { code: 'RATE_LIMITED', message: 'Trop de requêtes.' },
      })
      expect(blocked.headers['retry-after']).toBeDefined()
      expect(blocked.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
      // Une autre IP n'est pas concernée.
      expect((await request('10.3.0.2')).statusCode).toBe(200)
    } finally {
      await limited.close()
    }
  })

  it('autorise 300 requêtes par minute par défaut', async () => {
    const defaults = await createTestApp()
    try {
      const responses = await Promise.all(
        Array.from({ length: 300 }, () =>
          defaults.inject({ method: 'GET', url: '/api/trpc/health', remoteAddress: '10.3.1.1' }),
        ),
      )
      expect(responses.every((response) => response.statusCode === 200)).toBe(true)

      const blocked = await defaults.inject({
        method: 'GET',
        url: '/api/trpc/health',
        remoteAddress: '10.3.1.1',
      })
      expect(blocked.statusCode).toBe(429)
    } finally {
      await defaults.close()
    }
  })
})
