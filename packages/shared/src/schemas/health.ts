import { z } from 'zod'

/** Réponse de la procédure tRPC `health`. `time` est en UTC (ISO 8601, suffixe `Z`). */
export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  time: z.iso.datetime(),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
