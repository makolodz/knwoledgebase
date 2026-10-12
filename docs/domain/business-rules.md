# Règles métier

Référence pour toute règle fonctionnelle. En cas de conflit avec un autre document, **celui-ci fait foi**.
Tous les montants sont en **centimes d'euro (entiers)**, toutes les dates en **UTC**, et toutes les vérifications sont faites **côté serveur**.

Voir aussi :
- [glossary.md](glossary.md) : termes et noms de champs ;
- [auction-lifecycle.md](workflows/auction-lifecycle.md) : statuts et clôture ;
- [payment.md](workflows/payment.md) : paiement.

## Rôles et permissions

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
| Modifier les paramètres globaux | ❌ | ❌ | ❌ | ✅ |
| Réattribuer une enchère impayée | ❌ | ❌ | ❌ | ✅ |

## Création d'une enchère

| Champ | Règle |
|---|---|
| `title` | Obligatoire, 3 à 120 caractères |
| `description` | Obligatoire |
| `images` | 1 à 5 photos |
| `startingPrice` | Entier ≥ **100** (1 €) |
| `minIncrement` | Entier ≥ **1** ; vaut `defaultMinIncrement` par défaut |
| `startsAt` | Dans le futur |
| `endsAt` | Durée `endsAt − startsAt` comprise entre `minDurationMs` et `maxDurationMs` |

## Placer une offre

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
- La vérification et l'enregistrement se font en **une seule opération atomique** ([database.md](../technical/database.md), [ADR-005](../decisions/ADR-005-offre-atomique.md)). Si deux offres arrivent en même temps, **la première enregistrée gagne** et la seconde est refusée avec `BID_TOO_LOW`.
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

## Anti-sniping

Règle : **une enchère reste toujours ouverte au moins `antiSnipingMs` (2 min par défaut) après la dernière offre acceptée** ([ADR-004](../decisions/ADR-004-anti-sniping.md)).

- À chaque offre acceptée : `endsAt = max(endsAt, maintenant + antiSnipingMs)`.
- Ce calcul fait partie de la **même opération atomique** que l'offre.
- Le nombre de prolongations n'est pas limité. La fin est garantie, car chaque offre doit augmenter le prix d'au moins `minIncrement`.
- Si `endsAt` change, le serveur émet `auction:extended` à la room de l'enchère.

## Paramètres globaux (admin)

Ils sont stockés dans la collection `settings` ([database.md](../technical/database.md)) et modifiables par l'admin. Un changement s'applique aux **nouvelles** enchères et aux **prochaines** offres, jamais rétroactivement.

| Paramètre | Défaut | Rôle |
|---|---|---|
| `defaultMinIncrement` | **100** (1 €) | Pas minimum proposé à la création |
| `antiSnipingMs` | **120 000** (2 min) | Durée minimale d'ouverture après une offre |
| `paymentDelayMs` | **172 800 000** (48 h) | Délai de paiement du gagnant |
| `minDurationMs` | **3 600 000** (1 h) | Durée minimale d'une enchère |
| `maxDurationMs` | **1 209 600 000** (14 j) | Durée maximale d'une enchère |

## Notifications

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

## Hors scope

Prix de réserve, achat immédiat, enchères automatiques (proxy bidding), enchères inversées, commission, Stripe Connect, multi-devises (EUR uniquement), livraison.

## Valeurs par défaut à confirmer

Ces choix ont été faits par défaut. Ils sont à valider ou à corriger :
- l'admin ne peut ni enchérir ni vendre (neutralité) ;
- un vendeur ne peut pas modifier une enchère `scheduled` sans repasser en validation ;
- 1 à 5 photos, prix de départ ≥ 1 €, durée de 1 h à 14 j ;
- paiement par carte uniquement, rappel 24 h avant l'échéance ;
- remise en vente par duplication.
