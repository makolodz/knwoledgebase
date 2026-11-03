# Rapports des tests de charge k6

1. Lectures publiques : [load-test.js](load-test.js)
2. Offres concurrentes sur une même enchère : [bids-concurrent.js](bids-concurrent.js)

## 1. Lectures publiques

Script : [load-test.js](load-test.js) · API en mode dev (`pnpm dev`, `tsx watch`) · MongoDB local (Docker) · client et serveur sur la même machine.

## Ce qui a été testé

Lecture seule, sans connexion, deux requêtes par itération :

- `GET /api/trpc/health`
- `GET /api/trpc/auction.list` (`page: 1, limit: 12`)

Profil de charge : montée à 50 utilisateurs virtuels (VUs) en 10 s, palier de 1 min, descente en 5 s. Chaque VU attend 1 s entre deux itérations.

## Résultats

| Mesure | Valeur |
|---|---|
| Durée totale | 1 min 15,9 s |
| Requêtes | 6 728 (≈ 88,7 / s) |
| Itérations | 3 364 (≈ 44,3 / s) |
| Échecs HTTP | 0 % (0 / 6 728) |
| Checks réussis | 100 % (`health 200`, `auction.list 200`) |
| Latence moyenne | 5,28 ms |
| Latence médiane | 4,54 ms |
| p90 / p95 | 10,35 ms / 12,81 ms |
| Latence max | 59,13 ms |
| Données reçues / envoyées | 7,1 Mo / 747 ko |

Seuils : `p(95) < 500 ms` **respecté** (12,81 ms) ; `taux d'erreur < 1 %` **respecté** (0 %).

## Analyse

- **L'API tient 50 utilisateurs en lecture sans effort.** La latence reste très basse et stable : l'écart entre la médiane (4,5 ms) et le p95 (12,8 ms) est faible, et le maximum (59 ms) ressemble à un pic isolé (démarrage à froid, ramassage mémoire), pas à une dégradation.
- **Aucune file d'attente côté serveur.** La durée moyenne d'une itération est de 1,01 s, soit la pause de 1 s plus environ 10 ms pour les deux requêtes. Si le serveur saturait, cette durée augmenterait.
- **Il reste de la marge.** Le test n'a pas cherché le point de rupture : 50 VUs avec une pause de 1 s est une charge modeste (≈ 89 requêtes par seconde).

## Limites de ce test

1. **Limite anti-abus relevée.** La limite globale de 300 requêtes par minute par IP, dans [app.ts](../apps/api/src/app.ts), a été portée à `100000` pour ce test. Sans cela, le test aurait reçu des 429 dès la première minute. **Ce changement ne doit pas être commité** : à remettre à `300` (`GLOBAL_RATE_LIMIT_PER_MINUTE`).
2. **Lectures uniquement.** Rien n'a été écrit en base : l'offre atomique est couverte par le test 2.
3. **Mode dev.** `tsx watch` n'est pas optimisé : les latences d'une version compilée seront probablement meilleures.
4. **Même machine pour k6, l'API et MongoDB.** Ils se partagent le CPU, et il n'y a aucune latence réseau : les chiffres sont optimistes sur ce point et pessimistes sur l'autre.
5. **Peu de données.** `auction.list` interroge une base de développement probablement presque vide. Avec des milliers d'enchères et leurs index, la latence sera plus élevée.
6. **Aucune authentification.** Les routes protégées (`authed`, `seller`) relisent l'utilisateur en base à chaque appel : leur coût n'est pas mesuré.

## Suite possible

