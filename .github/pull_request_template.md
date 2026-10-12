## Quoi
<!-- Changement en une ou deux phrases. -->

## Pourquoi
<!-- Étape de la roadmap concernée, issue liée. -->

Closes #

## Checklist
- [ ] Tests ajoutés ou mis à jour pour la logique critique ([testing.md](../docs/technical/testing.md)) ; les scénarios de [business-tests.md](../docs/technical/business-tests.md) sont couverts.
- [ ] Règles de [AGENTS.md](../AGENTS.md) respectées : vérifications côté serveur, montants en centimes, pas d'email ni de donnée privée dans Socket.IO, pas de `any`.
- [ ] Entrées HTTP et Socket.IO validées avec Zod.
- [ ] Doc à jour dans le même commit (`docs/domain/` si une règle change, ADR si un choix structurant, [progress.md](../docs/progress.md)).
- [ ] Pas de secret ni de fichier `.env` dans le diff.
