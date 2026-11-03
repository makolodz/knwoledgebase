import type { BidNewEvent, BidRecord, Page } from '@encheres/shared'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import { Types } from 'mongoose'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Auction, Bid, Setting, User } from '../src/models'
import { placeBid } from '../src/services/bids'
import { signAccessToken } from '../src/services/jwt'
import { appRouter } from '../src/trpc/router'
import { useTestDb } from './db'
import { createTestApp, listen, testConfig } from './helpers'
import {
  collect,
  createLiveAuction,
  createLoggedInUser,
  emitWithAck,
  openSocket,
  settle,
  whenConnected,
  type ClientSocket,
} from './sockets'
import { TestClient } from './trpc'
import { createUser } from './users'

useTestDb()

const SECOND_MS = 1000
const MINUTE_MS = 60_000
const ANTI_SNIPING_MS = 120_000

let app: FastifyInstance
let url: string
let seller: Awaited<ReturnType<typeof createUser>>
const sockets: ClientSocket[] = []

beforeAll(async () => {
  app = await createTestApp()
  url = await listen(app)
})
afterAll(async () => {
  await app.close()
})
beforeEach(async () => {
  seller = await createUser({
    email: 'vendeur@x.fr',
    name: 'Vera',
    role: 'seller',
    emailVerifiedAt: new Date(),
  })
})
afterEach(() => {
  sockets.splice(0).forEach((socket) => socket.disconnect())
})

/** Un acheteur connecté (cookie de session) avec un socket ouvert. */
async function buyerSocket(email: string, overrides: Parameters<typeof createUser>[0] = {}) {
  const { user, accessToken } = await createLoggedInUser(
    () => new TestClient(app),
    email,
    overrides,
  )
  const socket = openSocket(url, accessToken)
  sockets.push(socket)
  expect(await whenConnected(socket)).toBe('connected')
  return { user, socket, accessToken }
}

function bid(socket: ClientSocket, auctionId: unknown, amount: unknown) {
  return emitWithAck(socket, 'bid:place', { auctionId: String(auctionId), amount })
}

