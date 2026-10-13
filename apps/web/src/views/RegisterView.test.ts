import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fill, mountApp, submit } from '../test/app'
import { apiError, resetTrpcMock, trpcMock } from '../test/trpc-mock'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
})

type Wrapper = Awaited<ReturnType<typeof mountApp>>['wrapper']

async function fillForm(
  wrapper: Wrapper,
  { password = 'un-mot-de-passe-long', terms = true, adult = true } = {},
) {
  await fill(wrapper, '#register-email', ' Ana@X.fr ')
  await fill(wrapper, '#register-name', ' Ana ')
  await fill(wrapper, '#register-password', password)
  if (terms) await wrapper.get('#register-terms').setValue(true)
  if (adult) await wrapper.get('#register-adult').setValue(true)
}

describe('T2.43 — page d’inscription', () => {
  it('affiche le formulaire, les deux cases obligatoires et le lien vers les CGU', async () => {
    const { wrapper } = await mountApp('/register')

    expect(wrapper.get('h1').text()).toBe('Créer un compte')
    for (const id of ['register-email', 'register-name', 'register-password']) {
      expect(wrapper.find(`label[for="${id}"]`).exists()).toBe(true)
    }
    expect(wrapper.get('label[for="register-terms"] a').attributes('href')).toBe('/terms')
    expect(wrapper.get('label[for="register-adult"]').text()).toContain('majeur')
  })

  it('exige les deux cases : sans elles, rien n’est envoyé', async () => {
    const { wrapper } = await mountApp('/register')
    await fillForm(wrapper, { terms: false, adult: false })

    await submit(wrapper)

    expect(wrapper.text()).toContain('Vous devez accepter les conditions générales')
    expect(wrapper.text()).toContain('Vous devez confirmer que vous êtes majeur')
    expect(trpcMock.auth.register.mutate).not.toHaveBeenCalled()
  })

  it.each([
    ['terms', { terms: false }, 'conditions générales'],
    ['adult', { adult: false }, 'majeur'],
  ])('refuse quand seule la case « %s » manque', async (_name, options, message) => {
    const { wrapper } = await mountApp('/register')
    await fillForm(wrapper, options)

    await submit(wrapper)

    expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toEqual([
      expect.stringContaining(message),
    ])
    expect(trpcMock.auth.register.mutate).not.toHaveBeenCalled()
  })

  it('refuse un mot de passe de 11 caractères et en indique la longueur', async () => {
    const { wrapper } = await mountApp('/register')
    await fillForm(wrapper, { password: 'a'.repeat(11) })

    expect(wrapper.get('[data-testid="password-length"]').text()).toContain('11 / 12')
    await submit(wrapper)

    expect(wrapper.text()).toContain('Le mot de passe doit faire de 12 à 128 caractères.')
    expect(trpcMock.auth.register.mutate).not.toHaveBeenCalled()
  })

  it('accepte 12 caractères, envoie l’inscription puis renvoie vers la connexion', async () => {
    trpcMock.auth.register.mutate.mockResolvedValue({ status: 'ok' })
    const { wrapper, router } = await mountApp('/register')
    await fillForm(wrapper, { password: 'a'.repeat(12) })

    await submit(wrapper)

    expect(trpcMock.auth.register.mutate).toHaveBeenCalledWith({
      email: 'ana@x.fr',
      name: 'Ana',
      password: 'a'.repeat(12),
      acceptTerms: true,
      confirmAdult: true,
    })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.registered).toBe('1')
    expect(wrapper.get('[data-testid="registered-notice"]').text()).toContain(
      'consultez votre boîte mail',
    )
    // Personne n'est connecté après l'inscription.
    expect(wrapper.find('[data-testid="nav-account"]').exists()).toBe(false)
  })

  it('affiche le même parcours que l’adresse soit déjà utilisée ou non', async () => {
    // Le serveur répond « ok » dans les deux cas : le front n'a rien à distinguer.
    trpcMock.auth.register.mutate.mockResolvedValue({ status: 'ok' })
    const first = await mountApp('/register')
    await fillForm(first.wrapper)
    await submit(first.wrapper)
    await vi.waitFor(() => expect(first.router.currentRoute.value.path).toBe('/login'))

    const second = await mountApp('/register')
    await fillForm(second.wrapper)
    await submit(second.wrapper)
    await vi.waitFor(() => expect(second.router.currentRoute.value.path).toBe('/login'))

    expect(second.wrapper.get('main').text()).toBe(first.wrapper.get('main').text())
  })

  it('affiche l’erreur du serveur, par exemple la limite d’inscriptions', async () => {
    trpcMock.auth.register.mutate.mockRejectedValue(apiError('RATE_LIMITED', 429))
    const { wrapper, router } = await mountApp('/register')
    await fillForm(wrapper)

    await submit(wrapper)

    expect(wrapper.get('[data-testid="register-error"]').text()).toContain('Trop de tentatives')
    expect(router.currentRoute.value.path).toBe('/register')
  })
})
