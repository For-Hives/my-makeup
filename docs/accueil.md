# L'accueil : ce qu'il montre et qui le décide (issue 1066)

L'accueil (`/`, servi par `src/app/(front)/(site)/home-cached/[key]/page.tsx`) se lit de haut en bas :

1. **Le haut de page.** L'accroche (le `h1`, inchangée au caractère près), la description, le formulaire guidé (événement, lieu) et, à droite, `HeroIllustration` : un dessin fait de composants du site (le champ de recherche, la carte d'un profil avec son badge, un bouton de contact) et trois lignes qui disent ce que la plateforme fait pour la cliente. Le dessin est décoratif (`aria-hidden`), sans photo, sans nom, sans donnée : des barres grises tiennent la place des textes. Il n'y a plus d'image à charger en haut de page : le texte est ce que le navigateur peint d'abord.
2. **« Mise en avant ».** La sélection de l'équipe (voir plus bas). Absente tant qu'aucun profil n'est choisi.
3. **« Vos projets, nos meilleurs talents. »** Les spécialités, inchangées.
4. **Les textes de la communauté**, sans titre ni pli ni étapes : « avant tout une communauté » (`Presentation`), le projet (`Project`), la collaboration (`Collaboration`). Tous visibles, mot pour mot.
5. **L'invitation à l'action** du bas (voir [`appel-a-l-action.md`](appel-a-l-action.md)).

## « Mise en avant »

- Un admin coche **« Mise en avant »** sur un profil (`profiles.featured`, panneau latéral de la fiche). La case est lue par tous (l'accueil la lit par l'annuaire) et écrite par un admin seulement (`fieldAdminOnly`, lignes de la matrice d'accès).
- Chaque changement écrit une ligne au journal de modération (`moderation-events`, actions `feature` et `unfeature`) : numéros du profil et de l'admin, action, date, jamais de motif ni de nom. Le hook est `noteFeature` / `logFeature` (`src/collections/Profiles.ts`) ; une écriture du serveur sans admin (import, jeu fictif) n'écrit rien. La règle de l'action est `featureActionOf` (`src/lib/profile/featured.ts`). La politique de confidentialité le dit, et le journal garde les mêmes 60 mois.
- La sélection (`featuredCards`, `src/services/public/profile-block.ts`) garde les profils cochés **et** publiables **et** joignables, dans l'ordre de l'annuaire, **six au plus** (`FEATURED_MAX`). Un profil masqué, suspendu, vide ou non publiable n'y figure jamais, même coché : l'annuaire ne les contient pas, et `indexable` écarte le reste. Sans carte, pas de section, pas de titre.
- Elle se lit dans le cache de Next sous l'étiquette des profils (`cachedFeaturedProfiles`) : enregistrer un profil, la case comprise, rafraîchit l'accueil.
- Le badge « Activité vérifiée » n'entre pas dans le choix. Il pourra servir à départager, si l'équipe le décide plus tard.

## Tests

`tests/unit/home-featured.test.tsx` (sélection, journal, blocs, page), `tests/integration/profile-featured.test.ts` (journal et sélection sur le banc), `tests/integration/payload-access.test.ts` (matrice d'accès, lignes `featured`), `tests/unit/access.test.ts`, `tests/e2e/home-guided-search.spec.ts` (390 et 1440 px).
