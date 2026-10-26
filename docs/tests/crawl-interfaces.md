# Le crawl des interfaces

Un robot ouvre 40 adresses du site dans un vrai navigateur, à deux largeurs d'écran (téléphone, 390 px, et bureau, 1440 px), et relève ce que les essais par parcours ne voient pas : une page qui plante, une erreur dans la console, un `undefined` à l'écran, une image cassée, une page qui déborde. C'est le point 2 de la définition de terminé de la bascule (plan 02, §10.1).

Il ne fait que lire. Comme le contrôle d'un hôte ([`controle-hote.md`](controle-hote.md)), c'est une exception à « rien vers le site en ligne » ([`CLAUDE.md`](../../CLAUDE.md), interdit 5), rangée dans `scripts/cutover/`.

## Lancer

```sh
UI_CRAWL_TARGET=http://127.0.0.1:3100 bun run cutover:ui-crawl            # le banc, un build de ce poste
UI_CRAWL_ACCESS_USER=… UI_CRAWL_ACCESS_PASSWORD=… \
  UI_CRAWL_TARGET=https://v3.my-makeup.fr bun run cutover:ui-crawl        # la v3 de production, avant l'échange des domaines
UI_CRAWL_TARGET=https://my-makeup.fr bun run cutover:ui-crawl             # le site, lectures seules
```

| Variable | Rôle |
|---|---|
| `UI_CRAWL_TARGET` | Obligatoire. Une origine seule, de **production** (`https://my-makeup.fr`, `https://v3.my-makeup.fr`) ou `http://` sur ce poste (`localhost`, `127.0.0.1`, `::1`). Tout autre hôte est refusé avant toute requête : c'est la garde du contrôle d'un hôte (`scripts/cutover/host-guard.ts`) |
| `UI_CRAWL_ACCESS_USER`, `UI_CRAWL_ACCESS_PASSWORD` | Facultatives : l'accès protégé de l'hôte temporaire. Les deux ensemble ou aucune ; refusées pour tout autre hôte. Ils ne partent que vers `https://v3.my-makeup.fr` et ne s'écrivent jamais |
| `UI_CRAWL_OUTPUT` | Facultative. Un fichier où écrire aussi le rapport, en JSON |

Il faut le Chromium de Playwright, installé une fois par poste : `bunx playwright install chromium` ([`e2e.md`](e2e.md)). La commande ne lit aucun fichier `.env`.

| Code de sortie | Sens |
|---|---|
| 0 | Aucun défaut |
| 1 | Au moins un défaut |
| 2 | La cible ou un réglage est refusé : rien n'est parti |

## Les 40 adresses

Dans cet ordre, jusqu'à 40 :

1. les pages fixes que le site livre (celles du sitemap, accueil compris) ;
2. cinq recherches : sans rien, une ville, un mot, un mot et une ville, un mot que personne n'a ;
3. le plan du site et la page de remerciement du formulaire de contact ;
4. une adresse inconnue, dont on attend un 404 en français, aussi propre que les autres ;
5. neuf profils, quatre talents et quatre articles, pris dans l'ordre du sitemap de l'hôte. Une famille trop courte laisse sa place aux autres.

Moins de 40 adresses en tout est une erreur, jamais un crawl plus court. Les pages de l'espace (`/auth/…`) n'y sont pas : elles n'ont pas de navigation principale, et le crawl en demande une à chaque page (voir « Ce que le crawl ne dit pas »).

## Ce qui est un défaut

À chaque page, après son chargement et un défilement jusqu'en bas (pour que les images différées se chargent) :

