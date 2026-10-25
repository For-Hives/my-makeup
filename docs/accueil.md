# L'accueil : ce qu'il montre et qui le décide (issue 1066)

L'accueil (`/`, servi par `src/app/(front)/(site)/home-cached/[key]/page.tsx`) se lit de haut en bas :

1. **Le haut de page « en arche »** (décision d'Andy du 25/10/2026, voir plus bas) : l'accroche (le `h1`, inchangée au caractère près) en Bodoni Moda, avec deux petites images dans ses lignes ; une phrase ; le formulaire guidé (événement, lieu) dessiné comme une seule pilule ; trois lignes qui disent ce que la plateforme fait pour la cliente ; à droite, une arche qui tient le film « L'Ombre nette », son badge, et sous le tout un bandeau des spécialités qui défile. Il remplace le dessin de l'issue 1066 (`HeroIllustration`, retiré) et le `Hero` partagé, que les autres pages gardent.
2. **« Mise en avant ».** Des profils vérifiés, tirés au hasard à chaque chargement (voir plus bas). Absente tant qu'aucun profil n'est vérifié.
3. **« Vos projets, nos meilleurs talents. »** Les spécialités, inchangées.
4. **Les textes de la communauté**, sans titre ni pli ni étapes : « avant tout une communauté » (`Presentation`), le projet (`Project`), la collaboration (`Collaboration`). Tous visibles, mot pour mot.
5. **L'invitation à l'action** du bas (voir [`appel-a-l-action.md`](appel-a-l-action.md)).

Chaque section sous le héros (2 à 4) s'ouvre par la même tête (`SectionHead` : filet numéroté, titre, phrase), a le même rythme (64 px d'air sur téléphone, 112 px sur grand écran, un filet en haut, un fond indigo très clair une section sur deux) et apparaît au défilement (issue 1101, voir [`mouvement.md`](mouvement.md), « Les sections de l'accueil »). Les textes de la communauté ne changent pas d'un mot ; un test les relit.

## Le haut de page « en arche » (25/10/2026)

`src/components/home/HomeHero.tsx` (serveur), `HeroFilm.tsx` (la seule partie client), `FilmStill.tsx`, `film.ts` (fichiers et règles du film), `hero-font.ts` et `fonts/` (la police), `GuidedSearch.tsx` ; styles dans `src/app/(front)/globals.css`, blocs « Home hero ». La maquette approuvée par Andy est la v4 du 25/10/2026.

**La charte, par décision d'Andy du 25/10/2026.** Encre `#1A1417`, rouge à lèvres `#B0294A` et Bodoni Moda dans le haut de l'accueil. Elle lève deux règles écrites : « pas de Bodoni sur l'accueil » ([`mouvement.md`](mouvement.md)) et « le rouge à lèvres est réservé à ce qui se modifie » ([`edition-directe.md`](edition-directe.md), [`appel-a-l-action.md`](appel-a-l-action.md)). Les sections indigo sous le haut de page restent comme elles sont, en attendant d'être harmonisées.

**Ce qu'il montre, de haut en bas :**

- Un surtitre en petites capitales, précédé d'un filet : « Maquilleuses professionnelles, partout en France ».
- Le `h1`, en Bodoni Moda 400 (coupe d'affichage, `opsz` 96), `clamp(2.125rem, 2.6vw + 1.2rem, 3.75rem)`, sur quatre lignes dès 640 px : « Trouver la maquilleuse » / *« qui vous correspond »* (italique, rouge à lèvres) et la pilule des lèvres / la pilule du pinceau et « n'a jamais été » / « aussi simple ». Sous 640 px, les lignes s'enchaînent et la seconde pilule est cachée. Les pilules sont des images décoratives (`alt=""`, `aria-hidden`), de 1,9 × 0,95 em, à la taille donnée (aucun décalage). Les lignes sont des `span` séparés par une vraie espace : le texte du titre, et donc son nom accessible et son empreinte (`url-parity`), restent exactement ceux du site en ligne.
- La phrase, nouvelle : « Mariage, soirée, photo : trouvez une maquilleuse professionnelle près de chez vous, découvrez son travail et écrivez-lui directement. » (espace fine avant les deux-points).
- Le formulaire guidé, inchangé dans ce qu'il fait (GET `/search`, `search` puis `city`, identifiants `accueil-evenement` et `accueil-lieu`, ville obligatoire, 100 caractères au plus, mesure de la recherche dans le même `<form>`) : une pilule cernée d'encre dès 640 px (événement | lieu | bouton encre « Voir les maquilleuses »), une carte de deux champs sur un bouton pleine largeur sur un téléphone. Les libellés restent visibles ; chaque champ remplit son segment (cible de 64 px), le focus se voit sur le segment.
- Les trois lignes de l'issue 1066, au mot près, numérotées i. ii. iii. (chiffres en Bodoni italique rouge, coupe de texte, cachés aux lecteurs d'écran : la liste numérote déjà). Leurs textes longs sont partis avec le dessin.
- L'arche : `border-radius: 9999px 9999px 0 0`, au format du film (1080 × 1400, 0,77), large de `clamp(17rem, 28vw, 26rem)` sur grand écran, 82 % de la colonne (26 rem au plus) en dessous de 1024 px. Derrière elle, la même arche en nude, décalée de 6 % : son ombre portée.
- Le badge, sur le coin bas gauche de l'arche (112 px, 84 px sur un téléphone) : le titre du film en cercle (« L’OMBRE NETTE · UN FILM MY MAKEUP · », `textPath` ajusté par `textLength`) autour d'un disque encre. Avec le mouvement, le disque est un vrai bouton (60 et 44 px) : « Mettre le film en pause » / « Lire le film ». Il arrête et relance le film, la rotation du cercle (un tour en 40 s, seulement pendant que le film joue) et le bandeau. Sans script ou avec un mouvement réduit, rien ne bouge et le disque n'est qu'une marque : aucun bouton qui ne commande rien.
- Le bandeau : une bande encre pleine largeur (60 px, 52 sur un téléphone) sous le haut de page, les spécialités qu'une maquilleuse choisit sur sa page (`SPECIALTY_BULLETS`, les puces que la recherche filtre) en Bodoni italique ivoire (coupe de texte, `opsz` 11 : en coupe d'affichage, à 20 px sur l'encre, les déliés disparaissaient, et le trait d'union de « auto-maquillage » avec eux), séparées par un point rouge. Il glisse lentement (une longueur de liste en 60 s, `transform` seul). La première liste est lue par les lecteurs d'écran, ses trois copies sont cachées. Ce n'est pas une section de l'accueil (`main > section.home-section`) : elle ne prend pas de numéro.
- Sur un téléphone, l'ordre est : surtitre, titre, phrase, formulaire, lignes, arche, bandeau. Le texte reste ce que le navigateur peint d'abord (LCP).

