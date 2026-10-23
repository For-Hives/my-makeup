# Vitesse de la v3 en production : les quatre pages de référence (issue #983)

Mesure du 23/10/2026, site de production, version déployée `3a75c9f`, lu en lecture seule depuis ce poste, réseau réel. Lighthouse 13.5.0, HeadlessChrome 153, **mobile** (réglages par défaut : Moto G Power émulé, débit simulé de 1,6 Mb/s, latence de 150 ms, processeur ralenti ×4). 5 passages par page, **médiane** de chaque mesure prise séparément.

> **Machine non au repos : mesure indicative, non figée.** 8 passage(s) lancés avec une charge sur 1 min au-dessus de 4.

## Médianes (mobile)

| Page | Perf. | Access. | SEO | SEO hors `is-crawlable` | FCP | LCP | CLS | TBT | Poids | dont JS | Requêtes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Accueil (P01, `/`) | 88 | 98 | 100 | 100 | 1,3 s | 3,9 s | 0,000 | 102 ms | 491 Ko | 165 Ko | 39 |
| Recherche Annecy (P02, `/search?city=Annecy`) | 88 | 98 | 66 | 100 | 1,4 s | 3,8 s | 0,000 | 45 ms | 349 Ko | 164 Ko | 38 |
| Profil de référence (P03, `/profil/<publiable>`) | 86 | 98 | 100 | 100 | 1,3 s | 4,0 s | 0,000 | 144 ms | 490 Ko | 169 Ko | 30 |
| Talent (P04, `/talent/maquillage-femme`) | 89 | 98 | 100 | 100 | 1,3 s | 3,6 s | 0,000 | 87 ms | 283 Ko | 165 Ko | 21 |

## Budgets du plan 02 §7.5

**Accueil (P01)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 88 | oui | 3 sur 5 |
| LCP | ≤ 2,5 s | 3,9 s | non | 0 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 102 ms | oui | 5 sur 5 |
| Accessibilité | ≥ 95 | 98 | oui | 5 sur 5 |
| SEO | = 100 | 100 | oui | 5 sur 5 |

**Recherche Annecy (P02)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 88 | oui | 5 sur 5 |
| LCP | ≤ 2,5 s | 3,8 s | non | 0 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 45 ms | oui | 5 sur 5 |
| Accessibilité | ≥ 95 | 98 | oui | 5 sur 5 |
| SEO hors is-crawlable | = 100 | 100 | oui | 5 sur 5 |
| JavaScript | ≤ 250 Ko | 164 Ko | oui | 5 sur 5 |

**Profil de référence (P03)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 86 | oui | 5 sur 5 |
| LCP | ≤ 2,5 s | 4,0 s | non | 0 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 144 ms | oui | 5 sur 5 |
| Accessibilité | ≥ 95 | 98 | oui | 5 sur 5 |
| SEO | = 100 | 100 | oui | 5 sur 5 |

**Talent (P04)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 89 | oui | 5 sur 5 |
| LCP | ≤ 2,5 s | 3,6 s | non | 0 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 87 ms | oui | 5 sur 5 |
| Accessibilité | ≥ 95 | 98 | oui | 5 sur 5 |
| SEO | = 100 | 100 | oui | 5 sur 5 |

Budgets tenus : 21 sur 25.

## Comparaison avec le site en ligne (mesure du 16/10/2026, mobile, médiane de 5)

| Page | Mesure | v3 | En ligne | Verdict |
|---|---|---|---|---|
| Accueil (P01) | LCP | 3,9 s | 3,4 s | moins bon |
| Accueil (P01) | CLS | 0,000 | 0,000 | égal |
| Recherche Annecy (P02) | LCP | 3,8 s | 4,4 s | meilleur |
| Recherche Annecy (P02) | CLS | 0,000 | 0,052 | meilleur |
| Profil de référence (P03) | LCP | 4,0 s | 2,0 s | moins bon |
| Profil de référence (P03) | CLS | 0,000 | 0,026 | meilleur |
| Talent (P04) | LCP | 3,6 s | 3,0 s | moins bon |
| Talent (P04) | CLS | 0,000 | 0,000 | égal |

Moins bon que le site en ligne, sans écart accepté : P01 LCP, P03 LCP, P04 LCP.

## Lecture

- Le SEO de la recherche (P02) tombe à 66 parce que la page est en `noindex` voulu (plan 02 U52) : l’audit `is-crawlable` échoue. La colonne « SEO hors `is-crawlable` » dit la note sans lui ; le budget « SEO = 100 » se lit ainsi pour cette page, comme pour le relevé du site en ligne.
- Le banc est sur ce poste, sans réseau ni CDN ni cache de production : le débit et la latence sont simulés par Lighthouse, mais la réponse du serveur est plus rapide qu’en ligne. Une comparaison ne vaut que contre le relevé du site en ligne fait de la même façon ; le dernier mot est donné par la même mesure sur l’hôte de production, après la bascule.
- Le jeu du banc a 12 profils : le profil et la liste de P02 sont plus petits que ceux de la production.

## Temps de premier octet (TTFB), production, accès protégé levé

`curl` sur l'adresse complète, GET, 2 requêtes par seconde au plus, premier essai écarté (échauffement), médiane des 5 suivants, en secondes, version `3a75c9f`. Deux séries à la suite, mêmes résultats à 3 ms près. Les quatre pages répondent `x-nextjs-cache: HIT` et `s-maxage=3600, stale-while-revalidate`.

| Page | v3 (série 1 / série 2) | Ancien site (mesure figée du 22/10/2026) | Écart |
|---|---|---|---|
| `/` | 0,106 / 0,103 | 0,129 | -18 % à -20 % |
| un profil publiable | 0,104 / 0,104 | 0,106 | -2 % |
| un talent | 0,103 / 0,103 | 0,108 | -4 % |
| un article du blog | 0,101 / 0,104 | pas de référence figée | sans objet |
| `/search?city=Annecy` (pour information) | 0,112 / 0,114 | pas de référence figée | sans objet |
| `/robots.txt` (pour information) | 0,102 / 0,103 | 0,10 (mesure du 22/10) | +2 % à +3 % |

Le surcoût d'environ 58 ms de l'accès protégé a disparu : le TTFB de la v3 est au niveau de l'ancien site, ou en dessous.

La mesure Lighthouse ci-dessus est **indicative** (machine chargée pendant 8 passages sur 20, débit réel du poste en plus du débit simulé). Les commandes : `bun run perf:lighthouse --production --profile <chemin> --talent <chemin> --out <fichier>` ; le profil mesuré n'est jamais nommé dans le rapport.