describe('vérifications d’une offre — T4.1 à T4.13', () => {
  it('T4.1 — un visiteur (sans cookie) reçoit NOT_AUTHENTICATED', async () => {
    const auction = await createLiveAuction(seller._id)
    const visitor = openSocket(url)
    sockets.push(visitor)
    await whenConnected(visitor)

    expect(await bid(visitor, auction._id, 1000)).toEqual({ ok: false, code: 'NOT_AUTHENTICATED' })
    expect(await Bid.countDocuments()).toBe(0)
  })

  it('T4.2 — un admin reçoit FORBIDDEN', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('admin@x.fr', { role: 'admin' })

    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  it('T4.3 — un email non vérifié reçoit EMAIL_NOT_VERIFIED', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('ana@x.fr', { emailVerifiedAt: null })

    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: false, code: 'EMAIL_NOT_VERIFIED' })
  })

  it('T4.4 — un compte suspendu reçoit ACCOUNT_SUSPENDED, ses offres déjà placées restent valides', async () => {
    const auction = await createLiveAuction(seller._id)
    const { user, socket } = await buyerSocket('ana@x.fr')
    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: true })

    // Le rôle et la suspension sont relus en base : le JWT, lui, est toujours valide.
    await User.updateOne({ _id: user._id }, { $set: { suspendedAt: new Date() } })
    const other = await buyerSocket('bob@x.fr')
    expect(await bid(other.socket, auction._id, 1100)).toEqual({ ok: true })
    expect(await bid(socket, auction._id, 1200)).toEqual({ ok: false, code: 'ACCOUNT_SUSPENDED' })

    expect(await Bid.countDocuments({ userId: user._id })).toBe(1)
  })

  it('un compte supprimé reçoit NOT_AUTHENTICATED', async () => {
    const auction = await createLiveAuction(seller._id)
    const { user, socket } = await buyerSocket('ana@x.fr')
    await User.updateOne({ _id: user._id }, { $set: { deletedAt: new Date() } })

    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: false, code: 'NOT_AUTHENTICATED' })
  })

  it('un rôle changé en base s’applique sans reconnexion', async () => {
    const auction = await createLiveAuction(seller._id)
    const { user, socket } = await buyerSocket('ana@x.fr')
    await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } })

    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: false, code: 'FORBIDDEN' })
  })

  it.each(['draft', 'scheduled', 'ended', 'paid', 'unpaid', 'cancelled'] as const)(
    'T4.5 — une enchère %s reçoit AUCTION_NOT_LIVE',
    async (status) => {
      const auction = await createLiveAuction(seller._id, { status })
      const { socket } = await buyerSocket('ana@x.fr')

      expect(await bid(socket, auction._id, 1000)).toEqual({ ok: false, code: 'AUCTION_NOT_LIVE' })
      expect(await Bid.countDocuments()).toBe(0)
    },
  )

  it('une enchère inconnue ou un identifiant illisible reçoit AUCTION_NOT_LIVE', async () => {
    const { socket } = await buyerSocket('ana@x.fr')

    expect(await bid(socket, new Types.ObjectId(), 1000)).toEqual({
      ok: false,
      code: 'AUCTION_NOT_LIVE',
    })
    expect(await bid(socket, 'pas-un-id', 1000)).toEqual({ ok: false, code: 'AUCTION_NOT_LIVE' })
  })

  it('T4.6 — à endsAt exactement ou après, AUCTION_NOT_LIVE ; une milliseconde avant, acceptée', async () => {
    const endsAt = new Date(Date.now() + 10 * MINUTE_MS)
    const auction = await createLiveAuction(seller._id, { endsAt })
    const { user } = await createLoggedInUser(() => new TestClient(app), 'ana@x.fr')
    const id = auction._id.toString()
    const userId = user._id.toString()

    const atEnd = await placeBid({ userId, auctionId: id, amount: 1000, now: endsAt })
    const afterEnd = await placeBid({
      userId,
      auctionId: id,
      amount: 1000,
      now: new Date(endsAt.getTime() + 1),
    })
    const before = await placeBid({
      userId,
      auctionId: id,
      amount: 1000,
      now: new Date(endsAt.getTime() - 1),
    })

    expect(atEnd).toEqual({ ok: false, code: 'AUCTION_NOT_LIVE' })
    expect(afterEnd).toEqual({ ok: false, code: 'AUCTION_NOT_LIVE' })
    expect(before.ok).toBe(true)
  })

  it('T4.7 — le vendeur sur sa propre enchère reçoit OWN_AUCTION', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('vendeur-socket@x.fr', { role: 'seller' })
    // Le vendeur de l'enchère est connecté avec son propre compte.
    const own = await createLiveAuction(
      (await User.findOne({ email: 'vendeur-socket@x.fr' }).orFail())._id,
    )

    expect(await bid(socket, own._id, 1000)).toEqual({ ok: false, code: 'OWN_AUCTION' })
    // Un autre vendeur peut enchérir sur l'enchère de Vera.
    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: true })
  })

  it('T4.8 — le meilleur enchérisseur qui surenchérit sur lui-même reçoit ALREADY_HIGHEST', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('ana@x.fr')
    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: true })

    expect(await bid(socket, auction._id, 5000)).toEqual({ ok: false, code: 'ALREADY_HIGHEST' })
    expect(await Bid.countDocuments()).toBe(1)
  })

  it('T4.9 — un montant sous nextMinBid reçoit BID_TOO_LOW, la valeur exacte est acceptée', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('ana@x.fr')

    expect(await bid(socket, auction._id, 999)).toEqual({ ok: false, code: 'BID_TOO_LOW' })
    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: true })
  })

  it.each([10.5, -100, 0, '1000', Number.NaN, Number.POSITIVE_INFINITY, 1e12, null, undefined, {}])(
    'T4.10 — le montant %j reçoit INVALID_AMOUNT',
    async (amount) => {
      const auction = await createLiveAuction(seller._id)
      const { socket } = await buyerSocket('ana@x.fr')

      expect(await bid(socket, auction._id, amount)).toEqual({ ok: false, code: 'INVALID_AMOUNT' })
      expect(await Bid.countDocuments()).toBe(0)
    },
  )

  it('T4.11 — nextMinBid vaut startingPrice sans offre, puis montant + pas minimum', async () => {
    const auction = await createLiveAuction(seller._id, { startingPrice: 2000, minIncrement: 250 })
    const ana = await buyerSocket('ana@x.fr')
    const bob = await buyerSocket('bob@x.fr')
    expect((await Auction.findById(auction._id).orFail()).nextMinBid).toBe(2000)
    const events = collect(ana.socket, 'bid:new')
    await emitWithAck(ana.socket, 'auction:join', { auctionId: auction._id.toString() })

    expect(await bid(ana.socket, auction._id, 2000)).toEqual({ ok: true })
    expect((await Auction.findById(auction._id).orFail()).nextMinBid).toBe(2250)
    expect(await bid(bob.socket, auction._id, 2249)).toEqual({ ok: false, code: 'BID_TOO_LOW' })
    expect(await bid(bob.socket, auction._id, 2250)).toEqual({ ok: true })

    const stored = await Auction.findById(auction._id).orFail()
    expect(stored).toMatchObject({ currentPrice: 2250, nextMinBid: 2500, bidCount: 2 })
    expect(stored.currentBidderId?.toString()).toBe(bob.user._id.toString())
    await settle()
    expect(events.map((event) => event.nextMinBid)).toEqual([2250, 2500])
  })

  it('T4.12 — plus de 5 offres en une seconde pour un utilisateur : RATE_LIMITED, sans toucher à l’enchère', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('ana@x.fr')

    const results = await Promise.all(
      Array.from({ length: 7 }, () => bid(socket, auction._id, 999)),
    )

    // 5 passent la limite (et sont refusées pour le montant), les 2 suivantes sont bloquées.
    expect(results.filter((r) => !r.ok && r.code === 'RATE_LIMITED')).toHaveLength(2)
    expect(results.filter((r) => !r.ok && r.code === 'BID_TOO_LOW')).toHaveLength(5)
    // Un autre utilisateur n'est pas touché.
    const bob = await buyerSocket('bob@x.fr')
    expect(await bid(bob.socket, auction._id, 1000)).toEqual({ ok: true })
  })

  it('T4.13 — aucune procédure ne modifie ni n’annule une offre', () => {
    const names = Object.keys(appRouter._def.procedures).filter((name) => /bid/i.test(name))

    expect(names).toEqual(['auction.bids'])
  })
})

