import { describe, expect, it } from 'vitest'
import { healthResponseSchema } from './health'

describe('healthResponseSchema (T1.4)', () => {
  it('accepte une réponse valide', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      time: '2026-10-12T08:30:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it.each([
    ['un statut différent de "ok"', { status: 'down', time: '2026-10-12T08:30:00.000Z' }],
    ["une date qui n'est pas ISO", { status: 'ok', time: 'hier' }],
    [
      'une date avec décalage horaire (le serveur répond en UTC)',
      { status: 'ok', time: '2026-10-12T10:30:00+02:00' },
    ],
    ['un champ manquant', { status: 'ok' }],
    ['un champ inconnu', { status: 'ok', time: '2026-10-12T08:30:00.000Z', debug: true }],
    ['un type incorrect', { status: 'ok', time: 1760257800000 }],
  ])('rejette %s', (_label, input) => {
    expect(healthResponseSchema.safeParse(input).success).toBe(false)
  })
})
