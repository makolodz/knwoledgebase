---
paths:
  - "apps/api/**"
  - "apps/web/**"
---

# Règles : comptes, rôles et sessions

Source de vérité : [account.md](../../docs/domain/workflows/account.md) et [security.md](../../docs/technical/security.md).

- Rôle, `emailVerifiedAt` et `suspendedAt` sont **relus en base** avant toute action sensible. Un JWT périmé ne suffit jamais.
- Un nouvel inscrit est `buyer`. Seul un admin attribue `seller` ou `admin`.
- Le dernier admin ne peut pas perdre son rôle ni être supprimé.
- Connexion : même message d'erreur pour un email inconnu et un mauvais mot de passe. Inscription sur un email existant : même réponse qu'une inscription réussie, sans révéler l'existence du compte.
- Mot de passe : argon2id, 12 caractères minimum, jamais stocké ni journalisé en clair.
- Tokens (vérification, réinitialisation, changement d'email) : au moins 32 octets aléatoires, stockés **hashés**, usage unique, avec expiration.
- Refresh token : rotation à chaque usage. Réutilisation détectée = révocation de toutes les sessions.
- Suppression de compte = anonymisation, pas suppression des `bids` ni des `payments`. Vérifier les blocages listés dans `account.md` avant d'anonymiser.
- Ne jamais renvoyer `passwordHash`, token ou email d'un autre utilisateur dans une réponse tRPC ou un événement.
