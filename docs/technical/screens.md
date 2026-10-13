# Écrans

Une fiche par écran, plus un wireframe pour les écrans clés.
- Composants : **PrimeVue** (mode non stylé ou thème) + **Tailwind** ([ADR-012](../decisions/ADR-012-ui-primevue.md)).
- Les procédures citées sont dans [api.md](api.md), les règles dans [business-rules.md](../domain/business-rules.md).

Format d'une fiche : **Route** · **Accès** · **Données** (procédures) · **Contenu** · **Actions** · **États** (chargement, vide, erreur, cas particuliers).

## Règles communes
- Mise en page : en-tête (logo, recherche, liens selon le rôle, menu du compte), contenu, pied de page (CGU, contact).
- **Mobile d'abord** : tout écran fonctionne dès 360 px de large.
- Prix affichés en euros à partir des centimes (`Intl.NumberFormat('fr-FR')`), dates dans le fuseau du navigateur.
- Chaque liste a un état **chargement** (squelettes), **vide** (message + action) et **erreur** (message + réessayer).
- Codes d'erreur métier traduits en messages lisibles, au même endroit (`apps/web/src/i18n/errors.ts`).
- Accessibilité : navigation au clavier, labels sur tous les champs, contraste AA. Le prix et le compte à rebours sont annoncés aux lecteurs d'écran (`aria-live="polite"`).
- Une route protégée redirige vers `/login?redirect=…` si l'utilisateur n'est pas connecté, vers 404 si son rôle ne convient pas.

---

## Public

### Liste des enchères
- **Route** : `/` · **Accès** : public
- **Données** : `auction.list` (enchères `scheduled`, `live`, et `ended` récentes)
- **Contenu** : filtres (en cours / à venir / terminées), tri (fin proche, prix, récentes), grille de cartes : photo, titre, prix courant ou prix de départ, compte à rebours ou date de début, nombre d'offres.
- **Actions** : ouvrir une enchère, paginer.
- **États** : vide (« Aucune enchère en cours »), les cartes `live` ont un badge « En direct ».

```
┌──────────────────────────────────────────────────────┐
│ LOGO     [ Rechercher…        ]     Connexion  S'inscrire│
├──────────────────────────────────────────────────────┤
│ [En cours] [À venir] [Terminées]        Trier : Fin ▾ │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │  photo   │ │  photo   │ │  photo   │ │  photo   │   │
│ │ Titre    │ │ Titre    │ │ Titre    │ │ Titre    │   │
│ │ 45,00 €  │ │ 12,00 €  │ │ Départ   │ │ 80,00 €  │   │
│ │ ⏱ 02:14:05│ │ ⏱ 00:01:12│ │ 10 €     │ │ Terminée │   │
│ │ 7 offres │ │ 3 offres │ │ demain 9h│ │          │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                    ‹ 1 2 3 ›                           │
└──────────────────────────────────────────────────────┘
```

