import { describe, expect, it } from 'vitest'
import { RateLimiter } from './rate-limiter'
import { createRateLimits } from './rate-limits'

const MINUTE = 60_000

function limiterWithClock(options: { max: number; windowMs: number }) {
  const clock = { now: 1_000_000 }
  return { clock, limiter: new RateLimiter(options, () => clock.now) }
}

function appCodeOf(action: () => void): string | undefined {
  try {
    action()
  } catch (error) {
    return (error as { appCode?: string }).appCode
  }
  return undefined
}

describe('T2.35 — limiteur en mémoire', () => {
  it('autorise max événements dans la fenêtre, puis refuse avec RATE_LIMITED', () => {
    const { limiter } = limiterWithClock({ max: 3, windowMs: MINUTE })

    for (let attempt = 0; attempt < 3; attempt += 1) limiter.consume('ip')

    expect(appCodeOf(() => limiter.consume('ip'))).toBe('RATE_LIMITED')
    expect(limiter.isBlocked('ip')).toBe(true)
  })

  it('compte chaque clé séparément', () => {
    const { limiter } = limiterWithClock({ max: 1, windowMs: MINUTE })
    limiter.consume('a')

    expect(appCodeOf(() => limiter.consume('b'))).toBeUndefined()
    expect(appCodeOf(() => limiter.consume('a'))).toBe('RATE_LIMITED')
  })

  it('oublie les événements sortis de la fenêtre (fenêtre glissante)', () => {
    const { clock, limiter } = limiterWithClock({ max: 2, windowMs: MINUTE })
    limiter.record('k') // t = 0
    clock.now += 40_000
    limiter.record('k') // t = 40 s : bloqué
    expect(limiter.isBlocked('k')).toBe(true)

    clock.now += 21_000 // t = 61 s : le premier événement est sorti, pas le second
    expect(limiter.isBlocked('k')).toBe(false)
    limiter.record('k')
    expect(limiter.isBlocked('k')).toBe(true)

    clock.now += 40_000 // t = 101 s : le deuxième est sorti à son tour
    expect(limiter.isBlocked('k')).toBe(false)
  })

  it('ne bloque qu’après l’enregistrement quand on sépare vérification et comptage', () => {
    const { limiter } = limiterWithClock({ max: 2, windowMs: MINUTE })

    limiter.assertAllowed('k')
    limiter.assertAllowed('k')
    expect(limiter.isBlocked('k')).toBe(false)

    limiter.record('k')
    limiter.record('k')
    expect(appCodeOf(() => limiter.assertAllowed('k'))).toBe('RATE_LIMITED')
  })

  it('remet une clé à zéro', () => {
    const { limiter } = limiterWithClock({ max: 1, windowMs: MINUTE })
    limiter.record('k')

    limiter.reset('k')

    expect(limiter.isBlocked('k')).toBe(false)
  })

  it('garde en mémoire au plus max dates par clé', () => {
    const { clock, limiter } = limiterWithClock({ max: 2, windowMs: MINUTE })

    for (let attempt = 0; attempt < 50; attempt += 1) {
      clock.now += 1000
      limiter.record('k')
    }

    // Seuls les deux derniers événements comptent : 2 s plus tard, rien n'a encore expiré.
    expect(limiter.isBlocked('k')).toBe(true)
    clock.now += MINUTE
    expect(limiter.isBlocked('k')).toBe(false)
  })

  it('purge les clés expirées', () => {
    const { clock, limiter } = limiterWithClock({ max: 5, windowMs: MINUTE })
    limiter.record('a')
    clock.now += 30_000
    limiter.record('b')
    expect(limiter.size).toBe(2)

    clock.now += 40_000
    limiter.sweep()
    expect(limiter.size).toBe(1)

    clock.now += MINUTE
    limiter.sweep()
    expect(limiter.size).toBe(0)
  })

  it('applique les limites de security.md : 5 échecs par 15 min, 5 actions par heure', () => {
    const clock = { now: 1_000_000 }
    const limits = createRateLimits(() => clock.now)

    for (const limiter of [limits.loginByIp, limits.loginByEmail, limits.passwordCheck]) {
      for (let attempt = 0; attempt < 5; attempt += 1) limiter.consume('k')
      expect(limiter.isBlocked('k')).toBe(true)
      clock.now += 15 * MINUTE + 1
      expect(limiter.isBlocked('k')).toBe(false)
    }
    for (const limiter of [limits.register, limits.forgotPassword, limits.resendVerification]) {
      for (let attempt = 0; attempt < 5; attempt += 1) limiter.consume('k')
      clock.now += 59 * MINUTE
      expect(limiter.isBlocked('k')).toBe(true)
      clock.now += 2 * MINUTE
      expect(limiter.isBlocked('k')).toBe(false)
    }
  })
})
