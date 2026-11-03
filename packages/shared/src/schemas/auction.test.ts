import { describe, expect, it } from 'vitest'
import {
  createAuctionInputSchema,
  listAuctionsInputSchema,
  rejectAuctionInputSchema,
} from './auction'

const IMAGE = '3f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c'

function valid(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Vase ancien',
    description: 'Un vase.',
    images: [IMAGE],
    startingPrice: 100,
    startsAt: '2030-01-01T10:00:00.000Z',
    endsAt: '2030-01-02T10:00:00.000Z',
    ...overrides,
  }
}

describe('T3.1 — titre', () => {
  it.each([2, 121])('refuse un titre de %i caractères', (length) => {
    expect(createAuctionInputSchema.safeParse(valid({ title: 'a'.repeat(length) })).success).toBe(
      false,
    )
  })

  it.each([3, 120])('accepte un titre de %i caractères', (length) => {
    expect(createAuctionInputSchema.safeParse(valid({ title: 'a'.repeat(length) })).success).toBe(
      true,
    )
  })

  it('ignore les espaces de bord avant de compter', () => {
    expect(createAuctionInputSchema.safeParse(valid({ title: '  ab  ' })).success).toBe(false)
  })
})

describe('T3.2 — prix de départ', () => {
  it('refuse 99, accepte 100', () => {
    expect(createAuctionInputSchema.safeParse(valid({ startingPrice: 99 })).success).toBe(false)
    expect(createAuctionInputSchema.safeParse(valid({ startingPrice: 100 })).success).toBe(true)
  })

  it.each([100.5, -100, Number.NaN, '100'])('refuse %j (entier requis)', (startingPrice) => {
    expect(createAuctionInputSchema.safeParse(valid({ startingPrice })).success).toBe(false)
  })

  it('refuse un pas minimum de 0', () => {
    expect(createAuctionInputSchema.safeParse(valid({ minIncrement: 0 })).success).toBe(false)
    expect(createAuctionInputSchema.safeParse(valid({ minIncrement: 1 })).success).toBe(true)
  })
})

describe('T3.5 — nombre de photos', () => {
  const keys = (count: number) =>
    Array.from({ length: count }, (_, index) => `3f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6${index}`)

  it('refuse 0 et 6 photos, accepte 1 et 5', () => {
    expect(createAuctionInputSchema.safeParse(valid({ images: keys(0) })).success).toBe(false)
    expect(createAuctionInputSchema.safeParse(valid({ images: keys(6) })).success).toBe(false)
    expect(createAuctionInputSchema.safeParse(valid({ images: keys(1) })).success).toBe(true)
    expect(createAuctionInputSchema.safeParse(valid({ images: keys(5) })).success).toBe(true)
  })

  it('refuse une clé qui n’est pas un UUID (pas de chemin dans une clé)', () => {
    expect(createAuctionInputSchema.safeParse(valid({ images: ['../secret'] })).success).toBe(false)
  })

  it('refuse deux fois la même photo', () => {
    expect(createAuctionInputSchema.safeParse(valid({ images: [IMAGE, IMAGE] })).success).toBe(
      false,
    )
  })
})

describe('createAuctionInputSchema', () => {
  it('convertit les dates en objets Date', () => {
    const parsed = createAuctionInputSchema.parse(valid())
    expect(parsed.startsAt).toEqual(new Date('2030-01-01T10:00:00.000Z'))
  })

  it('refuse une date illisible et un champ inconnu', () => {
    expect(createAuctionInputSchema.safeParse(valid({ startsAt: 'demain' })).success).toBe(false)
    expect(createAuctionInputSchema.safeParse(valid({ status: 'live' })).success).toBe(false)
    expect(createAuctionInputSchema.safeParse(valid({ sellerId: 'x' })).success).toBe(false)
  })
})

describe('listAuctionsInputSchema', () => {
  it('prend les enchères en cours, par fin proche, par défaut', () => {
    expect(listAuctionsInputSchema.parse({})).toMatchObject({
      filter: 'live',
      sort: 'endingSoon',
      page: 1,
      limit: 20,
    })
  })

  it('refuse un filtre ou un tri inconnu', () => {
    expect(listAuctionsInputSchema.safeParse({ filter: 'draft' }).success).toBe(false)
    expect(listAuctionsInputSchema.safeParse({ sort: 'x' }).success).toBe(false)
  })
})

describe('rejectAuctionInputSchema', () => {
  it('exige un motif', () => {
    const id = 'a'.repeat(24)
    expect(rejectAuctionInputSchema.safeParse({ id, reason: '   ' }).success).toBe(false)
    expect(rejectAuctionInputSchema.safeParse({ id }).success).toBe(false)
    expect(rejectAuctionInputSchema.safeParse({ id, reason: 'Photos floues' }).success).toBe(true)
  })
})
