import { originSchema } from '@encheres/shared'
import { z } from 'zod'

const envSchema = z.object({
  /** Origine de l'API (HTTP et Socket.IO). */
  VITE_API_URL: originSchema.default('http://localhost:3000'),
})

/** Lue au démarrage : une valeur invalide fait échouer le chargement de l'application. */
export const env = envSchema.parse(import.meta.env)
