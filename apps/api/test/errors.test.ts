import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './helpers'

describe('réponses d’erreur', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  // T1.3 : une requête mal formée est refusée proprement, jamais par une erreur 500.
  describe('T1.3 — requête mal formée', () => {
    const cases = [
      {
        label: 'corps JSON invalide',
        request: {
          method: 'POST',
          url: '/api/trpc/health',
          headers: { 'content-type': 'application/json' },
          payload: '{ pas du json',
        },
      },
      {
        label: 'Content-Type texte brut',
        request: {
          method: 'POST',
          url: '/api/trpc/health',
          headers: { 'content-type': 'text/plain' },
          payload: 'bonjour',
        },
      },
      {
        label: 'Content-Type absent',
        request: { method: 'POST', url: '/api/trpc/health', payload: 'bonjour' },
      },
      // Le cas « paramètre `input` illisible » s'ajoutera avec la première procédure qui a une
      // entrée (étape 2) : tRPC ignore `input` quand la procédure n'en déclare pas.
      {
        label: 'mauvaise méthode (DELETE)',
        request: { method: 'DELETE', url: '/api/trpc/health' },
      },
      {
        label: 'procédure inconnue',
        request: { method: 'GET', url: '/api/trpc/nexistepas' },
      },
      { label: 'route inconnue', request: { method: 'GET', url: '/nexistepas' } },
    ] as const

    it.each(cases)('$label : 4xx, pas de 500', async ({ request }) => {
      const response = await app.inject(request)

      expect(response.statusCode).toBeGreaterThanOrEqual(400)
      expect(response.statusCode).toBeLessThan(500)
    })

    it('route inconnue : JSON { error: { code, message } } (docs/technical/api.md)', async () => {
      const response = await app.inject({ method: 'GET', url: '/nexistepas' })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'Ressource introuvable.' },
      })
    })
  })

  // T1.10 : aucune réponse d'erreur ne laisse échapper de détail interne.
  describe('T1.10 — aucun détail interne', () => {
    it.each([
      ['procédure inconnue', { method: 'GET', url: '/api/trpc/nexistepas' }],
      [
        'corps JSON invalide',
        {
          method: 'POST',
          url: '/api/trpc/health',
          headers: { 'content-type': 'application/json' },
          payload: '{ pas du json',
        },
      ],
      ['route inconnue', { method: 'GET', url: '/nexistepas' }],
    ] as const)('%s : ni stack, ni chemin de fichier', async (_label, request) => {
      const response = await app.inject(request)

      expect(response.body).not.toMatch(/"stack"/)
      expect(response.body).not.toMatch(/\bat .+\(.+:\d+:\d+\)/)
      expect(response.body).not.toMatch(/node_modules|[A-Za-z]:\\|\/Users\/|\/home\//)
    })

    it('une erreur inattendue renvoie une erreur 500 générique et la consigne dans les logs', async () => {
      const failing = await createTestApp({
        routes: (instance) => {
          instance.get('/boom', () => {
            throw new Error('détail secret : mot de passe de la base')
          })
        },
      })
      const response = await failing.inject({ method: 'GET', url: '/boom' })
      await failing.close()

      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Erreur interne.' },
      })
      expect(response.body).not.toContain('secret')
    })
  })
})
