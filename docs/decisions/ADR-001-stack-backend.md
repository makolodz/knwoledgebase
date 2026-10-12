# ADR-001 : Stack backend

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Le sujet impose Node.js, Socket.IO et MongoDB. Il demande des technologies maintenues et le moins de dette technique possible. Le front et le back doivent partager les mêmes types (événements Socket.IO, schémas de validation).

## Décision
- **TypeScript strict** partout.
- **Fastify** pour l'API HTTP.
- **Mongoose** pour accéder à MongoDB.
- **Zod** pour valider les entrées, avec des schémas partagés.
- **Monorepo pnpm** : `apps/api`, `apps/web`, `packages/shared`.

## Conséquences
- ➕ Erreurs de typage détectées à la compilation, contrat front/back unique dans `packages/shared`.
- ➕ Fastify : maintenu, performant, logs pino et hooks intégrés.
- ➕ Mongoose : schémas, validation et typage des documents.
- ➖ Étape de build TypeScript et configuration du monorepo.
- ➖ Mongoose ajoute une couche ; certaines requêtes (update pipeline) demandent une option selon la version.

## Alternatives écartées
- **Express** : très répandu, mais moins de fonctionnalités intégrées (validation, logs) et un rythme d'évolution plus lent.
- **NestJS** : structuré, mais lourd pour un projet de cette taille.
- **Driver MongoDB natif** : plus léger, mais sans schéma ni validation au niveau des modèles.
- **JavaScript sans types** : plus rapide au départ, mais plus de dette technique.
