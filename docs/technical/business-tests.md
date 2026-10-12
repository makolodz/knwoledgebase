# Tests métier par étape

Scénarios d'acceptation, un ou plusieurs par étape de la [roadmap](../roadmap.md). Ils décrivent **ce que le produit doit faire**, et se traduisent en tests Vitest (intégration sur base réelle, voir [testing.md](testing.md)) ou en tests Playwright (E2E).

Les règles viennent de [business-rules.md](../domain/business-rules.md) et des workflows : ce document ne les recopie pas, il les vérifie. En cas de doute, les règles font foi.

Convention :
- **ID** : `T<étape>.<n>` (ex. `T4.3`).
- **Niveau** : `Int` (intégration, `apps/api/test/`), `Unit`, `Comp` (composant), `E2E`.
- Une case cochée signifie : test écrit et vert.

---

## Étape 1 — Squelette

| ID | Niveau | Scénario |
|---|---|---|
| T1.1 | E2E | `pnpm dev` lance l'API et le front ; le front affiche la réponse de `health`. |
| T1.2 | Int | `health` répond sans authentification. |
| T1.3 | Int | Une requête sans `Content-Type` ou au mauvais format est refusée proprement (pas de 500). |
| T1.4 | Unit | Une entrée invalide est rejetée par son schéma Zod, dans `packages/shared`. |
| T1.5 | Int | Les logs n'affichent jamais les champs `password`, `token`, `authorization` (`redact`). |
| T1.6 | Int | Les en-têtes de sécurité Helmet sont présents sur toute réponse, erreurs comprises. |
| T1.7 | Int | CORS : seule l'origine `WEB_ORIGIN` est autorisée, avec `credentials` ; une autre origine ne reçoit pas `Access-Control-Allow-Origin`. |
| T1.8 | Int | Socket.IO répond sur le même port que HTTP ; une origine de navigateur étrangère est refusée ; l'arrêt du serveur est propre. |
| T1.9 | Unit | Configuration invalide : le serveur refuse de démarrer, sans afficher la valeur fautive. |
| T1.10 | Int | Aucune réponse d'erreur ne contient de stack trace ni de chemin de fichier. |

## Étape 2 — Comptes et sessions

Règles : [account.md](../domain/workflows/account.md).

| ID | Niveau | Scénario |
|---|---|---|
| T2.1 | Int | Inscription : rôle `buyer`, `emailVerifiedAt` nul, mot de passe hashé (argon2id), utilisateur connecté. |
| T2.2 | Int | Inscription sans case « majeur » ou sans CGU : refusée. |
| T2.3 | Int | Mot de passe de 11 caractères refusé, 12 accepté. |
| T2.4 | Int | Inscription avec un email existant : réponse identique à une inscription réussie, et un email « tentative » part dans la file. |
| T2.5 | Int | Email normalisé (majuscules et espaces) : `Ana@X.fr ` et `ana@x.fr` sont le même compte. |
| T2.6 | Int | Lien de vérification : valable 24 h, utilisable une seule fois, token stocké hashé. |
| T2.7 | Int | Demande d'un nouveau lien : refusée si la précédente date de moins d'une minute ; l'ancien lien devient invalide. |
| T2.8 | Int | Connexion : même message d'erreur pour un email inconnu et un mauvais mot de passe. |
| T2.9 | Int | Un compte suspendu ou supprimé ne peut pas se connecter. |
| T2.10 | Int | Réinitialisation du mot de passe : lien valable 1 h, usage unique, toutes les sessions fermées après coup. |
| T2.11 | Int | Refresh token réutilisé après rotation : toutes les sessions de l'utilisateur sont révoquées. |
| T2.12 | Int | Changement d'email : l'email ne change qu'après clic sur le lien envoyé à la nouvelle adresse. |
| T2.13 | Int | Changement de mot de passe : demande le mot de passe actuel, ferme les autres sessions. |
| T2.14 | Int | Procédure `seller` appelée par un `buyer` : refusée ; rôle relu en base (un JWT périmé ne suffit pas). |
| T2.15 | Int | Attribution du rôle `seller` ou `admin` : seul un admin y arrive. |
| T2.16 | Int | Retrait du rôle `seller` : refusé si une enchère est `scheduled` ou `live` ; les `draft` passent `cancelled`. |
| T2.17 | Int | Le dernier admin ne peut ni perdre son rôle, ni être supprimé. |
| T2.18 | Int | Limite anti-abus : après N échecs de connexion, la tentative est ralentie ou bloquée. |
| T2.19 | E2E | Inscription → email lu dans Mailpit → clic → connexion. |

