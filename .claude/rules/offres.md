---
paths:
  - "apps/api/**"
  - "packages/shared/**"
---

# Règles : offres

Source de vérité : [business-rules.md](../../docs/domain/business-rules.md), section « Placer une offre ».

- Une offre est vérifiée et enregistrée en **une seule opération atomique** MongoDB, anti-sniping compris ([database.md](../../docs/technical/database.md), [ADR-005](../../docs/decisions/ADR-005-offre-atomique.md)). Ne jamais faire un `find` puis un `update` séparés.
- Les conditions (connexion, rôle, email vérifié, suspension, enchère `live`, heure serveur `< endsAt`, pas le vendeur, pas déjà meilleur enchérisseur, `amount ≥ nextMinBid`) sont relues en base au moment du traitement.
- `nextMinBid` : `startingPrice` sans offre, puis `amount + minIncrement`. Jamais calculé ou envoyé par le client.
- Chaque refus renvoie le code exact du tableau de `business-rules.md` (`BID_TOO_LOW`, `OWN_AUCTION`, etc.) dans l'ack Socket.IO. Ne pas inventer de code.
- Une offre acceptée n'est jamais modifiée ni supprimée.
- Anti-sniping : `endsAt = max(endsAt, maintenant + antiSnipingMs)` dans la même opération. Émettre `auction:extended` seulement si `endsAt` change.
- Les montants sont des entiers en centimes. Refuser tout montant décimal ou négatif (`INVALID_AMOUNT`).
- Toute modification de cette logique arrive avec ses tests : scénarios T4.x de [business-tests.md](../../docs/technical/business-tests.md), dont les offres simultanées (T4.14 à T4.17), sans mock de MongoDB.
