import { healthResponseSchema } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestApp } from './helpers'

describe('procédure health', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('T1.2 — répond sans authentification, avec la forme du schéma partagé', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/trpc/health' })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ result: { data: unknown } }>()
    expect(healthResponseSchema.parse(body.result.data).status).toBe('ok')
  })

  it("renvoie l'heure du serveur en UTC", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-12T08:30:00.000Z'))

    const response = await app.inject({ method: 'GET', url: '/api/trpc/health' })

    expect(response.json<{ result: { data: unknown } }>().result.data).toEqual({
      status: 'ok',
      time: '2026-10-12T08:30:00.000Z',
    })
  })
})
