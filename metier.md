# Règles métier

Référence pour toute règle fonctionnelle. En cas de conflit avec une autre fiche, **cette fiche fait foi**.
Tous les montants sont en **centimes d'euro (entiers)**, toutes les dates en **UTC**, et toutes les vérifications sont faites **côté serveur**.

## 1. Glossaire

| Terme | Champ | Définition |
|---|---|---|
| Enchère | `auctions` | Un objet mis en vente, avec ses règles et sa durée |
| Offre | `bids` | Un montant proposé par un acheteur sur une enchère |
| Prix de départ | `startingPrice` | Montant minimum de la 1re offre |
| Pas minimum | `minIncrement` | Écart minimum entre deux offres successives, fixé par le vendeur |
| Prix courant | `currentPrice` | Montant de la meilleure offre (`null` tant qu'il n'y a aucune offre) |
| Offre minimale suivante | `nextMinBid` | Montant minimum accepté pour la prochaine offre |
| Meilleur enchérisseur | `currentBidderId` | Auteur de la meilleure offre |
| Date de fin | `endsAt` | Fin de l'enchère, repoussée par l'anti-sniping |
| Gagnant | `winnerId` | Utilisateur qui doit payer à la clôture |
| Délai de paiement | `paymentDeadline` | Date limite de paiement pour le gagnant |

## 2. Rôles et permissions

Chaque utilisateur a **un seul rôle**. Un nouvel inscrit est `buyer`. Seul l'admin peut attribuer le rôle `seller` ou `admin`.

| Action | Visiteur | Acheteur (`buyer`) | Vendeur (`seller`) | Admin (`admin`) |
|---|---|---|---|---|
| Consulter les enchères publiques et suivre les offres en direct | ✅ | ✅ | ✅ | ✅ |
| Enchérir | ❌ | ✅ | ✅ (jamais sur ses propres enchères) | ❌ |
| Payer une enchère gagnée | ❌ | ✅ | ✅ | ❌ |
| Voir son historique (offres, gains, paiements) | ❌ | ✅ | ✅ | ✅ |
| Créer une enchère | ❌ | ❌ | ✅ | ❌ |
| Modifier ou annuler sa propre enchère | ❌ | ❌ | ✅ (`draft` ou `scheduled` uniquement) | — |
| Valider ou refuser une enchère | ❌ | ❌ | ❌ | ✅ |
| Annuler n'importe quelle enchère (même `live`) | ❌ | ❌ | ❌ | ✅ |
| Gérer les utilisateurs et les rôles | ❌ | ❌ | ❌ | ✅ |
| Modifier les paramètres globaux (§9) | ❌ | ❌ | ❌ | ✅ |
| Réattribuer une enchère impayée | ❌ | ❌ | ❌ | ✅ |

## 3. Cycle de vie d'une enchère

Statuts : `draft`, `scheduled`, `live`, `ended`, `paid`, `unpaid`, `cancelled`.

| De | Vers | Déclencheur | Conditions et effets |
|---|---|---|---|
| — | `draft` | Le vendeur crée l'enchère | Elle n'est pas visible publiquement |
| `draft` | `scheduled` | L'admin valide | `startsAt` est dans le futur ; elle devient visible |
| `draft` | `cancelled` | Le vendeur annule, ou l'admin refuse | Si l'admin refuse, `cancelReason` est obligatoire |
| `scheduled` | `draft` | Le vendeur modifie l'enchère | Elle doit être validée de nouveau |
| `scheduled` | `live` | Job serveur | `startsAt` est atteint |
| `scheduled` | `cancelled` | Le vendeur ou l'admin annule | — |
| `live` | `ended` | Job serveur | `endsAt` est atteint ; voir §7 |
| `live` | `cancelled` | L'admin annule | `cancelReason` obligatoire ; les enchérisseurs sont notifiés ; pas de paiement |
| `ended` | `paid` | Webhook Stripe | Le paiement du gagnant est confirmé (§8) |
| `ended` | `unpaid` | Job serveur | `paymentDeadline` est dépassée sans paiement |
| `unpaid` | `ended` | L'admin réattribue | Le nouveau gagnant est le 2e meilleur enchérisseur (§8) |

