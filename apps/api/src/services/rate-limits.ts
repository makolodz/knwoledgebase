import { RateLimiter } from './rate-limiter'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Limites de docs/technical/security.md, section « Limites anti-abus ».
 * `bid:place` (5 par seconde et par utilisateur) arrivera avec l'étape 4, sur le même limiteur.
 */
export interface RateLimits {
  /** Échecs de connexion par IP : 5 par 15 min. */
  loginByIp: RateLimiter
  /** Échecs de connexion par email : 5 par 15 min. */
  loginByEmail: RateLimiter
  /** Inscriptions par IP : 5 par heure. */
  register: RateLimiter
  /** Demandes de mot de passe oublié par IP : 5 par heure. */
  forgotPassword: RateLimiter
  /** Demandes de renvoi du lien de vérification par IP : 5 par heure. */
  resendVerification: RateLimiter
  /**
   * Mots de passe actuels refusés par utilisateur : 5 par 15 min. Sans cela, une session volée
   * permettrait de deviner le mot de passe via le changement de mot de passe ou d'email.
   */
  passwordCheck: RateLimiter
  /** Oublie les compteurs expirés. */
  sweep(): void
}

export function createRateLimits(now: () => number = Date.now): RateLimits {
  const failures = { max: 5, windowMs: 15 * MINUTE_MS }
  const perHour = { max: 5, windowMs: HOUR_MS }

  const limiters = {
    loginByIp: new RateLimiter(failures, now),
    loginByEmail: new RateLimiter(failures, now),
    register: new RateLimiter(perHour, now),
    forgotPassword: new RateLimiter(perHour, now),
    resendVerification: new RateLimiter(perHour, now),
    passwordCheck: new RateLimiter(failures, now),
  }
  return {
    ...limiters,
    sweep() {
      for (const limiter of Object.values(limiters)) limiter.sweep()
    },
  }
}
