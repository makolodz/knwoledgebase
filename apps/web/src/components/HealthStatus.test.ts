import type { HealthResponse } from '@encheres/shared'
import { flushPromises, mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import { describe, expect, it, vi } from 'vitest'
import HealthStatus from './HealthStatus.vue'

const HEALTH: HealthResponse = { status: 'ok', time: '2026-10-12T08:30:00.000Z' }

function mountWith(fetchHealth: () => Promise<HealthResponse>) {
  return mount(HealthStatus, {
    props: { fetchHealth },
    global: { plugins: [PrimeVue] },
  })
}

describe('HealthStatus (T1.11)', () => {
  it('affiche le chargement, puis la réponse de health', async () => {
    const wrapper = mountWith(() => Promise.resolve(HEALTH))

    expect(wrapper.find('[data-testid="health-loading"]').exists()).toBe(true)

    await flushPromises()

    expect(wrapper.find('[data-testid="health-loading"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="health-status"]').text()).toBe('ok')
    expect(wrapper.get('time').attributes('datetime')).toBe(HEALTH.time)
  })

  it("affiche une erreur avec « Réessayer » quand l'appel échoue", async () => {
    const wrapper = mountWith(() => Promise.reject(new Error('réseau coupé')))
    await flushPromises()

    expect(wrapper.find('[data-testid="health-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Impossible de joindre le serveur.')
    expect(wrapper.text()).not.toContain('réseau coupé')
    expect(wrapper.find('[data-testid="health-status"]').exists()).toBe(false)
  })

  it('« Réessayer » relance l’appel et affiche la réponse quand il réussit', async () => {
    let answer: (health: HealthResponse) => void = () => undefined
    const fetchHealth = vi
      .fn<() => Promise<HealthResponse>>()
      .mockRejectedValueOnce(new Error('réseau coupé'))
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const wrapper = mountWith(fetchHealth)
    await flushPromises()

    await wrapper.get('button').trigger('click')
    expect(wrapper.find('[data-testid="health-loading"]').exists()).toBe(true)

    answer(HEALTH)
    await flushPromises()

    expect(fetchHealth).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="health-status"]').text()).toBe('ok')
    expect(wrapper.find('[data-testid="health-error"]').exists()).toBe(false)
  })
})
