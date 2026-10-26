# Crédits des dessins SVG

Tous les dessins et toutes les icônes du site public et de l'espace maquilleuse forment **un seul jeu sur mesure**, fait pour ce site (décision d'Andy du 26/10/2026). Il remplace les deux jeux d'icônes libres d'avant (IconPark pour les objets de maquillage, des icônes de trait posées à la main ou reprises de Heroicons pour l'interface). Les règles de la direction artistique sont dans [`direction-artistique.md`](direction-artistique.md).

## Ce que c'est

- 19 objets, 2 dessins au trait, 20 icônes d'interface : **41 SVG**, listés ci-dessous.
- Chaque icône est **un seul chemin rempli** (`fill-rule="evenodd"`, `fill="currentColor"`) sur une grille de 24, sans trait, sans style, sans lien, sans métadonnée, de moins de 6 Ko. Sa ligne est épaisse d'environ 0,95 unité pour les objets et les dessins (4 % de la boîte) et de 1,1 pour les icônes d'interface, avec des bouts arrondis : **un seul poids par famille**. La première version avait 1,375 (5,7 %) ; Andy l'a trouvée trop grasse (26/10/2026) et le contour fini de chaque icône a été aminci d'environ 0,2 par côté (6 icônes tracées et 35 dessinées).
- Les fichiers sources sont `scripts/art/icons/<nom>.svg`. `scripts/art/build-drawings.ts` les lit (lecteur HTML, jamais de motif sur le balisage), refuse tout ce qui n'est pas un chemin, et écrit `src/components/art/drawings.ts` (objets, dessins) et `src/components/art/icons.ts` (interface). `scripts/art/icon-origins.ts` dit l'origine de chacune. Un test (`tests/unit/art-forbidden.test.ts`) garde l'ensemble : chaque icône a sa ligne ici avec son origine, sa source et un chemin identique à celui des données.

## Comment elles sont faites

**Origine « Généré par IA, tracé »** (6 icônes : `lipstick`, `brush`, `nail-polish`, `sponge`, `eyeshadow-palette`, `lips`) :

1. Une planche de 13 icônes au trait est générée par fal, modèle `openai/gpt-image-2.5/flare/text-to-image`, `image_size` 1920 x 1152, `quality` `high`, une image. Le prompt (en anglais) : « An icon sheet: a clean 5 columns by 3 rows grid on a pure white background, 13 separate line icons of makeup objects (the last two cells empty), each centered in its own invisible square cell with generous equal margins, nothing touching the cell edges, no text, no labels, no grid lines. Style: ULTRA-SIMPLIFIED minimal icons in the spirit of Lucide, Feather and Phosphor: single-weight bold monoline outline, uniform thick stroke about 6% of the cell width, dark indigo #312E81, round line caps and round joins, no fill, no shading, no gradients, no sparkles, no flowers. Only the essential contours: at most 6 strokes per icon, NO double outlines, NO inner decorative lines, NO hatching, every gap between two lines at least three times the stroke width, straight lines perfectly straight, circles perfectly round, clean geometric construction like a vector icon set. Row 1: (1) lipstick: a square-shouldered tube base, a narrower mid ring and a clearly slanted bullet tip, (2) makeup brush: a plain rounded fan-shaped bristle head, a short tapered ferrule and a slim handle, no bristle lines inside, (3) round powder compact: a circle for the lid and a wide flat ellipse below, with one small hinge notch, nothing inside, (4) hand mirror: one big plain circle on a short handle, nothing inside the circle, (5) mascara: a tall slim tube standing upright next to a separate wand: a thin rod ending in a plain elongated oval bristle head with 3 short tick marks on each side. Row 2: (6) nail polish: a squat wide bottle with a big round cap on a narrow neck, outline only, (7) eyelash curler seen from the front: a wide rounded-rectangle frame with a smooth curved crescent pad, a small hinge circle below it and two round finger loops hanging below, (8) beauty sponge: a plain egg-shaped teardrop, (9) eyeshadow palette: a rectangular case with exactly 6 round pans in 2 rows of 3, (10) perfume bottle: a round bottle, a short neck, a small spray nozzle and a round atomizer bulb on a loop. Row 3: (11) wide-tooth comb: a handle bar with exactly 5 wide-spaced teeth, (12) lips: a pair of full lips with one mouth line, (13) an open eye: an almond shape with a round iris and 3 lashes above and a single brow arc above. Flat vector line art, perfectly even line weight. »
2. Chaque case est découpée, puis ouverte dans VectorCraft. `imageTrace.makeAndExpand` (noir et blanc, seuil 150, traits seuls, largeur maximale de ligne 30) en tire des **lignes centrales**. L'icône est mise à l'échelle (centre de la planche, plus grande dimension 296 points sur 384), reçoit la ligne unique de 22 points (`stroke.set`, bouts et jointures arrondis), puis `object.path.outlineStroke`, `object.pathfinder.unite` et `object.path.simplify` en font un contour rempli. Export SVG sans métadonnée.
3. Un script remet les coordonnées sur la grille de 24, `svgo` optimise (aucune différence visible mesurée : au plus 0,15 % de pixels).
4. **Amincissement (26/10/2026)** : le décalage de tracé négatif de VectorCraft (`object.path.offsetPath`) remplit les trous des contours composés, il n'a pas servi. Le contour fini de chaque icône est rongé par un script (érosion de 0,2125 par côté pour les objets, 0,1375 pour l'interface, trous gardés), puis ajusté en courbes de Bézier à 0,03 unité près et optimisé par `svgo`. Aucun détail ne se ferme ; les fichiers de `scripts/art/icons/` sont les sources finales.

