# Tableau de bord — avancement du projet

> Document **tenu à jour par l'IA** à chaque modification (code, doc, roadmap). Source des cases : [roadmap.md](roadmap.md). Ne pas y recopier le contenu des étapes, seulement l'état.
>
> Dernière mise à jour : 2026-10-13 · Commit de référence : `43f88f0`

## Vue d'ensemble

| Étape | Titre | Avancement | Cases | Statut |
|---|---|---|---|---|
| 1 | Squelette du monorepo | `██████████` 100 % | 8 / 8 | 🟢 Terminée |
| 2 | Comptes et sessions | `████████░░` 88 % | 7 / 8 | 🔵 En cours |
| 3 | Enchères : création et modération | `░░░░░░░░░░` 0 % | 0 / 6 | ⚪ Pas commencée |
| 4 | Offres en temps réel (cœur du projet) | `░░░░░░░░░░` 0 % | 0 / 7 | ⚪ Pas commencée |
| 5 | Clôture | `░░░░░░░░░░` 0 % | 0 / 4 | ⚪ Pas commencée |
| 6 | Paiement | `░░░░░░░░░░` 0 % | 0 / 6 | ⚪ Pas commencée |
| 7 | Administration et RGPD | `░░░░░░░░░░` 0 % | 0 / 4 | ⚪ Pas commencée |
| 8 | Finitions et mise en production | `░░░░░░░░░░` 0 % | 0 / 4 | ⚪ Pas commencée |
| | **Total** | `██░░░░░░░░` **30 %** | **14 / 47** | |

