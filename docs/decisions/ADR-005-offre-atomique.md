# ADR-005 : Offre atomique avec le champ `nextMinBid`

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Plusieurs acheteurs peuvent enchérir au même instant. Si le serveur lit l'enchère, vérifie les règles, puis écrit, deux offres peuvent passer les vérifications en même temps : l'une écrase l'autre, ou un montant trop bas est accepté.

La règle de montant dépend de l'état de l'enchère : `startingPrice` s'il n'y a aucune offre, sinon `currentPrice + minIncrement`. Ce n'est pas directement exprimable dans un filtre MongoDB simple.

## Décision
- Stocker sur chaque enchère le champ **`nextMinBid`** : le montant minimum de la prochaine offre.
  - À la création : `nextMinBid = startingPrice`.
  - À chaque offre acceptée : `nextMinBid = amount + minIncrement`.
- Placer une offre avec **un seul `findOneAndUpdate`**. Le filtre contient toutes les conditions (statut, `endsAt`, `nextMinBid ≤ amount`, pas le vendeur, pas déjà le meilleur enchérisseur). La mise à jour (update pipeline) applique le prix, l'enchérisseur, le nouveau `nextMinBid`, le compteur et la prolongation anti-sniping.
- Si la requête renvoie `null`, l'offre est refusée. Le serveur relit l'enchère pour renvoyer le code d'erreur précis.

Requête complète : [database.md](../technical/database.md).

## Conséquences
- ➕ Aucune course possible : MongoDB garantit l'atomicité sur un document. La première offre enregistrée gagne.
- ➕ Pas de transaction ni de verrou nécessaires.
- ➕ `nextMinBid` est envoyé tel quel au front (`bid:new`) pour pré-remplir le formulaire.
- ➖ Champ dérivé à maintenir : il ne doit être modifié **que** par cette requête.
- ➖ Le refus ne dit pas pourquoi ; il faut une seconde lecture pour le code d'erreur.

## Alternatives écartées
- **Lire, vérifier, puis écrire** : sujet aux courses.
- **Transactions MongoDB** : plus lourdes (replica set obligatoire), inutiles pour un seul document.
- **Condition `$expr` calculée dans le filtre** : possible, mais moins lisible, et le front aurait dû recalculer le minimum lui-même.
- **Verrou applicatif en mémoire** : ne fonctionne pas avec plusieurs instances serveur.
