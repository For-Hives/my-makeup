# L'édition directe du profil

Issue 1008 (cadre : 1007). L'espace de la maquilleuse devient le profil public lui-même : les mêmes composants, un mode lecture et un mode édition.

## Ce qui existe

- **Le mode édition** est celui de la page privée `/auth/apercu-profil?mode=edition` (`src/lib/direct-edit/edit-mode.ts`). Sans le paramètre, la page est l'aperçu d'une visiteuse, inchangé. Les deux sont `private, no-store` et `noindex`. Jamais sur `/profil/<slug>` : son HTML est servi du cache partagé et ne lit ni cookie ni en-tête.
- **Un composant, deux modes.** `ProfileView` et `ProfileHeader` reçoivent, en mode édition seulement, des *emplacements* (`src/components/profile/edit-slots.ts`) : des fonctions qui enveloppent chaque bloc. Sans emplacements, le HTML est celui d'avant (garde : `tests/unit/direct-edit-read-mode.test.tsx`, fichiers de référence dans `tests/fixtures/direct-edit/`). Rien du chemin public n'importe `src/components/direct-edit/` : le code d'édition et les polices ne sont chargés que pour la propriétaire.
- **Le bloc éditable** (`EditableBlock`) : un bouton couvre tout le bloc et porte son nom (« Modifier ma photo principale ») ; un crayon toujours visible, « Modifier » au survol et au focus ; une invitation à la place du contenu quand il est vide ; l'éditeur s'ouvre sur place, sous l'en-tête, les autres blocs estompés. Un seul bloc ouvert à la fois.
- **La session d'édition** (`EditSession`) : le bloc ouvert, les modifications non enregistrées (question « Continuer à modifier / Abandonner mes modifications » à la fermeture, à l'ouverture d'un autre bloc, à Échap), l'état du dernier enregistrement dit dans la barre (`role="status"`). L'enregistrement suit la réponse du serveur : la page est relue (`router.refresh()`) seulement après « ok ».
- **Le formulaire de bloc** (`BlockForm`) : Annuler / Enregistrer, un seul envoi à la fois, échec en français avec la saisie gardée, session expirée distinguée (lien de reconnexion dans un autre onglet, saisie intacte).
- **Les blocs de l'en-tête** (`blocks/`) : photo principale, nom et spécialité (les quatre champs partent ensemble : le serveur n'en accepte pas moins), zone (le champ unique de l'espace), disponibilité. Ils réutilisent les actions serveur de l'espace (`saveMyMainPicture`, `saveMyIdentity`, `saveMyLocation`, `saveMyAvailability`) : mêmes gardes (session relue, origine, profil trouvé par le compte), mêmes limites d'envoi des photos (issue 309). Aucune règle d'accès nouvelle.
- **Les jetons** de la direction artistique sont dans `src/app/(front)/globals.css` (`@theme`), à cet endroit seul (voir « Couleurs et halo » plus bas) : `page`, `blush`, `ink`, `lipstick` (réservé à ce qui se modifie, sauf le haut de l'accueil depuis la décision d'Andy du 25/10/2026 : voir [`accueil.md`](accueil.md)), `nude-*`, `hairline`, `mute`, `rounded-card`, `font-display`, `font-body`. Bodoni Moda et Instrument Sans sont chargés par `src/components/direct-edit/fonts.ts`, importé par la route privée et par les pages de contenu du site public (`ContentPage`, `docs/pages-de-contenu.md`) : ni l'accueil, ni le gabarit du site, ni le blog ne les chargent.

## Les blocs du corps de la page

`ProfileView` reçoit aussi, en mode édition, `edit.body` (`BodyEdit`, `edit-slots.ts`) : une fonction par bloc du corps, bâtie par `body-edit.tsx` à partir de son profil (`artistProfile`) et des actions serveur de l'espace. Elle reçoit le bloc tel que la visiteuse le voit, ou `null` quand il n'y a rien à montrer : la page publique omet ce bloc, la page de la propriétaire le garde avec son invitation. Un bloc sans fonction est dessiné comme pour une visiteuse.

- **Présentation** (`AboutBlock`, issue 1016) : le texte et son compteur (2 000 caractères au plus, dits pendant la saisie).
- **Compétences et langues** (`BulletsBlock`) : des puces ; les règles des listes L1 à L7.
- **Formations** (`RowsBlock`) : des lignes ; un seul bouton, « Enregistrer cette formation », ajoute la ligne en cours et enregistre la liste. `RowsBlock` sert aussi aux prestations (issue 1017) : modèles, suggestions, aide au prix, options derrière « Ajouter une option ». Le bloc est nommé (`kind`) et non reçu en objet, car les définitions de listes portent des fonctions qu'une page serveur ne peut pas passer au navigateur.
- **Portfolio** (`GalleryBlock`, issue 1018) : même code d'envoi que la carte du portfolio (`sendThenSave`), ordre par boutons « Avancer / Reculer », photo principale choisie parmi la galerie (deux actions de l'espace, la galerie puis la photo principale), texte alternatif par la route des médias.
- **Déplacements** (`TravelBlock`, issue 1019) : la phrase « Se déplace à domicile… » ouvre le formulaire de zone de l'en-tête (`PlaceForm`, exporté par `PlaceBlock`) : un champ, des pays en puces, le rayon, « à domicile ». Les deux blocs écrivent la même zone par la même action.
- **Coordonnées** (`ContactsBlock`, issue 1020) : téléphone, email et consentement (la requête ne porte aucune date : le serveur la pose). Sur la page de la propriétaire, la carte « Réseaux sociaux & contacts » est scindée en deux blocs par `ProfileView` (réseaux et site d'un côté, téléphone et email de l'autre) ; la page publique garde une seule carte.
- **Réseaux** (`NetworksBlock`, issue 1021) : cinq champs dans l'ordre de la page, lus par `readNetworks` (la règle du serveur), avec l'aperçu « Sur ta page : @pseudo » (`readableLabel`, la règle de l'affichage public). L'ordre des liens est fixe (`CHANNELS`) : le rendre réglable demande un champ d'ordre dans la collection, donc une migration, et change le HTML public ; hors de cette tranche.
- Pas de `<form>` dans un `<form>` : l'éditeur d'un bloc vit dans le formulaire du bloc (`BlockForm`), Entrée dans un champ est « enregistrer ».
- L'éditeur d'un bloc du corps s'ouvre sous l'en-tête, dans le même emplacement que celui de l'en-tête (`EditorFrame` le fait défiler dans la vue).

## L'accueil réutilise ces formulaires (issue 1009)

L'accueil de la maquilleuse (`/auth/init-account`, cinq étapes) n'écrit pas ses champs : chaque étape pose le formulaire du bloc correspondant dans une `EditSession` à elle (`src/components/dashboard/onboarding/Onboarding.tsx`) et appelle les mêmes actions serveur. L'étape « Toi » est `IdentityForm` (avec `schema` qui exige la spécialité et `askNames` faux quand le prénom et le nom viennent de l'inscription), « Où » est `PlaceForm`, « Photo » est `PhotoForm`. `BlockForm` a une propriété `cancel` pour remplacer « Annuler » par « Précédent » et « Plus tard » ; elle est absente de l'édition directe, dont le HTML ne change pas. « Contact » (`ContactStep`) et « Prestation phare » (`OfferStep`) assemblent les règles des blocs réseaux, coordonnées et prestations (`readContactStep`, `flagshipRows`) et envoient aussi la liste entière : ce que l'import a enregistré reste. Le repère de prix est `readOfferMedians` (`src/services/public/offer-medians.ts`), pur calcul de `src/lib/price-median.ts`.

