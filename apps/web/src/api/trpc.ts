import type { AppRouter } from '@encheres/api'
import { createTRPCClient, httpBatchLink, httpLink, splitLink } from '@trpc/client'
import { env } from '../env'
import { createAuthFetch } from './auth-fetch'

/**
 * Appelée quand la session ne peut plus être renouvelée. Le store d'authentification s'y inscrit :
 * ce module ne l'importe pas, pour éviter une dépendance circulaire.
 */
let sessionLostHandler: () => void = () => {}
export function onSessionLost(handler: () => void): void {
  sessionLostHandler = handler
}

const url = `${env.VITE_API_URL}/api/trpc`
const fetchWithSession = createAuthFetch({
  apiUrl: env.VITE_API_URL,
  onSessionLost: () => sessionLostHandler(),
})

/**
 * Client tRPC typé par le routeur de l'API (ADR-010).
 *
 * Les lectures sont groupées, les écritures partent **une par requête** : `auth.refresh` doit
 * arriver seule sur `/api/trpc/auth.refresh` pour recevoir son cookie (security.md), et une
 * requête rejouée après un renouvellement de session ne doit jamais refaire une écriture réussie.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (operation) => operation.type === 'query',
      true: httpBatchLink({ url, fetch: fetchWithSession }),
      false: httpLink({ url, fetch: fetchWithSession }),
    }),
  ],
})
