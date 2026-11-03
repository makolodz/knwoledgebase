# Enchères en direct : base de connaissance

Documentation du projet d'enchères en ligne d'une association. Des vendeurs mettent des objets en vente, des acheteurs enchérissent en temps réel, et le gagnant paie via Stripe.

Contraintes imposées par le sujet : **Node.js**, **Socket.IO**, **MongoDB**. Technologies maintenues et le moins de dette technique possible.

## Démarrage rapide
Stack : TypeScript, Fastify + tRPC, Socket.IO, MongoDB, Vue 3. Monorepo pnpm (`apps/api`, `apps/web`, `packages/shared`, `e2e`).

### Prérequis
- **Node.js ≥ 22.22.2, < 23** (voir `.nvmrc`)
- **pnpm 12** (`corepack enable`)
- **Docker Desktop** (Compose v2), lancé avant l'étape 2

### Lancer le projet
```bash
pnpm install
docker compose up -d --wait   # MongoDB + Mailpit (équivalent : pnpm infra:up)
pnpm seed                     # facultatif : comptes de développement
pnpm dev                      # API + front
```

| Service | URL |
|---|---|
| Front | http://localhost:5173 |
| API | http://localhost:3000 |
| Emails capturés (Mailpit) | http://localhost:8025 |

- Docker ne fait tourner que MongoDB et Mailpit. L'API et le front tournent sur la machine, avec `pnpm dev`.
- Le fichier `.env` est optionnel : chaque réglage a une valeur par défaut de développement (`cp .env.example .env` pour en changer).
- Comptes créés par `pnpm seed` (mot de passe `mot-de-passe-de-dev-123`) : `admin@example.test`, `vendeur@example.test`, `acheteur1@example.test`, `acheteur2@example.test`.
- Arrêter les services : `docker compose down` (`pnpm infra:down`). Ajouter `-v` pour supprimer aussi les données MongoDB.

### Lancer les tests
```bash
pnpm test        # unitaires, intégration, composants (Vitest, tous les paquets)
pnpm test:e2e    # bout en bout (Playwright)
```

| Commande | Quand | Prérequis |
|---|---|---|
| `pnpm test` | Toujours | Aucun : `mongodb-memory-server` lance son propre MongoDB, Docker n'est pas nécessaire. Le premier lancement télécharge un binaire MongoDB (plusieurs centaines de Mo, mis en cache). |
| `pnpm test:e2e` | Parcours complets dans un navigateur | `docker compose up -d --wait` (MongoDB et Mailpit). Premier lancement : `pnpm --filter @encheres/e2e exec playwright install chromium`. Playwright démarre l'API et le front tout seul. |
| `pnpm --filter @encheres/api test` | Un seul paquet | Idem `pnpm test`. Autres paquets : `@encheres/web`, `@encheres/shared`. |

Avant un commit, tout doit passer :
```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Variables d'environnement, dépannage (Node trop ancien, port occupé, limites de débit…) et vérifications manuelles : [docs/runbooks/local-development.md](docs/runbooks/local-development.md).

## Navigation
- [AGENTS.md](AGENTS.md) : instructions pour les agents IA. [CLAUDE.md](CLAUDE.md) l'importe pour Claude Code.
- [docs/index.md](docs/index.md) : sommaire et « quel document lire pour quelle tâche ».
- [docs/runbooks/local-development.md](docs/runbooks/local-development.md) : lancer le projet en local (`pnpm install`, `pnpm infra:up`, `pnpm dev`).

## Écrire dans la doc
- En français, avec des phrases courtes, des tableaux et des listes.
- Des règles impératives (« toujours », « jamais ») et les valeurs par défaut en gras.
- Un fait = un seul endroit. Les autres documents y renvoient par un lien relatif.
- Noms de champs, statuts et événements identiques au code (voir [glossary.md](docs/domain/glossary.md)).
