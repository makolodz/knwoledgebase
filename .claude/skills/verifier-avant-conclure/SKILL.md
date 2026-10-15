---
name: verifier-avant-conclure
description: Lance les quatre vérifications exigées par AGENTS.md avant de conclure une tâche (lint, format, typecheck, tests) et résume les échecs. À utiliser en fin de tâche, avant de déclarer le travail terminé.
---

Lance les quatre commandes depuis la racine du dépôt, dans cet ordre. Utilise le Bash tool, en préfixant la commande avec la configuration Node 22 décrite dans [docs/runbooks/local-development.md](../../../docs/runbooks/local-development.md) si Node n'est pas la bonne version :

1. `pnpm lint`
2. `pnpm format:check`
3. `pnpm typecheck`
4. `pnpm test`

Règles d'exécution :

- Lance-les même si une étape précédente échoue, pour avoir l'état complet.
- Ne lance pas `pnpm format` ni `pnpm lint --fix` automatiquement : si `format:check` échoue, signale-le et propose la correction.
- Ne lance pas `pnpm test:e2e` : ce n'est pas exigé par AGENTS.md avant chaque conclusion. Mentionne-le seulement si le changement touche un parcours utilisateur.

Pour chaque étape, indique **réussie** ou **échouée**. En cas d'échec, cite les erreurs principales (fichier, ligne, message) sans recopier toute la sortie, et explique la cause probable si elle est évidente.

Termine par un verdict clair :
- **Tâche prête à conclure** si les quatre étapes passent.
- **Tâche non conclue** sinon, avec la liste des étapes en échec.

Ne déclare jamais la tâche terminée si une étape a échoué ou n'a pas été lancée.
