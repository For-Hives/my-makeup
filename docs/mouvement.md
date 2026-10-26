# Le mouvement du site (issues 1069, 1088 et la passe « visible »)

Un petit système, pas du cas par cas : des jetons dans `src/app/(front)/globals.css` (`@theme static`, bloc « Motion tokens »), quelques classes partagées, un petit script en ligne, et des tests qui tiennent les règles. Andy veut un mouvement simple et efficace sur tout le site, haut de gamme (mode, éditorial) : pas de parallaxe, pas de rebond, pas de cascade qui fait apparaître tout le site.

La première version (issues 1069 et 1088) était juste mais trop timide : une apparition liée au défilement sur 12 px, des survols de 100 ms, rien à l'ouverture d'une page. La passe « visible » garde les mêmes jetons et les mêmes garde-fous, et change l'échelle : durées de 200 à 600 ms, distances de 16 à 28 px, une entrée dans le temps, des apparitions « une seule fois ».

## Les règles

- **Un rôle avant un effet.** Une animation guide l'œil (un titre se pose, un bloc arrive), donne un retour (j'ai survolé, j'ai cliqué) ou relie deux états. Aucune animation décorative qui retarde la lecture.
- **`transform` et `opacity` seulement** (plus des couleurs qui ne touchent pas la mise en page : fond, texte, trait de soulignement, et un `clip-path` pour le masque d'un titre). Jamais de largeur, de hauteur, de marge, de `top`/`left` ni de `transition: all`. La mise en page ne bouge pas : CLS à 0, aucun défilement latéral.
- **Mouvement réduit.** Tout ce qui bouge est déclaré sous `@media (prefers-reduced-motion: no-preference)`, et le script d'apparition ne fait rien. Avec `reduce`, rien ne glisse ni ne s'efface, et chaque changement d'état (teinte, soulignement, ombre) reste visible, tout de suite : une règle finale ramène à 0,01 ms toute transition et toute animation qu'un composant déclarerait encore (une classe `transition` de Tailwind), et coupe les boucles.
- **Rien n'est caché par la feuille de style seule.** Le HTML rendu par le serveur est entier. Un bloc n'est caché (`opacity: 0`, `data-reveal="wait"`) que par le script, après l'avoir vu sous la ligne de flottaison. Sans script, sans `IntersectionObserver`, à l'impression, avec mouvement réduit et en mode édition, le contenu est là. Un test refuse tout autre `opacity: 0` hors d'une image-clé.
- **Le LCP n'est jamais caché ni retardé.** Aucun texte ne part de `opacity: 0` : le titre est seulement masqué et décalé (`enter-mask`), le paragraphe seulement décalé (`enter`) ; seuls le formulaire, l'illustration et le bouton d'inscription (blocs sans texte de LCP) se fondent (`enter-fade`). L'image des pages fixes (le LCP, `priority`) ne bouge pas. Un essai de bout en bout rejoue la première image de l'entrée et vérifie que l'élément du LCP, lu par `PerformanceObserver`, et ses parents sont à pleine opacité.
- **Le premier écran n'est pas révélé au défilement.** Un bloc déjà dans l'écran quand le script le voit reste tel quel (`data-reveal="seen"`). Il a, à la place, l'entrée du haut de page.
- **Un seul langage, en CSS.** Seule l'apparition au défilement demande un script, et il est en ligne (voir « Apparition au défilement »). La transition de page passe par le composant `ViewTransition` de React. Une exception, le film de l'arche de l'accueil : un petit composant client (`src/components/home/HeroFilm.tsx`) met ses vidéos dans la page et pose l'attribut sous lequel la feuille de style fait tourner l'anneau du badge et glisser le bandeau (voir « L'accueil en arche »). Le mouvement lui-même reste en CSS.

## Les jetons

