# ADR-011 : Sessions par JWT court et refresh token en base

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
[account.md](../domain/workflows/account.md) exige de pouvoir fermer les sessions d'un utilisateur : après une réinitialisation de mot de passe, une suspension ou une suppression de compte. La connexion Socket.IO s'authentifie au handshake.

## Décision
- Un **access token** JWT valable **15 min**, et un **refresh token** aléatoire valable **30 j**, stocké hashé dans `sessions`. Les deux sont dans des cookies httpOnly.
- Le refresh token change à chaque utilisation. Si un ancien refresh token est réutilisé, toutes les sessions de l'utilisateur sont révoquées.
- Détails : [security.md](../technical/security.md).

## Conséquences
- ➕ Les sessions sont révocables. Un token volé n'est utilisable que 15 min, ou son vol est détecté au rafraîchissement suivant.
- ➕ Pas de lecture de session en base à chaque requête, seulement au rafraîchissement.
- ➖ Le rafraîchissement est à coder côté front, ainsi que la reconnexion du socket quand le token expire.
- ➖ Une révocation peut mettre jusqu'à 15 min à s'appliquer aux requêtes simples. Les actions sensibles relisent l'utilisateur en base, ce qui couvre la suspension et les changements de rôle.

## Alternatives écartées
- **Session opaque en base** : plus simple, mais une lecture en base à chaque requête, et un écart avec l'ADR-001.
- **JWT long sans refresh** : impossible à révoquer.
