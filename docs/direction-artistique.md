# La direction artistique : le kit (issue 1111)

> Vocabulaire : ce que le mainteneur appelle une **pastille** (une image en forme de pilule, posée dans un titre) s'écrit `capsule` dans le code (`CapsuleImage`, `TitleWithCapsules`, `CapsuleFrame`, `.art-capsule`) : `pastille` est un mot français que le contrôle des noms refuse.

Le kit est la base commune des pages : des jetons, des polices, une bibliothèque d'assets et des composants de base, que chaque page applique ensuite. Il vient de la maquette que le mainteneur a validée le 25/10/2026 (éditorial, mode : papier crème, indigo, rose pâle, Bodoni, filets fins). **Application page par page.** Les pages de contenu, de contact, de zone et de talent le portent depuis le 25/10/2026 (voir [`pages-de-contenu.md`](pages-de-contenu.md), « Le kit sur ces pages ») ; le blog (liste et article), les deux boutons de la barre de navigation et le pied de page le portent aussi (voir « Le blog, la barre et le pied de page ») ; l'accueil et la recherche sont d'autres chantiers.

Le code est dans `src/components/art/`. Les jetons et les quelques règles de feuille de style sont dans **un seul bloc** de `src/app/(front)/globals.css`, nommé « ART DIRECTION KIT ». Les règles de mouvement sont celles de [`mouvement.md`](mouvement.md), la barre de navigation celle de [`navbar.md`](navbar.md).

## Ce que le mainteneur a refusé, et ce qui le remplace

| Refusé le 25/10/2026 | Remplacé par |
|---|---|
| Les petites étoiles à quatre branches | Des **marques d'imprimerie** (`PrintMark`) : un fin plus, un petit cercle ouvert, un point, un court trait de pinceau. Très rares (deux ou trois par section), **jamais animées** |
| Les petites fleurs et leurs pop-ups au trait | Des **dessins au trait continu** (`LineDrawing` : lèvres, œil, profil, main qui tient un pinceau) et des **balayages de pinceau** (`Swash`). Mode et éditorial, jamais botanique |
| Les objets de maquillage faits à la main | Huit **vrais objets** vectoriels propres (`MakeupObject`), générés puis nettoyés (voir « Assets ») |
| Les halos de couleur trop serrés | Des **lueurs** (`GlowBlob`) plus diffuses, plus grandes et plus larges, en trois tailles |
| Un fond d'invitation à l'action dessiné à la main | Le **vrai shader WebGL** du site (`CtaBackdrop`), repris par `ArtCta`, plus grand, avec plus d'air |

## Interdits

Ces règles n'ont pas d'exception ; `tests/unit/art-forbidden.test.ts` les tient.

- **Aucune étincelle, aucune fleur** : ni fichier, ni import, ni classe, ni nom (`sparkle`, `twinkle`, `flower`, `blossom`, `chamomile`, `anemone`, `leaf-sprig`…) dans `src/` ou `public/`. Un fichier ou un import de ce genre rend la CI rouge.
- **Aucun rebond, aucune pulsation, aucun scintillement** : le mouvement est celui de `mouvement.md` (`transform` et `opacity`, courbes douces, jamais de `bounce`, `ping`, `pulse`).
- **Aucun néon** : pas d'ombre de texte ni de `drop-shadow` pour faire briller, pas de flou en filtre, aucune couleur plus saturée que l'indigo-violet de la bande (le test le calcule).
- **Le rouge à lèvres reste réservé à ce qui s'édite** : aucun jeton du kit ne le porte, aucun composant du kit ne l'utilise (le dessin « rouge à lèvres » est une image, pas la couleur).
- **Un titre : au plus deux couleurs** parmi l'encre, l'indigo 700 et la baie, et **un seul mot en italique**.
- **Le décor est caché aux lecteurs d'écran** (`aria-hidden`, jamais de `<title>`), et **jamais seul porteur d'un sens** : une pastille, un dessin, un rond ne disent rien que le texte ne dise.
- **Cibles de 44 px** au moins pour tout ce qui se clique ou s'appuie ; anneau de focus visible ; textes à **4,5:1** au moins (calculé dans `tests/unit/art-tokens.test.ts`).
- **Les composants sont des composants serveur.** Le seul code client du kit est le bouton de pause de la bannière (`MarqueePauseButton`, `'use client'`). Un test refuse un second fichier client, et refuse qu'un composant client importe les dessins générés (52 Ko de données).

