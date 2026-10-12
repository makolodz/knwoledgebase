# ADR-008 : Tâches automatiques par `setInterval` qui interroge la base

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Plusieurs actions dépendent de l'heure : ouvrir et clôturer les enchères, rappeler et faire expirer les paiements, envoyer les emails de la file ([ADR-006](ADR-006-emails-brevo.md)). Contraintes :
- ne rien perdre après un redémarrage ;
- ne pas ajouter d'infrastructure.

La **clôture n'a pas besoin d'être exacte à la milliseconde** : une offre arrivée après `endsAt` est de toute façon refusée par la requête atomique ([ADR-005](ADR-005-offre-atomique.md)). Le délai du job retarde seulement l'envoi de `auction:ended`.

## Décision
Chaque job est une boucle `setInterval` dans `apps/api/src/jobs/` :

| Job | Intervalle |
|---|---|
| Ouverture (`scheduled → live`) | **1 s** |
| Clôture (`live → ended`) | **1 s** |
| Envoi des emails de la file | **5 s** |
| Rappel de paiement | **1 min** |
| Expiration du paiement (`ended → unpaid`) | **1 min** |

Règles :
- À chaque passage, le job traite **tous** les documents dus, un par un, avec un `findOneAndUpdate` conditionné par le statut et la date, jusqu'à ce que la requête renvoie `null`.
- **Seule l'exécution qui a réussi la mise à jour** déclenche les effets : événements Socket.IO, ajout d'emails à la file.
- Un passage ne démarre jamais tant que le précédent n'est pas terminé (drapeau « en cours »).
- Une erreur est loggée et le passage suivant réessaie : le job ne s'arrête jamais.
- À l'arrêt du serveur, les intervalles sont arrêtés proprement.

## Conséquences
- ➕ Aucune dépendance ; rattrapage automatique après un redémarrage, car tout repose sur les dates en base.
- ➕ Correct même avec plusieurs instances, grâce aux mises à jour atomiques (aujourd'hui une seule instance, voir [ADR-007](ADR-007-photos-disque-local.md)).
- ➖ Quelques requêtes par seconde, négligeables avec les index de [database.md](../technical/database.md).
- ➖ Les relances sont à coder soi-même (déjà prévu pour les emails).
- ➖ Pas de tableau de bord des jobs : la supervision passe par les logs.

## Alternatives écartées
- **Agenda** (jobs dans MongoDB) : maintenance du projet irrégulière, donc risque de dette technique.
- **BullMQ** (Redis) : très robuste, mais Redis en plus et surdimensionné.
- **Un `setTimeout` par enchère** : à reprogrammer à chaque prolongation et à reconstruire au redémarrage, donc fragile.
- **Cron externe** : granularité à la minute, trop lente pour la clôture.