| Jeton | Valeur | Pour |
|---|---|---|
| `--duration-hover` | 200 ms | réponse d'un lien, d'un bouton, d'un résumé (180 à 240 ms) ; sortie de l'ancienne page |
| `--duration-lift` | 400 ms | carte qui se soulève, photo qui grandit (320 à 480 ms) |
| `--duration-appear` | 280 ms | libre (200 à 320 ms), non utilisé par la passe visible |
| `--duration-enter` | 500 ms | entrée du haut de page (450 à 600 ms) |
| `--duration-reveal` | 600 ms | apparition d'un bloc au défilement (500 à 700 ms) |
| `--duration-page` | 520 ms | changement de page, sortie comprise (400 à 560 ms) |
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | entrer : sortie douce |
| `--ease-in-soft` | `cubic-bezier(0.64, 0, 0.78, 0)` | sortir : entrée douce |
| `--motion-distance` | 16 px | montée du nouveau contenu au changement de page (12 à 16 px) |
| `--motion-rise` | 28 px | montée d'une entrée et d'une apparition (24 à 32 px) |
| `--motion-lift` | 5 px | élévation d'une carte (4 à 8 px) |
| `--motion-zoom` | 1,05 | photo d'une carte (1,03 à 1,06) |
| `--stagger-enter` | 80 ms | écart entre les lignes de l'entrée (60 à 100 ms) |
| `--stagger-card` | 70 ms | écart entre les cartes d'une liste qui apparaissent ensemble (60 à 80 ms), 5 rangs au plus |
| `--duration-ribbon` | 60 s | une longueur de liste du bandeau des spécialités de l'accueil (environ 28 px par seconde) |

`tests/unit/motion-system.test.ts` lit la feuille de style et refuse un jeton hors de sa plage. L'entrée d'une page dure `--duration-enter` plus deux écarts, soit 500 + 2 × 80 = **660 ms** (le test exige 500 à 700 ms, et que le haut de page n'ait jamais de rang 3).

## Les briques

| Brique | Ce qu'elle fait | Où |
|---|---|---|
| `.enter-mask` | Entrée d'un titre : le titre monte de 28 px en sortant d'un masque (`clip-path`) qui s'ouvre vers le bas, 500 ms, rang 0. Jamais de fondu : son texte est peint dès la première image. | le `h1` de `Hero`, de la recherche (page et résultats), du blog, du classement (pas la fiche : son HTML est tenu au caractère près par des fichiers de référence) |
| `.enter` | Entrée d'un texte : il monte de 28 px, sans fondu (c'est lui qui porte le LCP sur un téléphone), rang 1 (80 ms de retard). | la phrase sous le titre de `Hero` |
| `.enter-fade` | Entrée d'un bloc sans texte de LCP : il monte de 28 px en fondu, rang 2 (160 ms de retard). | le formulaire (accueil), le bouton d'inscription de `Hero` |
| `.enter-arch` | Entrée de l'arche de l'accueil : elle monte de 28 px en sortant d'un masque (`clip-path`) qui s'ouvre vers le bas, 600 ms, rang 1. Jamais de fondu : son affiche peut être le LCP d'un grand écran. | l'arche de l'accueil |
| `.reveal` | Un bloc sous la ligne de flottaison attend (`data-reveal="wait"`, invisible, décalé de 28 px), puis monte en fondu en 600 ms quand il entre dans l'écran, **une seule fois**. `--reveal-i` (0 à 5) décale de 70 ms les blocs qui entrent ensemble (les cartes d'une ligne). Hors `no-preference`, à l'impression et en mode édition (`[data-edit-page]`), il est tel quel. | voir « Où sont l'entrée et l'apparition » |
| Contrôles (liens, boutons, résumés, champs à cocher) | Les états de l'affordance (`:hover`, `:active`) s'adoucissent en 200 ms. Un lien se souligne en fondu. Les boutons `.btn-*` montent de 2 px (retour au clic). Dans la couche `base`, sous `:where` : un composant qui style son propre état gagne. | tout le site |
| `.card-hover` + `.card-zoom` | La carte ne monte plus et n'a plus d'ombre (issue 1137) : un fond rose très doux (`::before`, le rose du kit à 42 %) apparaît derrière elle et déborde de 12 px, en grandissant de 97 % à 100 % en 400 ms ; la photo grandit de 5 % en 400 ms (la carte la rogne : rien ne bouge autour). Le fond reste avec le mouvement réduit, sans transition. Une carte qui rogne son contenu (`overflow-hidden`, la carte de recherche à bordure) ne peut pas porter un fond hors d'elle : elle teinte sa propre face (200 ms). Voir « Le survol d'une carte ». | cartes de blog (`BlogCard`), de profil (`ProfileCard`, `ProfileRowCard`), de recherche (`ResultCard`) |
| `.read-more-label`, `.read-more-arrow` | Sous la carte du blog, « Lire l'article » se souligne d'un trait de 1 px qui glisse de gauche à droite et sa flèche avance de 4 px, en 200 ms. | `BlogCard` |
| `.hover-fade` | Une partie qui suit le survol de son parent (le rond à flèche d'une carte de profil, le disque d'une pilule « lecture ») fond sa couleur de fond, de bordure et de texte en 200 ms. Remplace `transition-colors` de Tailwind (150 ms, courbe par défaut). | `ProfileCard`, `Pill` |
| `.nav-link`, `.nav-sub`, panneau des groupes | Le trait qui glisse sous une entrée de la barre et la carte qui apparaît (voir [`navbar.md`](navbar.md)). | barre de navigation |
| `.motion-arrow` | La flèche d'un bouton avance de 3 px. | « Trouver ma maquilleuse » |