**Origine « Dessiné à la main »** (35 icônes) : la géométrie est écrite par nous dans VectorCraft (`draw_path`, `draw_shape` sur un plan de 24 x 24 points, ligne de 1,375, bouts et jointures arrondis), puis la même fin de chaîne (contour du trait, union, simplification, export, `svgo`). Quinze sont des objets ou des dessins (`comb`, `mascara`, `mirror`, `compact`, `perfume`, `eyelash-curler`, puis les huit objets ajoutés le 26/10/2026) ; l'**œil** a été redessiné à la main ce jour-là (amande à paupière nette, trois cils, sourcil, iris rond et pupille pleine) après que la version tracée a été jugée insuffisante. Toutes les icônes d'interface sont dessinées de cette façon.

Aucun jeu d'icônes tiers n'est repris. Une exception, qui n'est pas un dessin : les **logos officiels** Instagram, Facebook, LinkedIn et YouTube (`public/assets/brand/`) restent tels quels, car ce sont des marques de tiers qui servent à désigner leur réseau ; ils ne sont pas dans le jeu.

Le coût de fal de la première planche et des essais est consigné dans le journal du pilote (environ 0,9 USD, estimé : aucun outil ne renvoie le coût réel). Le travail du 26/10/2026 sur l'œil et les icônes ajoutées n'a lancé aucune génération fal.

## Droits : à lire par Andy

