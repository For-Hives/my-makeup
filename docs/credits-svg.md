# Crédits des dessins SVG

Tous les dessins de la direction artistique (objets de maquillage, dessins au trait) sont de **vraies icônes dessinées par des personnes**, d'une seule famille, sous licence libre. **Aucun n'est généré par une IA** (c'était le cas de la première version, supprimée le 25/10/2026 ; la règle est dans [`direction-artistique.md`](direction-artistique.md)). Les éléments simples du kit (marques d'imprimerie, icônes d'interface, filets, cadres) sont dessinés à la main pour le projet : ils n'ont pas de source extérieure.

## La source : IconPark (ByteDance)

| | |
|---|---|
| Famille | IconPark, jeu « Outline » (grille de 48, traits arrondis) |
| Dépôt | <https://github.com/bytedance/IconPark> |
| Version prise | commit `8dc132da4c85671ba6a5962c87aa2bdafbf158e9` (dépôt cloné le 25/10/2026, dossier `source/`) |
| Auteur | ByteDance Inc. (équipe IconPark) |
| Licence | Apache License 2.0 (SPDX `Apache-2.0`), <https://www.apache.org/licenses/LICENSE-2.0> |
| Texte de la licence | [`LICENSES/IconPark-Apache-2.0.txt`](../LICENSES/IconPark-Apache-2.0.txt), copie du fichier `LICENSE` du dépôt (« Copyright 2019-present Bytedance Inc. ») |
| Fichier `NOTICE` | le dépôt n'en a pas : rien d'autre à reproduire (Apache-2.0, art. 4 d) |

Obligations de la licence, et où elles sont tenues : texte de la licence joint (`LICENSES/`), mention de l'auteur et de la source (ce fichier), **mention des modifications** (colonne « Modification » ci-dessous et en-tête de `src/components/art/drawings.ts`, art. 4 b). La licence n'exige aucune mention visible sur le site.

## Les dessins

Les noms sont ceux du code (`MakeupObject name=…`, `LineDrawing name=…`). Le chemin est celui du fichier dans le dépôt IconPark.

| Nom | Fichier source (`source/…`) | Auteur | Licence | Modification |
|---|---|---|---|---|
| `lipstick` | `Makeups/lipstick-one.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `brush` | `Makeups/cosmetic-brush.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `compact` | `Makeups/face-powder.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `mirror` | `Makeups/mirror-two.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `mascara` | `Makeups/mascara.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `nail-polish` | `Makeups/nail-polish-one.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `perfume` | `Clothes/perfume.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `comb` | `Makeups/comb.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `lips` | `Makeups/mouth.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |
| `eye` | `Makeups/eyebrow.svg` | ByteDance (IconPark) | Apache-2.0 | contour seul, voir « Modifications communes » |

### Modifications communes (Apache-2.0, art. 4 b)

Faites par `scripts/art/extract-drawings.ts`, qui relit les fichiers d'origine et réécrit `src/components/art/drawings.ts` :

- les remplissages bleus à deux tons sont retirés (contour seul) ; les traits blancs de détail deviennent de simples traits ; les remplissages blancs sans trait (reflets, trous) sont retirés ;
- les couleurs, l'épaisseur de trait d'origine (4) et les extrémités sont retirées : le composant dessine chaque forme en `currentColor`, extrémités et jointures arrondies, avec **une seule épaisseur pour toute la famille** (variable CSS `--art-drawing-stroke`, `.art-drawing` dans `globals.css`) ;
- le chemin de découpe (`clip-path`) de `brush` est retiré (il couvrait toute la grille, sans effet) ;
- le balisage est réduit à des formes nues (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`) avec leur seule géométrie : ni script, ni style, ni lien, ni métadonnée, ni commentaire, ni espace de noms d'éditeur ;
- la grille de 48 est gardée : tous les dessins ont la même échelle et le même poids.

Ce qui est copié mot pour mot : les coordonnées des formes.

## Ce qui n'a pas été trouvé en vrai SVG

Rien de ce qui suit n'existe dans IconPark, ni dans les autres jeux libres vérifiés (Phosphor, Tabler, Lucide, Iconoir, Remix, Material Design Icons) : plutôt que de mélanger une seconde famille ou de dessiner à la main, ils sont **retirés** :

- éponge à fond de teint, pince à cils : retirées (les emplacements prennent le parfum et le peigne) ;
- dessin « profil » et dessin « main qui tient un pinceau » : retirés (le pinceau en objet les remplace dans le pied de page et l'invitation à l'action) ;
- balayages de pinceau (`Swash`) : retirés, aucune page ne les utilisait.

## Les jeux regardés et écartés

| Jeu | Licence | Pourquoi écarté |
|---|---|---|
| Phosphor, Tabler, Lucide, Iconoir, Remix | MIT, ISC, Apache-2.0 | ni rouge à lèvres, ni mascara, ni poudrier, ni vernis (seulement pinceau, miroir, parfum) |
| Material Design Icons | Apache-2.0 | rouge à lèvres, pinceau, miroir seulement, trait plein, autre famille |
| game-icons.net | CC BY 3.0 | silhouettes pleines de plusieurs auteurs (styles mélangés), mention d'auteur obligatoire |
| OpenMoji | CC BY-SA 4.0 | partage à l'identique, refusé |
| Streamline, Solar | CC BY 4.0 | mention obligatoire, évitée dès qu'une famille libre sans mention suffit |
| IconOven | MIT (annoncée) | jeu récent de 18 000 icônes d'une agence : aucun fichier de licence ni auteur humain vérifiés, écarté |
