/**
 * Horloge des limites anti-abus (connexion, inscription…). Les tests envoient tous leurs requêtes
 * depuis la même adresse : sans cela, les limites par IP s'accumuleraient d'un test à l'autre.
 * `setup.ts` la fait avancer d'un jour avant chaque test, ce qui remet les compteurs à zéro ;
 * les tests des limites la manipulent pour franchir une fenêtre.
 */
export const rateLimitClock = { now: Date.now() }
