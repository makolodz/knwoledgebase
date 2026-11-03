import { auctionRoom, type AuctionEndedEvent } from '@encheres/shared'
import type { Config } from '../config/env'
import { Auction, User, type AuctionDocument } from '../models'
import type { SocketServer } from '../sockets'
import { enqueueEmail } from './email-queue'
import { buildWebLink } from './links'
import { getSettings } from './settings'

export interface ClosingDeps {
  /** Seulement de quoi diffuser à une room : les tests peuvent fournir un faux. */
  io: Pick<SocketServer, 'to'>
  config: Pick<Config, 'webOrigin'>
  /** Appelé quand une notification n'a pas pu être mise en file (l'enchère est déjà close). */
  onNotifyError?: (error: unknown) => void
}

/**
 * Clôture les enchères `live` dont `endsAt` est atteint (docs/domain/workflows/auction-lifecycle.md,
 * « Clôture » ; ADR-008). Renvoie le nombre d'enchères closes.
 *
 * - La transition est **une seule** mise à jour conditionnée par le statut et la date : deux
 *   passages (ou deux instances) ne closent jamais deux fois la même enchère. Elle s'exclut avec
 *   une offre, qui exige elle aussi `status: 'live'` et `endsAt > maintenant` dans son propre
 *   `findOneAndUpdate` : l'une des deux passe en premier, jamais les deux.
 * - Seul le passage qui a réussi la mise à jour déclenche les effets (événement et emails).
 * - Avec une offre : `winnerId = currentBidderId` et `paymentDeadline = maintenant + paymentDelayMs`.
 *   Sans offre : `ended` sans gagnant ni échéance.
 * - L'heure vient du serveur et de `endsAt` en base, jamais du client.
 */
export async function closeDueAuctions(deps: ClosingDeps, now: Date = new Date()): Promise<number> {
  const { paymentDelayMs } = await getSettings()
  const paymentDeadline = new Date(now.getTime() + paymentDelayMs)

  let closed = 0
  for (;;) {
    const auction = await Auction.findOneAndUpdate(
      { status: 'live', endsAt: { $lte: now } },
      [
        {
          $set: {
            status: 'ended',
            winnerId: '$currentBidderId',
            paymentDeadline: {
              $cond: [{ $eq: [{ $type: '$currentBidderId' }, 'objectId'] }, paymentDeadline, null],
            },
          },
        },
      ],
      { returnDocument: 'after', sort: { endsAt: 1 }, updatePipeline: true },
    )
    if (auction === null) return closed
    closed += 1
    await announceClosing(deps, auction)
  }
}

async function announceClosing(deps: ClosingDeps, auction: AuctionDocument): Promise<void> {
  const id = auction._id.toString()
  const winner = auction.winnerId === null ? null : await User.findById(auction.winnerId)

  // Diffusion à la room de l'enchère seulement : le nom du gagnant, jamais son email.
  const event: AuctionEndedEvent = {
    auctionId: id,
    winner: winner === null ? null : { id: winner._id.toString(), name: winner.name },
    finalPrice: winner === null ? null : auction.currentPrice,
  }
  deps.io.to(auctionRoom(id)).emit('auction:ended', event)

  // Les emails passent par la file : une panne de la file ne défait pas la clôture.
  try {
    if (winner !== null && winner.email != null && auction.currentPrice !== null) {
      await enqueueEmail(winner.email, 'auction-won', {
        name: winner.name,
        title: auction.title,
        amount: auction.currentPrice,
        deadline: auction.paymentDeadline?.toISOString() ?? new Date().toISOString(),
        link: buildWebLink(deps.config, '/account/wins'),
      })
    }
    const seller = await User.findById(auction.sellerId)
    if (seller?.email != null) {
      const link = buildWebLink(deps.config, '/seller/auctions')
      if (winner !== null && auction.currentPrice !== null) {
        await enqueueEmail(seller.email, 'auction-sold', {
          name: seller.name,
          title: auction.title,
          amount: auction.currentPrice,
          winnerName: winner.name,
          link,
        })
      } else {
        await enqueueEmail(seller.email, 'auction-unsold', {
          name: seller.name,
          title: auction.title,
          link,
        })
      }
    }
  } catch (error) {
    deps.onNotifyError?.(error)
  }
}
