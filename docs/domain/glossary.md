# Glossaire

Le code utilise **exactement** ces noms de champs, de rôles et de statuts.

## Termes

| Terme | Champ | Définition |
|---|---|---|
| Enchère | `auctions` | Un objet mis en vente, avec ses règles et sa durée |
| Offre | `bids` | Un montant proposé par un acheteur sur une enchère |
| Prix de départ | `startingPrice` | Montant minimum de la 1re offre |
| Pas minimum | `minIncrement` | Écart minimum entre deux offres successives, fixé par le vendeur |
| Prix courant | `currentPrice` | Montant de la meilleure offre (`null` tant qu'il n'y a aucune offre) |
| Offre minimale suivante | `nextMinBid` | Montant minimum accepté pour la prochaine offre |
| Meilleur enchérisseur | `currentBidderId` | Auteur de la meilleure offre |
| Date de début | `startsAt` | Ouverture de l'enchère aux offres |
| Date de fin | `endsAt` | Fin de l'enchère, repoussée par l'anti-sniping |
| Anti-sniping | `antiSnipingMs` | Prolongation automatique quand une offre arrive juste avant la fin |
| Gagnant | `winnerId` | Utilisateur qui doit payer à la clôture |
| Délai de paiement | `paymentDeadline` | Date limite de paiement pour le gagnant |
| Remise en vente | — | Copie d'une enchère dans un nouveau `draft`, sans offres |
| Nom d'affichage | `name` | Seule identité publique d'un utilisateur (jamais l'email) |
| Compte vérifié | `emailVerifiedAt` | Email confirmé par lien ; obligatoire pour enchérir |
| Compte suspendu | `suspendedAt` | Bloqué par l'admin : ni connexion ni offre |
| Compte anonymisé | `deletedAt` | Compte supprimé : données personnelles effacées, offres et paiements conservés |
| File d'envoi (outbox) | `emails` | Emails en attente d'envoi, envoyés et retentés par un job |
| Clé de photo | `images[]` | Identifiant (UUID) d'une photo stockée ; l'URL est construite par `storage` |

## Rôles (`users.role`)

| Rôle | Code | Résumé |
|---|---|---|
| Visiteur | — (non connecté) | Consulte seulement |
| Acheteur | `buyer` | Enchérit et paie |
| Vendeur | `seller` | Comme l'acheteur, et crée des enchères ; rôle attribué par l'admin |
| Admin | `admin` | Modère, gère les utilisateurs et les paramètres ; n'enchérit pas |

Permissions détaillées : [business-rules.md](business-rules.md).

## Statuts d'une enchère (`auctions.status`)

`draft`, `scheduled`, `live`, `ended`, `paid`, `unpaid`, `cancelled`. Les transitions sont décrites dans [auction-lifecycle.md](workflows/auction-lifecycle.md).