## Étape 3 — Création et modération

Règles : [business-rules.md](../domain/business-rules.md) (« Création d'une enchère »), [auction-lifecycle.md](../domain/workflows/auction-lifecycle.md).

| ID | Niveau | Scénario |
|---|---|---|
| T3.1 | Unit | `title` de 2 ou 121 caractères refusé ; 3 et 120 acceptés. |
| T3.2 | Int | `startingPrice` de 99 refusé, 100 accepté. |
| T3.3 | Int | `startsAt` dans le passé refusé. |
| T3.4 | Int | Durée `endsAt − startsAt` inférieure à `minDurationMs` ou supérieure à `maxDurationMs` : refusée. |
| T3.5 | Int | Upload : 0 photo refusée, 6 refusées, 5 acceptées. |
| T3.6 | Int | Upload d'un fichier dont le contenu n'est pas une image (renommé en `.jpg`) : refusé. |
| T3.7 | Int | Image uploadée : nom de fichier généré par le serveur (UUID), EXIF absentes du fichier stocké. |
| T3.8 | Int | Modifier une enchère `scheduled` la repasse en `draft`. |
| T3.9 | Int | Modifier ou annuler une enchère `live` : refusé pour le vendeur, et pour l'admin (il peut seulement annuler). |
| T3.10 | Int | Un vendeur ne peut modifier que ses propres enchères. |
| T3.11 | Int | Admin refuse une enchère sans `cancelReason` : refusé ; avec motif : `cancelled`, email au vendeur. |
| T3.12 | Int | Admin valide une `draft` : elle passe `scheduled`, devient visible publiquement. |
| T3.13 | Int | Une enchère `draft` n'apparaît jamais dans la liste publique. |
| T3.14 | Int | Liste publique paginée, sans email du vendeur (seul `name`). |
| T3.15 | Int | Job `scheduled → live` à `startsAt`, deux passages successifs ne produisent qu'un seul effet. |
| T3.16 | E2E | Vendeur crée avec photos → admin valide → l'enchère est publique → passe `live` à l'heure. |

## Étape 4 — Offres en temps réel

Règles : [business-rules.md](../domain/business-rules.md) (« Placer une offre », « Anti-sniping »). Les priorités de [testing.md](testing.md) sont reprises ici.

### Vérifications d'une offre

| ID | Niveau | Scénario |
|---|---|---|
| T4.1 | Int | Non connecté → `NOT_AUTHENTICATED`. |
| T4.2 | Int | Admin → `FORBIDDEN`. |
| T4.3 | Int | Email non vérifié → `EMAIL_NOT_VERIFIED`. |
| T4.4 | Int | Compte suspendu → `ACCOUNT_SUSPENDED`, offres déjà placées toujours valides. |
| T4.5 | Int | Enchère `scheduled`, `ended`, `cancelled` → `AUCTION_NOT_LIVE`. |
| T4.6 | Int | Offre à `endsAt` exactement ou après → `AUCTION_NOT_LIVE` (l'heure serveur fait foi). |
| T4.7 | Int | Vendeur sur sa propre enchère → `OWN_AUCTION`. |
| T4.8 | Int | Meilleur enchérisseur qui surenchérit sur lui-même → `ALREADY_HIGHEST`. |
| T4.9 | Int | Montant inférieur à `nextMinBid` → `BID_TOO_LOW`. |
| T4.10 | Int | Montant décimal ou négatif → `INVALID_AMOUNT`. |
| T4.11 | Int | Premier offre : `nextMinBid = startingPrice` ; ensuite `amount + minIncrement`. |
| T4.12 | Int | Plus de 5 offres en une seconde pour un utilisateur → `RATE_LIMITED`. |
| T4.13 | Int | Une offre acceptée n'est jamais modifiable ni annulable (aucune procédure ne le permet). |

### Offres simultanées (priorité 1)

| ID | Niveau | Scénario |
|---|---|---|
| T4.14 | Int | 50 offres parallèles au même montant : une seule acceptée, les autres `BID_TOO_LOW`. |
| T4.15 | Int | 50 offres parallèles à montants différents : `currentPrice` est le plus haut accepté, `nextMinBid` cohérent. |
| T4.16 | Int | Aucune offre acceptée n'est absente de `bids` (compte des acceptées = compte des documents). |
| T4.17 | Int | Deux offres quasi simultanées de deux utilisateurs : la première enregistrée gagne, la seconde reçoit `BID_TOO_LOW`. |

### Anti-sniping (priorité 3)

| ID | Niveau | Scénario |
|---|---|---|
| T4.18 | Int | Offre à moins de 2 min de `endsAt` : `endsAt = maintenant + antiSnipingMs`, `auction:extended` émis à la room. |
| T4.19 | Int | Offre à plus de 2 min de `endsAt` : `endsAt` inchangé, pas d'`auction:extended`. |
| T4.20 | Int | Prolongations successives sans limite : chaque offre repousse la fin, et l'enchère finit par se clôturer. |
| T4.21 | Int | Changer `antiSnipingMs` ne modifie pas les enchères déjà en cours. |

### Temps réel et socket

| ID | Niveau | Scénario |
|---|---|---|
| T4.22 | Int | Handshake Socket.IO sans token valide : connexion refusée. |
| T4.23 | Int | Une offre acceptée est diffusée à tous les clients de la room `auction:<id>`, et à personne d'autre. |
| T4.24 | Int | Aucun événement Socket.IO ne contient d'email ni de donnée privée (vérifié sur le contenu des messages). |
| T4.25 | Int | Ancien meilleur enchérisseur dépassé : reçoit `bid:new` et un email « offre dépassée » via la file. |
| T4.26 | Comp | Le compte à rebours se met à jour et le formulaire refuse un montant sous le minimum. |
| T4.27 | E2E | Deux navigateurs enchérissent : chacun voit les offres de l'autre en direct, et une offre de dernière minute prolonge l'enchère chez les deux. |

## Étape 5 — Clôture

Règles : [auction-lifecycle.md](../domain/workflows/auction-lifecycle.md) (« Clôture »).

| ID | Niveau | Scénario |
|---|---|---|
| T5.1 | Int | Job : `live → ended` dès que `endsAt ≤ maintenant`, pas avant. |
| T5.2 | Int | Avec au moins une offre : `winnerId = currentBidderId`, prix final = `currentPrice`, `paymentDeadline = maintenant + paymentDelayMs`. |
| T5.3 | Int | Sans offre : `ended` sans gagnant (état final), aucun `paymentDeadline`. |
| T5.4 | Int | `auction:ended` émis à la room une seule fois, même si le job tourne deux fois. |
| T5.5 | Int | Emails : gagnant (lien de paiement) et vendeur ; sans offre, seulement le vendeur. |
| T5.6 | Int | Remise en vente : nouveau `draft` sans offres, document d'origine intact. Refusée depuis `live` et `scheduled`. |
| T5.7 | Int | Espace utilisateur : « mes offres » et « mes gains » listent les bonnes enchères et uniquement celles de l'utilisateur. |
| T5.8 | Int | Données d'un autre utilisateur inaccessibles (offres, gains). |
| T5.9 | E2E | Une enchère se clôture seule à l'heure, le gagnant le voit en direct et reçoit l'email. |

## Étape 6 — Paiement

Règles : [payment.md](../domain/workflows/payment.md).

| ID | Niveau | Scénario |
|---|---|---|
| T6.1 | Int | Seul le gagnant peut créer une Checkout Session ; un autre utilisateur est refusé. |
| T6.2 | Int | Montant de la session = prix final en centimes, devise `eur`, `metadata = { auctionId, userId }`. |
| T6.3 | Int | Deux demandes de paiement : une seule session ouverte est créée, la seconde réutilise la première. |
| T6.4 | Int | `expires_at` ne dépasse jamais `paymentDeadline` ni les limites Stripe. |
| T6.5 | Int | Webhook avec signature invalide : refusé, aucun changement d'état. |
| T6.6 | Int | Webhook `checkout.session.completed` avec `payment_status === 'paid'` : enchère `ended → paid`. |
| T6.7 | Int | Même événement reçu deux fois : un seul passage à `paid`, un seul paiement enregistré. |
| T6.8 | Int | Webhook avec `payment_status` autre que `paid` : pas de passage à `paid`. |
| T6.9 | Int | La page de retour ne modifie jamais le statut. |
| T6.10 | Int | Sans paiement à `paymentDeadline` : `ended → unpaid`, vendeur et admin notifiés. |
| T6.11 | Int | Rappel envoyé 24 h avant `paymentDeadline`, une seule fois. |
| T6.12 | Int | Paiement reçu pour une enchère `unpaid` dont le payeur est toujours `winnerId` : accepté, passe `paid`. |
| T6.13 | Int | Paiement reçu après réattribution : enregistré, admin alerté. |
| T6.14 | Int | Réattribution par l'admin : 2e meilleur enchérisseur **distinct**, montant de sa meilleure offre, nouveau `paymentDeadline`, `paymentReminderSentAt` remis à `null`. |
| T6.15 | Int | Réattribution depuis un état autre que `unpaid` : refusée. |
| T6.16 | E2E | Gagnant paie avec la carte de test `4242 4242 4242 4242`, l'enchère passe `paid` via le webhook (relayé par `stripe listen`). |

## Étape 7 — Administration et RGPD

Règles : [business-rules.md](../domain/business-rules.md) (« Rôles »), [account.md](../domain/workflows/account.md) (« Suppression »).

| ID | Niveau | Scénario |
|---|---|---|
| T7.1 | Int | Admin suspend un compte : sessions fermées, connexion refusée, offres refusées avec `ACCOUNT_SUSPENDED`. |
| T7.2 | Int | Levée de suspension : le compte peut à nouveau se connecter et enchérir. |
| T7.3 | Int | Dernier admin : impossible de retirer son rôle ou de le supprimer. |
| T7.4 | Int | Admin annule une enchère `live` : `cancelReason` obligatoire, `cancelled`, enchérisseurs notifiés, aucun paiement créé. |
| T7.5 | Int | Modification des paramètres : s'applique aux nouvelles enchères et aux prochaines offres, jamais rétroactivement. |
| T7.6 | Int | Paramètres modifiables par admin uniquement. |
| T7.7 | Int | Suppression refusée si l'utilisateur est meilleur enchérisseur d'une enchère `live`. |
| T7.8 | Int | Suppression refusée si l'utilisateur est gagnant d'une enchère `ended` ou `unpaid` non payée. |
| T7.9 | Int | Suppression refusée si l'utilisateur est vendeur d'une enchère `scheduled` ou `live`. |
| T7.10 | Int | Suppression réussie : email `null`, nom « Utilisateur supprimé », `passwordHash` `null`, sessions et tokens supprimés. |
| T7.11 | Int | Après suppression : `bids` et `payments` conservés et toujours liés à `userId`. |
| T7.12 | Int | Après suppression : brouillons du vendeur supprimés avec leurs photos ; autres enchères conservées avec vendeur « Utilisateur supprimé ». |
| T7.13 | E2E | Parcours admin complet : suspension, annulation d'une enchère `live`, modification d'un paramètre. |

## Étape 8 — Finitions et mise en production

| ID | Niveau | Scénario |
|---|---|---|
| T8.1 | E2E | Parcours critiques de bout en bout : inscription, création, validation, enchère croisée, clôture, paiement, admin. |
| T8.2 | Int | Chaque procédure `seller` ou `admin` est refusée aux autres rôles (test de permissions exhaustif). |
| T8.3 | Int | Les données d'un autre utilisateur sont inaccessibles, procédure par procédure. |
| T8.4 | Int | Réponses d'erreur sans trace de pile ni détail interne en production. |
| T8.5 | Int | Upload refusé pour un fichier trop lourd (plus de 5 Mo) ou au mauvais type. |
| T8.6 | Int | Sauvegarde et restauration : les enchères, offres et paiements sont retrouvés à l'identique (runbook de déploiement). |
