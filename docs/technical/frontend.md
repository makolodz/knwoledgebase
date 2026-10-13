# Front (`apps/web`)

## Rôle
SPA qui affiche les enchères, permet d'enchérir et montre les nouvelles offres en temps réel. Elle parle à l'API Fastify en HTTP et au serveur Socket.IO en temps réel. Raisons du choix : [ADR-002](../decisions/ADR-002-frontend-vue.md).

## Stack
Vue 3 (Composition API, `<script setup lang="ts">`), Vite, TypeScript strict, Vue Router, Pinia, socket.io-client, **PrimeVue 4 (MIT) + Tailwind** ([ADR-012](../decisions/ADR-012-ui-primevue.md)). Ne pas passer à PrimeVue 5 : licence propriétaire (voir l'addendum de l'ADR).

Description de chaque écran : [screens.md](screens.md).

## Structure (`apps/web/src`)
- `views/` : pages (accueil, connexion, inscription, vérification, mot de passe oublié, compte ; puis liste et détail des enchères, espace vendeur, admin)
- `components/` : composants réutilisables (mise en page `AppLayout`, `FormField`, `AuthCard`, formulaires du compte dans `account/` ; puis carte d'enchère, compte à rebours, formulaire d'offre)
- `stores/` : stores Pinia (`realtime`, `auth`, puis `auctions`)
- `forms/` : validation des formulaires avec les schémas Zod de `packages/shared` (`validateForm`)
- `i18n/errors.ts` : message lisible pour chaque code d'erreur de l'API
- `test/` : utilitaires de test (faux client tRPC, montage de l'application complète)
- `composables/` : logique réutilisable (`useAuctionSocket`, `useCountdown`)
- `api/` : client tRPC typé avec `AppRouter` ([api.md](api.md)), `fetch` qui renouvelle la session (`auth-fetch.ts`) et instance unique du socket
- `router/` : routes (`createAppRouter`, historique injectable pour les tests) et gardes de navigation (`guards.ts`)
- `env.ts` : variables `VITE_*` validées par Zod (`VITE_API_URL`) ; le `.env` est celui de la racine ([ADR-013](../decisions/ADR-013-outillage-monorepo.md))

## Session et authentification
- Les cookies de session sont `httpOnly` : le front ne les lit jamais. Il sait qu'il est connecté en appelant `auth.me` au démarrage (`useAuthStore().load()`, appelé par la garde du routeur avant la première page).
- **Renouvellement transparent** (`api/auth-fetch.ts`) : quand l'API répond `NOT_AUTHENTICATED`, le `fetch` du client appelle `auth.refresh` **une seule fois** pour toutes les requêtes en cours, puis rejoue la requête une fois. Un `REFRESH_CONFLICT` (autre onglet) est réessayé une fois. Si le renouvellement échoue, le store repasse en mode visiteur.
- **Lectures groupées, écritures séparées** : les requêtes `query` sont groupées, les `mutation` partent une par une. `auth.refresh` doit arriver seule sur `/api/trpc/auth.refresh` pour recevoir son cookie, et une requête rejouée ne doit pas refaire une écriture réussie.
- **Routes protégées** (`meta` des routes) : `requiresAuth` redirige vers `/login?redirect=…` ; `guestOnly` renvoie un utilisateur connecté à l'accueil ; `roles` affiche la page 404 à un autre rôle. Le paramètre `redirect` est **assaini** (`safeRedirect`) : un chemin interne seulement, jamais une adresse complète.
- Un visiteur sans session provoque deux réponses 401 au chargement (`auth.me`, puis `auth.refresh`), que le navigateur signale en console : c'est normal. Un cookie « indicateur » lisible par le JavaScript éviterait ces appels, mais il ne serait pas visible du front si l'API est sur un autre sous-domaine : on ne le fait pas.
- Les formulaires valident avec les schémas de `packages/shared` avant d'appeler l'API, qui revérifie tout. Les messages d'erreur du serveur ne sont jamais affichés tels quels : `i18n/errors.ts` les traduit.

## Temps réel
Composable `useAuctionSocket(auctionId)` :
- au montage : `emit('auction:join', { auctionId })`
- écoute `bid:new`, `auction:extended` et `auction:ended`, et met à jour le store Pinia (prix, `nextMinBid`, `endsAt`, gagnant)
- le compte à rebours se recalcule à chaque `auction:extended`
- au démontage : retire les listeners et émet `auction:leave`
- `bid:place` est envoyé avec un ack ; le code d'erreur ([business-rules.md](../domain/business-rules.md), section « Placer une offre ») est traduit en message lisible
- le formulaire d'offre propose `nextMinBid` comme montant par défaut

Une seule instance de socket pour toute l'app, typée avec `ServerToClientEvents` / `ClientToServerEvents` importés depuis `packages/shared` ([realtime.md](realtime.md)).

## Règles
- Le front n'est jamais la source de vérité : le compte à rebours est indicatif, le serveur décide.
- Après un paiement, afficher le statut **lu depuis l'API**, jamais déduit de l'URL de retour Stripe.
- Afficher les prix à partir des centimes (`Intl.NumberFormat`, EUR).
- Tests : Vitest + Vue Test Utils. Lint : ESLint (`eslint-plugin-vue`) + Prettier.