Règles :
- **Toute transition absente du tableau est interdite.**
- `paid`, `cancelled` et `ended` sans gagnant sont des états finaux.
- Une enchère `live` n'est **jamais modifiable**, pas même par l'admin (il peut seulement l'annuler).
- **Remettre en vente** = dupliquer l'enchère dans un nouveau `draft`, sans offres. On ne réutilise jamais le document d'origine, pour garder l'historique.

## 4. Création d'une enchère

| Champ | Règle |
|---|---|
| `title` | Obligatoire, 3 à 120 caractères |
| `description` | Obligatoire |
| `images` | 1 à 5 photos |
| `startingPrice` | Entier ≥ **100** (1 €) |
| `minIncrement` | Entier ≥ **1** ; vaut `defaultMinIncrement` (§9) par défaut |
| `startsAt` | Dans le futur |
| `endsAt` | Durée `endsAt − startsAt` comprise entre `minDurationMs` et `maxDurationMs` (§9) |

## 5. Placer une offre

Une offre est **acceptée seulement si toutes ces conditions sont vraies au moment où le serveur la traite** :

1. L'utilisateur est connecté et a le rôle `buyer` ou `seller`.
2. L'enchère est `live` et l'heure du serveur est **strictement avant** `endsAt`.
3. L'utilisateur n'est **pas le vendeur** de l'enchère.
4. L'utilisateur n'est **pas déjà le meilleur enchérisseur**.
5. `amount` est un entier et `amount ≥ nextMinBid`.

Calcul de `nextMinBid` :
- tant qu'il n'y a aucune offre : `nextMinBid = startingPrice` ;
- après une offre acceptée : `nextMinBid = amount + minIncrement`.

Règles :
- La vérification et l'enregistrement se font en **une seule opération atomique** (voir `mongodb.md`). Si deux offres arrivent en même temps, **la première enregistrée gagne** et la seconde est refusée avec `BID_TOO_LOW`.
- Une offre acceptée est **définitive** : jamais d'annulation ni de modification.
- Chaque offre acceptée est ajoutée à `bids` et diffusée en temps réel à la room de l'enchère.

Codes de refus, renvoyés dans l'ack Socket.IO :

| Code | Cause |
|---|---|
| `NOT_AUTHENTICATED` | Utilisateur non connecté |
| `FORBIDDEN` | Rôle non autorisé à enchérir (admin) |
| `AUCTION_NOT_LIVE` | Enchère qui n'est pas `live` (pas commencée, terminée, annulée) |
| `OWN_AUCTION` | Le vendeur enchérit sur sa propre enchère |
| `ALREADY_HIGHEST` | L'utilisateur est déjà le meilleur enchérisseur |
| `BID_TOO_LOW` | `amount < nextMinBid`, y compris quand une autre offre est arrivée juste avant |
| `INVALID_AMOUNT` | Montant non entier ou négatif |

## 6. Anti-sniping

Règle : **une enchère reste toujours ouverte au moins `antiSnipingMs` (2 min par défaut) après la dernière offre acceptée.**

- À chaque offre acceptée : `endsAt = max(endsAt, maintenant + antiSnipingMs)`.
- Ce calcul fait partie de la **même opération atomique** que l'offre.
- Le nombre de prolongations n'est pas limité. La fin est garantie, car chaque offre doit augmenter le prix d'au moins `minIncrement`.
- Si `endsAt` change, le serveur émet `auction:extended` à la room de l'enchère.

## 7. Clôture

- Un job serveur passe `live → ended` dès que `endsAt ≤ maintenant`. Il ne se fie qu'à l'heure du serveur et à `endsAt` en base.
- **Avec au moins une offre** :
  - `winnerId = currentBidderId` et le prix final est `currentPrice` ;
  - `paymentDeadline = maintenant + paymentDelayMs`.
- **Sans offre** : l'enchère reste `ended` sans gagnant (état final). Le vendeur peut la remettre en vente (§3).
- Le serveur émet `auction:ended` à la room, puis notifie le gagnant et le vendeur (§10).

## 8. Paiement (Stripe)

L'argent va **uniquement sur le compte Stripe de l'association**. Il n'y a ni Stripe Connect ni commission. Moyen de paiement : **carte uniquement**.

1. Le gagnant clique sur « Payer ». Le serveur crée alors une **Checkout Session** :
   - montant = prix final, devise `eur` ;
   - `metadata = { auctionId, userId }` ;
   - `expires_at` au plus tard à `paymentDeadline`, en respectant les limites de Stripe (30 min à 24 h après la création).
2. Si une session encore ouverte existe déjà pour cette enchère et ce gagnant, le serveur la **réutilise** au lieu d'en créer une autre.
3. Le passage à `paid` se fait **uniquement** dans le webhook `checkout.session.completed` avec `payment_status === 'paid'` :
   - **jamais** sur la page de retour du navigateur ;
   - la signature du webhook est toujours vérifiée ;
   - le traitement est idempotent : un événement reçu deux fois ne change rien.
4. À `paymentDeadline` sans paiement, l'enchère passe à `unpaid`. Le vendeur et l'admin sont notifiés.
5. Pour une enchère `unpaid`, l'admin a deux possibilités :
   - **réattribuer** au 2e meilleur enchérisseur distinct, au montant de sa meilleure offre. L'enchère repasse `ended` avec un nouveau `winnerId`, un nouveau `paymentDeadline` et une notification au nouveau gagnant ;
   - **remettre en vente** (§3).
6. Cas limites :
   - Un paiement confirmé pour une enchère `unpaid` dont le payeur est **toujours** `winnerId` est accepté et l'enchère passe à `paid`.
   - Si l'enchère a été réattribuée entre-temps, le paiement est enregistré et l'admin est alerté pour le rembourser.
7. Les remboursements se font **manuellement** par l'admin, depuis le tableau de bord Stripe.
8. La remise de l'objet se fait **hors application**.

## 9. Paramètres globaux (admin)

Ils sont stockés dans la collection `settings` (voir `mongodb.md`) et modifiables par l'admin. Un changement s'applique aux **nouvelles** enchères et aux **prochaines** offres, jamais rétroactivement.

| Paramètre | Défaut | Rôle |
|---|---|---|
| `defaultMinIncrement` | **100** (1 €) | Pas minimum proposé à la création |
| `antiSnipingMs` | **120 000** (2 min) | Durée minimale d'ouverture après une offre |
| `paymentDelayMs` | **172 800 000** (48 h) | Délai de paiement du gagnant |
| `minDurationMs` | **3 600 000** (1 h) | Durée minimale d'une enchère |
| `maxDurationMs` | **1 209 600 000** (14 j) | Durée maximale d'une enchère |

## 10. Notifications

| Événement | Destinataires | Canal |
|---|---|---|
| Nouvelle offre | Room de l'enchère | Temps réel (`bid:new`) |
| Offre dépassée | Ancien meilleur enchérisseur | Temps réel + email |
| Prolongation | Room de l'enchère | Temps réel (`auction:extended`) |
| Clôture | Room de l'enchère | Temps réel (`auction:ended`) |
| Victoire + lien de paiement | Gagnant | Email + affichage dans son espace |
| Rappel de paiement (24 h avant `paymentDeadline`) | Gagnant | Email |
| Paiement reçu | Gagnant, vendeur, admin | Email |
| Enchère sans offre ou impayée | Vendeur | Email |
| Enchère validée, refusée ou annulée | Vendeur (+ enchérisseurs si annulée en `live`) | Email |

Confidentialité :
- Les événements publics n'affichent que le **nom d'affichage** (`name`), **jamais l'email**.
- Le service d'envoi d'emails reste à choisir.

## 11. Hors scope

Prix de réserve, achat immédiat, enchères automatiques (proxy bidding), enchères inversées, commission, Stripe Connect, multi-devises (EUR uniquement), livraison.

## 12. Valeurs par défaut à confirmer

Ces choix ont été faits par défaut. Ils sont à valider ou à corriger :
- l'admin ne peut ni enchérir ni vendre (neutralité) ;
- un vendeur ne peut pas modifier une enchère `scheduled` sans repasser en validation ;
- 1 à 5 photos, prix de départ ≥ 1 €, durée de 1 h à 14 j ;
- paiement par carte uniquement, rappel 24 h avant l'échéance ;
- remise en vente par duplication.