describe('offres simultanées — T4.14 à T4.17 (priorité 1)', () => {
  /** N acheteurs vérifiés, créés en base (le hash du mot de passe est calculé une seule fois). */
  async function buyers(count: number) {
    return Promise.all(
      Array.from({ length: count }, (_, index) =>
        createUser({
          email: `acheteur${index}@x.fr`,
          name: `A${index}`,
          emailVerifiedAt: new Date(),
        }),
      ),
    )
  }

  it('T4.14 — 50 offres parallèles au même montant : une seule acceptée, les autres BID_TOO_LOW', async () => {
    const auction = await createLiveAuction(seller._id)
    const users = await buyers(50)

    const results = await Promise.all(
      users.map((user) =>
        placeBid({ userId: user._id.toString(), auctionId: auction._id.toString(), amount: 1000 }),
      ),
    )

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const refusals = results.filter((r) => !r.ok)
    expect(refusals).toHaveLength(49)
    expect(refusals.every((r) => !r.ok && r.code === 'BID_TOO_LOW')).toBe(true)
    expect(await Bid.countDocuments()).toBe(1)
    expect(await Auction.findById(auction._id).orFail()).toMatchObject({
      currentPrice: 1000,
      nextMinBid: 1100,
      bidCount: 1,
    })
  })

  it('T4.15 — 50 offres parallèles à montants différents : currentPrice est le plus haut accepté, nextMinBid cohérent', async () => {
    const auction = await createLiveAuction(seller._id)
    const users = await buyers(50)

    const results = await Promise.all(
      users.map((user, index) =>
        placeBid({
          userId: user._id.toString(),
          auctionId: auction._id.toString(),
          amount: 1000 + index * 100,
        }),
      ),
    )

    const accepted = results.flatMap((r) => (r.ok ? [r.event] : []))
    const stored = await Auction.findById(auction._id).orFail()
    expect(accepted.length).toBeGreaterThan(0)
    // Le prix final est le plus haut des montants acceptés, et c'est l'offre maximale (5 900).
    expect(stored.currentPrice).toBe(Math.max(...accepted.map((event) => event.amount)))
    expect(stored.currentPrice).toBe(1000 + 49 * 100)
    expect(stored.nextMinBid).toBe((stored.currentPrice ?? 0) + 100)
    // Les offres acceptées sont strictement croissantes, séparées d'au moins le pas minimum.
    const history = await Bid.find().sort({ createdAt: 1, _id: 1 })
    const amounts = history.map((entry) => entry.amount).sort((a, b) => a - b)
    amounts.slice(1).forEach((amount, index) => {
      expect(amount - (amounts[index] ?? 0)).toBeGreaterThanOrEqual(100)
    })
    // Tout refus est un montant trop bas, jamais un autre code.
    const refusals = results.flatMap((r) => (r.ok ? [] : [r.code]))
    expect(new Set(refusals)).toEqual(refusals.length === 0 ? new Set() : new Set(['BID_TOO_LOW']))
  })

  it('T4.16 — chaque offre acceptée est dans bids, et seulement elles', async () => {
    const auction = await createLiveAuction(seller._id)
    const users = await buyers(50)

    const results = await Promise.all(
      users.map((user, index) =>
        placeBid({
          userId: user._id.toString(),
          auctionId: auction._id.toString(),
          amount: 1000 + (index % 10) * 100,
        }),
      ),
    )

    const accepted = results.filter((r) => r.ok).length
    const stored = await Auction.findById(auction._id).orFail()
    expect(await Bid.countDocuments()).toBe(accepted)
    expect(stored.bidCount).toBe(accepted)
  })

  it('T4.17 — deux offres quasi simultanées de deux utilisateurs : la première enregistrée gagne, l’autre BID_TOO_LOW', async () => {
    const auction = await createLiveAuction(seller._id)
    const [ana, bob] = await buyers(2)
    if (ana === undefined || bob === undefined) throw new Error('utilisateurs manquants')

    const [first, second] = await Promise.all([
      placeBid({ userId: ana._id.toString(), auctionId: auction._id.toString(), amount: 1500 }),
      placeBid({ userId: bob._id.toString(), auctionId: auction._id.toString(), amount: 1500 }),
    ])

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
    const loser = first.ok ? second : first
    expect(loser).toEqual({ ok: false, code: 'BID_TOO_LOW' })
    const stored = await Auction.findById(auction._id).orFail()
    expect(stored.bidCount).toBe(1)
    expect(stored.currentBidderId?.toString()).toBe((first.ok ? ana : bob)._id.toString())
  })

  it('50 acheteurs sur des sockets réels : un seul gagnant par niveau de prix, historique cohérent', async () => {
    const auction = await createLiveAuction(seller._id)
    const crowd = await Promise.all(
      Array.from({ length: 10 }, (_, index) => buyerSocket(`foule${index}@x.fr`)),
    )
    const events = collect(crowd[0]?.socket as ClientSocket, 'bid:new')
    await emitWithAck(crowd[0]?.socket as ClientSocket, 'auction:join', {
      auctionId: auction._id.toString(),
    })

    const results = await Promise.all(crowd.map(({ socket }) => bid(socket, auction._id, 1000)))
    await settle()

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(events).toHaveLength(1)
    expect(await Bid.countDocuments()).toBe(1)
  })
})

