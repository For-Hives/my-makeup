# La direction artistique : le kit (issue 1111)

> Vocabulaire : ce que le mainteneur appelle une **pastille** (une image en forme de pilule, posée dans un titre) s'écrit `capsule` dans le code (`CapsuleImage`, `TitleWithCapsules`, `CapsuleFrame`, `.art-capsule`) : `pastille` est un mot français que le contrôle des noms refuse.

Le kit est la base commune des pages : des jetons, des polices, une bibliothèque d'assets et des composants de base, que chaque page applique ensuite. Il vient de la maquette que le mainteneur a validée le 25/10/2026 (éditorial, mode : papier crème, indigo, rose pâle, Bodoni, filets fins). **Application page par page.** Les pages de contenu, de contact, de zone et de talent le portent depuis le 25/10/2026 (voir [`pages-de-contenu.md`](pages-de-contenu.md), « Le kit sur ces pages ») ; le blog (liste et article), les deux boutons de la barre de navigation et le pied de page le portent aussi (voir « Le blog, la barre et le pied de page ») ; l'accueil et la recherche ont suivi (voir [`accueil.md`](accueil.md) et [`recherche.md`](recherche.md)) ; la passe de cohérence du 25/10/2026 a pris le reste du site public (voir « La passe de cohérence »).

Le code est dans `src/components/art/`. Les jetons et les quelques règles de feuille de style sont dans **un seul bloc** de `src/app/(front)/globals.css`, nommé « ART DIRECTION KIT ». Les règles de mouvement sont celles de [`mouvement.md`](mouvement.md), la barre de navigation celle de [`navbar.md`](navbar.md).

## Ce que le mainteneur a refusé, et ce qui le remplace

| Refusé le 25/10/2026 | Remplacé par |
|---|---|
| Les petites étoiles à quatre branches | Des **marques d'imprimerie** (`PrintMark`) : un fin plus, un petit cercle ouvert, un point, un court trait de pinceau. Très rares (deux ou trois par section), **jamais animées** |
| Les petites fleurs et leurs pop-ups au trait | Des **dessins au trait** (`LineDrawing` : lèvres, œil) de la même famille que les objets. Mode et éditorial, jamais botanique |
| Les objets de maquillage faits à la main, puis ceux générés par une IA (refusés pour leur style disparate) | Huit **vrais objets** vectoriels d'une seule famille de contours (`MakeupObject`), dessinés par des personnes, sous licence libre (voir « Assets » et [`credits-svg.md`](credits-svg.md)) |
| Les halos de couleur trop serrés | Des **lueurs** (`GlowBlob`) plus diffuses, plus grandes et plus larges, en trois tailles |
| Un fond d'invitation à l'action dessiné à la main | Le **vrai shader WebGL** du site (`CtaBackdrop`), repris par `ArtCta`, plus grand, avec plus d'air |

## Interdits

Ces règles n'ont pas d'exception ; `tests/unit/art-forbidden.test.ts` les tient.

- **Aucun SVG généré par une IA, aucun SVG sans licence libre listée.** Tout dessin de `src/components/art/` (et de `public/art/`) est une œuvre humaine, sous CC0, MIT, ISC ou Apache-2.0, et a sa ligne dans [`credits-svg.md`](credits-svg.md) (source, auteur, licence, modification). Un fichier ou un export nommé « generated » ne peut plus exister dans le kit ; un dessin sans ligne rend la CI rouge. Ajouter un dessin : choisir dans la famille IconPark (même trait, même grille) ou, à défaut, une famille entière d'une autre source, jamais un mélange ; ajouter sa ligne au tableau ; relancer `scripts/art/extract-drawings.ts` ; garder le texte de la licence dans `LICENSES/`.

