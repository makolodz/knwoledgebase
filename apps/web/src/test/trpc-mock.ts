import { TRPCClientError } from '@trpc/client'
import { vi } from 'vitest'

/**
 * Faux client tRPC pour les tests de composants : la seule frontière remplacée est le réseau.
 * Utilisation dans un fichier de test :
 * `vi.mock('../api/trpc', async () => (await import('../test/trpc-mock')).trpcModule)`.
 */
const mocks: ReturnType<typeof vi.fn>[] = []
const procedure = () => {
  const mock = vi.fn()
  mocks.push(mock)
  return mock
}

export const trpcMock = {
  health: { query: procedure() },
  auth: {
    me: { query: procedure() },
    login: { mutate: procedure() },
    register: { mutate: procedure() },
    logout: { mutate: procedure() },
    refresh: { mutate: procedure() },
    verifyEmail: { mutate: procedure() },
    resendVerification: { mutate: procedure() },
    forgotPassword: { mutate: procedure() },
    resetPassword: { mutate: procedure() },
  },
  profile: {
    update: { mutate: procedure() },
    changePassword: { mutate: procedure() },
    changeEmail: { mutate: procedure() },
    confirmEmailChange: { mutate: procedure() },
  },
}

/** Le gestionnaire que le store d'authentification enregistre pour « session perdue ». */
export const sessionLost = { handler: () => {} }

export const trpcModule = {
  trpc: trpcMock,
  onSessionLost: (handler: () => void) => {
    sessionLost.handler = handler
  },
}

/** Remet tous les faux appels à zéro, sans réponse programmée. */
export function resetTrpcMock(): void {
  for (const mock of mocks) mock.mockReset()
}

/** Erreur telle que l'API la renvoie : `error.data.code` porte le code métier. */
export function apiError(code: string, httpStatus = 400): TRPCClientError<never> {
  return TRPCClientError.from<never>({
    error: { message: 'Message du serveur', code: -32001, data: { code, httpStatus } },
  } as never)
}

/** Erreur réseau : le serveur ne répond pas. */
export function networkError(): TRPCClientError<never> {
  return TRPCClientError.from<never>(new TypeError('Failed to fetch'))
}