**Étape en cours** : 2 — Comptes et sessions (branche `feat/etape-2-comptes-sessions`, [issue #3](https://github.com/makolodz/knwoledgebase/issues/3)). Étape 1 fusionnée (PR #13, CI verte). Fait : connexion MongoDB, banc de test sur base réelle ([ADR-014](decisions/ADR-014-implementation-authentification.md)), modèles, file d'envoi des emails, inscription, connexion, refresh avec rotation, déconnexion et `auth.me`. Reste : les pages du front (inscription, connexion, vérification, mot de passe oublié, profil) et le test E2E. Fait côté API : vérification d'email, mot de passe oublié, profil, middlewares `authed`, `seller` et `admin`, limites anti-abus, seed.

## État de la documentation

- Documents présents : 35 fichiers Markdown dans `docs/` (architecture, domaine, technique, ADR, runbook, retours d'expérience).
- Scénarios de tests métier par étape : [business-tests.md](technical/business-tests.md).
- Documents annoncés mais absents : `architecture/modules.md`, `runbooks/deployment.md`.
- Décisions à acter (voir [roadmap.md](roadmap.md)) : aucune en attente.

## Historique récent

| Date | Changement | Étapes touchées |
|---|---|---|
| 2026-10-13 | Script de seed `pnpm seed` : admin, vendeur et deux acheteurs (domaine `.test`), idempotent, refusé en production et sur une base non locale (T2.38) | 2 |
| 2026-10-13 | Limites anti-abus : limiteur à fenêtre glissante en mémoire (connexion par IP et par email, inscription, mot de passe oublié, renvoi du lien, mot de passe actuel) et limite globale de 300 requêtes par minute (T2.18, T2.35 à T2.37) | 2 |
| 2026-10-13 | Vérification d'email, mot de passe oublié et réinitialisation, `profile` (nom, mot de passe, changement d'email en deux temps) ; liens à usage unique consommés atomiquement (T2.6, T2.7, T2.10, T2.12, T2.13, T2.33, T2.34) | 2 |
| 2026-10-13 | Procédures `authed`, `seller` et `admin` (rôle relu en base, T2.14) ; T2.15 à T2.17 reportés à l'étape 7 (T7.14 à T7.16) | 2, 7 |
| 2026-10-13 | Inscription (sans connexion automatique, ADR-009 complété), connexion, refresh avec rotation et délai de grâce, déconnexion, `auth.me` ; cookies httpOnly, JWT HS256 relu en base, `errorFormatter` (T2.29 à T2.32) ; `JWT_SECRET` | 2 |
| 2026-10-13 | File d'envoi des emails : `mailer` Nodemailer (Mailpit en local), modèles d'email (HTML échappé), job d'envoi toutes les 5 s avec réessais, `enqueueEmail` (T2.24 à T2.28) ; variables `SMTP_*` | 2 |
| 2026-10-13 | Modèles `users`, `authTokens`, `sessions` et `emails` avec leurs index (T2.22, T2.23), rôles dans `packages/shared` | 2 |
| 2026-10-13 | Début de l'étape 2 : `mongoose`, connexion MongoDB au démarrage, banc de test `mongodb-memory-server` (T2.20, T2.21), `MONGO_URL`, job `e2e` avec Docker Compose, [ADR-014](decisions/ADR-014-implementation-authentification.md) | 2 |
| 2026-10-13 | `.claude/launch.json` (configuration des serveurs de prévisualisation, propre à chaque machine) ajouté au `.gitignore` | — |
| 2026-10-13 | Runbook : `pnpm test` rouge dans `apps/api` (`require() of ES Module`) quand le terminal utilise un Node < 22.12 | 1 |
| 2026-10-12 | Runbook : dépannage de l'activation de Node/pnpm avec fnm sous PowerShell | 1 |
| 2026-10-12 | Fin de l'étape 1 : [runbook de développement local](runbooks/local-development.md), section « Commandes » d'`AGENTS.md`, [retours d'expérience](lessons-learned/2026-10-etape-1-squelette.md) | 1 |
| 2026-10-12 | CI GitHub Actions (`check` : lint, formatage, types, tests ; `e2e` : Playwright sur PR et `main`), actions épinglées par SHA ; test E2E T1.1 | 1 |
| 2026-10-12 | Docker Compose : MongoDB 8.0 et Mailpit, ports liés à `127.0.0.1`, scripts `pnpm infra:up/down/logs` | 1 |
| 2026-10-12 | `apps/web` : Vue 3 + Vite + Router + Pinia + PrimeVue 4 + Tailwind, mise en page, clients tRPC et Socket.IO, page `health` ; tests T1.11 à T1.13 ; addendum à l'ADR-012 (PrimeVue 5 sous licence propriétaire : on reste en 4.5.5 MIT) | 1 |
| 2026-10-12 | `apps/api` : Fastify + tRPC (`health`) + Socket.IO sur le même serveur, config Zod, logs `redact`, Helmet, CORS ; tests T1.2, T1.3, T1.5 à T1.10 ; `.env.example` | 1 |
| 2026-10-12 | Début de l'étape 1 : outillage racine, `packages/shared` (schémas Zod `health` et pagination, T1.4) et [ADR-013](decisions/ADR-013-outillage-monorepo.md) | 1 |
| 2026-10-12 | Règles Claude Code par domaine (`.claude/rules/` : offres, cycle d'enchère, paiement, comptes, temps réel) | Préparation étapes 2, 4, 5, 6 |
| 2026-10-12 | Outillage qualité : gabarit de PR, Dependabot, permissions Claude Code (`.claude/settings.json`), checklist dans `CLAUDE.md` | Préparation étape 1 |
| 2026-10-12 | Scénarios de tests métier par étape (`business-tests.md`) | Préparation étapes 1–8 |
| 2026-10-12 | Suivi GitHub : 8 jalons, labels, 8 issues et projet kanban « Encheres — Roadmap » | Toutes |
| 2026-10-12 | Création du tableau de bord | — |
| 2026-10-12 | Ajout de `screens.md` et ADR-012 (PrimeVue) | Préparation étapes 1–2 |
| 2026-10-12 | Ajout de `security.md`, `testing.md`, ADR-011 | Préparation étapes 2, 4 |
| 2026-10-12 | Ajout de `api.md`, ADR-010 (tRPC) | Préparation étape 1 |
| 2026-10-12 | Ajout de `account.md`, ADR-009 | Préparation étape 2 |

## Règle de mise à jour (pour l'IA)

Lors de toute modification :
1. Cocher ou décocher les cases concernées dans [roadmap.md](roadmap.md), puis recalculer le tableau ci-dessus (cases cochées / cases totales par étape).
2. Mettre à jour « Étape en cours » et « État de la documentation ».
3. Ajouter une ligne à l'historique (date, changement, étapes touchées).
4. Faire ces mises à jour **dans le même commit** que la modification.
