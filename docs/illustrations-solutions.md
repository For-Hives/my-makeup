# Les illustrations des pages Solutions (issue 1136)

Ce document garde **de quoi refaire** les neuf illustrations générées par IA des deux pages du menu « Solutions » : le modèle, les réglages, les prompts, la date et ce que ça a coûté. Même recette que les couvertures du blog (branche `feat/blog-images`, document `illustrations.md` de cette branche). La direction artistique est dans [`direction-artistique.md`](direction-artistique.md).

Demande d'Andy du 27/10/2026 : « fais la même chose (illustration) pour les "solutions" et les images là-dedans ». Le menu « Solutions » de la barre (`NAVIGATION`, `src/components/layout/links.ts`) a deux pages ; les deux pages « Pourquoi… » et les guides n'y sont pas, elles ne sont pas touchées ici.

## Les emplacements

| Page | Emplacement | Format | Fichier | Intention |
|---|---|---|---|---|
| `/solutions/pour-les-particuliers` | arche de la tête (`ClientGuide` puis `PageHead`, prioritaire) | arche 4:5, 1000 x 1250 | `particuliers-head.webp` | trouver sa maquilleuse, une recherche simplifiée : une cliente détendue, son téléphone en main |
| idem | étape « Une recherche simplifiée » | large 3:2, 1200 x 800 | `particuliers-search.webp` | chercher par événement et par lieu : un ordinateur, une carte avec un repère |
| idem | étape « Comparez et choisissez » | large | `particuliers-compare.webp` | comparer des profils vérifiés : trois cartes en arche, trois coiffures |
| idem | étape « Contactez directement la maquilleuse » | large | `particuliers-contact.webp` | écrire directement : une cliente et son téléphone |
| idem | étape « Des profils présentés par les maquilleuses » | large | `particuliers-profils.webp` | la maquilleuse présente elle-même son travail : classeur, nuancier, ordinateur |
| `/solutions/pour-les-maquilleuses` | arche de la tête (`PageHead`, arche à gauche, prioritaire) | arche 4:5 | `artistes-head.webp` | une maquilleuse professionnelle, mallette ouverte et miroir |
| idem | partie « Accédez à une base de clients plus large » | large | `artistes-clients.webp` | une maquilleuse entourée de cinq clientes de peaux et de coiffures différentes |
| idem | partie « Présentez votre travail et vos compétences » | large | `artistes-vitrine.webp` | sa page : ordinateur, tableau de liège, pinceaux |
| idem | partie « Restez maîtresse de votre activité » | large | `artistes-agenda.webp` | téléphone en main, agenda ouvert, mallette |

Les parties « Une question ? » (les deux pages) et la cinquième étape n'ont pas d'image : ce sont des appels à écrire à l'équipe, sans scène à montrer.

## La logique

- `src/components/art/solution-image.tsx` : `solutionImage(nom)` rend l'adresse du fichier ou `null` s'il manque (vérifié à la construction de la page) ; `SolutionPicture` affiche une image large (`next/image`, 1200 x 800 explicites, `alt=""`, chargement différé, coins arrondis).
- **Repli** : un fichier manquant laisse l'ancienne illustration dans l'arche de la tête, et aucune image sous l'étape ou la partie. Testé (`tests/unit/solutions-images.test.tsx`).
- Les étapes portent un champ facultatif `image` (`GuideStep`), `PageArticle` un paramètre `images` : aucune autre page ne change.
- Fichiers : `public/assets/solutions/`, WebP qualité 82, sans métadonnées, 28 à 44 Ko chacun (environ 340 Ko les neuf). `magick in.png -resize 1000x1250 -strip -define webp:method=6 -quality 82 out.webp` (arches, depuis 1024 x 1280) ; `-resize 1200x800` (larges, depuis 1536 x 1024).

## La recette

- **Modèle** : `openai/gpt-image-2.5/flare/text-to-image`.
- **Réglages** : `quality` `high`, `background` `opaque`, `num_images` 1, `output_format` `png` ; `image_size` `{ "width": 1024, "height": 1280 }` pour les arches, `{ "width": 1536, "height": 1024 }` pour les larges. Une exécution par image.
- **Prompt** : `Soft editorial gouache illustration, premium fashion magazine feel, {wide landscape | tall portrait} composition. {SCÈNE} Composition: {CADRAGE} Dry-brush gouache texture with visible gentle brush strokes, flat shapes, refined and minimal. Palette strictly limited: off-white paper background (#F1ECE7), blush pink, pale lavender, and deep indigo accents; muted and calm, no saturated colours, no neon, no black splatter. Lots of empty paper space around the subject. No text, no letters, no logo, no watermark, no border, no flowers, no sparkles. Not a portrait of any real person.`
- **Cadrage** : larges, `the subject is centred, filling about 70% of the height and 60% of the width of the frame, with a clear band of empty paper above and below (at least 15% each) and wide empty paper on both sides.` ; arches, `... filling about 65% of the height and 60% of the width ... a clear band of empty paper above (at least 18%) and below, ... so the image can be cropped to an arch shape without cutting anything.`

