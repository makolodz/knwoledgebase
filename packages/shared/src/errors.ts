/**
 * Codes d'erreur métier renvoyés au client dans `error.data.code` (docs/technical/api.md).
 */
export const ERROR_CODES = [
  /** Pas de session valide : se connecter ou rafraîchir le token. */
  'NOT_AUTHENTICATED',
  /** Rôle non autorisé pour cette action. */
  'FORBIDDEN',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_SUSPENDED',
  /** Email inconnu ou mot de passe incorrect : volontairement indiscernables. */
  'INVALID_CREDENTIALS',
  /** Lien de vérification ou de réinitialisation invalide, expiré ou déjà utilisé. */
  'TOKEN_INVALID',
  'RATE_LIMITED',
  /**
   * Le refresh token vient d'être remplacé par une autre requête (deux onglets) : le cookie est
   * déjà à jour, réessayer une fois.
   */
  'REFRESH_CONFLICT',
  /** Enchère inexistante, pas encore publique, ou qui n'appartient pas au vendeur. */
  'AUCTION_NOT_FOUND',
  /** Action impossible dans l'état actuel de l'enchère (transition absente du cycle de vie). */
  'AUCTION_STATE_INVALID',
  /** Début dans le passé, ou durée hors des bornes `minDurationMs` et `maxDurationMs`. */
  'INVALID_DATES',
  /** Fichier qui n'est pas une photo valide, ou clé de photo inconnue. */
  'INVALID_IMAGE',
  /** Offre sur une enchère qui n'est pas `live` (pas commencée, terminée, annulée, inconnue). */
  'AUCTION_NOT_LIVE',
  /** Le vendeur enchérit sur sa propre enchère. */
  'OWN_AUCTION',
  /** L'utilisateur est déjà le meilleur enchérisseur. */
  'ALREADY_HIGHEST',
  /** Montant inférieur à `nextMinBid`, y compris quand une autre offre vient d'arriver. */
  'BID_TOO_LOW',
  /** Montant non entier, négatif ou démesuré. */
  'INVALID_AMOUNT',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
