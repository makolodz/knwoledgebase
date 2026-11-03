import type { AckResult } from '@encheres/shared'
import { vi } from 'vitest'
import type { AuctionSocketLike } from '../composables/useAuctionSocket'

type Listener = (...args: never[]) => void

/**
 * Faux socket : seule la frontière réseau est remplacée (docs/technical/testing.md). Le test
 * joue le rôle du serveur avec `serverSends`, et programme les réponses aux acks avec `answer`.
 */
export function createFakeSocket(connected = true) {
  const listeners = new Map<string, Set<Listener>>()
  const emitted: { event: string; payload: unknown }[] = []
  /** Réponse du « serveur » à chaque événement, par défaut un succès. */
  const responders = new Map<string, (payload: unknown) => AckResult | undefined>()

  const socket = {
    connected,
    on(event: string, listener: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(listener)
    },
    off(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener)
    },
    emit(event: string, payload?: unknown, ack?: (result: AckResult) => void) {
      emitted.push({ event, payload })
      const responder = responders.get(event)
      const response: AckResult | undefined = responder ? responder(payload) : { ok: true }
      // Un répondeur qui renvoie `undefined` explicitement simule l'absence de réponse.
      if (typeof ack === 'function' && response !== undefined) ack(response)
    },
    connect: () => connect(),
    disconnect: () => disconnect(),
  }
  const connect = vi.fn(() => {
    socket.connected = true
    fire('connect')
  })
  const disconnect = vi.fn(() => {
    socket.connected = false
    fire('disconnect')
  })

  function fire(event: string, ...args: unknown[]) {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      ;(listener as (...values: unknown[]) => void)(...args)
    }
  }

  return {
    socket: socket as typeof socket & AuctionSocketLike,
    emitted,
    connect,
    disconnect,
    /** Le serveur envoie un événement à ce client. */
    serverSends: fire,
    /** Programme la réponse à un événement ; renvoyer `undefined` = pas d'ack. */
    answer: (event: string, responder: (payload: unknown) => AckResult | undefined) => {
      responders.set(event, responder)
    },
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
    reset() {
      listeners.clear()
      emitted.length = 0
      responders.clear()
      socket.connected = true
    },
  }
}

/** Instance partagée par les tests de pages (qui remplacent `api/socket` par elle). */
export const fake = createFakeSocket()
export const fakeSocket = fake.socket
