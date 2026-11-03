import { z } from 'zod'
import { paginationInputSchema } from './pagination'

/** Statuts d'une enchère (docs/domain/workflows/auction-lifecycle.md). */
export const AUCTION_STATUSES = [
  'draft',
  'scheduled',
  'live',
  'ended',
  'paid',
  'unpaid',
  'cancelled',
] as const

export const auctionStatusSchema = z.enum(AUCTION_STATUSES)

export type AuctionStatus = z.infer<typeof auctionStatusSchema>

/** Règles de création (docs/domain/business-rules.md, « Création d'une enchère »). */
export const TITLE_MIN_LENGTH = 3
export const TITLE_MAX_LENGTH = 120
/** Plafond de sécurité : la description est libre, mais pas illimitée. */
export const DESCRIPTION_MAX_LENGTH = 5000
export const MIN_IMAGES = 1
export const MAX_IMAGES = 5
/** Poids maximal d'une photo envoyée (ADR-007). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** 1 € : prix de départ minimal, en centimes. */
export const MIN_STARTING_PRICE = 100
export const MIN_INCREMENT = 1
/** Plafond de sécurité des montants : 1 million d'euros, loin de tout usage réel. */
export const MAX_AMOUNT = 100_000_000
/** Motif d'un refus ou d'une annulation, montré au vendeur. */
export const REASON_MAX_LENGTH = 500

/** Valeurs par défaut des paramètres globaux (docs/domain/business-rules.md). */
export const DEFAULT_SETTINGS = {
  defaultMinIncrement: 100,
  antiSnipingMs: 120_000,
  paymentDelayMs: 172_800_000,
  minDurationMs: 3_600_000,
  maxDurationMs: 1_209_600_000,
} as const

export interface Settings {
  defaultMinIncrement: number
  antiSnipingMs: number
  paymentDelayMs: number
  minDurationMs: number
  maxDurationMs: number
}

/** Identifiant MongoDB, en texte : vérifié avant toute requête. */
export const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/, 'identifiant invalide')

/** Clé d'une photo : un UUID généré par le serveur à l'upload (ADR-007). */
export const imageKeySchema = z.uuid()

const dateSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value))

const amountSchema = z.number().int().max(MAX_AMOUNT)

const noDuplicateImages = {
  check: ({ images }: { images: string[] }) => new Set(images).size === images.length,
  params: { path: ['images'], message: 'photos en double' },
}

/**
 * Contenu d'une enchère, commun à la création et à la modification. Les règles qui dépendent de
 * l'heure ou des paramètres (début dans le futur, durée) sont vérifiées par le serveur.
 */
const auctionFields = {
  title: z.string().trim().min(TITLE_MIN_LENGTH).max(TITLE_MAX_LENGTH),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH),
  images: z.array(imageKeySchema).min(MIN_IMAGES).max(MAX_IMAGES),
  startingPrice: amountSchema.min(MIN_STARTING_PRICE),
  /** Absent : le serveur prend `defaultMinIncrement`. */
  minIncrement: amountSchema.min(MIN_INCREMENT).optional(),
  startsAt: dateSchema,
  endsAt: dateSchema,
}

export const createAuctionInputSchema = z
  .strictObject(auctionFields)
  .refine(noDuplicateImages.check, noDuplicateImages.params)

export const updateAuctionInputSchema = z
  .strictObject({ id: objectIdSchema, ...auctionFields })
  .refine(noDuplicateImages.check, noDuplicateImages.params)

export const auctionIdInputSchema = z.strictObject({ id: objectIdSchema })

/** Filtres de la liste publique : en cours, à venir, terminées (docs/technical/screens.md). */
export const AUCTION_LIST_FILTERS = ['live', 'upcoming', 'ended'] as const
export const AUCTION_LIST_SORTS = ['endingSoon', 'priceAsc', 'priceDesc', 'recent'] as const

export const listAuctionsInputSchema = paginationInputSchema.extend({
  filter: z.enum(AUCTION_LIST_FILTERS).default('live'),
  sort: z.enum(AUCTION_LIST_SORTS).default('endingSoon'),
})

export const mineAuctionsInputSchema = paginationInputSchema.extend({
  status: auctionStatusSchema.optional(),
})

export const pendingAuctionsInputSchema = paginationInputSchema

export const rejectAuctionInputSchema = z.strictObject({
  id: objectIdSchema,
  reason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
})

export type CreateAuctionInput = z.input<typeof createAuctionInputSchema>
export type ListAuctionsInput = z.input<typeof listAuctionsInputSchema>

export interface AuctionImage {
  /** Clé de la photo, celle qu'on renvoie à `auction.update`. */
  key: string
  url: string
  thumbUrl: string
}

/** Une enchère telle que le public la voit : jamais d'email, seulement le nom du vendeur. */
export interface PublicAuction {
  id: string
  title: string
  description: string
  images: AuctionImage[]
  startingPrice: number
  minIncrement: number
  currentPrice: number | null
  nextMinBid: number
  bidCount: number
  startsAt: string
  endsAt: string
  status: AuctionStatus
  sellerId: string
  sellerName: string
}

/** Une enchère vue par son vendeur ou par l'admin : s'y ajoute le motif d'un refus. */
export interface ManagedAuction extends PublicAuction {
  cancelReason: string | null
  createdAt: string
}

export interface Page<Item> {
  items: Item[]
  total: number
  page: number
  limit: number
}

/** Ce que le formulaire de création doit connaître des paramètres globaux. */
export interface AuctionRules {
  defaultMinIncrement: number
  minDurationMs: number
  maxDurationMs: number
}
