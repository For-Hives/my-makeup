# Les illustrations générées (issue 1136)

Ce document garde **de quoi refaire** chaque illustration générée par IA du site : le modèle, les réglages, le prompt et la date. Les dessins SVG du kit (objets, icônes) sont dans [`credits-svg.md`](credits-svg.md), la direction artistique dans [`direction-artistique.md`](direction-artistique.md).

Aujourd'hui : **les dix couvertures du blog** (26/10/2026) et **les trois dessins ronds de la communauté de l'accueil** (27/10/2026, section en bas de ce document). Les autres emplacements d'illustration sont listés dans la table « Emplacements d'illustration à générer » de `direction-artistique.md`.

## Les couvertures du blog

Demande d'Andy du 26/10/2026 : « pour le blog, il faut qu'on génère des images cohérentes avec le reste plutôt que les SVG ». Les articles n'ont pas d'image dans la base (la lecture publique ne sort que le titre, l'adresse, l'extrait et la date). Les panneaux teintés avec des objets dessinés sont donc remplacés par des illustrations générées, choisies **à partir de l'adresse de l'article**.

### La logique

- Code : `src/components/art/blog-cover.ts` (`blogCover(slug)`), affichage dans `BlogPanel` (`src/components/art/BlogCard.tsx`).
- **Un article dont le sujet a son illustration la prend** (table ci-dessous, les dix articles du site en ligne au 26/10/2026) ; **tout autre article en tire une du lot de dix** par un hachage stable de son adresse (`pick`, comme `blogArt`). La même illustration sert la carte de la liste, la grande carte, les « À lire aussi » et le haut de l'article.
- **Repli** : si le lot est vide (`blogCover` rend `null`), `BlogPanel` dessine l'ancien panneau teinté (`blogArt`, objets du kit). Le repli est testé ; il ne se voit pas tant que les fichiers sont là.
- Pas de champ « image » dans les articles : aucun changement de schéma, aucune migration. Quand l'équipe voudra une image par article, un champ `cover` passera avant ce choix (l'image de l'article d'abord, puis la table, puis le lot).

| Article (adresse) | Illustration | Ce qu'elle montre |
|---|---|---|
| `essai-maquillage-mariee` | `makeup-trial` | une maquilleuse poudre la joue d'une mariée assise, voile sur le fauteuil |
| `quand-reserver-maquilleuse-mariage` | `wedding-morning` | robe de mariée, fenêtre en arche, coiffeuse et pinceaux, personne |
| `prix-maquillage-mariee-2027` | `product-flat-lay` | poudrier, rouge, trois pinceaux, palette, miroir, éponge sur un tissu rose, vus de dessus |
| `fiche-google-maquilleuse` | `online-presence` | une maquilleuse (peau brune, cheveux bouclés) à son bureau, ordinateur et téléphone aux écrans vides |
| `choisir-maquilleuse-professionnelle-evenement` | `evening-look` | un maquillage de soirée : robe indigo, miroir rond, rouge à lèvres |
| `conseils-maquillage-professionnels-debutants` | `beginner-practice` | une débutante s'entraîne sur elle-même, miroir à main, palette, trousse de pinceaux |
| `conseils-visibilite-maquilleuse-professionnelle` | `photo-shoot` | un shooting : maquilleuse, modèle, boîte à lumière |
| `cout-maquilleuse-professionnelle-guide-tarifs` | `skincare-moment` | un geste de soin devant un miroir rond (illustration neutre, côté cliente) |
| `maximiser-investissement-maquilleuse-professionnelle` | `pro-kit-case` | une mallette de maquilleuse ouverte, plateaux rangés, sur un tabouret |
| `tendances-maquillage-professionnel` | `trend-profile` | un mannequin de profil, manteau lavande, cinq pastilles de couleur |

Les peaux, les cheveux et les âges varient d'une image à l'autre (peau claire, olive, mate, brune ; cheveux lisses, bouclés, en chignon, au carré). Aucune personne réelle.

### Les fichiers

