# Index de la documentation

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
| Événements Socket.IO | [technical/realtime.md](technical/realtime.md) |
| Modèle de données, requête atomique d'offre, index | [technical/database.md](technical/database.md) |
| Front Vue | [technical/frontend.md](technical/frontend.md) |
| Comprendre pourquoi un choix a été fait | [decisions/](decisions/) |

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

## Pas encore écrit
Ces documents **n'existent pas encore**. Ne pas supposer leur contenu ; demander ou proposer de les rédiger.
- `technical/api.md` : routes HTTP, format des erreurs
- `technical/testing.md` : stratégie de tests
- `technical/security.md` : auth, rôles, rate limiting, secrets
- `architecture/modules.md` : découpage des modules une fois le code en place
- `runbooks/local-development.md` : lancer le projet en local
- `lessons-learned/` : retours d'expérience
