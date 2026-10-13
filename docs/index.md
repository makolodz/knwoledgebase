# Index de la documentation

**Par où commencer : [roadmap.md](roadmap.md)** (étapes dans l'ordre et définition de « terminé »).
**Où en est le projet : [progress.md](progress.md)** (tableau de bord, mis à jour à chaque modification).

## Quel document lire ?

| Tâche | Document |
|---|---|
| Comprendre le projet, la stack, le monorepo | [architecture/overview.md](architecture/overview.md) |
| Suivre une offre, une clôture ou un paiement de bout en bout | [architecture/data-flow.md](architecture/data-flow.md) |
| Vocabulaire, noms de champs, rôles | [domain/glossary.md](domain/glossary.md) |
| Rôles, création d'enchère, offres, anti-sniping, paramètres, notifications | [domain/business-rules.md](domain/business-rules.md) |
| Statuts d'une enchère, ouverture, clôture, remise en vente | [domain/workflows/auction-lifecycle.md](domain/workflows/auction-lifecycle.md) |
| Paiement Stripe, impayés, remboursements | [domain/workflows/payment.md](domain/workflows/payment.md) |
| Inscription, connexion, vérification, mot de passe oublié, rôles, suspension, suppression (RGPD) | [domain/workflows/account.md](domain/workflows/account.md) |
| Code serveur (Fastify, services, jobs, webhook, emails, photos) | [technical/backend.md](technical/backend.md) |
| Procédures tRPC, routes HTTP, erreurs, pagination | [technical/api.md](technical/api.md) |
| Événements Socket.IO | [technical/realtime.md](technical/realtime.md) |
| Modèle de données, requête atomique d'offre, index | [technical/database.md](technical/database.md) |
| Sessions, JWT, limites anti-abus, CORS, secrets | [technical/security.md](technical/security.md) |
| Stratégie de tests, priorités, E2E | [technical/testing.md](technical/testing.md) |
| Écrans : routes, contenu, actions, états, wireframes | [technical/screens.md](technical/screens.md) |
| Front Vue | [technical/frontend.md](technical/frontend.md) |
| Lancer le projet en local, commandes, variables d'environnement, dépannage | [runbooks/local-development.md](runbooks/local-development.md) |
| Comprendre pourquoi un choix a été fait | [decisions/](decisions/) |
| Éviter un piège déjà rencontré (outils, dépendances, API) | [lessons-learned/](lessons-learned/2026-10-etape-1-squelette.md) |

## Décisions (ADR)

| ADR | Sujet |
|---|---|
| [ADR-001](decisions/ADR-001-stack-backend.md) | Stack backend : TypeScript, Fastify, Mongoose, Zod, monorepo pnpm |
| [ADR-002](decisions/ADR-002-frontend-vue.md) | Front en Vue 3 + Vite |
| [ADR-003](decisions/ADR-003-paiement-stripe.md) | Paiement par Stripe Checkout sur le compte de l'association |
| [ADR-004](decisions/ADR-004-anti-sniping.md) | Anti-sniping à un seul paramètre |
| [ADR-005](decisions/ADR-005-offre-atomique.md) | Offre atomique avec le champ `nextMinBid` |
| [ADR-006](decisions/ADR-006-emails-brevo.md) | Emails via Brevo (SMTP) et file d'envoi en base |
| [ADR-007](decisions/ADR-007-photos-disque-local.md) | Photos sur disque local, une seule instance d'API |
| [ADR-008](decisions/ADR-008-jobs-setinterval.md) | Tâches automatiques par `setInterval` |
| [ADR-009](decisions/ADR-009-comptes.md) | Comptes par email et mot de passe, anonymisation à la suppression |
| [ADR-010](decisions/ADR-010-api-trpc.md) | API en tRPC, sans OpenAPI |
| [ADR-011](decisions/ADR-011-sessions-jwt-refresh.md) | Sessions : JWT 15 min + refresh token en base |
| [ADR-012](decisions/ADR-012-ui-primevue.md) | Interface avec PrimeVue + Tailwind |
| [ADR-013](decisions/ADR-013-outillage-monorepo.md) | Outillage du monorepo : Node, TypeScript 6, `shared` en source, `.env` unique |

## Pas encore écrit
Ces documents **n'existent pas encore**. Ne pas supposer leur contenu ; demander ou proposer de les rédiger.
- `architecture/modules.md` : découpage des modules une fois le code en place
- `runbooks/deployment.md` : mise en production (étape 8)
