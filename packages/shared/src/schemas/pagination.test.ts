import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, paginationInputSchema } from './pagination'

describe('paginationInputSchema (T1.4)', () => {
  it('applique les valeurs par défaut (page 1, 20 par page)', () => {
    expect(paginationInputSchema.parse({})).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE })
  })

  it('accepte les bornes (limit 1 et 100, page 1)', () => {
    expect(paginationInputSchema.parse({ page: 1, limit: 1 }).limit).toBe(1)
    expect(paginationInputSchema.parse({ page: 1, limit: MAX_PAGE_SIZE }).limit).toBe(MAX_PAGE_SIZE)
  })

  it.each([
    ['une limite de 101', { limit: 101 }],
    ['une limite de 0', { limit: 0 }],
    ['une page de 0', { page: 0 }],
    ['une page négative', { page: -1 }],
    ['une page décimale', { page: 1.5 }],
    ['un nombre sous forme de texte', { page: '2' }],
    ['un champ inconnu', { page: 1, sort: 'asc' }],
  ])('rejette %s', (_label, input) => {
    expect(paginationInputSchema.safeParse(input).success).toBe(false)
  })
})