**Le film « L'Ombre nette ».** Une intro de 7 s, jouée une fois : plusieurs maquilleuses floues, une seule devient nette et pose le rouge sur les lèvres de la cliente. Puis une boucle de 8 s sans couture (`loop`), un repos sur l'état final : la lèvre rouge, de légers mouvements, et sa dernière image est sa première. Rendu en 1080 × 1400, 24 images par seconde. Les fichiers sont dans `public/assets/accueil/`, avec une version dans leur nom (`-v1`) ; `next.config.ts` les sert avec `Cache-Control: public, max-age=31536000, immutable`, si bien qu'un nouveau rendu est un nouveau nom, jamais de nouveaux octets sous un nom déjà servi.

| Fichier | Rôle |
|---|---|
| `ombre-nette-intro-v1.av1.mp4`, `.hevc.mp4`, `.h264.mp4` | l'intro, jouée une fois ; elle finit sur la lèvre rouge |
| `ombre-nette-boucle-v1.av1.mp4`, `.hevc.mp4`, `.h264.mp4` | la boucle, dont la première image est la dernière de l'intro, et la dernière sa propre première |
| `ombre-nette-debut-v1.avif`, `.webp` | la première image de l'intro : l'affiche |
| `ombre-nette-fin-v1.avif`, `.webp` | l'état final (le rouge), première image de la boucle : l'affiche avec un mouvement réduit, et l'image montrée quand le film ne viendra pas (lecture refusée, Save-Data, sans script) |
| `pilule-levres-v1.avif`, `.webp` ; `pilule-pinceau-v1.avif`, `.webp` | les deux images du titre (`HERO_PILLS` de `HomeHero.tsx`) : des recadrages du rendu final, en 342 × 171, le triple de leur taille affichée sur grand écran (114 × 57) ; une `<picture>`, AVIF d'abord, le WebP pour l'`<img>`, en `loading="lazy"` : demandées une fois la page mise en page, après la première peinture, et le pinceau, caché sous 640 px, jamais sur un téléphone |

