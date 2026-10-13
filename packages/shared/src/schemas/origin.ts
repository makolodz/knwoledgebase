import { z } from 'zod'

/** Vrai pour une origine exacte (`https://hote:port`), telle qu'envoyée par les navigateurs. */
function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value
  } catch {
    return false
  }
}

/**
 * Origine web : schéma, hôte et port éventuel, sans chemin ni barre finale.
 * Sert à `WEB_ORIGIN` (API) et `VITE_API_URL` (front), comparées telles quelles par CORS.
 */
export const originSchema = z.string().refine(isOrigin, {
  message: 'doit être une origine (schéma, hôte et port éventuel), sans chemin ni barre finale',
})
