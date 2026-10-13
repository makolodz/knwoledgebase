import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startJob } from './runner'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('T2.27 — boucle des tâches planifiées', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fait un premier passage tout de suite, puis un par intervalle', async () => {
    const run = vi.fn(() => Promise.resolve())
    const job = startJob({ name: 'test', intervalMs: 1000, run, log: { error: vi.fn() } })

    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(run).toHaveBeenCalledTimes(4)

    await job.stop()
  })

  it('ne démarre jamais un passage tant que le précédent n’est pas terminé', async () => {
    const running = deferred()
    const run = vi.fn(() => running.promise)
    const job = startJob({ name: 'test', intervalMs: 1000, run, log: { error: vi.fn() } })

    await vi.advanceTimersByTimeAsync(5000)
    expect(run).toHaveBeenCalledTimes(1)

    running.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)

    await job.stop()
  })

  it('journalise une erreur sans arrêter la boucle', async () => {
    const error = vi.fn()
    const failure = new Error('base indisponible')
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined)
    const job = startJob({ name: 'envoi', intervalMs: 1000, run, log: { error } })

    await vi.advanceTimersByTimeAsync(2000)

    expect(error).toHaveBeenCalledWith({ err: failure, job: 'envoi' }, expect.any(String))
    expect(run).toHaveBeenCalledTimes(3)

    await job.stop()
  })

  it('attend la fin du passage en cours à l’arrêt, puis ne repasse plus', async () => {
    const running = deferred()
    const run = vi.fn(() => running.promise)
    const job = startJob({ name: 'test', intervalMs: 1000, run, log: { error: vi.fn() } })

    let stopped = false
    const stopping = job.stop().then(() => {
      stopped = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(stopped).toBe(false)

    running.resolve()
    await stopping
    await vi.advanceTimersByTimeAsync(10_000)

    expect(stopped).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
