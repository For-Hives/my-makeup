# La barre de navigation du site public (issue 1100)

Le composant est `src/components/layout/Nav.tsx` ; ses styles sont dans un bloc nommé de `src/app/(front)/globals.css` (« Navbar (issue 1100) »). Il suit les règles de [`mouvement.md`](mouvement.md) : jetons du site, `transform` et `opacity` seulement, mouvement réduit respecté. Direction : sobre, éditorial, indigo, sans rebond ni halo.

## Ce que fait la barre

| Élément | Comportement |
|---|---|
| Entrées (« Particulier », « Maquilleuse », « Solutions », « Blog », « Mon espace ») | Cible de 44 px de haut au moins (`.nav-link`), 12 px de marge de chaque côté du texte, 8 px entre deux entrées. Au survol, au focus clavier et quand le groupe est ouvert, un trait de 2 px glisse sous le texte de gauche à droite (`transform: scaleX`, 200 ms, `--ease-out-soft`) et le texte passe de gris foncé à indigo. La page courante garde le trait (`aria-current="page"`). Le soulignement global des liens est coupé sur ces éléments : il n'y a qu'un trait, le leur. |
| Groupes (menus déroulants) | S'ouvrent au survol d'une souris sur ordinateur (à partir de 1024 px), après 90 ms de présence ; ferment 200 ms après la sortie. Passer d'un groupe à l'autre est immédiat. Le haut du panneau est une marge transparente qui relie le bouton à la carte : la main ne la quitte pas en descendant. Un doigt ou une fenêtre étroite utilisent le clic. |
| Clavier | `Entrée` / `Espace` ouvre ou ferme ; `Flèche bas` sur le bouton ouvre et entre dans la liste ; `Flèche haut` / `Flèche bas` parcourent, `Début` / `Fin` vont aux extrémités, `Flèche haut` sur le premier lien revient au bouton ; `Échap` ferme et rend le focus au bouton ; sortir du groupe avec `Tab` le ferme. Le motif est celui d'une divulgation (`aria-expanded`, `aria-controls`), pas d'un `role="menu"`. |
| Panneau | Une carte blanche (rayon de 12 px, filet gris clair, ombre douce), sans flèche, sans grille et sans fond gris au survol. Chaque ligne est un lien entier (titre et description) dont le nom accessible est le titre (`aria-labelledby`) ; au survol le titre passe à l'indigo et se souligne du même trait glissant. Il apparaît en fondu avec une montée de 8 px en 200 ms (`@keyframes nav-panel-in`) ; il se ferme sans animation. |
| « Trouver une maquilleuse » | La pilule à contour du kit (`pillClassName({ variant: 'outline', size: 'sm' })`, 44 px) avec sa flèche (`art-arrow`, 4 px de plus au survol, immobile en mouvement réduit) : au survol le contour se remplit d'encre et le texte passe au blanc (200 ms), sans soulignement de texte. Plus de loupe ni de bordure carrée. |
| « Me connecter », « Me déconnecter » | Une pilule douce (fond `indigo-50`, sans bordure, 44 px, texte gras indigo) qui garde la mécanique d'une entrée : **un seul trait** (`.nav-link-strong`), posé sur le texte (`after:inset-x-5`). Au survol et au focus le fond passe à `indigo-100`. L'ancienne classe `btn-primary-simple` ajoutait une bordure basse permanente à la ligne que le survol global des liens soulignait : deux traits l'un sur l'autre. |
| Page courante | Une ellipse tracée à la main (`SwirlEllipse`, sans étoile) entoure l'entrée dont l'adresse est celle de la page (`aria-current="page"`). Elle prend la place du trait, qui ne se dessine plus sur la page courante (`content: none`) : une seule marque. |
| Version étroite (< 1024 px) | Le bouton « Menu » ouvre la liste ; les groupes se déplient sur place, sans carte ni animation. Les cibles font 44 px. |
| Mouvement réduit | Aucune transition ni animation : le trait, la couleur et la carte apparaissent tout de suite. |

Les deux pilules et l'ellipse viennent du kit ([`direction-artistique.md`](direction-artistique.md)) par deux fichiers **sans aucun import** (`pill-class.ts`, `SwirlEllipse.tsx`) : le composant de la barre est client, il ne tire pas les dessins générés (52 Ko). Le JavaScript de la barre n'a pas de nouvelle logique.

## Pourquoi c'était laid avant

- Le bouton d'un groupe recevait la teinte grise globale des boutons au survol (`filter: brightness(.92)` et fond gris) : le « carré gris ».
- Le panneau mettait chaque ligne dans une case qui grisait au survol, avec un anneau et des angles de 24 px : la « petite grille ».
- « Me connecter » cumulait la bordure basse du bouton et le soulignement des liens.

## Décisions

- Le trait est un pseudo-élément mis à l'échelle, pas `text-decoration` : seul `transform` bouge, la mise en page ne bouge pas (CLS 0).
- Les jetons existants suffisent (`--duration-hover` 200 ms, `--ease-out-soft`) : aucun nouveau jeton, aucune dépendance.
- Le JavaScript est celui du composant client qui existait déjà (état ouvert, session) ; l'intention de survol y ajoute quelques lignes, sans bibliothèque.

## Tests

- `tests/unit/navbar.test.ts` : les deux pilules, l'ellipse de la page courante et les fichiers du kit sans import ; le balisage (plus de carré gris, de bague ni de `btn-primary-simple`), les cibles de 44 px, les délais, les flèches, le trait en `transform`, les transitions sous `no-preference` avec les jetons, la carte du panneau.
- `tests/e2e/navbar.spec.ts`, à 1440 et 390 px : cibles de 44 px, trait unique au survol et au focus, ouverture au survol avec délai, traversée de l'espace sans fermeture, survol de passage sans ouverture, carte propre, clavier complet, mouvement réduit, axe avec un groupe ouvert, captures.
- `tests/e2e/layout.spec.ts` garde le menu replié au clavier.
