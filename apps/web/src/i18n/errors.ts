import type { ErrorCode } from '@encheres/shared'
import { UploadError, errorCodeOf, isNetworkError } from '../api/errors'

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
  AUCTION_NOT_FOUND: 'Cette enchère est introuvable.',
  AUCTION_STATE_INVALID: 'Cette action est impossible dans l’état actuel de l’enchère.',
  INVALID_DATES:
    'Les dates ne respectent pas les règles : début dans le futur, durée dans les limites autorisées.',
  INVALID_IMAGE: 'Cette photo n’est pas valide (formats acceptés : JPEG, PNG, WebP).',
}

const UPLOAD_MESSAGES: Record<string, string> = {
  PAYLOAD_TOO_LARGE: 'Cette photo dépasse 5 Mo.',
  UNSUPPORTED_MEDIA_TYPE: 'Ce type de fichier n’est pas accepté.',
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
  if (error instanceof UploadError) {
    return (
      UPLOAD_MESSAGES[error.code] ??
      (isKnownCode(error.code) ? MESSAGES[error.code] : GENERIC_MESSAGE)
    )
  }
  if (isNetworkError(error)) return NETWORK_MESSAGE
  const code = errorCodeOf(error)
  return code !== null && isKnownCode(code) ? MESSAGES[code] : GENERIC_MESSAGE
}
