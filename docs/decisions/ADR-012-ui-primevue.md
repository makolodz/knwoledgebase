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
