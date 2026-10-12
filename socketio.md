# Socket.IO

## Rôle dans le projet
Diffuser en temps réel les nouvelles offres, les prolongations et la fin des enchères à tous les clients qui regardent une enchère.

## Concepts
- **Connexion** bidirectionnelle (WebSocket avec fallback).
- **Événements** nommés : `socket.emit('event', data)` / `socket.on('event', cb)`.
- **Rooms** : un client rejoint `auction:<id>` ; le serveur diffuse avec `io.to('auction:<id>').emit(...)`.
- **Acknowledgements** : callback de réponse pour confirmer ou refuser une offre.
- **Middleware** `io.use()` : authentifier le JWT lors du handshake. Un visiteur non connecté peut rejoindre une room mais pas enchérir.

## Événements du projet
| Sens | Événement | Payload |
|---|---|---|
| client → serveur | `auction:join` | `{ auctionId }` |
| client → serveur | `auction:leave` | `{ auctionId }` |
| client → serveur | `bid:place` | `{ auctionId, amount }` + ack `{ ok: true } \| { ok: false, code }` |
| serveur → room | `bid:new` | `{ auctionId, amount, bidder: { id, name }, at, nextMinBid }` |
| serveur → room | `auction:extended` | `{ auctionId, endsAt }` |
| serveur → room | `auction:ended` | `{ auctionId, winner: { id, name } \| null, finalPrice }` |

Les codes d'erreur de l'ack sont définis dans `metier.md` §5.

## Règles
- Typer les événements (interfaces `ServerToClientEvents` / `ClientToServerEvents` dans `packages/shared`).
- Valider chaque payload entrant (Zod).
- Ne jamais diffuser d'email ni de donnée privée : uniquement `id` et `name`.
- Pour plusieurs instances serveur : adapter Redis ou `@socket.io/mongo-adapter`.