| Défaut | Règle |
|---|---|
| `status` | Une réponse 5xx, ou un code autre que celui attendu (200, et 404 pour l'adresse inconnue) |
| `console-error` | Une erreur de la console, ou une erreur non rattrapée de la page. Aucune n'est écartée, les préchargements de Next compris |
| `h1` | Autre chose qu'un seul `h1` |
| `nav` | Autre chose qu'une seule navigation nommée « Navigation principale » |
| `visible-text` | Un `undefined`, un `null`, un `NaN` ou un `[object Object]` dans le texte que la visiteuse lit. Le plan 02 nomme `undefined` et `null` ; `NaN` et `[object Object]` sont de la même famille |
| `overflow` | `scrollWidth` plus grand que `clientWidth` : la page se fait défiler de côté. Le rapport nomme jusqu'à trois éléments qui dépassent |
| `broken-image` | Une image que le navigateur ne sait pas décoder, dont la réponse est en 4xx ou 5xx, ou qui n'a toujours pas de réponse au bout de 30 s. Le rapport dit pourquoi entre parenthèses (réponse 404, échec du réseau, image illisible, sans réponse). Ce n'est pas `naturalWidth` à 0 : avec un `srcset` de largeurs, le navigateur divise la largeur de l'image par la densité choisie, et une photo d'un pixel de large (celles que d'autres essais laissent sur le banc) a un `naturalWidth` de 0 sans être cassée. Une image lente n'est pas non plus une image cassée : après le défilement, le crawl suit les images sur le réseau et lit la page quand plus aucune n'est en route (issue 997) |
| `blocked-request` | Une requête que la page a faite et que le crawl a refusée : un autre hôte, une écriture, un chemin de mesure hors inventaire |

## Ce qui le garde en lecture seule

Toutes les requêtes du navigateur passent par une seule route (`decide`, dans `scripts/cutover/ui-crawl.ts`), qui applique les règles de `host-guard.ts` :

- un GET sur la cible part ; tout le reste reçoit un 204 vide, et est noté dans le rapport ;
- l'événement de mesure d'audience (`POST /u/api/send`) ne part jamais, et n'est pas un défaut : il n'y a ni visite ni événement compté ;
- un contexte neuf par largeur d'écran : ni cookie ni stockage, une visiteuse anonyme, avec pour `baseURL` l'origine de la cible (`contextOptions`) : les chemins relatifs mènent à la cible, banc ou adresse distante ;
- l'accès protégé de l'hôte temporaire est ajouté aux seules requêtes de cet hôte ;
- **une requête part 500 ms au moins après la précédente**, images et scripts de la page compris : 2 par seconde au plus. Sur ce poste il n'y a pas d'attente.

Un crawl d'un hôte en ligne dure donc longtemps : sur `https://my-makeup.fr`, le 26/10/2026, 80 pages et 3 098 requêtes en 26 minutes. Laisse-lui une heure avant de le couper.

## Lire le rapport

Une ligne par défaut : `[largeur] adresse : genre : détail`, puis le verdict. Un profil est désigné par `profil #xxxxxxxx`, les 8 premiers chiffres du SHA-256 de son chemin : jamais son adresse ([`CLAUDE.md`](../../CLAUDE.md), interdit 3). `UI_CRAWL_OUTPUT` écrit le même rapport en JSON.

## Les tests

- `tests/unit/ui-crawl.test.ts` : chaque genre de défaut, les 40 adresses (sans doublon, dans l'ordre du sitemap, une famille courte, un sitemap trop court), la lecture seule (écriture, autre hôte, `/u`, accès protégé), une cible donnée en adresse absolue (`baseURL` du contexte, crawl complet contre un faux site local, accès protégé envoyé à l'origine de la cible seule), le rythme de 2 requêtes par seconde avec une horloge simulée. `bun --no-env-file test tests/unit/ui-crawl.test.ts`.
- `tests/e2e/ui-crawl.spec.ts` : la commande contre l'application du banc, avec ses profils, six talents et six articles d'essai : 40 adresses, 80 pages, aucun défaut. Un second essai sème exprès un défaut de chaque genre dans une page (deux `h1`, aucune Nav, `undefined` et `null`, un débordement, une image cassée, une erreur de console) et vérifie que chacun est trouvé, qu'une page propre ne donne rien et qu'un 500 est vu.

## Ce que le crawl ne dit pas

- Les pages de l'espace (`/auth/…`) n'ont pas de navigation principale : elles ne sont pas dans la liste. Leurs parcours sont ceux des essais de bout en bout.
- Les pages qui demandent une session (espace, administration) ne sont pas lues : le crawl est anonyme.
- Il ne remplace ni axe ([`e2e.md`](e2e.md)) ni la recette manuelle.
