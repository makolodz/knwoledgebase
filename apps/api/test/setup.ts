import { beforeEach } from 'vitest'
import { rateLimitClock } from './clock'

const DAY_MS = 24 * 60 * 60 * 1000

// Chaque test repart de compteurs de limites vierges (voir `rateLimitClock`).
beforeEach(() => {
  rateLimitClock.now += DAY_MS
})
