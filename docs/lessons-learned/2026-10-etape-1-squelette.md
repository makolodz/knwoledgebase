# Étape 1 : pièges rencontrés

Problèmes non évidents rencontrés en posant le squelette. Format : **problème → cause → solution**. Les décisions qui en découlent sont dans [ADR-013](../decisions/ADR-013-outillage-monorepo.md) et l'addendum de [ADR-012](../decisions/ADR-012-ui-primevue.md).

## Dépendances et chaîne d'approvisionnement
- **Les dernières versions ne sont pas toutes compatibles entre elles.** TypeScript 7 existe, mais `typescript-eslint` 8.x exige `< 6.1` : TypeScript est épinglé en `~6.0.3`. Avant de monter une version majeure, lire les `peerDependencies` (`npm view <paquet> peerDependencies`).
- **Les versions minimales de Node sont élevées** (Vite 8, Vitest 5 : ≥ 22.12 ; ESLint 10 : ≥ 22.13 ; jsdom : ≥ 22.22.2). Un Node 22.11 ne suffit pas.
- **PrimeVue 5 a changé de licence** (propriétaire, clé requise). Détail et décision : addendum de l'ADR-012. Un message `PrimeUI license is not configured` dans la console est le signe qu'on a installé la v5.
- **pnpm 12 protège l'installation** : il refuse les versions publiées trop récemment, bloque les scripts d'installation et propose d'installer des « skills » d'agents IA livrés par des paquets. Pour une version refusée, épingler la précédente (pnpm ajoute sinon lui-même une exception dans `pnpm-workspace.yaml`). Pour le reste, refuser explicitement (`allowBuilds`, `permissions`).

## API
- **tRPC ajoute la stack dans les réponses d'erreur** tant que `NODE_ENV` n'est pas `production` : créer le routeur avec `isDev: false` (T1.10).
- **tRPC écrit ses en-têtes sur la réponse brute** et remplace le `Vary: Origin` posé par `@fastify/cors`. Un hook Fastify `onSend` ne le voit pas : utiliser l'option `responseMeta` de tRPC.
- **tRPC ignore `?input=` quand la procédure n'a pas d'entrée.** Le test « paramètre illisible » (T1.3) devra attendre une procédure avec entrée.
- **`@fastify/cors` envoie `Access-Control-Allow-Credentials: true` même à une origine refusée.** Sans `Access-Control-Allow-Origin`, le navigateur bloque quand même : les tests ne vérifient que ce dernier en-tête.
- **CORS ne protège pas la poignée de main WebSocket.** Un site tiers peut ouvrir un socket avec les cookies de l'utilisateur. `allowRequest` refuse toute origine de navigateur différente de `WEB_ORIGIN` (T1.8).
- **Zod 4 : `.url().refine(...)` exécute `refine` même si l'URL est invalide.** `new URL()` levait alors une `TypeError` contenant la valeur saisie, qui pouvait finir dans un log. Utiliser `z.string().refine(...)` avec un test qui ne lève jamais (`originSchema`).
- **`redact` de pino : le joker `*` ne couvre qu'un niveau.** Déclarer la clé à la racine, à un et à deux niveaux (`req.headers.authorization`).
- **`io.close()` ferme aussi le serveur HTTP.** Faire `disconnectSockets` dans `preClose` et `io.close()` dans `onClose`, sinon l'arrêt attend les sockets ouverts.

## Outils de développement
- **`tsx watch` laisse des processus orphelins.** Arrêter le serveur enfant le fait relancer à la prochaine modification de fichier ; il faut arrêter le processus `tsx watch` lui-même. Sinon : `EADDRINUSE` au lancement suivant.
- **Vite ne démarre pas si son stdin est un pipe partagé avec `tsx watch`.** Playwright lance ses serveurs avec un stdin en pipe : un seul `webServer: 'pnpm dev'` bloque. Un serveur Playwright par application règle le problème ; dans un terminal normal, `pnpm dev` fonctionne.
- **ESLint typé ne sait pas lire les fichiers `.vue`.** Sans `declare module '*.vue'` (dans `apps/web/env.d.ts`), chaque import de composant devient une erreur `no-unsafe-*`. `vue-tsc` n'en a pas besoin.
- **Le front importe le type `AppRouter` depuis `@encheres/api`.** `vue-tsc` compile donc aussi les sources de l'API : `@types/node` doit être déclaré dans le front.
