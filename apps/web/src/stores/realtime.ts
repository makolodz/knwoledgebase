import { defineStore } from 'pinia'
import { ref } from 'vue'

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

/** Ce que le store attend d'un socket : permet de le remplacer par un faux dans les tests. */
export interface SocketLike {
  readonly connected: boolean
  on(event: 'connect' | 'disconnect' | 'connect_error', listener: () => void): unknown
  connect(): unknown
}

/** État de la connexion temps réel (docs/technical/screens.md : « Reconnexion… »). */
export const useRealtimeStore = defineStore('realtime', () => {
  const status = ref<RealtimeStatus>('disconnected')

  /** Suit les événements du socket et lance la connexion. À appeler une seule fois. */
  function attach(socket: SocketLike) {
    socket.on('connect', () => (status.value = 'connected'))
    socket.on('disconnect', () => (status.value = 'disconnected'))
    socket.on('connect_error', () => (status.value = 'error'))
    status.value = socket.connected ? 'connected' : 'connecting'
    if (!socket.connected) socket.connect()
  }

  return { status, attach }
})
