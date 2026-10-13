import type { ErrorCode } from '@encheres/shared'
import { errorCodeOf, isNetworkError } from '../api/errors'

/** Message affiché pour chaque code d'erreur métier (docs/technical/screens.md, « Règles communes »). */
const MESSAGES: Record<ErrorCode, string> = {
  NOT_AUTHENTICATED: 'Votre session a expiré. Reconnectez-vous.',
  FORBIDDEN: 'Vous n’avez pas le droit d’effectuer cette action.',
  EMAIL_NOT_VERIFIED: 'Vérifiez votre adresse email pour effectuer cette action.',
  ACCOUNT_SUSPENDED: 'Votre compte est suspendu. Contactez l’association.',
  INVALID_CREDENTIALS: 'Identifiants invalides.',
  TOKEN_INVALID: 'Ce lien est invalide, expiré ou déjà utilisé.',
  RATE_LIMITED: 'Trop de tentatives. Réessayez dans quelques minutes.',
  REFRESH_CONFLICT: 'Votre session est en cours de renouvellement. Réessayez.',
}

const NETWORK_MESSAGE = 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
const GENERIC_MESSAGE = 'Une erreur est survenue. Réessayez.'

function isKnownCode(code: string): code is ErrorCode {
  return Object.hasOwn(MESSAGES, code)
}

/**
 * Message lisible pour une erreur de l'API. Les messages du serveur ne sont jamais affichés tels
 * quels : ils sont traduits ici, au même endroit.
 */
export function errorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE
  const code = errorCodeOf(error)
  return code !== null && isKnownCode(code) ? MESSAGES[code] : GENERIC_MESSAGE
}
