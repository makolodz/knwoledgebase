# Roadmap

Le code vit **dans ce dépôt** (monorepo `apps/` + `packages/` à la racine, à côté de `docs/`).

Règles :
- Traiter les étapes **dans l'ordre**. Ne pas commencer une étape tant que la précédente n'est pas « terminée ».
- Une étape = une ou plusieurs PR/commits cohérents. Cocher les cases au fur et à mesure.
- Si une étape révèle un choix non documenté : s'arrêter, proposer, puis écrire l'ADR.

## Définition de « terminé » (pour chaque étape)
- [ ] Lint, vérification des types et tests passent (`pnpm lint`, `pnpm typecheck`, `pnpm test`).
- [ ] Les tests prioritaires de l'étape sont écrits ([testing.md](technical/testing.md)).
- [ ] Aucune règle de [AGENTS.md](../AGENTS.md) n'est enfreinte.
- [ ] La doc est à jour (règles, modèle de données, API) ; ADR écrit si un choix structurant a été fait.
- [ ] Le parcours de l'étape fonctionne en local de bout en bout.

## Étape 1 — Squelette du monorepo
- [x] pnpm workspaces : `apps/api`, `apps/web`, `packages/shared`, TypeScript strict partagé.
- [x] ESLint + Prettier, Vitest configuré dans chaque paquet.
- [x] Docker Compose : MongoDB + Mailpit.
- [x] `apps/api` : Fastify + tRPC (`/api/trpc`) + Socket.IO sur le même serveur, config Zod, logs pino avec `redact`, `@fastify/helmet`, CORS.
- [x] `apps/web` : Vue 3 + Vite + Router + Pinia + PrimeVue + Tailwind, mise en page commune ([screens.md](technical/screens.md)), client tRPC typé, client Socket.IO.
- [x] Procédure `health` appelée depuis le front.
- [x] CI : lint, typecheck, tests.
- [x] Écrire `docs/runbooks/local-development.md`, la section « Commandes » d'[AGENTS.md](../AGENTS.md) et `.env.example`.

**Fini quand** : `pnpm dev` lance API + front, le front affiche la réponse de `health`.

## Étape 2 — Comptes et sessions
Docs : [account.md](domain/workflows/account.md), [security.md](technical/security.md), [ADR-009](decisions/ADR-009-comptes.md), [ADR-011](decisions/ADR-011-sessions-jwt-refresh.md).
- [x] Modèles `users`, `authTokens`, `sessions`.
- [x] Inscription, connexion, déconnexion, refresh avec rotation, `me`.
- [x] File d'envoi `emails` + job d'envoi + `mailer` (Mailpit) ([ADR-006](decisions/ADR-006-emails-brevo.md)).
- [x] Vérification d'email, mot de passe oublié, modification du profil.
- [x] Middlewares tRPC `authed` / `seller` / `admin`, rôles relus en base.
- [ ] Limites anti-abus sur l'authentification.
- [ ] Script de seed : un admin, un vendeur, deux acheteurs.
- [ ] Pages : inscription, connexion, vérification, mot de passe oublié, profil.

**Fini quand** : un utilisateur s'inscrit, vérifie son email via Mailpit, se connecte, et sa session survit au rafraîchissement du token.

## Étape 3 — Enchères : création et modération
Docs : [business-rules.md](domain/business-rules.md), [auction-lifecycle.md](domain/workflows/auction-lifecycle.md), [ADR-007](decisions/ADR-007-photos-disque-local.md).
- [ ] Modèles `auctions`, `settings` (valeurs par défaut au démarrage).
- [ ] Upload d'images (`storage` sur disque, sharp, EXIF supprimées).
- [ ] Vendeur : créer, modifier, annuler ses enchères ; retour en `draft` si modification d'une `scheduled`.
- [ ] Admin : enchères en attente, valider, refuser.
- [ ] Public : liste paginée et détail des enchères.
- [ ] Job d'ouverture `scheduled → live` ([ADR-008](decisions/ADR-008-jobs-setinterval.md)).

**Fini quand** : un vendeur crée une enchère avec photos, l'admin la valide, elle apparaît publiquement et passe `live` à `startsAt`.

## Étape 4 — Offres en temps réel (cœur du projet)
Docs : [business-rules.md](domain/business-rules.md), [realtime.md](technical/realtime.md), [database.md](technical/database.md), [ADR-004](decisions/ADR-004-anti-sniping.md), [ADR-005](decisions/ADR-005-offre-atomique.md).
- [ ] Contrat des événements dans `packages/shared`.
- [ ] Auth Socket.IO au handshake, rooms `auction:<id>`.
- [ ] `bid:place` : vérifications utilisateur, requête atomique, anti-sniping, insertion `bids`, ack avec codes d'erreur.
- [ ] Diffusion `bid:new`, `auction:extended` ; email « offre dépassée ».
- [ ] Limite 5 offres/s par utilisateur.
- [ ] Front : `useAuctionSocket`, formulaire d'offre, compte à rebours, historique en direct.
- [ ] **Tests d'offres simultanées et d'anti-sniping.**

**Fini quand** : deux navigateurs enchérissent sur la même enchère, voient les offres de l'autre en direct, et une offre de dernière minute prolonge l'enchère.

## Étape 5 — Clôture
Docs : [auction-lifecycle.md](domain/workflows/auction-lifecycle.md), [data-flow.md](architecture/data-flow.md).
- [ ] Job de clôture `live → ended`, `winnerId`, `paymentDeadline`, `auction:ended`.
- [ ] Emails de victoire et de clôture sans offre.
- [ ] Remise en vente par duplication.
- [ ] Espace utilisateur : mes offres, mes enchères gagnées.

**Fini quand** : une enchère se clôture seule à l'heure, le gagnant le voit en direct et reçoit l'email.

## Étape 6 — Paiement
Docs : [payment.md](domain/workflows/payment.md), [ADR-003](decisions/ADR-003-paiement-stripe.md).
- [ ] Modèle `payments`, client Stripe dans `infra/`.
- [ ] `payment.checkout` : création ou réutilisation de la Checkout Session.
- [ ] Webhook `POST /api/webhooks/stripe` (corps brut, signature, idempotence).
- [ ] Jobs de rappel et d'expiration (`unpaid`), réattribution par l'admin.
- [ ] Page de retour qui lit le statut depuis l'API.
- [ ] Runbook : `stripe listen` en local.

**Fini quand** : le gagnant paie avec la carte de test et l'enchère passe `paid` via le webhook.

## Étape 7 — Administration et RGPD
- [ ] Gestion des utilisateurs : rôles, suspension, dernier admin protégé.
- [ ] Annulation d'une enchère `live` par l'admin.
- [ ] Modification des paramètres globaux.
- [ ] Suppression de compte par anonymisation, avec blocages.

**Fini quand** : tous les parcours admin de [business-rules.md](domain/business-rules.md) fonctionnent.

## Étape 8 — Finitions et mise en production
- [ ] Tests E2E Playwright des parcours critiques.
- [ ] Revue de sécurité ([security.md](technical/security.md)).
- [ ] Rédiger `docs/runbooks/deployment.md` (hébergement, sauvegardes MongoDB + `UPLOAD_DIR`, clés Stripe live, domaine email SPF/DKIM/DMARC).
- [ ] Rédiger `docs/architecture/modules.md` à partir du code réel.
