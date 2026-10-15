---
name: verifier-branche-a-jour
description: Vérifie que la branche courante est à jour avec origin/main avant d'ouvrir une pull request. À utiliser avant de créer une PR, ou quand l'utilisateur demande si sa branche est à jour.
---

Vérifie que la branche courante peut être proposée en pull request sans conflit de retard sur `main`.

1. **Branche** : lance `git branch --show-current`. Si c'est `main`, arrête-toi et signale-le : une PR doit partir d'une branche dédiée.

2. **Arbre de travail** : lance `git status --porcelain`. S'il reste des modifications non commitées, signale-les et arrête-toi.

3. **Mise à jour des refs distantes** : lance `git fetch origin main`. Ne modifie ni la branche courante ni `main`.

4. **Retard et avance** : lance `git rev-list --left-right --count origin/main...HEAD`. La sortie donne deux nombres : commits présents sur `origin/main` mais pas sur la branche (retard), puis commits présents sur la branche mais pas sur `origin/main` (avance).

5. **Conclusion** :
   - Retard = 0 : la branche est à jour. Indique l'avance (nombre de commits à proposer) et termine.
   - Retard > 0 : liste les commits manquants avec `git log --oneline HEAD..origin/main`, et signale les fichiers touchés en commun avec `git diff --name-only HEAD...origin/main`. Propose ensuite une mise à jour (`git merge origin/main` ou `git rebase origin/main`, selon ce que l'utilisateur préfère), sans l'exécuter sans confirmation.

6. **Test de conflit (lecture seule)** si retard > 0 : lance `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main`. Une sortie contenant des marqueurs de conflit (`<<<<<<<`) ou des lignes `changed in both` indique un conflit probable à résoudre avant la PR.

Restitue le résultat sous la forme : branche, état de l'arbre, retard, avance, conflit probable oui/non, et action proposée. N'ouvre jamais la PR toi-même dans ce skill.
