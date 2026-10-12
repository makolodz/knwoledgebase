# Sécurité

Raisons du choix des sessions : [ADR-011](../decisions/ADR-011-sessions-jwt-refresh.md). Règles des comptes : [account.md](../domain/workflows/account.md).

## Sessions
- **Access token** : JWT signé (HS256, secret ≥ 32 octets), valable **15 min**.
  - Contenu minimal : `{ sub: userId, sid: sessionId }`.
  - Jamais de rôle ni de donnée personnelle dedans.
- **Refresh token** : aléatoire (≥ 32 octets), valable **30 j**, stocké **hashé** dans `sessions` ([database.md](database.md)).
  - **Rotation** à chaque utilisation : l'ancien est invalidé et un nouveau est émis.
  - Si un refresh token **déjà utilisé** est présenté de nouveau, c'est probablement un vol : toutes les sessions de l'utilisateur sont révoquées.
- Cookies `httpOnly`, `Secure`, `SameSite=Lax`. Le cookie du refresh token a `Path=/api/trpc/auth.refresh`, pour n'être envoyé qu'à cette procédure.
- **Révocation** (suppression des documents `sessions`) :
  - déconnexion : la session courante ;
  - réinitialisation ou changement de mot de passe : toutes les autres sessions ;
  - suspension ou suppression du compte : toutes les sessions.
- Le rôle, la vérification et la suspension sont **relus en base** à chaque action sensible : un JWT encore valide ne suffit pas.

## Socket.IO
- L'authentification se fait au handshake, avec l'access token (cookie).
- Le serveur garde l'expiration du token dans `socket.data`. Un `bid:place` avec un token expiré est refusé avec `NOT_AUTHENTICATED`.
- Le front rafraîchit alors le token, **reconnecte le socket** et rejoint de nouveau la room.
- Quand une session est révoquée, le serveur déconnecte les sockets associés.

## Mots de passe
- Hashés avec argon2id : paramètres par défaut de la librairie `argon2`, ou plus forts.
- Au moins 12 caractères.
- Jamais loggés ni renvoyés dans une réponse.

## Limites anti-abus (`@fastify/rate-limit`)
Les compteurs sont gardés en mémoire. C'est suffisant tant que l'API tourne en une seule instance ([ADR-007](../decisions/ADR-007-photos-disque-local.md)).

| Action | Limite |
|---|---|
| `auth.login` | 5 échecs par 15 min, par IP **et** par email |
| `auth.register`, `auth.forgotPassword`, `auth.resendVerification` | 5 par heure, par IP |
| `bid:place` (Socket.IO) | 5 par seconde, par utilisateur (compteur codé dans le handler) |
| Upload d'images | 20 par heure, par utilisateur |
| Reste de l'API | 300 par minute, par IP |

En cas de dépassement : code `RATE_LIMITED` (HTTP 429).

## Entrées et sorties
- Toute entrée (tRPC, Socket.IO, routes Fastify) est validée par Zod. Les champs inconnus sont rejetés (`.strict()`).
- Les filtres MongoDB sont **construits par le code**, jamais copiés depuis la requête. Sinon, un client pourrait injecter des opérateurs comme `$ne` ou `$where`.
- Une réponse ne contient jamais :
  - `passwordHash` ni aucun token ;
  - l'email d'un autre utilisateur ;
  - de stack trace.
- Uploads : [ADR-007](../decisions/ADR-007-photos-disque-local.md).

## Navigateur
- **CORS** : seule l'origine du front (`WEB_ORIGIN`) est autorisée, avec `credentials`. Même règle pour Socket.IO.
- **CSRF** : protégé par `SameSite=Lax`, et par le fait que les mutations tRPC sont des `POST` en JSON. Un formulaire d'un autre site ne peut pas envoyer ce type de requête.
- En-têtes de sécurité via `@fastify/helmet`, et CSP stricte côté front.

## Secrets
- Ils sont uniquement en variables d'environnement, validées au démarrage ([backend.md](backend.md)).
- Ils ne sont jamais commités. Un fichier `.env.example` liste les variables, sans valeurs réelles.
- Liste : `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_PASSWORD`, `MONGO_URL`.
- Stripe : clés **test** en dev et en CI, clés **live** uniquement en production.

## Logs
Jamais de mot de passe, token, cookie, clé Stripe ni corps de webhook dans les logs. Utiliser l'option `redact` de pino pour les masquer.
