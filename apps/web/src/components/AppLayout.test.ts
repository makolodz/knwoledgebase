import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from '../router'
import App from '../App.vue'

async function mountAt(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [router, createPinia(), PrimeVue],
      // L'appel réseau de la page d'accueil n'est pas l'objet de ces tests.
      stubs: { HealthStatus: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('AppLayout (T1.13)', () => {
  it('affiche l’en-tête, le contenu et le pied de page', async () => {
    const wrapper = await mountAt('/')

    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.get('header a').attributes('href')).toBe('/')
    expect(wrapper.get('main').text()).toContain('Enchères en direct')
    expect(wrapper.get('footer a').attributes('href')).toBe('/terms')
  })

  it('affiche la page 404 pour une route inconnue, en gardant la mise en page', async () => {
    const wrapper = await mountAt('/nimportequoi')

    expect(wrapper.get('main').text()).toContain('Page introuvable')
    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.find('footer').exists()).toBe(true)
  })

  it('affiche les conditions générales sur /terms', async () => {
    const wrapper = await mountAt('/terms')

    expect(wrapper.get('main').text()).toContain("Conditions générales d'utilisation")
  })
})
