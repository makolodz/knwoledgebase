import type { AuctionStatus, BidStanding, MyBid, MyWin, Page } from '@encheres/shared'
import type { Types } from 'mongoose'
import type { Storage } from '../infra/storage'
import { Auction, Bid, type UserDocument } from '../models'
import { presentPublic } from './auctions'

interface Paging {
  page: number
  limit: number
}

function standingOf(
  auction: {
    status: string
    currentBidderId: Types.ObjectId | null
    winnerId: Types.ObjectId | null
  },
  userId: Types.ObjectId,
): BidStanding {
  switch (auction.status) {
    case 'ended':
    case 'paid':
    case 'unpaid':
      return auction.winnerId?.equals(userId) === true ? 'won' : 'lost'
    case 'cancelled':
      return 'cancelled'
    default:
      return auction.currentBidderId?.equals(userId) === true ? 'leading' : 'outbid'
  }
}

/**
 * « Mes offres » : les enchères sur lesquelles l'utilisateur a enchéri, la dernière activité
 * d'abord, avec sa meilleure offre. Tout est borné à `user._id` : on ne lit jamais les offres
 * d'un autre.
 */
export async function listMyBids(
  storage: Storage,
  user: UserDocument,
  { page, limit }: Paging,
): Promise<Page<MyBid>> {
  const [grouped] = await Bid.aggregate<{
    items: { _id: Types.ObjectId; best: number }[]
    total: { count: number }[]
  }>([
    { $match: { userId: user._id } },
    { $group: { _id: '$auctionId', best: { $max: '$amount' }, last: { $max: '$createdAt' } } },
    { $sort: { last: -1, _id: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ])
  const rows = grouped?.items ?? []
  const total = grouped?.total[0]?.count ?? 0

  const auctions = await Auction.find({ _id: { $in: rows.map((row) => row._id) } })
  const byId = new Map(auctions.map((auction) => [auction._id.toString(), auction]))
  const presented = new Map(
    (await presentPublic(auctions, storage)).map((auction) => [auction.id, auction]),
  )

  const items: MyBid[] = rows.flatMap((row) => {
    const record = byId.get(row._id.toString())
    const auction = presented.get(row._id.toString())
    if (record === undefined || auction === undefined) return []
    return [{ auction, myBestBid: row.best, standing: standingOf(record, user._id) }]
  })
  return { items, total, page, limit }
}

/** « Mes enchères gagnées » : celles dont l'utilisateur est `winnerId`, la plus récente d'abord. */
export async function listMyWins(
  storage: Storage,
  user: UserDocument,
  { page, limit }: Paging,
): Promise<Page<MyWin>> {
  const statuses: AuctionStatus[] = ['ended', 'paid', 'unpaid']
  const filter = { winnerId: user._id, status: { $in: statuses } }
  const [records, total] = await Promise.all([
    Auction.find(filter)
      .sort({ endsAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Auction.countDocuments(filter),
  ])
  const presented = await presentPublic(records, storage)
  const items: MyWin[] = records.flatMap((record, index) => {
    const auction = presented[index]
    if (auction === undefined || record.currentPrice === null) return []
    return [
      {
        auction,
        finalPrice: record.currentPrice,
        paymentDeadline: record.paymentDeadline?.toISOString() ?? null,
      },
    ]
  })
  return { items, total, page, limit }
}
