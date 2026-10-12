# ADR-009 : Comptes par email et mot de passe, anonymisation à la suppression

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Les utilisateurs doivent pouvoir s'inscrire, enchérir et payer. Il faut limiter les comptes jetables, qui gagnent puis ne paient pas. Il faut aussi respecter le RGPD (droit à l'effacement) tout en conservant les pièces comptables (offres gagnantes, paiements).

## Décision
- **Connexion par email et mot de passe** (argon2id), sans connexion par un service tiers.
- **Vérification de l'email obligatoire pour enchérir**, mais pas pour se connecter ni pour consulter.
- **Le rôle `seller` est attribué directement par l'admin**, sans demande dans l'application.
- **Suppression de compte par anonymisation** : les données personnelles sont effacées, les offres et paiements sont conservés sous « Utilisateur supprimé ». La suppression est refusée tant que l'utilisateur a des engagements en cours.

Détail des règles : [account.md](../domain/workflows/account.md).

## Conséquences
- ➕ Aucun service d'identité tiers ; les parcours sont maîtrisés.
- ➕ L'utilisateur découvre le site sans friction ; la vérification n'est demandée qu'au moment d'enchérir.
- ➕ L'historique des enchères reste cohérent et les obligations comptables sont respectées.
- ➖ Parcours à coder : vérification, mot de passe oublié, changement d'email (collection `authTokens`).
- ➖ Deux codes de refus d'offre en plus : `EMAIL_NOT_VERIFIED` et `ACCOUNT_SUSPENDED`.
- ➖ Devenir vendeur passe par un contact hors application : aucune trace des demandes.

## Alternatives écartées
- **Connexion Google en plus** : moins de friction, mais OAuth, cas de comptes en double et dépendance à Google.
- **Lien de connexion par email** : chaque connexion dépend de la réception d'un email, ce qui est risqué pendant la fin d'une enchère.
- **Vérification obligatoire pour se connecter** : trop de friction pour simplement consulter.
- **Demande de rôle vendeur dans l'application** : plus traçable, mais un écran et un statut en plus pour un volume faible.
- **Suppression totale** : casse l'historique et les obligations comptables.
- **Désactivation seule** : non conforme si l'utilisateur demande l'effacement.
