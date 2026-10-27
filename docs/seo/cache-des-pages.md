# Les pages publiques servies depuis le cache (ticket 269)

L'audit de mise en production du 21/10/2026 (défaut m17) a mesuré, sur la v3 en ligne, un temps de premier octet de 0,17 à 0,20 s sur l'accueil, un profil et un talent, contre 0,10 à 0,15 s sur l'ancien site. Les données étaient déjà en cache (`unstable_cache`, ticket 117), mais le HTML était refait à chaque visite.

## La cause, page par page

| Page | Pourquoi son HTML était refait à chaque visite | Ce qui reste |
|---|---|---|
| `/` (accueil) | `export const dynamic = 'force-dynamic'`, posé parce que le build n'a pas de base. | Rien : plus aucune raison de rester dynamique. |
| `/profil/<slug>` | Le même `force-dynamic`. | Rien. |
| `/talent/<slug>` | Le même `force-dynamic`. | Rien. |
| `/blog/<slug>` | Le même `force-dynamic`. | Rien. |

Les autres causes possibles ont été cherchées dans ces quatre pages, dans le gabarit `(front)/layout.tsx` et `(front)/(site)/layout.tsx`, et dans les composants qu'ils posent (`layout/`, `home/`, `profile/`, `blocks/`, `content/`) : aucune lecture de `cookies()` ni de `headers()`, aucun `connection()`, aucun `unstable_noStore`, aucun en-tête `Accept-CH` posé par le code du site (celui de `Accept-CH`, `Critical-CH` et `Vary: Sec-CH-Prefers-Color-Scheme` vient de `withPayload`, qui le pose sur tous les chemins : `next.config.ts` le restreint à `/admin`, seul lecteur de l'indice, car sur une page publique un `Critical-CH` fait renvoyer la requête par Chrome, soit un aller-retour de plus avant le premier octet, issue 1033 ; le HTML public ne dépend pas de cet indice, le thème n'est pas rendu côté serveur sur le site public). La Nav ne lit pas la session : l'état connecté est lu dans le navigateur (ticket 078). Un test le garde : `tests/unit/page-cache.test.ts`.

Raisons qui doivent rester dynamiques, et qui le restent :

- l'espace et la connexion (`/auth/*`) lisent la session (`cookies()`), et la configuration y pose `Cache-Control: private, no-store` (`src/lib/auth/dashboard-headers.ts`) ;
- l'aperçu du profil (`/auth/apercu-profil`) est dans l'espace ;
- `/search` lit l'adresse (`searchParams`), `/sitemap.xml` et `/site-map` lisent la base à la demande, `/blog` (la liste) reste en `force-dynamic` : ces pages ne sont pas dans le périmètre du ticket.

## Ce que le ticket change

