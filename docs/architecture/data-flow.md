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
6. **API, notification** : un email « offre dépassée » est ajouté à la file `emails` pour l'ancien meilleur enchérisseur. Il est envoyé plus tard par le job, jamais pendant le traitement de l'offre.
7. **Front** : `useAuctionSocket` met à jour le store Pinia (prix, `nextMinBid`, `endsAt`).

## 2. Jobs planifiés

Les jobs sont des boucles `setInterval` dans `apps/api/src/jobs/` ([ADR-008](../decisions/ADR-008-jobs-setinterval.md)). Chaque transition est un `findOneAndUpdate` conditionné par le statut et la date :
- elle est **idempotente** (un passage en double ne fait rien) ;
- après un redémarrage, les enchères en retard sont **rattrapées** au passage suivant, car tout repose sur les dates en base.

| Job | Intervalle | Sélection | Effet |
|---|---|---|---|
| Ouverture | 1 s | `status: 'scheduled'`, `startsAt ≤ maintenant` | → `live` |
| Clôture | 1 s | `status: 'live'`, `endsAt ≤ maintenant` | → `ended`, fixe `winnerId` et `paymentDeadline`, émet `auction:ended`, ajoute les emails à la file |
| Envoi des emails | 5 s | `emails` : `status: 'pending'`, `sendAfter ≤ maintenant` | Envoi SMTP ; en cas d'échec, `attempts + 1` et `sendAfter` repoussé ; `failed` après 5 tentatives |
| Rappel de paiement | 1 min | `status: 'ended'`, `paymentDeadline − 24 h ≤ maintenant`, `paymentReminderSentAt: null` | Fixe `paymentReminderSentAt`, ajoute l'email de rappel à la file |
| Expiration du paiement | 1 min | `status: 'ended'`, `paymentDeadline ≤ maintenant` | → `unpaid`, ajoute les emails pour le vendeur et l'admin |

## 3. Payer une enchère gagnée

1. **Front** : le gagnant clique sur « Payer » et appelle l'API en HTTP.
2. **API** : vérifie que l'utilisateur est `winnerId` et que l'enchère est `ended`. Elle réutilise la Checkout Session encore ouverte ou en crée une nouvelle, puis enregistre une ligne `payments` en `open`.
3. **Front** : redirige vers l'URL Stripe Checkout.
4. **Stripe → API** : webhook `checkout.session.completed`. L'API vérifie la signature, puis passe le paiement à `paid` et l'enchère à `paid`, de façon idempotente.
5. **API** : envoie les notifications (gagnant, vendeur, admin).
6. **Front** : la page de retour affiche le statut **lu depuis l'API**. Elle ne déduit jamais le succès de l'URL de retour.

Règles et cas limites : [payment.md](../domain/workflows/payment.md).
