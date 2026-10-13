import type { CurrentUser } from '@encheres/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { createMemoryHistory } from 'vue-router'
import App from '../App.vue'
import { createAppRouter } from '../router'
import { apiError, trpcMock } from './trpc-mock'

export const ANA: CurrentUser = {
  id: '1',
  name: 'Ana',
  email: 'ana@x.fr',
  role: 'buyer',
  emailVerified: false,
}

interface MountOptions {
  /** Utilisateur déjà connecté (restauré par `auth.me`) ; absent = visiteur. */
  user?: CurrentUser
}

/**
 * Monte l'application complète (en-tête, routeur, pages) sur une adresse, avec un faux réseau.
 * `trpcMock.auth.me` répond selon `options.user` ; les autres appels sont à programmer par le test.
 */
export async function mountApp(path: string, { user }: MountOptions = {}) {
  if (user) trpcMock.auth.me.query.mockResolvedValue({ user })
  else trpcMock.auth.me.query.mockRejectedValue(apiError('NOT_AUTHENTICATED', 401))

  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()

  const wrapper = mount(App, {
    global: {
      plugins: [router, pinia, PrimeVue],
      // L'appel réseau de la page d'accueil n'est pas l'objet de ces tests.
      stubs: { HealthStatus: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

/** Saisit une valeur dans un champ (un `<input>` ou le champ d'un composant PrimeVue). */
export async function fill(
  wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper'],
  selector: string,
  value: string,
) {
  await wrapper.get(selector).setValue(value)
}

/** Soumet le formulaire de la page et attend la fin des appels. */
export async function submit(wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper'], index = 0) {
  await wrapper.findAll('form')[index]?.trigger('submit')
  await flushPromises()
}