- `public/assets/blog/<nom>.webp`, **1200 x 800** (3:2), WebP qualité 82, sans métadonnées, 27 à 42 Ko chacun (environ 360 Ko pour les dix). Convertis depuis les PNG de 1536 x 1024 de fal : `magick in.png -resize 1200x800 -strip -define webp:method=6 -quality 82 out.webp`.
- **Chargement** : la grande carte de la liste et l'image du haut d'un article sont le LCP de leur page (mesuré le 26/10/2026 sur le banc : l'élément `IMG` à 1440 et 390 px, CLS 0) : elles sont en `priority` (préchargées) ; les cartes de la grille et des « À lire aussi » se chargent au défilement.
- Servis par `next/image` (`width` et `height` explicites, donc aucun décalage de mise en page ; `sizes` par forme ; `alt=""` : ce sont des décors, le titre dit tout).
- **Le cadrage** : le sujet tient dans la zone centrale de l'image (environ 70 % de la hauteur, 60 % de la largeur) avec du papier autour, de sorte que le même fichier se recadre en 5:4 (carte), 4:3 (grande carte) et 16:7 (haut d'article) par `object-fit: cover`. Les cartes (5:4, 4:3) ne rognent que les côtés ; la bannière 16:7 du haut d'article garde 66 % de la hauteur et les sujets en occupent environ 80 % : `position` (dans `BLOG_COVERS`, en `center N%`) dit où la couper pour garder les têtes (le haut du sujet moins 20 px, mesuré sur chaque fichier). On y voit donc les personnages à mi-corps ; seules les scènes basses (le flat-lay, le bureau) tiennent entières.
- Une nouvelle illustration : la générer avec la recette ci-dessous, la convertir, la déposer dans `public/assets/blog/`, l'ajouter à `BLOG_COVERS` (en fin de liste : l'ordre du lot décide de l'illustration des articles qui n'ont pas la leur, l'ajouter au milieu en changerait) et à `DEDICATED` si un article l'attend.

### La recette

- **Modèle** : `openai/gpt-image-2.5/flare/text-to-image` (essayé par l'équipe contre `nano-banana-pro` : c'est lui qui donne la gouache la plus douce).
- **Réglages** : `image_size` `{ "width": 1536, "height": 1024 }`, `quality` `high`, `background` `opaque`, `num_images` 1, `output_format` `png`. Une exécution par image.
- **Prompt** : `Soft editorial gouache illustration, premium fashion magazine feel, wide landscape composition. {SCÈNE} Composition: {CADRAGE} so the image can be cropped to a wide banner without cutting anything. Dry-brush gouache texture with visible gentle brush strokes, flat shapes, refined and minimal. Palette strictly limited: off-white paper background (#F1ECE7), blush pink, pale lavender, and deep indigo accents; muted and calm, no saturated colours, no neon, no black splatter. Lots of empty paper space around the {SUJET}. No text, no letters, no logo, no watermark, no border, no flowers, no sparkles. Not a portrait of any real person.`
- **Cadrage** : `the {SUJET} {est/sont} centred, filling about 70% of the height and 60% of the width of the frame, with a clear band of empty paper above and below (at least 15% each) and wide empty paper on both sides,`. Mesuré le 26/10/2026 : sans cette phrase, le sujet remplit toute la hauteur et le haut d'article (16:7) lui coupe la tête ; avec « 55 % », il est trop petit (environ 35 % de l'image) ; **70 % et 60 %** donnent environ 80 % de la hauteur (le modèle compte large) : les cartes montrent tout, le 16:7 coupe le bas. Pour des sujets qui tiennent entiers dans le 16:7, demander « 50 % de la hauteur ».

Les scènes (la partie `{SCÈNE}`, en anglais, telle que lancée) :