Le survol n'existe que pour une souris (`@media (hover: hover)`) : l'affordance du site (voir `src/app/(front)/globals.css`, « What a hand on the mouse sees ») ne dépend d'aucun mouvement.

## Le survol d'une carte (issue 1137)

Avant, une carte survolée montait de 5 px et prenait `0 18px 36px -16px rgb(26 20 23 / .34)`. Sur une carte sans fond (blog, profil), l'ombre dessinait un bord sombre autour d'une boîte transparente : « une carte découpée, en un bloc ». Dans la ligne de profils qui défile sous 768 px (`overflow-x: auto`), elle était rognée en haut et sur les côtés.

- **Pas d'ombre, pas de montée.** Un fond rose doux derrière la carte et qui la dépasse de 12 px : la carte a de l'air autour d'elle. Le fond est un pseudo-élément `::before` (z-index −1, `isolation: isolate` sur la carte), peint pour une souris seulement (`@media (hover: hover)`) : un doigt n'a pas de survol, et le pseudo-élément ne crée donc aucun défilement latéral sur téléphone.
- **Pas d'`opacity: 0`.** Le test de `motion-system` n'accepte `opacity: 0` que sur un bloc en attente. Le fond va de transparent à teinté (`background-color`) en grandissant (`transform: scale`), 400 ms (`--duration-lift`), `--ease-out-soft`.
- **La ligne de profils** (`SearchGrid`, `rail`) garde 16 px d'air en haut, en bas et sur les côtés, plus que les 12 px du fond, et l'écart entre deux cartes (20 px) dépasse la moitié du débordement.
- **Une garde** (`tests/unit/hover-polish.test.ts`) refuse toute règle `card-hover` avec une `box-shadow`, toute ombre au survol dont l'alpha dépasse 0,2, et tout `hover:shadow-md|lg|xl|2xl` dans les composants publics.
- **`--motion-lift`** (5 px) n'est plus lu par les cartes : le jeton reste dans sa plage, libre pour un usage futur.
- **Les contrôles** (liens, boutons, pastilles, ronds du pied de page) fondent aussi leur **bordure**, leur remplissage et leur trait (`fill`, `stroke`) : la liste de transition de base nomme maintenant `border-color`. Une pastille de partage (`Chip`) se remplit d'une teinte douce de son ton, sans soulignement.

## Apparition au défilement : le script en ligne

Une apparition « une seule fois, dans le temps » ne se fait pas en CSS seul : une animation liée au défilement (`animation-timeline: view()`, la première version) suit le défilement dans les deux sens, et les déclencheurs CSS natifs ne sont pas partout. La passe visible ajoute donc un script **en ligne**, `src/lib/motion/reveal-script.ts` (773 octets), écrit à la fin du `<body>` par `src/app/(front)/layout.tsx`, sur le modèle du tirage de « Mise en avant » (`docs/accueil.md`) : ce n'est pas un module, **aucun octet n'entre dans les paquets** (le garde `public-client-graph` et `route-bundle-stats.json` ne bougent pas) et la politique de contenu autorise déjà les scripts en ligne.

