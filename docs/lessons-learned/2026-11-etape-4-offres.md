# Étape 4 : pièges rencontrés

Problèmes non évidents rencontrés en codant les offres en temps réel. Format : **problème → cause → solution**.

## Offre atomique
- **Mongoose 9 refuse un pipeline dans `findOneAndUpdate` sans `updatePipeline: true`.** La requête de [database.md](../technical/database.md) doit porter cette option, sinon le tableau est pris pour un opérateur d'update et rejeté.
- **Les nouvelles valeurs n'ont pas besoin d'être relues.** Avec `returnDocument: 'before'`, on obtient l'ancien meilleur enchérisseur (à prévenir par email) et l'ancienne `endsAt`. `nextMinBid`, `bidCount` et la prolongation se déduisent de la même heure `now` que celle du filtre, sans seconde lecture.
- **Le code de refus se détermine après coup, dans l'ordre de business-rules.md.** Si l'état a encore changé entre le refus et la relecture, `BID_TOO_LOW` est la bonne réponse : une autre offre est arrivée avant.
- **`bids` n'est pas dans la même opération que `auctions`** (pas de transaction sur un MongoDB seul). Un plantage entre les deux laisserait une offre sans ligne d'historique ; l'enchère reste la référence du prix et du gagnant.

## Socket.IO
- **« Visiteur » et « jeton invalide » sont deux cas différents au handshake.** Pas de cookie : accepté (il suit les offres, `NOT_AUTHENTICATED` s'il enchérit). Cookie invalide : refusé. Hors production le secret JWT change à chaque redémarrage de l'API : un navigateur déjà connecté voit donc son socket refusé ; le front renouvelle la session puis se reconnecte une fois (`renewSessionOnAuthError`).
- **Le socket garde l'identité du handshake.** Il ne voit pas qu'un cookie a été renouvelé ou retiré : le front le reconnecte à chaque changement d'utilisateur, et un JWT expiré en cours de route donne `NOT_AUTHENTICATED` à l'offre, ce qui déclenche un renouvellement puis un seul nouvel essai.
- **Un client peut omettre l'ack.** Le serveur ne rappelle l'ack que s'il existe, sinon l'appel lèverait une exception dans le handler.
- **Rejoindre la room avant de charger l'enchère.** Dans l'autre ordre, une offre arrivée entre la lecture et le `join` serait perdue. Le front rejoint, puis recharge, à chaque connexion.
- **Le limiteur de tests est figé dans une même seconde.** `rateLimitClock` ne bouge pas pendant un test : un même utilisateur ne peut pas y placer plus de 5 offres. Les tests de 50 offres simultanées passent par le service avec 50 utilisateurs, et ceux qui multiplient les offres d'un utilisateur par `placeBid`.

## Tests
- **Un test d'anti-sniping ne doit pas dépendre de l'horloge réelle.** `placeBid` accepte `now` : les cas « à `endsAt` exactement », « une milliseconde avant » et les 12 prolongations successives sont déterministes.
- **Le fait qu'une `Promise.all` de 50 offres soit « simultanée » dépend de Mongoose**, qui les envoie sur plusieurs connexions du pool. C'est suffisant pour que MongoDB les sérialise sur le document ; un seul gagnant par montant est bien observé.
- **`docker compose` est nécessaire au test E2E T4.27** : il insère l'enchère avec `mongosh` dans le conteneur. Docker Desktop doit tourner et `pnpm infra:up` avoir été lancé.
