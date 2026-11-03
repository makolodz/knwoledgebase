import { describe, expect, it } from 'vitest'
import { Auction, Bid, User } from '../src/models'
import { placeBid } from '../src/services/bids'
import { loadBuyerEmail, prepareLoadTest, verifyLoadTest } from '../src/scripts/load-bids'
import { useTestDb } from './db'

useTestDb()

/** Le test de charge (`load/bids-concurrent.js`) n'est fiable que si sa vérification l'est. */
describe('préparation et vérification du test de charge', () => {
  async function fixtureWithBids() {
    const fixture = await prepareLoadTest({ users: 3 })
    const buyers = await User.find({ role: 'buyer' }).sort({ email: 1 })
    // Trois offres acceptées, de trois acheteurs, comme après un passage de k6.
    for (const [index, buyer] of buyers.entries()) {
      const result = await placeBid({
        userId: buyer._id.toString(),
        auctionId: fixture.auctionId,
        amount: 1000 + index * 100,
      })
      expect(result.ok).toBe(true)
    }
    return fixture
  }

  it('crée un vendeur, les acheteurs demandés et une enchère live qui prolonge à chaque offre', async () => {
    const fixture = await prepareLoadTest({ users: 3 })

    expect(await User.countDocuments({ role: 'buyer' })).toBe(3)
    expect(
      await User.exists({ email: loadBuyerEmail(2), emailVerifiedAt: { $ne: null } }),
    ).not.toBe(null)
    const auction = await Auction.findById(fixture.auctionId).orFail()
    expect(auction.status).toBe('live')
    // Fin à moins de 2 min : la première offre déclenche l'anti-sniping.
    expect(auction.endsAt.getTime() - Date.now()).toBeLessThan(120_000)
    // Relancer la préparation ne duplique pas les comptes.
    await prepareLoadTest({ users: 3 })
    expect(await User.countDocuments({ role: 'buyer' })).toBe(3)
  })

  it('ne signale rien sur un historique cohérent, avec le bon nombre d’offres vues acceptées', async () => {
    const fixture = await fixtureWithBids()

    expect(await verifyLoadTest(fixture.auctionId, { accepted: 3 })).toEqual({
      violations: [],
      bids: 3,
      currentPrice: 1200,
    })
  })

  it('signale une offre perdue ou fantôme (écart avec les acks des clients)', async () => {
    const fixture = await fixtureWithBids()

    const { violations } = await verifyLoadTest(fixture.auctionId, { accepted: 4 })

    expect(violations).toEqual(['4 offres acceptées côté clients pour 3 en base'])
  })

  it('signale un compteur, un prix, un meilleur enchérisseur ou une fin incohérents', async () => {
    const fixture = await fixtureWithBids()
    const other = await User.findOne({ email: loadBuyerEmail(0) }).orFail()
    await Auction.updateOne(
      { _id: fixture.auctionId },
      {
        $set: { bidCount: 2, currentPrice: 1100, currentBidderId: other._id, endsAt: new Date(0) },
      },
    )

    const { violations } = await verifyLoadTest(fixture.auctionId)

    expect(violations).toEqual([
      'bidCount vaut 2 pour 3 offres en base',
      'currentPrice vaut 1100, la plus haute offre 1200',
      'currentBidderId n’est pas l’auteur de la plus haute offre',
      'endsAt n’est pas la date de la dernière offre + antiSnipingMs',
    ])
  })

  it('signale une offre sous le minimum et deux offres consécutives du même acheteur', async () => {
    const fixture = await fixtureWithBids()
    // L'acheteur 2 détient déjà l'offre de 1200 ; 1250 est à 50 du précédent, sous le pas de 100.
    const carl = await User.findOne({ email: loadBuyerEmail(2) }).orFail()
    await Bid.create({ auctionId: fixture.auctionId, userId: carl._id, amount: 1250 })

    const { violations } = await verifyLoadTest(fixture.auctionId)

    expect(violations).toContain('offre de 1250 sous le minimum de 1300')
    expect(violations).toContain('deux offres consécutives (1200, 1250) du même acheteur')
    expect(violations).toContain('bidCount vaut 3 pour 4 offres en base')
  })
})
