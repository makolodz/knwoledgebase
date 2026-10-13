import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ANA, mountApp } from '../test/app'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
})

const TOKEN = 'abcdefghijklmnopqrstuvwxyz'

describe('T2.45 — vérification de l’adresse email', () => {
  it('confirme l’adresse pour un visiteur, qui peut ensuite se connecter', async () => {
    trpcMock.auth.verifyEmail.mutate.mockResolvedValue({ status: 'ok' })
    const { wrapper } = await mountApp(`/verify-email?token=${TOKEN}`)

    expect(trpcMock.auth.verifyEmail.mutate).toHaveBeenCalledWith({ token: TOKEN })
    expect(wrapper.get('[data-testid="verify-success"]').text()).toContain('vérifiée')
    expect(wrapper.get('main a').attributes('href')).toBe('/login')
  })

  it('met à jour le statut d’un utilisateur connecté dans cet onglet', async () => {
    trpcMock.auth.verifyEmail.mutate.mockResolvedValue({ status: 'ok' })
    trpcMock.auth.me.query.mockResolvedValue({ user: { ...ANA, emailVerified: true } })
    const { wrapper } = await mountApp(`/verify-email?token=${TOKEN}`, { user: ANA })
    await flushPromises()

    expect(wrapper.find('[data-testid="verify-success"]').exists()).toBe(true)
    expect(wrapper.get('main a').attributes('href')).toBe('/account')
    // Le statut est relu : il n'y a plus de bandeau « non vérifiée » à afficher.
    expect(trpcMock.auth.me.query).toHaveBeenCalledTimes(2)
  })

  it('invite un visiteur à se connecter quand le lien est invalide, expiré ou déjà utilisé', async () => {
    trpcMock.auth.verifyEmail.mutate.mockRejectedValue(apiError('TOKEN_INVALID'))
    const { wrapper } = await mountApp(`/verify-email?token=${TOKEN}`)

    expect(wrapper.get('[data-testid="verify-invalid"]').text()).toContain('invalide, expiré')
    expect(wrapper.get('main a').attributes('href')).toBe('/login')
  })

  it('propose un nouveau lien à un utilisateur connecté dont le lien a expiré', async () => {
    trpcMock.auth.verifyEmail.mutate.mockRejectedValue(apiError('TOKEN_INVALID'))
    trpcMock.auth.resendVerification.mutate.mockResolvedValue({ status: 'sent' })
    const { wrapper } = await mountApp(`/verify-email?token=${TOKEN}`, { user: ANA })

    await wrapper.get('main button').trigger('click')
    await flushPromises()

    expect(trpcMock.auth.resendVerification.mutate).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="verify-resent"]').exists()).toBe(true)
  })

  it('explique la limite d’un envoi par minute', async () => {
    trpcMock.auth.verifyEmail.mutate.mockRejectedValue(apiError('TOKEN_INVALID'))
    trpcMock.auth.resendVerification.mutate.mockRejectedValue(apiError('RATE_LIMITED', 429))
    const { wrapper } = await mountApp(`/verify-email?token=${TOKEN}`, { user: ANA })

    await wrapper.get('main button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Patientez une minute')
  })

  it('dit que l’adresse est déjà vérifiée quand le lien est inutilisable pour un compte vérifié', async () => {
    trpcMock.auth.verifyEmail.mutate.mockRejectedValue(apiError('TOKEN_INVALID'))
    const { wrapper } = await mountApp(`/verify-email?token=${TOKEN}`, {
      user: { ...ANA, emailVerified: true },
    })

    expect(wrapper.get('[data-testid="verify-already"]').text()).toContain('déjà vérifiée')
    expect(wrapper.find('main button').exists()).toBe(false)
  })

  it('traite un lien sans token comme un lien invalide, sans appeler le serveur', async () => {
    const { wrapper } = await mountApp('/verify-email')

    expect(wrapper.find('[data-testid="verify-invalid"]').exists()).toBe(true)
    expect(trpcMock.auth.verifyEmail.mutate).not.toHaveBeenCalled()
  })

  it('permet de réessayer quand le serveur est en panne', async () => {
    trpcMock.auth.verifyEmail.mutate
      .mockRejectedValueOnce(apiError('INTERNAL_SERVER_ERROR', 500))
      .mockResolvedValueOnce({ status: 'ok' })
    const { wrapper } = await mountApp(`/verify-email?token=${TOKEN}`)
    expect(wrapper.find('[data-testid="verify-error"]').exists()).toBe(true)

    await wrapper.get('main button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="verify-success"]').exists()).toBe(true)
  })
})

describe('T2.45 — confirmation d’un changement d’adresse', () => {
  const link = `/verify-email?token=${TOKEN}&kind=email-change`

  it('confirme la nouvelle adresse d’un utilisateur connecté et met à jour son profil', async () => {
    const changed = { ...ANA, email: 'nouvelle@x.fr', emailVerified: true }
    trpcMock.profile.confirmEmailChange.mutate.mockResolvedValue({ user: changed })
    const { wrapper } = await mountApp(link, { user: ANA })

    expect(trpcMock.profile.confirmEmailChange.mutate).toHaveBeenCalledWith({ token: TOKEN })
    expect(trpcMock.auth.verifyEmail.mutate).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="verify-success"]').text()).toContain('nouvelle adresse')
  })

  it('demande de se connecter d’abord, puis revient sur le lien', async () => {
    const { router } = await mountApp(link)

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(router.currentRoute.value.query.redirect).toBe(link)
    expect(trpcMock.profile.confirmEmailChange.mutate).not.toHaveBeenCalled()
  })
})
