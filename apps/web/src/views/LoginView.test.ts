import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA, fill, mountApp, submit } from '../test/app'
import { apiError, networkError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
})

async function fillAndSubmit(
  wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper'],
  email = ' Ana@X.fr ',
  password = 'un-mot-de-passe-long',
) {
  await fill(wrapper, '#login-email', email)
  await fill(wrapper, '#login-password', password)
  await submit(wrapper)
}

describe('T2.42 — page de connexion', () => {
  it('affiche le formulaire avec ses libellés et les liens utiles', async () => {
    const { wrapper } = await mountApp('/login')

    expect(wrapper.get('h1').text()).toBe('Connexion')
    expect(wrapper.get('label[for="login-email"]').text()).toBe('Adresse email')
    expect(wrapper.get('label[for="login-password"]').text()).toBe('Mot de passe')
    const links = wrapper.findAll('main a').map((link) => link.attributes('href'))
    expect(links).toContain('/forgot-password')
    expect(links).toContain('/register')
  })

  it('refuse un formulaire invalide sans appeler le serveur', async () => {
    const { wrapper } = await mountApp('/login')

    await fillAndSubmit(wrapper, 'pas-un-email', '')

    expect(wrapper.text()).toContain('Saisissez une adresse email valide.')
    expect(wrapper.text()).toContain('Saisissez votre mot de passe.')
    expect(trpcMock.auth.login.mutate).not.toHaveBeenCalled()
  })

  it('connecte l’utilisateur et le renvoie à l’accueil', async () => {
    trpcMock.auth.login.mutate.mockResolvedValue({ user: ANA })
    const { wrapper, router } = await mountApp('/login')

    await fillAndSubmit(wrapper)

    // L'email est normalisé avant l'envoi, comme le fait le serveur.
    expect(trpcMock.auth.login.mutate).toHaveBeenCalledWith({
      email: 'ana@x.fr',
      password: 'un-mot-de-passe-long',
    })
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.get('[data-testid="nav-account"]').text()).toBe('Ana')
  })

  it('revient à la page demandée avant la connexion', async () => {
    trpcMock.auth.login.mutate.mockResolvedValue({ user: ANA })
    const { wrapper, router } = await mountApp('/login?redirect=%2Faccount')

    await fillAndSubmit(wrapper)

    // La page de compte est chargée à la demande : la navigation finit après l'import.
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/account'))
  })

  it('ignore une redirection vers un autre site', async () => {
    trpcMock.auth.login.mutate.mockResolvedValue({ user: ANA })
    const { wrapper, router } = await mountApp('/login?redirect=https%3A%2F%2Fevil.example')

    await fillAndSubmit(wrapper)

    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.fullPath).not.toContain('evil')
  })

  it('affiche le même message pour un email inconnu et un mauvais mot de passe', async () => {
    trpcMock.auth.login.mutate.mockRejectedValue(apiError('INVALID_CREDENTIALS', 401))
    const { wrapper } = await mountApp('/login')

    await fillAndSubmit(wrapper)

    expect(wrapper.get('[data-testid="login-error"]').text()).toBe('Identifiants invalides.')
    expect(wrapper.text()).not.toContain('Message du serveur')
    expect(wrapper.find('[data-testid="login-error"]').exists()).toBe(true)
  })

  it.each([
    ['RATE_LIMITED', 'Trop de tentatives'],
    ['ACCOUNT_SUSPENDED', 'Votre compte est suspendu'],
  ])('affiche un message dédié pour %s', async (code, expected) => {
    trpcMock.auth.login.mutate.mockRejectedValue(apiError(code, 403))
    const { wrapper } = await mountApp('/login')

    await fillAndSubmit(wrapper)

    expect(wrapper.get('[data-testid="login-error"]').text()).toContain(expected)
  })

  it('prévient quand le serveur est injoignable', async () => {
    trpcMock.auth.login.mutate.mockRejectedValue(networkError())
    const { wrapper } = await mountApp('/login')

    await fillAndSubmit(wrapper)

    expect(wrapper.get('[data-testid="login-error"]').text()).toContain(
      'Impossible de joindre le serveur',
    )
  })

  it('reste sur la page de connexion après un échec', async () => {
    trpcMock.auth.login.mutate.mockRejectedValue(apiError('INVALID_CREDENTIALS', 401))
    const { wrapper, router } = await mountApp('/login')

    await fillAndSubmit(wrapper)

    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.find('[data-testid="nav-account"]').exists()).toBe(false)
  })

  it('annonce la création du compte et le changement de mot de passe', async () => {
    const registered = await mountApp('/login?registered=1')
    expect(registered.wrapper.get('[data-testid="registered-notice"]').text()).toContain(
      'consultez votre boîte mail',
    )

    const reset = await mountApp('/login?reset=1')
    expect(reset.wrapper.get('[data-testid="reset-notice"]').text()).toContain(
      'Mot de passe modifié',
    )
  })
})
