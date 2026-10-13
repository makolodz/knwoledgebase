import { createHash } from 'node:crypto'
import type { CurrentUser } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { decodeJwt, SignJWT } from 'jose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { REFRESH_GRACE_MS } from '../src/services/sessions'
import { signAccessToken } from '../src/services/jwt'
import { Session, User } from '../src/models'
import { useTestDb } from './db'
import { captureLogs, createTestApp, testConfig } from './helpers'
import { TestClient } from './trpc'
import { createUser, logIn, PASSWORD } from './users'

useTestDb()

let app: FastifyInstance
let client: TestClient

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(() => {
  client = new TestClient(app, { 'user-agent': 'Navigateur de test/1.0' })
})

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const SECRET = testConfig().jwtSecret

describe('T2.8 — connexion', () => {
  it('ouvre une session et renvoie l’utilisateur, sans hash ni token', async () => {
    const user = await createUser()

    const result = await logIn(client)

    expect(result.status).toBe(200)
    expect(result.data.user).toEqual({
      id: user._id.toString(),
      name: 'Ana',
      email: 'ana@x.fr',
      role: 'buyer',
      emailVerified: false,
    })
    expect(result.raw).not.toContain('passwordHash')
    expect(result.raw).not.toContain('argon2')
    expect(result.raw).not.toContain(client.cookie('access_token') as string)
    expect(result.raw).not.toContain(client.cookie('refresh_token') as string)
  })

  it('accepte un compte dont l’email n’est pas vérifié, et un email saisi avec des majuscules', async () => {
    await createUser({ emailVerifiedAt: null })

    const result = await client.mutate('auth.login', { email: ' ANA@x.fr ', password: PASSWORD })

    expect(result.error).toBeUndefined()
    expect(result.data).toMatchObject({ user: { emailVerified: false } })
  })

  it('donne exactement la même réponse pour un email inconnu et pour un mauvais mot de passe', async () => {
    await createUser()

    const wrongPassword = await client.mutate('auth.login', {
      email: 'ana@x.fr',
      password: 'mauvais-mot-de-passe',
    })
    const unknownEmail = await client.mutate('auth.login', {
      email: 'inconnu@x.fr',
      password: PASSWORD,
    })

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(wrongPassword.status)
    expect(unknownEmail.error?.data.code).toBe('INVALID_CREDENTIALS')
    expect(unknownEmail.error?.message).toBe(wrongPassword.error?.message)
    expect(unknownEmail.cookies).toEqual([])
    expect(wrongPassword.cookies).toEqual([])
  })

  it('enregistre la session avec le hash du refresh token, jamais sa valeur', async () => {
    const user = await createUser()
    await logIn(client)

    const session = await Session.findOne().orFail()
    const refreshToken = client.cookie('refresh_token') as string
    expect(session.userId.equals(user._id)).toBe(true)
    expect(session.refreshTokenHash).toBe(sha256(refreshToken))
    expect(session.userAgent).toBe('Navigateur de test/1.0')
    expect(JSON.stringify(await Session.find().lean())).not.toContain(refreshToken)
    const lifetime = session.expiresAt.getTime() - session.createdAt.getTime()
    expect(Math.abs(lifetime - 30 * 24 * 60 * 60 * 1000)).toBeLessThan(5000)
  })
})

describe('T2.9 — compte suspendu ou supprimé', () => {
  it('refuse la connexion d’un compte suspendu, avec un code dédié pour qui connaît le mot de passe', async () => {
    await createUser({ suspendedAt: new Date() })

    const result = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })

    expect(result.status).toBe(403)
    expect(result.error?.data.code).toBe('ACCOUNT_SUSPENDED')
    expect(result.cookies).toEqual([])
    expect(await Session.countDocuments()).toBe(0)
  })

  it('ne révèle pas la suspension à qui ne connaît pas le mot de passe', async () => {
    await createUser({ suspendedAt: new Date() })

    const result = await client.mutate('auth.login', {
      email: 'ana@x.fr',
      password: 'mauvais-mot-de-passe',
    })

    expect(result.error?.data.code).toBe('INVALID_CREDENTIALS')
  })

  it('refuse la connexion d’un compte supprimé comme s’il n’existait pas', async () => {
    await createUser({ deletedAt: new Date() })

    const result = await client.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })

    expect(result.status).toBe(401)
    expect(result.error?.data.code).toBe('INVALID_CREDENTIALS')
    expect(await Session.countDocuments()).toBe(0)
  })
})

