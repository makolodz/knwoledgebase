import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { User } from '../src/models'
import type { Context } from '../src/trpc/context'
import {
  adminProcedure,
  authedProcedure,
  createCallerFactory,
  router,
  sellerProcedure,
} from '../src/trpc/trpc'
import { useTestDb } from './db'
import { createTestApp, testConfig } from './helpers'
import { TestClient } from './trpc'
import { createUser, logIn } from './users'

useTestDb()

// Un routeur d'essai : les vraies procédures vendeur et admin arrivent aux étapes 3 et 7.
const testRouter = router({
  authed: authedProcedure.query(({ ctx }) => ctx.user.role),
  seller: sellerProcedure.query(() => 'ok'),
  admin: adminProcedure.query(() => 'ok'),
})
const createCaller = createCallerFactory(testRouter)

let app: FastifyInstance
let client: TestClient

beforeAll(async () => {
  app = await createTestApp()
})
afterAll(async () => {
  await app.close()
})
beforeEach(() => {
  client = new TestClient(app)
})

/** Appelle le routeur d'essai avec les cookies d'un client déjà connecté. */
function callAs(testClient: TestClient) {
  const cookies: Record<string, string> = {}
  const accessToken = testClient.cookie('access_token')
  if (accessToken !== undefined) cookies.access_token = accessToken
  return createCaller({ req: { cookies }, config: testConfig() } as unknown as Context)
}

async function failureOf(call: Promise<unknown>) {
  try {
    await call
  } catch (error) {
    return (error as { appCode?: string }).appCode
  }
  return 'aucune erreur'
}

describe('T2.14 — procédures réservées à un rôle', () => {
  it('refuse un acheteur sur une procédure vendeur ou admin', async () => {
    await createUser({ role: 'buyer' })
    await logIn(client)

    expect(await failureOf(callAs(client).seller())).toBe('FORBIDDEN')
    expect(await failureOf(callAs(client).admin())).toBe('FORBIDDEN')
    expect(await callAs(client).authed()).toBe('buyer')
  })

  it('accepte un vendeur sur une procédure vendeur, pas sur une procédure admin', async () => {
    await createUser({ role: 'seller' })
    await logIn(client)

    expect(await callAs(client).seller()).toBe('ok')
    expect(await failureOf(callAs(client).admin())).toBe('FORBIDDEN')
  })

  it('accepte un admin sur une procédure admin, mais ne le laisse pas vendre', async () => {
    await createUser({ role: 'admin' })
    await logIn(client)

    expect(await callAs(client).admin()).toBe('ok')
    expect(await failureOf(callAs(client).seller())).toBe('FORBIDDEN')
  })

  it('refuse un visiteur non connecté', async () => {
    for (const procedure of ['authed', 'seller', 'admin'] as const) {
      expect(await failureOf(callAs(client)[procedure]())).toBe('NOT_AUTHENTICATED')
    }
  })

  it('relit le rôle en base : un JWT encore valide ne suffit pas', async () => {
    const user = await createUser({ role: 'seller' })
    await logIn(client)
    expect(await callAs(client).seller()).toBe('ok')

    await User.updateOne({ _id: user._id }, { $set: { role: 'buyer' } })

    expect(await failureOf(callAs(client).seller())).toBe('FORBIDDEN')
  })

  it('applique tout de suite une promotion, sans nouvelle connexion', async () => {
    const user = await createUser({ role: 'buyer' })
    await logIn(client)
    expect(await failureOf(callAs(client).admin())).toBe('FORBIDDEN')

    await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } })

    expect(await callAs(client).admin()).toBe('ok')
  })

  it('refuse un vendeur suspendu ou supprimé, même avec un JWT valide', async () => {
    const user = await createUser({ role: 'seller' })
    await logIn(client)

    await User.updateOne({ _id: user._id }, { $set: { suspendedAt: new Date() } })
    expect(await failureOf(callAs(client).seller())).toBe('ACCOUNT_SUSPENDED')

    await User.updateOne({ _id: user._id }, { $set: { suspendedAt: null, deletedAt: new Date() } })
    expect(await failureOf(callAs(client).seller())).toBe('NOT_AUTHENTICATED')
  })
})
