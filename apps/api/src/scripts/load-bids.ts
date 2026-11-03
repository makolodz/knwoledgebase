import { Auction, Bid, User } from '../models'
import { hashPassword } from '../services/password'
import { getSettings } from '../services/settings'
import { SEED_PASSWORD } from './seed'

/**
 * Données du test de charge d'offres concurrentes (`load/bids-concurrent.js`, voir
 * `load/rapport.md`) : `prepareLoadTest` crée les comptes et l'enchère, `verifyLoadTest` relit la
 * base après le passage de k6. Mêmes garde-fous que le seed : domaine `.test`, mot de passe public.
 */

export const LOAD_SELLER_EMAIL = 'vendeur-charge@example.test'
export const loadBuyerEmail = (index: number) => `acheteur-charge-${index}@example.test`

/** Fin initiale : à moins d'`antiSnipingMs`, pour que toute offre prolonge l'enchère. */
const AUCTION_DURATION_MS = 90_000

export interface LoadFixture {
  auctionId: string
  users: number
  startingPrice: number
  minIncrement: number
}

/** Crée (ou remet à neuf) le vendeur et `users` acheteurs, puis ouvre une enchère `live`. */
export async function prepareLoadTest({
  users,
  now = new Date(),
}: {
  users: number
  now?: Date
}): Promise<LoadFixture> {
  const passwordHash = await hashPassword(SEED_PASSWORD)
  const accounts = [
    { email: LOAD_SELLER_EMAIL, name: 'Vendeur charge', role: 'seller' as const },
    ...Array.from({ length: users }, (_, index) => ({
      email: loadBuyerEmail(index),
      name: `Charge ${index}`,
      role: 'buyer' as const,
    })),
  ]
  await User.bulkWrite(
    accounts.map((account) => ({
      updateOne: {
        filter: { email: account.email },
        update: {
          $set: {
            ...account,
            passwordHash,
            emailVerifiedAt: now,
            suspendedAt: null,
            deletedAt: null,
          },
          $setOnInsert: { acceptedTermsAt: now, createdAt: now },
        },
        upsert: true,
      },
    })),
  )

  const seller = await User.findOne({ email: LOAD_SELLER_EMAIL }).orFail()
  const startingPrice = 1000
  const minIncrement = 100
  const auction = await Auction.create({
    sellerId: seller._id,
    title: 'Enchère du test de charge',
    description: 'Créée par `pnpm load:prepare`.',
    images: [],
    startingPrice,
    minIncrement,
    nextMinBid: startingPrice,
    startsAt: new Date(now.getTime() - 60_000),
    endsAt: new Date(now.getTime() + AUCTION_DURATION_MS),
    status: 'live',
  })
  return { auctionId: auction._id.toString(), users, startingPrice, minIncrement }
}

export interface LoadVerdict {
  violations: string[]
  bids: number
  currentPrice: number | null
}

/**
 * Relit l'enchère et son historique et liste ce qui est incohérent (liste vide = tout va bien).
 * `accepted` : le nombre d'offres que les clients ont vues acceptées ; il doit être égal au
 * nombre d'offres en base (aucune offre perdue, aucune offre fantôme).
 */
export async function verifyLoadTest(
  auctionId: string,
  { accepted }: { accepted?: number } = {},
): Promise<LoadVerdict> {
  const auction = await Auction.findById(auctionId)
  if (auction === null) return { violations: ['enchère introuvable'], bids: 0, currentPrice: null }
  const { antiSnipingMs } = await getSettings()
  // Dans l'ordre des montants : l'ordre d'insertion peut différer de l'ordre d'acceptation.
  const bids = await Bid.find({ auctionId: auction._id }).sort({ amount: 1, _id: 1 })
  const violations: string[] = []

  if (bids.length !== auction.bidCount) {
    violations.push(`bidCount vaut ${auction.bidCount} pour ${bids.length} offres en base`)
  }
  if (accepted !== undefined && bids.length !== accepted) {
    violations.push(`${accepted} offres acceptées côté clients pour ${bids.length} en base`)
  }

  bids.forEach((bid, index) => {
    const previous = bids[index - 1]
    const floor =
      previous === undefined ? auction.startingPrice : previous.amount + auction.minIncrement
    if (bid.amount < floor) {
      violations.push(`offre de ${bid.amount} sous le minimum de ${floor}`)
    }
    if (previous !== undefined && previous.userId.equals(bid.userId)) {
      violations.push(
        `deux offres consécutives (${previous.amount}, ${bid.amount}) du même acheteur`,
      )
    }
  })

  const highest = bids[bids.length - 1]
  if (highest === undefined) {
    if (auction.currentPrice !== null) violations.push('currentPrice sans aucune offre')
    if (auction.nextMinBid !== auction.startingPrice) violations.push('nextMinBid sans offre')
  } else {
    if (auction.currentPrice !== highest.amount) {
      violations.push(
        `currentPrice vaut ${auction.currentPrice}, la plus haute offre ${highest.amount}`,
      )
    }
    if (auction.currentBidderId?.toString() !== highest.userId.toString()) {
      violations.push('currentBidderId n’est pas l’auteur de la plus haute offre')
    }
    if (auction.nextMinBid !== highest.amount + auction.minIncrement) {
      violations.push(`nextMinBid vaut ${auction.nextMinBid}`)
    }
    // Anti-sniping appliqué une seule fois : la fin est celle de la dernière offre, jamais plus loin.
    const lastBidAt = Math.max(...bids.map((bid) => bid.createdAt.getTime()))
    if (auction.endsAt.getTime() !== lastBidAt + antiSnipingMs) {
      violations.push('endsAt n’est pas la date de la dernière offre + antiSnipingMs')
    }
  }
  return { violations, bids: bids.length, currentPrice: auction.currentPrice }
}
