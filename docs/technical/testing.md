# Tests

Outils :
- **Vitest** : tests unitaires et d'intégration, back et front ;
- **Vue Test Utils** : composants ;
- **mongodb-memory-server** : base MongoDB pour les tests ;
- **Playwright** : tests de bout en bout (E2E).

## Principes
- Tester le comportement, pas l'implémentation.
- **Pas de mock de MongoDB** : la logique critique (offres atomiques, changements de statut) n'a de sens que sur une vraie base.
  - Une base mongodb-memory-server par fichier de test, vidée entre les tests.
- Mocks autorisés uniquement aux frontières : Stripe, SMTP (`mailer`) et l'horloge.
- **Horloge contrôlée** (`vi.useFakeTimers()` ou horloge injectée) pour tout ce qui dépend de `endsAt`, des délais ou des jobs.
- Chaque bug corrigé arrive avec un test qui le reproduit.

## Priorités (à couvrir avant tout le reste)
Les scénarios détaillés par étape sont dans [business-tests.md](business-tests.md).
1. **Offres simultanées** : N offres envoyées en parallèle sur la même enchère.
   - Une seule est acceptée par niveau de prix.
   - `nextMinBid` reste cohérent.
   - Aucune offre acceptée ne manque dans `bids`.
2. **Règles d'offre** : chaque code de refus de [business-rules.md](../domain/business-rules.md) a son test.
3. **Anti-sniping** :
   - offre dans les 2 dernières minutes → `endsAt` repoussé et `auction:extended` émis ;
   - offre plus tôt → `endsAt` inchangé.
4. **Changements de statut** ([auction-lifecycle.md](../domain/workflows/auction-lifecycle.md)) :
   - chaque transition autorisée fonctionne ;
   - les transitions interdites sont refusées ;
   - les jobs sont idempotents (deux passages produisent un seul effet).
5. **Webhook Stripe** ([payment.md](../domain/workflows/payment.md)) :
   - une signature invalide est refusée ;
   - le même événement reçu deux fois ne fait passer à `paid` qu'une fois ;
   - les cas limites sont couverts.
6. **Permissions** :
   - chaque procédure `seller` ou `admin` est refusée aux autres rôles ;
   - les données d'un autre utilisateur sont inaccessibles.
7. **Comptes et sessions** :
   - tokens expirés ou réutilisés refusés ;
   - rotation des refresh tokens et détection de leur réutilisation ;
   - révocation des sessions ;
   - anonymisation.

## Niveaux de tests
| Niveau | Où | Contenu |
|---|---|---|
| Unitaire | `*.test.ts` à côté du code | Fonctions pures (calculs, schémas Zod, formatage) |
| Intégration | `apps/api/test/` | Services sur une base réelle, procédures tRPC via `createCaller`, Socket.IO avec de vrais clients `socket.io-client` |
| Composants | `apps/web/src/**/*.test.ts` | Composants clés (formulaire d'offre, compte à rebours) |
| E2E | `e2e/` (Playwright) | Parcours critiques, voir ci-dessous |

## E2E (Playwright)
Ils tournent sur la stack complète : API, front, MongoDB et Mailpit. Parcours couverts :
- inscription → vérification de l'email (lien lu dans Mailpit) → connexion ;
- **enchère à plusieurs** : deux navigateurs sur la même enchère, offres croisées, mises à jour en direct et prolongations visibles des deux côtés ;
- clôture → paiement Stripe **en mode test** (carte `4242 4242 4242 4242`) → statut `paid`. Le webhook est relayé par `stripe listen`, ou simulé par un événement signé ;
- admin : validation d'une enchère.

Pour garder les tests rapides, les durées sont raccourcies par les paramètres (`antiSnipingMs`, durée des enchères).

## CI
Workflow : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
- À chaque push (job `check`) : lint, formatage (Prettier), vérification des types, tests unitaires et d'intégration.
- Sur la branche principale et les PR (job `e2e`, après `check`) : en plus, les tests E2E (Stripe en clés test uniquement). En cas d'échec, le rapport Playwright est publié en artefact.
- Les actions GitHub sont épinglées par SHA ; Dependabot les met à jour.
