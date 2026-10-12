# ADR-003 : Paiement par Stripe Checkout sur le compte de l'association

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Le gagnant d'une enchère doit payer en ligne. Les vendeurs sont des membres ou des donateurs : l'argent revient à l'association. Le paiement doit être fiable sans que l'application manipule de données de carte.

## Décision
- **Stripe Checkout** (page de paiement hébergée par Stripe), **carte uniquement**.
- **Un seul compte Stripe**, celui de l'association. Ni Stripe Connect ni commission.
- **Paiement après la victoire**, avec un délai de paiement (`paymentDelayMs`, 48 h par défaut).
- La Checkout Session est **créée quand le gagnant clique sur « Payer »**, pas à la clôture : une session Stripe expire au plus 24 h après sa création, ce qui est plus court que le délai de paiement.
- Le statut `paid` est fixé **uniquement par le webhook** `checkout.session.completed`, dont la signature est vérifiée.

## Conséquences
- ➕ Aucune donnée de carte ne passe par nos serveurs ; la conformité PCI est gérée par Stripe.
- ➕ Intégration simple, avec un mode test complet.
- ➖ Risque d'impayés : il faut gérer le statut `unpaid` et la réattribution ([payment.md](../domain/workflows/payment.md)).
- ➖ Les remboursements sont manuels, depuis le tableau de bord Stripe.

## Alternatives écartées
- **Stripe Connect** (un compte par vendeur) : inutile puisque l'argent va à l'association, et plus complexe (vérification d'identité des vendeurs, reversements).
- **Carte enregistrée avant d'enchérir** (SetupIntent) puis débit automatique : moins d'impayés, mais plus complexe (authentification 3DS hors session, échecs de débit).
- **Stripe Elements** (formulaire intégré) : plus de contrôle sur l'interface, mais plus de code et de responsabilité.
- **Session créée à la clôture** : impossible avec un délai de 48 h, car elle expirerait avant.