describe('T2.29 — cookies de session et access token', () => {
  it('pose l’access token sur tout le site et le refresh token sur la seule procédure de refresh', async () => {
    await createUser()
    const result = await logIn(client)

    const byName = Object.fromEntries(result.cookies.map((cookie) => [cookie.name, cookie]))
    expect(byName.access_token).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 15 * 60,
    })
    expect(byName.refresh_token).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api/trpc/auth.refresh',
      maxAge: 30 * 24 * 60 * 60,
    })
    // Hors production (http://localhost), pas de Secure.
    expect(byName.access_token?.secure).toBeFalsy()
  })

  it('marque les cookies Secure en production', async () => {
    const production = await createTestApp({ config: { nodeEnv: 'production' } })
    try {
      await createUser()
      const productionClient = new TestClient(production)
      const result = await logIn(productionClient)

      expect(result.cookies).toHaveLength(2)
      expect(result.cookies.every((cookie) => cookie.secure === true)).toBe(true)
    } finally {
      await production.close()
    }
  })

  it('n’envoie le refresh token qu’à auth.refresh', async () => {
    await createUser()
    await logIn(client)

    expect(client.cookiesSentTo('auth.me')).toEqual(['access_token'])
    expect(client.cookiesSentTo('auth.refresh')).toEqual(['access_token', 'refresh_token'])
  })

  it('met seulement l’identifiant d’utilisateur et de session dans le JWT : ni rôle, ni email, ni nom', async () => {
    const user = await createUser({ role: 'admin' })
    await logIn(client)

    const claims = decodeJwt(client.cookie('access_token') as string)
    const session = await Session.findOne().orFail()
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sid', 'sub'])
    expect(claims.sub).toBe(user._id.toString())
    expect(claims.sid).toBe(session._id.toString())
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(15 * 60)
  })
})