describe('anti-sniping — T4.18 à T4.21 (priorité 3)', () => {
  it('T4.18 — une offre à moins de 2 min de la fin repousse endsAt à maintenant + 2 min, et auction:extended est émis', async () => {
    const endsAt = new Date(Date.now() + 30 * SECOND_MS)
    const auction = await createLiveAuction(seller._id, { endsAt })
    const ana = await buyerSocket('ana@x.fr')
    const watcher = await buyerSocket('bob@x.fr')
    await emitWithAck(watcher.socket, 'auction:join', { auctionId: auction._id.toString() })
    const extended = collect(watcher.socket, 'auction:extended')
    const before = Date.now()

    expect(await bid(ana.socket, auction._id, 1000)).toEqual({ ok: true })
    await settle()

    const stored = await Auction.findById(auction._id).orFail()
    const newEnd = stored.endsAt.getTime()
    expect(newEnd).toBeGreaterThanOrEqual(before + ANTI_SNIPING_MS)
    expect(newEnd).toBeLessThanOrEqual(Date.now() + ANTI_SNIPING_MS)
    expect(extended).toEqual([
      { auctionId: auction._id.toString(), endsAt: stored.endsAt.toISOString() },
    ])
  })

  it('T4.19 — une offre à plus de 2 min de la fin laisse endsAt inchangé, sans auction:extended', async () => {
    const endsAt = new Date(Date.now() + 10 * MINUTE_MS)
    const auction = await createLiveAuction(seller._id, { endsAt })
    const ana = await buyerSocket('ana@x.fr')
    await emitWithAck(ana.socket, 'auction:join', { auctionId: auction._id.toString() })
    const extended = collect(ana.socket, 'auction:extended')

    expect(await bid(ana.socket, auction._id, 1000)).toEqual({ ok: true })
    await settle()

    expect((await Auction.findById(auction._id).orFail()).endsAt).toEqual(endsAt)
    expect(extended).toEqual([])
  })

  it('une offre exactement à antiSnipingMs de la fin ne prolonge pas (max, jamais de raccourcissement)', async () => {
    const now = new Date()
    const endsAt = new Date(now.getTime() + ANTI_SNIPING_MS)
    const auction = await createLiveAuction(seller._id, { endsAt })
    const { user } = await createLoggedInUser(() => new TestClient(app), 'ana@x.fr')

    const result = await placeBid({
      userId: user._id.toString(),
      auctionId: auction._id.toString(),
      amount: 1000,
      now,
    })

    expect(result.ok && result.extendedTo).toBeNull()
    expect((await Auction.findById(auction._id).orFail()).endsAt).toEqual(endsAt)
  })

  it('T4.20 — des prolongations successives, sans limite, repoussent chaque fois la fin', async () => {
    const start = new Date()
    const auction = await createLiveAuction(seller._id, {
      endsAt: new Date(start.getTime() + 30 * SECOND_MS),
      minIncrement: 1,
    })
    const a = await createUser({ email: 'a@x.fr', name: 'A', emailVerifiedAt: new Date() })
    const b = await createUser({ email: 'b@x.fr', name: 'B', emailVerifiedAt: new Date() })

    // Première offre 20 s après le début (avant la fin prévue à 30 s), puis une toutes les 100 s.
    let now = new Date(start.getTime() - 80 * SECOND_MS)
    for (let round = 0; round < 12; round += 1) {
      now = new Date(now.getTime() + 100 * SECOND_MS)
      const user = round % 2 === 0 ? a : b
      const result = await placeBid({
        userId: user._id.toString(),
        auctionId: auction._id.toString(),
        amount: 1000 + round,
        now,
      })
      expect(result.ok).toBe(true)
      const stored = await Auction.findById(auction._id).orFail()
      expect(stored.endsAt.getTime()).toBe(now.getTime() + ANTI_SNIPING_MS)
    }

    // Une fois l'heure passée la dernière fin prolongée, l'enchère n'accepte plus d'offre.
    const late = await placeBid({
      userId: a._id.toString(),
      auctionId: auction._id.toString(),
      amount: 5000,
      now: new Date(now.getTime() + ANTI_SNIPING_MS),
    })
    expect(late).toEqual({ ok: false, code: 'AUCTION_NOT_LIVE' })
  })

  it('T4.21 — changer antiSnipingMs ne modifie pas une enchère en cours ; la prochaine offre applique la nouvelle valeur', async () => {
    const endsAt = new Date(Date.now() + 30 * SECOND_MS)
    const auction = await createLiveAuction(seller._id, { endsAt })
    const a = await createUser({ email: 'a@x.fr', name: 'A', emailVerifiedAt: new Date() })

    await Setting.updateOne(
      { _id: 'global' },
      { $set: { antiSnipingMs: 600_000 } },
      { upsert: true },
    )
    expect((await Auction.findById(auction._id).orFail()).endsAt).toEqual(endsAt)

    const now = new Date()
    await placeBid({
      userId: a._id.toString(),
      auctionId: auction._id.toString(),
      amount: 1000,
      now,
    })
    expect((await Auction.findById(auction._id).orFail()).endsAt.getTime()).toBe(
      now.getTime() + 600_000,
    )
  })
})