## Ce qui manque, dit une seule fois (issue 1075)

`src/lib/dashboard/edit-blocks.ts` donne, pour chaque critère de la règle unique (`completeness.ts`), le bloc de l'édition qui le complète (`CRITERION_BLOCK`), l'ancre d'un bloc (`blockAnchor`) et le lien (`editBlockHref`). `gaugePercent` (`progress.ts`) est le pourcentage des 13 critères, plafonné à 99 tant qu'un point indispensable manque. Le bandeau de l'édition, l'encadré « En brouillon » et le tableau de bord de l'espace lisent ce module : un essai lit la page d'édition et vérifie que chaque ancre existe, un autre échoue si un critère est recompté ailleurs. Les expériences sont un bloc (`RowsBlock`, `kind="experiences"`).

## « Mon espace » est un résumé (issue 1073)

`/auth/profil` ne modifie pas le profil : l'édition est ici, et seulement ici. La page (`src/components/dashboard/overview/`) dit où en est la page (`overviewStatus`), « Ton profil est rempli à N % » (`gaugePercent`) et ce qui manque, chaque point étant un lien `editBlockHref(CRITERION_BLOCK[critère])` vers son bloc. Un essai garde la page sans éditeur (aucun import d'éditeur, aucune action d'enregistrement du profil).

## Couleurs et halo (issues 1070 et 1071)

