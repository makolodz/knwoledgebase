/**
 * `fetch` du client tRPC qui renouvelle la session sans que les appelants s'en aperçoivent
 * (docs/technical/security.md, « Sessions », et ADR-011).
 *
 * Quand l'API répond `NOT_AUTHENTICATED` (access token expiré), il appelle `auth.refresh` une seule
 * fois pour tous les appels en cours, puis rejoue la requête une fois. Le rejeu est sûr : une
 * procédure refusée faute de session n'a rien fait, et les mutations ne sont jamais groupées avec
 * d'autres appels (voir `trpc.ts`).
 */

export interface AuthFetchOptions {
  /** Origine de l'API, sans barre finale. */
  apiUrl: string
  /** `fetch` d'origine ; remplaçable dans les tests. */
  baseFetch?: typeof fetch
  /** Appelé quand le refresh échoue : la session est perdue. */
  onSessionLost?: () => void
  /** Attente avant de réessayer après un `REFRESH_CONFLICT` (deux onglets qui rafraîchissent). */
  conflictRetryDelayMs?: number
}

const REFRESH_PATH = '/api/trpc/auth.refresh'

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

/** Codes d'erreur tRPC d'une réponse (une réponse groupée en contient plusieurs). */
async function errorCodesOf(response: Response): Promise<string[]> {
  try {
    const body: unknown = await response.clone().json()
    const items: unknown[] = Array.isArray(body) ? body : [body]
    return items.flatMap((item) => {
      const code = (item as { error?: { data?: { code?: unknown } } } | null)?.error?.data?.code
      return typeof code === 'string' ? [code] : []
    })
  } catch {
    return []
  }
}

export function createAuthFetch({
  apiUrl,
  baseFetch = (...args) => fetch(...args),
  onSessionLost,
  conflictRetryDelayMs = 250,
}: AuthFetchOptions): typeof fetch {
  // Les cookies de session doivent suivre : l'API est sur une autre origine.
  const send: typeof fetch = (input, init) => baseFetch(input, { ...init, credentials: 'include' })

  async function requestRefresh(): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await send(`${apiUrl}${REFRESH_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      if (response.ok) return true

      // Un autre onglet vient de renouveler les cookies : on réessaie une fois avec les nouveaux.
      const conflict = (await errorCodesOf(response)).includes('REFRESH_CONFLICT')
      if (!conflict || attempt === 1) break
      await new Promise((resolve) => setTimeout(resolve, conflictRetryDelayMs))
    }
    onSessionLost?.()
    return false
  }

  let refreshing: Promise<boolean> | null = null
  function refresh(): Promise<boolean> {
    refreshing ??= requestRefresh()
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  return async (input, init) => {
    const response = await send(input, init)
    if (urlOf(input).endsWith(REFRESH_PATH)) return response
    if (response.status !== 401 && response.status !== 207) return response
    if (!(await errorCodesOf(response)).includes('NOT_AUTHENTICATED')) return response

    // Si le refresh échoue, l'appelant reçoit la réponse d'origine (`NOT_AUTHENTICATED`).
    return (await refresh()) ? send(input, init) : response
  }
}
