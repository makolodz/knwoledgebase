# Projet : Enchères en direct

## Contexte
Une association vend des objets aux enchères en ligne pour financer ses projets. Des vendeurs proposent des objets, des acheteurs enchérissent en direct, et le gagnant paie en ligne.

## Fonctionnalités clés
- Trois rôles : **Admin**, **Vendeur**, **Acheteur**.
- Chaque enchère a un **prix de départ**, un **pas minimum** fixé par le vendeur et une **durée limitée**.
- Les offres des autres utilisateurs s'affichent **en temps réel**.
- **Anti-sniping** : une offre de dernière minute prolonge l'enchère.
- Le gagnant **paie via Stripe** ; l'argent va sur le compte de l'association.

> Règles détaillées : voir `metier.md`. Elle fait foi en cas de doute.

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
| Paiement | Stripe (Checkout + webhooks) | Standard, données de carte gérées par Stripe, mode test |
| Tests | Vitest (+ Vue Test Utils) | Rapide, compatible TS/Vite |
| Qualité | ESLint + Prettier | Cohérence du code |
| Dev/infra | Docker Compose (Node + Mongo) | Environnement reproductible |
| Monorepo | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`) | Types partagés |

## Règles métier critiques
- **Le serveur est la source de vérité** : ne jamais faire confiance au client pour le prix ou l'heure.
- Enregistrer une offre en **une seule opération atomique**, qui inclut la prolongation anti-sniping (requête dans `mongodb.md`).
- Après une offre validée, diffuser l'événement à la room Socket.IO de l'enchère.
- Une enchère passe à `paid` **uniquement** via le webhook Stripe.
