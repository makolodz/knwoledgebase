/** Ce que le formulaire d'enchère envoie : montants en centimes, dates ISO en UTC. */
export interface AuctionPayload {
  title: string
  description: string
  images: string[]
  startingPrice: number
  minIncrement: number
  startsAt: string
  endsAt: string
}
