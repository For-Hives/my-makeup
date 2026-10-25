# L'accueil : ce qu'il montre et qui le décide (issue 1066)

L'accueil (`/`, servi par `src/app/(front)/(site)/home-cached/[key]/page.tsx`) se lit de haut en bas :

1. **Le haut de page.** L'accroche (le `h1`, inchangée au caractère près), la description, le formulaire guidé (événement, lieu) et, à droite, `HeroIllustration` : un dessin fait de composants du site (le champ de recherche, la carte d'un profil avec son badge, un bouton de contact) et trois lignes qui disent ce que la plateforme fait pour la cliente. Le dessin est décoratif (`aria-hidden`), sans photo, sans nom, sans donnée : des barres grises tiennent la place des textes. Il n'y a plus d'image à charger en haut de page : le texte est ce que le navigateur peint d'abord.
> **Direction artistique (25/10/2026).** Sous le haut de page : un bandeau défilant (`MarqueeBanner`, « Des maquilleuses indépendantes, partout en France » et deux phrases que le site dit déjà), posé en tête de « Mise en avant » (donc absent sans profil vérifié ; aucun fichier du haut de page n'est touché). « Mise en avant » prend `ProfileCard` du kit (arche, nom en Bodoni, teintes en alternance) sans changer ni les données ni le tirage. La communauté est en deux colonnes (photo en arche, trois lignes à pastille ronde), la collaboration garde ses quatre blocs avec photo en arche, titre à pastille et bouton en pilule. Les spécialités et le projet ne changent pas d'une classe ; les têtes de section refaites passent en Bodoni (`SectionHead display`), les deux autres gardent le gras sans empattement. L'invitation du bas est celle du kit (`appel-a-l-action.md`).

2. **« Mise en avant ».** Des profils vérifiés, tirés au hasard à chaque chargement (voir plus bas). Absente tant qu'aucun profil n'est vérifié.
3. **« Vos projets, nos meilleurs talents. »** Les spécialités, inchangées.
4. **Les textes de la communauté**, sans titre ni pli ni étapes : « avant tout une communauté » (`Presentation`), le projet (`Project`), la collaboration (`Collaboration`). Tous visibles, mot pour mot.
5. **L'invitation à l'action** du bas (voir [`appel-a-l-action.md`](appel-a-l-action.md)).

Chaque section sous le héros (2 à 4) s'ouvre par la même tête (`SectionHead` : filet numéroté, titre, phrase), a le même rythme (64 px d'air sur téléphone, 112 px sur grand écran, un filet en haut, un fond indigo très clair une section sur deux) et apparaît au défilement (issue 1101, voir [`mouvement.md`](mouvement.md), « Les sections de l'accueil »). Les textes de la communauté ne changent pas d'un mot ; un test les relit.

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

`tests/unit/home-featured.test.tsx` (candidats, échantillon, script de tirage joué contre une fausse page, journal, énumération, bloc, page), `tests/integration/profile-verified.test.ts` (journal, candidats et lecture publique sur le banc), `tests/integration/payload-access.test.ts` et `tests/integration/profile-public-read.test.ts` (matrice d'accès : « Vérifiée » lue par la propriétaire et l'admin, écrite par l'admin ; `featured` n'existe plus), `tests/unit/access.test.ts`, `tests/e2e/home-guided-search.spec.ts` (390 et 1440 px : section absente sans profil vérifié, six cartes au plus, tirage différent avec `Math.random` fixé, six premiers sans JavaScript).
