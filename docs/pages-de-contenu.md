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
| `TitleWithAccent` | Un titre qui finit par un emoji : les mots sont le titre, l'emoji est un accent décoratif masqué aux lecteurs d'écran. |

## Les règles

- **Les mots ne bougent pas.** `tests/fixtures/content-pages-text.json` garde les lignes des pages d'avant la passe ; `tests/unit/content-pages-design.test.tsx` vérifie que chacune est encore là, dans l'ordre. Les pages légales gardent leur empreinte (`tests/fixtures/legal-pages-text.json`) : leur coquille (`LegalPage`) n'ajoute aucun texte, ni étiquette ni signature.
- **Le `Hero` n'est pas modifié.** Son titre prend la police d'affichage par la règle `.content-page h1` du bloc « Content pages » de `globals.css` (le seul bloc de feuille de style de cette passe).
- **Mesure de lecture** de 66 caractères (`max-w-[66ch]`) ; un test de navigateur refuse un paragraphe plus large.
- **Mouvement.** Les blocs portent `.reveal` (voir `docs/mouvement.md`) ; aucune animation n'est déclarée dans ce bloc.
- **Polices.** `next/font` ne s'exécute pas sous `bun test` : `tests/support/preload-fonts.ts` (chargé par `bunfig.toml`) les remplace par des objets simples. Ce que font les vraies polices (échange, repli à la même taille) est mesuré en navigateur : `tests/e2e/content-pages.spec.ts` (décalage de mise en page sous 0,005, comme « Mon espace »).
- **Sans emoji nouveau, sans photo, sans chiffre inventé.** Les accents sont des pastilles, des filets et des chiffres d'ordre.