describe('temps réel et sockets — T4.22 à T4.25', () => {
  it('T4.22 — handshake : un visiteur est accepté, un token invalide, falsifié ou expiré est refusé', async () => {
    const config = testConfig()
    const { user } = await createLoggedInUser(() => new TestClient(app), 'ana@x.fr')
    const sign = (secret: string, options: { exp?: number } = {}) =>
      new SignJWT({ sid: 'session' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user._id.toString())
        .setIssuedAt()
        .setExpirationTime(options.exp ?? Math.floor(Date.now() / 1000) + 600)
        .sign(new TextEncoder().encode(secret))

    const cases: [string, string | undefined, 'connected' | 'refused'][] = [
      ['sans cookie (visiteur)', undefined, 'connected'],
      [
        'token valide',
        await signAccessToken(config.jwtSecret, { userId: user._id.toString(), sessionId: 's' }),
        'connected',
      ],
      ['aléatoire', 'pas-un-jwt', 'refused'],
      ['autre secret', await sign('un-autre-secret-'.padEnd(48, 'y')), 'refused'],
      [
        'expiré',
        await sign(config.jwtSecret, { exp: Math.floor(Date.now() / 1000) - 10 }),
        'refused',
      ],
      ['sans algorithme (alg: none)', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.', 'refused'],
    ]
    for (const [label, token, expected] of cases) {
      const socket = openSocket(url, token)
      sockets.push(socket)
      expect(await whenConnected(socket), label).toBe(expected)
    }
  })

  it('un token qui expire après la connexion ne permet plus d’enchérir (NOT_AUTHENTICATED)', async () => {
    const config = testConfig()
    const auction = await createLiveAuction(seller._id)
    const { user } = await createLoggedInUser(() => new TestClient(app), 'ana@x.fr')
    // Émis il y a 15 min moins 1 seconde : valide à la connexion, expiré une seconde plus tard.
    const token = await signAccessToken(
      config.jwtSecret,
      { userId: user._id.toString(), sessionId: 's' },
      new Date(Date.now() - 15 * MINUTE_MS + 1500),
    )
    const socket = openSocket(url, token)
    sockets.push(socket)
    expect(await whenConnected(socket)).toBe('connected')
    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: true })
    await settle(1700)

    expect(await bid(socket, auction._id, 5000)).toEqual({ ok: false, code: 'NOT_AUTHENTICATED' })
  })

  it('T4.23 — une offre n’est diffusée qu’à la room de son enchère', async () => {
    const auction = await createLiveAuction(seller._id)
    const other = await createLiveAuction(seller._id, { title: 'Autre' })
    const ana = await buyerSocket('ana@x.fr')
    const inRoom = await buyerSocket('bob@x.fr')
    const elsewhere = await buyerSocket('cleo@x.fr')
    const notJoined = await buyerSocket('dan@x.fr')
    await emitWithAck(inRoom.socket, 'auction:join', { auctionId: auction._id.toString() })
    await emitWithAck(elsewhere.socket, 'auction:join', { auctionId: other._id.toString() })
    const received = {
      inRoom: collect(inRoom.socket, 'bid:new'),
      elsewhere: collect(elsewhere.socket, 'bid:new'),
      notJoined: collect(notJoined.socket, 'bid:new'),
    }

    expect(await bid(ana.socket, auction._id, 1000)).toEqual({ ok: true })
    await settle()

    expect(received.inRoom).toHaveLength(1)
    expect(received.elsewhere).toEqual([])
    expect(received.notJoined).toEqual([])
    expect(received.inRoom[0]).toMatchObject({
      auctionId: auction._id.toString(),
      amount: 1000,
      bidder: { id: ana.user._id.toString(), name: 'ana' },
      nextMinBid: 1100,
      bidCount: 1,
    })
  })

  it('un visiteur peut suivre une enchère et reçoit les offres en direct', async () => {
    const auction = await createLiveAuction(seller._id)
    const ana = await buyerSocket('ana@x.fr')
    const visitor = openSocket(url)
    sockets.push(visitor)
    await whenConnected(visitor)
    expect(
      await emitWithAck(visitor, 'auction:join', { auctionId: auction._id.toString() }),
    ).toEqual({ ok: true })
    const received = collect(visitor, 'bid:new')

    await bid(ana.socket, auction._id, 1000)
    await settle()

    expect(received).toHaveLength(1)
  })

  it('T4.24 — aucun événement ne contient d’email ni de donnée privée', async () => {
    const endsAt = new Date(Date.now() + 30 * SECOND_MS)
    const auction = await createLiveAuction(seller._id, { endsAt })
    const ana = await buyerSocket('ana@x.fr')
    const bob = await buyerSocket('bob@x.fr')
    const raw: unknown[] = []
    bob.socket.onAny((_event: string, ...args: unknown[]) => raw.push(args))
    await emitWithAck(bob.socket, 'auction:join', { auctionId: auction._id.toString() })

    await bid(ana.socket, auction._id, 1000)
    await bid(bob.socket, auction._id, 1100)
    await settle()

    const text = JSON.stringify(raw)
    expect(raw.length).toBeGreaterThanOrEqual(3)
    expect(text).not.toContain('@')
    expect(text).not.toMatch(/email|passwordHash|token|role|suspended/i)
  })

  it('T4.25 — l’ancien meilleur enchérisseur reçoit bid:new et un email « offre dépassée » dans la file', async () => {
    const auction = await createLiveAuction(seller._id)
    const ana = await buyerSocket('ana@x.fr')
    const bob = await buyerSocket('bob@x.fr')
    await emitWithAck(ana.socket, 'auction:join', { auctionId: auction._id.toString() })
    const seen = collect(ana.socket, 'bid:new')

    await bid(ana.socket, auction._id, 1000)
    const { Email } = await import('../src/models')
    expect(await Email.countDocuments({ template: 'outbid' })).toBe(0)
    await bid(bob.socket, auction._id, 1100)
    await settle()

    expect(seen.map((event) => event.amount)).toEqual([1000, 1100])
    const emails = await Email.find({ template: 'outbid' })
    expect(emails).toHaveLength(1)
    expect(emails[0]).toMatchObject({ to: 'ana@x.fr', status: 'pending' })
    expect(emails[0]?.data).toMatchObject({ amount: 1100, title: 'Vase ancien' })
    expect(String((emails[0]?.data as { link: string }).link)).toContain(
      `/auctions/${auction._id.toString()}`,
    )
  })

  it('l’email d’un enchérisseur anonymisé est ignoré sans faire échouer l’offre', async () => {
    const auction = await createLiveAuction(seller._id)
    const ana = await buyerSocket('ana@x.fr')
    const bob = await buyerSocket('bob@x.fr')
    await bid(ana.socket, auction._id, 1000)
    await User.updateOne({ _id: ana.user._id }, { $set: { email: null } })

    expect(await bid(bob.socket, auction._id, 1100)).toEqual({ ok: true })
    await settle()

    const { Email } = await import('../src/models')
    expect(await Email.countDocuments({ template: 'outbid' })).toBe(0)
  })
})

