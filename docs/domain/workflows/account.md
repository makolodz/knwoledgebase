# Comptes utilisateurs

Inscription, connexion, vérification de l'email, rôles, suspension et suppression. Raisons des choix : [ADR-009](../../decisions/ADR-009-comptes.md).
- Sessions, JWT et protection contre la force brute : `technical/security.md` (pas encore écrit).
- Modèle de données : [database.md](../../technical/database.md) (`users`, `authTokens`).

## Inscription
- Champs : `email`, `password`, `name`, acceptation des CGU, déclaration d'être **majeur**. Les deux cases sont obligatoires : un mineur ne peut pas s'engager à payer une enchère.
- Règles de validation :
  - `email` est normalisé (minuscules, espaces retirés) ;
  - `password` fait **au moins 12 caractères**, sans autre règle de complexité ;
  - `name` est le nom d'affichage public : 2 à 30 caractères, pas forcément unique.
- Le mot de passe est hashé avec **argon2id** et n'est jamais stocké en clair.
- À la création :
  - `role: 'buyer'`, `emailVerifiedAt: null`, `acceptedTermsAt` = maintenant ;
  - l'email de vérification est ajouté à la file d'envoi ;
  - l'utilisateur est **connecté immédiatement**.
- Si l'email existe déjà : afficher **le même message** que pour une inscription réussie, et envoyer à cette adresse un email « quelqu'un a tenté de créer un compte ». On ne révèle jamais qu'un email existe.

## Vérification de l'email
- Elle est **obligatoire pour enchérir**. Sans elle, l'utilisateur peut se connecter, consulter et suivre les enchères. Une offre est refusée avec `EMAIL_NOT_VERIFIED` ([business-rules.md](../business-rules.md)).
- Lien de vérification :
  - valable **24 h**, utilisable **une seule fois** ;
  - le token est stocké **hashé** dans `authTokens`.
- Un nouveau lien peut être demandé depuis le profil, au maximum **1 par minute**. Demander un nouveau lien invalide le précédent.

## Connexion et déconnexion
- Connexion par email et mot de passe. Un compte non vérifié peut se connecter.
- En cas d'échec, le message est **toujours le même** (« identifiants invalides »), que l'email existe ou non.
- Un compte **suspendu** ou **supprimé** ne peut pas se connecter.
- La déconnexion invalide la session courante.

## Mot de passe oublié
- L'utilisateur saisit son email. Le message affiché est **toujours le même**, que l'email existe ou non.
- Lien de réinitialisation :
  - valable **1 h**, utilisable **une seule fois** ;
  - le token est stocké **hashé** dans `authTokens`.
- Après la réinitialisation :
  - **toutes les sessions** de l'utilisateur sont fermées ;
  - un email de confirmation est envoyé.

## Modifier son profil
| Champ | Règle |
|---|---|
| `name` | Modifiable librement |
| `password` | Demande le mot de passe actuel. Ferme les autres sessions. |
| `email` | Demande le mot de passe actuel. Un lien de confirmation est envoyé à la **nouvelle** adresse (`authTokens`, 24 h). L'email ne change qu'après le clic, et `emailVerifiedAt` est alors mis à jour. L'ancienne adresse reçoit une notification. |

## Rôle vendeur
- **Seul l'admin** attribue ou retire le rôle `seller`, depuis la gestion des utilisateurs.
- Il n'y a pas de demande dans l'application : le site indique comment contacter l'association pour devenir vendeur.
- Attribution : l'utilisateur reçoit un email.
- Retrait :
  - impossible tant que le vendeur a une enchère `scheduled` ou `live` ;
  - ses enchères `draft` passent à `cancelled` (`cancelReason` : rôle retiré) ;
  - ses enchères `ended` gardent leur déroulé normal.
- Le rôle `admin` ne peut être attribué que par un admin. Le **dernier admin** ne peut pas perdre son rôle.

## Suspension (admin)
- L'admin peut suspendre un compte (`suspendedAt`) et lever la suspension.
- Un compte suspendu :
  - ne peut plus se connecter et ses sessions sont fermées ;
  - voit ses offres refusées avec `ACCOUNT_SUSPENDED` ;
  - garde ses offres déjà placées, qui restent valides.
- Si un compte suspendu gagne une enchère, il ne peut pas payer : l'enchère devient `unpaid` à l'échéance et l'admin la réattribue ([payment.md](payment.md)).

## Suppression de compte (anonymisation)
L'utilisateur peut supprimer son compte depuis son profil, après avoir saisi son mot de passe. L'admin peut aussi le faire sur demande.

**La suppression est refusée** tant que l'utilisateur :
- est meilleur enchérisseur d'une enchère `live` ;
- est gagnant d'une enchère `ended` ou `unpaid` non payée ;
- est vendeur d'une enchère `scheduled` ou `live` ;
- est le **dernier admin**.

Effets (les données personnelles sont **anonymisées**, pas supprimées) :

| Donnée | Traitement |
|---|---|
| `email` | `null` |
| `name` | « Utilisateur supprimé » |
| `passwordHash` | `null` |
| `deletedAt` | Maintenant |
| Sessions, `authTokens` | Supprimés |
| `bids`, `payments` | **Conservés**, toujours liés à `userId`, affichés sous « Utilisateur supprimé » |
| Enchères `draft` du vendeur | Supprimées, photos comprises |
| Autres enchères du vendeur | Conservées, vendeur affiché « Utilisateur supprimé » |

Raison : les pièces comptables (offres gagnantes, paiements) doivent être conservées. La durée légale est à confirmer avec le trésorier ; elle va jusqu'à 10 ans en France. Les données détenues par Stripe suivent la politique de conservation de Stripe.

## Autres droits RGPD
- **Accès et portabilité** : sur demande à l'association, l'admin exporte manuellement les données. Il n'y a pas de fonctionnalité dédiée pour l'instant.
- **Rectification** : par la modification du profil.

## Règles transverses
- Le **rôle**, la **vérification de l'email** et la **suspension** sont **toujours relus en base** avant une action sensible (offre, paiement, action admin). On ne se fie jamais seulement au contenu du JWT, qui peut être périmé.
- Tous les tokens (vérification, réinitialisation, changement d'email) sont **aléatoires** (au moins 32 octets), **stockés hashés**, à **usage unique** et **expirent**.
- Les emails de compte passent par la file d'envoi ([ADR-006](../../decisions/ADR-006-emails-brevo.md)).
