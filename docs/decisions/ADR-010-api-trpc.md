# ADR-010 : API en tRPC, sans OpenAPI

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Le front (Vue) et l'API sont dans le même monorepo, déployés ensemble, et seul le front consomme l'API.

## Décision
- **tRPC** sur Fastify (`/api/trpc`), typage de bout en bout via `AppRouter`.
- **Pas d'OpenAPI** : le typage tRPC sert de documentation.
- **Pas de versioning.**
- Erreurs : `TRPCError` + code métier dans `error.data.code` (mêmes codes que Socket.IO).
- Routes Fastify classiques pour le webhook Stripe, l'upload d'images et les fichiers statiques.

## Conséquences
- ➕ Le front connaît les types de l'API sans génération ni duplication.
- ➕ Un changement de signature casse la compilation du front immédiatement.
- ➖ Front et API sont fortement liés : un autre client (appli mobile, partenaire) demanderait une API REST.
- ➖ Pas de Swagger pour tester à la main.
- ➖ Deux styles cohabitent (tRPC + quelques routes Fastify).

## Alternatives écartées
- **REST + OpenAPI** : standard, mais types à maintenir côté front.
- **tRPC + `trpc-to-openapi`** : fork d'une librairie abandonnée, risque de dette.
- **GraphQL** : surdimensionné, doublon avec Socket.IO.