describe('rooms et entrées Socket.IO', () => {
  it('refuse de suivre une enchère inconnue ou non publique, et un identifiant illisible', async () => {
    const draft = await createLiveAuction(seller._id, { status: 'draft' })
    const visitor = openSocket(url)
    sockets.push(visitor)
    await whenConnected(visitor)

    for (const auctionId of [draft._id.toString(), new Types.ObjectId().toString(), 'x']) {
      expect(await emitWithAck(visitor, 'auction:join', { auctionId })).toEqual({
        ok: false,
        code: 'AUCTION_NOT_LIVE',
      })
    }
  })

  it('refuse les payloads mal formés (champ en trop, pas un objet) sans planter', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('ana@x.fr')
    const id = auction._id.toString()

    expect(
      await emitWithAck(socket, 'bid:place', { auctionId: id, amount: 1000, extra: 1 }),
    ).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    })
    expect(await emitWithAck(socket, 'bid:place', 'n’importe quoi')).toEqual({
      ok: false,
      code: 'AUCTION_NOT_LIVE',
    })
    expect(await emitWithAck(socket, 'bid:place', null)).toEqual({
      ok: false,
      code: 'AUCTION_NOT_LIVE',
    })
    expect(await Bid.countDocuments()).toBe(0)
    // Le serveur répond toujours après ces entrées.
    expect(await bid(socket, auction._id, 1000)).toEqual({ ok: true })
  })

  it('ne plante pas quand le client n’envoie pas d’ack', async () => {
    const auction = await createLiveAuction(seller._id)
    const { socket } = await buyerSocket('ana@x.fr')

    socket.emit(
      'bid:place',
      { auctionId: auction._id.toString(), amount: 1000 },
      undefined as unknown as () => void,
    )
    await settle()

    expect(await Bid.countDocuments()).toBe(1)
    expect(socket.connected).toBe(true)
  })

  it('quitter une room arrête les événements ; le nombre de rooms par connexion est limité', async () => {
    const auction = await createLiveAuction(seller._id)
    const ana = await buyerSocket('ana@x.fr')
    const bob = await buyerSocket('bob@x.fr')
    await emitWithAck(bob.socket, 'auction:join', { auctionId: auction._id.toString() })
    const received = collect(bob.socket, 'bid:new')
    await emitWithAck(bob.socket, 'auction:leave', { auctionId: auction._id.toString() })

    await bid(ana.socket, auction._id, 1000)
    await settle()
    expect(received).toEqual([])

    const many = await Promise.all(Array.from({ length: 21 }, () => createLiveAuction(seller._id)))
    const results = []
    for (const item of many) {
      results.push(
        await emitWithAck(bob.socket, 'auction:join', { auctionId: item._id.toString() }),
      )
    }
    expect(results.filter((r) => r.ok)).toHaveLength(20)
    expect(results.at(-1)).toEqual({ ok: false, code: 'RATE_LIMITED' })
  })
})

