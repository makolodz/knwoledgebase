import http from 'k6/http'
import { check, sleep } from 'k6'

// Cible : API en dev. Surchargeable : k6 run -e BASE_URL=http://localhost:3000 load/load-test.js
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

// Limite globale de l'API : 300 requêtes/minute par IP. Au-delà, 429.
// Avec 3 VUs et ~1 s de pause on reste dessous (≈ 2 requêtes/s chacun).
export const options = {
    scenarios: {
        lecteurs: {
        executor: 'ramping-vus',
        stages: [
            { duration: '10s', target: 50 },
            { duration: '1m', target: 50 },
            { duration: '5s', target: 0 },
        ],
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
    }

    // Une requête tRPC de lecture : GET /api/trpc/<procédure>?input=<JSON encodé>
    function query(procedure, input) {
    const qs = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`
    return http.get(`${BASE_URL}/api/trpc/${procedure}${qs}`)
    }

    export default function () {
    const health = query('health')
    check(health, { 'health 200': (r) => r.status === 200 })

    const list = query('auction.list', { page: 1, limit: 12 })
    check(list, { 'auction.list 200': (r) => r.status === 200 })

    sleep(1)
}
