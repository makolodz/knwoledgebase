import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA, fill, mountApp, submit } from '../test/app'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
})

describe('T2.47 — page « Mon compte »', () => {
  it('redirige un visiteur vers la connexion', async () => {
    const { router } = await mountApp('/account')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/account')
  })

  it('affiche l’adresse, son statut de vérification et le rôle', async () => {
    const { wrapper } = await mountApp('/account', { user: ANA })

    expect(wrapper.get('[data-testid="account-email"]').text()).toBe('ana@x.fr')
    expect(wrapper.get('[data-testid="account-verified"]').text()).toBe('Adresse non vérifiée')
    expect(wrapper.get('[data-testid="account-role"]').text()).toBe('Acheteur')
  })

  it('n’affiche pas le renvoi du lien quand l’adresse est vérifiée', async () => {
    const { wrapper } = await mountApp('/account', {
      user: { ...ANA, emailVerified: true, role: 'seller' },
    })

    expect(wrapper.get('[data-testid="account-verified"]').text()).toBe('Adresse vérifiée')
    expect(wrapper.get('[data-testid="account-role"]').text()).toBe('Vendeur')
    expect(wrapper.text()).not.toContain('Renvoyer l’email de vérification')
  })

  describe('adresse non vérifiée', () => {
    const resendButton = (wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) =>
      wrapper.findAll('button').find((button) => button.text().includes('Renvoyer'))

    it('renvoie le lien de vérification', async () => {
      trpcMock.auth.resendVerification.mutate.mockResolvedValue({ status: 'sent' })
      const { wrapper } = await mountApp('/account', { user: ANA })

      await resendButton(wrapper)?.trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="resend-sent"]').exists()).toBe(true)
    })

    it('explique la limite d’un envoi par minute', async () => {
      trpcMock.auth.resendVerification.mutate.mockRejectedValue(apiError('RATE_LIMITED', 429))
      const { wrapper } = await mountApp('/account', { user: ANA })

      await resendButton(wrapper)?.trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="resend-error"]').text()).toContain('Patientez une minute')
    })

    it('met à jour le statut quand l’adresse a été vérifiée entre-temps', async () => {
      trpcMock.auth.resendVerification.mutate.mockResolvedValue({ status: 'already_verified' })
      const { wrapper } = await mountApp('/account', { user: ANA })
      trpcMock.auth.me.query.mockResolvedValue({ user: { ...ANA, emailVerified: true } })

      await resendButton(wrapper)?.trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="account-verified"]').text()).toBe('Adresse vérifiée')
    })
  })

  describe('nom d’affichage', () => {
    it('enregistre le nouveau nom et le montre dans l’en-tête', async () => {
      trpcMock.profile.update.mutate.mockResolvedValue({ user: { ...ANA, name: 'Ana B.' } })
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#profile-name', '  Ana B. ')

      await submit(wrapper, 0)

      expect(trpcMock.profile.update.mutate).toHaveBeenCalledWith({ name: 'Ana B.' })
      expect(wrapper.find('[data-testid="name-saved"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="nav-account"]').text()).toBe('Ana B.')
    })

    it('refuse un nom d’un seul caractère sans appeler le serveur', async () => {
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#profile-name', 'A')

      await submit(wrapper, 0)

      expect(wrapper.text()).toContain('de 2 à 30 caractères')
      expect(trpcMock.profile.update.mutate).not.toHaveBeenCalled()
    })
  })

  describe('changement d’adresse email', () => {
    it('demande le lien de confirmation et rappelle que l’adresse ne change qu’après le clic', async () => {
      trpcMock.profile.changeEmail.mutate.mockResolvedValue({ status: 'ok' })
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#change-email-new', ' Nouvelle@X.fr ')
      await fill(wrapper, '#change-email-password', 'un-mot-de-passe-long')

      await submit(wrapper, 1)

      expect(trpcMock.profile.changeEmail.mutate).toHaveBeenCalledWith({
        newEmail: 'nouvelle@x.fr',
        currentPassword: 'un-mot-de-passe-long',
      })
      expect(wrapper.get('[data-testid="email-change-requested"]').text()).toContain(
        'ne change qu’après le clic',
      )
      expect(wrapper.get('[data-testid="account-email"]').text()).toBe('ana@x.fr')
    })

    it('signale un mot de passe actuel incorrect sur le champ concerné', async () => {
      trpcMock.profile.changeEmail.mutate.mockRejectedValue(apiError('INVALID_CREDENTIALS', 401))
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#change-email-new', 'nouvelle@x.fr')
      await fill(wrapper, '#change-email-password', 'mauvais-mot-de-passe')

      await submit(wrapper, 1)

      expect(wrapper.get('#change-email-password-error').text()).toBe(
        'Mot de passe actuel incorrect.',
      )
      expect(wrapper.find('[data-testid="email-change-requested"]').exists()).toBe(false)
    })
  })

  describe('changement de mot de passe', () => {
    it('change le mot de passe, vide les champs et prévient que les autres sessions sont fermées', async () => {
      trpcMock.profile.changePassword.mutate.mockResolvedValue({ status: 'ok' })
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#current-password', 'un-mot-de-passe-long')
      await fill(wrapper, '#new-password', 'un-tout-nouveau-mot-de-passe')

      await submit(wrapper, 2)

      expect(trpcMock.profile.changePassword.mutate).toHaveBeenCalledWith({
        currentPassword: 'un-mot-de-passe-long',
        newPassword: 'un-tout-nouveau-mot-de-passe',
      })
      expect(wrapper.get('[data-testid="password-changed"]').text()).toContain('autres sessions')
      expect((wrapper.get('#current-password').element as HTMLInputElement).value).toBe('')
      expect((wrapper.get('#new-password').element as HTMLInputElement).value).toBe('')
    })

    it('signale un mot de passe actuel incorrect sans changer le mot de passe', async () => {
      trpcMock.profile.changePassword.mutate.mockRejectedValue(apiError('INVALID_CREDENTIALS', 401))
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#current-password', 'mauvais-mot-de-passe')
      await fill(wrapper, '#new-password', 'un-tout-nouveau-mot-de-passe')

      await submit(wrapper, 2)

      expect(wrapper.get('#current-password-error').text()).toBe('Mot de passe actuel incorrect.')
      expect(wrapper.find('[data-testid="password-changed"]').exists()).toBe(false)
    })

    it('refuse un nouveau mot de passe de 11 caractères sans appeler le serveur', async () => {
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#current-password', 'un-mot-de-passe-long')
      await fill(wrapper, '#new-password', 'a'.repeat(11))

      await submit(wrapper, 2)

      expect(wrapper.text()).toContain('Le nouveau mot de passe doit faire de 12 à 128 caractères.')
      expect(trpcMock.profile.changePassword.mutate).not.toHaveBeenCalled()
    })

    it('affiche le blocage après trop d’essais', async () => {
      trpcMock.profile.changePassword.mutate.mockRejectedValue(apiError('RATE_LIMITED', 429))
      const { wrapper } = await mountApp('/account', { user: ANA })
      await fill(wrapper, '#current-password', 'un-mot-de-passe-long')
      await fill(wrapper, '#new-password', 'un-tout-nouveau-mot-de-passe')

      await submit(wrapper, 2)

      expect(wrapper.text()).toContain('Trop de tentatives')
    })
  })
})
