# Les pages publiques servies depuis le cache (ticket 269)

L'audit de mise en production du 21/10/2026 (défaut m17) a mesuré, sur la v3 en ligne, un temps de premier octet de 0,17 à 0,20 s sur l'accueil, un profil et un talent, contre 0,10 à 0,15 s sur l'ancien site. Les données étaient déjà en cache (`unstable_cache`, ticket 117), mais le HTML était refait à chaque visite.

## La cause, page par page

| Page | Pourquoi son HTML était refait à chaque visite | Ce qui reste |
|---|---|---|
| `/` (accueil) | `export const dynamic = 'force-dynamic'`, posé parce que le build n'a pas de base. | Rien : plus aucune raison de rester dynamique. |
| `/profil/<slug>` | Le même `force-dynamic`. | Rien. |
| `/talent/<slug>` | Le même `force-dynamic`. | Rien. |
| `/blog/<slug>` | Le même `force-dynamic`. | Rien. |

Les autres causes possibles ont été cherchées dans ces quatre pages, dans le gabarit `(front)/layout.tsx` et `(front)/(site)/layout.tsx`, et dans les composants qu'ils posent (`layout/`, `home/`, `profile/`, `blocks/`, `content/`) : aucune lecture de `cookies()` ni de `headers()`, aucun `connection()`, aucun `unstable_noStore`, aucun en-tête `Accept-CH`. La Nav ne lit pas la session : l'état connecté est lu dans le navigateur (ticket 078). Un test le garde : `tests/unit/page-cache.test.ts`.

Raisons qui doivent rester dynamiques, et qui le restent :

- l'espace et la connexion (`/auth/*`) lisent la session (`cookies()`), et la configuration y pose `Cache-Control: private, no-store` (`src/lib/auth/dashboard-headers.ts`) ;
- l'aperçu du profil (`/auth/apercu-profil`) est dans l'espace ;
- `/search` lit l'adresse (`searchParams`), `/sitemap.xml` et `/site-map` lisent la base à la demande, `/blog` (la liste) reste en `force-dynamic` : ces pages ne sont pas dans le périmètre du ticket.

## Ce que le ticket change

- **Profil, talent, article** : plus de `force-dynamic`. `generateStaticParams` rend une liste vide (rien n'est généré au build, qui n'a pas de base), `dynamicParams` reste vrai : la page se rend à sa première visite, puis sort du cache de Next (`x-nextjs-cache: HIT`). `revalidate = 3600` est le filet de sécurité, le même que celui des lectures de données (`src/services/public/cached.ts`).
- **Accueil** : une page à la racine ne peut pas être exclue du build, et un build sans base la rendrait sans talents pour la garder. Elle vit donc sous un segment dynamique qui ne génère rien, `src/app/(front)/(site)/home-cached/[key]/page.tsx`, et `next.config.ts` réécrit `/` vers `/home-cached/principal` (`src/lib/urls/home-page.ts`). Cette adresse interne n'est pas une page du site : le proxy lui répond la 404, elle est exclue du sitemap (`EXCLUDED_PREFIXES`).
- **Rafraîchissement** : inchangé. Un enregistrement d'un profil, d'un talent ou d'un article, dans l'espace ou dans l'admin, expire les étiquettes (`profil:<slug>`, `talent:<slug>`, `article:<slug>`, `profils`, `talents`, `articles`) et les chemins que dit `src/lib/revalidate.ts` : la page est refaite à la visite suivante. La page d'accueil porte l'étiquette `talents` par la lecture qu'elle fait.
- **Profil non publiable** : sa page est gardée aussi, avec son `noindex` et sans adresse canonique. Un enregistrement qui la rend publiable la rafraîchit. Un profil `draft` qui le reste (vide) ne rafraîchit rien : sa page attend l'heure du filet de sécurité.
- **Ancienne adresse d'un profil** (ancien nom d'utilisateur, variante du slug) : le 308 vers le slug est répondu par le proxy, avec la même lecture que celle qui vérifie l'existence de la page. Levée par la page gardée dans le cache, la redirection partait avec un en-tête `Location` doublé (`/profil/x, /profil/x`), que `tests/e2e/public-profile.spec.ts` (E46) a vu.
- **Adresse inconnue** : le proxy répond la 404 avant la page (ticket 231), la page ne garde jamais une réponse périmée pour elle.

## Les preuves

- `tests/e2e/page-cache.spec.ts`, sur le banc, après `build` puis `start` : la seconde visite de `/`, d'un profil, d'un talent et d'un article répond `x-nextjs-cache: HIT` sans `no-store` ; un enregistrement par l'API change le texte lu dans le HTML à la visite suivante ; les pages `/auth/*` restent `private, no-store` ; un profil non publiable garde son `noindex` ; une adresse inconnue et l'adresse interne de l'accueil répondent 404.
- `tests/unit/page-cache.test.ts` : la forme des quatre pages, l'absence de lecture de cookie ou d'en-tête, la réécriture de `/`, la 404 du proxy sur l'adresse interne.

## Mesure en ligne

À faire après le déploiement, 5 essais chacun, le même jour que l'ancien site : temps de premier octet médian de `/`, d'un profil publiable et d'un talent, au plus 20 % au-dessus de celui de l'ancien site. Les chiffres s'écrivent ici.

| Page | v3 (médiane de 5) | Ancien site (médiane de 5) | Écart |
|---|---|---|---|
| `/` | à mesurer | à mesurer | |
| un profil publiable | à mesurer | à mesurer | |
| un talent | à mesurer | à mesurer | |
