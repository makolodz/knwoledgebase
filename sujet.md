# Projet : Enchères en direct

## Contexte
Une association vend des objets aux enchères en ligne pour financer ses projets.

## Fonctionnalités clés
- Chaque enchère a un **prix de départ** et une **durée limitée** (date de fin).
- Les offres des autres utilisateurs s'affichent **en temps réel**.
- Une offre doit être strictement supérieure à l'offre courante et arriver avant la date de fin.

## Contraintes techniques (obligatoires)
- Backend : **Node.js**
- Temps réel : **Socket.IO**
- Base de données : **MongoDB** (NoSQL)

## Bonnes pratiques
- Technologies maintenues, stables (versions LTS).
- Minimiser la dette technique : typage, tests, lint, code simple.

## Stack retenue
| Couche | Choix | Raison |
|---|---|---|
| Langage | TypeScript (strict) | Typage partagé front/back, moins de bugs |
| Runtime | Node.js 22 LTS | Imposé, support long terme |
| API HTTP | Fastify | Rapide, maintenu, validation de schémas intégrée |
| Temps réel | Socket.IO v4 | Imposé |
| BDD | MongoDB 7+ via Mongoose | Imposé ; Mongoose apporte schémas et validation |
| Validation | Zod | Schémas partagés client/serveur |
| Front | Vue 3 + Vite (TS, Vue Router, Pinia) | Stack déjà maîtrisée, écosystème officiel cohérent |
| Auth | JWT (cookie httpOnly) | Simple, compatible Socket.IO handshake |
| Tests | Vitest (+ Vue Test Utils) | Rapide, compatible TS/Vite |
| Qualité | ESLint + Prettier | Cohérence du code |
| Dev/infra | Docker Compose (Node + Mongo) | Environnement reproductible |
| Monorepo | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`) | Types partagés |

## Règles métier critiques
- **Le serveur est la source de vérité** : jamais faire confiance au client pour le prix ou l'heure.
- Enchérir de façon **atomique** (éviter les courses entre deux offres simultanées) :
  `findOneAndUpdate({ _id, endsAt: { $gt: now }, currentPrice: { $lt: amount } }, { $set: { currentPrice: amount, ... } })`
- Après une offre validée, diffuser l'événement à la room Socket.IO de l'enchère.