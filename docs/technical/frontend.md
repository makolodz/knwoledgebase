# Front (`apps/web`)

## Rôle
SPA qui affiche les enchères, permet d'enchérir et montre les nouvelles offres en temps réel. Elle parle à l'API Fastify en HTTP et au serveur Socket.IO en temps réel. Raisons du choix : [ADR-002](../decisions/ADR-002-frontend-vue.md).

## Stack
Vue 3 (Composition API, `<script setup lang="ts">`), Vite, TypeScript strict, Vue Router, Pinia, socket.io-client, **PrimeVue 4 (MIT) + Tailwind** ([ADR-012](../decisions/ADR-012-ui-primevue.md)). Ne pas passer à PrimeVue 5 : licence propriétaire (voir l'addendum de l'ADR).

Description de chaque écran : [screens.md](screens.md).

## Structure (`apps/web/src`)
- `views/` : pages (liste des enchères, détail d'une enchère, connexion, espace vendeur, admin)
- `components/` : composants réutilisables (mise en page `AppLayout`, carte d'enchère, compte à rebours, formulaire d'offre)
- `stores/` : stores Pinia (`realtime`, puis `auth`, `auctions`)
- `composables/` : logique réutilisable (`useAuctionSocket`, `useCountdown`)
- `api/` : client tRPC typé avec `AppRouter` ([api.md](api.md)) et instance unique du socket
- `router/` : routes (`createAppRouter`, historique injectable pour les tests)
- `env.ts` : variables `VITE_*` validées par Zod (`VITE_API_URL`) ; le `.env` est celui de la racine ([ADR-013](../decisions/ADR-013-outillage-monorepo.md))

## Temps réel
Composable `useAuctionSocket(auctionId)` :
- au montage : `emit('auction:join', { auctionId })`
- écoute `bid:new`, `auction:extended` et `auction:ended`, et met à jour le store Pinia (prix, `nextMinBid`, `endsAt`, gagnant)
- le compte à rebours se recalcule à chaque `auction:extended`
- au démontage : retire les listeners et émet `auction:leave`
- `bid:place` est envoyé avec un ack ; le code d'erreur ([business-rules.md](../domain/business-rules.md), section « Placer une offre ») est traduit en message lisible
- le formulaire d'offre propose `nextMinBid` comme montant par défaut

Une seule instance de socket pour toute l'app, typée avec `ServerToClientEvents` / `ClientToServerEvents` importés depuis `packages/shared` ([realtime.md](realtime.md)).

## Règles
- Le front n'est jamais la source de vérité : le compte à rebours est indicatif, le serveur décide.
- Après un paiement, afficher le statut **lu depuis l'API**, jamais déduit de l'URL de retour Stripe.
- Afficher les prix à partir des centimes (`Intl.NumberFormat`, EUR).
- Tests : Vitest + Vue Test Utils. Lint : ESLint (`eslint-plugin-vue`) + Prettier.
