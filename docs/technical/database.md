# Base de données (MongoDB + Mongoose)

## Rôle
Stocke les utilisateurs, les enchères, les offres, les paiements et les paramètres. Accès uniquement via les modèles Mongoose de `apps/api/src/models/`.

## Modèle de données
- `users` : `{ _id, email, passwordHash, name, role: 'admin'|'seller'|'buyer', emailVerifiedAt, acceptedTermsAt, suspendedAt, deletedAt, createdAt }`
  - `name` est le nom d'affichage public. L'email n'est jamais exposé.
  - `email` est normalisé (minuscules) et unique : index unique partiel sur `email` quand c'est une chaîne, car un compte anonymisé a `email: null` ([account.md](../domain/workflows/account.md)).
- `authTokens` : `{ _id, userId, type: 'email_verification'|'password_reset'|'email_change', tokenHash, newEmail, expiresAt, usedAt, createdAt }`
  - token **hashé**, à usage unique ; `newEmail` seulement pour `email_change`
  - index `{ tokenHash: 1 }` unique, index TTL sur `expiresAt` pour purger les tokens expirés (la validité est toujours revérifiée par la requête : la purge est lente), et index `{ userId: 1, type: 1, createdAt: -1 }` pour retrouver le dernier token
- `auctions` : `{ _id, sellerId, title, description, images[], startingPrice, minIncrement, currentPrice, currentBidderId, nextMinBid, bidCount, startsAt, endsAt, status, winnerId, paymentDeadline, paymentReminderSentAt, cancelReason, createdAt }`
  - `status` : `'draft'|'scheduled'|'live'|'ended'|'paid'|'unpaid'|'cancelled'`
  - à la création : `currentPrice: null`, `currentBidderId: null`, `nextMinBid: startingPrice`, `bidCount: 0`
  - une modification (`draft` ou `scheduled`) remet `nextMinBid` au `startingPrice` : sans offre, les deux sont égaux
  - `images[]` : clés (UUID) des photos stockées sur disque, jamais d'URL ni de nom de fichier fourni par l'utilisateur ([ADR-007](../decisions/ADR-007-photos-disque-local.md))
  - `paymentReminderSentAt` : date d'envoi du rappel de paiement, `null` sinon (remis à `null` lors d'une réattribution)
- `bids` : `{ _id, auctionId, userId, amount, createdAt }`
  - historique des offres, index `{ auctionId: 1, createdAt: -1 }` et `{ userId: 1, createdAt: -1 }` (« mes offres », étape 5)
  - `createdAt` est l'heure serveur de l'offre ; une offre n'est jamais modifiée ni supprimée
- `payments` : `{ _id, auctionId, userId, amount, stripeSessionId, status: 'open'|'paid'|'expired'|'refunded', createdAt }`
  - index unique sur `stripeSessionId`
- `sessions` : `{ _id, userId, refreshTokenHash, previousRefreshTokenHash, expiresAt, lastUsedAt, userAgent, createdAt }`
  - `previousRefreshTokenHash` : refresh token remplacé par la dernière rotation, `null` avant la première ; sa présentation signale une réutilisation. `lastUsedAt` est la date de cette rotation ([ADR-014](../decisions/ADR-014-implementation-authentification.md))
  - index unique sur `refreshTokenHash`, index sur `userId`, TTL sur `expiresAt`, index partiel sur `previousRefreshTokenHash` ([security.md](security.md))
- `emails` : `{ _id, to, template, data, status: 'pending'|'sent'|'failed', attempts, lastError, sendAfter, createdAt, sentAt }`
  - file d'envoi ([ADR-006](../decisions/ADR-006-emails-brevo.md)) ; `failed` après 5 tentatives (réessais à 1 min, 5 min, 30 min, 2 h)
  - `data` peut contenir un lien avec un token en clair : il est **vidé dès que l'email est `sent`** ([ADR-014](../decisions/ADR-014-implementation-authentification.md))
  - `sendAfter` est repoussé quand le job prend un email en charge, ce qui évite un double envoi sans statut supplémentaire
  - index `{ status: 1, sendAfter: 1 }`
- `settings` : document unique `{ _id: 'global', defaultMinIncrement, antiSnipingMs, paymentDelayMs, minDurationMs, maxDurationMs }`
  - valeurs par défaut dans [business-rules.md](../domain/business-rules.md), section « Paramètres globaux » ; le document est créé par un `upsert` atomique (`$setOnInsert`) au démarrage de l'API et à la première lecture (`services/settings.ts`), donc sans condition de course

## Opération clé : placer une offre
Une seule requête vérifie toutes les règles et enregistre l'offre, prolongation anti-sniping comprise ([ADR-005](../decisions/ADR-005-offre-atomique.md)).
- Elle utilise un update pipeline (MongoDB ≥ 4.2). Avec Mongoose 9, `findOneAndUpdate` n'accepte un pipeline qu'avec l'option `updatePipeline: true`.
- `returnDocument: 'before'` : on obtient l'ancien meilleur enchérisseur (à prévenir) et l'ancienne `endsAt` ; les nouvelles valeurs se déduisent de la même heure `now` que celle du filtre.
- L'heure `now` est prise **une seule fois** côté serveur et sert au filtre (`endsAt > now`) comme à l'anti-sniping.
- Le document `bids` est inséré juste après. MongoDB sans transaction : un plantage entre les deux laisserait une offre dans `auctions` sans ligne dans `bids` ; l'enchère reste la référence du prix et du gagnant.

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
// null → offre refusée : relire l'enchère pour déterminer le code d'erreur
```

Ce qui se passe avant et après cette requête : [data-flow.md](../architecture/data-flow.md), section « Placer une offre ».

## Règles
- Prix en **centimes (entiers)**, dates en **UTC**.
- Index `{ status: 1, startsAt: 1 }`, `{ status: 1, endsAt: 1 }` et `{ status: 1, paymentDeadline: 1 }` pour les jobs.
- La clôture est un seul `findOneAndUpdate` avec pipeline (`updatePipeline: true`) : `status: 'ended'`, `winnerId: '$currentBidderId'` et `paymentDeadline` (maintenant + `paymentDelayMs`, ou `null` sans offre), conditionné par `status: 'live'` et `endsAt ≤ maintenant`.
- Toute transition de statut est un `findOneAndUpdate` **conditionné par le statut courant**. Exemple de clôture : `findOneAndUpdate({ _id, status: 'live', endsAt: { $lte: now } }, { $set: { status: 'ended', ... } })`.
