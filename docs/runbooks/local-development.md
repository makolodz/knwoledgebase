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

L'API se connecte à MongoDB au démarrage et refuse de démarrer s'il est injoignable : lancer d'abord `pnpm infra:up`.

Les emails ne partent jamais directement : un service les ajoute à la file `emails` (MongoDB) et un job les envoie toutes les 5 secondes, avec des réessais (ADR-006). En local, Mailpit les capture tous : ouvrir http://localhost:8025.

## Comptes de développement
`pnpm seed` crée quatre comptes à l'adresse vérifiée, tous avec le mot de passe `mot-de-passe-de-dev-123` (public : il est dans le dépôt, ces comptes n'ont de sens qu'en local).

| Rôle | Email |
|---|---|
| admin | `admin@example.test` |
| vendeur (`seller`) | `vendeur@example.test` |
| acheteur (`buyer`) | `acheteur1@example.test`, `acheteur2@example.test` |

Le script est idempotent : le relancer remet ces comptes dans leur état d'origine (rôle, mot de passe, non suspendu) sans toucher aux autres. Il **refuse** de tourner si `NODE_ENV` vaut `production` ou si `MONGO_URL` ne désigne pas `localhost` ou `127.0.0.1`.

## Variables d'environnement
Source : `.env.example` (valeurs par défaut entre parenthèses). L'API refuse de démarrer si une valeur est invalide, sans afficher la valeur.

| Variable | Rôle |
|---|---|
| `NODE_ENV` (`development`) | `development`, `test` ou `production` |
| `HOST` (`localhost`) / `PORT` (`3000`) | Adresse d'écoute de l'API |
| `WEB_ORIGIN` (`http://localhost:5173`) | Seule origine autorisée par CORS et Socket.IO. Sans chemin ni barre finale. |
| `LOG_LEVEL` (`info`) | Niveau des logs pino |
| `MONGO_URL` (`mongodb://127.0.0.1:27017/encheres`) | Base MongoDB. Obligatoire en production. Jamais affichée (elle peut contenir un mot de passe). |
| `JWT_SECRET` (aléatoire à chaque démarrage hors production) | Clé de signature des access tokens, 32 caractères au minimum, obligatoire en production. Sans `.env`, un secret aléatoire est généré : les access tokens sont invalidés à chaque redémarrage de l'API (le refresh token les renouvelle). Jamais commité ni journalisé. |
| `SMTP_HOST` (`127.0.0.1`) / `SMTP_PORT` (`1025`) | Serveur SMTP : Mailpit en local, le relais de Brevo en production. `SMTP_HOST` est obligatoire en production. |
| `SMTP_FROM` (`Enchères <no-reply@encheres.local>`) | Expéditeur des emails. Obligatoire en production. |
| `SMTP_USER` / `SMTP_PASSWORD` (aucun) | Authentification SMTP, toutes deux ou aucune. Les identifiants ne partent jamais sans TLS. |
| `VITE_API_URL` (`http://localhost:3000`) | Adresse de l'API vue du navigateur. Visible de tous : jamais de secret dans une variable `VITE_*`. |

Si le front change de port, `WEB_ORIGIN` doit suivre. Vite est configuré sans repli (`strictPort`) pour que l'API ne refuse pas silencieusement un autre port.

