import http from 'k6/http'
import ws from 'k6/ws'
import { check, fail } from 'k6'
import { Counter, Trend } from 'k6/metrics'

// Offres concurrentes sur une même enchère, par de vrais sockets (Socket.IO v4 sur WebSocket).
// Préparation et vérification en base : `pnpm --filter @encheres/api load:prepare` puis
// `load:verify` (voir load/rapport.md).
//
//   k6 run -e AUCTION_ID=<id> -e USERS=50 --summary-export load/summary.json load/bids-concurrent.js
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const WS_URL = `${BASE_URL.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`
const ORIGIN = __ENV.WEB_ORIGIN || 'http://localhost:5173'
const AUCTION_ID = __ENV.AUCTION_ID || fail('AUCTION_ID manquant (pnpm --filter @encheres/api load:prepare)')
const USERS = Number(__ENV.USERS || 50)
const PASSWORD = 'mot-de-passe-de-dev-123' // mot de passe public des comptes de développement
const DURATION_S = Number(__ENV.DURATION_S || 30)

// Chaque acheteur est un VU : une seule connexion, une seule session, comme un navigateur.
export const options = {
  scenarios: {
    encherisseurs: { executor: 'per-vu-iterations', vus: USERS, iterations: 1, maxDuration: '2m' },
  },
  thresholds: {
    bid_ack_ms: ['p(95)<500'],
    bids_accepted: ['count>0'],
    // Un refus « normal » est BID_TOO_LOW ou ALREADY_HIGHEST : tout le reste est une anomalie.
    bids_unexpected: ['count==0'],
    socket_errors: ['count==0'],
  },
}

const bidAckMs = new Trend('bid_ack_ms', true)
const bidsSent = new Counter('bids_sent')
const bidsAccepted = new Counter('bids_accepted')
const bidsTooLow = new Counter('bids_too_low')
const bidsAlreadyHighest = new Counter('bids_already_highest')
const bidsUnexpected = new Counter('bids_unexpected')
const socketErrors = new Counter('socket_errors')

const query = (procedure, input) =>
  http.get(`${BASE_URL}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`)

// Une connexion par acheteur, hors de la mesure. Les échecs de connexion comptent pour la limite
// anti-abus (5 par 15 min) : les comptes viennent de `load:prepare`, leur mot de passe est connu.
export function setup() {
  const auction = query('auction.get', { id: AUCTION_ID })
  if (auction.status !== 200) fail(`enchère introuvable (${auction.status}) : relancer load:prepare`)
  const { nextMinBid, minIncrement } = auction.json('result.data')

  const buyers = []
  for (let index = 0; index < USERS; index += 1) {
    const email = `acheteur-charge-${index}@example.test`
    const response = http.post(
      `${BASE_URL}/api/trpc/auth.login`,
      JSON.stringify({ email, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    )
    const token = response.cookies.access_token?.[0]?.value
    if (!check(response, { 'connexion 200': (r) => r.status === 200 }) || token === undefined) {
      fail(`connexion impossible pour ${email} : relancer load:prepare`)
    }
    buyers.push({ token, userId: response.json('result.data.user.id') })
  }
  return { buyers, nextMinBid, minIncrement }
}

export default function (data) {
  const me = data.buyers[__VU - 1]
  let nextMinBid = data.nextMinBid
  let iAmHighest = false
  let bidding = false
  let nextAckId = 2 // l'ack 1 est celui de auction:join
  const sentAt = new Map()

  const response = ws.connect(
    WS_URL,
    { headers: { Cookie: `access_token=${me.token}`, Origin: ORIGIN } },
    (socket) => {
      const placeBid = () => {
        if (!bidding || iAmHighest) return
        // Autour du minimum : tous visent presque le même montant, donc se disputent la place.
        const amount = nextMinBid + Math.floor(Math.random() * 3) * data.minIncrement
        const id = nextAckId
        nextAckId += 1
        sentAt.set(id, Date.now())
        bidsSent.add(1)
        socket.send(`42${id}["bid:place",${JSON.stringify({ auctionId: AUCTION_ID, amount })}]`)
      }

      socket.on('message', (message) => {
        if (message === '2') return socket.send('3') // ping Engine.IO
        if (message.startsWith('0')) return socket.send('40') // ouverture : connexion à l'espace de noms
        if (message.startsWith('40')) {
          return socket.send(`421["auction:join",${JSON.stringify({ auctionId: AUCTION_ID })}]`)
        }
        if (message.startsWith('44')) {
          socketErrors.add(1)
          return socket.close()
        }
        if (message.startsWith('43')) {
          const [, rawId, rawBody] = /^43(\d+)(.*)$/.exec(message)
          const id = Number(rawId)
          const [result] = JSON.parse(rawBody)
          if (id === 1) {
            // Suivi de l'enchère confirmé : on peut enchérir. Toutes les ~300 ms par acheteur,
            // sous la limite de 5 offres par seconde.
            if (result.ok !== true) return socketErrors.add(1)
            bidding = true
            return socket.setInterval(placeBid, 250 + Math.random() * 100)
          }
          bidAckMs.add(Date.now() - sentAt.get(id))
          sentAt.delete(id)
          if (result.ok) bidsAccepted.add(1)
          else if (result.code === 'BID_TOO_LOW') bidsTooLow.add(1)
          else if (result.code === 'ALREADY_HIGHEST') bidsAlreadyHighest.add(1)
          else bidsUnexpected.add(1, { code: result.code })
          return undefined
        }
        if (message.startsWith('42')) {
          const [event, payload] = JSON.parse(message.slice(2))
          if (event === 'bid:new') {
            // Le serveur a le dernier mot sur le minimum et sur le meilleur enchérisseur.
            nextMinBid = Math.max(nextMinBid, payload.nextMinBid)
            iAmHighest = payload.bidder.id === me.userId
          }
        }
        return undefined
      })
      socket.on('error', () => socketErrors.add(1))

      // On arrête d'enchérir une seconde avant la fin : toute offre envoyée reçoit son ack, donc
      // « offres acceptées vues par les clients » = « offres en base ».
      socket.setTimeout(() => {
        bidding = false
      }, (DURATION_S - 1) * 1000)
      socket.setTimeout(() => socket.close(), DURATION_S * 1000)
    },
  )
  check(response, { 'WebSocket ouvert (101)': (r) => r && r.status === 101 })
}
