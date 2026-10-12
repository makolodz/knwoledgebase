# Flux de données

Comment les données traversent le système. Les règles qui décident du résultat sont dans [business-rules.md](../domain/business-rules.md) ; ce document décrit **qui fait quoi, et dans quel ordre**.

## 1. Placer une offre

1. **Front** : le formulaire envoie `bid:place { auctionId, amount }` avec un ack ([frontend.md](../technical/frontend.md)).
2. **API, middleware Socket.IO** : le JWT a été vérifié au handshake. Sans utilisateur connecté, l'ack renvoie `NOT_AUTHENTICATED`.
3. **API, handler** (`sockets/`) : valide le payload avec Zod puis appelle le service. Aucune logique métier dans le handler.
4. **API, service** (`services/`) : exécute la requête atomique `findOneAndUpdate` ([database.md](../technical/database.md)).
   - Résultat `null` : relire l'enchère pour déterminer le code de refus, puis ack `{ ok: false, code }`.
   - Succès : insérer l'offre dans `bids`, puis ack `{ ok: true }`.
5. **API, diffusion** vers la room `auction:<id>` :
   - `bid:new` avec le nouveau `nextMinBid` ;
   - `auction:extended` si `endsAt` a changé (anti-sniping).
6. **API, notification** : l'ancien meilleur enchérisseur est prévenu qu'il a été dépassé.
7. **Front** : `useAuctionSocket` met à jour le store Pinia (prix, `nextMinBid`, `endsAt`).

## 2. Jobs planifiés

Les jobs tournent dans `apps/api` (`jobs/`). Chaque transition est un `findOneAndUpdate` conditionné par le statut et la date :
- elle est **idempotente** (un passage en double ne fait rien) ;
- après un redémarrage, les enchères en retard sont **rattrapées** au passage suivant, car tout repose sur les dates en base.

| Job | Sélection | Effet |
|---|---|---|
| Ouverture | `status: 'scheduled'`, `startsAt ≤ maintenant` | → `live` |
| Clôture | `status: 'live'`, `endsAt ≤ maintenant` | → `ended`, fixe `winnerId` et `paymentDeadline`, émet `auction:ended`, notifie |
| Rappel de paiement | `status: 'ended'`, `paymentDeadline − 24 h ≤ maintenant`, rappel non envoyé | Email au gagnant |
| Expiration du paiement | `status: 'ended'`, `paymentDeadline ≤ maintenant` | → `unpaid`, notifie le vendeur et l'admin |

La clôture doit tourner à **intervalle court** (de l'ordre de la seconde), car les utilisateurs regardent le compte à rebours. L'implémentation (simple `setInterval` ou librairie de jobs) reste à décider dans un ADR.

## 3. Payer une enchère gagnée

1. **Front** : le gagnant clique sur « Payer » et appelle l'API en HTTP.
2. **API** : vérifie que l'utilisateur est `winnerId` et que l'enchère est `ended`. Elle réutilise la Checkout Session encore ouverte ou en crée une nouvelle, puis enregistre une ligne `payments` en `open`.
3. **Front** : redirige vers l'URL Stripe Checkout.
4. **Stripe → API** : webhook `checkout.session.completed`. L'API vérifie la signature, puis passe le paiement à `paid` et l'enchère à `paid`, de façon idempotente.
5. **API** : envoie les notifications (gagnant, vendeur, admin).
6. **Front** : la page de retour affiche le statut **lu depuis l'API**. Elle ne déduit jamais le succès de l'URL de retour.

Règles et cas limites : [payment.md](../domain/workflows/payment.md).
