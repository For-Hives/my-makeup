# Le mouvement du site (issue 1069)

Un petit système, pas du cas par cas : des jetons dans `src/app/(front)/globals.css` (`@theme static`, bloc « Motion tokens »), quelques classes partagées, et des tests qui tiennent les règles. Andy veut du sobre et du travaillé : pas de parallaxe, pas de rebond, pas de cascade qui fait apparaître tout le site.

## Les règles

- **Un rôle avant un effet.** Une animation guide l'œil (un bloc arrive), donne un retour (j'ai survolé, j'ai cliqué) ou relie deux états. Aucune animation décorative qui retarde la lecture.
- **`transform` et `opacity` seulement** (plus des couleurs qui ne touchent pas la mise en page : fond, texte, trait de soulignement). Jamais de largeur, de hauteur, de marge, de `top`/`left` ni de `transition: all`. La mise en page ne bouge pas : CLS à 0.
- **Mouvement réduit.** Tout ce qui bouge est déclaré sous `@media (prefers-reduced-motion: no-preference)`. Avec `reduce`, rien ne glisse ni ne s'efface, et chaque changement d'état (teinte, soulignement, ombre) reste visible, tout de suite : une règle finale ramène à 0,01 ms toute transition et toute animation qu'un composant déclarerait encore (une classe `transition` de Tailwind), et coupe les boucles.
- **Rien n'est caché en attente d'un script.** Aucun `opacity: 0` hors d'une image-clé. Le HTML rendu par le serveur est entier ; sans animation, sans script, à l'impression, le contenu est là.
- **Le premier écran n'est jamais animé.** Un bloc déjà à l'écran a dépassé sa plage d'animation : il est visible dès le premier affichage. Le LCP n'est ni caché ni déplacé.
- **Pas de bibliothèque ni de JavaScript.** Tout est du CSS. Le JavaScript du premier chargement ne bouge pas d'un octet.

## Les jetons

| Jeton | Valeur | Pour |
|---|---|---|
| `--duration-hover` | 100 ms | retour au survol, au clic (80 à 120 ms) |
| `--duration-lift` | 200 ms | carte qui se soulève, image qui grandit |
| `--duration-appear` | 280 ms | apparition (200 à 320 ms) |
| `--duration-page` | 360 ms | changement de page (400 ms au plus) |
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | entrer : sortie douce |
| `--ease-in-soft` | `cubic-bezier(0.64, 0, 0.78, 0)` | sortir : entrée douce |
| `--motion-distance` | 12 px | glissement d'une apparition (8 à 16 px) |
| `--motion-lift` | 3 px | élévation d'une carte (2 à 4 px) |
| `--motion-zoom` | 1,03 | image d'une carte (2 à 4 %) |

`tests/unit/motion-system.test.ts` lit la feuille de style et refuse un jeton hors de sa plage. La cascade courte (40 à 60 ms entre éléments, 6 au plus) n'est pas utilisée : une apparition au défilement est déjà étalée par le défilement lui-même.

## Les briques

| Brique | Ce qu'elle fait | Où |
|---|---|---|
| `.reveal` | Le bloc apparaît en fondu et monte de 12 px quand son haut entre dans l'écran (plage de 220 px). Animation pilotée par le défilement (`animation-timeline: view()`), sous `@supports` : un navigateur qui ne la connaît pas montre le bloc sans effet. Sans remplissage : avant et après sa plage le bloc est tel quel, donc un bloc sous la ligne de flottaison n'est jamais caché (le contrôle d'accessibilité juge la page posée : son aide coupe `.reveal`). Coupée à l'impression et sur la page de la maquilleuse en mode édition (`[data-edit-page]`), dont les blocs se mesurent et se cliquent. | cartes de la recherche et de « Mise en avant », cartes de la fiche, cadre de l'invitation à l'action, cartes de « Mon espace » |
| Contrôles (liens, boutons, résumés, champs à cocher) | Les états de l'affordance (`:hover`, `:active`) s'adoucissent en 100 ms au lieu de claquer. Un lien se souligne et le trait apparaît en fondu. Les boutons `.btn-*` montent de 1 px (retour au clic). Dans la couche `base`, sous `:where` : un composant qui style son propre état gagne. | tout le site |
| `.card-hover` + `.card-zoom` | La carte monte de 3 px, prend une ombre ; l'image grandit de 3 % (la carte la rogne : rien ne bouge autour). L'ombre reste avec le mouvement réduit. | carte de profil (`ResultCard`) |
| `.motion-arrow` | La flèche d'un bouton avance de 2 px. | « Trouver ma maquilleuse » |

Le survol n'existe que pour une souris (`@media (hover: hover)`) : l'affordance du site (voir `src/app/(front)/globals.css`, « What a hand on the mouse sees ») ne dépend d'aucun mouvement.

## Ce qui n'est pas fait, et pourquoi

- **Transition de page.** Les navigations de Next.js sont faites dans la page : seule l'API View Transitions en JavaScript (ou l'option expérimentale de Next, qui dépend de React canari) peut les animer, et `@view-transition { navigation: auto }` ne vaut que pour les chargements complets, qu'il retarde. Rien de gratuit : décision à prendre (voir la PR).
- **Une seule apparition par bloc.** Une animation pilotée par le défilement suit le défilement dans les deux sens : un bloc qui sort par le bas se recache hors de l'écran, puis réapparaît. Une apparition « une fois » demanderait un `IntersectionObserver`, donc du JavaScript.
- **Pli des cartes de la fiche.** Un `<details>` qui s'ouvre en glissant anime une hauteur : interdit. Le chevron tourne déjà.
- **Éditeurs de l'édition directe.** Le halo garde sa transition de 150 ms (`EditableBlock`), déjà couverte par `motion-reduce`.

## Tests

- `tests/unit/motion-system.test.ts` : jetons dans leurs plages, aucune propriété de mise en page animée, tout mouvement sous `no-preference`, le mouvement réduit ramène tout à 0,01 ms, aucun `opacity: 0` par défaut, `.reveal` sous `@supports`, aucun `transition-all`, rebond ou pulsation dans le code.
- `tests/e2e/motion.spec.ts`, à 390 et 1440 px : rien n'est atténué sur le premier écran (accueil, recherche, page fixe, fiche, liste de cartes), CLS à 0 en parcourant toute la page, sans JavaScript le texte est là, avec mouvement réduit aucune animation ni transition, une carte monte au survol.
- `tests/e2e/interaction-affordance.spec.ts` et `tests/e2e/direct-edit-halo.spec.ts` gardent leurs hypothèses (`freezeMotion`, halo mesuré sans décalage).