- **Aucune étincelle, aucune fleur** : ni fichier, ni import, ni classe, ni nom (`sparkle`, `twinkle`, `flower`, `blossom`, `chamomile`, `anemone`, `leaf-sprig`…) dans `src/` ou `public/`. Un fichier ou un import de ce genre rend la CI rouge.
- **Aucun rebond, aucune pulsation, aucun scintillement** : le mouvement est celui de `mouvement.md` (`transform` et `opacity`, courbes douces, jamais de `bounce`, `ping`, `pulse`).
- **Aucun néon** : pas d'ombre de texte ni de `drop-shadow` pour faire briller, pas de flou en filtre, aucune couleur plus saturée que l'indigo-violet de la bande (le test le calcule).
- **Le rouge à lèvres reste réservé à ce qui s'édite** : aucun jeton du kit ne le porte, aucun composant du kit ne l'utilise (le dessin « rouge à lèvres » est une image, pas la couleur).
- **Un titre : au plus deux couleurs** parmi l'encre, l'indigo 700 et la baie, et **un seul mot en italique**.
- **Le décor est caché aux lecteurs d'écran** (`aria-hidden`, jamais de `<title>`), et **jamais seul porteur d'un sens** : une pastille, un dessin, un rond ne disent rien que le texte ne dise.
- **Cibles de 44 px** au moins pour tout ce qui se clique ou s'appuie ; anneau de focus visible ; textes à **4,5:1** au moins (calculé dans `tests/unit/art-tokens.test.ts`).
- **Les composants sont des composants serveur.** Le seul code client du kit est le bouton de pause de la bannière (`MarqueePauseButton`, `'use client'`). Un test refuse un second fichier client, et refuse qu'un composant client importe les dessins.

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
| `--shadow-art-lift` | `0 18px 40px -26px rgb(30 26 77 / .35)` | ombre d'une carte qui se soulève (le survol d'une carte n'en prend plus : voir ci-dessous) |
| `--font-script` | Pinyon Script | la bannière, rien d'autre |

L'indigo (50 à 950) est celui de Tailwind, déjà dans le site : le kit ne le redéfinit pas. Les traits du kit sont des filets de 1 px (encre pour les boutons, `--color-hairline` pour les séparations), jamais d'ombre lourde.

**Le survol d'une carte (issue 1137)** : un fond rose très doux derrière la carte, qui la dépasse de 12 px, sa photo qui grandit de 5 %, et pour le blog un trait qui glisse sous « Lire l'article » avec sa flèche qui avance. Pas d'ombre dure, pas de montée. Une pastille de partage se remplit d'une teinte de son ton. Le détail et les raisons : [`mouvement.md`](mouvement.md), « Le survol d'une carte ».

## Polices

`src/components/art/fonts.ts` déclare **une seule fois pour tout le site public** Bodoni Moda (romain et italique), Instrument Sans et Pinyon Script par `next/font/google`, donc **hébergées par le site** (aucune requête vers un service de polices). Le gabarit public (`src/app/(front)/layout.tsx`) pose les trois variables sur `<html>` ; `font-display`, `font-body` et `font-script` (Tailwind) les lisent partout.

`preload: false` sur les trois : le navigateur ne va chercher une police que si la page peint du texte dedans, donc **une page qui n'en utilise aucune ne paie rien**. Mesuré (voir « Mesures »), `preload: true` dans le gabarit ajoute trois requêtes de polices (86 Ko) à chaque page et fait passer le LCP d'une page qui n'en utilise aucune de 548 à 912 ms.

Les routes qui peignent déjà du Bodoni et de l'Instrument Sans au-dessus de la ligne de flottaison (pages de texte, blog, édition directe) gardent la paire préchargée de `src/components/direct-edit/fonts.ts`, **inchangée** : leur chargement et leur CLS ne bougent pas (sans cela, le CLS de `/mentions-legales` passait de 0,04 à 0,16, faute de préchargement). Quand toutes les pages auront pris le kit, cette paire part et `preload` passe à `true` ici pour `display` et `body`.

## Assets

