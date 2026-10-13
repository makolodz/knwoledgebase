import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA, mountApp } from '../test/app'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
})

describe('AppLayout (T1.13)', () => {
  it('affiche l’en-tête, le contenu et le pied de page', async () => {
    const { wrapper } = await mountApp('/')

    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.get('header a').attributes('href')).toBe('/')
    expect(wrapper.get('main').text()).toContain('Enchères en direct')
    expect(wrapper.get('footer a').attributes('href')).toBe('/terms')
  })

  it('affiche la page 404 pour une route inconnue, en gardant la mise en page', async () => {
    const { wrapper } = await mountApp('/nimportequoi')

    expect(wrapper.get('main').text()).toContain('Page introuvable')
    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.find('footer').exists()).toBe(true)
  })

  it('affiche les conditions générales sur /terms', async () => {
    const { wrapper } = await mountApp('/terms')

    expect(wrapper.get('main').text()).toContain("Conditions générales d'utilisation")
  })
})

describe('T2.46 — navigation selon la session', () => {
  it('propose Connexion et S’inscrire à un visiteur', async () => {
    const { wrapper } = await mountApp('/')

    const links = wrapper
      .findAll('header nav a')
      .map((link) => [link.text(), link.attributes('href')])
    expect(links).toEqual([
      ['Connexion', '/login'],
      ['S’inscrire', '/register'],
    ])
    expect(wrapper.find('header button').exists()).toBe(false)
  })

  it('affiche le nom de l’utilisateur et un bouton de déconnexion une fois connecté', async () => {
    const { wrapper } = await mountApp('/', { user: ANA })

    expect(wrapper.get('[data-testid="nav-account"]').text()).toBe('Ana')
    expect(wrapper.get('[data-testid="nav-account"]').attributes('href')).toBe('/account')
    expect(wrapper.get('header button').text()).toBe('Déconnexion')
    expect(wrapper.text()).not.toContain('S’inscrire')
  })

  it('déconnecte et revient à l’accueil', async () => {
    trpcMock.auth.logout.mutate.mockResolvedValue({ status: 'ok' })
    const { wrapper, router } = await mountApp('/account', { user: ANA })

    await wrapper.get('header button').trigger('click')
    await flushPromises()

    expect(trpcMock.auth.logout.mutate).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.find('[data-testid="nav-account"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Connexion')
  })

  it('déconnecte l’interface même si le serveur ne répond pas', async () => {
    trpcMock.auth.logout.mutate.mockRejectedValue(apiError('INTERNAL_SERVER_ERROR', 500))
    const { wrapper, router } = await mountApp('/', { user: ANA })

    await wrapper.get('header button').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.find('[data-testid="nav-account"]').exists()).toBe(false)
  })
})