| Fichier | Scène (telle que lancée) |
|---|---|
| `particuliers-head` | A young woman with light olive skin and a short wavy bob, in a pale lavender cardigan, sits in a cushioned armchair beside a tall arched window, smiling as she looks at a smartphone with a blank screen; a small round side table next to her holds a cup and a round hand mirror. |
| `particuliers-search` | A woman with tan skin and a high ponytail, in a pale blush sweater, sits at a small round table with an open laptop with a blank screen, a cup beside it and a simple paper map with a round indigo pin marker and no labels propped on the table. |
| `particuliers-compare` | A woman with deep brown skin and a pale lavender headwrap sits at a table and looks thoughtfully at three arch-shaped profile cards propped upright in a row, each card holding a simple faceless painted portrait of a makeup artist with a different hairstyle (a bun, curls, a bob) in blush, lavender and indigo; no text on the cards. |
| `particuliers-contact` | A woman with fair skin and a long auburn braid, in a pale lavender blouse, sits on a window seat smiling while she types a message on a smartphone with a blank screen; behind her a small vanity with a round mirror. |
| `particuliers-profils` | A makeup artist with medium-brown skin and a neat bun, in a deep indigo smock, sits at a desk and fills in her own presentation page on a laptop with a blank screen, an open portfolio binder with blank painted colour swatches and a jar of brushes beside it. |
| `artistes-head` | A confident makeup artist with light brown skin and shoulder-length wavy black hair, in a deep indigo smock, stands holding a soft makeup brush, an open pale lavender makeup case on a stool beside her and a round mirror on a stand. |
| `artistes-clients` | A makeup artist with tan skin and a low ponytail, in a pale lavender smock, stands in the centre at a gentle distance from five simplified seated clients arranged in a loose arc around her, each with different skin tones and hairstyles (straight, curly, braided, short, a headscarf), their faces drawn simply with no detail; a small round blush pin shape above the artist. (cadrage : 70 % de la hauteur et de la largeur) |
| `artistes-vitrine` | A makeup artist with deep brown skin and natural curly hair, in a blush top, sits at a desk with an open laptop with a blank screen; behind her a pinboard with a few blank painted colour swatches and an empty frame; a mug and a jar of brushes on the desk. |
| `artistes-agenda` | A makeup artist with olive skin and a short pixie cut, in an indigo smock, sits at a small table holding a smartphone with a blank screen in one hand and an open paper planner with blank pages in front of her, her makeup case open on the floor beside her and a round mirror on the wall; calm and in charge. |

Les peaux, les cheveux et les âges varient d'une image à l'autre. Aucune personne réelle ; aucun écran, aucune carte ni aucun carnet ne porte de texte.

## Ce que la génération a coûté

9 exécutions de fal le 27/10/2026 (plafond de la tâche : 4,00 USD), une par image, aucune refaite. Aucun outil ne renvoie le coût réel d'une image de ce modèle (facturation au jeton) : **estimation de 0,25 USD l'image, soit environ 2,25 USD**, à vérifier sur le compte fal. Journal : [`illustrations-solutions-cost.txt`](illustrations-solutions-cost.txt). Les PNG d'origine ne sont pas dans le dépôt : ils se refont avec la recette.

## Droits : à lire par Andy

- **Aucun droit d'auteur n'est revendiqué** sur ces images : le droit d'auteur sur une œuvre générée par IA est incertain selon les pays. Aucune garantie d'originalité ni de droit exclusif.
- **Les conditions de fal** (<https://fal.ai/terms>) et **celles d'OpenAI** (le modèle `gpt-image-2.5` appelé par fal) sur la propriété et l'usage commercial des sorties sont **à relire par Andy** avant de s'appuyer sur ces images (voir aussi `credits-svg.md`, « Droits »).
- Aucune marque, aucun nom de personne, aucun texte dans les prompts ; les visages sont inventés.
