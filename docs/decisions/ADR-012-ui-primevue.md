# ADR-012 : Interface avec PrimeVue + Tailwind

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
L'application a des écrans publics simples mais aussi des tableaux d'administration, des formulaires avec dates et upload de photos ([screens.md](../technical/screens.md)). On veut éviter de recoder ces composants.

## Décision
- **PrimeVue** pour les composants (DataTable, formulaires, DatePicker, FileUpload, Toast, Dialog).
- **Tailwind CSS** pour la mise en page et le style.
- Écrans décrits par des fiches + wireframes ASCII pour les écrans clés.

## Conséquences
- ➕ Composants riches et accessibles, prêts pour l'admin et les formulaires.
- ➕ Projet maintenu, compatible Vue 3 et TypeScript.
- ➖ Une dépendance importante ; style à harmoniser entre thème PrimeVue et Tailwind.

## Alternatives écartées
- **Tailwind seul** : tout à construire (tableaux, sélecteurs de dates).
- **Vuetify** : complet mais lourd et visuellement très marqué Material.
- **CSS maison** : le plus long.

## Addendum du 2026-10-12 : version de PrimeVue
Constat à l'étape 1 : **PrimeVue 5** (15 juillet 2026) n'est plus sous licence MIT mais sous la « PrimeUI License ». Une clé de licence est requise. La licence gratuite « Community » couvre les associations, mais elle se renouvelle chaque année et le code est distribué compilé, avec des limites de redistribution. Sans clé, un avis de licence s'affiche. Le choix initial supposait une bibliothèque libre.

- **Décision** : rester sur **PrimeVue 4.5.5 (MIT)** avec `@primeuix/themes` 2.x. Versions épinglées (`~4.5.5`) ; Dependabot ignore les nouvelles versions majeures de ces deux paquets.
- ➕ Aucun compte, aucune clé, aucun renouvellement.
- ➖ La v4 est en maintenance (dernière publication le 2026-04-08) : les correctifs futurs ne sont pas garantis.
- Passer à la v5, ou changer de bibliothèque, demande un **nouvel ADR** qui compare le coût et la contrainte de la licence annuelle aux alternatives.
