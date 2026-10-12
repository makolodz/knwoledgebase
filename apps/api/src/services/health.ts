import type { HealthResponse } from '@encheres/shared'

export function getHealth(now: Date = new Date()): HealthResponse {
  return { status: 'ok', time: now.toISOString() }
}
