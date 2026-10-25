# L'accueil : ce qu'il montre et qui le décide (issue 1066)

L'accueil (`/`, servi par `src/app/(front)/(site)/home-cached/[key]/page.tsx`) se lit de haut en bas :

1. **Le haut de page « en arche »** (décision d'Andy du 25/10/2026, voir plus bas) : l'accroche (le `h1`, inchangée au caractère près) en Bodoni Moda, avec deux petites images dans ses lignes ; une phrase ; le formulaire guidé (événement, lieu) dessiné comme une seule pilule ; trois lignes qui disent ce que la plateforme fait pour la cliente ; à droite, une arche qui tient le film « L'Ombre nette », son badge, et sous le tout un bandeau des spécialités qui défile. Il remplace le dessin de l'issue 1066 (`HeroIllustration`, retiré) et le `Hero` partagé, que les autres pages gardent.
2. **« Mise en avant ».** Des profils vérifiés, tirés au hasard à chaque chargement (voir plus bas). Absente tant qu'aucun profil n'est vérifié.
3. **« Vos projets, nos meilleurs talents. »** Les spécialités, inchangées.
4. **Les textes de la communauté**, sans titre ni pli ni étapes : « avant tout une communauté » (`Presentation`), le projet (`Project`), la collaboration (`Collaboration`). Tous visibles, mot pour mot.
5. **L'invitation à l'action** du bas (voir [`appel-a-l-action.md`](appel-a-l-action.md)).

Chaque section sous le héros (2 à 4) s'ouvre par la même tête (`SectionHead` : filet numéroté, titre, phrase), a le même rythme (64 px d'air sur téléphone, 112 px sur grand écran, un filet en haut, un fond indigo très clair une section sur deux) et apparaît au défilement (issue 1101, voir [`mouvement.md`](mouvement.md), « Les sections de l'accueil »). Les textes de la communauté ne changent pas d'un mot ; un test les relit.

## Le haut de page « en arche » (25/10/2026)

`src/components/home/HomeHero.tsx` (serveur), `HeroFilm.tsx` (la seule partie client), `FilmStill.tsx`, `film.ts` (fichiers et règles du film), `hero-font.ts`, `GuidedSearch.tsx` ; styles dans `src/app/(front)/globals.css`, blocs « Home hero ». La maquette approuvée par Andy est la v4 du 25/10/2026.

**La charte, par décision d'Andy du 25/10/2026.** Encre `#1A1417`, rouge à lèvres `#B0294A` et Bodoni Moda dans le haut de l'accueil. Elle lève deux règles écrites : « pas de Bodoni sur l'accueil » ([`mouvement.md`](mouvement.md)) et « le rouge à lèvres est réservé à ce qui se modifie » ([`edition-directe.md`](edition-directe.md), [`appel-a-l-action.md`](appel-a-l-action.md)). Les sections indigo sous le haut de page restent comme elles sont, en attendant d'être harmonisées.

**Ce qu'il montre, de haut en bas :**

- Un surtitre en petites capitales, précédé d'un filet : « Maquilleuses professionnelles, partout en France ».
- Le `h1`, en Bodoni Moda 400 (coupe d'affichage, `opsz` 96), `clamp(2.125rem, 2.6vw + 1.2rem, 3.75rem)`, sur quatre lignes dès 640 px : « Trouver la maquilleuse » / *« qui vous correspond »* (italique, rouge à lèvres) et la pilule des lèvres / la pilule du pinceau et « n'a jamais été » / « aussi simple ». Sous 640 px, les lignes s'enchaînent et la seconde pilule est cachée. Les pilules sont des images décoratives (`alt=""`, `aria-hidden`), de 1,9 × 0,95 em, à la taille donnée (aucun décalage). Les lignes sont des `span` séparés par une vraie espace : le texte du titre, et donc son nom accessible et son empreinte (`url-parity`), restent exactement ceux du site en ligne.
- La phrase, nouvelle : « Mariage, soirée, photo : trouvez une maquilleuse professionnelle près de chez vous, découvrez son travail et écrivez-lui directement. » (espace fine avant les deux-points).
- Le formulaire guidé, inchangé dans ce qu'il fait (GET `/search`, `search` puis `city`, identifiants `accueil-evenement` et `accueil-lieu`, ville obligatoire, 100 caractères au plus, mesure de la recherche dans le même `<form>`) : une pilule cernée d'encre dès 640 px (événement | lieu | bouton encre « Voir les maquilleuses »), une carte de deux champs sur un bouton pleine largeur sur un téléphone. Les libellés restent visibles ; chaque champ remplit son segment (cible de 64 px), le focus se voit sur le segment.
- Les trois lignes de l'issue 1066, au mot près, numérotées i. ii. iii. (chiffres en italique rouge, cachés aux lecteurs d'écran : la liste numérote déjà). Leurs textes longs sont partis avec le dessin.
- L'arche : `border-radius: 9999px 9999px 0 0`, au format du film (1080 × 1400, 0,77), large de `clamp(17rem, 28vw, 26rem)` sur grand écran, 82 % de la colonne (26 rem au plus) en dessous de 1024 px. Derrière elle, la même arche en nude, décalée de 6 % : son ombre portée.
- Le badge, sur le coin bas gauche de l'arche (112 px, 84 px sur un téléphone) : le titre du film en cercle (« L’OMBRE NETTE · UN FILM MY MAKEUP · », `textPath` ajusté par `textLength`) autour d'un disque encre. Avec le mouvement, le disque est un vrai bouton (60 et 44 px) : « Mettre le film en pause » / « Lire le film ». Il arrête et relance le film, la rotation du cercle (un tour en 40 s, seulement pendant que le film joue) et le bandeau. Sans script ou avec un mouvement réduit, rien ne bouge et le disque n'est qu'une marque : aucun bouton qui ne commande rien.
- Le bandeau : une bande encre pleine largeur (60 px, 52 sur un téléphone) sous le haut de page, les spécialités qu'une maquilleuse choisit sur sa page (`SPECIALTY_BULLETS`, les puces que la recherche filtre) en Bodoni italique ivoire, séparées par un point rouge. Il glisse lentement (une longueur de liste en 60 s, `transform` seul). La première liste est lue par les lecteurs d'écran, ses trois copies sont cachées. Ce n'est pas une section de l'accueil (`main > section.home-section`) : elle ne prend pas de numéro.
- Sur un téléphone, l'ordre est : surtitre, titre, phrase, formulaire, lignes, arche, bandeau. Le texte reste ce que le navigateur peint d'abord (LCP).

**Le film « L'Ombre nette ».** Une intro de 7 s, jouée une fois, puis une boucle de 8 s sans couture (`loop`). Les fichiers sont dans `public/assets/accueil/`, avec une version dans leur nom (`-v0`) ; `next.config.ts` les sert avec `Cache-Control: public, max-age=31536000, immutable`, si bien qu'un nouveau rendu est un nouveau nom. Les fichiers d'aujourd'hui sont des **brouillons** (540 × 700 ; la boucle dure 3 s et l'image de fin, rouge, n'est pas encore la première image de la boucle) : le rendu final garde les mêmes noms avec une nouvelle version.

| Fichier | Rôle |
|---|---|
| `ombre-nette-intro-v0.av1.mp4`, `ombre-nette-intro-v0.h264.mp4` | l'intro, jouée une fois |
| `ombre-nette-boucle-v0.av1.mp4`, `ombre-nette-boucle-v0.h264.mp4` | la boucle, dont la première image est la dernière de l'intro |
| `ombre-nette-debut-v0.webp` | la première image de l'intro : l'affiche |
| `ombre-nette-fin-v0.webp` | l'état final (le rouge) : l'affiche avec un mouvement réduit, et l'image montrée quand la lecture est refusée |
| `pilule-levres-v0.webp`, `pilule-pinceau-v0.webp` | les deux images du titre, au double de leur taille affichée (228 × 114) |

Les sources sont des listes, la meilleure d'abord (`FILM_VIDEOS`, `FILM_STILLS` de `film.ts`) : ajouter le HEVC (`video/mp4; codecs="hvc1"`) ou une affiche `.avif` est une ligne par liste.

**Comment il se lance.**

1. Le HTML du serveur porte une `<picture>` dans l'arche : la fin du film sous `(prefers-reduced-motion: reduce)`, le début sinon, à une taille donnée, en `object-fit: cover`. C'est l'affiche, et elle peut être le LCP sur grand écran : elle n'est jamais dans un bloc en fondu, l'arche entre par un masque (`enter-arch`, voir [`mouvement.md`](mouvement.md)).
2. `HeroFilm.tsx` est un composant client et pas un script en ligne : les vidéos s'ajoutent dans un balisage que React possède et répondent à des événements (`playing`, `ended`, un appui sur le bouton) ; un script qui les ajouterait au HTML du serveur se battrait avec l'hydratation. Il pose `data-hero-motion` (`running` ou `paused`) sur la section quand le mouvement est permis, et `data-film="playing"` pendant que le film joue : la feuille de style ne fait tourner le cercle et glisser le bandeau que sous ces attributs.
3. Les vidéos ne sont mises dans la page que si tout est vrai (`mountsFilm`) : le script tourne, `prefers-reduced-motion: no-preference`, pas de Save-Data, l'arche dans l'écran, l'onglet au premier plan, la page chargée (`load`) et le navigateur au repos (`requestIdleCallback`). L'intro (`muted playsInline preload="auto"`) joue ; la boucle se charge en même temps, empilée dessous, et prend la place de l'intro à son `ended` sans image vide (l'intro n'est cachée, par `visibility`, qu'une fois la boucle en lecture).
4. Hors de l'écran, dans un onglet en arrière-plan ou par le bouton, le film se met en pause (`playsFilm`). Un `play()` refusé montre l'image de fin à la place.
5. Sans script : l'affiche, et aucune boucle CSS (WCAG 2.2.2). Avec un mouvement réduit : l'image de fin, pas de vidéo, pas de rotation, pas de défilement.

