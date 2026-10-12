# MongoDB

## Rôle dans le projet
Base NoSQL orientée documents : stocke les utilisateurs, les enchères, les offres, les paiements et les paramètres.

## Concepts
- **Document** (JSON/BSON) dans des **collections**, schéma flexible.
- **Mongoose** : ODM qui ajoute schémas, validation et typage.
- **Opérations atomiques** sur un document (`findOneAndUpdate`) : c'est la clé pour gérer les offres concurrentes.
- **Index** pour les requêtes fréquentes.

## Modèle de données
- `users` : `{ _id, email, passwordHash, name, role: 'admin'|'seller'|'buyer', createdAt }`
  - `name` est le nom d'affichage public. L'email n'est jamais exposé.
- `auctions` : `{ _id, sellerId, title, description, images[], startingPrice, minIncrement, currentPrice, currentBidderId, nextMinBid, bidCount, startsAt, endsAt, status, winnerId, paymentDeadline, cancelReason, createdAt }`
  - `status` : `'draft'|'scheduled'|'live'|'ended'|'paid'|'unpaid'|'cancelled'`
  - à la création : `currentPrice: null`, `currentBidderId: null`, `nextMinBid: startingPrice`, `bidCount: 0`
- `bids` : `{ _id, auctionId, userId, amount, createdAt }`
  - historique des offres, index `{ auctionId: 1, createdAt: -1 }`
- `payments` : `{ _id, auctionId, userId, amount, stripeSessionId, status: 'open'|'paid'|'expired'|'refunded', createdAt }`
  - index unique sur `stripeSessionId`
- `settings` : document unique `{ _id: 'global', defaultMinIncrement, antiSnipingMs, paymentDelayMs, minDurationMs, maxDurationMs }`
  - valeurs par défaut dans `metier.md` §9

## Opération clé : placer une offre
Une seule requête vérifie toutes les règles et enregistre l'offre, prolongation anti-sniping comprise (`metier.md` §5 et §6). Elle utilise un update pipeline (MongoDB ≥ 4.2) ; il faut vérifier l'option que demande la version de Mongoose utilisée pour accepter un pipeline.

```ts
const auction = await Auction.findOneAndUpdate(
  {
    _id: auctionId,
    status: 'live',
    endsAt: { $gt: now },
    nextMinBid: { $lte: amount },
    sellerId: { $ne: userId },
    currentBidderId: { $ne: userId },
  },
  [{ $set: {
    currentPrice: amount,
    currentBidderId: userId,
    nextMinBid: { $add: [amount, '$minIncrement'] },
    bidCount: { $add: ['$bidCount', 1] },
    endsAt: { $max: ['$endsAt', new Date(now.getTime() + settings.antiSnipingMs)] },
  } }],
  { new: true },
);
// null → offre refusée : relire l'enchère pour déterminer le code d'erreur (metier.md §5)
```

Après un succès : insérer dans `bids`, émettre `bid:new`, puis émettre `auction:extended` si `endsAt` a changé.

## Règles
- Prix en **centimes (entiers)** pour éviter les erreurs de flottants.
- Dates en UTC.
- Index `{ status: 1, startsAt: 1 }`, `{ status: 1, endsAt: 1 }` et `{ status: 1, paymentDeadline: 1 }` pour les jobs d'ouverture, de clôture et d'expiration du paiement.
- La clôture est elle aussi atomique : `findOneAndUpdate({ _id, status: 'live', endsAt: { $lte: now } }, { $set: { status: 'ended', ... } })`.