describe('T2.30 — auth.me', () => {
  it('renvoie l’utilisateur connecté', async () => {
    const user = await createUser()
    await logIn(client)

    const result = await client.query<{ user: CurrentUser }>('auth.me')

    expect(result.status).toBe(200)
    expect(result.data.user.id).toBe(user._id.toString())
    expect(result.raw).not.toContain('passwordHash')
  })

  it('refuse un appel sans session', async () => {
    const result = await client.query('auth.me')

    expect(result.status).toBe(401)
    expect(result.error?.data.code).toBe('NOT_AUTHENTICATED')
  })

  it('refuse un token falsifié, d’un autre secret, expiré, sans signature ou au sujet invalide', async () => {
    const user = await createUser()
    const claims = { userId: user._id.toString(), sessionId: 'session' }
    const valid = await signAccessToken(SECRET, claims)
    // On change le premier caractère de la signature : le dernier ne porte que des bits de bourrage,
    // et le modifier peut laisser la signature identique.
    const [header, payload, signature = ''] = valid.split('.')
    const tamperedSignature = (signature.startsWith('A') ? 'B' : 'A') + signature.slice(1)
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const tokens: Record<string, string> = {
      falsifié: `${header}.${payload}.${tamperedSignature}`,
      'autre secret': await signAccessToken('un-autre-secret-de-plus-de-32-caractères!', claims),
      expiré: await signAccessToken(SECRET, claims, new Date(Date.now() - 20 * 60 * 1000)),
      'sans signature': `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: claims.userId, sid: 'x' })}.`,
      'sujet invalide': await signAccessToken(SECRET, { userId: 'pas-un-id', sessionId: 's' }),
      'sans identifiant de session': await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.userId)
        .setExpirationTime('15m')
        .sign(new TextEncoder().encode(SECRET)),
    }

    for (const [label, token] of Object.entries(tokens)) {
      const anonymous = new TestClient(app)
      anonymous.setCookie('access_token', token)

      const result = await anonymous.query('auth.me')

      expect([label, result.status, result.error?.data.code]).toEqual([
        label,
        401,
        'NOT_AUTHENTICATED',
      ])
    }
    // Contrôle : le même token valide est accepté.
    const accepted = new TestClient(app)
    accepted.setCookie('access_token', valid)
    expect((await accepted.query('auth.me')).status).toBe(200)
  })

  it('relit l’utilisateur en base : rôle, suspension et suppression s’appliquent sans attendre l’expiration du JWT', async () => {
    const user = await createUser()
    await logIn(client)
    expect((await client.query<{ user: CurrentUser }>('auth.me')).data.user.role).toBe('buyer')

    await User.updateOne({ _id: user._id }, { $set: { role: 'seller' } })
    expect((await client.query<{ user: CurrentUser }>('auth.me')).data.user.role).toBe('seller')

    await User.updateOne({ _id: user._id }, { $set: { suspendedAt: new Date() } })
    const suspended = await client.query('auth.me')
    expect(suspended.status).toBe(403)
    expect(suspended.error?.data.code).toBe('ACCOUNT_SUSPENDED')

    await User.updateOne({ _id: user._id }, { $set: { suspendedAt: null, deletedAt: new Date() } })
    expect((await client.query('auth.me')).error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})

describe('T2.11 — refresh avec rotation', () => {
  it('remplace le refresh token et renvoie un nouvel access token', async () => {
    await createUser()
    await logIn(client)
    const oldRefresh = client.cookie('refresh_token') as string

    const result = await client.mutate<{ user: CurrentUser }>('auth.refresh')

    expect(result.status).toBe(200)
    expect(result.data.user.email).toBe('ana@x.fr')
    expect(client.cookie('refresh_token')).not.toBe(oldRefresh)
    // L'access token est renvoyé aussi (identique s'il est émis dans la même seconde).
    expect(result.cookies.map((cookie) => cookie.name).sort()).toEqual([
      'access_token',
      'refresh_token',
    ])
    const session = await Session.findOne().orFail()
    expect(session.refreshTokenHash).toBe(sha256(client.cookie('refresh_token') as string))
    expect(session.previousRefreshTokenHash).toBe(sha256(oldRefresh))
    expect((await client.query('auth.me')).status).toBe(200)
  })

  it('permet de rafraîchir plusieurs fois de suite', async () => {
    await createUser()
    await logIn(client)

    for (let round = 0; round < 3; round += 1) {
      expect((await client.mutate('auth.refresh')).status).toBe(200)
    }

    expect(await Session.countDocuments()).toBe(1)
  })

  it('révoque toutes les sessions quand un ancien refresh token est rejoué après le délai de grâce', async () => {
    const user = await createUser()
    await logIn(client)
    const stolen = client.cookie('refresh_token') as string
    const otherDevice = new TestClient(app)
    await logIn(otherDevice)
    await client.mutate('auth.refresh')
    expect(await Session.countDocuments({ userId: user._id })).toBe(2)
    await Session.updateMany(
      {},
      { $set: { lastUsedAt: new Date(Date.now() - REFRESH_GRACE_MS - 1000) } },
    )

    const thief = new TestClient(app)
    thief.setCookie('refresh_token', stolen, '/api/trpc/auth.refresh')
    const result = await thief.mutate('auth.refresh')

    expect(result.status).toBe(401)
    expect(result.error?.data.code).toBe('NOT_AUTHENTICATED')
    expect(await Session.countDocuments({ userId: user._id })).toBe(0)
    // Le vrai utilisateur est déconnecté lui aussi : il devra se reconnecter.
    expect((await client.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')
    expect((await otherDevice.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')
  })

  it('ne touche à rien quand l’ancien token est rejoué pendant le délai de grâce (deux onglets)', async () => {
    await createUser()
    await logIn(client)
    const previous = client.cookie('refresh_token') as string
    await client.mutate('auth.refresh')

    const secondTab = new TestClient(app)
    secondTab.setCookie('refresh_token', previous, '/api/trpc/auth.refresh')
    const result = await secondTab.mutate('auth.refresh')

    expect(result.status).toBe(409)
    expect(result.error?.data.code).toBe('REFRESH_CONFLICT')
    expect(result.cookies).toEqual([])
    expect(await Session.countDocuments()).toBe(1)
    // L'autre onglet n'est pas déconnecté.
    expect((await client.mutate('auth.refresh')).status).toBe(200)
  })

  it('ne laisse réussir qu’une seule de deux requêtes simultanées avec le même refresh token', async () => {
    await createUser()
    await logIn(client)
    const refreshToken = client.cookie('refresh_token') as string
    const tabs = [new TestClient(app), new TestClient(app)]
    for (const tab of tabs) tab.setCookie('refresh_token', refreshToken, '/api/trpc/auth.refresh')

    const results = await Promise.all(tabs.map((tab) => tab.mutate('auth.refresh')))

    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(await Session.countDocuments()).toBe(1)
  })

  it('refuse sans cookie, avec un token inconnu ou avec une session expirée, et retire les cookies', async () => {
    await createUser()
    await logIn(client)

    const anonymous = new TestClient(app)
    expect((await anonymous.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')

    const unknown = new TestClient(app)
    unknown.setCookie('refresh_token', 'inconnu', '/api/trpc/auth.refresh')
    expect((await unknown.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')

    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await client.mutate('auth.refresh')
    expect(expired.status).toBe(401)
    expect(expired.error?.data.code).toBe('NOT_AUTHENTICATED')
    expect(client.cookie('refresh_token')).toBeUndefined()
    expect(client.cookie('access_token')).toBeUndefined()
  })

  it('refuse à un compte suspendu depuis la connexion, et ferme ses sessions', async () => {
    const user = await createUser()
    await logIn(client)
    await User.updateOne({ _id: user._id }, { $set: { suspendedAt: new Date() } })

    const result = await client.mutate('auth.refresh')

    expect(result.status).toBe(401)
    expect(result.error?.data.code).toBe('NOT_AUTHENTICATED')
    expect(await Session.countDocuments()).toBe(0)
  })
})

describe('T2.31 — déconnexion', () => {
  it('ferme la session courante, retire les cookies et rend le refresh token inutilisable', async () => {
    await createUser()
    await logIn(client)
    const refreshToken = client.cookie('refresh_token') as string

    const result = await client.mutate('auth.logout')

    expect(result.status).toBe(200)
    expect(await Session.countDocuments()).toBe(0)
    expect(client.cookie('access_token')).toBeUndefined()
    expect(client.cookie('refresh_token')).toBeUndefined()
    const replay = new TestClient(app)
    replay.setCookie('refresh_token', refreshToken, '/api/trpc/auth.refresh')
    expect((await replay.mutate('auth.refresh')).error?.data.code).toBe('NOT_AUTHENTICATED')
  })

  it('ne ferme que la session courante, pas celles des autres appareils', async () => {
    await createUser()
    await logIn(client)
    const otherDevice = new TestClient(app)
    await logIn(otherDevice)

    await client.mutate('auth.logout')

    expect(await Session.countDocuments()).toBe(1)
    expect((await otherDevice.mutate('auth.refresh')).status).toBe(200)
  })

  it('refuse sans session', async () => {
    expect((await client.mutate('auth.logout')).error?.data.code).toBe('NOT_AUTHENTICATED')
  })
})

describe('T2.32 — logs', () => {
  it('ne contiennent ni mot de passe, ni token, ni cookie, ni hash', async () => {
    const logs = captureLogs()
    const loggedApp = await createTestApp({ config: { logLevel: 'trace' }, logStream: logs.stream })
    try {
      const loggedClient = new TestClient(loggedApp)
      await loggedClient.mutate('auth.register', {
        email: 'ana@x.fr',
        password: PASSWORD,
        name: 'Ana',
        acceptTerms: true,
        confirmAdult: true,
      })
      await loggedClient.mutate('auth.login', { email: 'ana@x.fr', password: PASSWORD })
      await loggedClient.mutate('auth.login', {
        email: 'ana@x.fr',
        password: 'mauvais-mot-de-passe',
      })
      await loggedClient.query('auth.me')
      await loggedClient.mutate('auth.refresh')

      const raw = logs.raw()
      expect(raw.length).toBeGreaterThan(0)
      for (const secret of [
        PASSWORD,
        'mauvais-mot-de-passe',
        loggedClient.cookie('access_token') ?? 'absent',
        loggedClient.cookie('refresh_token') ?? 'absent',
        (await User.findOne().orFail()).passwordHash ?? 'absent',
      ]) {
        expect(raw).not.toContain(secret)
      }
    } finally {
      await loggedApp.close()
    }
  })
})