**La police.** Une instance de Bodoni Moda à part (`hero-font.ts`, `next/font/google`, axe `opsz`, droit et italique, `display: swap`), chargée par l'accueil seul ; l'instance partagée de l'édition directe (coupe de texte, sans italique) ne change pas. Le paragraphe, le formulaire et les lignes restent dans la police du site (pas d'Instrument Sans ici : le LCP du téléphone a peu de marge).

**Ce qui diffère de la maquette, et pourquoi.** La barre de navigation et Instrument Sans de la maquette ne sont pas repris (hors de ce changement) ; la troisième ligne garde le texte de l'issue 1066 (« Écrivez en direct à la maquilleuse ») ; le chevron du choix de l'événement est au bout de son segment (le champ entier s'ouvre au clic) ; le champ « Où ? » de la carte du téléphone a sa hauteur pleine.

**Mesures du 25/10/2026** (build de production, banc de test, Chromium de Playwright) :

| Mesure | Résultat |
|---|---|
| Police d'affichage ajoutée à `/` | 99 888 octets de woff2, préchargés : Bodoni Moda variable (`wght` et `opsz`), sous-ensemble latin, droit 46 248 octets et italique 53 640 octets. Les autres sous-ensembles (latin étendu, symboles) ne sont demandés que si la page porte leurs caractères |
| JavaScript du premier chargement (`route-bundle-stats.json`, `main` contre la branche) | `/` : +4 946 octets (+1 556 compressés) ; aucune autre route ne change |
| HTML de `/` (même jeu de données) | 131 950 octets avant, 132 118 après |
| Images du haut de page | affiche 3 234 octets (début) ou 4 112 (fin, mouvement réduit), pilules 2 720 et 3 526 octets |
| Film (brouillons) | 48 915 octets en AV1 (Chrome, Firefox), 115 715 en H.264 (Safari), demandés après le chargement, l'arche dans l'écran |
| Décalage de mise en page (CLS) | 0 à 390, 768, 1024, 1280 et 1440 px |
| Élément du LCP | la phrase sur un téléphone (390 px) ; l'affiche de l'arche dès 768 px |

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

`tests/unit/home-hero.test.tsx` et `tests/e2e/home-hero.spec.ts` (le haut de page « en arche » : titre au caractère près, film, bouton, bandeau, mouvement réduit, sans script, en-têtes des fichiers), `tests/unit/home-featured.test.tsx` (candidats, échantillon, script de tirage joué contre une fausse page, journal, énumération, bloc, page), `tests/integration/profile-verified.test.ts` (journal, candidats et lecture publique sur le banc), `tests/integration/payload-access.test.ts` et `tests/integration/profile-public-read.test.ts` (matrice d'accès : « Vérifiée » lue par la propriétaire et l'admin, écrite par l'admin ; `featured` n'existe plus), `tests/unit/access.test.ts`, `tests/e2e/home-guided-search.spec.ts` (390 et 1440 px : section absente sans profil vérifié, six cartes au plus, tirage différent avec `Math.random` fixé, six premiers sans JavaScript).