- Il ne fait rien sans `IntersectionObserver` ni avec `prefers-reduced-motion: reduce`.
- Il parcourt les `.reveal` : celui qui est déjà dans l'écran prend `data-reveal="seen"` (il ne bouge pas), celui qui est dessous prend `wait` et est observé. Un bloc dans `[data-edit-page]` est laissé tel quel.
- Quand un bloc entre dans l'écran (marge de 6 % en bas), il passe à `in` et n'est plus observé : la feuille de style le ramène à sa place (`transition`, 600 ms). Les blocs d'un même passage reçoivent `--reveal-i` 0, 1, 2… (5 au plus). Un bloc déjà passé au-dessus de l'écran (un saut vers une ancre) est montré tout de suite.
- Un `MutationObserver` voit les blocs que la navigation interne apporte (un script en ligne ne court qu'une fois par chargement de page).
- Il ne touche que `data-reveal` et la propriété `--reveal-i`, jamais une classe que React possède. Toute erreur laisse la page telle quelle (`try`).
- Si le script échoue ou n'arrive pas, rien n'est caché : c'est lui, et lui seul, qui cache.

## Transition de page (issue 1087, durée relevée en passe visible)

Les navigations de Next.js se font dans la page, sans chargement : `@view-transition { navigation: auto }` ne vaut que pour les chargements complets, qu'il retarde, donc il n'est pas utilisé. Next 16 n'a pas d'option à activer : l'App Router embarque le React canari, dont le composant `<ViewTransition>` appelle `document.startViewTransition` à chaque navigation (guide `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`). Le site n'écrit donc **aucun JavaScript** pour elle : un gabarit côté serveur, `src/app/(front)/(site)/template.tsx`, enveloppe la page dans `<ViewTransition default="none" enter="page-in" exit="page-out">`, et la feuille de style anime les deux classes (bloc « Page transition » de `globals.css`).

- **Pourquoi un gabarit.** Un gabarit (`template`) est remonté à chaque navigation vers une autre page, donc `enter` et `exit` jouent ; un `layout` persiste et ne jouerait jamais. `default="none"` : un changement de filtre sur la même page, un rafraîchissement ou une révélation de Suspense n'animent rien.
- **Le mouvement.** L'ancien contenu s'efface en `--duration-hover` (200 ms, `--ease-in-soft`), puis le nouveau apparaît en fondu et monte de `--motion-distance` (16 px) pendant `--duration-page` moins `--duration-hover` (320 ms, `--ease-out-soft`) : 520 ms en tout (360 ms avant la passe visible). `transform` et `opacity` seulement. Le cliché du reste de la page (menu, pied) ne s'anime pas : le menu ne bouge jamais.
- **Pas de double mouvement.** Pendant la transition (`:root:active-view-transition`), l'entrée du haut de page est coupée : le titre ne monte pas une seconde fois dans le contenu qui monte déjà. Relevé sur le banc : aucune animation `enter-*` pendant le changement de page, seulement l'opacité et le décalage de la transition (570 ms mesurés pour 520 ms prévues).
- **Où ça ne joue pas.** Premier chargement et rechargement complet (aucune navigation interne : l'entrée du haut de page joue à la place), navigateur sans l'API (navigation normale), mouvement réduit (`animation: none !important` sur tous les pseudo-éléments de la transition), page de la maquilleuse en mode édition (`:root:has([data-edit-page])`), « Mon espace » et l'administration (hors du gabarit du site).
- **Cliquable pendant la transition** : `::view-transition { pointer-events: none }`.
- **Poids.** Aucun octet de JavaScript du site ; le gabarit est un composant serveur, le garde `public-client-graph` ne le voit pas. Mesure de l'issue 1087 sur `route-bundle-stats.json` : −90 octets (du bruit : le composant est déjà dans React).
- **Limite connue.** Deux pages du même segment (`/profil/a` vers `/profil/b`) ne remontent pas le gabarit : pas de transition entre elles.

## Où sont l'entrée et l'apparition

`.reveal` est posée sur les blocs de chaque page, jamais sur un composant client d'une page publique (le test le garde). Une liste n'a pas de classe de plus : chaque `<li>` porte la sienne, et le script les échelonne.

| Page | Entrée du haut de page (dans le temps) | Blocs qui apparaissent au défilement |
|---|---|---|
| accueil | titre (masque), phrase, arche (masque, rang 1), formulaire guidé (en fondu), 680 ms | sous le héros, chaque section : filet numéroté, titre et phrase (`SectionHead`), cartes de « Mise en avant », colonne de cartes et spécialités, colonnes de la communauté, onglets et image du projet, titre, textes, boutons et image de chaque bloc de la collaboration ; invitation à l'action (voir « Les sections de l'accueil ») |
| recherche | titre (masque) | cartes des résultats |
| fiche (`/profil/<slug>`) | aucune (le HTML de la fiche est tenu au caractère près par des fichiers de référence) | cartes et sections repliables |
| talent (`/talent/<slug>`) | aucune | l'article, les cartes des maquilleuses, le champ « Votre ville » |
| zone (`/maquilleuses/<département>`) | `Hero` : titre, phrase | l'introduction, les cartes, le champ « Votre ville » |
| blog (liste) | surtitre et phrase (`.enter`), titre (masque) | le dernier article en grand et chaque carte |
| blog (article, issue 1103) | retour, date et signature (`.enter`), titre (masque), chapeau (`.enter`) ; le texte n'est jamais animé | « À lire aussi », puis les cartes des maquilleuses et leur champ de ville |
| pages fixes (`/a-propos`, `/contact`, partenariats, « pourquoi… », « solutions… », guides du particulier, `/demande-envoyee`) | `Hero` : titre, phrase, bouton d'inscription | titre de l'article, chapô, chaque étape ou partie, chaque carte d'avantage, signature ; contact : introduction, « Contactez-nous », cartes d'adresse ; confirmation de `/demande-envoyee` |
| blog | titre (masque) | chaque article de la liste ; pied d'un article : les cartes |
| classement | titre (masque) | chaque section |
| connexion, inscription | aucune (tout tient dans le premier écran) | l'aide « Mot de passe », les liens du bas |
| « Mon espace » | aucune | chaque carte |

Les tests (`motion-system.test.ts`, section « the reveal reaches the pages ») refusent qu'une de ces pages perde son apparition, ou qu'un composant client d'une page publique la porte.

## Les sections de l'accueil (issue 1101)

**Pourquoi rien ne bougeait sous « Vos projets, nos meilleurs talents. »** : aucun des composants de la page (`Talents`, `Presentation`, `Project`, `Collaboration`) ne portait la classe `.reveal`. Le script d'apparition et la feuille de style étaient intacts (les cartes de « Mise en avant » et l'invitation du bas, qui la portaient, apparaissaient), mais le script ne voit que les éléments marqués. Le tableau ci-dessus annonçait « bloc du projet » sans que rien ne le vérifie : `motion-system.test.ts` ne listait aucun composant de l'accueil, et liste désormais chacun (section « the reveal reaches the pages »).

