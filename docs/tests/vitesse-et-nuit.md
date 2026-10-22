# La vitesse en CI et la suite de nuit (issue #984)

Trois choses surveillent le site sans que quelqu'un y pense : la vitesse des quatre pages de référence à chaque poussée, une suite de nuit pour les parcours lents, et la comparaison visuelle des pages clés.

## La vitesse, à chaque poussée : le job `perf`

Le job `perf` de [`ci.yml`](../../.github/workflows/ci.yml) tourne **en parallèle** des autres (il n'attend pas `build`), 12 minutes au plus, donc la CI reste sous 15 minutes (voir [`../qualite.md`](../qualite.md), « Durée de la CI »). Il démarre l'application sur le banc (`bun run bench:full`, le jeu fictif), puis lance `bun run perf:ci` : les quatre pages (P01 accueil, P02 recherche, P03 profil de référence, P04 talent), **3 passages chacune, médiane**, Lighthouse mobile ([`../mesure/lighthouse.md`](../mesure/lighthouse.md)). Le rapport est écrit dans le résumé de la poussée.

- **Budgets** (plan 02 §7.5) : performance ≥ 85 puis ≥ 90, LCP ≤ 2,5 s, CLS ≤ 0,1, TBT ≤ 200 ms, accessibilité ≥ 95, SEO = 100, JavaScript de la recherche ≤ 250 Ko.
- **Avertissement, puis blocage.** Jusqu'au 05/11/2026 inclus, un budget manqué (ou une mesure qui n'a pas pu se faire) est une annotation `::warning` et le job reste vert. **À partir du 06/11/2026**, c'est une `::error` et le job, donc `ci-ok`, devient rouge. Le 20/11/2026, la performance demandée passe de 85 à 90. Les dates sont des constantes de [`scripts/perf/ci-gate.ts`](../../scripts/perf/ci-gate.ts) : le workflow n'a aucun `continue-on-error` (les garde-fous de la CI l'interdisent), la souplesse est dans le script et se teste (`tests/unit/perf-ci-gate.test.ts`).
- **Une régression semée exprès fait échouer le contrôle** : le test joue des passages dégradés (TBT, LCP, performance, CLS, accessibilité, SEO, JavaScript) et vérifie le code de sortie 1 après la date, 0 avant, avec l'annotation qui nomme la page et le budget.
- **Ce que la mesure ne dit pas** : un serveur de CI n'est jamais « au repos » au sens de la mesure figée ; le job mesure en `--indicative`. Il surveille une régression, il ne fige pas un chiffre. Le chiffre de référence est la mesure sur la production : `bun run perf:lighthouse --production --out <fichier>`.

## La nuit : [`nuit.yml`](../../.github/workflows/nuit.yml)

Tous les jours à 02:30 (heure de Paris), à la main (`workflow_dispatch`), et quand le workflow ou le test visuel change :

- **`lent`** : les parcours de bout en bout qui portent l'étiquette `@lent` (une vraie expiration de session, une session qui glisse).
- **`visuel`** : 9 pages clés à 390, 768 et 1440 px contre des références (`tests/e2e/visual.spec.ts`). Un projet Playwright à part (`visual`), que `bun run test:e2e` sans option ne joue pas.

**GitHub ne lance un workflow planifié que depuis la branche par défaut.** Tant que `main` ne porte pas la v3, la planification ne se déclenche pas ; les poussées sur `v3` qui touchent le workflow ou le test visuel, et le lancement à la main, le font tourner.

## Les références visuelles

Elles se prennent **sur un serveur de CI**, jamais sur un poste (polices et lissage différent d'un système à l'autre). [`references-visuelles.yml`](../../.github/workflows/references-visuelles.yml) joue le projet deux fois (écrire, puis comparer : une page qui n'est pas la même deux fois de suite échoue ici) et envoie les images en fichier `visual-references` ; on le met dans `tests/e2e/visual.spec.ts-snapshots/`, dans le même commit que le changement d'aspect voulu :

```sh
gh workflow run references-visuelles.yml
gh run download <identifiant> -n visual-references -D tests/e2e/visual.spec.ts-snapshots
```
