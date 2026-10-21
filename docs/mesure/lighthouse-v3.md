# Vitesse de la v3 : les quatre pages de référence

Mesure du 21/10/2026, application construite depuis le commit `f81912a7`, servie par `next start` sur le banc de test de ce poste (jeu fictif, aucune donnée réelle). Lighthouse 13.5.0, HeadlessChrome 156, **mobile** (réglages par défaut : Moto G Power émulé, débit simulé de 1,6 Mb/s, latence de 150 ms, processeur ralenti ×4). 5 passages par page, **médiane** de chaque mesure prise séparément.

> **Machine non au repos : mesure indicative, non figée.** charge 10.42 sur 1 min et 11.38 sur 5 min pour 8 cœurs (seuil 4) ; indice de puissance instable : écart de 34 % de sa médiane (seuil 20 %) ; 3 passage(s) sous 80 % de la médiane de l’indice ; 20 passage(s) lancés avec une charge sur 1 min au-dessus de 4.

## Médianes (mobile)

| Page | Perf. | Access. | SEO | SEO hors `is-crawlable` | FCP | LCP | CLS | TBT | Poids | dont JS | Requêtes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Accueil (P01, `/`) | 94 | 100 | 100 | 100 | 1,1 s | 2,8 s | 0,000 | 165 ms | 495 Ko | 169 Ko | 29 |
| Recherche Annecy (P02, `/search?city=Annecy`) | 90 | 100 | 66 | 100 | 1,1 s | 2,3 s | 0,000 | 140 ms | 439 Ko | 170 Ko | 33 |
| Profil de référence (P03, `/profil/ines-morel`) | 95 | 100 | 100 | 100 | 1,1 s | 2,8 s | 0,000 | 99 ms | 420 Ko | 172 Ko | 33 |
| Talent (P04, `/talent/maquillage-mariee`) | 94 | 100 | 100 | 100 | 0,9 s | 2,8 s | 0,000 | 151 ms | 290 Ko | 169 Ko | 29 |

## Budgets du plan 02 §7.5

**Accueil (P01)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 94 | oui | 4 sur 5 |
| LCP | ≤ 2,5 s | 2,8 s | non | 2 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 165 ms | oui | 3 sur 5 |
| Accessibilité | ≥ 95 | 100 | oui | 5 sur 5 |
| SEO | = 100 | 100 | oui | 5 sur 5 |

**Recherche Annecy (P02)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 90 | oui | 4 sur 5 |
| LCP | ≤ 2,5 s | 2,3 s | oui | 3 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 140 ms | oui | 3 sur 5 |
| Accessibilité | ≥ 95 | 100 | oui | 5 sur 5 |
| SEO hors is-crawlable | = 100 | 100 | oui | 5 sur 5 |
| JavaScript | ≤ 250 Ko | 170 Ko | oui | 5 sur 5 |

**Profil de référence (P03)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 95 | oui | 5 sur 5 |
| LCP | ≤ 2,5 s | 2,8 s | non | 2 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 99 ms | oui | 5 sur 5 |
| Accessibilité | ≥ 95 | 100 | oui | 5 sur 5 |
| SEO | = 100 | 100 | oui | 5 sur 5 |

**Talent (P04)**

| Budget | Demandé | Mesuré | Tenu | Passages qui le tiennent |
|---|---|---|---|---|
| Performance | ≥ 85 | 94 | oui | 5 sur 5 |
| LCP | ≤ 2,5 s | 2,8 s | non | 1 sur 5 |
| CLS | ≤ 0,1 | 0,000 | oui | 5 sur 5 |
| TBT | ≤ 200 ms | 151 ms | oui | 4 sur 5 |
| Accessibilité | ≥ 95 | 100 | oui | 5 sur 5 |
| SEO | = 100 | 100 | oui | 5 sur 5 |

Budgets tenus : 22 sur 25.

## Comparaison avec le site en ligne (mesure du 16/10/2026, mobile, médiane de 5)

| Page | Mesure | v3 | En ligne | Verdict |
|---|---|---|---|---|
| Accueil (P01) | LCP | 2,8 s | 3,4 s | meilleur |
| Accueil (P01) | CLS | 0,000 | 0,000 | égal |
| Recherche Annecy (P02) | LCP | 2,3 s | 4,4 s | meilleur |
| Recherche Annecy (P02) | CLS | 0,000 | 0,052 | meilleur |
| Profil de référence (P03) | LCP | 2,8 s | 2,0 s | moins bon |
| Profil de référence (P03) | CLS | 0,000 | 0,026 | meilleur |
| Talent (P04) | LCP | 2,8 s | 3,0 s | meilleur |
| Talent (P04) | CLS | 0,000 | 0,000 | égal |

Moins bon que le site en ligne, sans écart accepté : P03 LCP.

## Lecture

- Le SEO de la recherche (P02) tombe à 66 parce que la page est en `noindex` voulu (plan 02 U52) : l’audit `is-crawlable` échoue. La colonne « SEO hors `is-crawlable` » dit la note sans lui ; le budget « SEO = 100 » se lit ainsi pour cette page, comme pour le relevé du site en ligne.
- Le banc est sur ce poste, sans réseau ni CDN ni cache de production : le débit et la latence sont simulés par Lighthouse, mais la réponse du serveur est plus rapide qu’en ligne. Une comparaison ne vaut que contre le relevé du site en ligne fait de la même façon ; le dernier mot est donné par la même mesure sur l’hôte de production, après la bascule.
- Le jeu du banc a 12 profils : le profil et la liste de P02 sont plus petits que ceux de la production.