Ce que fait chaque section :

- **Une tête commune**, `src/components/home/SectionHead.tsx` : un filet numéroté (le numéro est un compteur CSS, `.home-eyebrow`, bloc « Home sections » de `globals.css` : il suit les sections présentes, car « Mise en avant » et les spécialités sont facultatives, et il n'est ni dans le texte de la page ni lu par un lecteur d'écran), le titre, et la phrase qui le suit quand il y en a une. Trois frères qui portent chacun `.reveal` : ils entrent ensemble et le script les échelonne (0, 70, 140 ms). Le `h2` garde son texte et son identifiant.
- **Séparation.** Chaque section a 64 px d'air en haut et en bas sur téléphone, 112 px dès `md`, un filet (`border-t`) et, une section sur deux, un fond `indigo-50/50` (les spécialités et le projet). Les quatre blocs de la collaboration sont séparés par un filet. Les textes sur fond teinté tiennent 4,5:1 (le texte des onglets du projet passe de `gray-500` à `gray-600`, la teinte baissant le contraste de `gray-500` sous 4,5:1).
- **Où est `.reveal`.** Sur des enveloppes sans transformation propre, jamais sur un lien ni un bouton (la transition de l'apparition remplacerait les leurs), jamais imbriquée : la colonne de cartes des spécialités et chaque spécialité (`li`), chaque colonne de la communauté, chaque onglet et l'image du projet, et, pour chaque bloc de la collaboration, le titre, le groupe de paragraphes, l'enveloppe du bouton et l'enveloppe de l'image (la photo retournée garde sa propre transformation). L'invitation du bas (`Cta`, partagée par treize pages) est désormais `ArtCta` (`appel-a-l-action.md`) : son cadre porte `.reveal`. La colonne de la communauté (`li`) et l'enveloppe de l'arche de chaque bloc de la collaboration portent la leur ; le titre en pastilles de chaque bloc aussi.
- **Bodoni.** Les titres des sections sont restés dans la police du site jusqu'au 25/10/2026. Depuis, le haut de page « en arche » charge sa propre instance de Bodoni Moda (voir « L'accueil en arche » et [`accueil.md`](accueil.md)), et les têtes de section refaites par le kit passent en Bodoni (`SectionHead display`, voir [`direction-artistique.md`](direction-artistique.md)).

