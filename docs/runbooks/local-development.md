# Développement en local

Lancer le projet sur sa machine et vérifier que tout fonctionne. Choix d'outillage : [ADR-013](../decisions/ADR-013-outillage-monorepo.md).

## Prérequis
| Outil | Version | Remarque |
|---|---|---|
| Node.js | **≥ 22.22.2, < 23** (référence : `.nvmrc`) | Vite 8, Vitest 5 et ESLint 10 refusent les Node 22 plus anciens. Un gestionnaire de versions aide : [fnm](https://github.com/Schniz/fnm) ou nvm. `engine-strict` fait échouer `pnpm install` avec un message clair si Node est trop ancien. |
| pnpm | **12.x** (champ `packageManager`) | `corepack enable`, ou `npm install -g pnpm@12.11.2`. |
| Docker | Docker Desktop (Compose v2) | Lancé avant `pnpm infra:up`. |

## Premier démarrage
```bash
pnpm install
pnpm infra:up     # MongoDB + Mailpit, attend qu'ils soient prêts
pnpm dev          # API + front
```
Le fichier `.env` est **optionnel** : tous les réglages ont une valeur par défaut de développement. Pour en changer, copier le modèle (`cp .env.example .env`, ou `Copy-Item .env.example .env` sous PowerShell). `.env` n'est jamais commité.

| Service | URL |
|---|---|
| Front (Vite) | http://localhost:5173 |
| API (Fastify, tRPC sur `/api/trpc`) | http://localhost:3000 |
| Interface Mailpit (emails capturés) | http://localhost:8025 |
| MongoDB | `mongodb://127.0.0.1:27017` (liée à la machine locale uniquement, sans mot de passe) |

À l'étape 1, l'API ne se connecte pas encore à MongoDB et n'envoie aucun email : les deux services sont prêts pour l'étape 2.

## Variables d'environnement
Source : `.env.example` (valeurs par défaut entre parenthèses). L'API refuse de démarrer si une valeur est invalide, sans afficher la valeur.

| Variable | Rôle |
|---|---|
| `NODE_ENV` (`development`) | `development`, `test` ou `production` |
| `HOST` (`localhost`) / `PORT` (`3000`) | Adresse d'écoute de l'API |
| `WEB_ORIGIN` (`http://localhost:5173`) | Seule origine autorisée par CORS et Socket.IO. Sans chemin ni barre finale. |
| `LOG_LEVEL` (`info`) | Niveau des logs pino |
| `VITE_API_URL` (`http://localhost:3000`) | Adresse de l'API vue du navigateur. Visible de tous : jamais de secret dans une variable `VITE_*`. |

Si le front change de port, `WEB_ORIGIN` doit suivre. Vite est configuré sans repli (`strictPort`) pour que l'API ne refuse pas silencieusement un autre port.

## Commandes
| Commande | Effet |
|---|---|
| `pnpm dev` | Lance l'API (`tsx watch`, rechargement à chaud) et le front (Vite) |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Démarre, arrête (les données sont conservées) ou suit les logs de MongoDB et Mailpit |
| `pnpm lint` | ESLint (typé), `no-explicit-any` en erreur |
| `pnpm format` / `pnpm format:check` | Prettier : corrige / vérifie |
| `pnpm typecheck` | `tsc` (API, `shared`, E2E) et `vue-tsc` (front) |
| `pnpm test` | Tests Vitest de tous les paquets : unitaires, intégration, composants |
| `pnpm test:e2e` | Test E2E Playwright : lance l'API et le front tout seul |
| `pnpm --filter @encheres/api test` | Tests d'un seul paquet (`@encheres/web`, `@encheres/shared`) |

Premier lancement des E2E : `pnpm --filter @encheres/e2e exec playwright install chromium` (téléchargement d'environ 150 Mo).

Avant un commit : `pnpm lint`, `pnpm format:check`, `pnpm typecheck` et `pnpm test` doivent passer, comme en CI ([testing.md](../technical/testing.md)).

## Vérifier à la main (étape 1)
1. `pnpm infra:up` puis `pnpm dev`.
2. http://localhost:5173 : le bloc « État du serveur » affiche `API : ok` et l'heure du serveur, et « Temps réel : connecté ». À 360 px de large, la page reste utilisable.
3. `curl -i http://localhost:3000/api/trpc/health` : JSON `{"result":{"data":{"status":"ok",…}}}` et en-têtes de sécurité Helmet.
4. `curl -H "Authorization: Bearer secret" http://localhost:3000/api/trpc/health` : `secret` n'apparaît nulle part dans les logs de l'API.
5. État d'erreur : arrêter `pnpm dev`, lancer seulement le front (`pnpm --filter @encheres/web dev`) et ouvrir la page : le bloc passe en erreur avec « Réessayer » et le temps réel « indisponible ». Démarrer l'API dans un second terminal (`pnpm --filter @encheres/api dev`), puis cliquer sur « Réessayer » : retour à `ok`.
6. http://localhost:8025 répond ; `docker compose ps` montre `mongo` et `mailpit` « healthy ».
7. Une adresse inconnue (`/nimportequoi`) affiche la page 404 dans la mise en page habituelle.

## Dépannage
| Symptôme | Cause et solution |
|---|---|
| `Unsupported engine` à `pnpm install` | Node trop ancien : installer la version de `.nvmrc`. |
| `pnpm` introuvable juste après l'installation de Node ou de fnm | Rouvrir le terminal pour recharger le `PATH`. |
| `EADDRINUSE` sur le port 3000 ou 5173 | Un ancien serveur tourne encore (souvent un `tsx watch` oublié : il relance le serveur à chaque modification de fichier). Trouver le processus avec `netstat -ano \| findstr :3000` (Windows) ou `lsof -i :3000`, puis l'arrêter. |
| Le front affiche « Impossible de joindre le serveur » | L'API n'est pas démarrée, ou `VITE_API_URL` / `WEB_ORIGIN` ne correspondent pas (CORS). |
| Vite ne démarre pas quand `pnpm dev` est lancé avec une entrée standard en pipe (certaines tâches d'IDE, Playwright) | Lancer `pnpm dev` dans un vrai terminal, ou démarrer les deux paquets séparément avec `pnpm --filter … dev`. Voir [lessons-learned](../lessons-learned/2026-10-etape-1-squelette.md). |
| pnpm refuse une version « trop récente » | Protection `minimumReleaseAge` de pnpm 12 : épingler la version précédente, ne pas ajouter d'exception. |
| Repartir d'une base vide | `docker compose down -v` supprime aussi le volume MongoDB. |
