# L'ancien site en lecture seule

Le gel de l'ancien site (T0 de la bascule) tient en **une variable et un redémarrage**, sans reconstruire l'image. Il ne se fait pas par des cases décochées à la main dans l'admin de Strapi : l'ancienne API réapplique ses permissions à chaque démarrage, et la main serait défaite au premier redémarrage.

## Où est le code

Le changement vit dans les deux dépôts de l'ancien site, pas dans la v3. Ce dépôt en garde le correctif prêt à appliquer, avec ses tests, pour que la bascule ne dépende de rien d'écrit à la dernière minute :

| Dépôt | Fichier | Contenu |
|---|---|---|
| `For-Hives/api-my-makeup` (branche `main`) | [`lecture-seule/api-my-makeup.patch`](lecture-seule/api-my-makeup.patch) | Le réglage `LEGACY_READ_ONLY`, ses tests (unitaires et d'intégration) et la documentation |
| `For-Hives/my-makeup` (branche `main`, ancien site) | [`lecture-seule/my-makeup-main.patch`](lecture-seule/my-makeup-main.patch) | Le message de maintenance de l'espace maquilleuse, et son test |

Les deux sont des commits au format `git format-patch` : `git am < fichier.patch` dans le dépôt visé. Ils s'appliquent sur `main` telle qu'elle était le 15/10/2026 (API : `ccd449d` ; site : `7f43f1b`). **C'est un changement de code de l'existant** (point 22 du README des tickets) : à fusionner et déployer **avant** le gel, après accord d'Andy.

## Ce que fait le réglage

`LEGACY_READ_ONLY=true` sur l'application de l'API (Coolify), puis redémarrage :

| Reste ouvert | Refusé en 403, rien d'écrit |
|---|---|
| Lecture des maquilleuses, des talents et des articles | Création, modification et suppression du profil (`POST`, `PATCH`, `DELETE /api/me-makeup`) |
| La recherche (`/api/searching`) | Envoi de photos (`POST /api/upload`) |
| La lecture de son profil et de son compte (`GET /api/me-makeup`, `/api/users/me`) | Inscription (`/api/auth/local/register`) |
| La connexion, par mot de passe et par Google | Mot de passe oublié, réinitialisation, confirmation d'email |

Un compte n'est créé par aucun chemin pendant le gel, pas même par une première connexion Google : un écouteur sur la création de comptes la refuse, tant que la variable est active. L'espace de l'admin Strapi n'est pas touché.

Les permissions du gel sont une **copie réduite** de `config/permissions.js`, appliquée par la synchronisation habituelle du démarrage. `PERMISSIONS_SYNC=false` ne lève pas le gel. Le démarrage écrit une ligne `[read-only] LEGACY_READ_ONLY=true: writes and registration refused`, sans donnée.

## Le retirer en une minute

Retirer la variable (ou la passer à autre chose que `true`) et redémarrer l'application : le démarrage réapplique `config/permissions.js` en entier, les écritures et l'inscription reviennent. Aucun réglage n'est gardé en base par le gel.

## Le message de l'espace

Quand l'API est en lecture seule, elle ajoute l'en-tête `X-Read-Only: true` à la lecture du profil. L'espace maquilleuse de l'ancien site l'affiche : « Maintenance en cours. Tu peux consulter ton profil, mais pas le modifier pour le moment ». Le site n'a aucune variable à régler, donc rien à reconstruire : le même redémarrage de l'API allume et éteint le message.

## Vérifié

Dans un clone jetable de chaque dépôt, sur une PostgreSQL locale jetable (jamais la vraie base) :

- API : 580 tests verts, dont 9 nouveaux (`tests/unit/read-only.test.js`, `tests/integration/read-only.test.js`) qui rejouent le démarrage avec et sans la variable ;
- site : 561 tests unitaires verts, dont le nouveau `tests/unit/lecture-seule.test.mjs`.

Le message n'a pas été regardé dans un navigateur : la page est testée par sa fonction de lecture de l'en-tête, pas par un parcours.

## Limites connues

- Un compte qui se connecte sans profil est envoyé vers `/auth/init-account`, dont la création de profil répond 403 pendant le gel : la page montre alors son message d'erreur habituel, sans parler de maintenance.
- Le gel ne coupe ni l'admin de Strapi ni les tâches planifiées (balayage des photos) : ce sont des écritures internes, pas des écritures d'utilisatrices.
