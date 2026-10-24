# L'édition directe du profil

Issue 1008 (cadre : 1007). L'espace de la maquilleuse devient le profil public lui-même : les mêmes composants, un mode lecture et un mode édition.

## Ce qui existe

- **Le mode édition** est la page privée `/auth/profil` (`src/lib/direct-edit/edit-mode.ts`) : l'espace de la maquilleuse EST son profil. Avec `?mode=preview`, la même route est l'aperçu d'une visiteuse, inchangé. L'ancienne adresse `/auth/apercu-profil` redirige (308, un saut). Les deux sont `private, no-store` et `noindex`. Jamais sur `/profil/<slug>` : son HTML est servi du cache partagé et ne lit ni cookie ni en-tête.
- **Un composant, deux modes.** `ProfileView` et `ProfileHeader` reçoivent, en mode édition seulement, des *emplacements* (`src/components/profile/edit-slots.ts`) : des fonctions qui enveloppent chaque bloc. Sans emplacements, le HTML est celui d'avant (garde : `tests/unit/direct-edit-read-mode.test.tsx`, fichiers de référence dans `tests/fixtures/direct-edit/`). Rien du chemin public n'importe `src/components/direct-edit/` : le code d'édition et les polices ne sont chargés que pour la propriétaire.
- **Le bloc éditable** (`EditableBlock`) : un bouton couvre tout le bloc et porte son nom (« Modifier ma photo principale ») ; un crayon toujours visible, « Modifier » au survol et au focus ; une invitation à la place du contenu quand il est vide ; l'éditeur s'ouvre sur place, sous l'en-tête, les autres blocs estompés. Un seul bloc ouvert à la fois.
- **La session d'édition** (`EditSession`) : le bloc ouvert, les modifications non enregistrées (question « Continuer à modifier / Abandonner mes modifications » à la fermeture, à l'ouverture d'un autre bloc, à Échap), l'état du dernier enregistrement dit dans la barre (`role="status"`). L'enregistrement suit la réponse du serveur : la page est relue (`router.refresh()`) seulement après « ok ».
- **Le formulaire de bloc** (`BlockForm`) : Annuler / Enregistrer, un seul envoi à la fois, échec en français avec la saisie gardée, session expirée distinguée (lien de reconnexion dans un autre onglet, saisie intacte).
- **Les blocs de l'en-tête** (`blocks/`) : photo principale, nom et spécialité (les quatre champs partent ensemble : le serveur n'en accepte pas moins), zone (le champ unique de l'espace), disponibilité. Ils réutilisent les actions serveur de l'espace (`saveMyMainPicture`, `saveMyIdentity`, `saveMyLocation`, `saveMyAvailability`) : mêmes gardes (session relue, origine, profil trouvé par le compte), mêmes limites d'envoi des photos (issue 309). Aucune règle d'accès nouvelle.
- **Les jetons** de la direction artistique sont dans `src/app/(front)/globals.css` (`@theme`) : `blush`, `ink`, `lipstick` (réservé à ce qui se modifie), `nude-*`, `hairline`, `mute`, `rounded-card`, `font-display`, `font-body`. Bodoni Moda et Instrument Sans sont chargés par `src/components/direct-edit/fonts.ts`, importé par la seule route privée.

## L'espace s'ouvre sur le profil (issue 1022)

`/auth/profil` (`src/app/(front)/(dashboard)/auth/profil/page.tsx`) empile : la barre `EditBar` (état de l'enregistrement, « Édition » / « Aperçu », « Mon compte »), le bandeau « Il te reste N étapes » tant que l'accueil n'est pas fini, `CompletenessPanel`, la page (`ProfileView` avec ses emplacements), puis ses vues et ses demandes de devis. Les compte (déconnexion, mot de passe, suppression) sont sur `/auth/account`.

- **La jauge** lit `profileProgress` (la règle unique) : `gaugePercent` est le pourcentage des 13 critères, plafonné à 99 tant qu'un point indispensable manque (les 13 critères et les 6 conditions ne sont pas les mêmes). Chaque point est un lien vers `#bloc-<id>` que `CRITERION_BLOCK` (`src/lib/direct-edit/blocks.ts`) donne pour chaque critère : un critère sans bloc ne compile pas. Un appui ouvre le bloc par la session d'édition.
- **Quitter la page avec une saisie** : `EditSession.leave` demande avant d'aller à l'aperçu ou à « Mon compte » (le garde du navigateur ne voit pas une navigation du routeur).
- **Les expériences** sont un bloc (`RowsBlock`, `kind="experiences"`) : la dernière liste de l'ancien espace.

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

## Ajouter une zone de la page

Une autre tranche (issues 1016 à 1021) ajoute un bloc : un composant client dans `blocks/` fondé sur `EditableBlock` et `BlockForm`, une fonction d'emplacement dans `edit-slots.ts`, et son câblage dans `header-edit.tsx` (ou un équivalent pour le corps de la page).

## Essais

`tests/unit/direct-edit-*.test.ts(x)` (composants, état, lecture inchangée) et `tests/e2e/direct-edit-header.spec.ts` (390 et 1440 px : états normal, survol, vide, édition, erreur, session expirée, clavier ; pas de défilement horizontal, cibles de 44 px, axe).
