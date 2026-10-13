import { AppError } from '../errors'

export interface RateLimiterOptions {
  /** Nombre d'événements autorisés dans la fenêtre. */
  max: number
  windowMs: number
}

/**
 * Limiteur à fenêtre glissante, en mémoire (ADR-014). Il compte des événements par clé (une IP,
 * un email, un utilisateur) et refuse quand `max` événements ont eu lieu dans les `windowMs`
 * dernières millisecondes. Les compteurs sont locaux au processus : suffisant tant que l'API
 * tourne en une seule instance (ADR-007).
 *
 * Deux usages :
 * - `consume` compte chaque tentative (inscription, mot de passe oublié…) ;
 * - `assertAllowed` avant, puis `record` seulement sur un échec (connexion, mot de passe actuel).
 */
export class RateLimiter {
  private readonly events = new Map<string, number[]>()

  constructor(
    private readonly options: RateLimiterOptions,
    private readonly now: () => number = Date.now,
  ) {}

  /** Événements de la clé encore dans la fenêtre (les plus anciens sont oubliés). */
  private recent(key: string): number[] {
    const cutoff = this.now() - this.options.windowMs
    const recent = (this.events.get(key) ?? []).filter((time) => time > cutoff)
    if (recent.length === 0) this.events.delete(key)
    else this.events.set(key, recent)
    return recent
  }

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.options.max
  }

  /** Lève `RATE_LIMITED` si la clé a atteint la limite. */
  assertAllowed(key: string): void {
    if (this.isBlocked(key)) throw new AppError('RATE_LIMITED')
  }

  /** Compte un événement. Garde au plus `max` dates par clé : la mémoire reste bornée. */
  record(key: string): void {
    const recent = this.recent(key)
    recent.push(this.now())
    if (recent.length > this.options.max) recent.splice(0, recent.length - this.options.max)
    this.events.set(key, recent)
  }

  /** Vérifie puis compte, d'un seul geste : pour limiter les tentatives, réussies ou non. */
  consume(key: string): void {
    this.assertAllowed(key)
    this.record(key)
  }

  /** Oublie une clé, par exemple après une connexion réussie. */
  reset(key: string): void {
    this.events.delete(key)
  }

  /** Purge les clés dont tous les événements sont sortis de la fenêtre. */
  sweep(): void {
    for (const key of [...this.events.keys()]) this.recent(key)
  }

  /** Nombre de clés suivies (pour les tests). */
  get size(): number {
    return this.events.size
  }
}
