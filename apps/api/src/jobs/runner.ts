export interface JobLogger {
  error(object: object, message: string): void
}

export interface Job {
  /** Arrête les passages à venir et attend la fin du passage en cours. */
  stop(): Promise<void>
}

export interface JobOptions {
  name: string
  intervalMs: number
  run: () => Promise<void>
  log: JobLogger
}

/**
 * Boucle `setInterval` d'une tâche planifiée (ADR-008). Un passage ne démarre jamais tant que le
 * précédent n'est pas terminé, et une erreur est journalisée sans arrêter la boucle : le passage
 * suivant réessaie. Le premier passage a lieu tout de suite, pour rattraper un redémarrage.
 */
export function startJob({ name, intervalMs, run, log }: JobOptions): Job {
  let current: Promise<void> | null = null

  function tick() {
    if (current !== null) return
    current = run()
      .catch((error: unknown) => {
        log.error({ err: error, job: name }, 'Erreur dans une tâche planifiée')
      })
      .finally(() => {
        current = null
      })
  }

  const timer = setInterval(tick, intervalMs)
  tick()

  return {
    async stop() {
      clearInterval(timer)
      await current
    },
  }
}
