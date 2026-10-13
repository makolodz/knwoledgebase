# Étape 2 : pièges rencontrés

Problèmes non évidents rencontrés en codant les comptes et les sessions. Format : **problème → cause → solution**. Les décisions qui en découlent sont dans [ADR-014](../decisions/ADR-014-implementation-authentification.md) et l'addendum d'[ADR-009](../decisions/ADR-009-comptes.md).

## Dépendances et tests
- **`pnpm add` échoue avec `ERR_PNPM_IGNORED_BUILDS`** pour `mongodb-memory-server` et `argon2` : leurs scripts d'installation sont bloqués (`allowBuilds`). Pour `mongodb-memory-server`, c'est voulu : le binaire MongoDB (environ 740 Mo sous Windows) est téléchargé au premier test, pas à l'installation. Pour `argon2`, les binaires précompilés sont livrés dans le paquet : refuser le script suffit, à vérifier en l'important (`node -e "require('argon2')"`).
- **`createdAt` est immuable pour Mongoose.** Un `updateMany({}, { $set: { createdAt } })` est ignoré sans erreur, et un test qui « vieillit » un document n'a aucun effet. Passer par `Model.collection.updateMany` pour fixer une date de création dans un test.
- **Le dernier caractère d'un JWT en base64url ne porte que des bits de bourrage.** Remplacer `A` par `B` à la fin de la signature peut laisser la signature identique : le test « token falsifié » échouait une fois sur six. Modifier le premier caractère de la signature.
- **Les limites par IP s'accumulent d'un test à l'autre**, puisque `inject` envoie tout depuis `127.0.0.1`. Les limiteurs prennent une horloge injectable ; `test/setup.ts` la fait avancer d'un jour avant chaque test (`test/clock.ts`).
- **Un `&&` après un `pipe` masque l'échec d'un test.** `pnpm test | grep … && git commit` valide même quand `pnpm test` échoue, car `grep` réussit. Utiliser `set -o pipefail` avant d'enchaîner un commit sur une vérification.
- **Une route chargée à la demande n'est pas prête après `flushPromises()`.** Dans un test de composant, `router.push('/account')` attend un `import()` dynamique : utiliser `vi.waitFor(() => expect(route.path).toBe('/account'))`.

## tRPC et cookies
- **Le client tRPC envoie `content-type: application/json` sur tout POST, même sans corps** (`auth.refresh`, `auth.logout`). Sans cet en-tête, tRPC répond 415. Le client de test (`test/trpc.ts`) fait pareil pour rester fidèle au navigateur.
- **Le cookie du refresh token (`Path=/api/trpc/auth.refresh`) n'est envoyé que si `auth.refresh` part seule.** Une requête groupée s'appelle `/api/trpc/auth.refresh,auth.me` et ne correspond plus au chemin. Le client groupe donc les lectures et envoie chaque écriture à part (`splitLink`).
- **Rejouer une requête groupée peut refaire une écriture réussie.** Raison de plus de ne grouper que les lectures.
- **Le plugin `@fastify/rate-limit` ne peut pas distinguer les procédures tRPC**, qui passent toutes par la même route Fastify. Les limites par action utilisent un limiteur écrit pour le projet (`services/rate-limiter.ts`).
- **Un JWT identique est émis si le renouvellement a lieu dans la même seconde** (`iat` est en secondes) : ne pas tester qu'un access token « change » après un refresh, tester que le cookie est renvoyé.
- **La limite globale répond hors format tRPC** (`{ error: { code, message } }`). Le client la reconnaît par le statut 429 (`errorCodeOf`).

## Front
- **Les textes par défaut de PrimeVue sont en anglais**, y compris ceux que lisent les lecteurs d'écran (« Enter a password »). Les surcharger dans la configuration (`locale` de `main.ts`).
- **Un visiteur sans session fait deux appels en erreur au chargement** (`auth.me` puis `auth.refresh`, tous deux 401) et le navigateur les signale en console. Le test E2E de fumée (T1.1) ignore ces deux appels précis. Un cookie « indicateur » lisible par le JavaScript éviterait ces appels, mais ne serait pas visible du front si l'API est sur un autre sous-domaine.
- **Le paramètre `redirect` de la page de connexion vient de l'URL** : sans contrôle, `?redirect=//evil.example` ouvre une redirection vers un autre site. `safeRedirect` n'accepte qu'un chemin interne, sans caractère de contrôle (certains navigateurs retirent les tabulations : `/\t/evil.example` devient `//evil.example`).

## Sécurité des comptes
- **Se connecter automatiquement après l'inscription contredit « ne jamais révéler qu'un email existe »** : avec une adresse déjà utilisée, aucune session n'est ouverte, et son absence trahit le compte. L'inscription ne connecte donc personne.
- **Deux onglets qui rafraîchissent en même temps déconnecteraient l'utilisateur** avec une détection stricte de la réutilisation du refresh token. D'où le délai de grâce de 10 secondes (`REFRESH_CONFLICT`).
- **Le calcul du hash argon2 doit avoir lieu même quand le compte n'existe pas** (inscription d'une adresse déjà prise, connexion d'un email inconnu), sinon le temps de réponse trahit l'existence du compte.
