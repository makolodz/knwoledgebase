# Vue d'ensemble

## Contexte
Une association vend des objets aux enchères en ligne pour financer ses projets. Des vendeurs proposent des objets, des acheteurs enchérissent en direct, et le gagnant paie en ligne.

## Fonctionnalités clés
- Trois rôles : **Admin**, **Vendeur**, **Acheteur**.
- Chaque enchère a un **prix de départ**, un **pas minimum** fixé par le vendeur et une **durée limitée**.
- Les offres des autres utilisateurs s'affichent **en temps réel**.
- **Anti-sniping** : une offre de dernière minute prolonge l'enchère.
- Le gagnant **paie via Stripe** ; l'argent va sur le compte de l'association.

Règles détaillées : [business-rules.md](../domain/business-rules.md).

## Contraintes imposées par le sujet
- Backend : **Node.js**
- Temps réel : **Socket.IO**
- Base de données : **MongoDB** (NoSQL)
- Technologies maintenues et stables (versions LTS), le moins de dette technique possible : typage, tests, lint, code simple.

## Stack retenue
| Couche | Choix | Raison | ADR |
|---|---|---|---|
| Langage | TypeScript (strict) | Typage partagé front/back, moins de bugs | [001](../decisions/ADR-001-stack-backend.md) |
| Runtime | Node.js 22 LTS | Imposé, support long terme | — |
| API HTTP | Fastify | Rapide, maintenu, validation de schémas et logs intégrés | [001](../decisions/ADR-001-stack-backend.md) |
| Temps réel | Socket.IO v4 | Imposé | — |
| BDD | MongoDB 7+ via Mongoose | Imposé ; Mongoose apporte schémas et validation | [001](../decisions/ADR-001-stack-backend.md) |
| Validation | Zod | Schémas partagés client/serveur | [001](../decisions/ADR-001-stack-backend.md) |
| Front | Vue 3 + Vite (TS, Vue Router, Pinia) | Stack déjà maîtrisée, écosystème officiel cohérent | [002](../decisions/ADR-002-frontend-vue.md) |
| Auth | JWT (cookie httpOnly) | Simple, compatible avec le handshake Socket.IO | — |
| Paiement | Stripe (Checkout + webhooks) | Standard, données de carte gérées par Stripe, mode test | [003](../decisions/ADR-003-paiement-stripe.md) |
| Tests | Vitest (+ Vue Test Utils) | Rapide, compatible TS/Vite | — |
| Qualité | ESLint + Prettier | Cohérence du code | — |
| Dev/infra | Docker Compose (Node + Mongo) | Environnement reproductible | — |
| Monorepo | pnpm workspaces | Types partagés entre front et back | [001](../decisions/ADR-001-stack-backend.md) |

## Structure du monorepo
```
apps/
  api/        Fastify + Socket.IO + jobs planifiés + webhook Stripe  → technical/backend.md
  web/        SPA Vue 3                                             → technical/frontend.md
packages/
  shared/     types, schémas Zod, contrat des événements Socket.IO  → technical/realtime.md
```

Le front et l'API sont **deux applications séparées**. Le front parle à l'API en HTTP et en Socket.IO.
