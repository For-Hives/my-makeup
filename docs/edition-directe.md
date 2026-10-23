# L'édition directe du profil

Issue 1008 (cadre : 1007). L'espace de la maquilleuse devient le profil public lui-même : les mêmes composants, un mode lecture et un mode édition.

## Ce qui existe

- **Le mode édition** est celui de la page privée `/auth/apercu-profil?mode=edition` (`src/lib/direct-edit/edit-mode.ts`). Sans le paramètre, la page est l'aperçu d'une visiteuse, inchangé. Les deux sont `private, no-store` et `noindex`. Jamais sur `/profil/<slug>` : son HTML est servi du cache partagé et ne lit ni cookie ni en-tête.
- **Un composant, deux modes.** `ProfileView` et `ProfileHeader` reçoivent, en mode édition seulement, des *emplacements* (`src/components/profile/edit-slots.ts`) : des fonctions qui enveloppent chaque bloc. Sans emplacements, le HTML est celui d'avant (garde : `tests/unit/direct-edit-read-mode.test.tsx`, fichiers de référence dans `tests/fixtures/direct-edit/`). Rien du chemin public n'importe `src/components/direct-edit/` : le code d'édition et les polices ne sont chargés que pour la propriétaire.
- **Le bloc éditable** (`EditableBlock`) : un bouton couvre tout le bloc et porte son nom (« Modifier ma photo principale ») ; un crayon toujours visible, « Modifier » au survol et au focus ; une invitation à la place du contenu quand il est vide ; l'éditeur s'ouvre sur place, sous l'en-tête, les autres blocs estompés. Un seul bloc ouvert à la fois.
- **La session d'édition** (`EditSession`) : le bloc ouvert, les modifications non enregistrées (question « Continuer à modifier / Abandonner mes modifications » à la fermeture, à l'ouverture d'un autre bloc, à Échap), l'état du dernier enregistrement dit dans la barre (`role="status"`). L'enregistrement suit la réponse du serveur : la page est relue (`router.refresh()`) seulement après « ok ».
- **Le formulaire de bloc** (`BlockForm`) : Annuler / Enregistrer, un seul envoi à la fois, échec en français avec la saisie gardée, session expirée distinguée (lien de reconnexion dans un autre onglet, saisie intacte).
- **Les blocs de l'en-tête** (`blocks/`) : photo principale, nom et spécialité (les quatre champs partent ensemble : le serveur n'en accepte pas moins), zone (le champ unique de l'espace), disponibilité. Ils réutilisent les actions serveur de l'espace (`saveMyMainPicture`, `saveMyIdentity`, `saveMyLocation`, `saveMyAvailability`) : mêmes gardes (session relue, origine, profil trouvé par le compte), mêmes limites d'envoi des photos (issue 309). Aucune règle d'accès nouvelle.
- **Les jetons** de la direction artistique sont dans `src/app/(front)/globals.css` (`@theme`) : `blush`, `ink`, `lipstick` (réservé à ce qui se modifie), `nude-*`, `hairline`, `mute`, `rounded-card`, `font-display`, `font-body`. Bodoni Moda et Instrument Sans sont chargés par `src/components/direct-edit/fonts.ts`, importé par la seule route privée.

## Les blocs du corps de la page

`ProfileView` reçoit aussi, en mode édition, `edit.body` (`BodyEdit`, `edit-slots.ts`) : une fonction par bloc du corps, bâtie par `body-edit.tsx` à partir de son profil (`artistProfile`) et des actions serveur de l'espace. Elle reçoit le bloc tel que la visiteuse le voit, ou `null` quand il n'y a rien à montrer : la page publique omet ce bloc, la page de la propriétaire le garde avec son invitation. Un bloc sans fonction est dessiné comme pour une visiteuse.

- **Présentation** (`AboutBlock`, issue 1016) : le texte et son compteur (2 000 caractères au plus, dits pendant la saisie).
- **Compétences et langues** (`BulletsBlock`) : des puces ; les règles des listes L1 à L7.
- **Formations** (`RowsBlock`) : des lignes ; un seul bouton, « Enregistrer cette formation », ajoute la ligne en cours et enregistre la liste. `RowsBlock` sert aussi aux prestations (issue 1017) : modèles, suggestions, aide au prix, options derrière « Ajouter une option ». Le bloc est nommé (`kind`) et non reçu en objet, car les définitions de listes portent des fonctions qu'une page serveur ne peut pas passer au navigateur.
- Pas de `<form>` dans un `<form>` : l'éditeur d'un bloc vit dans le formulaire du bloc (`BlockForm`), Entrée dans un champ est « enregistrer ».
- L'éditeur d'un bloc du corps s'ouvre sous l'en-tête, dans le même emplacement que celui de l'en-tête (`EditorFrame` le fait défiler dans la vue).

## Ajouter une zone de la page

Une autre tranche (issues 1016 à 1021) ajoute un bloc : un composant client dans `blocks/` fondé sur `EditableBlock` et `BlockForm`, une fonction d'emplacement dans `edit-slots.ts`, et son câblage dans `header-edit.tsx` (ou un équivalent pour le corps de la page).

## Essais

`tests/unit/direct-edit-*.test.ts(x)` (composants, état, lecture inchangée) et `tests/e2e/direct-edit-header.spec.ts` (390 et 1440 px : états normal, survol, vide, édition, erreur, session expirée, clavier ; pas de défilement horizontal, cibles de 44 px, axe).
