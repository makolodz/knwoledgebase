import { vi } from 'vitest'
import type { Mailer } from '../src/infra/mailer'

/**
 * Faux `mailer` : la seule frontière qu'on remplace dans les tests (docs/technical/testing.md).
 * `send` réussit par défaut ; `send.mockRejectedValueOnce(...)` simule une panne SMTP.
 */
export function createFakeMailer() {
  const send = vi.fn<Mailer['send']>().mockResolvedValue(undefined)
  const mailer: Mailer = { send }
  return { mailer, send }
}