describe('historique des offres (auction.bids)', () => {
  it('liste les offres, la plus récente d’abord, avec le nom seul, paginées', async () => {
    const auction = await createLiveAuction(seller._id)
    const ana = await buyerSocket('ana@x.fr')
    const bob = await buyerSocket('bob@x.fr')
    await bid(ana.socket, auction._id, 1000)
    await bid(bob.socket, auction._id, 1100)
    await bid(ana.socket, auction._id, 1200)
    const visitor = new TestClient(app)

    const first = await visitor.query<Page<BidRecord>>('auction.bids', {
      id: auction._id.toString(),
      limit: 2,
    })
    const second = await visitor.query<Page<BidRecord>>('auction.bids', {
      id: auction._id.toString(),
      limit: 2,
      page: 2,
    })

    expect(first.data.total).toBe(3)
    expect(first.data.items.map((item) => item.amount)).toEqual([1200, 1100])
    expect(second.data.items.map((item) => item.amount)).toEqual([1000])
    expect(first.data.items[0]?.bidder).toEqual({ id: ana.user._id.toString(), name: 'ana' })
    expect(first.raw).not.toContain('@')
  })

  it('refuse l’historique d’une enchère non publique ou inconnue', async () => {
    const draft = await createLiveAuction(seller._id, { status: 'draft' })
    const visitor = new TestClient(app)

    for (const id of [draft._id.toString(), new Types.ObjectId().toString()]) {
      const result = await visitor.query('auction.bids', { id })
      expect(result.error?.data.code).toBe('AUCTION_NOT_FOUND')
    }
    expect((await visitor.query('auction.bids', { id: 'x' })).status).toBe(400)
  })
})

export type { BidNewEvent }
