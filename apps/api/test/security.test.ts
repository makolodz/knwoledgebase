import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp, WEB_ORIGIN } from './helpers'

describe('en-têtes de sécurité et CORS', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('T1.6 — les en-têtes Helmet sont présents, y compris sur une erreur', async () => {
    for (const url of ['/api/trpc/health', '/nexistepas']) {
      const response = await app.inject({ method: 'GET', url })

      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['strict-transport-security']).toBeDefined()
      expect(response.headers['content-security-policy']).toBeDefined()
      expect(response.headers['x-powered-by']).toBeUndefined()
    }
  })

  describe('T1.7 — CORS', () => {
    it('autorise WEB_ORIGIN avec les credentials', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/trpc/health',
        headers: { origin: WEB_ORIGIN },
      })

      expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    it('ne renvoie aucun en-tête d’autorisation à une autre origine', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/trpc/health',
        headers: { origin: 'https://site-tiers.example' },
      })

      // Sans Access-Control-Allow-Origin, le navigateur bloque la lecture de la réponse.
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
      expect(response.headers.vary).toContain('Origin')
    })

    it('répond au préflight de WEB_ORIGIN et refuse celui d’une autre origine', async () => {
      const allowed = await app.inject({
        method: 'OPTIONS',
        url: '/api/trpc/health',
        headers: {
          origin: WEB_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      })
      const refused = await app.inject({
        method: 'OPTIONS',
        url: '/api/trpc/health',
        headers: {
          origin: 'https://site-tiers.example',
          'access-control-request-method': 'POST',
        },
      })

      expect(allowed.statusCode).toBe(204)
      expect(allowed.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
      expect(allowed.headers['access-control-allow-methods']).toContain('POST')
      expect(refused.headers['access-control-allow-origin']).toBeUndefined()
    })
  })
})