## L'accueil en arche (décision du 25/10/2026)

Le haut de l'accueil ([`accueil.md`](accueil.md)) a trois mouvements, tous dans le bloc « What moves in the home hero » de `globals.css` et sous `no-preference` :

- **L'arche entre** avec le haut de page (`.enter-arch`, rang 1) : masque qui s'ouvre vers le bas et montée de 28 px, 600 ms (`--duration-reveal`). Jamais de fondu. Coupée pendant une transition de page et à l'impression, comme les `.enter*`.
- **L'anneau du badge tourne** (« EXPLORER LES MAQUILLEUSES · », depuis le 26/10/2026) : un tour en 26 s (`--duration-ring`), l'allure du `RotatingBadge` du kit, par ses images clés (`art-spin`), en `transform` seul.
- **Le bandeau glisse** d'une longueur de sa liste en 60 s (`--duration-ribbon`), en `transform` seul, dans une bande qui rogne (aucun défilement latéral).

L'anneau et le bandeau ne bougent que sous `data-hero-motion`, que le composant client pose quand il tourne et que la visiteuse n'a pas demandé moins de mouvement : sans script, rien ne boucle (WCAG 2.2.2), à la différence du `RotatingBadge` du kit, qui tourne par la feuille de style seule. Le bouton de pause, qui ne se voit qu'au focus du clavier (Andy ne voulait plus de bouton de pause à l'écran), passe l'attribut à `paused` : le film, l'anneau et le bandeau s'arrêtent ensemble. Comme la bannière du kit, le bandeau s'arrête aussi sous le pointeur et quand quelque chose en lui tient le focus. L'anneau d'avant (« L’OMBRE NETTE · UN FILM MY MAKEUP · », un tour en 40 s pendant que le film jouait) était parti le 26/10/2026, illisible à 7 à 10 px ; celui du badge se lit à 11,2 px sur un téléphone, 12,5 px au-delà. Rien n'est transparent par `opacity` (le premier écran n'est jamais atténué) : la vidéo qui attend est cachée par `visibility`, le bouton de pause comme le lien d'évitement du site (`sr-only`, un rognage).

Les essais qui attendent la fin de toutes les animations (`settle` de `motion.spec.ts`, `scrollThrough` de `home-sections.spec.ts`) sautent celles qui bouclent sans fin ou sont en pause, puisqu'elles ne finissent jamais ; `tests/e2e/home-hero.spec.ts` vérifie à part que l'anneau tourne et que le bandeau glisse, puis qu'ils s'arrêtent au bouton de pause avec le film.

## Ce qui n'est pas fait, et pourquoi

- **Parallaxe, rebond, fondu partout.** Refusés : un titre monte, un bloc arrive, une carte se soulève ; le reste ne bouge pas.
- **Entrée de la connexion et de l'inscription.** Leur contenu est tout entier dans le premier écran, et ce sont des formulaires : pas d'entrée, pour ne retarder ni le texte ni la saisie.
- **Image des pages fixes.** C'est le LCP (`priority`) : elle ne bouge pas.
- **Titre ligne par ligne.** Le masque ouvre le titre entier (un `h1` n'est pas découpé en lignes : ce serait du script, ou des balises de plus qui gênent la lecture d'écran).
- **Pli des cartes de la fiche.** Un `<details>` qui s'ouvre en glissant anime une hauteur : interdit. Le chevron tourne déjà.
- **Éditeurs de l'édition directe.** Le halo garde sa transition de 150 ms (`EditableBlock`), déjà couverte par `motion-reduce`. La page en mode édition n'a ni entrée ni apparition.
- **Rechargement sans script et ancre.** Sans script, un bloc n'a pas d'apparition (il est là) ; un saut vers une ancre montre le bloc visé tout de suite.

