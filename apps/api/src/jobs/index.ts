import type { Mailer } from '../infra/mailer'
import { openDueAuctions } from '../services/auctions'
import { closeDueAuctions } from '../services/closing'
import type { RateLimits } from '../services/rate-limits'
import type { SocketServer } from '../sockets'
import type { Config } from '../config/env'
import { startJob, type Job, type JobLogger } from './runner'
import { sendPendingEmails, type SendEmailsLogger } from './send-emails'

/** Intervalle d'envoi des emails de la file (ADR-008). */
export const SEND_EMAILS_INTERVAL_MS = 5_000

/** Intervalle d'ouverture des enchères `scheduled` arrivées à `startsAt` (ADR-008). */
export const OPEN_AUCTIONS_INTERVAL_MS = 1_000

/** Intervalle de clôture des enchères `live` arrivées à `endsAt` (ADR-008). */
export const CLOSE_AUCTIONS_INTERVAL_MS = 1_000

/** Intervalle de purge des compteurs de limites expirés. */
export const SWEEP_RATE_LIMITS_INTERVAL_MS = 60_000

export interface JobsOptions {
  mailer: Mailer
  rateLimits: Pick<RateLimits, 'sweep'>
  /** Pour diffuser `auction:ended` à la room de l'enchère close. */
  io: Pick<SocketServer, 'to'>
  config: Pick<Config, 'webOrigin'>
  log: JobLogger & SendEmailsLogger
}

/** Démarre les tâches planifiées. Les suivantes (paiements) arrivent à l'étape 6. */
export function startJobs({ mailer, rateLimits, io, config, log }: JobsOptions): Job {
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
      name: 'close-auctions',
      intervalMs: CLOSE_AUCTIONS_INTERVAL_MS,
      run: async () => {
        await closeDueAuctions({
          io,
          config,
          onNotifyError: (error) =>
            log.error({ err: error }, 'Notification de clôture non mise en file'),
        })
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
