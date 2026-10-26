# Les pages de contenu du site public (issue 1102)

Les pages de texte du site public ont une mise en page commune, éditoriale et sobre : Bodoni Moda pour les titres, Instrument Sans pour le texte, l'indigo du site public. Aucun mot ni aucun `h1` n'a changé (registre : `pages-de-contenu-editoriales`).

## Les briques

Tout est dans `src/components/static-pages/`, une brique pour chaque besoin :

| Brique | Rôle |
|---|---|
| `ContentPage` (`EditorialArticle.tsx`) | Le `<main>` des pages de contenu : pose la classe `content-page` et les deux polices. Ni le gabarit du site, ni l'accueil, ni le blog ne les chargent. |
| `ArticleShell`, `Eyebrow`, `Lead`, `TeamSignature` | Le titre de l'article (étiquette, h2, filet) à gauche sur grand écran, le texte à droite ; une seule colonne (`layout="single"`) pour le texte juridique. Le chapô est plus grand que le texte ; la signature est un filet et « L'équipe My-Makeup ». |
| `ClientGuide` | Les quatre guides du particulier : étapes en liste numérotée (`<ol>`, chiffre dessiné masqué aux lecteurs d'écran, un `data-step` par ligne). |
| `PageArticle` | À propos, partenariats, solutions pour les maquilleuses : chaque partie est une ligne (titre, texte) entre deux filets. Le paramètre `eyebrow` est le nom du menu où vit la page. |
| `Benefits` | Les avantages des deux pages « Pourquoi… » : une liste de cartes (pastille indigo, titre, texte) ; une carte seule sur la dernière ligne prend toute la largeur. |

## Les règles

- **Les mots ne bougent pas.** `tests/fixtures/content-pages-text.json` garde les lignes des pages d'avant la passe ; `tests/unit/content-pages-design.test.tsx` vérifie que chacune est encore là, dans l'ordre. Les pages légales gardent leur empreinte (`tests/fixtures/legal-pages-text.json`) : leur coquille (`LegalPage`) n'ajoute aucun texte, ni étiquette ni signature.
- **Le `Hero` n'est pas modifié.** Son titre prend la police d'affichage par la règle `.content-page h1` du bloc « Content pages » de `globals.css` (le seul bloc de feuille de style de cette passe).
- **Mesure de lecture** de 66 caractères (`max-w-[66ch]`) ; un test de navigateur refuse un paragraphe plus large.
- **Mouvement.** Les blocs portent `.reveal` (voir `docs/mouvement.md`) ; aucune animation n'est déclarée dans ce bloc.
- **Polices.** `next/font` ne s'exécute pas sous `bun test` : `tests/support/preload-fonts.ts` (chargé par `bunfig.toml`) les remplace par des objets simples. Ce que font les vraies polices (échange, repli à la même taille) est mesuré en navigateur : `tests/e2e/content-pages.spec.ts` (décalage de mise en page sous 0,005, comme « Mon espace »).
- **Aucun emoji, aucun tiret cadratin ni demi-cadratin de phrase** (issue 1135, 26/10/2026 : les titres des parties n'ont plus d'emoji, `TitleWithAccent` est retiré). `tests/unit/no-emoji-no-emdash.test.tsx` lit le texte rendu des pages publiques, leurs titres et descriptions, le pied de page et les fixtures de texte ; seuls `©`, `®`, `™` et un demi-cadratin sans espace (un nom composé comme « UE–États-Unis ») passent. Les articles et profils de la base ne sont pas lus. Les pages légales n'ont changé ni de mot ni de ponctuation (leurs empreintes sont inchangées).
- **Sans photo, sans chiffre inventé.** Les accents sont des pastilles, des filets et des chiffres d'ordre.

## Le kit sur ces pages (issue 1111, 25/10/2026)

Les pages de contenu portent maintenant la direction artistique ([`direction-artistique.md`](direction-artistique.md)) : `ArtPage` (fond papier, mêmes deux polices préchargées que `ContentPage`, qui reste exportée ; les pages légales et le plan du site passent elles aussi par `ArtPage` et `PageHead` depuis le 25/10/2026 : leurs mots ne bougent pas, la tête blanche et l'article gris disparaissent), `PageHead` (le `Hero` reste à l'accueil), `ProfileGrid` (cartes en arche pour les zones et les talents, mêmes règles que `ProfileBlock`, qui reste sous les articles du blog). `<Cta />` est inchangé sur chaque page.
Les pages de contenu portent maintenant la direction artistique ([`direction-artistique.md`](direction-artistique.md)) : `ArtPage` (fond papier, mêmes deux polices préchargées que `ContentPage`, que plus aucune page n'utilise ; les pages légales prennent `ArtPage` depuis la passe de cohérence du 25/10/2026, leurs mots ne bougent pas), `PageHead` (le `Hero` reste à l'accueil), `ProfileGrid` (cartes en arche pour les zones et les talents, mêmes règles que `ProfileBlock`, qui reste sous les articles du blog). `<Cta />` est inchangé sur chaque page.

| Famille | Pages | Disposition du kit |
|---|---|---|
| Guides du particulier | trouver une maquilleuse, centraliser ses recherches, explorer les profils, solutions pour les particuliers | tête A (arche à droite, une illustration et une teinte par guide) puis E (étapes en pastilles numérotées sur un filet, dans un cadre blanc) |
| « Pourquoi… » | maquilleuse, particulier | tête centrée avec une pastille dans le titre, puis B (arches étagées, un objet dessiné par avantage ; un jeu d'objets, de teintes et de bandes par page), bannière script (maquilleuse) ou rose (particulier) |
| Pages pour les maquilleuses | partenariats, solutions pour les maquilleuses | tête A inversée (arche à gauche), parties en lignes à pastille ronde, bannière « filets » ou rose qui reprend les titres des parties |
| À propos | `/a-propos` | tête centrée, puis D (énoncé en Bodoni entre deux arches, sans guillemets : ce n'est pas une citation), quatre cartes teintées, bannière script |
| Contact | `/contact` | formulaire en champs arrondis dans un cadre, puis F version données réelles : les quatre adresses de l'équipe en Bodoni entre des filets |
| Remerciement | `/demande-envoyee` | tête centrée, une petite arche, une pilule |
| Zone | `/maquilleuses/<département>` | bande C (le vrai nombre de maquilleuses en grand sur indigo) puis grille de cartes en arche |
| Talent | `/talent/<slug>` | tête A (illustration choisie par le slug) puis texte dans un cadre blanc, cartes en arche |

Règles : aucun mot nouveau ; les pastilles, objets et dessins sont décoratifs (`aria-hidden`) ; pas de témoignage, de chiffre ni de nom de presse inventés (les dispositions C et F du kit n'emploient que des données réelles, D que le texte de la page) ; les emplacements d'illustration à remplacer par de futurs portraits sont les arches de `AboutArticle`, de `/demande-envoyee` et l'argument `image` de `PageHead` (`pickIllustration` pour les talents). Les bannières sont sous la ligne de flottaison (la police script n'est pas préchargée). L'ordre des lignes de `tests/fixtures/content-pages-text.json` : la recherche des guides vient après la description et non avant le titre. **La recherche des guides** (`GuideSearch`, `src/components/search/GuideSearch.tsx`, issue 1138) remplace `SearchBlock` sur les guides du particulier et sur « Pourquoi particulier » : la famille de la barre de `/search` (deux champs en pilule de 52 px et un bouton), dans une carte blanche, **sur une seule ligne dès 768 px** (grille à trois colonnes) et l'un sous l'autre sur téléphone ; libellés « Prestation recherchée » et « Ville de la prestation » (lus par les lecteurs d'écran), paramètres `search` et `city`, marque de mesure des soumissions. `SearchBlock` ne sert plus qu'au haut de page (`Hero`).

## La passe de cohérence (25/10/2026)

- **Plan du site, classement, pages légales** passent par `ArtPage` et `PageHead`, avec le texte dans un cadre blanc ; les mots et les `h3` du plan ne changent pas (les essais les gardent, comme les empreintes des pages légales). Sur le classement, la phrase d'introduction devient le sous-titre de la tête.
- **Pied d'article du blog** : `ProfileGrid` (cartes en arche) remplace `ProfileBlock` ; celui-ci n'a plus d'autre usage que ses essais, comme `ContentPage`, `ArticleShell`, `Eyebrow`, `Lead` et `TeamSignature` (code à retirer dans un nettoyage).
- **Page publique d'un profil** : son HTML est gelé par les fichiers `tests/fixtures/direct-edit/*.golden`, donc la page est seulement enveloppée de `.profile-art` (papier derrière, arrondi et filet des cartes du kit : un bloc de `globals.css`). Les classes de `ProfileView` ne bougent pas. Les titres restent en sans empattement : Bodoni n'est pas préchargé sur cette route, et son échange décalait la mise en page (CLS 0,0009 à 390 px, là où `tests/e2e/motion.spec.ts` exige 0). Les passer en Bodoni demande de précharger la police sur la page de profil, la plus visitée du site : décision à prendre avec une mesure de LCP.

