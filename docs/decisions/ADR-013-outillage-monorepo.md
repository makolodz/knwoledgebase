# ADR-013 : Outillage du monorepo

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
L'étape 1 de la [roadmap](../roadmap.md) pose le monorepo pnpm ([ADR-001](ADR-001-stack-backend.md)). Plusieurs choix d'outillage n'étaient écrits nulle part : comment les paquets se partagent le code, comment l'API se lance en développement, où vivent les variables d'environnement, comment le front joint l'API.

## Décision
- **Node 22.x LTS** : au moins **22.22.2** (exigé par Vite 8, Vitest 5, ESLint 10 et jsdom), imposé par `engines` et `engine-strict`. Version de référence dans `.nvmrc`.
- **TypeScript 6.0** (`~6.0.3`) et non 7 : `typescript-eslint` 8.x n'accepte pas encore TypeScript ≥ 6.1. Le passage à TypeScript 7 se fera dans une PR dédiée.
- **Versions partagées** entre les paquets via le `catalog` de `pnpm-workspace.yaml`.
- **`packages/shared` est consommé en source** (`exports` → `src/index.ts`), sans étape de build. Vite, Vitest et tsx lisent directement le TypeScript.
- **Résolution TypeScript** : `module: ESNext` et `moduleResolution: Bundler` partout, avec `strict`, `noUncheckedIndexedAccess` et `verbatimModuleSyntax`. Pas d'extension `.js` dans les imports.
- **API en développement** : `tsx watch`. Le **build de production de l'API est reporté à l'étape 8** (déploiement).
- **Un seul fichier `.env` à la racine**. L'API le lit avec `node --env-file-if-exists` (pas de `dotenv`), Vite avec `envDir`. Seules les variables `VITE_*` sont visibles du navigateur. `.env.example` est la seule version commitée.
- **Le front appelle l'API directement** (`VITE_API_URL`), sans proxy Vite : la configuration CORS (`WEB_ORIGIN`, `credentials`) de [security.md](../technical/security.md) est utilisée dès le développement.
- **Tests de bout en bout (Playwright) dès l'étape 1**, avec un seul test de fumée, dans un job de CI séparé des tests rapides.
- **Docker Compose** fournit MongoDB et Mailpit, ports liés à `127.0.0.1`. L'API et le front tournent sur la machine, pas en conteneur, tant qu'il n'y a rien à déployer.
- **Style** : Prettier (guillemets simples, sans point-virgule, 100 colonnes) ; ESLint 10 avec `typescript-eslint` en mode typé. `no-explicit-any` et `no-floating-promises` sont des erreurs. `docs/` et les fichiers Markdown ne sont pas reformatés.

## Conséquences
- ➕ Aucun `dist` à reconstruire pour que le front et l'API voient un changement dans `shared`.
- ➕ Une seule source pour les variables d'environnement et pour les versions.
- ➕ Le CORS et les cookies cross-origin sont éprouvés avant l'authentification (étape 2).
- ➖ `tsx` est une dépendance de développement en plus.
- ➖ Consommer `shared` en source impose un bundler pour la production : l'API aura besoin d'un outil de build à l'étape 8 (choix à faire à ce moment-là).
- ➖ Node ≥ 22.22.2 est exigé, plus récent que le « 22 LTS » générique : les contributeurs doivent mettre leur Node à jour.
- ➖ Front et API sur deux origines : en production, ils devront partager le même site (même domaine enregistrable) pour que les cookies `SameSite=Lax` fonctionnent.

## Alternatives écartées
- **`shared` compilé en `dist`** : standard, mais une étape de build à relancer et à garder à jour entre les paquets.
- **Proxy Vite vers l'API** : plus simple pour les cookies, mais le CORS ne serait testé qu'en production.
- **`dotenv`** : une dépendance de plus alors que Node sait lire le fichier.
- **Un `.env` par application** : deux fichiers à synchroniser.
- **Node 24** : plus récent, mais le projet cible Node 22 LTS ([overview.md](../architecture/overview.md)). La décision sera à reprendre avant la fin de support de Node 22 (avril 2027).
