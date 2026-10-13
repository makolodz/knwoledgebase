import type { Mailer } from '../infra/mailer'
import { startJob, type Job, type JobLogger } from './runner'
import { sendPendingEmails, type SendEmailsLogger } from './send-emails'

/** Intervalle d'envoi des emails de la file (ADR-008). */
export const SEND_EMAILS_INTERVAL_MS = 5_000

export interface JobsOptions {
  mailer: Mailer
  log: JobLogger & SendEmailsLogger
}

/** Démarre les tâches planifiées. Les suivantes (ouverture, clôture, paiements) arrivent aux étapes 3 à 6. */
export function startJobs({ mailer, log }: JobsOptions): Job {
  const jobs = [
    startJob({
      name: 'send-emails',
      intervalMs: SEND_EMAILS_INTERVAL_MS,
      run: async () => {
        await sendPendingEmails(mailer, log)
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
