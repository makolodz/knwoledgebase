# Temps réel (Socket.IO)

## Rôle
Diffuser en temps réel les nouvelles offres, les prolongations et la fin des enchères à tous les clients qui regardent une enchère. Recevoir les offres des acheteurs.

## Fonctionnement dans le projet
- **Room** par enchère : `auction:<id>`. Le serveur diffuse avec `io.to('auction:<id>').emit(...)`.
- **Authentification** au handshake via le middleware `io.use()` (JWT du cookie `access_token`) :
  - pas de cookie : **visiteur**. Il peut rejoindre une room et suivre les offres, mais ses `bid:place` reçoivent `NOT_AUTHENTICATED` ;
  - cookie présent mais invalide (signature, algorithme, expiration) : **connexion refusée** (`connect_error` avec le message `NOT_AUTHENTICATED`) ;
  - le JWT ne prouve que l'identité. Rôle, email vérifié et suspension sont **relus en base à chaque offre**. La date d'expiration du JWT est mémorisée : une fois dépassée, les offres de ce socket reçoivent `NOT_AUTHENTICATED` jusqu'à une reconnexion.
- **Ack** sur `bid:place` pour confirmer ou refuser une offre.

## Événements
| Sens | Événement | Payload |
|---|---|---|
| client → serveur | `auction:join` | `{ auctionId }` + ack `{ ok: true } \| { ok: false, code }` |
| client → serveur | `auction:leave` | `{ auctionId }` (ack facultatif) |
| client → serveur | `bid:place` | `{ auctionId, amount }` + ack `{ ok: true } \| { ok: false, code }` |
| serveur → room | `bid:new` | `{ auctionId, amount, bidder: { id, name }, at, nextMinBid, bidCount }` |
| serveur → room | `auction:extended` | `{ auctionId, endsAt }` |
| serveur → room | `auction:ended` | `{ auctionId, winner: { id, name } \| null, finalPrice }` |

Codes d'erreur de l'ack : [business-rules.md](../domain/business-rules.md), section « Placer une offre ». S'y ajoute `INTERNAL_ERROR` : panne du serveur, l'offre n'est pas connue comme acceptée (le client la vérifie dans l'historique avant de réessayer).

## Détails de comportement
- `auction:join` n'accepte que les enchères publiques (`scheduled`, `live`, `ended`, `paid`, `unpaid`), sinon `AUCTION_NOT_LIVE`. Une connexion suit au plus **20 enchères** (`MAX_ROOMS_PER_SOCKET`), au-delà `RATE_LIMITED`.
- Le client rejoint la room **puis** recharge l'enchère et son historique (`auction.get`, `auction.bids`) : une offre arrivée entre deux connexions n'est jamais perdue. Il le refait à chaque reconnexion.
- Un `bid:place` mal formé reçoit `AUCTION_NOT_LIVE` si `auctionId` est illisible, sinon `INVALID_AMOUNT` (champ en trop compris). Le montant est volontairement accepté tel quel par le schéma Zod pour que « décimal, négatif, texte ou démesuré » donne `INVALID_AMOUNT` et non une erreur de forme.
- Ordre dans le handler : forme du payload, identité (et expiration du JWT), limite de **5 offres par seconde et par utilisateur** (compteur en mémoire, comptée même si l'offre est refusée), puis le service. Le handler ne contient aucune règle métier.
- Après une offre acceptée : `bid:new` à la room, `auction:extended` si `endsAt` a changé, puis l'ack `{ ok: true }`. L'email « offre dépassée » est ajouté à la file ensuite : une panne de la file ne fait pas échouer une offre déjà enregistrée.
- `auction:ended` est défini dans le contrat mais n'est émis qu'à l'étape 5 (clôture). Le passage `scheduled → live` n'est pas diffusé : le front recharge l'enchère à l'heure de début.

## Règles
- Typer les événements avec les interfaces `ServerToClientEvents` / `ClientToServerEvents` de `packages/shared`.
- Valider chaque payload entrant avec Zod.
- Ne jamais diffuser d'email ni de donnée privée : uniquement `id` et `name`.
- Une seule instance serveur pour l'instant ([ADR-007](../decisions/ADR-007-photos-disque-local.md)), donc pas d'adapter. Si on passe à plusieurs instances : `@socket.io/mongo-adapter` (pas de Redis à ajouter).
