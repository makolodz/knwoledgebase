import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA } from '../test/app'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'
import { createAppRouter } from '.'
import { safeRedirect } from './guards'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
  setActivePinia(createPinia())
})

function visitor() {
  trpcMock.auth.me.query.mockRejectedValue(apiError('NOT_AUTHENTICATED', 401))
}
function loggedIn(role: 'buyer' | 'admin' = 'buyer') {
  trpcMock.auth.me.query.mockResolvedValue({ user: { ...ANA, role } })
}

describe('T2.41 — garde des routes', () => {
  it('redirige un visiteur vers /login en gardant la page demandée', async () => {
    visitor()
    const router = createAppRouter(createMemoryHistory())

    await router.push('/account')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/account')
  })

  it('laisse un utilisateur connecté ouvrir une page protégée', async () => {
    loggedIn()
    const router = createAppRouter(createMemoryHistory())

    await router.push('/account')

    expect(router.currentRoute.value.name).toBe('account')
  })

  it('renvoie un utilisateur connecté à l’accueil depuis connexion, inscription et mot de passe oublié', async () => {
    loggedIn()
    const router = createAppRouter(createMemoryHistory())

    for (const path of ['/login', '/register', '/forgot-password']) {
      await router.push(path)
      expect(router.currentRoute.value.path).toBe('/')
    }
  })

  it('laisse les liens reçus par email s’ouvrir connecté comme déconnecté', async () => {
    for (const setup of [visitor, loggedIn]) {
      setActivePinia(createPinia())
      setup()
      const router = createAppRouter(createMemoryHistory())

      await router.push('/verify-email?token=abc')
      expect(router.currentRoute.value.name).toBe('verify-email')
      await router.push('/reset-password?token=abc')
      expect(router.currentRoute.value.name).toBe('reset-password')
    }
  })

  it('laisse les pages publiques à un visiteur sans appeler le serveur plus d’une fois', async () => {
    visitor()
    const router = createAppRouter(createMemoryHistory())

    await router.push('/')
    await router.push('/terms')
    await router.push('/login')

    expect(router.currentRoute.value.name).toBe('login')
    expect(trpcMock.auth.me.query).toHaveBeenCalledTimes(1)
  })

  it('affiche la page 404 à un rôle non autorisé', async () => {
    loggedIn('buyer')
    const router = createAppRouter(createMemoryHistory())
    router.addRoute({
      path: '/admin',
      name: 'admin',
      component: { template: '<p />' },
      meta: { roles: ['admin'] },
    })

    await router.push('/admin')

    expect(router.currentRoute.value.name).toBe('not-found')
  })

  it('laisse passer le rôle autorisé', async () => {
    loggedIn('admin')
    const router = createAppRouter(createMemoryHistory())
    router.addRoute({
      path: '/admin',
      name: 'admin',
      component: { template: '<p />' },
      meta: { roles: ['admin'] },
    })

    await router.push('/admin')

    expect(router.currentRoute.value.name).toBe('admin')
  })
})

describe('T2.41 — safeRedirect (redirection ouverte)', () => {
  it.each(['/', '/account', '/auctions/42?tab=bids', '/account#profil'])(
    'accepte le chemin interne %j',
    (value) => {
      expect(safeRedirect(value)).toBe(value)
    },
  )

  it.each([
    'https://evil.example',
    'http://evil.example/account',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    'account',
    '',
    undefined,
    null,
    ['/account'],
    42,
  ])('retombe sur l’accueil pour %j', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})
