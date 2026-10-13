import type { ErrorCode } from '@encheres/shared'
import { TRPCError } from '@trpc/server'

type TrpcCode = ConstructorParameters<typeof TRPCError>[0]['code']

/** Code tRPC (donc statut HTTP) et message affiché pour chaque code métier. */
const DEFINITIONS: Record<ErrorCode, { trpcCode: TrpcCode; message: string }> = {
  NOT_AUTHENTICATED: { trpcCode: 'UNAUTHORIZED', message: 'Vous devez être connecté.' },
  FORBIDDEN: { trpcCode: 'FORBIDDEN', message: 'Action non autorisée.' },
  EMAIL_NOT_VERIFIED: { trpcCode: 'FORBIDDEN', message: 'Votre adresse email n’est pas vérifiée.' },
  ACCOUNT_SUSPENDED: { trpcCode: 'FORBIDDEN', message: 'Votre compte est suspendu.' },
  INVALID_CREDENTIALS: { trpcCode: 'UNAUTHORIZED', message: 'Identifiants invalides.' },
  TOKEN_INVALID: { trpcCode: 'BAD_REQUEST', message: 'Lien invalide, expiré ou déjà utilisé.' },
  RATE_LIMITED: {
    trpcCode: 'TOO_MANY_REQUESTS',
    message: 'Trop de tentatives, réessayez plus tard.',
  },
  REFRESH_CONFLICT: {
    trpcCode: 'CONFLICT',
    message: 'Session en cours de renouvellement, réessayez.',
  },
}

/**
 * Erreur métier : un code stable que le client lit dans `error.data.code` (docs/technical/api.md)
 * et un message lisible. Jamais de détail interne dans le message.
 */
export class AppError extends TRPCError {
  readonly appCode: ErrorCode

  constructor(appCode: ErrorCode) {
    const { trpcCode, message } = DEFINITIONS[appCode]
    super({ code: trpcCode, message })
    this.name = 'AppError'
    this.appCode = appCode
  }
}