### Détail d'une enchère (écran central)
- **Route** : `/auctions/:id` · **Accès** : public (enchérir : connecté)
- **Données** : `auction.get`, `auction.bids`, puis Socket.IO (`bid:new`, `auction:extended`, `auction:ended`) via `useAuctionSocket`.
- **Contenu** : galerie photos, titre, description, vendeur (nom d'affichage), prix courant, offre minimale suivante, compte à rebours, historique des offres en direct (nom, montant, heure), indicateur de connexion temps réel.
- **Actions** :
  - Enchérir : champ pré-rempli avec `nextMinBid`, boutons rapides (+1 pas, +5 pas), confirmation si le montant dépasse 10× le prix courant.
  - Non connecté → bouton « Se connecter pour enchérir ».
  - Email non vérifié → message + « Renvoyer l'email ».
  - Vendeur de l'enchère ou admin → pas de formulaire, message explicatif.
- **États** :
  - « Vous êtes le meilleur enchérisseur » / « Vous avez été dépassé ».
  - Prolongation : animation brève + message « Prolongée de 2 min ».
  - `scheduled` : compte à rebours jusqu'au début, pas de formulaire.
  - `ended` / `paid` / `unpaid` : gagnant et prix final ; si c'est l'utilisateur → bouton « Payer ».
  - `cancelled` : bandeau « Enchère annulée » + motif.
  - Connexion temps réel perdue : bandeau « Reconnexion… », formulaire désactivé.

```
┌──────────────────────────────────────────────────────┐
│ ← Retour                                              │
│ ┌───────────────────────┐  Titre de l'objet           │
│ │                       │  Vendu par Marie D.         │
│ │        photo          │                             │
│ │                       │  Prix actuel     45,00 €    │
│ └───────────────────────┘  Fin dans      ⏱ 00:01:42   │
│ [▫][▫][▫][▫]               ● En direct                │
│                            ┌──────────────────────┐   │
│ Description                │ Votre offre (min 46 €)│   │
│ Lorem ipsum…               │ [ 46,00 € ] [+1][+5]  │   │
│                            │      [ Enchérir ]     │   │
│                            └──────────────────────┘   │
│                            Historique                 │
│                            Paul R.    45,00 €  14:02  │
│                            Léa M.     44,00 €  14:01  │
│                            Paul R.    40,00 €  13:58  │
└──────────────────────────────────────────────────────┘
```

### Connexion
- **Route** : `/login` · **Accès** : non connecté
- **Données** : `auth.login`
- **Contenu** : email, mot de passe, liens « Mot de passe oublié » et « Créer un compte ».
- **États** : erreur unique « Identifiants invalides », `RATE_LIMITED`, compte suspendu. Après succès → `redirect` ou `/`.

### Inscription
- **Route** : `/register` · **Accès** : non connecté
- **Données** : `auth.register`
- **Contenu** : email, nom d'affichage, mot de passe (indicateur de longueur ≥ 12), cases CGU et majorité.
- **États** : succès → redirection vers `/login` avec un message « Compte créé : consultez votre boîte mail pour vérifier votre adresse, puis connectez-vous ». Même message, sans session, si l'email existe déjà.

### Mot de passe oublié / réinitialisation
- **Routes** : `/forgot-password`, `/reset-password?token=…` · **Accès** : public
- **Données** : `auth.forgotPassword`, `auth.resetPassword`
- **États** : message identique que l'email existe ou non ; lien expiré ou déjà utilisé → message + nouveau lien.

### Vérification de l'email
- **Route** : `/verify-email?token=…` · **Accès** : public
- **Données** : `auth.verifyEmail` (et `profile.confirmEmailChange` pour un changement d'email)
- **États** : succès, lien expiré (bouton « Renvoyer »), déjà vérifié.

---

## Utilisateur connecté

### Profil
- **Route** : `/account` · **Accès** : connecté
- **Données** : `auth.me`, `profile.update`, `profile.changePassword`, `profile.changeEmail`, `profile.delete`
- **Contenu** : nom d'affichage, email (+ statut vérifié, bouton renvoyer), rôle, changement de mot de passe, changement d'email, zone « Supprimer mon compte ».
- **États** : suppression bloquée → liste des raisons (enchère en cours, paiement en attente…).

### Mes offres
- **Route** : `/account/bids` · **Accès** : connecté
- **Données** : `profile.myBids`
- **Contenu** : enchères sur lesquelles j'ai enchéri, ma meilleure offre, prix actuel, statut (« En tête », « Dépassé », « Gagnée », « Perdue »).

### Mes enchères gagnées
- **Route** : `/account/wins` · **Accès** : connecté
- **Données** : `profile.myWins`
- **Contenu** : enchères gagnées, prix final, statut de paiement, échéance (`paymentDeadline`), bouton « Payer ».

### Paiement et retour
- **Routes** : bouton « Payer » → redirection Stripe ; retour sur `/payments/:auctionId/return`
- **Données** : `payment.checkout`, `payment.status`
- **États** : en attente de confirmation (interroge `payment.status` quelques secondes), payé, échec ou annulé (bouton réessayer), délai dépassé. Le statut vient **toujours** de l'API.

---

## Vendeur

### Mes enchères
- **Route** : `/seller/auctions` · **Accès** : `seller`
- **Données** : `auction.mine`
- **Contenu** : tableau (PrimeVue DataTable) : titre, statut, prix, offres, dates ; filtres par statut.
- **Actions** : créer, modifier (`draft` / `scheduled`), annuler, remettre en vente, voir.
- **États** : refusée → motif affiché.

### Création / modification d'une enchère
- **Routes** : `/seller/auctions/new`, `/seller/auctions/:id/edit` · **Accès** : `seller` (propriétaire)
- **Données** : `auction.create`, `auction.update`, `POST /api/uploads/images`
- **Contenu** : titre, description, photos (1 à 5, glisser-déposer, réordonnables), prix de départ, pas minimum (pré-rempli avec `defaultMinIncrement`), dates de début et de fin.
- Enregistrer crée ou met à jour l'enchère en `draft`, qui part directement en validation admin.
- **États** : validation en direct (durée min/max, montants), upload en cours / en erreur par photo, avertissement « La modification renverra l'enchère en validation » si `scheduled`.

```
┌──────────────────────────────────────────────────────┐
│ Nouvelle enchère                                      │
│ Titre        [_____________________________]          │
│ Description  [_____________________________]          │
│              [_____________________________]          │
│ Photos       ┌────┐┌────┐┌────┐┌ ─ ─ ┐                │
│              │ ▫  ││ ▫  ││ ▫  ││ +   │  1 à 5 photos  │
│              └────┘└────┘└────┘└ ─ ─ ┘                │
│ Prix de départ [ 10,00 € ]   Pas minimum [ 1,00 € ]   │
│ Début [ 12/10/2026 18:00 ]   Fin [ 19/10/2026 18:00 ] │
│                                                       │
│                     [ Enregistrer ]                   │
└──────────────────────────────────────────────────────┘
```

---

## Admin

### Enchères à valider
- **Route** : `/admin/auctions/pending` · **Accès** : `admin`
- **Données** : `admin.pendingAuctions`, `admin.validate`, `admin.reject`
- **Contenu** : liste des enchères `draft` (toute enchère `draft` attend la validation), aperçu complet de l'enchère.
- **Actions** : valider, refuser (motif obligatoire).

### Toutes les enchères
- **Route** : `/admin/auctions` · **Accès** : `admin`
- **Données** : `auction.list` (tous statuts), `admin.cancelAuction`, `admin.reassign`
- **Actions** : annuler (motif obligatoire, confirmation), réattribuer une `unpaid` au 2e enchérisseur, remettre en vente.

### Utilisateurs
- **Route** : `/admin/users` · **Accès** : `admin`
- **Données** : `admin.users`, `admin.setRole`, `admin.suspend`, `admin.unsuspend`, `admin.deleteUser`
- **Contenu** : tableau (nom, email, rôle, vérifié, suspendu, date d'inscription), recherche.
- **États** : actions bloquées affichées avec leur raison (dernier admin, enchère en cours…).

### Paramètres
- **Route** : `/admin/settings` · **Accès** : `admin`
- **Données** : `admin.getSettings`, `admin.updateSettings`
- **Contenu** : les paramètres de [business-rules.md](../domain/business-rules.md) avec unités lisibles (euros, minutes, heures, jours) ; rappel « ne s'applique pas rétroactivement ».

---

## Transverses
- **404** : `/:pathMatch(.*)*` — message + retour à l'accueil.
- **Devenir vendeur** : `/become-seller` — explication et coordonnées de l'association.
- **CGU** : `/terms` — texte statique (contenu à fournir par l'association).
