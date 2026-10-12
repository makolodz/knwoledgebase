@AGENTS.md

## Checklist avant chaque commit
- Offre : une seule opération atomique MongoDB, anti-sniping compris ([database.md](docs/technical/database.md)).
- Rôle, email vérifié et suspension relus en base, jamais depuis le JWT seul.
- Prix, montants en centimes entiers ; dates en UTC.
- Passage à `paid` uniquement depuis le webhook Stripe, signature vérifiée.
- Aucun email ni donnée privée dans un événement Socket.IO.
- Entrées HTTP et Socket.IO validées avec Zod ; pas de `any`.
- Logique critique couverte par un test ([business-tests.md](docs/technical/business-tests.md)).
- Doc et [progress.md](docs/progress.md) mis à jour dans le même commit.