## Jetons (`globals.css`, bloc « ART DIRECTION KIT »)

Tout ce que le site avait déjà reste tel quel (`--color-lipstick`, `--color-ink`, `--color-blush` crème, `--radius-card`…). Les jetons du kit portent tous le préfixe `art-` pour ne rien écraser (le « blush » du kit est un rose, celui du site un beige : ils ne se confondent pas).

| Jeton | Valeur | Rôle |
|---|---|---|
| `--color-art-paper` | `#f1ece7` | fond de page du kit (papier) |
| `--color-art-blush` / `-50` | `#f6dce3` / `#fbeff2` | rose pâle : fonds de photo, pastilles, bannière rose |
| `--color-art-blush-ink` | `#5c1a38` | texte sur le rose pâle (9,8:1) |
| `--color-art-rose` | `#edb4c5` | rose : bande, guillemet, mot coloré sur fond nuit (9,1:1) |
| `--color-art-rose-tint`, `-lavender`, `-sand` | `#f3c9d6`, `#d8d3f5`, `#eadfd6` | teintes de fond de photo (`data-tint`) |
| `--color-art-berry` | `#9e2f5c` | baie : le mot coloré d'un titre, la marque d'une arche (5,9:1 sur papier) |
| `--color-art-band` | `#4f39f6` | l'indigo-violet de la bande décalée d'une arche : décor seulement |
| `--color-art-banner` | `#432dd7` | l'indigo-violet de la bannière (blanc dessus : 8,1:1) |
| `--color-art-night` | `#1e1a4d` | le cadre sombre de l'invitation à l'action (blanc dessus : 16:1) |
| `--color-art-line` | `#b7b0c6` | trait de décor doux |
| `--radius-art-frame` / `-field` | 36 px / 28 px | cadres, champs ; la carte reste `--radius-card` (22 px) |
| `--shadow-art-lift` | `0 18px 40px -26px rgb(30 26 77 / .35)` | ombre d'une carte qui se soulève |
| `--font-script` | Pinyon Script | la bannière, rien d'autre |

L'indigo (50 à 950) est celui de Tailwind, déjà dans le site : le kit ne le redéfinit pas. Les traits du kit sont des filets de 1 px (encre pour les boutons, `--color-hairline` pour les séparations), jamais d'ombre lourde.

## Polices

`src/components/art/fonts.ts` déclare **une seule fois pour tout le site public** Bodoni Moda (romain et italique), Instrument Sans et Pinyon Script par `next/font/google`, donc **hébergées par le site** (aucune requête vers un service de polices). Le gabarit public (`src/app/(front)/layout.tsx`) pose les trois variables sur `<html>` ; `font-display`, `font-body` et `font-script` (Tailwind) les lisent partout.

`preload: false` sur les trois : le navigateur ne va chercher une police que si la page peint du texte dedans, donc **une page qui n'en utilise aucune ne paie rien**. Mesuré (voir « Mesures »), `preload: true` dans le gabarit ajoute trois requêtes de polices (86 Ko) à chaque page et fait passer le LCP d'une page qui n'en utilise aucune de 548 à 912 ms.

Les routes qui peignent déjà du Bodoni et de l'Instrument Sans au-dessus de la ligne de flottaison (pages de texte, blog, édition directe) gardent la paire préchargée de `src/components/direct-edit/fonts.ts`, **inchangée** : leur chargement et leur CLS ne bougent pas (sans cela, le CLS de `/mentions-legales` passait de 0,04 à 0,16, faute de préchargement). Quand toutes les pages auront pris le kit, cette paire part et `preload` passe à `true` ici pour `display` et `body`.

## Assets

