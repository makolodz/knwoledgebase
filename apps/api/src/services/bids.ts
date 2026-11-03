import {
  bidAmountSchema,
  type BidErrorCode,
  type BidNewEvent,
  type BidRecord,
  type Page,
} from '@encheres/shared'
import { Types } from 'mongoose'
import { AppError } from '../errors'
import { Auction, Bid, User } from '../models'
import { PUBLIC_STATUSES } from './auctions'
import { getSettings } from './settings'

export type PlaceBidResult =
  | {
      ok: true
      /** Ce qui est diffusé à la room de l'enchère. */
      event: BidNewEvent
      /** Nouvelle date de fin si l'anti-sniping l'a repoussée, sinon `null`. */
      extendedTo: Date | null
      /** Meilleur enchérisseur dépassé par cette offre, à prévenir. */
      outbid: { userId: Types.ObjectId; auctionTitle: string } | null
    }
  | { ok: false; code: BidErrorCode }

const refused = (code: BidErrorCode): PlaceBidResult => ({ ok: false, code })

/**
 * Place une offre (docs/domain/business-rules.md, « Placer une offre » ; ADR-004 et ADR-005).
 *
 * - L'utilisateur est **relu en base** : rôle, email vérifié, suspension. Le JWT ne prouve que
 *   son identité.
 * - Toutes les règles de l'enchère sont vérifiées et l'offre est appliquée par **un seul**
 *   `findOneAndUpdate`, prolongation anti-sniping comprise : deux offres simultanées ne peuvent
 *   pas passer ensemble, la première enregistrée gagne.
 * - L'heure vient du serveur, prise une seule fois : la même valeur sert au filtre et à
 *   l'anti-sniping.
 */
export async function placeBid(input: {
  userId: string
  auctionId: string
  amount: unknown
  now?: Date
}): Promise<PlaceBidResult> {
  const now = input.now ?? new Date()

  const amountResult = bidAmountSchema.safeParse(input.amount)
  if (!amountResult.success) return refused('INVALID_AMOUNT')
  const amount = amountResult.data

  if (!Types.ObjectId.isValid(input.auctionId) || !Types.ObjectId.isValid(input.userId)) {
    return refused('AUCTION_NOT_LIVE')
  }
  const auctionId = new Types.ObjectId(input.auctionId)
  const userId = new Types.ObjectId(input.userId)

  const user = await User.findById(userId)
  if (user === null || user.deletedAt !== null) return refused('NOT_AUTHENTICATED')
  if (user.suspendedAt !== null) return refused('ACCOUNT_SUSPENDED')
  if (user.role !== 'buyer' && user.role !== 'seller') return refused('FORBIDDEN')
  if (user.emailVerifiedAt === null) return refused('EMAIL_NOT_VERIFIED')

  const { antiSnipingMs } = await getSettings()
  const minimumEnd = new Date(now.getTime() + antiSnipingMs)

  // `returnDocument: 'before'` : on a besoin de l'ancien meilleur enchérisseur et de l'ancienne
  // fin. Les nouvelles valeurs se déduisent de la même heure `now` que la requête a utilisée.
  const before = await Auction.findOneAndUpdate(
    {
      _id: auctionId,
      status: 'live',
      endsAt: { $gt: now },
      nextMinBid: { $lte: amount },
      sellerId: { $ne: userId },
      currentBidderId: { $ne: userId },
    },
    [
      {
        $set: {
          currentPrice: amount,
          currentBidderId: userId,
          nextMinBid: { $add: [amount, '$minIncrement'] },
          bidCount: { $add: ['$bidCount', 1] },
          endsAt: { $max: ['$endsAt', minimumEnd] },
        },
      },
    ],
    { returnDocument: 'before', updatePipeline: true },
  )

  if (before === null) return refused(await explainRefusal(auctionId, userId, now))

  await Bid.create({ auctionId, userId, amount, createdAt: now })

  const extendedTo = minimumEnd.getTime() > before.endsAt.getTime() ? minimumEnd : null
  return {
    ok: true,
    event: {
      auctionId: auctionId.toString(),
      amount,
      bidder: { id: userId.toString(), name: user.name },
      at: now.toISOString(),
      nextMinBid: amount + before.minIncrement,
      bidCount: before.bidCount + 1,
    },
    extendedTo,
    outbid:
      before.currentBidderId === null
        ? null
        : { userId: before.currentBidderId, auctionTitle: before.title },
  }
}

/**
 * Après un refus atomique, relit l'enchère pour donner le code exact, dans l'ordre de
 * business-rules.md. Si l'état a encore changé entre-temps, `BID_TOO_LOW` est la réponse juste :
 * une autre offre est arrivée avant.
 */
async function explainRefusal(
  auctionId: Types.ObjectId,
  userId: Types.ObjectId,
  now: Date,
): Promise<BidErrorCode> {
  const auction = await Auction.findById(auctionId, {
    status: 1,
    endsAt: 1,
    sellerId: 1,
    currentBidderId: 1,
  })
  if (auction === null || auction.status !== 'live' || auction.endsAt.getTime() <= now.getTime()) {
    return 'AUCTION_NOT_LIVE'
  }
  if (auction.sellerId.equals(userId)) return 'OWN_AUCTION'
  if (auction.currentBidderId?.equals(userId) === true) return 'ALREADY_HIGHEST'
  return 'BID_TOO_LOW'
}

/** Historique public d'une enchère, la plus récente offre d'abord : nom d'affichage seulement. */
export async function listBids(
  auctionId: string,
  { page, limit }: { page: number; limit: number },
): Promise<Page<BidRecord>> {
  const id = new Types.ObjectId(auctionId)
  // Seules les enchères publiques ont un historique visible.
  if ((await Auction.exists({ _id: id, status: { $in: PUBLIC_STATUSES } })) === null) {
    throw new AppError('AUCTION_NOT_FOUND')
  }
  const filter = { auctionId: id }
  const [bids, total] = await Promise.all([
    Bid.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Bid.countDocuments(filter),
  ])
  const users = await User.find({ _id: { $in: bids.map((bid) => bid.userId) } }, { name: 1 })
  const names = new Map(users.map((user) => [user._id.toString(), user.name]))
  return {
    items: bids.map((bid) => ({
      id: bid._id.toString(),
      amount: bid.amount,
      bidder: { id: bid.userId.toString(), name: names.get(bid.userId.toString()) ?? '' },
      at: bid.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  }
}
