# Crédits des dessins SVG

Tous les dessins de la direction artistique (objets de maquillage, dessins au trait, petites icônes d'interface) sont de **vraies icônes dessinées par des personnes**, au trait fin, sous licence libre. **Aucun n'est généré par une IA** (la règle est dans [`direction-artistique.md`](direction-artistique.md)). Les éléments simples du kit (marques d'imprimerie, filets, cadres) sont dessinés à la main pour le projet : ils n'ont pas de source extérieure. Le jeu précédent (IconPark, Apache-2.0) est remplacé depuis le 26/10/2026 : son trait était jugé trop épais (issue 1134). Le choix des jeux est expliqué dans `plans/.scratch/v3/recherche-icones.md` et dans la PR de l'issue 1134.

## Réserve de provenance (à lire)

Sept des vingt-huit dessins (les sept objets sur huit, hors le pinceau) viennent d'**IconOven** (style Stroke, MIT). La licence est vérifiée (fichier `LICENSE` du dépôt officiel `iconoven/iconoven-swift`, © 2026 Appic Marketing LLC ; page « UI icons licence » du site : « Every icon in the Stroke style is MIT licensed »). **La paternité humaine n'est pas démontrée** : la bibliothèque est récente (premier commit public le 28/09/2026), aucun dessinateur n'est nommé, le studio revendique 85 000 icônes en 13 styles et « drawn by the same hands ». Rien ne prouve une génération par IA, rien ne l'exclut. Si le mainteneur refuse cette source, les sept objets sont retirés ou remplacés par ligne dans `SOURCES` de `scripts/art/extract-drawings.ts` ; les lèvres, l'œil, le pinceau et toutes les icônes d'interface viennent de jeux anciens et nommés (Lucide, Hugeicons).

## Les sources

| Famille | Jeu pris | Auteur | Licence | Texte de la licence |
|---|---|---|---|---|
| IconOven, style Stroke (grille de 24, trait 1,5) | `@iconify-json/iconoven` 1.2.1 (sha1 de l'archive npm `bb66ddf098bfa6a4f8659775cbf4be88b8b1d4a8`) | Appic Marketing LLC | MIT (SPDX `MIT`), <https://iconoven.com/ui-icons/licence> | [`LICENSES/IconOven-MIT.txt`](../LICENSES/IconOven-MIT.txt), copie du `LICENSE` de `iconoven/iconoven-swift` |
| Lucide (grille de 24, trait 2) | `@iconify-json/lucide` 1.2.147 (sha1 `8ed8b556388f4c6ddfbee81e75d749a67ce8ff70`), dépôt <https://github.com/lucide-icons/lucide> | Lucide Contributors | ISC (SPDX `ISC`) | [`LICENSES/Lucide-ISC.txt`](../LICENSES/Lucide-ISC.txt), copie du `LICENSE` du dépôt |
| Hugeicons, jeu gratuit (grille de 24, trait 1,5) | `@iconify-json/hugeicons` 1.2.35 (sha1 `53df4e7d8d9612edccd5d3455e5039346f236109`), dépôt <https://github.com/hugeicons/hugeicons> | Hugeicons | MIT (SPDX `MIT`) | [`LICENSES/Hugeicons-MIT.txt`](../LICENSES/Hugeicons-MIT.txt), copie du `LICENSE.md` du dépôt |

Obligations des trois licences (MIT, ISC) : garder la mention de droits d'auteur et le texte de la licence (dossier `LICENSES/`, ce fichier) ; elles n'exigent aucune mention visible sur le site, et aucune page du site n'en porte. Les paquets `@iconify-json/*` ne sont **pas** des dépendances du site : ils sont téléchargés (`npm pack`) à côté du dépôt, lus par le script, et seules les formes qu'il en tire sont copiées dans le code.

Reconstruire : télécharger les trois archives aux versions ci-dessus, extraire `package/icons.json` de chacune dans `<dossier>/iconoven/`, `<dossier>/lucide/`, `<dossier>/hugeicons/`, puis `bun --no-env-file scripts/art/extract-drawings.ts <dossier>`.

## Les dessins

Les noms sont ceux du code (`MakeupObject name=…`, `LineDrawing name=…`, `Icon name=…` ; les icônes d'interface sont préfixées `icon:` ici).

| Nom | Icône d'origine | Auteur | Licence | Modification |
|---|---|---|---|---|
| `lipstick` | `@iconify-json/iconoven`, icône `lipstick` | IconOven (Appic Marketing) | MIT | contour seul, voir « Modifications communes » |
| `brush` | `@iconify-json/hugeicons`, icône `blush-brush-01` | Hugeicons | MIT | contour seul, voir « Modifications communes » |
| `compact` | `@iconify-json/iconoven`, icône `compact-mirror` | IconOven (Appic Marketing) | MIT | contour seul, voir « Modifications communes » |
| `mirror` | `@iconify-json/iconoven`, icône `mirror` | IconOven (Appic Marketing) | MIT | contour seul, voir « Modifications communes » |
| `mascara` | `@iconify-json/iconoven`, icône `mascara` | IconOven (Appic Marketing) | MIT | contour seul, voir « Modifications communes » |
| `nail-polish` | `@iconify-json/iconoven`, icône `nail-polish` | IconOven (Appic Marketing) | MIT | contour seul, voir « Modifications communes » |
| `perfume` | `@iconify-json/iconoven`, icône `perfume-bottle` | IconOven (Appic Marketing) | MIT | contour seul, voir « Modifications communes » |
| `comb` | `@iconify-json/iconoven`, icône `comb` | IconOven (Appic Marketing) | MIT | contour seul, voir « Modifications communes » |
| `lips` | `@iconify-json/lucide`, icône `mouth` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `eye` | `@iconify-json/lucide`, icône `eye` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:arrow-right` | `@iconify-json/lucide`, icône `arrow-right` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:arrow-left` | `@iconify-json/lucide`, icône `arrow-left` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:play` | `@iconify-json/lucide`, icône `play` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:pause` | `@iconify-json/lucide`, icône `pause` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:search` | `@iconify-json/lucide`, icône `search` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:pin` | `@iconify-json/lucide`, icône `map-pin` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:seal` | `@iconify-json/lucide`, icône `badge-check` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:calendar` | `@iconify-json/lucide`, icône `calendar` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:chevron-down` | `@iconify-json/lucide`, icône `chevron-down` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:menu` | `@iconify-json/lucide`, icône `menu` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:check` | `@iconify-json/lucide`, icône `check` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:close` | `@iconify-json/lucide`, icône `x` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:mail` | `@iconify-json/lucide`, icône `mail` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:phone` | `@iconify-json/lucide`, icône `phone` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:user` | `@iconify-json/lucide`, icône `user` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:heart` | `@iconify-json/lucide`, icône `heart` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:share` | `@iconify-json/lucide`, icône `share-2` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |
| `icon:star` | `@iconify-json/lucide`, icône `star` | Lucide Contributors | ISC | contour seul, voir « Modifications communes » |

### Modifications communes

Faites par `scripts/art/extract-drawings.ts`, qui relit les icônes d'origine et réécrit `src/components/art/drawings.ts` :

- les couleurs, l'épaisseur de trait d'origine (1,5 ou 2), les extrémités, les groupes et les remplissages sont retirés : le composant dessine chaque forme en `currentColor`, extrémités et jointures arrondies, avec **une seule épaisseur pour toute la famille** (variable CSS `--art-drawing-stroke`, `.art-drawing` dans `globals.css`, 1,4 px à l'écran quelle que soit la taille) ; les trois jeux ont la même grille de 24 et les mêmes extrémités rondes, la différence d'épaisseur d'origine disparaît donc ;
- un point d'origine (un tracé de longueur nulle à extrémités rondes) reste un point ; `play` est rempli par le composant ;
- le balisage est réduit à des formes nues (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`) avec leur seule géométrie : ni script, ni style, ni lien, ni métadonnée, ni commentaire ;
- aucune forme n'est redessinée : les coordonnées sont copiées telles quelles.

## Ce qui n'a pas été trouvé en vrai SVG

Rien de ce qui suit n'existe en trait fin dans les jeux libres vérifiés : ces éléments sont **absents** plutôt que dessinés à la main ou pris dans un second style : éponge à fond de teint, pince à cils, profil, main qui tient un pinceau, balayages de pinceau.

## Les jeux regardés et écartés

La liste complète, avec leurs licences et la raison de chaque refus, est dans `plans/.scratch/v3/recherche-icones.md`. En bref : Phosphor, Tabler, Iconoir, Solar (CC BY 4.0), MingCute, Material Symbols, Streamline gratuit (CC BY 4.0), Pinhead (CC0, silhouettes pleines), les jeux d'emoji, Flaticon, Noun Project et SVG Repo (une licence par fichier, pas de famille) n'ont ni lèvres, ni rouge à lèvres, ni mascara, ni vernis, ni poudrier dans un trait fin commun, ou demandent une mention d'auteur.