Les sources sont des listes, la meilleure d'abord (`FILM_VIDEOS`, `FILM_STILLS` de `film.ts`) : AV1 (Chrome, Firefox, les appareils Apple qui le décodent), HEVC (les autres Safari), H.264 (ce qui ne lit ni l'un ni l'autre) ; AVIF puis WebP pour les images fixes, le WebP restant l'image de repli de l'`<img>`. Le type de chaque vidéo porte ses codecs exacts, lus dans le fichier (boîtes `av1C`, `hvcC`, `avcC`) : une chaîne fausse fait sauter à un navigateur un fichier qu'il savait lire.

**Un nouveau rendu.** Avant de changer les noms dans `film.ts`, `bun run film:check` (`scripts/film/check.ts`, il lui faut `ffmpeg`) décode les fichiers listés et mesure chaque raccord, dans chaque format : la dernière image de la boucle contre sa première, la dernière de l'intro contre la première de la boucle, l'affiche contre la première image de l'intro, l'image de fin contre la première de la boucle. Au-dessus de 0,01 (écart quadratique moyen sur les canaux RVB, de 0 à 1), le raccord se voit et la commande sort en erreur. Le rendu v1 est sous 0,006 partout. Le brouillon v0 montrait pourquoi : sa boucle commençait avant la pose du rouge (0,065 entre sa dernière et sa première image), si bien que le rouge disparaissait à chaque reprise.

**Comment il se lance.**

1. Le HTML du serveur porte une `<picture>` dans l'arche : la fin du film sous `(prefers-reduced-motion: reduce)`, le début sinon, à une taille donnée, en `object-fit: cover`. C'est l'affiche, et elle peut être le LCP sur grand écran : elle n'est jamais dans un bloc en fondu, l'arche entre par un masque (`enter-arch`, voir [`mouvement.md`](mouvement.md)). Son `<img>` est en `loading="lazy"` : sur un téléphone l'arche vient après le texte, sous le premier écran, et elle n'est plus demandée avant que la phrase soit peinte (LCP de P01). Dès 768 px, où elle est le LCP, deux préchargements dans l'en-tête la demandent aussi tôt qu'avant (`POSTER_PRELOADS` de `film.ts`, `fetchPriority="high"`, type `image/avif`) : `(min-width: 768px) and (prefers-reduced-motion: no-preference)` pour le début, `… reduce` pour la fin. Chacun est le fichier exact que la `<picture>` prend sur ces écrans, sinon le navigateur téléchargerait deux fichiers ; un navigateur sans AVIF saute le préchargement par son type. Vérifié dans le navigateur, avec et sans mouvement réduit : à 1440 px une seule demande de l'affiche, faite par le préchargement, et c'est elle que l'image affiche ; à 390 px aucun préchargement, l'image la demande elle-même (`tests/e2e/home-hero.spec.ts`).
2. `HeroFilm.tsx` est un composant client et pas un script en ligne : les vidéos s'ajoutent dans un balisage que React possède et répondent à des événements (`playing`, `ended`, un appui sur le bouton) ; un script qui les ajouterait au HTML du serveur se battrait avec l'hydratation. Il pose `data-hero-motion` (`running` ou `paused`) sur la section quand le mouvement est permis, et `data-film="playing"` pendant que le film joue : la feuille de style ne fait tourner le cercle et glisser le bandeau que sous ces attributs.
3. Les vidéos ne sont mises dans la page que si tout est vrai (`mountsFilm`) : le script tourne, `prefers-reduced-motion: no-preference`, pas de Save-Data, l'arche dans l'écran, l'onglet au premier plan, la page chargée (`load`) et le navigateur au repos (`requestIdleCallback`). L'intro (`muted playsInline preload="auto"`) joue ; la boucle se charge en même temps, empilée dessous, et prend la place de l'intro à son `ended` sans image vide (l'intro n'est cachée, par `visibility`, qu'une fois la boucle en lecture).
4. Hors de l'écran, dans un onglet en arrière-plan ou par le bouton, le film se met en pause (`playsFilm`).
5. Quand le film ne viendra pas, l'image de fin, nette, couvre l'affiche du début, dont les maquilleuses sont encore floues : un `play()` refusé (`data-film-phase="refused"`), Save-Data ou un navigateur sans IntersectionObserver (`data-film-phase="still"`, aucune vidéo demandée ; le bouton du badge arrête encore le bandeau), et sans script (une `<noscript>` dans l'arche).
6. Sans script : aucune boucle CSS non plus (WCAG 2.2.2). Avec un mouvement réduit : l'image de fin (la `<source media>` de l'affiche), pas de vidéo, pas de rotation, pas de défilement.

