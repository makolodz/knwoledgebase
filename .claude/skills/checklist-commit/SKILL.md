---
name: checklist-commit
description: Vérifie les changements en cours contre la checklist avant commit de CLAUDE.md. À utiliser avant chaque commit ou quand l'utilisateur demande une revue avant commit.
---

Relis les changements en cours (`git diff` et `git diff --cached`, plus les fichiers non suivis pertinents) et vérifie chaque point de la checklist de [CLAUDE.md](../../../CLAUDE.md) :

1. **Offre** : une seule opération atomique MongoDB, anti-sniping compris ([database.md](../../../docs/technical/database.md)).
2. **Rôle, email vérifié et suspension** : relus en base, jamais depuis le JWT seul.
3. **Montants et dates** : montants en centimes entiers, dates en UTC.
4. **Paiement** : passage à `paid` uniquement depuis le webhook Stripe, avec signature vérifiée.
5. **Socket.IO** : aucun email ni donnée privée dans les événements.
6. **Validation et typage** : entrées HTTP et Socket.IO validées avec Zod, pas de `any`.
7. **Tests** : logique critique couverte par un test ([business-tests.md](../../../docs/technical/business-tests.md)).
8. **Doc** : [docs/progress.md](../../../docs/progress.md) et la doc concernée sont mises à jour dans le même commit.

Pour chaque point, indique : **OK**, **Non respecté** (avec le fichier et la ligne en `chemin:ligne`), ou **Non concerné** si le diff ne touche pas ce domaine. Ne corrige rien sans demande : restitue seulement le constat, puis propose les corrections.

Termine par une phrase de synthèse : prêt à committer, ou points bloquants à traiter.
