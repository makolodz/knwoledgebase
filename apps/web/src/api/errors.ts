import { TRPCClientError } from '@trpc/client'

/**
 * Code d'erreur renvoyé par l'API (`error.data.code`, docs/technical/api.md) : un code métier
 * (`INVALID_CREDENTIALS`…) ou, à défaut, un code tRPC (`BAD_REQUEST`…). `null` si l'erreur ne vient
 * pas de l'API.
 */
export function errorCodeOf(error: unknown): string | null {
  if (!(error instanceof TRPCClientError)) return null
  const data = (error as { data?: { code?: unknown } | null }).data
  if (typeof data?.code === 'string') return data.code
  // La limite globale de l'API répond hors format tRPC (docs/technical/security.md).
  const response = (error.meta as { response?: { status?: number } } | undefined)?.response
  return response?.status === 429 ? 'RATE_LIMITED' : null
}

/** Vrai quand la requête n'a pas pu aboutir : serveur éteint, réseau coupé. */
export function isNetworkError(error: unknown): boolean {
  if (errorCodeOf(error) !== null) return false
  const cause = error instanceof TRPCClientError ? (error.cause ?? error) : error
  return cause instanceof TypeError || (error instanceof TRPCClientError && error.data == null)
}
