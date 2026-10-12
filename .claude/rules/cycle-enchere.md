---
paths:
  - "apps/api/**"
  - "packages/shared/**"
---

# Règles : cycle de vie d'une enchère

Source de vérité : [auction-lifecycle.md](../../docs/domain/workflows/auction-lifecycle.md) et [business-rules.md](../../docs/domain/business-rules.md), section « Création d'une enchère ».

- Statuts : `draft`, `scheduled`, `live`, `ended`, `paid`, `unpaid`, `cancelled`. Toute transition absente du tableau de `auction-lifecycle.md` est **interdite** : la refuser côté serveur.
- Les états `paid`, `cancelled` et `ended` sans gagnant sont finaux.
- Une enchère `live` n'est jamais modifiable, même par l'admin. L'admin peut seulement l'annuler, avec `cancelReason`.
- Modifier une enchère `scheduled` la repasse en `draft` : elle doit être revalidée.
- Refuser une enchère exige un `cancelReason`.
- Remise en vente : dupliquer dans un nouveau `draft` sans offres. Ne jamais réutiliser le document d'origine.
- Création : `startingPrice ≥ 100` (centimes), durée entre `minDurationMs` et `maxDurationMs`, `startsAt` dans le futur, 1 à 5 photos.
- La clôture ne se fie qu'à l'heure du serveur et à `endsAt` en base. Les jobs doivent être **idempotents** : deux passages = un seul effet (T3.15, T5.1 à T5.4).
- Ne jamais passer une enchère à `paid` ici : seul le webhook Stripe le fait ([payment.md](../../docs/domain/workflows/payment.md)).