Les valeurs sont dans `@theme` de `src/app/(front)/globals.css`, nulle part ailleurs ; `tests/unit/direct-edit-contrast.test.ts` les lit là et échoue sous 7:1 (texte courant), 4,5:1 (texte secondaire, rouge à lèvres en texte) ou 3:1 (contours, icônes), pour les états normal, survol, focus, édition, erreur et désactivé.

| Jeton | Valeur | Rôle | Contraste (blanc / page / surface) |
|---|---|---|---|
| `page` | `#FBFAF8` | fond de la page en mode édition (blanc cassé) | |
| carte | blanc | cartes et éditeur | |
| `blush` | `#F5F2EF` | surface secondaire à peine teintée | |
| `ink` | `#1A1417` | texte | 18,2 / 17,4 / 16,3 |
| `mute` | `#463B41` | texte secondaire, libellés, aides | 10,7 / 10,3 / 9,6 |
| `lipstick` | `#B0294A` | ce qui se modifie (halo, bouton, contour) | 6,4 / 6,2 / 5,8 |
| `lipstick-800` | `#8A1F3A` | texte rouge (titre « Tu modifies : … », erreurs), crayon au survol | 9,0 / 8,6 / 8,1 |
| `nude-300` | `#7D6E75` | contour des champs, du crayon, de l'invitation | 4,8 / 4,6 / 4,3 |
| `ok`, `warm` | `#1D5A3E`, `#6B4309` | « Enregistré », « En cours » (toujours avec une icône) | au moins 7,3 |

Le mode édition seul (`data-edit-page` sur la page privée) redessine les gris du visiteur avec ces jetons (`text-gray-500` à `800`, `border-gray-300`, `bg-gray-50`) : le HTML public ne change pas. Les autres blocs gardent une opacité de 0,8 (`DIMMED_OPACITY`) : l'encre y garde 7:1.

**Le halo est le bloc.** Il est dessiné dans le bloc (`data-direct-edit-halo`, un calque `absolute inset-0` au rayon du bloc, ombre `inset`), jamais autour : pas de `ring`, pas d'`outline-offset`, pas de `border` qui change d'épaisseur, donc aucun saut de mise en page. Le premier nœud que le visiteur voit dans un `EditableBlock` prend le rayon du bloc (`globals.css`, `[data-direct-edit] > :first-child`) : 22 px pour une carte, rond pour la photo et la pastille. `tests/e2e/direct-edit-halo.spec.ts` mesure, pour chaque bloc, à 390 et 1440 px, le rectangle et le rayon du halo, du bloc et du cadre (1 px d'écart au plus) avant, pendant le survol (ou le focus) et à l'ouverture.
## Le bandeau du haut : ce qui manque (issue 1072)

`EditBanner` (`src/components/direct-edit/EditBanner.tsx`) dit où en est la page pour tout le monde, d'après `editBanner` (`src/lib/dashboard/edit-banner.ts`) : *brouillon* (profil entièrement vide) et *incomplet* listent, sous « Ton profil n'est pas encore visible. Il manque : », chaque condition requise de la règle unique (photo, ville, spécialité, moyen de contact) (`missingItems`, `src/lib/dashboard/draft-notice.ts` : les mêmes mots que l'écran de fin de l'accueil), chacune un lien de 44 px vers son bloc (`CRITERION_BLOCK`) ; *publiable* dit « Ton profil est visible » avec le lien vers la page publique, et, tant que Google ne peut pas encore l'indexer, « Pour apparaître sur Google, tu peux ajouter (facultatif) : » suivi d'un lien par point (description d'au moins 100 caractères, prestation avec un prix, photos du portfolio : `googleItems`, même fichier) ; *masqué*, *suspendu* et *compte interne* ont leur message et aucune liste. Rien n'est recalculé : la page est relue par le serveur après chaque enregistrement (`router.refresh()`), donc un point fait disparaît de la liste sans recharger la page.

## Ajouter une zone de la page

Une autre tranche (issues 1016 à 1021) ajoute un bloc : un composant client dans `blocks/` fondé sur `EditableBlock` et `BlockForm`, une fonction d'emplacement dans `edit-slots.ts`, et son câblage dans `header-edit.tsx` (ou un équivalent pour le corps de la page).

## Essais

`tests/unit/direct-edit-*.test.ts(x)` (composants, état, lecture inchangée) et `tests/e2e/direct-edit-header.spec.ts` (390 et 1440 px : états normal, survol, vide, édition, erreur, session expirée, clavier ; pas de défilement horizontal, cibles de 44 px, axe).
