# AGENTS.md

Plateforme d'enchères en direct pour une association : des vendeurs proposent des objets, des acheteurs enchérissent en temps réel, le gagnant paie via Stripe.

Stack : TypeScript strict · Node.js 22 LTS · Fastify + tRPC · Socket.IO 4 · MongoDB + Mongoose · Vue 3 + Vite + Pinia + PrimeVue + Tailwind · Stripe Checkout · Brevo (SMTP) · photos sur disque + sharp · monorepo pnpm.

## Avant de coder
Pour toute page, suis sa fiche dans [docs/technical/screens.md](docs/technical/screens.md).
Repère l'étape en cours dans [docs/roadmap.md](docs/roadmap.md) et respecte sa définition de « terminé ».
Lis [docs/index.md](docs/index.md), puis les documents liés à ta tâche.
En cas de conflit entre documents, [docs/domain/business-rules.md](docs/domain/business-rules.md) fait foi.

## Règles non négociables
- **Le serveur est la source de vérité** : ne jamais faire confiance au client pour un prix, une heure ou un rôle.
- Rôle, vérification de l'email et suspension : **toujours relus en base** avant une action sensible, jamais depuis le JWT seul.
- Montants en **centimes (entiers)**, dates en **UTC**.
- Une offre = **une seule opération atomique** MongoDB, prolongation anti-sniping comprise ([database.md](docs/technical/database.md)).
- Une enchère passe à `paid` **uniquement** via le webhook Stripe, dont la signature est vérifiée.
- **Jamais d'email** ni de donnée privée dans les événements Socket.IO.
- Emails : toujours via la file `emails`, jamais d'envoi direct. Disque, SMTP et Stripe : toujours via `apps/api/src/infra/`.
- Fichiers uploadés : nom généré par le serveur (UUID), type vérifié sur le contenu, EXIF supprimées.
- Valider toute entrée (HTTP et Socket.IO) avec Zod. Types et schémas partagés dans `packages/shared`.
- TypeScript strict, pas de `any`.
- Aucune nouvelle dépendance sans justification. Si le choix est structurant, rédiger un ADR.
- Ne pas contredire une décision de [docs/decisions/](docs/decisions/) sans le signaler explicitement.

- Toute modification de logique critique arrive avec ses tests ([testing.md](docs/technical/testing.md)). Pas de mock de MongoDB.

## Tenir la doc à jour
- Une règle métier change → mettre à jour `docs/domain/` dans le même commit.
- Nouveau choix structurant → nouvel ADR dans `docs/decisions/` (format de [ADR-001](docs/decisions/ADR-001-stack-backend.md)).
- Problème non évident résolu → note dans `docs/lessons-learned/`.
- Un fait est écrit à **un seul endroit** ; les autres documents pointent vers lui.

## Commandes
Pas encore de code : les commandes (install, dev, test, lint) seront ajoutées ici.