- **Profil, talent, article** : plus de `force-dynamic`. `generateStaticParams` rend une liste vide (rien n'est généré au build, qui n'a pas de base), `dynamicParams` reste vrai : la page se rend à sa première visite, puis sort du cache de Next (`x-nextjs-cache: HIT`). `revalidate = 3600` est le filet de sécurité, le même que celui des lectures de données (`src/services/public/cached.ts`).
- **Accueil** : une page à la racine ne peut pas être exclue du build, et un build sans base la rendrait sans talents pour la garder. Elle vit donc sous un segment dynamique qui ne génère rien, `src/app/(front)/(site)/home-cached/[key]/page.tsx`, et `next.config.ts` réécrit `/` vers `/home-cached/principal` (`src/lib/urls/home-page.ts`). Cette adresse interne n'est pas une page du site : le proxy lui répond la 404, elle est exclue du sitemap (`EXCLUDED_PREFIXES`).
- **Liens vers l'accueil** : les `Link` vers `/` (logo, pages de connexion, pages d'erreur) portent `prefetch={false}`. Sans cela, avec `/` réécrite, le client redemande sans fin l'arbre de `/` en préchargement : le réseau n'est jamais au repos et sept essais de bout en bout (inscription, mot de passe oublié) échouaient (premier essai du ticket, défait le 21/10/2026). Le clic sur le lien charge l'accueil normalement. Un test garde la règle (`tests/unit/page-cache.test.ts`).
- **Tirage de « Mise en avant »** : l'accueil en cache est le même pour tous, le tirage des six profils vérifiés se fait donc dans le navigateur, par un script en ligne, sans rendre la page dynamique (`docs/accueil.md`, « Pourquoi le tirage se fait dans le navigateur »).
- **Rafraîchissement** : inchangé. Un enregistrement d'un profil, d'un talent ou d'un article, dans l'espace ou dans l'admin, expire les étiquettes (`profil:<slug>`, `talent:<slug>`, `article:<slug>`, `profils`, `talents`, `articles`) et les chemins que dit `src/lib/revalidate.ts` : la page est refaite à la visite suivante. La page d'accueil porte l'étiquette `talents` par la lecture qu'elle fait.
- **Profil non indexable** (non publiable, ou publiable mais mince) : sa page est gardée aussi, avec son `noindex` et sans adresse canonique. Un enregistrement qui la rend indexable la rafraîchit. Un profil `draft` qui le reste (vide) ne rafraîchit rien : sa page attend l'heure du filet de sécurité.
- **Ancienne adresse d'un profil** (ancien nom d'utilisateur, variante du slug) : le 308 vers le slug est répondu par le proxy, avec la même lecture que celle qui vérifie l'existence de la page. Levée par la page gardée dans le cache, la redirection partait avec un en-tête `Location` doublé (`/profil/x, /profil/x`), que `tests/e2e/public-profile.spec.ts` (E46) a vu.
- **Adresse inconnue** : le proxy répond la 404 avant la page (ticket 231), la page ne garde jamais une réponse périmée pour elle.

## Les preuves

- `tests/e2e/page-cache.spec.ts`, sur le banc, après `build` puis `start` : la seconde visite de `/`, d'un profil, d'un talent et d'un article répond `x-nextjs-cache: HIT` sans `no-store` ; un enregistrement par l'API change le texte lu dans le HTML à la visite suivante ; les pages `/auth/*` restent `private, no-store` ; un profil non publiable garde son `noindex` ; une adresse inconnue et l'adresse interne de l'accueil répondent 404.
- `tests/unit/page-cache.test.ts` : la forme des quatre pages, l'absence de lecture de cookie ou d'en-tête, la réécriture de `/`, la 404 du proxy sur l'adresse interne.

## Mesure en ligne

Mesure du 22/10/2026, depuis le même poste, `curl` sur l'adresse complète, premier essai écarté (échauffement), médiane des 5 suivants, temps de premier octet en secondes. Les trois pages de la v3 répondent `x-nextjs-cache: HIT` et `s-maxage=3600, stale-while-revalidate` : le HTML sort du cache.

| Page | v3 (médiane de 5) | Ancien site (médiane de 5) | Écart |
|---|---|---|---|
| `/` | 0,162 | 0,129 | +25 % |
| un profil publiable (`/profil/cinquin-maeva`) | 0,166 | 0,106 | +57 % |
| un talent (`/talent/maquillage-femme`) | 0,168 | 0,108 | +55 % |

L'écart dépasse 20 %, le critère de mesure du ticket n'est donc pas tenu. Mais la cause n'est plus le rendu de la page : toute réponse de la v3 qui passe l'accès protégé coûte environ 60 ms de plus que sur l'ancien site, même `/api/health` ou `/robots.txt` (0,16 s, contre 0,10 s pour `/robots.txt` de l'ancien site). Contrôle : sur la v3, une requête sans identifiants répond 401 en 0,100 s (médiane de 4), une requête avec un mauvais mot de passe répond 401 en 0,159 s (médiane de 4) : la vérification du mot de passe de l'accès protégé coûte environ 58 ms, et c'est la différence. Les deux sites sont sur la même adresse IP. Retranché de la v3, l'écart serait d'environ -19 % sur `/`, +2 % sur un profil et +1 % sur un talent : une estimation, pas la mesure du critère. La mesure qui compte se refait une fois l'accès protégé levé (à la bascule), sans identifiants.