- Remplir la base avec un volume réaliste (centaines d'enchères) et relancer `auction.list`.
- Augmenter la charge jusqu'à voir la latence monter (100, 200, 500 VUs) pour trouver le point de rupture.
- Mesurer les routes authentifiées (`auth.login`, `auth.me`), en tenant compte des limites de `services/rate-limits.ts`.
- Offres concurrentes sur une même enchère, avec vérification en base : fait, voir le test 2.

## 2. Offres concurrentes sur une même enchère

Script : [bids-concurrent.js](bids-concurrent.js) · mêmes conditions que le test 1 (API en dev, MongoDB local, tout sur la même machine).

### Procédure

```bash
pnpm --filter @encheres/api load:prepare
k6 run -e AUCTION_ID=<id affiché> -e USERS=50 --summary-export load/summary.json load/bids-concurrent.js
pnpm --filter @encheres/api load:verify <id> load/summary.json
```

`load:prepare` crée un vendeur et 50 acheteurs (domaine `.test`, comme le seed, refusé hors base locale) et une enchère `live` qui finit dans 90 s, donc à moins d'`antiSnipingMs` : chaque offre la prolonge. `load:verify` relit la base ([load-bids.ts](../apps/api/src/scripts/load-bids.ts), testé par `load-bids.test.ts`).

### Ce qui est testé

50 acheteurs, chacun avec sa session et son socket Socket.IO réel, suivent la même enchère pendant 30 s. Toutes les 250 à 350 ms, chacun offre le minimum annoncé par le serveur (`nextMinBid` du dernier `bid:new`) plus 0, 1 ou 2 pas : tous visent presque le même montant, donc se disputent chaque palier. Un acheteur qui vient de prendre la tête n'enchérit pas contre lui-même. Les acheteurs cessent d'enchérir 1 s avant la fin, pour que chaque offre envoyée ait reçu son ack.

### Résultats (30 s, 50 acheteurs)

Deux exécutions identiques, sur deux enchères différentes. La seconde (14 h 54) est la plus récente.

| Mesure | Exécution 1 | Exécution 2 (14 h 54) |
|---|---|---|
| Offres envoyées | 4 794 (≈ 141 / s) | 4 761 (≈ 133 / s) |
| Acceptées | 2 130 (≈ 63 / s) | 1 721 (≈ 48 / s) |
| Refusées `BID_TOO_LOW` | 2 664 | 3 040 |
| Autres refus, erreurs de socket | 0 | 0 |
| Part d'offres acceptées | 44 % | 36 % |
| Latence de l'ack (envoi → réponse) : moyenne | 18 ms | 28 ms |
| Latence de l'ack : médiane / p90 / p95 | — / — / 35 ms | 26 ms / 42 ms / 48 ms |
| Latence de l'ack : min / max | — / 156 ms | 9 ms / 152 ms |
| Messages Socket.IO reçus par les clients | 213 994 (≈ 6 300 / s) | 174 111 (≈ 4 900 / s) |
| Connexions WebSocket (101) | 50 / 50 | 50 / 50 |
| Connexion HTTP des 50 acheteurs (`auth.login`) | — | 50 / 50, 109 ms en moyenne |
| Vérifications k6 (`checks`) | 100 % | 100 % (100 / 100) |

Vérification en base de l'exécution 2 (`pnpm --filter @encheres/api load:verify 6ae9e72e83a07db291783adb load/summary.json`) :

- 1 721 offres dans `bids`, soit exactement le nombre d'acks « acceptée » vu par k6 ; `bidCount` de l'enchère vaut aussi 1 721 ;
- prix courant 267 100 centimes (2 671,00 €) ;
- verdict du script : **cohérent, aucune offre perdue, historique et enchère concordent**.

Vérification de l'exécution 1 (enchère `6ae9e180…`) : 2 130 offres en base pour 2 130 acks « acceptée », historique strictement croissant avec au moins un pas entre deux offres, deux offres consécutives jamais du même acheteur, `bidCount`, `currentPrice`, `currentBidderId` et `nextMinBid` conformes à la plus haute offre, `endsAt` égal à l'heure de la dernière offre + `antiSnipingMs`.

Seuils k6 des deux exécutions : `p(95) < 500 ms` (35 ms puis 48 ms), au moins une offre acceptée, aucun refus autre que `BID_TOO_LOW` ou `ALREADY_HIGHEST`, aucune erreur de socket : **tous respectés**.

### Analyse et limites

- **Aucune offre perdue ni fantôme** à 140 offres par seconde sur une seule enchère : l'opération atomique ([ADR-005](../docs/decisions/ADR-005-offre-atomique.md)) tient, et chaque refus est un montant trop bas, jamais une panne.
- **La limite de 5 offres par seconde et par acheteur n'est pas sollicitée** (environ 3 offres par seconde chacun) : elle reste couverte par T4.12.
- **Une seule enchère.** La contention est maximale ; plusieurs enchères en parallèle ne sont couvertes que par le test d'intégration T4.36.
- **Les emails « offre dépassée »** sont ajoutés à la file à chaque offre acceptée (2 130 ici), avec des adresses `.test`.
- **Mêmes réserves que le test 1** : mode dev, une seule machine, base presque vide.

### Ce que montre la seconde exécution

- **Le résultat est reproductible.** À débit d'offres quasi identique (≈ 135 offres par seconde), le compte est exact une seconde fois : aucune offre perdue ni fantôme, aucun refus autre que `BID_TOO_LOW`. Les 1 721 + 3 040 refus font bien les 4 761 offres envoyées.
- **Moins d'offres acceptées, c'est normal.** Les acheteurs visent presque le même montant : le nombre d'offres acceptées dépend de qui arrive en premier à chaque palier, pas d'une dégradation. Les 4 761 offres ont toutes reçu une réponse.
- **Les messages reçus suivent le nombre d'offres acceptées.** Chaque offre acceptée est diffusée deux fois aux 50 sockets (`bid:new` puis `auction:extended`, car l'enchère finit dans moins de 2 minutes) : 1 721 × 100 = 172 100, auxquels s'ajoutent les acks et les ping (174 111 en tout). Pour l'exécution 1 : 2 130 × 100 = 213 000 pour 213 994.
- **La latence de l'ack a un peu augmenté** (moyenne 18 → 28 ms, p95 35 → 48 ms), mais reste très loin du seuil de 500 ms ; le maximum est stable (≈ 150 ms). L'écart vient plutôt de la machine partagée (k6, API en `tsx watch`, MongoDB et le navigateur) que du code : il n'y a pas de tendance à la saturation.
- **La connexion des acheteurs coûte 109 ms en moyenne** (50 `auth.login`, dont le calcul du hash argon2, volontairement lent). Elle est faite avant la mesure, dans `setup()`.
- **Cas à surveiller** : l'enchère de l'exécution 2 était encore `live` au moment de la vérification (fin à 13 h 56 UTC, soit environ une minute plus tard). Elle est close ensuite par le job de clôture, comme celle de l'exécution 1 (`ended`).

