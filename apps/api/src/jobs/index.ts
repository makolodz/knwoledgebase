import type { Mailer } from '../infra/mailer'
import { openDueAuctions } from '../services/auctions'
import type { RateLimits } from '../services/rate-limits'
import { startJob, type Job, type JobLogger } from './runner'
import { sendPendingEmails, type SendEmailsLogger } from './send-emails'

/** Intervalle d'envoi des emails de la file (ADR-008). */
export const SEND_EMAILS_INTERVAL_MS = 5_000

/** Intervalle d'ouverture des enchères `scheduled` arrivées à `startsAt` (ADR-008). */
export const OPEN_AUCTIONS_INTERVAL_MS = 1_000

/** Intervalle de purge des compteurs de limites expirés. */
export const SWEEP_RATE_LIMITS_INTERVAL_MS = 60_000

export interface JobsOptions {
  mailer: Mailer
  rateLimits: Pick<RateLimits, 'sweep'>
  log: JobLogger & SendEmailsLogger
}

/** Démarre les tâches planifiées. Les suivantes (clôture, paiements) arrivent aux étapes 5 et 6. */
export function startJobs({ mailer, rateLimits, log }: JobsOptions): Job {
  const jobs = [
    startJob({
      name: 'send-emails',
      intervalMs: SEND_EMAILS_INTERVAL_MS,
      run: async () => {
        await sendPendingEmails(mailer, log)
      },
      log,
    }),
    startJob({
      name: 'open-auctions',
      intervalMs: OPEN_AUCTIONS_INTERVAL_MS,
      run: async () => {
        await openDueAuctions()
      },
      log,
    }),
    startJob({
      name: 'sweep-rate-limits',
      intervalMs: SWEEP_RATE_LIMITS_INTERVAL_MS,
      run: () => {
        rateLimits.sweep()
        return Promise.resolve()
      },
      log,
    }),
  ]

  return {
    async stop() {
      await Promise.all(jobs.map((job) => job.stop()))
    },
  }
}
