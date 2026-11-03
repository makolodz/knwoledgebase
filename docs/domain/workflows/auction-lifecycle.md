# Cycle de vie d'une enchère

Statuts : `draft`, `scheduled`, `live`, `ended`, `paid`, `unpaid`, `cancelled`.
Implémentation des transitions automatiques : [data-flow.md](../../architecture/data-flow.md), section « Jobs planifiés ».

## Transitions

| De | Vers | Déclencheur | Conditions et effets |
|---|---|---|---|
| — | `draft` | Le vendeur crée l'enchère | Elle n'est pas visible publiquement |
| `draft` | `scheduled` | L'admin valide | `startsAt` est dans le futur ; elle devient visible |
| `draft` | `cancelled` | Le vendeur annule, ou l'admin refuse | Si l'admin refuse, `cancelReason` est obligatoire |
| `scheduled` | `draft` | Le vendeur modifie l'enchère | Elle doit être validée de nouveau |
| `scheduled` | `live` | Job serveur | `startsAt` est atteint |
| `scheduled` | `cancelled` | Le vendeur ou l'admin annule | — |
| `live` | `ended` | Job serveur | `endsAt` est atteint ; voir « Clôture » |
| `live` | `cancelled` | L'admin annule | `cancelReason` obligatoire ; les enchérisseurs sont notifiés ; pas de paiement |
| `ended` | `paid` | Webhook Stripe | Le paiement du gagnant est confirmé ([payment.md](payment.md)) |
| `ended` | `unpaid` | Job serveur | `paymentDeadline` est dépassée sans paiement |
| `unpaid` | `ended` | L'admin réattribue | Le nouveau gagnant est le 2e meilleur enchérisseur ([payment.md](payment.md)) |

## Règles
- **Toute transition absente du tableau est interdite.**
- `paid`, `cancelled` et `ended` sans gagnant sont des états finaux.
- Une enchère `live` n'est **jamais modifiable**, pas même par l'admin (il peut seulement l'annuler).
- **Remettre en vente** = dupliquer l'enchère dans un nouveau `draft`, sans offres. On ne réutilise jamais le document d'origine, pour garder l'historique. C'est possible depuis `ended` sans gagnant, `unpaid` et `cancelled` (pas depuis `ended` avec gagnant : il doit encore payer).
  - Les anciennes dates sont passées : le vendeur en fournit de nouvelles, soumises aux mêmes règles qu'une création (début dans le futur, durée entre `minDurationMs` et `maxDurationMs`). La copie est un `draft` : elle doit être validée.
  - Les photos sont **copiées** sous de nouvelles clés, pour que retirer une photo de la copie ne supprime pas celle de l'originale.

## Visibilité
- Public (liste et détail) : `scheduled`, `live`, `ended`, `paid`, `unpaid`.
- Jamais public : `draft` (en attente de validation) et `cancelled`. Le vendeur les voit dans « Mes enchères », avec le motif d'un refus. La page publique d'une enchère `live` annulée par l'admin (bandeau « Enchère annulée ») sera traitée à l'étape 7.
- La création et la modification enregistrent toujours un `draft` : il n'y a pas de bouton « soumettre ».
- Valider une enchère dont `startsAt` est passé est refusé (`INVALID_DATES`) : l'admin la refuse, le vendeur en crée une nouvelle.

## Clôture
- Un job serveur passe `live → ended` dès que `endsAt ≤ maintenant`. Il ne se fie qu'à l'heure du serveur et à `endsAt` en base.
- **Avec au moins une offre** :
  - `winnerId = currentBidderId` et le prix final est `currentPrice` ;
  - `paymentDeadline = maintenant + paymentDelayMs`.
- **Sans offre** : l'enchère reste `ended` sans gagnant (état final). Le vendeur peut la remettre en vente.
- Les effets (événement, emails) ne partent que du passage qui a réussi la transition : deux passages, ou deux instances, ne notifient pas deux fois. Une offre et la clôture s'excluent, car chacune exige `status: 'live'` et la bonne date dans sa propre mise à jour atomique.
- Le serveur émet `auction:ended` à la room, puis notifie le gagnant et le vendeur ([business-rules.md](../business-rules.md), section « Notifications »).
