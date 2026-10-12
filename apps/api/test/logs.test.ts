import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { captureLogs, createTestApp } from './helpers'

describe('T1.5 — logs : champs sensibles masqués (redact)', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
  })

  async function appWithLogs(routes?: (app: FastifyInstance) => void) {
    const logs = captureLogs()
    app = await createTestApp({ config: { logLevel: 'info' }, logStream: logs.stream, routes })
    return { app, logs }
  }

  const SECRET = 'valeur-secrete-a-ne-jamais-logger'

  it('masque password, token, authorization et cookie, à la racine et imbriqués', async () => {
    const { app, logs } = await appWithLogs()

    app.log.info(
      {
        password: SECRET,
        token: SECRET,
        authorization: SECRET,
        cookie: SECRET,
        user: { password: SECRET, refreshToken: SECRET, accessToken: SECRET },
        req: { headers: { authorization: SECRET, cookie: SECRET } },
        res: { headers: { 'set-cookie': SECRET } },
      },
      'message de test',
    )

    expect(logs.raw()).not.toContain(SECRET)
    expect(logs.raw()).toContain('[Redacted]')
  })

  it('masque les en-têtes et le corps d’une vraie requête consignés par une route', async () => {
    const { app, logs } = await appWithLogs((instance) => {
      instance.post('/echo', (request) => {
        request.log.info({ headers: request.headers, body: request.body }, 'requête reçue')
        return { ok: true }
      })
    })

    await app.inject({
      method: 'POST',
      url: '/echo',
      headers: {
        authorization: `Bearer ${SECRET}`,
        cookie: `session=${SECRET}`,
        'content-type': 'application/json',
      },
      payload: { password: SECRET, token: SECRET, pseudo: 'visible' },
    })

    expect(logs.raw()).not.toContain(SECRET)
    expect(logs.raw()).toContain('visible')
  })

  it('ne masque pas les champs ordinaires', async () => {
    const { app, logs } = await appWithLogs()

    app.log.info({ auctionId: 'abc123' }, 'enchère consultée')

    expect(logs.entries().some((entry) => entry.auctionId === 'abc123')).toBe(true)
  })
})
