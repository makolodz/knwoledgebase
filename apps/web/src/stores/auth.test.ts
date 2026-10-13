import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANA } from '../test/app'
import { apiError, resetTrpcMock, sessionLost, trpcMock } from '../test/trpc-mock'
import { useAuthStore } from './auth'

vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)

beforeEach(() => {
  resetTrpcMock()
  setActivePinia(createPinia())
})

describe('T2.40 — store d’authentification', () => {
  it('restaure la session au démarrage', async () => {
    trpcMock.auth.me.query.mockResolvedValue({ user: ANA })
    const auth = useAuthStore()

    await auth.load()

    expect(auth.user).toEqual(ANA)
    expect(auth.ready).toBe(true)
  })

  it('se comporte comme un visiteur quand il n’y a pas de session ou pas de serveur', async () => {
    for (const failure of [apiError('NOT_AUTHENTICATED', 401), new TypeError('Failed to fetch')]) {
      setActivePinia(createPinia())
      trpcMock.auth.me.query.mockRejectedValue(failure)
      const auth = useAuthStore()

      await auth.load()

      expect(auth.user).toBeNull()
      expect(auth.ready).toBe(true)
    }
  })

  it('ne restaure la session qu’une fois, même si plusieurs routes la demandent', async () => {
    trpcMock.auth.me.query.mockResolvedValue({ user: ANA })
    const auth = useAuthStore()

    await Promise.all([auth.load(), auth.load(), auth.load()])
    await auth.load()

    expect(trpcMock.auth.me.query).toHaveBeenCalledTimes(1)
  })

  it('enregistre l’utilisateur après une connexion', async () => {
    trpcMock.auth.login.mutate.mockResolvedValue({ user: ANA })
    const auth = useAuthStore()

    await auth.login({ email: 'ana@x.fr', password: 'un-mot-de-passe-long' })

    expect(trpcMock.auth.login.mutate).toHaveBeenCalledWith({
      email: 'ana@x.fr',
      password: 'un-mot-de-passe-long',
    })
    expect(auth.user).toEqual(ANA)
  })

  it('laisse l’erreur remonter quand la connexion échoue, sans enregistrer d’utilisateur', async () => {
    trpcMock.auth.login.mutate.mockRejectedValue(apiError('INVALID_CREDENTIALS', 401))
    const auth = useAuthStore()

    await expect(auth.login({ email: 'ana@x.fr', password: 'x' })).rejects.toBeDefined()

    expect(auth.user).toBeNull()
  })

  it('ne connecte personne après une inscription', async () => {
    trpcMock.auth.register.mutate.mockResolvedValue({ status: 'ok' })
    const auth = useAuthStore()

    await auth.register({
      email: 'ana@x.fr',
      password: 'un-mot-de-passe-long',
      name: 'Ana',
      acceptTerms: true,
      confirmAdult: true,
    })

    expect(auth.user).toBeNull()
  })

  it('déconnecte l’interface même quand le serveur est injoignable', async () => {
    trpcMock.auth.me.query.mockResolvedValue({ user: ANA })
    trpcMock.auth.logout.mutate.mockRejectedValue(new TypeError('Failed to fetch'))
    const auth = useAuthStore()
    await auth.load()

    await expect(auth.logout()).rejects.toBeDefined()

    expect(auth.user).toBeNull()
  })

  it('repasse en mode visiteur quand la session ne peut plus être renouvelée', async () => {
    trpcMock.auth.me.query.mockResolvedValue({ user: ANA })
    const auth = useAuthStore()
    await auth.load()

    sessionLost.handler()

    expect(auth.user).toBeNull()
  })
})
