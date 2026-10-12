import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeStore, type SocketLike } from '../stores/realtime'
import RealtimeIndicator from './RealtimeIndicator.vue'

/** Faux socket : seule la frontière réseau est remplacée (docs/technical/testing.md). */
function createFakeSocket(connected = false) {
  const listeners = new Map<string, () => void>()
  const connect = vi.fn()
  const socket: SocketLike = {
    connected,
    on: (event, listener) => {
      listeners.set(event, listener)
    },
    connect,
  }
  return {
    socket,
    connect,
    emit: (event: 'connect' | 'disconnect' | 'connect_error') => listeners.get(event)?.(),
  }
}

describe('RealtimeIndicator (T1.12)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const label = (wrapper: ReturnType<typeof mount>) =>
    wrapper.get('[data-testid="realtime-status"]').text()

  it('indique « déconnecté » tant que le socket n’est pas attaché', () => {
    expect(label(mount(RealtimeIndicator))).toBe('Temps réel : déconnecté')
  })

  it('lance la connexion, puis suit connexion, déconnexion et erreur', async () => {
    const { socket, connect, emit } = createFakeSocket()
    const wrapper = mount(RealtimeIndicator)

    useRealtimeStore().attach(socket)
    await nextTick()
    expect(connect).toHaveBeenCalledOnce()
    expect(label(wrapper)).toBe('Temps réel : connexion…')

    emit('connect')
    await nextTick()
    expect(label(wrapper)).toBe('Temps réel : connecté')

    emit('disconnect')
    await nextTick()
    expect(label(wrapper)).toBe('Temps réel : déconnecté')

    emit('connect_error')
    await nextTick()
    expect(label(wrapper)).toBe('Temps réel : indisponible')
  })

  it('ne relance pas la connexion d’un socket déjà connecté', async () => {
    const { socket, connect } = createFakeSocket(true)
    const wrapper = mount(RealtimeIndicator)

    useRealtimeStore().attach(socket)
    await nextTick()

    expect(connect).not.toHaveBeenCalled()
    expect(label(wrapper)).toBe('Temps réel : connecté')
  })
})
