---
paths:
  - "apps/api/**"
---

# Règles : paiement Stripe

Source de vérité : [payment.md](../../docs/domain/workflows/payment.md) et [ADR-003](../../docs/decisions/ADR-003-paiement-stripe.md).

- Une enchère passe à `paid` **uniquement** dans le webhook `checkout.session.completed`, et seulement si `payment_status === 'paid'`. Jamais depuis la page de retour du navigateur, ni depuis une route API ordinaire.
- La signature du webhook est **toujours** vérifiée avec le corps brut. Une signature invalide est refusée sans aucun changement d'état.
- Le traitement est **idempotent** : un événement reçu deux fois ne produit qu'un seul passage à `paid` et un seul paiement enregistré (T6.7).
- Seul le gagnant (`winnerId`) peut créer une Checkout Session. Relire le rôle et la suspension en base.
- Montant = prix final en centimes, devise `eur`, `metadata = { auctionId, userId }`.
- Réutiliser une session ouverte pour la même enchère et le même gagnant plutôt qu'en créer une autre.
- `expires_at` ne dépasse jamais `paymentDeadline`.
- Les clés Stripe viennent de `apps/api/src/infra/` et de l'environnement. Jamais de clé live dans le code, les tests ou les logs. Les tests utilisent les clés de test uniquement.
- Les remboursements sont manuels, depuis le tableau de bord Stripe : ne pas les coder.
