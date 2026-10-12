# ADR-004 : Anti-sniping à un seul paramètre

- **Statut** : accepté
- **Date** : 2026-10-12

## Contexte
Sans protection, un acheteur peut enchérir dans la dernière seconde (« sniping ») sans laisser aux autres le temps de répondre. L'association préfère que l'enchère monte jusqu'au vrai prix.

Le schéma classique utilise deux paramètres : un seuil (« si l'offre arrive moins de X avant la fin ») et une prolongation (« repousser la fin de Y »). Or :
- avec X > Y, une prolongation peut **raccourcir** l'enchère (il reste 4 min, on repousse à « maintenant + 2 min ») ;
- avec X ≤ Y, le seuil n'a aucun effet.

## Décision
Un seul paramètre, `antiSnipingMs` (**2 min** par défaut). Règle : **l'enchère reste ouverte au moins `antiSnipingMs` après la dernière offre acceptée.**

```
endsAt = max(endsAt, maintenant + antiSnipingMs)
```

- Ce calcul est fait dans la **même opération atomique** que l'enregistrement de l'offre ([ADR-005](ADR-005-offre-atomique.md)).
- Le nombre de prolongations n'est pas limité.
- Chaque prolongation émet `auction:extended`.

## Conséquences
- ➕ Règle simple à expliquer aux utilisateurs et à tester, sans cas incohérent.
- ➕ Pas de risque de course entre l'offre et la prolongation.
- ➖ Une enchère disputée peut durer plus longtemps que prévu. La fin reste garantie, car chaque offre doit augmenter le prix d'au moins `minIncrement`.

## Alternatives écartées
- **Seuil + prolongation** (deux paramètres) : incohérent, voir le contexte.
- **Nombre de prolongations limité** : réintroduit le sniping après la dernière prolongation.
- **Pas d'anti-sniping** : refusé par l'association.
