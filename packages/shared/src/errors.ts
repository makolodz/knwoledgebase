/**
 * Codes d'erreur métier renvoyés au client dans `error.data.code` (docs/technical/api.md).
 * Les codes des offres (`BID_TOO_LOW`…) s'ajouteront avec l'étape 4.
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
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]
