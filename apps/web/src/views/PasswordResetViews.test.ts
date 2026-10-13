import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA, fill, mountApp, submit } from '../test/app'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
})

describe('T2.44 — mot de passe oublié', () => {
  it('affiche toujours le même message, que l’adresse ait un compte ou non', async () => {
    trpcMock.auth.forgotPassword.mutate.mockResolvedValue({ status: 'ok' })
    const { wrapper } = await mountApp('/forgot-password')
    await fill(wrapper, '#forgot-email', ' Ana@X.fr ')

    await submit(wrapper)

    expect(trpcMock.auth.forgotPassword.mutate).toHaveBeenCalledWith({ email: 'ana@x.fr' })
    expect(wrapper.get('[data-testid="forgot-sent"]').text()).toContain(
      'Si cette adresse correspond à un compte',
    )
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('refuse une adresse mal formée sans appeler le serveur', async () => {
    const { wrapper } = await mountApp('/forgot-password')
    await fill(wrapper, '#forgot-email', 'pas-un-email')

    await submit(wrapper)

    expect(wrapper.text()).toContain('Saisissez une adresse email valide.')
    expect(trpcMock.auth.forgotPassword.mutate).not.toHaveBeenCalled()
  })

  it('affiche l’erreur quand la limite de demandes est atteinte, sans prétendre que le mail est parti', async () => {
    trpcMock.auth.forgotPassword.mutate.mockRejectedValue(apiError('RATE_LIMITED', 429))
    const { wrapper } = await mountApp('/forgot-password')
    await fill(wrapper, '#forgot-email', 'ana@x.fr')

    await submit(wrapper)

    expect(wrapper.get('[data-testid="forgot-error"]').text()).toContain('Trop de tentatives')
    expect(wrapper.find('[data-testid="forgot-sent"]').exists()).toBe(false)
  })
})

describe('T2.44 — réinitialisation du mot de passe', () => {
  it('propose un nouveau lien quand l’adresse ne contient pas de token', async () => {
    const { wrapper } = await mountApp('/reset-password')

    expect(wrapper.get('[data-testid="reset-invalid"]').text()).toContain('invalide, expiré')
    expect(wrapper.get('main a').attributes('href')).toBe('/forgot-password')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('refuse un mot de passe trop court sans appeler le serveur', async () => {
    const { wrapper } = await mountApp('/reset-password?token=abcdefghijklmnopqrstuvwxyz')
    await fill(wrapper, '#reset-password', 'court')

    await submit(wrapper)

    expect(wrapper.text()).toContain('Le mot de passe doit faire de 12 à 128 caractères.')
    expect(trpcMock.auth.resetPassword.mutate).not.toHaveBeenCalled()
  })

  it('change le mot de passe puis renvoie vers la connexion, sans session ouverte', async () => {
    trpcMock.auth.resetPassword.mutate.mockResolvedValue({ status: 'ok' })
    const { wrapper, router } = await mountApp('/reset-password?token=abcdefghijklmnopqrstuvwxyz')
    await fill(wrapper, '#reset-password', 'un-tout-nouveau-mot-de-passe')

    await submit(wrapper)

    expect(trpcMock.auth.resetPassword.mutate).toHaveBeenCalledWith({
      token: 'abcdefghijklmnopqrstuvwxyz',
      password: 'un-tout-nouveau-mot-de-passe',
    })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(wrapper.find('[data-testid="reset-notice"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-account"]').exists()).toBe(false)
  })

  it('déconnecte l’onglet courant : le serveur a fermé toutes les sessions', async () => {
    trpcMock.auth.resetPassword.mutate.mockResolvedValue({ status: 'ok' })
    const { wrapper, router } = await mountApp('/reset-password?token=abcdefghijklmnopqrstuvwxyz', {
      user: ANA,
    })
    expect(wrapper.find('[data-testid="nav-account"]').exists()).toBe(true)
    await fill(wrapper, '#reset-password', 'un-tout-nouveau-mot-de-passe')

    await submit(wrapper)

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(wrapper.find('[data-testid="nav-account"]').exists()).toBe(false)
  })

  it('propose un nouveau lien quand le serveur refuse celui-ci', async () => {
    trpcMock.auth.resetPassword.mutate.mockRejectedValue(apiError('TOKEN_INVALID'))
    const { wrapper } = await mountApp('/reset-password?token=abcdefghijklmnopqrstuvwxyz')
    await fill(wrapper, '#reset-password', 'un-tout-nouveau-mot-de-passe')

    await submit(wrapper)

    expect(wrapper.find('[data-testid="reset-invalid"]').exists()).toBe(true)
    expect(wrapper.get('main a').attributes('href')).toBe('/forgot-password')
  })
})
