import { z } from 'zod'
import { MAX_AMOUNT, objectIdSchema } from './schemas/auction'

/**
 * Contrat des événements Socket.IO (docs/technical/realtime.md). Le client et le serveur
 * l'importent : il n'est défini nulle part ailleurs. Aucun événement ne porte d'email ni de
 * donnée privée, seulement l'`id` et le nom d'affichage d'un utilisateur.
 */

/** Nom de la room d'une enchère : seuls ceux qui la regardent reçoivent ses événements. */
export const auctionRoom = (auctionId: string) => `auction:${auctionId}`

/** Une même connexion ne suit qu'un nombre limité d'enchères (garde-fou contre les abus). */
export const MAX_ROOMS_PER_SOCKET = 20

/**
 * Codes de refus d'une offre (docs/domain/business-rules.md, « Placer une offre »).
 * `INTERNAL_ERROR` n'est pas un refus métier : c'est une panne du serveur, l'offre n'est pas
 * connue comme acceptée.
 */
export const BID_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_SUSPENDED',
  'AUCTION_NOT_LIVE',
  'OWN_AUCTION',
  'ALREADY_HIGHEST',
  'BID_TOO_LOW',
  'RATE_LIMITED',
  'INVALID_AMOUNT',
  'INTERNAL_ERROR',
] as const

export type BidErrorCode = (typeof BID_ERROR_CODES)[number]

export type AckResult = { ok: true } | { ok: false; code: BidErrorCode }

/** `auction:join` et `auction:leave` : l'enchère suivie. */
export const auctionRoomPayloadSchema = z.strictObject({ auctionId: objectIdSchema })

/**
 * `bid:place`. Le montant est volontairement accepté tel quel ici : un montant décimal, négatif
 * ou absurde doit recevoir le code `INVALID_AMOUNT` dans l'ack, pas une erreur de forme.
 */
export const bidPlacePayloadSchema = z.strictObject({
  auctionId: objectIdSchema,
  amount: z.unknown(),
})

/** Un montant d'offre valide : entier strictement positif, en centimes. */
export const bidAmountSchema = z.number().int().min(1).max(MAX_AMOUNT)

export interface BidderRef {
  id: string
  name: string
}

export interface BidNewEvent {
  auctionId: string
  amount: number
  bidder: BidderRef
  /** Date de l'offre (ISO, UTC). */
  at: string
  /** Offre minimale suivante, calculée par le serveur : le front ne la recalcule jamais. */
  nextMinBid: number
  bidCount: number
}

export interface AuctionExtendedEvent {
  auctionId: string
  /** Nouvelle date de fin (ISO, UTC). */
  endsAt: string
}

export interface AuctionEndedEvent {
  auctionId: string
  winner: BidderRef | null
  /** Prix final en centimes ; `null` quand l'enchère s'est terminée sans offre. */
  finalPrice: number | null
}

export interface ServerToClientEvents {
  'bid:new': (event: BidNewEvent) => void
  'auction:extended': (event: AuctionExtendedEvent) => void
  'auction:ended': (event: AuctionEndedEvent) => void
}

export interface ClientToServerEvents {
  'auction:join': (payload: unknown, ack: (result: AckResult) => void) => void
  'auction:leave': (payload: unknown, ack?: (result: AckResult) => void) => void
  'bid:place': (payload: unknown, ack: (result: AckResult) => void) => void
}

/** Une offre dans l'historique d'une enchère (`auction.bids`). */
export interface BidRecord {
  id: string
  amount: number
  bidder: BidderRef
  at: string
}
