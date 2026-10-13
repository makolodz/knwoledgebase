import type { AppRouter } from '@encheres/api'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { env } from '../env'

/** Client tRPC typé par le routeur de l'API (ADR-010). */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${env.VITE_API_URL}/api/trpc`,
      // L'API est sur une autre origine : les cookies de session (étape 2) doivent suivre.
      fetch: (url, options) => fetch(url, { ...options, credentials: 'include' }),
    }),
  ],
})
