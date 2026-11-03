# API (tRPC + routes Fastify)

Raisons du choix : [ADR-010](../decisions/ADR-010-api-trpc.md). Temps réel : [realtime.md](realtime.md).

## Principe
- Le front appelle l'API via **tRPC**, monté sur Fastify sous **`/api/trpc`** (adapter `@trpc/server/adapters/fastify`).
- Le type `AppRouter` est exporté pour le front ; les schémas Zod d'entrée sont dans `packages/shared`.
- Pas de versioning : front et API sont déployés ensemble.
- Exceptions en **routes Fastify classiques** :
  - `POST /api/webhooks/stripe` : besoin du corps brut pour la signature ;
  - `POST /api/uploads/images` : upload `multipart` ([ADR-007](../decisions/ADR-007-photos-disque-local.md)). Une photo par requête (champ `file`), réservée aux vendeurs, 20 par heure et par utilisateur. Réponse `201 { key, url, thumbUrl }` ; erreurs `{ error: { code, message } }` : `NOT_AUTHENTICATED` (401), `FORBIDDEN` (403), `INVALID_IMAGE` (400), `PAYLOAD_TOO_LARGE` (413, plus de 5 Mo), `UNSUPPORTED_MEDIA_TYPE` (415), `RATE_LIMITED` (429) ;
  - `GET /uploads/*` : fichiers statiques.

## Procédures
Chaque procédure valide son entrée avec Zod et appelle un service ; aucune logique métier dans le router.

| Routeur | Procédure | Type | Accès |
|---|---|---|---|
| `auth` | `register`, `login`, `refresh`, `logout`, `me` | mutation / query | public (`logout`, `me` : connecté) |
| `auth` | `verifyEmail`, `resendVerification` | mutation | public / connecté |
| `auth` | `forgotPassword`, `resetPassword` | mutation | public |
| `profile` | `update`, `changePassword`, `changeEmail`, `confirmEmailChange`, `delete` | mutation | connecté |
| `profile` | `myBids`, `myWins`, `myPayments` | query | connecté |
| `auction` | `list`, `get`, `bids` | query | public |
| `auction` | `create`, `update`, `cancel`, `relist`, `mine`, `getMine`, `rules` | mutation / query | `seller` (ses enchères) |
| `payment` | `checkout` | mutation | gagnant (`winnerId`) |
| `payment` | `status` | query | gagnant |
| `admin` | `pendingAuctions`, `validate`, `reject`, `cancelAuction`, `reassign` | query / mutation | `admin` |

Étape 3 : `auction.list`, `get`, `create`, `update`, `cancel`, `mine`, `getMine`, `rules` et `admin.pendingAuctions`, `validate`, `reject` existent ; `relist` arrive à l'étape 5, `reassign` à l'étape 6, `cancelAuction` à l'étape 7.
- `auction.list` : `{ page, limit, filter: live|upcoming|ended, sort: endingSoon|priceAsc|priceDesc|recent }`. Ne renvoie jamais un `draft` ni un `cancelled`. `ended` regroupe `ended`, `paid` et `unpaid`. Le tri par prix porte sur le prix affiché (offre courante, sinon prix de départ).
- `auction.get` : public. Un `draft` ou un `cancelled` répond `AUCTION_NOT_FOUND` (le vendeur les lit par `getMine`).
- `auction.bids` : `{ id, page, limit }`, public, la plus récente offre d'abord. Chaque offre porte `{ id, amount, bidder: { id, name }, at }` : jamais d'email. Une enchère non publique répond `AUCTION_NOT_FOUND`.
- `auction.getMine` : une enchère du vendeur, tous statuts, avec le motif d'un refus (`cancelReason`). Celle d'un autre vendeur répond `AUCTION_NOT_FOUND`.
- `auction.rules` : `defaultMinIncrement`, `minDurationMs` et `maxDurationMs`, pour pré-remplir et valider le formulaire.
- Codes d'erreur ajoutés : `AUCTION_NOT_FOUND`, `AUCTION_STATE_INVALID` (transition absente du cycle de vie), `INVALID_DATES`, `INVALID_IMAGE`.
| `admin` | `users`, `setRole`, `suspend`, `unsuspend`, `deleteUser` | query / mutation | `admin` |
| `admin` | `getSettings`, `updateSettings` | query / mutation | `admin` |

Les offres ne passent **pas** par tRPC mais par Socket.IO (`bid:place`).

## Contrôle d'accès
Middlewares tRPC : `publicProcedure`, `authedProcedure`, `sellerProcedure`, `adminProcedure`. Le rôle et la suspension sont **relus en base** ([account.md](../domain/workflows/account.md)).

## Erreurs
- Côté serveur : `TRPCError` avec le code tRPC adapté (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`).
- Le code métier est ajouté via l'`errorFormatter` : le client reçoit `error.data.code` (ex. `AUCTION_NOT_LIVE`, `EMAIL_NOT_VERIFIED`) et un `message` lisible. Une erreur sans code métier garde le code tRPC (`BAD_REQUEST`…). Les codes sont dans `packages/shared/src/errors.ts` ; côté serveur, on lève `AppError(code)` (`apps/api/src/errors.ts`).
- Une entrée invalide renvoie `BAD_REQUEST`, le message « Données invalides. » et `error.data.fieldErrors` (chemin du champ → types de problème). Les valeurs saisies n'y figurent jamais.
- Mêmes codes que Socket.IO ([business-rules.md](../domain/business-rules.md)).
- Routes Fastify classiques : `{ error: { code, message } }`.
- Jamais de stack trace ni de détail interne dans une réponse.

## Pagination
Les listes prennent `{ page, limit }` (défaut 20, max 100) et renvoient `{ items, total, page, limit }`.

## Documentation
Pas d'OpenAPI : les types du routeur tRPC font foi. Ce fichier liste les procédures ; le détail des entrées est dans les schémas Zod de `packages/shared`.
