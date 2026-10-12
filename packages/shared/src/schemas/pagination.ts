import { z } from 'zod'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** Entrée commune des listes paginées (docs/technical/api.md, section « Pagination »). */
export const paginationInputSchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})

export type PaginationInput = z.infer<typeof paginationInputSchema>
