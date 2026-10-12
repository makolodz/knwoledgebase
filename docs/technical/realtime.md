# Temps réel (Socket.IO)

## Rôle
Diffuser en temps réel les nouvelles offres, les prolongations et la fin des enchères à tous les clients qui regardent une enchère. Recevoir les offres des acheteurs.

## Fonctionnement dans le projet
- **Room** par enchère : `auction:<id>`. Le serveur diffuse avec `io.to('auction:<id>').emit(...)`.
- **Authentification** au handshake via le middleware `io.use()` (JWT du cookie). Un visiteur non connecté peut rejoindre une room mais pas enchérir.
- **Ack** sur `bid:place` pour confirmer ou refuser une offre.

## Événements
| Sens | Événement | Payload |
|---|---|---|
| client → serveur | `auction:join` | `{ auctionId }` |
| client → serveur | `auction:leave` | `{ auctionId }` |
| client → serveur | `bid:place` | `{ auctionId, amount }` + ack `{ ok: true } \| { ok: false, code }` |
| serveur → room | `bid:new` | `{ auctionId, amount, bidder: { id, name }, at, nextMinBid }` |
| serveur → room | `auction:extended` | `{ auctionId, endsAt }` |
| serveur → room | `auction:ended` | `{ auctionId, winner: { id, name } \| null, finalPrice }` |

Codes d'erreur de l'ack : [business-rules.md](../domain/business-rules.md), section « Placer une offre ».

## Règles
- Typer les événements avec les interfaces `ServerToClientEvents` / `ClientToServerEvents` de `packages/shared`.
- Valider chaque payload entrant avec Zod.
- Ne jamais diffuser d'email ni de donnée privée : uniquement `id` et `name`.
- Pour plusieurs instances serveur : adapter Redis ou `@socket.io/mongo-adapter`.
