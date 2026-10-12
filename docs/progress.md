# Tableau de bord — avancement du projet

> Document **tenu à jour par l'IA** à chaque modification (code, doc, roadmap). Source des cases : [roadmap.md](roadmap.md). Ne pas y recopier le contenu des étapes, seulement l'état.
>
> Dernière mise à jour : 2026-10-12 · Commit de référence : `732e372`

## Vue d'ensemble

| Étape | Titre | Avancement | Cases | Statut |
|---|---|---|---|---|
| 1 | Squelette du monorepo | `░░░░░░░░░░` 0 % | 0 / 8 | ⚪ Pas commencée |
| 2 | Comptes et sessions | `░░░░░░░░░░` 0 % | 0 / 8 | ⚪ Pas commencée |
| 3 | Enchères : création et modération | `░░░░░░░░░░` 0 % | 0 / 6 | ⚪ Pas commencée |
| 4 | Offres en temps réel (cœur du projet) | `░░░░░░░░░░` 0 % | 0 / 7 | ⚪ Pas commencée |
| 5 | Clôture | `░░░░░░░░░░` 0 % | 0 / 4 | ⚪ Pas commencée |
| 6 | Paiement | `░░░░░░░░░░` 0 % | 0 / 6 | ⚪ Pas commencée |
| 7 | Administration et RGPD | `░░░░░░░░░░` 0 % | 0 / 4 | ⚪ Pas commencée |
| 8 | Finitions et mise en production | `░░░░░░░░░░` 0 % | 0 / 4 | ⚪ Pas commencée |
| | **Total** | `░░░░░░░░░░` **0 %** | **0 / 47** | |

**Étape en cours** : aucune. Le dépôt ne contient encore que la documentation (`docs/`, `AGENTS.md`).

## État de la documentation

- Documents présents : 31 fichiers Markdown dans `docs/` (architecture, domaine, technique, ADR).
- Scénarios de tests métier par étape : [business-tests.md](technical/business-tests.md).
- Documents annoncés mais absents : `architecture/modules.md`, `runbooks/local-development.md`, `runbooks/deployment.md`, `lessons-learned/`.
- Décisions à acter (voir [roadmap.md](roadmap.md)) : aucune en attente.

## Historique récent

| Date | Changement | Étapes touchées |
|---|---|---|
| 2026-10-12 | Règles Claude Code par domaine (`.claude/rules/` : offres, cycle d'enchère, paiement, comptes, temps réel) | Préparation étapes 2, 4, 5, 6 |
| 2026-10-12 | Outillage qualité : gabarit de PR, Dependabot, permissions Claude Code (`.claude/settings.json`), checklist dans `CLAUDE.md` | Préparation étape 1 |
| 2026-10-12 | Scénarios de tests métier par étape (`business-tests.md`) | Préparation étapes 1–8 |
| 2026-10-12 | Suivi GitHub : 8 jalons, labels, 8 issues et projet kanban « Encheres — Roadmap » | Toutes |
| 2026-10-12 | Création du tableau de bord | — |
| 2026-10-12 | Ajout de `screens.md` et ADR-012 (PrimeVue) | Préparation étapes 1–2 |
| 2026-10-12 | Ajout de `security.md`, `testing.md`, ADR-011 | Préparation étapes 2, 4 |
| 2026-10-12 | Ajout de `api.md`, ADR-010 (tRPC) | Préparation étape 1 |
| 2026-10-12 | Ajout de `account.md`, ADR-009 | Préparation étape 2 |

## Règle de mise à jour (pour l'IA)

Lors de toute modification :
1. Cocher ou décocher les cases concernées dans [roadmap.md](roadmap.md), puis recalculer le tableau ci-dessus (cases cochées / cases totales par étape).
2. Mettre à jour « Étape en cours » et « État de la documentation ».
3. Ajouter une ligne à l'historique (date, changement, étapes touchées).
4. Faire ces mises à jour **dans le même commit** que la modification.