| Famille | Composant | Contenu | D'où ça vient |
|---|---|---|---|
| Marques d'imprimerie | `PrintMark kind="plus\|ring\|dot\|dash"` | un fin plus, un cercle ouvert, un point, un trait de pinceau | dessinées à la main (originales) |
| Icônes | `Icon name=…` | flèches, lecture, pause, loupe, repère, sceau, calendrier, chevron, menu | tirées de la maquette validée (dessinées à la main, originales) |
| Objets de maquillage | `MakeupObject name="brush\|compact\|lipstick\|mirror\|mascara\|nail-polish\|perfume\|comb"` | contours de 48 points, un seul trait | **IconPark (ByteDance), Apache-2.0**, dessins d'origine, réduits au contour ([`credits-svg.md`](credits-svg.md)) |
| Dessins au trait | `LineDrawing name="lips\|eye"` | contours, même famille et même trait que les objets | **IconPark**, idem |
| Cadres | `ArchFrame`, `CapsuleFrame` (assets), classes `.art-arch`, `.art-capsule` (utilisées par les composants) | arche avec bande décalée, pastille en pilule avec filet intérieur | dessinés à la main |
| Badge | `RotatingBadge` | texte qui tourne autour d'un rond cliquable | dessiné à la main (texte sur un chemin SVG) |
| Lueurs | `GlowBlob size="sm\|md\|lg" tone="rose\|indigo\|blush"` | dégradé radial très doux | dessinées à la main (CSS) |
| Filets | `Hairline variant="line\|dots\|marks"`, `SwirlEllipse` (l'ellipse du lien actif, sans étoile) | filets, ellipse | dessinés à la main |

Aucun asset ne copie une des références Dribbble. Les marques, icônes, filets et cadres sont dessinés pour le projet ; les objets et les dessins au trait sont des **icônes IconPark** (voir ci-dessous). Tous les dessins sont des composants SVG en ligne (ils prennent `currentColor` : une classe donne la couleur).

### Les objets et les dessins au trait : une famille, une source

Source : IconPark, jeu « Outline » de ByteDance (<https://github.com/bytedance/IconPark>), licence **Apache-2.0**, dessinée par des personnes. Pourquoi elle : c'est la seule famille libre vérifiée qui contient à la fois le rouge à lèvres, le pinceau, le poudrier, le miroir, le mascara, le vernis, le parfum, le peigne, les lèvres et l'œil, dans un même trait (Phosphor, Tabler, Lucide, Iconoir, Remix et Material Design Icons n'ont ni mascara, ni poudrier, ni vernis ; game-icons demande une mention d'auteur et mélange les styles ; OpenMoji est en partage à l'identique ; la liste complète est dans `credits-svg.md`).

- **Données** : `src/components/art/drawings.ts` (formes nues sur une grille de 48, rien d'autre : ni couleur, ni style, ni lien). Il est **écrit par** `scripts/art/extract-drawings.ts` à partir d'une copie du dépôt IconPark : `bun --no-env-file scripts/art/extract-drawings.ts <dépôt IconPark>`. Le script retire les remplissages à deux tons, les couleurs, le chemin de découpe et tout ce qui n'est pas une forme (parseur HTML, aucun filtre sur le balisage).
- **Rendu** : `Drawing` (dans `graphics.tsx`) trace chaque forme en contour `currentColor`, extrémités arrondies, avec **une seule épaisseur** pour toute la famille : la variable CSS `--art-drawing-stroke` (`.art-drawing`, 1,75 px **à l'écran, à toutes les tailles** : `vector-effect: non-scaling-stroke`, comme les filets de 1 px du kit ; sans cela, l'épaisseur d'origine de la grille de 48 donnait 12 px sur un grand objet). Même grille, même échelle, même poids : un nouveau dessin de la famille s'y range sans réglage.
- **Poids** : environ 5,3 Ko de données pour les dix dessins (contre 52 Ko), aucun fichier de plus, aucun JavaScript.
- **Ce qui manque** : éponge, pince à cils, profil, main qui tient un pinceau, balayages de pinceau n'existent pas en vrai SVG libre de cette famille : ils sont retirés (le parfum et le peigne prennent la place de l'éponge ; le pinceau en objet remplace la main) plutôt que dessinés à la main ou pris dans un second style.
- **Licence** : le texte d'Apache-2.0 est dans `LICENSES/IconPark-Apache-2.0.txt`, l'auteur et la source dans `credits-svg.md`, la mention des modifications dans `credits-svg.md` et dans l'en-tête de `drawings.ts`. Aucune mention visible sur le site n'est requise.

## Composants

Tous dans `src/components/art/`, en anglais, composants serveur sauf mention. Aucun ne porte `.reveal` lui-même, sauf les têtes de section (comme celle de l'accueil) : une liste enveloppe chaque carte dans `<li className="reveal">`, comme le site le fait déjà.

| Composant | Props (les principales) | À savoir |
|---|---|---|
| `Pill` | `variant` (`outline`, `filled`, `light`, `ghost-light`, `play`), `size` (`md` 52 px, `sm` 44 px), `arrow`, `href` (sinon un `<button type="button">`) | la flèche avance de 4 px au survol, immobile en mouvement réduit ; `play` = disque de 56 px + libellé ; `pillClassName()` donne la classe à un lien suivi (`TrackedLink`) |
| `RoundButton` | `icon`, `label` (**obligatoire** : le nom), `solid`, `href` | rond de 52 px ; désactivé : 45 % d'opacité |
| `Chip` | `tone` (`plain`, `blush`, `indigo`, `ink`, `solid`, `seal`), `icon`, `href` + `current`, ou `pressed` | sans `href` ni `pressed` : une étiquette de 30 px (pas une cible) ; lien ou bascule : 44 px, `aria-current` / `aria-pressed`, pressée = indigo plein |
| `MarqueeBanner` | `items`, `label`, `variant` (`band` indigo cursive, `rule` filets, `blush` rose), `repeat`, `rounded` | le texte n'est lu qu'une fois ; défile en CSS (`transform`) ; survol, focus et bouton de pause l'arrêtent ; **mouvement réduit : une ligne fixe, sans copie ni bouton** ; le seul code client est `MarqueePauseButton`, qui montre aussi la bande quand sa police est arrivée (`data-ready` ; avec le script actif, les mots restent `visibility: hidden` jusque-là, sinon l'échange de police décale la bande : CLS 0,0006 mesuré sur l'accueil à 1440 px) |
| `SectionHead` | `variant` (`centered`, `left`), `eyebrow`, `number`, `title`, `children` (la phrase), `aside`, `sideArt`, `id`, `as` | `centered` : décor de chaque côté dès 1024 px ; `left` : surtitre numéroté « 01 — … » en italique, flèches à droite ; trois enfants `.reveal` |
| `TitleWithCapsules` / `TitleAccent` | `segments` (`{text, tone, italic}`, `{pastille}`, `{lineBreak}`), `as`, `size`, `id` | le titre se lit par ses mots seuls ; règle : deux couleurs, un mot en italique |
| `CapsuleImage` | `shape` (`pill`, `round`), `tint`, `dark`, `object` / `line` / `image`, `rotate` | en `em` : elle suit la taille du titre ; décor caché |
| `ArchImage` | `src` + `alt`, ou des `children` ; `tint`, `band` (`band`, `rose`, `night`), `side`, `size`, `mark`, `priority`, `quality` (celle de Next, 75, par défaut : les têtes de page, qui sont le LCP, et les cartes de profil l'utilisent aussi ; 90 se demande depuis l'accueil et la connexion), `sizes` (`archSizes()` pour une photo en paysage) | l'arche, la bande décalée, un liseré intérieur ; la marque disparaît sous 640 px (la gouttière de 16 px la ferait déborder) ; entourez-la de `.card-hover` pour le zoom de la photo |
| `RotatingBadge` | `text`, `href` + `label`, `className` | l'anneau tourne en 26 s (immobile en mouvement réduit), le rond du milieu fait 56 px ; sans `href`, pur décor |
| `ProfileCard` | `profile` (**la donnée de la carte de recherche**, `ProfileCard` de `src/services/public/profiles.ts`), `rank`, `priority`, `headingLevel`, `tint`, `band` | photo en arche, nom en Bodoni (le seul lien, étiré sur la carte), zone, spécialité, deux prestations, « dès 150 € » ; reprend les règles de `ResultCard` : zone vide dite, « Coordonnées pas encore indiquées », clic mesuré seulement avec `rank`, aucune coordonnée |
| `ProfileRowCard` | mêmes props | la même carte en ligne (liste) ; sous 720 px le prix passe sous le texte |
| `TestimonialArch` | `quote`, `name`, `byline`, `image`, `placeholder`, `tint`, `band`, `avatar` | `<figure>` + `<blockquote>` + `<figcaption>` ; sans portrait, un objet dessiné tient la place |
| `BlogCard` | `article` (**la donnée de la liste du blog**), `variant` (`card`, `feature`), `headingLevel` | pas de fausse photo : un panneau teinté avec un objet dessiné, choisi de façon stable par le slug |
| `ArtCta` | `title`, `children`, `primary` et `secondary` (`href`, `label`, `where`) | le vrai shader (voir « L'invitation à l'action ») |

### L'invitation à l'action

`ArtCta` est le `Cta` du site dans le look du kit : un grand panneau `art-night` posé directement sur le fond papier (sans cadre blanc), le titre centré en Bodoni, deux pilules, **120 px d'air** en haut et en bas sur ordinateur (contre 64 px), deux dessins au trait et deux marques dans les coins (ordinateur seulement). Derrière : **le même `CtaBackdrop` que `Cta`** : les dégradés statiques d'abord, puis le shader WebGL `NeuroNoise` seulement quand le bloc approche de l'écran et que le mouvement est permis, démonté quand il sort. Ses couleurs sont les indigos de `cta-palette.ts`, qui tiennent 4,5:1 sous du texte blanc : le texte se lit sur le pire pixel de l'animation. Le masque latéral du `Cta` (qui laisse vide la gauche pour un texte aligné à gauche) est levé (`.art-cta-open`) parce que le texte est centré. Les deux mesures de clic (`cta_recherche`, `cta_inscription`) sont inchangées. Depuis la refonte de l'accueil (25/10/2026), le `Cta` partagé des treize pages est un habillage d'`ArtCta` : il en donne les mots et les deux clics, et `ArtCta` a 144 px d'air, des lueurs autour du cadre et un fond papier.

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
- **Pied de page** (`Footer`, serveur, sans bannière ni script : la bannière ajouterait son bouton client à chaque page) : papier, **sans filet ni marge au-dessus** (le fond de la page se prolonge dans le pied : un filet à plus et une marge d'une autre couleur faisaient une barre blanche et un `hr` laid, retour d'Andy du 25/10/2026), réseaux en pastilles rondes de 44 px, colonnes avec titre en Bodoni et liens de 44 px, un dessin au trait (le pinceau) et une lueur. Les liens et les textes sont ceux du site.

## La passe de cohérence (25/10/2026)

Un passage sur toutes les pages publiques, aux deux largeurs, a relevé ce qui n'avait pas encore pris le kit. Le tableau de l'audit est dans la description de la PR (issue 1111).

- **Une coquille pour l'authentification** (`AuthShell`, `src/components/auth/`) : papier, un seul `h1` en Bodoni, une lueur et une marque d'imprimerie derrière, colonne centrée. Elle sert la connexion, l'inscription, le mot de passe oublié et sa réinitialisation, les deux pages de vérification et la page d'erreur de connexion. Elle ne met aucun mot : la page donne le titre.
- **Connexion et inscription en deux colonnes** (issue 1138, `AuthShell layout="split"`). Dès 1024 px : à gauche un panneau rose pâle avec le titre en Bodoni (un mot en baie, **sans italique** : la face italique n'est pas préchargée et son arrivée décalait le titre, CLS 0,0003 mesuré ; sans elle, 0) et une photo en arche avec un pinceau dessiné (décor, `alt=""`, qui ne se charge pas sous 1024 px) ; à droite une carte blanche (`data-testid="auth-card"`, `--radius-card`, filet, `--shadow-art-lift`) qui porte le bouton Google, le formulaire et la ligne d'aide ; le `footer` (liens vers l'autre page et l'accueil) est sous la carte. Sous 1024 px : le titre au-dessus de la carte, sans photo. Les autres pages d'authentification gardent la colonne centrée. Les états : champ `min-h-13` qui s'accentue au survol (anneau indigo clair) et à la saisie (fond blanc, anneau indigo), bouton Google avec anneau de focus, avis cerclés (`ART_NOTICE`), aide sans mot de passe sur fond rose. Aucun mouvement ajouté. Les références visuelles de la nuit (`tests/e2e/visual.spec.ts`, `sign-in`, `sign-up`) se reprennent sur la CI par `references-visuelles.yml`.
- **Les classes de formulaire sont dans un seul fichier** (`src/components/art/form-classes.ts`, sans import hors `pill-class` : les formulaires client le lisent sans tirer les dessins) : champ à 28 px d'arrondi (`ART_FIELD`, aussi celui du contact et du devis), étiquette, bouton en pilule indigo (`ART_SUBMIT`), lien-bouton, lien de texte (44 px de haut), quatre tons d'avis (`ART_NOTICE`). Plus aucun champ carré ni bouton noir `rounded-md` sur les pages publiques hors accueil.
- **404 et erreur** : papier, Bodoni, pilules (la classe vient de `pill-class`, car la page d'erreur est l'enfant d'un composant client). `global-not-found.tsx` pose enfin les trois variables de police sur `<html>` (sans elles, la 404 d'une adresse inconnue peignait le titre et le pied de page en sans empattement).

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
5. **Dessins réels, d'une seule famille (IconPark)** à la place des dessins générés par une IA (25/10/2026, demande du mainteneur) : l'éponge, la pince à cils, le profil, la main au pinceau et les balayages sont retirés faute de vrai SVG libre de la même famille.
6. **Pas de flèches de carrousel** : le défilement par glissement (`scroll-snap`) suffit ; `RoundButton` est prêt si une page en demande.

## Pas de barre blanche

Le fond d'une page publique est le papier (`bg-art-paper`) ; le blanc n'est que pour de vraies cartes et de vrais panneaux (formulaire, carte de profil, cadre de texte, bouton). Relevé du 25/10/2026, corrigé : le pied de page n'a plus de marge au-dessus (elle laissait voir le gris du `body`, une bande de 96 px entre l'invitation et le pied) ni de filet ; l'invitation n'a plus de cadre blanc ; la section « Nos Avantages » des deux pages « Pourquoi… » ne peint plus de fond blanc ; les pages légales et le plan du site portent la tête du kit (`PageHead`) sur `ArtPage`, au lieu du `Hero` blanc suivi d'un article gris. `tests/unit/white-bands.test.tsx` garde ces cinq points. Restent blancs, à dessein : la tête du `Hero` de l'accueil (chantier à part) et l'en-tête d'identité d'une page de profil (carte pleine largeur de la maquilleuse).

## Emplacements d'illustration à générer (issue 1136)

Les illustrations d'aujourd'hui sont provisoires (illustrations peintes déjà servies par le site, objets de maquillage dessinés). Chaque emplacement porte dans le code un commentaire `// TODO(1136): illustration à générer (…)` : chercher cette chaîne. Les images seront générées avec fal (skill `fal-images`) puis déposées dans `public/assets/`. Pas d'emoji ni de texte dans les images.

| Emplacement | Fichier | Ratio et taille | Intention |
|---|---|---|---|
| Tête de page, image par défaut | `src/components/static-pages/PageHead.tsx` (argument `image`) | arche 4:5, ~380 px | une maquilleuse, ton éditorial peint |
| Tête de page, cinq variantes (talents, zones) | `src/components/static-pages/PageHead.tsx` (`ILLUSTRATIONS`) | arche 4:5, ~380 px | une variante par teinte, des maquilleuses d'origines variées |
| Guide « Trouver une maquilleuse » | `src/content/static-pages/client-guides.tsx` | arche 4:5, ~380 px | trouver la maquilleuse qui correspond |
| Guide « Centraliser ses recherches » | idem | arche 4:5, ~380 px | tout réuni en un seul endroit |
| Guide « Explorer les profils » | idem | arche 4:5, ~380 px | profils et réalisations |
| « Solutions pour les particuliers » | idem | arche 4:5, ~380 px | une recherche simplifiée |
| À propos, première arche | `src/components/static-pages/AboutArticle.tsx` | arche 4:5, ~180 px | une maquilleuse au travail |
| À propos, seconde arche | idem | arche 4:5, ~180 px | seconde maquilleuse, teinte lavande, plus bas |
| Demande envoyée | `src/app/(front)/(site)/demande-envoyee/page.tsx` | arche 4:5, ~220 px | rassurance, un message reçu |
| En-tête du blog | `src/app/(front)/(site)/blog/page.tsx` | arche 4:5, grand format | conseils beauté, mariage, soin de la peau |
| Avantages des deux pages « Pourquoi… » | `src/components/static-pages/Benefits.tsx` | une arche 4:5 par avantage, ~96 à 280 px | une scène par titre d'avantage |
| Coque de connexion, d'inscription, de mot de passe | `src/components/auth/AuthShell.tsx` | libre, ~420 px (aucun visuel aujourd'hui) | accueil, espace personnel |

## Des photos nettes dans l'arche (issue 1138)

Deux causes de flou sur les photos de l'accueil sous le haut de page, mesurées le 26/10/2026 (1440 px, écran 2x) :

1. **La largeur demandée à l'optimiseur.** Le cadre d'une arche est en 4:5 ; une photo en paysage (3:2 : les quatre blocs de la collaboration) le couvre par sa **hauteur** (`object-cover`). `sizes` disait la largeur du cadre (24 rem), donc Next livrait 828 px de large, soit 828 × 552 pour une photo qui doit couvrir 768 × 960 pixels d'écran : le navigateur l'étirait de 1,7 fois. `archSizes({ desktop, mobile, sourceAspect })` (`src/components/art/arch-sizes.ts`) multiplie la largeur du cadre par le rapport de la photo à celui du cadre (1,875 pour du 3:2) ; les rapports des fichiers sont dans `src/components/home/photo-aspects.ts`, et un test les relit sur les fichiers.
2. **La qualité.** Next encode à 75, et **ramène toute autre valeur à une valeur listée** : sans `images.qualities` dans `next.config.ts`, un `quality={90}` restait à 75. La liste est `[75, 90]` ; la photo de `Project`, les images et l'arche de `Presentation` et de `Collaboration`, la photo de la connexion et les cartes de `DemoCard` demandent 90 ; `ArchImage` garde 75 par défaut (les têtes de page et les cartes de profil sont des LCP).

Aucun fichier source n'est remplacé : l'original le plus grand du dépôt est utilisé. `maquilleuse_project.webp` (768 px de large) ne fournit que 1,3 pixel par pixel d'affichage à 1440 px et ne peut pas faire mieux sans un fichier plus grand. Le LCP ne bouge pas : ces images sont sous la ligne de flottaison, en chargement différé.
