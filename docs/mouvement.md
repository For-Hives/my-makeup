# Le mouvement du site (issues 1069 et 1088)

Un petit système, pas du cas par cas : des jetons dans `src/app/(front)/globals.css` (`@theme static`, bloc « Motion tokens »), quelques classes partagées, et des tests qui tiennent les règles. Andy veut du sobre et du travaillé : pas de parallaxe, pas de rebond, pas de cascade qui fait apparaître tout le site.

## Les règles

- **Un rôle avant un effet.** Une animation guide l'œil (un bloc arrive), donne un retour (j'ai survolé, j'ai cliqué) ou relie deux états. Aucune animation décorative qui retarde la lecture.
- **`transform` et `opacity` seulement** (plus des couleurs qui ne touchent pas la mise en page : fond, texte, trait de soulignement). Jamais de largeur, de hauteur, de marge, de `top`/`left` ni de `transition: all`. La mise en page ne bouge pas : CLS à 0.
- **Mouvement réduit.** Tout ce qui bouge est déclaré sous `@media (prefers-reduced-motion: no-preference)`. Avec `reduce`, rien ne glisse ni ne s'efface, et chaque changement d'état (teinte, soulignement, ombre) reste visible, tout de suite : une règle finale ramène à 0,01 ms toute transition et toute animation qu'un composant déclarerait encore (une classe `transition` de Tailwind), et coupe les boucles.
- **Rien n'est caché en attente d'un script.** Aucun `opacity: 0` hors d'une image-clé. Le HTML rendu par le serveur est entier ; sans animation, sans script, à l'impression, le contenu est là.
- **Le premier écran n'est jamais animé.** Un bloc déjà à l'écran a dépassé sa plage d'animation : il est visible dès le premier affichage. Le LCP n'est ni caché ni déplacé.
- **Pas de bibliothèque ni de JavaScript écrit pour le site.** Tout est du CSS ; la transition de page passe par le composant `ViewTransition` de React, déjà dans le code de Next. Le JavaScript du premier chargement ne bouge pas (voir « Transition de page »).

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
| `.reveal` | Le bloc apparaît en fondu et monte de 12 px quand son haut entre dans l'écran (plage de 220 px). Animation pilotée par le défilement (`animation-timeline: view()`), sous `@supports` : un navigateur qui ne la connaît pas montre le bloc sans effet. Sans remplissage : avant et après sa plage le bloc est tel quel, donc un bloc sous la ligne de flottaison n'est jamais caché (le contrôle d'accessibilité juge la page posée : son aide coupe `.reveal`). Coupée à l'impression et sur la page de la maquilleuse en mode édition (`[data-edit-page]`), dont les blocs se mesurent et se cliquent. | voir « Où est l'apparition » ci-dessous |
| Contrôles (liens, boutons, résumés, champs à cocher) | Les états de l'affordance (`:hover`, `:active`) s'adoucissent en 100 ms au lieu de claquer. Un lien se souligne et le trait apparaît en fondu. Les boutons `.btn-*` montent de 1 px (retour au clic). Dans la couche `base`, sous `:where` : un composant qui style son propre état gagne. | tout le site |
| `.card-hover` + `.card-zoom` | La carte monte de 3 px, prend une ombre ; l'image grandit de 3 % (la carte la rogne : rien ne bouge autour). L'ombre reste avec le mouvement réduit. | carte de profil (`ResultCard`) |
| `.motion-arrow` | La flèche d'un bouton avance de 2 px. | « Trouver ma maquilleuse » |

Le survol n'existe que pour une souris (`@media (hover: hover)`) : l'affordance du site (voir `src/app/(front)/globals.css`, « What a hand on the mouse sees ») ne dépend d'aucun mouvement.

## Transition de page (issue 1087)

Les navigations de Next.js se font dans la page, sans chargement : `@view-transition { navigation: auto }` ne vaut que pour les chargements complets, qu'il retarde, donc il n'est pas utilisé. Next 16 n'a pas d'option à activer : l'App Router embarque le React canari, dont le composant `<ViewTransition>` appelle `document.startViewTransition` à chaque navigation (guide `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`). Le site n'écrit donc **aucun JavaScript** : un gabarit côté serveur, `src/app/(front)/(site)/template.tsx`, enveloppe la page dans `<ViewTransition default="none" enter="page-in" exit="page-out">`, et la feuille de style anime les deux classes (bloc « Page transition » de `globals.css`).

- **Pourquoi un gabarit.** Un gabarit (`template`) est remonté à chaque navigation vers une autre page, donc `enter` et `exit` jouent ; un `layout` persiste et ne jouerait jamais. `default="none"` : un changement de filtre sur la même page, un rafraîchissement ou une révélation de Suspense n'animent rien.
- **Le mouvement.** L'ancien contenu s'efface en `--duration-hover` (100 ms, `--ease-in-soft`), puis le nouveau apparaît en fondu et monte de `--motion-distance` (12 px) pendant `--duration-page` moins `--duration-hover` (260 ms, `--ease-out-soft`) : 360 ms en tout. `transform` et `opacity` seulement. Le cliché du reste de la page (menu, pied) ne s'anime pas : le menu ne bouge jamais.
- **Où ça ne joue pas.** Premier chargement et rechargement complet (aucune navigation interne), navigateur sans l'API (navigation normale), mouvement réduit (`animation: none !important` sur tous les pseudo-éléments de la transition), page de la maquilleuse en mode édition (`:root:has([data-edit-page])`), « Mon espace » et l'administration (hors du gabarit du site).
- **Cliquable pendant la transition** : `::view-transition { pointer-events: none }`.
- **Poids.** Aucun octet de JavaScript du site ; le gabarit est un composant serveur, le garde `public-client-graph` ne le voit pas. Mesure sur `route-bundle-stats.json` (build avec et sans gabarit) : `/search` 565 808 → 565 718 octets, `/profil/[slug]` 583 391 → 583 319, soit −90 octets (du bruit : le composant est déjà dans React).
- **Limite connue.** Deux pages du même segment (`/profil/a` vers `/profil/b`) ne remontent pas le gabarit : pas de transition entre elles.

## Ce qui n'est pas fait, et pourquoi

- **Une seule apparition par bloc.** Une animation pilotée par le défilement suit le défilement dans les deux sens : un bloc qui sort par le bas se recache hors de l'écran, puis réapparaît. Une apparition « une fois » demanderait un `IntersectionObserver`, donc du JavaScript.
## Où est l'apparition (issue 1088)

`.reveal` est posée sur les blocs de chaque page, jamais sur un composant client d'une page publique (le test le garde : aucun octet de JavaScript de plus). Une liste n'a pas de classe de plus : chaque `<li>` porte la sienne, et le défilement étale lui-même les lignes (pas de cascade).

| Page | Blocs qui apparaissent |
|---|---|
| accueil, recherche | cartes de « Mise en avant » et des résultats, bloc du projet, invitation à l'action (issue 1069) |
| fiche (`/profil/<slug>`) | cartes et sections repliables (issue 1069) |
| talent (`/talent/<slug>`) | l'article, les cartes des maquilleuses de la spécialité, le champ « Votre ville » |
| zone (`/maquilleuses/<département>`) | l'introduction, les cartes, le champ « Votre ville » |
| blog | l'en-tête, chaque article de la liste ; pied d'un article : les cartes (`ProfileBlock`) |
| classement | chaque section (groupes de règles, « Ce qui ne compte pas », badge) |
| contact | l'introduction du formulaire, le bloc « Contactez-nous », chaque carte d'adresse |
| connexion, inscription | l'aide « Mot de passe » et les liens du bas. Tout le reste tient dans le premier écran : par règle, il n'est pas animé, donc ces pages n'ont que les transitions de contrôles |
| « Mon espace » | chaque carte (`CARD` et les cartes qui ne l'utilisent pas : disponibilité, vues, demandes de devis, mot de passe, suppression, page en ligne) |

Les tests (`motion-system.test.ts`, section « the reveal reaches the pages ») refusent qu'une de ces pages perde son apparition, ou qu'un composant client d'une page publique la porte.

## Ce qui n'est pas fait, et pourquoi

- **Transition de page.** Les navigations de Next.js sont faites dans la page : seule l'API View Transitions en JavaScript (ou l'option expérimentale de Next, qui dépend de React canari) peut les animer, et `@view-transition { navigation: auto }` ne vaut que pour les chargements complets, qu'il retarde. Rien de gratuit : décision à prendre (voir la PR).
- **Une seule apparition par bloc.** Une animation pilotée par le défilement suit le défilement dans les deux sens : un bloc qui sort par le bas se recache hors de l'écran, puis réapparaît. Une apparition « une fois » demanderait un `IntersectionObserver`, donc du JavaScript : refusé à l'issue 1088 pour garder le JavaScript du premier chargement à zéro octet de plus (décision à confirmer par Andy, voir la PR).
- **Entrée de la connexion et de l'inscription.** Leur contenu est tout entier dans le premier écran, qui n'est jamais animé. Une entrée à l'ouverture de la page (animation dans le temps) cacherait le texte au premier affichage ou retarderait le LCP : non faite.
- **Pli des cartes de la fiche.** Un `<details>` qui s'ouvre en glissant anime une hauteur : interdit. Le chevron tourne déjà.
- **Éditeurs de l'édition directe.** Le halo garde sa transition de 150 ms (`EditableBlock`), déjà couverte par `motion-reduce`.

## Tests

- `tests/unit/motion-system.test.ts` : jetons dans leurs plages, aucune propriété de mise en page animée, tout mouvement sous `no-preference`, le mouvement réduit ramène tout à 0,01 ms, aucun `opacity: 0` par défaut, `.reveal` sous `@supports`, aucun `transition-all`, rebond ou pulsation dans le code.
- `tests/e2e/motion.spec.ts`, à 390 et 1440 px : rien n'est atténué sur le premier écran (accueil, recherche, page fixe, fiche, liste de cartes), CLS à 0 en parcourant toute la page, sans JavaScript le texte est là, avec mouvement réduit aucune animation ni transition, une carte monte au survol.
- `tests/unit/page-transitions.test.ts` : le gabarit est un composant serveur du groupe public seul, ses classes et les règles de la feuille de style (durées par jetons, total ≤ `--duration-page`, rien ne bouge hors `no-preference`, mouvement réduit et page d'édition sans animation).
- `tests/e2e/page-transitions.spec.ts`, à 390 et 1440 px : recherche vers fiche reste dans la même page, la transition de vue joue (animations `page-in` et `page-out`), aucun décalage de mise en page ; avec mouvement réduit, aucune animation de transition.
- `tests/e2e/motion.spec.ts`, à 390 et 1440 px : rien n'est atténué sur le premier écran (accueil, recherche, page fixe, blog, classement, contact, connexion, inscription, fiche, liste de cartes, talent, « Mon espace »), les blocs révélés sont entiers une fois la page parcourue, CLS à 0 en parcourant toute la page, sans JavaScript le texte est là, avec mouvement réduit aucune animation ni transition, une carte monte au survol.
- `tests/e2e/interaction-affordance.spec.ts` et `tests/e2e/direct-edit-halo.spec.ts` gardent leurs hypothèses (`freezeMotion`, halo mesuré sans décalage).
