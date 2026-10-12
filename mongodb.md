# MongoDB

## Rôle dans le projet
Base NoSQL orientée documents : stocke utilisateurs, enchères et offres.

## Concepts
- **Document** (JSON/BSON) dans des **collections**, schéma flexible.
- **Mongoose** : ODM qui ajoute schémas, validation et typage.
- **Opérations atomiques** sur un document (`findOneAndUpdate`) : clé pour gérer les offres concurrentes.
- **Index** pour les requêtes fréquentes.

## Modèle de données
- `users` : `{ _id, email, passwordHash, name, createdAt }`
- `auctions` : `{ _id, title, description, images[], startingPrice, currentPrice, currentBidder, startsAt, endsAt, status: 'scheduled'|'live'|'ended', winner }`
- `bids` : `{ _id, auctionId, userId, amount, createdAt }` (historique, index `{ auctionId: 1, createdAt: -1 }`)

## Règles
- Prix en **centimes (entiers)** pour éviter les erreurs de flottants.
- Dates en UTC.
- Index sur `auctions.endsAt` + `status` pour clôturer les enchères expirées.
