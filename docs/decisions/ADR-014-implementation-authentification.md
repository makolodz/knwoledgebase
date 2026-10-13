# ADR-014 : Authentification, emails et tests sur base réelle — bibliothèques et choix d'implémentation

- **Statut** : accepté
- **Date** : 2026-10-13

## Contexte
L'étape 2 de la [roadmap](../roadmap.md) code les comptes et les sessions décidés par [ADR-009](ADR-009-comptes.md) et [ADR-011](ADR-011-sessions-jwt-refresh.md), ainsi que la file d'envoi d'emails d'[ADR-006](ADR-006-emails-brevo.md). Ces ADR fixent le comportement, pas les bibliothèques ni plusieurs détails d'implémentation. Il fallait aussi trancher comment tester sur une vraie base ([testing.md](../technical/testing.md)).

## Décision
**Bibliothèques** (`apps/api`) :
| Besoin | Choix | Raison |
|---|---|---|
| Base de données | `mongoose` | [ADR-001](ADR-001-stack-backend.md) |
| Hash des mots de passe | `argon2` (argon2id, paramètres par défaut) | [security.md](../technical/security.md) |
| JWT (HS256) | `jose` | ESM, sans dépendance, maintenu, vérifie l'algorithme attendu (refuse `alg: none`) |
| Cookies | `@fastify/cookie` | Plugin officiel Fastify |
| Limite globale par IP | `@fastify/rate-limit` | [security.md](../technical/security.md) |
| Envoi SMTP | `nodemailer` | [ADR-006](ADR-006-emails-brevo.md) |
| Tests | `mongodb-memory-server` (dev) | [testing.md](../technical/testing.md) |

**Tests sur base réelle** : un seul `mongod` (version `8.0.x`, alignée sur `mongo:8.0` de Docker Compose) est démarré par exécution de Vitest (`globalSetup`). Chaque fichier de test utilise **sa propre base**, dont les collections sont vidées entre les tests. Le binaire est téléchargé au premier lancement, pas à l'installation (script d'installation refusé par `allowBuilds`).

**Limites anti-abus** : `@fastify/rate-limit` applique la limite globale (300 requêtes par minute et par IP). Les limites par action d'[security.md](../technical/security.md) (connexion par IP **et** par email, inscription, mot de passe oublié, renvoi de vérification) utilisent un **limiteur en mémoire** écrit pour le projet (`services/rate-limiter.ts`) : tout tRPC passe par une seule route Fastify, donc le plugin ne peut pas distinguer les procédures. Le même limiteur servira à `bid:place`. Il reste valable tant que l'API tourne en une seule instance ([ADR-007](ADR-007-photos-disque-local.md)).

**Rotation du refresh token** : `sessions` garde le hash du refresh token **précédent** (`previousRefreshTokenHash`). Présenter ce token précédent est une réutilisation. Pour éviter qu'un second onglet qui rafraîchit en même temps déconnecte l'utilisateur, une réutilisation dans les **10 secondes** suivant la rotation est seulement refusée (`REFRESH_CONFLICT`, HTTP 409) : le client relit le cookie déjà renouvelé et réessaie une fois. Au-delà, toutes les sessions de l'utilisateur sont révoquées.

**Inscription sans connexion automatique** : la réponse est identique que l'email existe ou non, et aucune session n'est ouverte. Sinon l'absence de session trahirait l'existence d'un compte, ce qu'[account.md](../domain/workflows/account.md) interdit. Cela remplace « l'utilisateur est connecté immédiatement ».

**File d'envoi** : `emails.data` contient le lien avec le token en clair jusqu'à l'envoi (les tokens des `authTokens` restent hashés) ; il est **vidé dès que l'email est `sent`**. L'email pris en charge par le job voit son `sendAfter` repoussé (pas de statut supplémentaire). Réessais à 1 min, 5 min, 30 min et 2 h, puis `failed` à la cinquième tentative.

**Secret JWT** : au moins 32 caractères, obligatoire en production. En développement et en test, s'il est absent, un secret aléatoire est généré au démarrage du processus : aucun secret prévisible dans le dépôt, au prix de sessions d'accès invalidées à chaque redémarrage (le refresh token, lui, reste valable).

**Cookies** : `httpOnly`, `SameSite=Lax`, `Secure` **en production seulement** (le développement se fait en `http://localhost`).

## Conséquences
- ➕ Les tests de comptes et de sessions s'exécutent sur le vrai comportement de MongoDB (index uniques, TTL, `findOneAndUpdate` atomiques).
- ➕ Un second onglet ne déconnecte pas l'utilisateur, tout en gardant la détection de vol de refresh token.
- ➕ Le limiteur maison est testable avec une horloge simulée et réutilisable.
- ➖ Premier `pnpm test` long : le binaire MongoDB pèse environ 740 Mo sous Windows (moins sous Linux). Il est ensuite en cache.
- ➖ Une réutilisation de refresh token dans les 10 s après la rotation n'est pas détectée comme un vol.
- ➖ Le limiteur est local au processus : il faudra un stockage partagé si l'API passe à plusieurs instances.
- ➖ L'utilisateur doit se connecter après son inscription (une saisie de mot de passe de plus).
- ➖ En production, le front et l'API doivent partager le même site pour que les cookies `SameSite=Lax` suivent ([ADR-013](ADR-013-outillage-monorepo.md)).

## Alternatives écartées
- **`jsonwebtoken`** : très répandu, mais CommonJS et moins strict sur l'algorithme accepté ; `@fastify/jwt` l'enveloppe.
- **`@node-rs/argon2`** : sans compilation, mais [security.md](../technical/security.md) cite la bibliothèque `argon2`. À reprendre si `argon2` posait problème sans scripts d'installation.
- **Un `mongod` par fichier de test** : isolation totale, mais un démarrage de plusieurs secondes par fichier.
- **MongoDB de Docker Compose pour les tests** : oblige à lancer Docker pour tester, et mélange les données de développement et de test.
- **Ne rien faire de la réutilisation d'un refresh token** : un vol de token ne serait jamais détecté.
- **`@fastify/rate-limit` pour toutes les limites** : impossible de cibler une procédure tRPC ni de compter par email.
- **Connexion automatique après inscription** : moins de friction, mais fuite sur l'existence d'un email.
