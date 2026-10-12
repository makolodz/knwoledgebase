# Paiement (Stripe)

L'argent va **uniquement sur le compte Stripe de l'association**. Il n'y a ni Stripe Connect ni commission. Moyen de paiement : **carte uniquement**. Raisons : [ADR-003](../../decisions/ADR-003-paiement-stripe.md).
Séquence technique : [data-flow.md](../../architecture/data-flow.md), section « Payer une enchère gagnée ».

## Déroulé
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

## Enchère impayée
Pour une enchère `unpaid`, l'admin a deux possibilités :
- **réattribuer** au 2e meilleur enchérisseur distinct, au montant de sa meilleure offre. L'enchère repasse `ended` avec un nouveau `winnerId`, un nouveau `paymentDeadline` et une notification au nouveau gagnant ;
- **remettre en vente** ([auction-lifecycle.md](auction-lifecycle.md)).

## Cas limites
- Un paiement confirmé pour une enchère `unpaid` dont le payeur est **toujours** `winnerId` est accepté et l'enchère passe à `paid`.
- Si l'enchère a été réattribuée entre-temps, le paiement est enregistré et l'admin est alerté pour le rembourser.

## Hors application
- Les remboursements se font **manuellement** par l'admin, depuis le tableau de bord Stripe.
- La remise de l'objet se fait hors application.