**La police.** Trois coupes statiques de Bodoni Moda, servies par le dépôt (`src/components/home/fonts/`, avec la licence `OFL.txt`) et chargées par `next/font/local` (`hero-font.ts`), par l'accueil seul :

| Fichier | Coupe | Ce qu'elle dessine | Octets |
|---|---|---|---|
| `bodoni-moda-display-regular.woff2` | affichage (`opsz` 96), 400, droit | le titre | 2 164 |
| `bodoni-moda-display-italic.woff2` | affichage (`opsz` 96), 400, italique | « qui vous correspond » | 2 108 |
| `bodoni-moda-text-italic.woff2` | texte (`opsz` 11), 400, italique | le bandeau et les numéros i. ii. iii. | 4 936 |

Les deux premières forment la famille `--font-hero-serif`, la troisième `--font-hero-serif-text` ; toutes en `display: swap` et préchargées : leur texte est dans le premier écran d'un grand écran, et une bascule tardive le déplacerait. Leur repli est un Times New Roman ajusté à leurs mesures, écrit à la main dans `globals.css` (`hero-serif-fallback`, `hero-serif-text-fallback`, passés par l'option `fallback`, avec `adjustFontFallback: false`) : `next/font` calcule ces mesures sur la largeur des lettres a à z, que les coupes réduites n'ont plus toutes, et retombait sur des valeurs par défaut (`size-adjust: 100%` au lieu de 113,57 %). Les valeurs écrites sont celles que `next/font` calculait sur les coupes complètes ; la largeur d'un glyphe ne change pas avec le sous-ensemble. La coupe est dans le fichier : la feuille de style ne règle aucun axe (`font-variation-settings`). L'instance partagée de l'édition directe (`direct-edit/fonts.ts`) ne change pas. Le paragraphe, le formulaire et les lignes restent dans la police du site (pas d'Instrument Sans ici : le LCP du téléphone a peu de marge).

Pourquoi des fichiers à nous : la police variable de `next/font/google` (axes `opsz` et `wght`, droit et italique) préchargeait 99 888 octets devant les feuilles de style, alors que le LCP d'un téléphone (la phrase) n'en a pas besoin, et le LCP mobile de P01 passait au-dessus de son budget de 2,5 s en CI. Une coupe statique ne porte qu'une taille optique et une graisse : 27 280 octets pour les trois avec toutes les lettres du français, puis **9 208** quand chaque coupe ne garde que les caractères du texte qu'elle dessine (voir « Le LCP du téléphone » plus bas). Le rendu est le même : à 1440, 390 et 360 px, les boîtes du titre, de sa ligne italique, de la phrase, des trois lignes et du bandeau sont identiques au centième de pixel, et les captures ne diffèrent que d'anticrénelage (2 534 pixels sur 1,15 million à 1440 px, 42 à 390 px, sur les glyphes eux-mêmes). Une seule différence voulue, depuis les coupes statiques : les numéros i. ii. iii., à 15 px, prenaient la taille optique de leur corps (environ 15) et prennent la coupe de texte (11), d'un écart que l'œil ne voit pas.

**Un texte du haut de page qui change demande de nouvelles coupes.** Chaque coupe ne porte que ces caractères (et l'espace insécable) :

| Coupe | Caractères | Textes |
|---|---|---|
| droit | `␠ ' T a e i j l m n o p q r s t u v é` | « Trouver la maquilleuse », « n'a jamais été », « aussi simple » |
| italique | `␠ c d e i n o p q r s u v` | « qui vous correspond » |
| texte, italique | `␠ - . C E M P S a c d e f g h i l m n o p q r s t u v x è é ’` | i. ii. iii. et les spécialités du bandeau (`SPECIALTY_BULLETS`) |

Le test « les caractères que chaque coupe dessine… » (`tests/unit/home-hero.test.tsx`) lit ces textes dans le rendu du haut de page et échoue au premier caractère de plus ; l'essai « chaque texte en Bodoni est dessiné par sa coupe du dépôt » (`tests/e2e/home-hero.spec.ts`) demande à Chromium quelles polices ont dessiné le titre, sa ligne italique, les numéros et le bandeau, et n'accepte que les trois coupes. Bodoni Moda n'a pas d'espace fine insécable (U+202F) : seule la phrase, dans la police du site, en porte une.

Refaire les fichiers (nouvelle version de la police, texte changé), avec fontTools (4.64.0 pour les coupes du 25/10/2026) et brotli, dans un environnement Python jetable, hors du dépôt :

1. instancier, depuis les polices variables de `google/fonts` (`ofl/bodonimoda`, `BodoniModa[opsz,wght].ttf` et `BodoniModa-Italic[opsz,wght].ttf`, version 2.005, commit `6ce172f`) : `fontTools.varLib.instancer.instantiateVariableFont(font, {'wght': 400, 'opsz': 96}, updateFontNames=True)` (`opsz` 11 pour la coupe de texte, depuis l'italique) ; les coupes complètes de cette étape, réduites aux lettres du français, sont celles du commit `92bc6782` et peuvent servir de départ ;
2. réduire chaque coupe au texte qu'elle dessine, plus l'espace insécable : `pyftsubset <coupe> --text="<les caractères du tableau>" --unicodes=U+00A0 --flavor=woff2 --no-hinting`. Sans les instructions de rendu, comme les fichiers que servait Google ;
3. si la police elle-même change, relire les mesures du repli : les calculer par `next/font` sur les coupes complètes (`adjustFontFallback: 'Times New Roman'`, le temps d'un build) et les reporter dans les deux `@font-face` de `globals.css` et dans le test qui les lit.

La licence SIL Open Font License 1.1 de Bodoni Moda ne réserve aucun nom : une coupe modifiée peut garder le sien.

**Le LCP du téléphone (P01).** Sur un téléphone, l'élément du LCP est la phrase, dans la police du site ; Lighthouse simule le chargement (Lantern) et compte toute requête partie avant cette peinture, préchargée ou non. Mesures du 25/10/2026, en paires sur le même banc (build de `main` à `0d532e9a` contre celui de la branche, médianes de 5, poste chargé : seuls les écarts valent), d'abord par `bun run perf:lighthouse --runs 1 --indicative` en alternance, puis par la même commande de Lighthouse sur P01 seul pour comparer les leviers :

| Levier | LCP de P01, `main` → branche | Retenu |
|---|---|---|
| départ (commit `92bc6782`) | 2,43 → 2,80 s | |
| ne précharger que la coupe droite | 2,42 → 2,75 s, avec l'affiche paresseuse ; FCP 1,04 → 1,23 s ; un décalage (CLS 0,0007) | non : les deux coupes italiques sont demandées dès la première mise en page, toujours avant la peinture de la phrase, seulement plus tard ; et leur bascule a déplacé la page une fois |
| affiche de l'arche paresseuse, préchargée dès 768 px | 2,41 → 2,81 s | oui : à 390 px elle part maintenant après la peinture (vers 300 ms au lieu de 28 ms), sans gain mesurable ici ; c'est le schéma juste pour le LCP de chaque largeur |
| pilules paresseuses | 2,41 → 2,73 s (−70 ms) | oui (hors de la liste de départ, décision à confirmer) |
| coupes réduites au texte (27 280 → 9 208 octets) | 2,41 → 2,58 s (−150 ms) | oui (hors de la liste de départ, décision à confirmer) ; réduites aux lettres a à z et au texte (14 624 octets), elles ne gagnaient rien (2,74 s) |
| charger `HeroFilm` après l'hydratation | — | non essayé : +1,6 Ko de JavaScript transféré, en priorité basse, contre 30 Ko de police |

Mesure finale avec l'outil du dépôt, en paires : voir le tableau des mesures. Restent en plus de `main` avant la peinture du téléphone : les trois coupes (9 Ko, priorité haute), la seconde feuille de style que `next/font` écrit pour les `@font-face` (1,5 Ko, bloquante), 1,7 Ko de plus dans la feuille du site, 1,6 Ko de JavaScript. Le logo, préchargé, part après elles et passe en priorité haute, ce que Lantern compte aussi.

**Ce qui diffère de la maquette, et pourquoi.** La barre de navigation et Instrument Sans de la maquette ne sont pas repris (hors de ce changement) ; la troisième ligne garde le texte de l'issue 1066 (« Écrivez en direct à la maquilleuse ») ; le chevron du choix de l'événement est au bout de son segment (le champ entier s'ouvre au clic) ; le champ « Où ? » de la carte du téléphone a sa hauteur pleine. Quelques finitions vont au-delà de la maquette, qui avait les mêmes défauts : le filet du surtitre reste sur sa première ligne quand il passe sur deux lignes ; les trois lignes numérotées partent du même bord (le numéro a une largeur minimale) ; le titre passe à la ligne en `text-wrap: pretty` (à 360 px, « simple » ne reste plus seul) ; les deux bouts du bandeau se fondent dans l'encre ; le cercle du badge garde une espace insécable entre la fin et le début de son texte. En couleurs forcées (contraste élevé de Windows), les deux champs du formulaire ont un anneau de focus en contour, l'ombre intérieure n'y étant pas dessinée.

**Mesures du 25/10/2026** (build de production, banc de test, Chromium de Playwright) :

| Mesure | Résultat |
|---|---|
| Police ajoutée à `/` | 9 208 octets de woff2, préchargés : les trois coupes statiques réduites au texte qu'elles dessinent (2 164, 2 108 et 4 936 octets, voir « La police »). Avant : 27 280 octets (les mêmes coupes avec toutes les lettres du français), et d'abord 99 888 octets (Bodoni Moda variable, `wght` et `opsz`, de `next/font/google`, sous-ensemble latin, droit 46 248 et italique 53 640) |
| JavaScript du premier chargement (`route-bundle-stats.json`, `main` contre la branche) | `/` : +5 304 octets non compressés (dont 358 pour l'image de fin quand le film ne viendra pas) ; aucune autre route ne change |
| HTML de `/` (même jeu de données) | 131 950 octets avant, 132 118 après ; puis +875 octets avec la police locale et les `<picture>` des pilules (133 385 → 134 260 sur le jeu du banc) ; puis +779 avec les deux préchargements de l'affiche (135 039, contre 131 950 pour `main` sur le même banc ; 24 833 octets compressés contre 24 290) |
| Images du haut de page | affiche 5 524 octets en AVIF, 21 468 en WebP (début) ; image de fin 10 291 en AVIF, 25 990 en WebP (mouvement réduit, Save-Data, sans script, lecture refusée) ; l'affiche en `loading="lazy"`, préchargée en AVIF dès 768 px seulement ; à 1080 × 1400. Pilules (rendu final, 342 × 171) : lèvres 1 600 octets en AVIF, 1 562 en WebP ; pinceau 1 736 en AVIF, 1 864 en WebP ; en `loading="lazy"`, demandées après la première peinture (le pinceau, caché, jamais sur un téléphone). Les brouillons pesaient 2 720 et 3 526 octets |
| Lighthouse P01 (mobile), mesure locale appariée, 5 paires | build de la PR avant la police locale, puis après (police et pilules) : LCP 3,19 s → 2,81 s, FCP 1,10 → 1,09 s, TBT 50 → 55 ms, CLS 0 → 0, performance 0,93 → 0,96, octets transférés 467 012 → 391 477 (médianes ; poste chargé, charge 5 à 13 sur 8 cœurs : les écarts valent, pas les chiffres absolus). Puis `main` (`0d532e9a`) contre la branche, `bun run perf:lighthouse --runs 1 --indicative` en alternance sur la même base : au commit `92bc6782`, LCP 2,43 → 2,80 s ; après l'affiche et les pilules paresseuses et les coupes réduites, **LCP 2,41 → 2,58 s**, FCP 1,07 → 1,08 s, TBT 40 → 39 ms, CLS 0 → 0, performance 0,98 → 0,97, octets transférés 344 089 → 371 313 (écart par paire : +156, +307, +188, +187, +157 ms ; voir « Le LCP du téléphone »). L'élément du LCP reste la phrase |
| Film (rendu v1, intro et boucle) | 185 631 octets en AV1 (Chrome, Firefox), 313 068 en HEVC (Safari), 950 108 en H.264 (ce qui ne lit ni l'un ni l'autre), demandés après le chargement, l'arche dans l'écran ; aucun sous Save-Data ni en mouvement réduit |
| Décalage de mise en page (CLS) | 0 à 390, 768, 1024, 1280 et 1440 px (avec le mouvement, page parcourue puis remontée ; et 0 dans chaque passage de Lighthouse) |
| Élément du LCP | la phrase sur un téléphone (390 px) ; dès 768 px, l'affiche de l'arche avec un mouvement réduit. Avec le mouvement, l'arche entre par son masque : sur le commit `92bc6782` l'affiche devenait le LCP vers 800 à 950 ms (dans Chromium, sans ralentissement), et depuis qu'elle est paresseuse la phrase le reste ; à l'écran, rien ne change |

## « Mise en avant »

Depuis l'issue 1066, la section montre **des profils vérifiés, tirés au hasard à chaque chargement de la page** (décision d'Andy du 24/10/2026). La case « Mise en avant » de l'issue 1066 (`profiles.featured`) n'existe plus.

- **Qui entre dans le tirage.** Les profils dont un admin a coché **« Vérifiée »** (`profiles.verified`, panneau latéral de la fiche, écrite par un admin seulement). La case n'a aucun autre effet public. Elle ne se confond pas avec le badge « Activité vérifiée », qui vient du SIRET (`activity-checks`) et n'entre pas dans le choix. La case est fermée au public : ni l'API REST ni une carte ne la portent ; l'annuaire la lit à part, règles ouvertes (`readVerified`, `src/services/public/profiles.ts`), et seul le fait « vérifiée » reste dans l'annuaire en cache.
- **Lesquels.** Les profils vérifiés **et** publiables **et** joignables (`featuredCandidates`, `src/services/public/featured.ts`), dans l'ordre de l'annuaire. Un profil masqué, suspendu, vide ou non publiable n'y figure jamais, même vérifié. Sans carte, pas de section, pas de titre.
- **Six cartes au plus** (`FEATURED_MAX`), tirées parmi tous les candidats.
- **Chaque coche laisse une ligne au journal de modération** (`moderation-events`, actions `verify` et `unverify` : numéros du profil et de l'admin, action, date, jamais de motif ni de nom ; hook `noteVerification` / `logVerification` dans `src/collections/Profiles.ts`, règle `verifyActionOf` dans `src/lib/profile/verified.ts`). Une écriture du serveur sans admin (import, jeu fictif) n'écrit rien. La politique de confidentialité le dit, et le journal garde les mêmes 60 mois. **Les lignes `feature` et `unfeature`** que la première case a pu écrire restent dans la table et dans l'énumération (une valeur d'énumération ne se retire pas, et réécrire le journal en changerait l'histoire) ; leurs étiquettes disent « (ancienne case) » ; plus rien ne les écrit.
- **Le cache.** Les candidats se lisent dans le cache de Next sous l'étiquette des profils (`cachedFeaturedProfiles`) : enregistrer un profil, la case comprise, rafraîchit l'accueil.

### Pourquoi le tirage se fait dans le navigateur

Le HTML de l'accueil est gardé dans le cache de Next (`home-cached/[key]`, `revalidate = 3600`, voir [`seo/cache-des-pages.md`](seo/cache-des-pages.md)) et servi tel quel à tout le monde : le serveur ne peut pas tirer à chaque visite sans rendre toute la page dynamique.

Les options regardées :

| Option | Verdict |
|---|---|
| Section dynamique derrière `Suspense` (Partial Prerendering) | Écartée. Elle exige `cacheComponents`, un réglage **global** : avec lui, tout segment qui exporte `revalidate`, `dynamic` ou `generateStaticParams` + `dynamicParams` est refusé (guide `migrating-to-cache-components`). Il faudrait refaire le cache de l'accueil, du profil, du talent et de l'article, et leurs tests, pour une section. Sans lui, `connection()` ou `cookies()` rend toute la route dynamique, ce que `tests/unit/page-cache.test.ts` interdit. |
| Section tirée par un composant client (hydratation) ou par une requête après coup | Écartée. Elle ajoute du JavaScript de site au premier chargement (composant, données sérialisées, hydratation), ou une section qui apparaît tard (CLS, ou espace réservé vide). |
| Plusieurs variantes de la page tirées par le proxy | Écartée. Elle dépend de ce qui cache devant le serveur (un cache partagé qui garderait une variante pour tous), qu'on ne peut pas garantir d'ici. |
| **Candidats dans le HTML en cache, tirage par un petit script en ligne** | **Retenue.** |

Le mécanisme (`src/components/home/FeaturedProfiles.tsx`, `src/lib/profile/featured.ts`, règle `.featured-list` de `globals.css`) :

1. Le HTML en cache porte **tous les candidats** (jusqu'à `FEATURED_CANDIDATES_MAX` = 24 ; au-delà, un échantillon aléatoire renouvelé à chaque rafraîchissement de la page, pour que le poids reste plat quel que soit le nombre de profils vérifiés), dans l'ordre de l'annuaire.
2. La feuille de style montre **les six premiers** : c'est ce que voit une visiteuse sans JavaScript, un robot, ou l'impression. Un bloc complet et stable. Les autres sont en `display: none`, jamais en `opacity: 0` (une carte cachée est hors de la page, et son image, en chargement différé, n'est pas demandée).
3. Un `<script>` en ligne, **placé avant la liste** (`featuredDrawScript`, environ 370 octets), tire six rangs au hasard et ajoute au `<head>` une règle de style qui montre ces six-là et cache les autres. Il s'exécute pendant la lecture du HTML, avant que la liste soit peinte, donc sans décalage : le bloc compte six cartes dans les deux cas (CLS 0). Il ne touche **aucun nœud** de la page (React hydrate ce qui est venu du serveur), ne charge aucun module, n'ajoute aucun composant client : aucun octet de JavaScript de plus dans les paquets, le garde `public-client-graph` n'a rien à voir. La politique de contenu autorise déjà les scripts en ligne (`script-src 'unsafe-inline'`, `src/lib/security-headers.ts`).
4. Pas de script, et donc pas de tirage, quand il y a six candidats ou moins : tous sont montrés.

Limites connues : le tirage se fait à chaque **chargement complet** de la page (ce que « à chaque rechargement » demande). Une navigation interne vers l'accueil (clic sur le logo, sans rechargement) ne relance pas le script, que React n'exécute pas : elle montre les six premiers, dans l'ordre de l'annuaire. Les cartes tirées s'affichent dans l'ordre de l'annuaire, pas dans un ordre mélangé : l'ordre visuel suit l'ordre de tabulation (WCAG 2.4.3).

Mesures du 24/10/2026 (build de production, banc de test, profils fictifs) :

| Mesure | Résultat |
|---|---|
| JavaScript du premier chargement (`.next/diagnostics/route-bundle-stats.json`, build de `main` contre build de la branche) | **0 octet de différence sur les 36 routes** (`/home-cached/[key]` 565 935 octets avant et après) : aucun composant client, le script est du HTML |
| HTML de `/`, un candidat | 126 927 octets (23 367 compressés) |
| HTML de `/`, 11 candidats | 195 076 octets (27 779 compressés) : environ 6,8 Ko par carte en clair (le HTML et sa copie dans les données de la page), **0,44 Ko compressés** par carte |
| HTML de `/` au plafond de 24 candidats | environ +160 Ko en clair, +10 Ko compressés par rapport à un seul candidat : la raison du plafond |
| Décalage de mise en page (CLS), `PerformanceObserver` sur le chargement, 5 chargements | 0 à chaque fois ; six cartes visibles à chaque fois, un tirage différent d'un chargement à l'autre, aucune erreur d'hydratation dans la console |
| LCP | Inchangé par construction : la section est sous le haut de page, aucune carte n'est `priority`, une carte cachée ne charge pas son image |

Le script en ligne pèse 368 octets (`featuredDrawScript(24, 6)`).

## Tests

`tests/unit/home-hero.test.tsx` et `tests/e2e/home-hero.spec.ts` (le haut de page « en arche » : titre au caractère près, film, bouton, bandeau, mouvement réduit, sans script, en-têtes des fichiers), `tests/unit/home-featured.test.tsx` (candidats, échantillon, script de tirage joué contre une fausse page, journal, énumération, bloc, page), `tests/integration/profile-verified.test.ts` (journal, candidats et lecture publique sur le banc), `tests/integration/payload-access.test.ts` et `tests/integration/profile-public-read.test.ts` (matrice d'accès : « Vérifiée » lue par la propriétaire et l'admin, écrite par l'admin ; `featured` n'existe plus), `tests/unit/access.test.ts`, `tests/e2e/home-guided-search.spec.ts` (390 et 1440 px : section absente sans profil vérifié, six cartes au plus, tirage différent avec `Math.random` fixé, six premiers sans JavaScript).