## Commandes
| Commande | Effet |
|---|---|
| `pnpm dev` | Lance l'API (`tsx watch`, rechargement à chaud) et le front (Vite) |
| `pnpm seed` | Crée ou remet à neuf les comptes de développement (voir ci-dessous). Demande `pnpm infra:up`. |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Démarre, arrête (les données sont conservées) ou suit les logs de MongoDB et Mailpit |
| `pnpm lint` | ESLint (typé), `no-explicit-any` en erreur |
| `pnpm format` / `pnpm format:check` | Prettier : corrige / vérifie |
| `pnpm typecheck` | `tsc` (API, `shared`, E2E) et `vue-tsc` (front) |
| `pnpm test` | Tests Vitest de tous les paquets : unitaires, intégration, composants. Ils n'ont pas besoin de Docker : `mongodb-memory-server` lance son propre MongoDB. |
| `pnpm test:e2e` | Tests E2E Playwright : lancent l'API et le front tout seuls. Demandent `pnpm infra:up` (MongoDB pour l'API, Mailpit pour lire les emails). Les comptes créés vont dans la base `encheres-e2e`, pas dans celle du développement. |
| `pnpm --filter @encheres/api test` | Tests d'un seul paquet (`@encheres/web`, `@encheres/shared`) |

Premier lancement des E2E : `pnpm --filter @encheres/e2e exec playwright install chromium` (téléchargement d'environ 150 Mo).

Premier `pnpm test` : `mongodb-memory-server` télécharge un binaire MongoDB 8.0 (environ **740 Mo** sous Windows, moins sous Linux), puis le garde en cache : compter plusieurs minutes, et accepter l'éventuelle fenêtre du pare-feu Windows pour `mongod`. Les lancements suivants prennent quelques secondes.

Avant un commit : `pnpm lint`, `pnpm format:check`, `pnpm typecheck` et `pnpm test` doivent passer, comme en CI ([testing.md](../technical/testing.md)).

## Vérifier à la main (étape 1)
1. `pnpm infra:up` puis `pnpm dev`.
2. http://localhost:5173 : le bloc « État du serveur » affiche `API : ok` et l'heure du serveur, et « Temps réel : connecté ». À 360 px de large, la page reste utilisable.
3. `curl -i http://localhost:3000/api/trpc/health` : JSON `{"result":{"data":{"status":"ok",…}}}` et en-têtes de sécurité Helmet.
4. `curl -H "Authorization: Bearer secret" http://localhost:3000/api/trpc/health` : `secret` n'apparaît nulle part dans les logs de l'API.
5. État d'erreur : arrêter `pnpm dev`, lancer seulement le front (`pnpm --filter @encheres/web dev`) et ouvrir la page : le bloc passe en erreur avec « Réessayer » et le temps réel « indisponible ». Démarrer l'API dans un second terminal (`pnpm --filter @encheres/api dev`), puis cliquer sur « Réessayer » : retour à `ok`.
6. http://localhost:8025 répond ; `docker compose ps` montre `mongo` et `mailpit` « healthy ».
7. Une adresse inconnue (`/nimportequoi`) affiche la page 404 dans la mise en page habituelle.

## Vérifier à la main (étape 2)
1. `pnpm infra:up`, puis `pnpm seed` (facultatif) et `pnpm dev`.
2. http://localhost:5173/register : créer un compte (cocher les deux cases). La page renvoie vers `/login` avec « Compte créé : consultez votre boîte mail… ». Refaire avec la même adresse : exactement le même parcours.
3. http://localhost:8025 (Mailpit) : l'email de vérification arrive en moins de 10 secondes (le job d'envoi passe toutes les 5 secondes). Cliquer le lien : « Votre adresse email est vérifiée ». Le cliquer une seconde fois : « Ce lien est invalide, expiré ou déjà utilisé ».
4. Se connecter, ouvrir `/account` : l'adresse est « vérifiée », le rôle est « Acheteur ». Navigateur > Outils de développement > Application > Cookies : `access_token` (chemin `/`) et `refresh_token` (chemin `/api/trpc/auth.refresh`), tous deux `HttpOnly`.
5. **La session survit au renouvellement du token.** Hors production, le secret de signature change à chaque démarrage de l'API : relancer `pnpm dev` (ou toucher un fichier de `apps/api/src`) invalide l'access token. Recharger `/account` : on est toujours connecté, et l'onglet Réseau montre un appel `auth.refresh` suivi d'un nouvel `auth.me`.
6. Mot de passe oublié (`/forgot-password`) : le même message s'affiche pour n'importe quelle adresse ; l'email n'arrive dans Mailpit que pour un compte existant. Le lien (1 h, une seule fois) permet de choisir un nouveau mot de passe ; toutes les sessions sont alors fermées.
7. Adresse email (`/account`) : saisir une nouvelle adresse et le mot de passe actuel. L'email part vers la **nouvelle** adresse ; l'adresse du compte ne change qu'après le clic sur le lien (connecté).
8. Limites : six mauvaises connexions de suite donnent « Trop de tentatives ». Les compteurs sont en mémoire : relancer l'API les remet à zéro.

## Dépannage
| Symptôme | Cause et solution |
|---|---|
| `Unsupported engine` à `pnpm install` | Node trop ancien : installer la version de `.nvmrc`. |
| `pnpm` introuvable, ou `node --version` affiche une vieille version, alors que Node est géré par fnm | fnm n'active aucune version tout seul. Dans PowerShell : `fnm env --use-on-cd --shell powershell \| Out-String \| Invoke-Expression`, puis `fnm use` (il lit `.nvmrc`). Pour l'automatiser, ajouter la première ligne au profil PowerShell (`notepad $PROFILE`). Si `fnm` lui-même est introuvable, rouvrir le terminal : le `PATH` n'est mis à jour qu'à l'ouverture. |
| `pnpm test` : des dizaines d'échecs dans `apps/api` avec `require() of ES Module …/cookie/dist/index.js … light-my-request` | Le terminal exécute les tests avec Node < 22.12 (souvent le Node système, alors que `pnpm` a été trouvé via fnm). `engine-strict` ne contrôle que `pnpm install`. Vérifier avec `node --version`, puis `fnm use` (voir ligne précédente) et relancer. Aucun test ne doit être modifié. |
| « Impossible de joindre MongoDB » au démarrage de l'API | MongoDB n'est pas lancé : `pnpm infra:up` (Docker Desktop doit tourner), puis relancer. Si `MONGO_URL` est défini dans `.env`, vérifier sa valeur. |
| Un test E2E échoue en `RATE_LIMITED` alors que l'API de développement tourne déjà | `pnpm test:e2e` réutilise l'API déjà lancée (hors CI), dont les compteurs d'inscriptions (5 par heure et par IP) sont partagés avec vos essais. L'arrêter, ou la relancer, remet les compteurs à zéro. |
| `RATE_LIMITED` (HTTP 429) après quelques essais de connexion ou d'inscription | Les limites anti-abus de [security.md](../technical/security.md) s'appliquent aussi en local (5 échecs de connexion par 15 min, 5 inscriptions par heure et par IP…). Les compteurs sont en mémoire : redémarrer l'API les remet à zéro. |
| `EADDRINUSE` sur le port 3000 ou 5173 | Un ancien serveur tourne encore (souvent un `tsx watch` oublié : il relance le serveur à chaque modification de fichier). Trouver le processus avec `netstat -ano \| findstr :3000` (Windows) ou `lsof -i :3000`, puis l'arrêter. |
| Le front affiche « Impossible de joindre le serveur » | L'API n'est pas démarrée, ou `VITE_API_URL` / `WEB_ORIGIN` ne correspondent pas (CORS). |
| Vite ne démarre pas quand `pnpm dev` est lancé avec une entrée standard en pipe (certaines tâches d'IDE, Playwright) | Lancer `pnpm dev` dans un vrai terminal, ou démarrer les deux paquets séparément avec `pnpm --filter … dev`. Voir [lessons-learned](../lessons-learned/2026-10-etape-1-squelette.md). |
| pnpm refuse une version « trop récente » | Protection `minimumReleaseAge` de pnpm 12 : épingler la version précédente, ne pas ajouter d'exception. |
| Repartir d'une base vide | `docker compose down -v` supprime aussi le volume MongoDB. |