| Illustration | Scène |
|---|---|
| `makeup-trial` | A makeup artist in a deep indigo smock gently applies powder blush with a soft brush to a seated bride in a pale lavender robe, her hair in a loose low updo with a sheer veil resting on the back of the chair. |
| `wedding-morning` | A wedding gown hanging on a slim rail beside a tall arched window, a small vanity table next to it with a round mirror and a roll of makeup brushes, a pale cushioned stool, quiet morning light; no people. |
| `product-flat-lay` | A flat-lay seen from above of a makeup artist's essentials resting on a soft blush-pink cloth: a round powder compact, a lipstick, three brushes of different sizes, an eyeshadow palette, a small hand mirror and a beauty sponge, arranged with calm spacing. |
| `online-presence` | A freelance makeup artist with deep brown skin and natural curly hair, wearing a pale lavender shirt, sits at a small desk looking at a laptop with a blank screen and holding a smartphone with a blank screen, an open makeup case with brushes beside her. |
| `evening-look` | An evening look: a woman with long straight black hair, light olive skin and an elegant deep indigo satin gown sits at a vanity facing a round mirror while a makeup artist in a pale blush top with a bob haircut gently applies lipstick to her. |
| `beginner-practice` | A young beginner makeup artist with medium-brown skin and a short bob, in a pale lavender apron, practises on her own face: she holds a small hand mirror in one hand and a soft eyeshadow brush in the other, an open eyeshadow palette and a roll of brushes on the table in front of her. |
| `photo-shoot` | A small photo shoot: a model with deep brown skin, a sleek low bun and a soft blush lip stands in a pale lavender jacket, while a makeup artist in an indigo smock lightly touches up her cheek with a brush, and a simple photographer's softbox light on a stand stands to one side; no camera text. |
| `skincare-moment` | A calm skincare moment: a woman with light skin and loose wavy auburn hair held back by a pale blush headband, wearing a lavender robe, gently smooths a cream on her cheek in front of a round mirror, a small jar and a bottle on a shelf beside the mirror. |
| `pro-kit-case` | A professional makeup artist's open case on a pale lavender stool, seen at a gentle three-quarter angle: tiered trays holding neatly sorted brushes, palettes, compacts and small bottles; no people, no hands, no arms, nothing floating. The case itself is pale lavender with soft indigo trim and blush pink trays, light and airy, not dark. |
| `trend-profile` | A fashion model with tan skin seen in profile, a sleek low bun, a glossy blush-pink lip and an oversized pale lavender coat with a deep indigo collar, standing calmly; beside her on the paper a row of five round colour swatches painted in blush, lavender and indigo shades. |

### Ce que la génération a coûté

13 exécutions de fal le 26/10/2026 (plafond de la tâche : 4,00 USD). Aucun outil ne renvoie le coût réel d'une image de ce modèle (facturation au jeton, « 1 USD l'unité » dans le tarif) : **estimation de 0,25 USD l'image, soit environ 3,25 USD**, à vérifier sur le compte fal.

| Exécutions | Pour quoi |
|---|---|
| 3 | l'essai du cadrage sur la scène `makeup-trial` (sans consigne : sujet qui remplit le cadre ; « 55 % » : trop petit ; « 70 % » : retenu) |
| 9 | les neuf autres scènes, du premier coup |
| 1 | `pro-kit-case`, refaite : la première avait un bras flottant sans corps et une mallette sombre et lourde |

Le journal des exécutions (date, modèle, réglages, estimation) est [`illustrations-cost.txt`](illustrations-cost.txt). Les PNG d'origine (2 Mo chacun) ne sont pas dans le dépôt : ils se refont avec la recette.

### Droits : à lire par Andy