## Mesures de la passe visible (build de production, banc, 24/10/2026)

| Mesure | Résultat |
|---|---|
| JavaScript des paquets (`route-bundle-stats.json`) | 0 octet de différence : l'entrée est du CSS, l'apparition est un script en ligne de 773 octets dans le HTML |
| HTML de l'accueil | + 773 octets (le script), identique sinon |
| LCP de l'accueil (Chromium sans limitation, 12 chargements par largeur, médiane) | 1440 px : 246 à 310 ms, contre 250 à 282 ms avant ; 390 px : 198 à 232 ms contre 210 à 214 ms : dans le bruit. Élément du LCP : le `h1` à 1440 px avant, le paragraphe maintenant (le titre est masqué à la première image, donc plus petit) ; à 390 px, le paragraphe dans les deux cas. Le paragraphe est peint dès la première image (décalé, jamais à opacité 0) |
| CLS, accueil | 0 sur tous les chargements (transform, opacity et clip-path seulement) |
| Défilement latéral | aucun à la première image, à 200 et 450 ms, ni la page parcourue (essai de bout en bout) |

## Tests

- `tests/unit/hover-polish.test.ts` et `tests/e2e/hover-polish.spec.ts` : le survol d'une carte (fond, pas d'ombre, pas de décalage, 400 ms), les pastilles de partage, le pied de page, le mouvement réduit.
- `tests/unit/motion-system.test.ts` : jetons dans leurs plages (dont l'entrée de 500 à 700 ms et l'écart de 60 à 80 ms entre cartes), aucune propriété de mise en page animée, tout mouvement sous `no-preference`, le mouvement réduit ramène tout à 0,01 ms, `opacity: 0` seulement sur un bloc `wait` posé par le script, jamais de fondu sur un titre ni un paragraphe, entrée coupée à l'impression et en mode édition, apparition dans le temps (pas de `animation-timeline`), script en ligne de moins de 1 Ko joué contre une fausse page (blocs sous la ligne de flottaison en attente, premier écran intact, rien sans `IntersectionObserver`, avec mouvement réduit ou en mode édition, écart 0 à 5, bloc passé montré tout de suite), aucun `transition-all`, rebond ou pulsation dans le code.
- `tests/e2e/home-sections.spec.ts`, à 390 et 1440 px : chaque section sous le héros a sa tête et des blocs qui attendent ; ils montent une fois à l'entrée dans l'écran, les blocs d'un même passage en cascade, puis tout est entier ; air, filet ou fond, numéros 01, 02… ; textes de la communauté au mot près ; mouvement réduit et sans JavaScript : rien n'attend.
- `tests/e2e/motion.spec.ts`, à 390 et 1440 px : rien n'est atténué sur le premier écran une fois l'entrée finie ; à la première image de l'entrée, l'élément du LCP et ses parents sont à pleine opacité ; aucun défilement latéral (première image, 200 ms, 450 ms, page parcourue) ; sur `/classement`, un bloc sous la ligne de flottaison est caché et décalé de 28 px, monte en 600 ms une seule fois (rien ne rejoue quand on y revient) ; CLS à 0 en parcourant toute la page ; sans JavaScript le texte est là ; avec mouvement réduit aucune animation ni transition, aucun bloc en attente ; une carte monte au survol en 400 ms.
- `tests/unit/home-hero.test.tsx` et `tests/e2e/home-hero.spec.ts` : l'accueil en arche (voir plus haut).
- `tests/unit/page-transitions.test.ts` : le gabarit est un composant serveur du groupe public seul, ses classes et les règles de la feuille de style (durées par jetons, total ≤ `--duration-page`, rien ne bouge hors `no-preference`, mouvement réduit et page d'édition sans animation).
- `tests/e2e/page-transitions.spec.ts`, à 390 et 1440 px : recherche vers fiche reste dans la même page, la transition de vue joue (animations `page-in` et `page-out`), aucun décalage de mise en page ; avec mouvement réduit, aucune animation de transition.
- `tests/e2e/interaction-affordance.spec.ts` et `tests/e2e/direct-edit-halo.spec.ts` gardent leurs hypothèses (`freezeMotion`, qui montre aussi les blocs en attente, halo mesuré sans décalage).
