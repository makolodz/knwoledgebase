# Socket.IO

## Rôle dans le projet
Diffuser en temps réel les nouvelles offres et la fin des enchères à tous les clients qui regardent une enchère.

## Concepts
- **Connexion** bidirectionnelle (WebSocket avec fallback).
- **Événements** nommés : `socket.emit('event', data)` / `socket.on('event', cb)`.
- **Rooms** : un client rejoint `auction:<id>` ; le serveur diffuse avec `io.to('auction:<id>').emit(...)`.
- **Acknowledgements** : callback de réponse pour confirmer/refuser une offre.
- **Middleware** `io.use()` : authentifier le JWT lors du handshake.

## Événements du projet
| Sens | Événement | Payload |
|---|---|---|
| client → serveur | `auction:join` | `{ auctionId }` |
| client → serveur | `bid:place` | `{ auctionId, amount }` + ack |
| serveur → room | `bid:new` | `{ auctionId, amount, bidder, at }` |
| serveur → room | `auction:ended` | `{ auctionId, winner, finalPrice }` |

## Règles
- Typer les événements (interfaces `ServerToClientEvents` / `ClientToServerEvents` dans `packages/shared`).
- Valider chaque payload entrant (Zod).
- Pour plusieurs instances serveur : adapter Redis ou `@socket.io/mongo-adapter`.