| Famille | Composant | Contenu | D'où ça vient |
|---|---|---|---|
| Marques d'imprimerie | `PrintMark kind="plus\|ring\|dot\|dash"` | un fin plus, un cercle ouvert, un point, un trait de pinceau | dessinées à la main (originales) |
| Icônes | `Icon name=…` | flèches, lecture, pause, loupe, repère, sceau, calendrier, chevron, menu | tirées de la maquette validée (dessinées à la main, originales) |
| Objets de maquillage | `MakeupObject name="brush\|compact\|lipstick\|mirror\|sponge\|mascara\|nail-polish\|eyelash-curler"` | contours propres, un seul trait | **générés** (Recraft V4.1, texte vers vecteur), nettoyés à la main |
| Dessins au trait | `LineDrawing name="lips\|eye\|profile\|hand-brush"` | un trait continu, mode | **générés** (même modèle), nettoyés |
| Balayages | `Swash name="dry\|wave"` | un coup de pinceau plein | **générés** (même modèle), nettoyés |
| Cadres | `ArchFrame`, `CapsuleFrame` (assets), classes `.art-arch`, `.art-capsule` (utilisées par les composants) | arche avec bande décalée, pastille en pilule avec filet intérieur | dessinés à la main |
| Badge | `RotatingBadge` | texte qui tourne autour d'un rond cliquable | dessiné à la main (texte sur un chemin SVG) |
| Lueurs | `GlowBlob size="sm\|md\|lg" tone="rose\|indigo\|blush"` | dégradé radial très doux | dessinées à la main (CSS) |
| Filets | `Hairline variant="line\|dots\|marks"`, `SwirlEllipse` (l'ellipse du lien actif, sans étoile) | filets, ellipse | dessinés à la main |

Aucun asset ne copie une des références Dribbble : ce sont des dessins originaux ou générés. Tous les dessins sont des composants SVG en ligne (ils prennent `currentColor` : une classe donne la couleur).

### Les dessins générés : comment, et combien

Modèle : `fal-ai/recraft/v4.1/text-to-vector` (0,08 USD l'image), couleur d'encre `#1a1417` sur fond blanc. **Coût réel : 15 images réussies, soit 1,20 USD** (une image pilote, le lot de 13, un second essai du pinceau) ; deux essais de plus (miroir, pince à cils) ont été refusés par le compte à court de crédit et n'ont rien coûté. Le plafond de 5 USD n'a pas été approché. Le **miroir** et la **pince à cils** sont donc ceux du premier lot : le miroir est propre, la pince à cils se lit mais reste le moins réussi (voir « Décisions »).

Nettoyage (à refaire pour tout nouvel objet) : retirer le bloc `<metadata>` (manifeste C2PA de Recraft), retirer le rectangle de fond blanc, fusionner toutes les formes restantes en **un seul chemin `fill-rule="evenodd"`** (le contour et ses intérieurs blancs deviennent un trait transparent), arrondir les coordonnées à une décimale, recadrer la `viewBox` sur le dessin. Le résultat est dans `src/components/art/generated-art.ts` (données seules).

Prompts (gabarit commun : « *minimalist monoline icon drawing: uniform thin black outline strokes only, no fill, no shading, no gradients, no text, perfectly clean geometry, elegant fashion editorial line art, centered on a plain white background* », 768 × 1024) :

| Nom | Sujet |
|---|---|
| `lipstick` | a single lipstick, open tube with the bullet raised, side view |
| `brush` | a single flat foundation makeup brush: a wide fan of soft bristles held by a metal ferrule, a long smooth handle |
| `compact` | a single round makeup compact, open, with a round mirror in the lid and a pressed powder pan below |
| `mirror` | a single hand mirror with an oval glass and a slim handle |
| `sponge` | a single egg-shaped makeup blending sponge |
| `mascara` | a single mascara tube with its wand and spiral brush pulled out beside it |
| `nail-polish` | a single nail polish bottle with a square glass body and a rounded cap |
| `eyelash-curler` | a single eyelash curler, closed scissor-like handles with finger loops and the curved clamp |
| `lips`, `eye`, `profile`, `hand-brush` | « single continuous one-line drawing of » a woman's lips slightly parted / an open eye with long lashes and a sweeping eyebrow / a woman's face in profile with a long neck and a loose hair bun / a hand holding a slim makeup brush, « drawn with one thin unbroken black line, fashion editorial minimal line art » (1024 × 768 pour les lèvres et l'œil) |
| `dry`, `wave` | a single organic calligraphic brush-stroke swash with dry-brush edges / a graceful S-shaped paint brush swoosh, thick to thin, « solid black ink on a plain white background » (1024 × 512) |

## Composants

Tous dans `src/components/art/`, en anglais, composants serveur sauf mention. Aucun ne porte `.reveal` lui-même, sauf les têtes de section (comme celle de l'accueil) : une liste enveloppe chaque carte dans `<li className="reveal">`, comme le site le fait déjà.

| Composant | Props (les principales) | À savoir |
|---|---|---|
| `Pill` | `variant` (`outline`, `filled`, `light`, `ghost-light`, `play`), `size` (`md` 52 px, `sm` 44 px), `arrow`, `href` (sinon un `<button type="button">`) | la flèche avance de 4 px au survol, immobile en mouvement réduit ; `play` = disque de 56 px + libellé ; `pillClassName()` donne la classe à un lien suivi (`TrackedLink`) |
| `RoundButton` | `icon`, `label` (**obligatoire** : le nom), `solid`, `href` | rond de 52 px ; désactivé : 45 % d'opacité |
| `Chip` | `tone` (`plain`, `blush`, `indigo`, `ink`, `solid`, `seal`), `icon`, `href` + `current`, ou `pressed` | sans `href` ni `pressed` : une étiquette de 30 px (pas une cible) ; lien ou bascule : 44 px, `aria-current` / `aria-pressed`, pressée = indigo plein |
| `MarqueeBanner` | `items`, `label`, `variant` (`band` indigo cursive, `rule` filets, `blush` rose), `repeat`, `rounded` | le texte n'est lu qu'une fois ; défile en CSS (`transform`) ; survol, focus et bouton de pause l'arrêtent ; **mouvement réduit : une ligne fixe, sans copie ni bouton** ; le seul code client est `MarqueePauseButton` |
| `SectionHead` | `variant` (`centered`, `left`), `eyebrow`, `number`, `title`, `children` (la phrase), `aside`, `sideArt`, `id`, `as` | `centered` : décor de chaque côté dès 1024 px ; `left` : surtitre numéroté « 01 — … » en italique, flèches à droite ; trois enfants `.reveal` |
| `TitleWithCapsules` / `TitleAccent` | `segments` (`{text, tone, italic}`, `{pastille}`, `{lineBreak}`), `as`, `size`, `id` | le titre se lit par ses mots seuls ; règle : deux couleurs, un mot en italique |
| `CapsuleImage` | `shape` (`pill`, `round`), `tint`, `dark`, `object` / `line` / `image`, `rotate` | en `em` : elle suit la taille du titre ; décor caché |
| `ArchImage` | `src` + `alt`, ou des `children` ; `tint`, `band` (`band`, `rose`, `night`), `side`, `size`, `mark`, `priority` | l'arche, la bande décalée, un liseré intérieur ; la marque disparaît sous 640 px (la gouttière de 16 px la ferait déborder) ; entourez-la de `.card-hover` pour le zoom de la photo |
| `RotatingBadge` | `text`, `href` + `label`, `className` | l'anneau tourne en 26 s (immobile en mouvement réduit), le rond du milieu fait 56 px ; sans `href`, pur décor |
| `ProfileCard` | `profile` (**la donnée de la carte de recherche**, `ProfileCard` de `src/services/public/profiles.ts`), `rank`, `priority`, `headingLevel`, `tint`, `band` | photo en arche, nom en Bodoni (le seul lien, étiré sur la carte), zone, spécialité, deux prestations, « dès 150 € » ; reprend les règles de `ResultCard` : zone vide dite, « Coordonnées pas encore indiquées », clic mesuré seulement avec `rank`, aucune coordonnée |
| `ProfileRowCard` | mêmes props | la même carte en ligne (liste) ; sous 720 px le prix passe sous le texte |
| `TestimonialArch` | `quote`, `name`, `byline`, `image`, `placeholder`, `tint`, `band`, `avatar` | `<figure>` + `<blockquote>` + `<figcaption>` ; sans portrait, un objet dessiné tient la place |
| `BlogCard` | `article` (**la donnée de la liste du blog**), `variant` (`card`, `feature`), `headingLevel` | pas de fausse photo : un panneau teinté avec un objet dessiné, choisi de façon stable par le slug |
| `ArtCta` | `title`, `children`, `primary` et `secondary` (`href`, `label`, `where`) | le vrai shader (voir « L'invitation à l'action ») |

### L'invitation à l'action

`ArtCta` est le `Cta` du site dans le look du kit : un cadre blanc, un grand panneau `art-night`, le titre centré en Bodoni, deux pilules, **120 px d'air** en haut et en bas sur ordinateur (contre 64 px), deux dessins au trait et deux marques dans les coins (ordinateur seulement). Derrière : **le même `CtaBackdrop` que `Cta`** : les dégradés statiques d'abord, puis le shader WebGL `NeuroNoise` seulement quand le bloc approche de l'écran et que le mouvement est permis, démonté quand il sort. Ses couleurs sont les indigos de `cta-palette.ts`, qui tiennent 4,5:1 sous du texte blanc : le texte se lit sur le pire pixel de l'animation. Le masque latéral du `Cta` (qui laisse vide la gauche pour un texte aligné à gauche) est levé (`.art-cta-open`) parce que le texte est centré. Les deux mesures de clic (`cta_recherche`, `cta_inscription`) sont inchangées. Depuis la refonte de l'accueil (25/10/2026), le `Cta` partagé des treize pages est un habillage d'`ArtCta` : il en donne les mots et les deux clics, et `ArtCta` a 144 px d'air, des lueurs autour du cadre et un fond papier.

## Appliquer le kit à une page

1. Le fond de la page : `bg-art-paper`, texte `text-ink`, secondaire `text-mute`.
2. Les titres : `font-display font-medium` (Bodoni), un mot au plus en `TitleAccent`.
3. Un bloc de page : une `SectionHead`, puis ses cartes dans des `<li className="reveal">`. Les lueurs (`GlowBlob`) se posent dans un conteneur `relative overflow-hidden` (elles débordent exprès).
4. Pas d'image pour un texte : les articles n'ont pas de photo, les cartes de blog dessinent un objet.
5. Avant de fusionner : un test de la page, une capture à 390 px, et si le titre au-dessus de la ligne de flottaison est en Bodoni, la mesure du LCP (`preload`, voir « Polices »).

## Le blog, la barre et le pied de page

- **Le panneau d'un article** (`BlogPanel`, dans `BlogCard.tsx`, choix dans `blog-art.ts` par `blogArt(slug)`) : une teinte, un liseré, une arche, un objet de maquillage incliné et un second plus petit à côté, deux marques d'imprimerie, une lueur diffuse, et pour les grands formats (`feature`, `cover`) un dessin au trait. Tout vient du `slug` : une liste variée, et un article qui garde son dessin de la liste à sa page (le même panneau couvre le haut de l'article). Aucune photo, aucun texte, décor caché aux lecteurs d'écran.
- **Liste** (`ArticleList`) : le dernier article en `BlogCard variant="feature"` avec l'étiquette « Dernier article », une `SectionHead` (« 02 — Le blog », « Tous les articles »), la grille de cartes dans des `<li className="reveal">`, une bannière `MarqueeBanner variant="blush"` sous le titre (les sujets de la phrase d'introduction), une arche avec un pinceau au bord du titre (ordinateur seulement), des lueurs. `ArticleCard.tsx` est supprimé.
- **Article** : la colonne de lecture de 42 rem (`.article-prose`), le sommaire, les données structurées, les textes et les adresses sont **inchangés** ; fond papier, lueurs, lien de retour et pied de partage en pilule et puces (`Pill`, `Chip`), « À lire aussi » en `SectionHead` et `BlogCard`.
- **Barre** : voir [`navbar.md`](navbar.md). `pillClassName` vit désormais dans `pill-class.ts` (sans import, ré-exporté par `Pill`), `SwirlEllipse` dans `SwirlEllipse.tsx` (ré-exporté par `graphics`).
- **Pied de page** (`Footer`, serveur, sans bannière ni script : la bannière ajouterait son bouton client à chaque page) : papier, filet à plus fin, réseaux en pastilles rondes de 44 px, colonnes avec titre en Bodoni et liens de 44 px, un dessin au trait (`hand-brush`) et une lueur. Les liens et les textes sont ceux du site.

### Deux pièges mesurés en passant (CLS)

- **Un mot coloré ou italique dans un `h1` à masque d'entrée** (`.enter-mask` + `TitleAccent`) fait compter un décalage de mise en page (0,0005 : le rectangle du nœud de texte suit le `clip-path` qui s'ouvre). Le titre du blog reste donc un seul texte, sans accent. Une page qui veut un accent dans son `h1` doit mesurer son CLS (`tests/e2e/motion.spec.ts`).
- **La bannière `band` (cursive Pinyon Script, `preload: false`)** décale ses éléments quand la police arrive (0,003 à 1440 px) : sa largeur change sous un défilement déjà lancé. La liste du blog prend la variante `blush` (Bodoni, déjà préchargé par la route) ; la variante `band` demande de précharger la cursive sur sa route.

## Tests

- `tests/unit/art-tokens.test.ts` : un seul bloc de jetons, tous préfixés `art-`, ceux du site intacts, pas de rouge à lèvres dans le kit, 16 contrastes à 4,5:1 au moins.
- `tests/unit/art-components.test.tsx` : le rendu de chaque composant (balisage, nom accessible, cible de 44 px, focus, décor `aria-hidden`), la bannière (une lecture, pause, mouvement réduit), les cartes (mêmes données et mêmes règles que celles de la recherche), l'invitation à l'action.
- `tests/unit/art-forbidden.test.ts` : aucun fichier, import, classe ni nom d'étincelle ou de fleur ; ni rebond ni néon ; un seul composant client ; les polices chargées une fois, par `next/font`.
- `tests/unit/blog-list.test.tsx` (panneaux variés et stables, tête de section), `tests/unit/footer.test.tsx` (liens gardés, cibles de 44 px, décor caché).
- `tests/unit/public-client-graph.test.ts` suit désormais `components/art` : rien d'interdit n'arrive à un visiteur.

## Mesures

Faites le 25/10/2026 sur deux builds de production (le `main` du jour et cette branche), servis en local sans base de données (les pages statiques seulement : l'accueil et la recherche lisent la base, ils n'ont pas pu être mesurés), Chromium 390 px, réseau « 4G lente » (1,6 Mb/s, 150 ms), processeur ralenti 4 fois, 8 chargements par page, médiane.

| Mesure | `main` | Cette branche |
|---|---|---|
| JavaScript des paquets (`.next/static/chunks`) | 3 839 847 octets, 1 188 495 gzip | 3 839 847 octets, 1 188 492 gzip : **0 octet de plus** (aucune route n'importe encore `MarqueePauseButton`, son poids n'est donc pas mesuré : un composant client de 20 lignes) |
| CSS du site public | 64 587 octets gzip | **+3 327 octets gzip** (+18 828 octets bruts) : les 13 `@font-face` (1,8 Ko gzip) et le bloc du kit |
| `<link rel="preload">` de polices | 2 sur les pages de texte, 0 ailleurs | **identique** (la paire préchargée de `direct-edit/fonts.ts` est gardée) |
| LCP `/classement` (aucune police) | 528 à 572 ms | 556 à 580 ms : dans le bruit, au plus +40 ms (le CSS en plus, qui bloque le rendu) |
| LCP `/a-propos` (Bodoni) | 808 à 844 ms | 860 à 940 ms (une série à 1 140 ms) : bruit de mesure, mêmes polices, mêmes préchargements |
| CLS `/a-propos`, `/mentions-legales`, `/cgu` | 0,0414 (0 en série) | 0,0414 (identique) |

Les polices (woff2, sous-ensemble latin, une face n'est téléchargée que si une page l'utilise) : Bodoni Moda romain environ 26 Ko, italique environ 30 Ko, Instrument Sans environ 30 Ko, Pinyon Script environ 28 Ko, soit environ 114 Ko si une page les utilise toutes les quatre.

Deux essais écartés, mesurés sur les mêmes pages :

| Essai | Résultat |
|---|---|
| `preload: true` pour Bodoni et Instrument Sans dans le gabarit | `/classement` passe de 548 à 912 ms de LCP (+360 ms) : trois requêtes de polices (86 Ko) de plus sur chaque page |
| Une seule paire, `preload: false`, sans garder celle de `direct-edit/fonts.ts` | LCP des pages de texte meilleur (le texte se peint avec la police de secours), mais CLS de `/mentions-legales` à 0,157 contre 0,041 |

Le shader WebGL n'a pas pu être vu dans le navigateur de travail (pas de WebGL) : seul le fond statique, qui est celui de repli, a été regardé. Le code du shader est celui du site, inchangé ; sa couleur la plus claire tient 4,57:1 sous du texte blanc (test).

## Décisions (à valider par le mainteneur)

1. **Marques d'imprimerie à la place des étoiles** (plus, cercle ouvert, point, trait de pinceau), très rares et immobiles.
2. **Dessins au trait continu et balayages de pinceau à la place des fleurs**, sans rien de botanique.
3. **Polices : déclarées une fois dans le gabarit, `preload: false`.** Le kit ne coûte rien aux pages qui ne s'en servent pas ; la paire préchargée de `direct-edit/fonts.ts` reste pour les routes qui peignent déjà du Bodoni (sinon : CLS de `/mentions-legales` à 0,16). À renverser quand toutes les pages auront pris le kit.
4. **`Cta` devient `ArtCta`** pour les treize pages d'un coup (décision du 25/10/2026, refonte de l'accueil) : le composant partagé garde son nom et ses clics mesurés.
5. **La pince à cils** générée est la moins réussie du lot (lisible, mais proche de ciseaux) : à regénérer (0,08 USD) si elle doit servir en grand.
6. **Pas de flèches de carrousel** : le défilement par glissement (`scroll-snap`) suffit ; `RoundButton` est prêt si une page en demande.
