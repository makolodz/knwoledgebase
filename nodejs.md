# Node.js

## Rôle dans le projet
Runtime JavaScript côté serveur : héberge l'API HTTP (Fastify) et le serveur Socket.IO sur le même serveur HTTP.

## Points clés
- Mono-thread, boucle d'événements : idéal pour beaucoup de connexions temps réel (I/O).
- Ne jamais bloquer la boucle (pas de calcul lourd synchrone).
- Utiliser une version **LTS** (22.x), ES modules (`"type": "module"`), TypeScript strict.

## Conventions
- Variables d'environnement via `.env` validées au démarrage (Zod).
- Structure : `routes/` (HTTP), `sockets/` (handlers temps réel), `services/` (logique métier), `models/` (Mongoose).
- Logique métier dans `services/`, réutilisée par HTTP et Socket.IO.
- Gestion d'erreurs centralisée, logs structurés (pino, intégré à Fastify).
