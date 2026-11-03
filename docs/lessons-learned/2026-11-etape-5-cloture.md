# Étape 5 : pièges rencontrés

Problèmes non évidents rencontrés en codant la clôture. Format : **problème → cause → solution**.

## Clôture
- **Le gagnant se calcule dans la mise à jour, pas avant.** `winnerId` doit valoir le meilleur enchérisseur *au moment exact* de la transition : lire l'enchère puis écrire laisserait passer une offre entre les deux. La clôture est un seul `findOneAndUpdate` avec pipeline (`winnerId: '$currentBidderId'`, `paymentDeadline` conditionnelle avec `$type`), comme l'offre (ADR-005).
- **Offre et clôture s'excluent sans verrou.** L'offre exige `status: 'live'` et `endsAt > maintenant` ; la clôture exige `status: 'live'` et `endsAt ≤ maintenant`. Chacune est atomique sur le même document : l'une passe en premier, l'autre voit le résultat. Le test T5.13 le vérifie sur 15 tirages en lançant les deux en parallèle.
- **Seul le passage gagnant déclenche les effets.** Trois `closeDueAuctions` en parallèle sur la même enchère ne produisent qu'un `auction:ended` et qu'un email au gagnant. Revers connu : si le processus s'arrête entre la mise à jour et la mise en file des emails, la notification est perdue (l'état en base reste juste).
- **Un champ `null` n'est pas un champ absent.** Dans un pipeline, `$eq: [{ $type: '$currentBidderId' }, 'objectId']` distingue une offre existante d'un `null` ou d'un champ manquant, là où un test sur `$ne: null` dépend du type de comparaison.

## Remise en vente
- **Copier le document ne suffit pas, il faut copier les fichiers.** Deux enchères qui partagent une clé de photo se supprimeraient mutuellement les fichiers : retirer une photo du brouillon (`updateAuction` supprime du disque les photos retirées) effacerait celle de l'enchère d'origine. `storage.copy` donne de nouvelles clés.
- **Les dates d'origine sont passées.** Une copie à l'identique serait refusée par la règle « début dans le futur » : la remise en vente demande de nouvelles dates et les revalide.
- **« Terminée sans offre » se reconnaît à `winnerId`.** `ended` sans gagnant se remet en vente, `ended` avec gagnant attend son paiement et ne peut pas l'être.

## Front
- **`get` ou `find` pour tester l'absence.** `wrapper.get(...)` lève une erreur quand l'élément manque, et son résultat n'a pas de `.exists()` typé : utiliser `find(...).exists()` pour une assertion de présence ou d'absence.
- **La clôture n'a pas besoin de rechargement.** `auction:ended` suffit à passer l'enchère à terminée avec son gagnant et le prix final ; après une reconnexion, l'état est de toute façon rechargé (étape 4).
- **E2E de la clôture : la fin est avancée en base.** Une offre à moins de 2 minutes de la fin la prolonge, et la durée minimale est d'une heure : le test place ses offres, puis ramène `endsAt` à 6 secondes avec `mongosh` et laisse le job (1 s) clore l'enchère.
