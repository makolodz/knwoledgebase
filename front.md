# Front (Vue 3 + Vite)

## Rôle dans le projet
Single Page App qui affiche les enchères, permet d'enchérir et montre les nouvelles offres en temps réel. Communique avec l'API Fastify (HTTP) et le serveur Socket.IO (temps réel).

## Stack
Vue 3 (Composition API, `<script setup lang="ts">`), Vite, TypeScript strict, Vue Router, Pinia, socket.io-client.

## Structure (`apps/web/src`)
- `views/` : pages (liste des enchères, détail d'une enchère, connexion)
- `components/` : composants réutilisables (carte d'enchère, compte à rebours, formulaire d'offre)
- `stores/` : stores Pinia (`auth`, `auctions`)
- `composables/` : logique réutilisable (`useAuctionSocket`, `useCountdown`)
- `api/` : appels HTTP

## Temps réel
Composable `useAuctionSocket(auctionId)` :
- au montage : `emit('auction:join', { auctionId })`
- écoute `bid:new` et `auction:ended`, met à jour le store Pinia
- au démontage : retire les listeners et quitte la room
- `bid:place` envoyé avec un ack pour afficher succès/erreur

Une seule instance de socket pour toute l'app, typée avec `ServerToClientEvents` / `ClientToServerEvents` importés depuis `packages/shared`.

## Règles
- Le front n'est jamais la source de vérité : le compte à rebours est indicatif, le serveur décide.
- Afficher les prix à partir des centimes (`Intl.NumberFormat`, EUR).
- Tests : Vitest + Vue Test Utils. Lint : ESLint (`eslint-plugin-vue`) + Prettier.
