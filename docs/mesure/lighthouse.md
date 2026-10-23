# La vitesse des quatre pages de référence : Lighthouse en mobile

La v3 se mesure sur les quatre pages du plan de tests (02 §7.5), comme le site en ligne l'a été le 16/10/2026 (ticket 056), puis se compare à lui (ticket 179).

| Page | Plan | Adresse mesurée |
|---|---|---|
| Accueil | P01 | `/` |
| Recherche | P02 | `/search?city=Annecy` |
| Profil de référence | P03 | `/profil/ines-morel` (le profil `reference` du banc, une personne fictive) |
| Talent | P04 | `/talent/maquillage-mariee` |

## Lancer la mesure

```sh
BENCH_INSTANCE=mon-banc BENCH_OFFSET=20 bun run bench:full      # 1. l'application construite pour la production, jeu du banc chargé (premier plan)
BENCH_OFFSET=20 bun run perf:lighthouse                          # 2. dans un autre terminal : 5 passages par page, rapport dans docs/mesure/lighthouse-v3.md
```

- **Seule, machine au repos.** La commande refuse de mesurer (code 4, avant toute requête) si la charge du système dépasse 0,5 par cœur sur 1 ou 5 minutes, ou si un autre processus de mesure ou de test tourne (Lighthouse, Playwright, `bun test`). `--indicative` mesure quand même : le rapport le dit en tête (« mesure indicative, non figée ») et nomme les raisons. Une mesure indicative ne prouve aucun budget.
- **Après les passages**, la commande juge aussi la machine sur les passages eux-mêmes : indice de puissance de Lighthouse (`benchmarkIndex`) qui varie de plus de 20 % de sa médiane, un passage sous 80 % de la médiane, ou une charge montée pendant un passage.
- **Une adresse de ce poste seulement** (`127.0.0.1`, `localhost`, `[::1]`). Rien ne part vers un hôte de production, sauf avec `--production` (issue #983) : alors le domaine principal seulement (`https://my-makeup.fr`, rien d'autre), en lecture (GET de pages publiques), 10 secondes de pause entre deux passages, la version déployée lue dans `/api/health` et écrite en tête du rapport. En production, le profil de P03 est le premier profil publié du sitemap du site (le profil du banc y répond 404) ; le rapport ne le nomme pas. Les adresses d'un profil et d'un talent se donnent par `--profile` et `--talent`.
- **Lighthouse n'est pas une dépendance.** Il tourne par `npx lighthouse@13.5.0`, la version qui a mesuré le site en ligne (publiée le 18/09/2026 ; aucun avis dans la base de GitHub ni dans ceux de son dépôt, relevé du 20/10/2026).
- **Réglages** : ceux par défaut de Lighthouse en mobile (Moto G Power émulé, débit simulé de 1,6 Mb/s, latence de 150 ms, processeur ralenti ×4), cache et stockage vidés avant chaque passage, passes complètes l'une après l'autre (toutes les pages, puis la passe suivante), 3 secondes de pause entre deux passages. L'envoi de la mesure d'audience (`/u/script.js`, `/u/api/send`) est bloqué, comme pour le site en ligne : aucune visite n'est comptée.
- **Médiane** de chaque mesure, prise à part, sur les 5 passages. Le rapport dit aussi combien de passages, pris un par un, tiennent chaque budget : la médiane peut basculer d'une mesure à l'autre.

## Le navigateur

Le Chromium de Playwright **le plus récent** de `~/.cache/ms-playwright`, comme pour le site en ligne (Chrome 156 le 16/10/2026) ; `--chrome` en donne un autre. Pas celui du Playwright du dépôt s'il est plus ancien : avec Chromium 147, Lighthouse 13.5.0 attend en vain l'événement `DOMContentLoaded` d'une page qui porte un en-tête `Referrer-Policy` (erreur `NO_FCP`, « la page n'a rien peint »), alors que la même page se charge en quelques millisecondes dans ce navigateur piloté par Playwright. Chaque page du site porte cet en-tête (`src/lib/security-headers.ts`). Relevé du 20/10/2026 : une page de quatre lignes servie avec ce seul en-tête échoue avec Chromium 147 ; le site entier est mesuré avec Chromium 156. La version du navigateur lue dans le rapport est écrite en tête du rapport.

## Lire le rapport

- Les budgets sont ceux du plan : performance ≥ 85 (puis 90 deux semaines après), LCP ≤ 2,5 s, CLS ≤ 0,1, TBT ≤ 200 ms, accessibilité ≥ 95, SEO = 100, et JavaScript ≤ 250 Ko pour la recherche (1 Ko = 1 024 octets).
- **SEO de la recherche** : la page est en `noindex` voulu (plan 02 U52), donc l'audit `is-crawlable` échoue et la note tombe à 66, comme sur le site en ligne. Son budget se lit **hors** `is-crawlable` ; la note brute reste dans le tableau des médianes.
- **Comparaison avec le site en ligne** (`docs/mesure/lighthouse-en-ligne-2026-10-16.json`, médianes mobile du ticket 056) sur le LCP et le CLS : « meilleur », « égal » ou « moins bon ». Une page moins bonne est nommée, sauf si l'écart est accepté par écrit par le propriétaire du site (`--accept "P01 LCP"`) : l'outil n'accepte jamais un écart de lui-même.
- **Ce que le banc ne dit pas** : il est sur ce poste, sans réseau réel, sans CDN ni cache de production, avec 12 profils. Débit et latence sont simulés par Lighthouse, mais la réponse du serveur est plus rapide qu'en ligne et les listes sont plus petites. Le dernier mot est la même mesure sur l'hôte de production après la bascule.
- Le rapport (`docs/mesure/lighthouse-v3.md`) et les passages réduits (`docs/mesure/lighthouse-v3.json`) sont versionnés ; les rapports bruts de Lighthouse ne sont pas gardés.

## Les tests

`tests/unit/perf-lighthouse.test.ts` : lecture d'un rapport, médiane, budgets (chacun de chaque côté de sa limite), comparaison, machine au repos, choix du navigateur, refus d'une adresse qui n'est pas de ce poste. Aucun ne lance Lighthouse.
