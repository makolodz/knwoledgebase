import type { ManagedAuction, PublicAuction } from '@encheres/shared'

const KEY = '3f2b1c9e-5a7d-4e1b-9c3a-1d2e3f4a5b6c'

export function publicAuction(overrides: Partial<PublicAuction> = {}): PublicAuction {
  return {
    id: 'a'.repeat(24),
    title: 'Vase ancien',
    description: 'Un beau vase.\nSigné.',
    images: [{ key: KEY, url: `/uploads/${KEY}.webp`, thumbUrl: `/uploads/${KEY}.thumb.webp` }],
    startingPrice: 1000,
    minIncrement: 100,
    currentPrice: null,
    nextMinBid: 1000,
    bidCount: 0,
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + 10_800_000).toISOString(),
    status: 'scheduled',
    sellerId: 'b'.repeat(24),
    sellerName: 'Vera',
    ...overrides,
  }
}

export function managedAuction(overrides: Partial<ManagedAuction> = {}): ManagedAuction {
  return {
    ...publicAuction(),
    cancelReason: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function page<Item>(items: Item[], total = items.length) {
  return { items, total, page: 1, limit: 12 }
}