- **Aucun droit d'auteur n'est revendiqué** sur ces images : le droit d'auteur sur une œuvre générée par IA est incertain selon les pays. Aucune garantie d'originalité ni de droit exclusif.
- **Les conditions de fal** (<https://fal.ai/terms>) et **celles d'OpenAI** (le modèle `gpt-image-2.5` appelé par fal) sur la propriété et l'usage commercial des sorties sont **à relire par Andy** avant de s'appuyer sur ces images (voir aussi `credits-svg.md`, « Droits »). Les conditions d'OpenAI n'ont pas pu être relues automatiquement (page en 403 le 26/10/2026).
- Aucune marque, aucun nom de personne, aucun texte dans les prompts ; aucune personne réelle n'est visée. Les visages sont inventés.

## Les trois dessins de la communauté de l'accueil (27/10/2026)

Demande d'Andy du 27/10/2026 : les trois images de la section « communauté » (`COLUMNS` dans `src/components/home/Presentation.tsx`) n'étaient pas dans le thème du site (visages en éclaboussures néon sur fond noir). Elles sont remplacées par des gouaches éditoriales de la même famille que les couvertures du blog.

- **Fichiers** : `public/assets/illustrations/community-clients.webp` (« Des particuliers »), `community-artists.webp` (« Des maquilleuses professionnelles »), `community-solution.webp` (« Une solution dédiée »). **512 x 512, fond transparent**, WebP qualité 88 (alpha 100) par `finir.py` du skill `fal-images` (rognés au contenu, centrés, remplissage 94 %), 49 à 53 Ko. Affichés dans un rond de 7 rem teinté (blush, lavande, sable) en `object-contain p-2` : la teinte du rond sert de fond. Les anciens `illustration.webp`, `illustration_2.webp`, `illustration_3.webp` sont supprimés (plus utilisés).
- **Modèle** : `openai/gpt-image-2.5/flare/text-to-image`. **Réglages** : `image_size` `{ "width": 1024, "height": 1024 }`, `quality` `high`, **`background` `transparent`** (alpha réel, sans halo mesuré), `num_images` 1, `output_format` `png`. Une exécution par image, sans image de référence.
- **Prompt** : `Soft editorial gouache illustration, premium fashion magazine feel, square composition. {SCÈNE} Bold readable shapes, readable when shrunk to a small icon. Composition: {SUJET} centred, filling about 70% of the frame, with a clear margin of empty space on all sides. Dry-brush gouache texture with visible gentle brush strokes, flat shapes, refined and minimal. Palette strictly limited: blush pink, pale lavender, and deep indigo accents; muted and calm, no saturated colours, no neon, no black splatter. Isolated on a fully transparent background, no paper, no backdrop, no shadow on the ground. No text, no letters, no logo, no watermark, no border, no flowers, no sparkles. Not a portrait of any real person.`
- **Scènes** :

| Illustration | Scène |
|---|---|
| `community-clients` | A young woman with light olive skin and a shoulder-length wavy chestnut bob, in a pale lavender knit top, seen from the waist up, looks down at a smartphone she holds in both hands; a large round map-pin marker in deep indigo with a blush-pink centre floats just above the phone. |
| `community-artists` | Two professional makeup artists seen from the waist up, side by side: on the left a woman with deep brown skin and a high natural curly puff hairstyle, in a deep indigo smock, holding a soft powder brush up; on the right a woman with light skin and a sleek dark-red low bun, in a blush-pink smock, holding an open eyeshadow palette. |
| `community-solution` | A client and a makeup artist meet and talk, seen from the waist up, facing each other: on the left a woman with medium tan skin and long straight black hair in a pale lavender top, on the right a makeup artist with light brown skin and a short natural bob, in a deep indigo smock; between and above them a single large rounded blush-pink speech bubble containing a deep indigo heart, no words. |

- **Jugées au vrai format** : une planche avec chaque image dans son rond de 112 px (et 224 px pour l'écran retina) sur sa teinte. Une seule exécution par image a suffi ; le pilote (`community-clients`) a tenu à 112 px, les deux autres ont suivi la même recette.
- **Coût** : 3 exécutions, **estimation de 0,25 USD l'image, soit environ 0,75 USD** (aucun outil ne renvoie le coût réel) ; journal dans [`illustrations-cost.txt`](illustrations-cost.txt).
- **Droits** : les mêmes que pour les couvertures du blog (voir « Droits : à lire par Andy » plus haut) : aucun droit d'auteur revendiqué, conditions de fal et d'OpenAI à relire par Andy ; aucune personne réelle, aucun texte.

## Les arches des pages de contenu (27/10/2026)

Demande d'Andy du 27/10/2026 : les photos des arches ne sont pas dans le thème du reste du site ; elles sont remplacées par des illustrations générées dans le même thème. Même modèle, mêmes réglages et même gouache que les couvertures du blog et que les pages Solutions ([`illustrations-solutions.md`](illustrations-solutions.md)).

### Les emplacements

14 illustrations pour 20 arches (les arches des avantages qui se ressemblent en partagent une, et le nombre d'images est tenu sous 14 pour le plafond de 4,50 USD). Aucun sujet ne revient d'une page à l'autre ; les sujets ne reprennent ni les couvertures du blog ni les pages Solutions.

| Page | Arche | Fichier | Sujet |
|---|---|---|---|
| `/blog` | tête (à droite, ordinateur seulement) | `blog-reading` | une lectrice aux cheveux gris dans un fauteuil, un magazine aux pages vides |
| `/maquilleuse/partenariats` | tête (à gauche) | `partnerships-shared-table` | deux maquilleuses côte à côte, une mallette ouverte partagée |
| `/particulier/trouver-une-maquilleuse` | tête | `find-greeting` | une cliente et une maquilleuse se serrent la main à la porte d'un studio |
| `/particulier/centraliser-ses-recherches` | tête | `gather-card-index` | une femme trie des fiches dans un fichier à tiroir, un tableau de liège derrière |
| `/particulier/explorer-les-profils` | tête | `explore-binders` | une femme ouvre un classeur dans un rayonnage de classeurs |
| « Pourquoi… maquilleuse » | avantages 1 et 5 | `artist-grow` | une maquilleuse à son bureau, des clientes qui arrivent au loin |
| idem | avantage 2 | `artist-skills` | une maquilleuse près d'un classeur de nuances et d'une trousse |
| idem | avantages 3 et 8 | `artist-rates` | une maquilleuse, une valise à roulettes, une étiquette vierge, un calendrier |
| idem | avantages 4 et 7 | `artist-share` | une maquilleuse photographie ses pinceaux et sa palette avec son téléphone |
| idem | avantage 6 | `artist-community` | trois maquilleuses de looks différents, ensemble |
| « Pourquoi… particulier » | avantages 1 et 5 | `client-gallery` | une jeune femme devant un mur de portraits en arche |
| idem | avantages 2 et 7 | `client-sofa` | une femme sur un canapé, une tablette, une tasse de thé |
| idem | avantages 3 et 6 | `client-profile-sheet` | une femme lit une fiche de profil, un éventail de nuances |
| idem | avantage 4 | `client-moodboard` | une femme devant un tableau d'inspiration de nuances |

Le choix de l'image d'un avantage se fait par sa position dans la liste (`ARTIST_PALETTE.images`, `CLIENT_PALETTE.images` dans `Benefits.tsx`) ; sans `images`, l'arche garde l'objet de maquillage dessiné. Les images des têtes sont dans le code des pages (`image=`), celle du blog dans `blog/page.tsx`. Les anciennes photos `public/assets/back/maquilleuse_*_white.webp` restent : les pages de talent, les pages de zone, À propos et l'image par défaut de `PageHead` s'en servent encore. Les alt des têtes sont inchangés ; les arches des avantages et du blog sont des décors (`alt=""`).

### Les fichiers

`public/assets/illustrations/<nom>.webp`, WebP qualité 82, sans métadonnées : **800 x 1000** pour les têtes (arche de 380 px), **600 x 750** pour les avantages (96 à 260 px), 17 à 36 Ko chacun (environ 330 Ko pour les quatorze). Source : PNG de 1024 x 1280 ; `magick in.png -resize 800x1000 -strip -define webp:method=6 -quality 82 out.webp`. Les têtes de page ont `priority` (LCP sur téléphone, déjà en place) ; l'arche du blog, cachée sous 1024 px, et celles des avantages, sous la ligne de flottaison, se chargent au défilement.

### La recette

- **Modèle** : `openai/gpt-image-2.5/flare/text-to-image`, `image_size` `{ "width": 1024, "height": 1280 }`, `quality` `high`, `background` `opaque`, `num_images` 1, `output_format` `png`. Une exécution par image, aucune refaite.
- **Prompt** : celui des arches des pages Solutions : `Soft editorial gouache illustration, premium fashion magazine feel, tall portrait composition. {SCÈNE} Composition: the subject is centred, filling about 65% of the height and 60% of the width of the frame, with a clear band of empty paper above (at least 18%) and below, and wide empty paper on both sides, {her/their} head{s} in the upper third, so the image can be cropped to an arch shape without cutting anything. Dry-brush gouache texture with visible gentle brush strokes, flat shapes, refined and minimal. Palette strictly limited: off-white paper background (#F1ECE7), blush pink, pale lavender, and deep indigo accents; muted and calm, no saturated colours, no neon, no black splatter. Lots of empty paper space around the subject. No text, no letters, no logo, no watermark, no border, no flowers, no sparkles. Not a portrait of any real person.`
- Date : 27/10/2026.

| Fichier | Scène (telle que lancée) |
|---|---|
| `blog-reading` | A woman in her fifties with silver-grey wavy hair and warm medium skin, in a pale lavender knit cardigan, sits curled up in a cushioned armchair reading an open magazine with blank painted pages, a small round side table beside her holds a cup and a stack of two books. |
| `partnerships-shared-table` | Two makeup artists work side by side at a long shared worktable, one with deep brown skin and short natural curls in a deep indigo smock, the other with light skin and a low bun in a pale lavender smock, sharing one open pale pink makeup case between them and smiling at each other, brushes in hand. |
| `find-greeting` | A woman with tan skin and a high ponytail, in a pale blush sweater, stands in a bright studio doorway and shakes hands warmly with a makeup artist with olive skin and a sleek bob in a deep indigo smock who holds a round makeup case, a small round mirror on the wall behind them. |
| `gather-card-index` | A woman with fair skin and short auburn hair, in a pale lavender blouse, sits at a tidy desk sorting small blank painted cards into a wooden card-index box, a pinboard behind her holding a few blank cards joined by a simple indigo string, a cup on the desk. |
| `explore-binders` | A woman with deep brown skin and a short natural afro, in a pale blush top, stands in front of a tall bookshelf-like rack of portfolio binders in blush, lavender and indigo, pulling one binder out and opening it with curiosity. |
| `artist-grow` | A makeup artist with light brown skin and a neat bun, in a deep indigo smock, sits at a desk and looks happily at a laptop with a blank screen, a phone with a blank screen beside it, and a few small people-shaped chairs of clients arriving in the distance as simple faceless silhouettes in blush and lavender, suggesting a growing clientele. |
| `artist-skills` | A makeup artist with olive skin and long dark wavy hair, in a pale lavender smock, stands beside an open portfolio binder on a stand showing blank painted colour swatches and an open case of brushes, a framed certificate-like empty frame on the wall behind her; calm and proud. |
| `artist-rates` | A makeup artist with medium skin and a short pixie cut, in a blush top, stands calmly with one hand on a rolling makeup case and the other holding a small blank price tag tied to its handle, a wall calendar of blank pages behind her and a round mirror, relaxed and in charge of her own time. |
| `artist-share` | A makeup artist with deep brown skin and braids tied up, in a pale lavender top, sits on a sofa and takes a photo with a smartphone of a tidy flat-lay of her brushes and a palette on a blush cloth on a low table in front of her, sharing her work with a smile. |
| `artist-community` | Three makeup artists of different looks stand close together laughing, one with deep brown skin and a headwrap, one with light skin and short red hair, one with tan skin and long straight black hair, all in indigo, lavender and blush smocks, one holding a brush, one a compact mirror, one a case. |
| `client-gallery` | A young woman with light brown skin and a long braid, in a pale lavender dress, stands in a small gallery looking up at a wall of many arch-shaped framed faceless painted portraits in blush, lavender and indigo, arranged in a tidy grid, one hand raised toward her favourite. |
| `client-sofa` | A woman with olive skin and a loose low bun, in a pale blush shirt, relaxes on a sofa with a cushion, a tablet with a blank screen on her lap and a cup of tea beside her, looking pleased as if she found just what she wanted. |
| `client-profile-sheet` | A woman with medium-brown skin and short curly hair, in a pale lavender cardigan, stands at a table reading a printed profile sheet with a blank painted portrait square and neat blank lines, a fan of blush, lavender and indigo colour swatches and a small stack of sheets beside her, thoughtful and reassured. |
| `client-moodboard` | A woman with fair skin and a wavy blonde bob, in a pale blush sweater, stands in front of a large moodboard pinboard with blank painted colour swatches in blush, lavender and indigo and a few blank painted sample squares, holding one swatch up to the light, dreaming up her beauty project. |

### Ce que la génération a coûté

14 exécutions de fal le 27/10/2026 (une par image, aucune refaite ; plafond de la tâche : 4,50 USD). Aucun outil ne renvoie le coût réel (facturation au jeton) : **estimation de 0,25 USD l'image, soit environ 3,50 USD**, à vérifier sur le compte fal.

### Droits

Les mêmes réserves que plus haut : aucun droit d'auteur n'est revendiqué, les conditions de fal et d'OpenAI sont à relire par Andy, aucune personne réelle, aucun texte dans les images.