- **Sur les images produites par un modèle, aucun droit d’auteur n’est revendiqué** (le droit d'auteur sur une œuvre générée par IA est incertain selon les pays). Les icônes « tracées » partent d'une image générée et sont retouchées par nous ; les icônes « à la main » sont des dessins à nous, mais la famille doit rester homogène avec les premières. Aucune garantie d'originalité ni de droit exclusif.
- **Les conditions de fal** (<https://fal.ai/terms>, relues le 26/10/2026) ne disent pas expressément à qui appartient un contenu généré : elles ne donnent à l'utilisateur la propriété que de ses entrées, ne garantissent pas l'originalité du résultat, et prévoient l'usage par API dans une application destinée à des tiers. Rien n'y traite de la vente ou de la revendication des résultats.
- **Les conditions d'OpenAI** (modèle `gpt-image-2.5` appelé par fal) n'ont pas pu être relues automatiquement (la page a répondu 403) : **à relire** avant tout usage commercial, sur la propriété et l'usage des sorties.
- Aucune marque ni référence réelle n'est dans les prompts. Le rendu est générique ; aucune icône ne copie un jeu existant à notre connaissance.

## Les icônes

### Objets (`MakeupObject`)

| Nom | Origine | Fichier source | Sert à |
|---|---|---|---|
| `lipstick` | Généré par IA, tracé | `scripts/art/icons/lipstick.svg` | rouge à lèvres |
| `brush` | Généré par IA, tracé | `scripts/art/icons/brush.svg` | pinceau |
| `compact` | Dessiné à la main | `scripts/art/icons/compact.svg` | poudrier |
| `mirror` | Dessiné à la main | `scripts/art/icons/mirror.svg` | miroir |
| `mascara` | Dessiné à la main | `scripts/art/icons/mascara.svg` | mascara |
| `nail-polish` | Généré par IA, tracé | `scripts/art/icons/nail-polish.svg` | vernis |
| `perfume` | Dessiné à la main | `scripts/art/icons/perfume.svg` | parfum |
| `comb` | Dessiné à la main | `scripts/art/icons/comb.svg` | peigne |
| `eyelash-curler` | Dessiné à la main | `scripts/art/icons/eyelash-curler.svg` | recourbe-cils |
| `sponge` | Généré par IA, tracé | `scripts/art/icons/sponge.svg` | éponge |
| `eyeshadow-palette` | Généré par IA, tracé | `scripts/art/icons/eyeshadow-palette.svg` | palette de fards |
| `foundation` | Dessiné à la main | `scripts/art/icons/foundation.svg` | fond de teint (flacon pompe) |
| `eyeliner` | Dessiné à la main | `scripts/art/icons/eyeliner.svg` | crayon yeux |
| `scissors` | Dessiné à la main | `scripts/art/icons/scissors.svg` | ciseaux (coiffure) |
| `hair-dryer` | Dessiné à la main | `scripts/art/icons/hair-dryer.svg` | sèche-cheveux |
| `makeup-bag` | Dessiné à la main | `scripts/art/icons/makeup-bag.svg` | trousse de maquillage |
| `camera` | Dessiné à la main | `scripts/art/icons/camera.svg` | appareil photo (shooting) |
| `dress` | Dessiné à la main | `scripts/art/icons/dress.svg` | robe de soirée |
| `ring` | Dessiné à la main | `scripts/art/icons/ring.svg` | bague (mariage) |

### Dessins au trait (`LineDrawing`)

| Nom | Origine | Fichier source | Sert à |
|---|---|---|---|
| `lips` | Généré par IA, tracé | `scripts/art/icons/lips.svg` | lèvres |
| `eye` | Dessiné à la main | `scripts/art/icons/eye.svg` | œil, redessiné à la main le 26/10/2026 |

### Icônes d’interface (`Icon`)

| Nom | Origine | Fichier source | Sert à |
|---|---|---|---|
| `arrow-right` | Dessiné à la main | `scripts/art/icons/arrow-right.svg` | flèche (boutons, liens) |
| `arrow-left` | Dessiné à la main | `scripts/art/icons/arrow-left.svg` | flèche (précédent) |
| `chevron-down` | Dessiné à la main | `scripts/art/icons/chevron-down.svg` | menus et listes |
| `chevron-right` | Dessiné à la main | `scripts/art/icons/chevron-right.svg` | galerie, volets |
| `close` | Dessiné à la main | `scripts/art/icons/close.svg` | fermer |
| `menu` | Dessiné à la main | `scripts/art/icons/menu.svg` | menu mobile |
| `check` | Dessiné à la main | `scripts/art/icons/check.svg` | coche |
| `search` | Dessiné à la main | `scripts/art/icons/search.svg` | recherche |
| `calendar` | Dessiné à la main | `scripts/art/icons/calendar.svg` | date |
| `check-circle` | Dessiné à la main | `scripts/art/icons/check-circle.svg` | coche cerclée |
| `pin` | Dessiné à la main | `scripts/art/icons/pin.svg` | lieu, zone |
| `play` | Dessiné à la main | `scripts/art/icons/play.svg` | lecture |
| `pause` | Dessiné à la main | `scripts/art/icons/pause.svg` | pause |
| `shield-check` | Dessiné à la main | `scripts/art/icons/shield-check.svg` | activité vérifiée, « Pro » |
| `mail` | Dessiné à la main | `scripts/art/icons/mail.svg` | courriel |
| `alert-circle` | Dessiné à la main | `scripts/art/icons/alert-circle.svg` | erreur, attention |
| `pencil` | Dessiné à la main | `scripts/art/icons/pencil.svg` | modifier (édition directe) |
| `loader` | Dessiné à la main | `scripts/art/icons/loader.svg` | enregistrement en cours |
| `phone` | Dessiné à la main | `scripts/art/icons/phone.svg` | téléphone |
| `globe` | Dessiné à la main | `scripts/art/icons/globe.svg` | site web |

## Les jeux écartés (historique)

Les jeux libres d'icônes (IconPark, Phosphor, Tabler, Lucide, Iconoir, Remix, Material Design Icons, Heroicons) ne contenaient ni éponge, ni recourbe-cils, ni palette, et de toute façon pas de famille unique de la direction artistique. IconPark (Apache-2.0, ByteDance) a servi du 25/10 au 26/10/2026 ; son code et son texte de licence ont été retirés du dépôt avec ce jeu.
