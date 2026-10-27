# URL gelées

> Gelé le 14/10/2026. Ce document dit ce que répond, après la bascule, chaque famille d'adresses de l'ancien site.
> Sources : la table du plan technique (`01` §6.3), l'inventaire des adresses de l'ancien site du 09/10/2026, relancé le 14/10/2026 en lecture seule, et les décisions du journal jusqu'au 14/10/2026.

## À quoi sert ce document

Une adresse que quelqu'un a pu garder (un moteur de recherche, un lien dans un email, un favori, une carte de visite) doit continuer à répondre quelque chose d'utile quand la v3 remplace l'ancien site. Ce document fige la réponse attendue, famille par famille, avant d'écrire la première page.

Trois fichiers vont ensemble :

| Fichier | Rôle |
|---|---|
| `src/lib/frozen-urls.ts` | La table, lue par les tests et par le code. C'est elle qui fait foi |
| `docs/migration/urls-inventaire.json` | L'inventaire gelé : les adresses relevées sur l'ancien site, sans aucun chemin de profil réel |
| `docs/migration/URLS.md` | Ce document. Ses tableaux sont écrits depuis les deux fichiers ci-dessus par `bun scripts/migration/urls-doc.ts` |

Le test `tests/unit/frozen-urls.test.ts` échoue si un tableau de ce document ne dit plus la même chose que la table.

## Règles

1. **Le code est celui de la première réponse** à une requête GET, sans session. Quand une page demande une session, le tableau donne les deux cas. Quand la réponse vient de l'hébergeur et non de l'application, deux codes permanents sont acceptés (« 301 ou 308 »).
2. **Une seule redirection, jamais de chaîne.** Une adresse redirigée arrive en un saut sur une adresse qui répond 200. Une adresse qui cumule plusieurs défauts (une barre en double, une barre finale, un ancien nom) reçoit une seule redirection, vers la destination finale.
3. **Une adresse déplacée pour de bon répond par une redirection permanente** (301 ou 308). La 307 est réservée à ce qui dépend de la session.
4. **Une adresse inconnue répond 404**, avec la page en français. Jamais 500, jamais 200.
5. **La casse compte**, comme aujourd'hui : `/Blog` est une adresse inconnue.
6. **Aucun chemin de profil réel n'est écrit dans le dépôt.** Les adresses de profil sont des motifs (`/profil/<slug>`), leurs exemples sont des profils fictifs du banc de test, et l'inventaire ne garde des profils réels que des nombres.

## Ce que devient chaque famille

Chaque ligne de la table `01` §6.3 est reprise ici : la dernière colonne donne son numéro de ligne dans le plan (1 à 13). Les lignes sans numéro viennent de l'inventaire, des adresses techniques et des décisions prises depuis.

### Pages publiques

<!-- urls:familles:pages:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `accueil` | `/` | Accueil | Identique | 200 | — |
| `pages-fixes` | `/a-propos`, `/contact`, `/cgu`, `/politique-de-confidentialite`, `/pourquoi-utiliser-my-makeup-en-tant-que-particulier`, `/particulier/trouver-une-maquilleuse`, `/particulier/centraliser-ses-recherches`, `/particulier/explorer-les-profils`, `/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse`, `/maquilleuse/partenariats`, `/solutions/pour-les-particuliers`, `/solutions/pour-les-maquilleuses` | Les 12 pages fixes du sitemap, hors accueil, blog et mentions légales | Identiques | 200 | — |
| `mentions-legales` | `/mentions-legales` | Page créée le 08/10/2026 | Identique | 200 | 10 |
| `blog` | `/blog` | Liste du blog | Identique | 200 | — |
| `article` | `/blog/<slug>` : article publié | Article du blog (10 au relevé) | Identique | 200 | 4 |
| `talent` | `/talent/<slug>` : page talent publiée | Page talent (14 au relevé) | Identique | 200 | 4 |
| `profil` | `/profil/<slug>` : slug d'un profil repris et visible | Profil public, adresse émise depuis le 08/10/2026 | Identique ; `noindex` tant que le profil n'est pas indexable (publiable, avec une description d'au moins 100 caractères et une prestation chiffrée ou une photo de galerie) | 200 | 1 |
| `profil-ancien-nom` | `/profil/<ancien-nom>` : ancien nom d'utilisateur d'un profil repris, ou variante de son slug (majuscules, accents, espaces) | Ancienne forme, encodée dans l'adresse ; déjà en 308 en un saut | Redirection vers le slug du même profil : `/profil/<slug>` | 308 en un saut | 2 |
| `profil-non-repris` | `/profil/<slug>` : l'un des 13 profils vides du spam, que l'import ne reprend pas (slug ou ancien nom) | Profil vide, servi en `noindex` (200, ou 308 depuis l'ancien nom) | Page 404 en français ; les 13 sont au registre par numéro, jamais par nom | 404 | — |
| `slug-inconnu` | `/profil/<slug>`, `/talent/<slug>`, `/blog/<slug>` : slug inconnu, ou profil masqué | Slug inconnu | Page 404 en français, jamais 500 | 404 | 11 |
| `recherche` | `/search` | Recherche, `/search?search=&city=`, en `noindex` | Mêmes paramètres, plus `specialite` et `page` ; `noindex` | 200 | 6 |
| `toutes-les-news` | `/toutes-les-news` | Liste des articles, en double du blog | Redirection vers la liste du blog : `/blog` | 301 en un saut | 5 |
| `plan-du-site` | `/site-map` | Plan du site | Régénéré depuis Payload, profils indexables seulement | 200 | 13 |
| `demande-envoyee` | `/demande-envoyee` | Page de remerciement, en `noindex` | Identique, en `noindex` | 200 | — |
| `adresse-inconnue` | `/*` | Toute autre adresse | Page 404 en français, jamais 500 | 404 | — |
| `classement` | `/classement` | Page inexistante | Créée (issue 1012) : comment sont classées les maquilleuses, indexable, liée sous chaque liste | 200 | — |
<!-- urls:familles:pages:fin -->

Les quatre familles qui partagent le motif `/profil/<slug>` ne se distinguent que par les données : c'est la base qui sait si un slug est connu. Un profil non indexable (publiable mais mince, ou non publiable) reste joignable en 200, avec `noindex`, comme aujourd'hui.

### Forme de l'adresse

Ces deux règles se lisent avant toutes les autres, quelle que soit la page. Elles valent pour les pages du site. Sous `/admin`, `/api` et `/_next`, rien n'est gelé.

<!-- urls:familles:forme:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `double-barre` | Toute adresse avec `//` | `//profil/…` et toute adresse avec `//` : servie en 200, en double de la page | Redirection vers le chemin normalisé : le même chemin sans barre en double, ou la destination de sa propre règle | 301 en un saut | 3 |
| `barre-finale` | Toute adresse terminée par `/` | Adresse terminée par `/` : déjà en 308 en un saut | Redirection, paramètres gardés : le même chemin sans barre finale, ou la destination de sa propre règle | 308 en un saut | — |
<!-- urls:familles:forme:fin -->

### Hôtes

Ces redirections ne sont pas écrites dans l'application : elles se règlent chez l'hébergeur, le jour de la bascule pour `http` et `www`, puis à l'arrêt de Strapi pour l'ancienne adresse de l'API. Une adresse qui cumule un mauvais hôte et un défaut de forme peut faire deux sauts : la règle du saut unique vaut pour l'adresse sans autre défaut.

<!-- urls:familles:hotes:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `http` | `http://my-makeup.fr/*` | Redirection temporaire (302) | Redirection permanente : le même chemin sur `https://my-makeup.fr` | 301 ou 308 en un saut | — |
| `www` | `https://www.my-makeup.fr/*`, `http://www.my-makeup.fr/*` | Redirection temporaire (302), en deux sauts depuis `http://www` | Redirection permanente : le même chemin sur `https://my-makeup.fr` | 301 ou 308 en un saut | — |
| `ancienne-api` | `https://api.my-makeup.fr/*`, `http://api.my-makeup.fr/*` | L'API Strapi | Redirection pendant 6 mois à compter de l'arrêt de Strapi, 30 jours après la bascule : l'accueil du site, `https://my-makeup.fr/` | 301 en un saut | 12 |
<!-- urls:familles:hotes:fin -->

### Espace maquilleuse

Toutes ces pages répondent `noindex`. Les chemins ne changent pas : les liens des emails de réinitialisation et de confirmation déjà envoyés restent valides après la bascule.

<!-- urls:familles:espace:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `espace-connexion` | `/auth/signin`, `/auth/signup`, `/auth/mot-de-passe-oublie`, `/auth/reinitialiser` | Connexion, inscription, mot de passe oublié, réinitialisation | Mêmes chemins, `noindex`, `private, no-store` | 200 | 7 |
| `espace-prive` | `/auth/profil`, `/auth/apercu-profil` | Espace ; sans session, une 307 en un saut vers la connexion | Mêmes chemins, `noindex`, `private, no-store` ; sans session, redirection vers `/auth/signin?callbackUrl=<chemin>` | 200 ; sans session, 307 en un saut | 7 |
| `espace-verification` | `/auth/verification-complete`, `/auth/verification-wall` | Mur de vérification et confirmation de l'email (`/auth/verification-*`) | Mêmes chemins, `noindex` | 200 | 8 |
| `espace-racine` | `/auth` | Page vide en 200, puis redirection par le navigateur | Redirection par le serveur : `/auth/signin` (avec une session : `/auth/profil`) | 307 en un saut | — |
| `espace-erreur` | `/auth/error` | Page d'erreur ; sans code, une 307 vers elle-même avec `?error=erreur-inconnue` | Page d'erreur en français, `noindex`, avec ou sans code | 200 | — |
| `espace-google` | `/auth/google`, `/auth/google/callback` | Le bouton Google passait par NextAuth (`/api/auth/signin/google`, `/api/auth/callback/google`) ; ces deux chemins n'existent plus (404) | Nouveau : départ et retour de la connexion Google (`/auth/google`, `/auth/google/callback`), `noindex`, `private, no-store`. Adresse de retour à déclarer dans la console Google : Google (`accounts.google.com`) pour le départ ; pour le retour, l'espace ou `/auth/signin?error=<code>` | 307 en un saut | — |
<!-- urls:familles:espace:fin -->

Un chemin inconnu sous `/auth` est une adresse inconnue : 404.

### Routes de l'ancien code

<!-- urls:familles:retirees:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `espace-accueil-retire` | `/auth/init-account` | Accueil (onboarding) de la maquilleuse ; sans session, une 307 en un saut vers la connexion | Supprimé : redirection permanente, en un saut, vers son espace : `/auth/profil` ; sans session, redirection vers `/auth/signin?callbackUrl=%2Fauth%2Fprofil` | 308 en un saut ; sans session, 308 en un saut | — |
| `api-nextauth` | `/api/auth/*` | Routes de NextAuth (200, 302 ou 404 selon la route) | Supprimées | 404 | 9 |
| `api-sendmail` | `/api/sendMail` | Envoi du formulaire de contact, en POST seulement (un GET répond 405) | Supprimée | 404 | 9 |
<!-- urls:familles:retirees:fin -->

### Adresses techniques

<!-- urls:familles:techniques:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `sante` | `/api/health` | Route de santé | Même chemin, mêmes clés ; 503 quand la base ne répond pas | 200 | — |
| `mesure-script` | `/u/script.js` | Script de mesure Umami, relayé par le site | Identique | 200 | — |
| `mesure-envoi` | `/u/api/send` | Envoi des mesures à Umami, en POST seulement (un GET répond 405) | Identique : un GET répond 405, un POST est relayé | 405 | — |
| `mesure-autre` | `/u/*` | Tout autre chemin sous `/u` | Identique : rien d'autre n'est relayé | 404 | — |
| `sitemap` | `/sitemap.xml` | Sitemap | Régénéré depuis Payload, profils indexables seulement | 200 | 13 |
| `robots` | `/robots.txt` | Fichier robots | Généré par le site, mêmes règles | 200 | 13 |
| `fichiers-publics` | `/favicon.webp`, `/assets/*` : fichier présent dans `public/` | Icône du site et images de `public/assets/` | Identiques : le dossier `public/` est conservé | 200 | — |
| `llms-txt` | `/llms.txt` | Fichier pour les assistants, jamais créé | Créé (ticket 1014) : un guide en texte, sans nom de maquilleuse, qui ne cite que des pages publiques | 200 | — |
<!-- urls:familles:techniques:fin -->

### Fichiers de vérification des moteurs

Sans ces deux fichiers à la racine du site, la vérification de Bing peut tomber le jour de la bascule, et ses rapports avec.

<!-- urls:familles:verification:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `verification-bing` | `/BingSiteAuth.xml` | Fichier de vérification de Bing Webmaster Tools | Même contenu, à l'octet près | 200 | — |
| `verification-indexnow` | `/<clé>.txt` | Fichier de clé IndexNow : la clé fait 32 caractères hexadécimaux | Même adresse et même contenu : la clé elle-même | 200 | — |
<!-- urls:familles:verification:fin -->

- La table garde l'empreinte SHA-256 de chaque fichier tel que l'ancien site le sert. Le test compare cette empreinte au fichier de `public/`, sauf pour la clé IndexNow, qui n'est plus un fichier du dépôt.
- Le 14/10/2026, les deux fichiers servis par l'ancien site étaient identiques, à l'octet près, à ceux de `public/`.
- La clé IndexNow n'est pas recopiée dans la table : son adresse est un motif. Depuis le ticket 219, la clé vit dans la variable d'environnement `INDEXNOW_KEY` et le site la sert à la même adresse, avec le même contenu, par une route (`docs/seo/indexnow.md`). Le jour de la bascule, la variable porte la clé de l'ancien site (le nom de son fichier à la racine) ; sans elle, l'adresse répond 404.

### Anciennes adresses en 404

<!-- urls:familles:historiques:debut -->
| Famille | Adresses | Aujourd'hui | Après la bascule | Code attendu | Ligne de 01 §6.3 |
| --- | --- | --- | --- | --- | --- |
| `historiques` | `/maquilleuse`, `/particulier`, `/maquilleuse/partenaires`, `/affiliation`, `/cgv`, `/help`, `/parrainage`, `/recrutement`, `/deposer-un-projet`, `/profil`, `/signin`, `/signup` | Les 12 routes supprimées ou renommées en 2023 | Page 404 en français, attendue | 404 | — |
<!-- urls:familles:historiques:fin -->

## Les 13 adresses en 404 non voulue du 09/10, une à une

L'inventaire du 09/10/2026 avait relevé 13 adresses en 404 que personne n'avait décidées. Elles sont classées ici une à une. Toutes gardent leur 404 : ce sont maintenant des 404 attendues, écrites dans la table.

<!-- urls:classement-404:debut -->
| N° | Adresse | Ce que c'était | Page qui a pris la suite | Après la bascule | Pourquoi |
| --- | --- | --- | --- | --- | --- |
| 1 | `/llms.txt` | Jamais créé | — | 200 (créée, ticket 1014) | Le fichier pour les assistants dépassait la parité ; il a été créé ensuite et répond 200 (ticket 1014). |
| 2 | `/maquilleuse` | Page renommée le 18/06/2023 | `/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse` | 404 attendue | Aucune impression sur 28 jours au relevé Search Console du 13/10/2026, et plus aucun lien du site n'y mène. |
| 3 | `/particulier` | Page renommée le 18/06/2023 | `/pourquoi-utiliser-my-makeup-en-tant-que-particulier` | 404 attendue | Aucune impression sur 28 jours au relevé Search Console du 13/10/2026, et plus aucun lien du site n'y mène. |
| 4 | `/maquilleuse/partenaires` | Page d'attente sans contenu (un titre seul), supprimée le 16/06/2023 | `/maquilleuse/partenariats` | 404 attendue | La page des partenariats existait déjà à côté ; celle-ci n'a jamais eu de contenu. |
| 5 | `/affiliation` | Page d'attente sans contenu (un titre seul), supprimée le 16/06/2023 | — | 404 attendue | Rien ne l'a remplacée, et plus aucun lien du site n'y mène. |
| 6 | `/cgv` | Page d'attente sans contenu (un titre seul), supprimée le 16/06/2023 | — | 404 attendue | Le site ne vend rien : il n'a pas de conditions de vente. Les CGU sont un autre texte. |
| 7 | `/help` | Page d'attente sans contenu (un titre seul), supprimée le 16/06/2023 | — | 404 attendue | Rien ne l'a remplacée, et plus aucun lien du site n'y mène. |
| 8 | `/parrainage` | Page d'attente sans contenu (un titre seul), supprimée le 16/06/2023 | — | 404 attendue | Rien ne l'a remplacée, et plus aucun lien du site n'y mène. |
| 9 | `/recrutement` | Page d'attente sans contenu (un titre seul), supprimée le 16/06/2023 | — | 404 attendue | Rien ne l'a remplacée, et plus aucun lien du site n'y mène. |
| 10 | `/deposer-un-projet` | Page d'attente sans contenu (un titre seul), supprimée le 29/04/2023 | — | 404 attendue | Rien ne l'a remplacée, et plus aucun lien du site n'y mène. |
| 11 | `/profil` | Espace maquilleuse, déplacé le 12/06/2023 | `/auth/profil` | 404 attendue | Aucune impression sur 28 jours au relevé Search Console du 13/10/2026, et plus aucun lien du site n'y mène. Une redirection vers une page privée ferait deux sauts pour une visiteuse sans session. |
| 12 | `/signin` | Connexion, déplacée le 12/06/2023 | `/auth/signin` | 404 attendue | Aucune impression sur 28 jours au relevé Search Console du 13/10/2026, et plus aucun lien du site n'y mène. |
| 13 | `/signup` | Inscription, déplacée le 12/06/2023 | `/auth/signup` | 404 attendue | Aucune impression sur 28 jours au relevé Search Console du 13/10/2026, et plus aucun lien du site n'y mène. |
<!-- urls:classement-404:fin -->

Si Search Console ou Bing montre un jour des impressions ou des liens entrants sur l'une d'elles, une redirection 308 vers la page qui a pris la suite s'ajoute dans la table, avec son test. Le rapport des liens de Search Console n'a pas été lu pour ce classement.

## Ce qui change par rapport à l'ancien site

Ce tableau liste les familles dont le code change pour une visiteuse sans session. Chaque ligne est un changement voulu, à inscrire au registre `CHANGEMENTS-VOULUS.md`.

<!-- urls:ecarts:debut -->
| Famille | Adresses | Code aujourd'hui | Code après la bascule |
| --- | --- | --- | --- |
| `profil-non-repris` | `/profil/<slug>` : l'un des 13 profils vides du spam, que l'import ne reprend pas (slug ou ancien nom) | 200, 308 | 404 |
| `toutes-les-news` | `/toutes-les-news` | 200 | 301 en un saut |
| `double-barre` | Toute adresse avec `//` | 200 | 301 en un saut |
| `http` | `http://my-makeup.fr/*` | 302 | 301 ou 308 en un saut |
| `www` | `https://www.my-makeup.fr/*`, `http://www.my-makeup.fr/*` | 302 | 301 ou 308 en un saut |
| `ancienne-api` | `https://api.my-makeup.fr/*`, `http://api.my-makeup.fr/*` | 200, 302 | 301 en un saut |
| `espace-accueil-retire` | `/auth/init-account` | 307 | 308 en un saut |
| `espace-racine` | `/auth` | 200 | 307 en un saut |
| `espace-erreur` | `/auth/error` | 307, 200 | 200 |
| `espace-google` | `/auth/google`, `/auth/google/callback` | 404 | 307 en un saut |
| `api-nextauth` | `/api/auth/*` | 200, 302, 404 | 404 |
| `api-sendmail` | `/api/sendMail` | 405 | 404 |
| `llms-txt` | `/llms.txt` | 404 | 200 |
| `classement` | `/classement` | 404 | 200 |
<!-- urls:ecarts:fin -->

## Adresses nouvelles, hors gel

La v3 ouvre des adresses que l'ancien site n'avait pas. La table ne dit rien d'elles :

- `/admin` et ce qui suit : l'administration de Payload. L'ancien site y répondait 404.
- `/api/…` : l'API de Payload. Seules `/api/health`, `/api/auth/*` et `/api/sendMail` sont gelées.
- `/maquilleuses/<département>` (ticket 1015) : la page d'un département, par exemple `/maquilleuses/haute-savoie`. Indexable et dans `/sitemap.xml` à partir d'1 profil publiable et visible dans la liste (décision du 24/10/2026, le seuil était de 3) ; aucun profil, ou un département inconnu : 404. La règle est dans `src/lib/seo/zones.ts`, les décisions dans [`docs/seo/pages-de-zone.md`](../seo/pages-de-zone.md).
- `/api/stats/weekly` : les statistiques du rapport du lundi, en `GET` seulement et avec un jeton de service (401 sans lui, 405 pour un autre verbe, jamais en cache) : [`docs/mesure/statistiques-hebdomadaires.md`](../mesure/statistiques-hebdomadaires.md).
- `/_next/…` : les fichiers du build, qui changent à chaque déploiement.

## L'inventaire gelé

L'inventaire a été relevé par l'outil de mesure des plans (`inventaire-urls`), en lecture seule : des requêtes GET seulement, 2 par seconde au plus. Il réunit les adresses du sitemap, celles que le site lie sur deux niveaux, les pages du crawl de l'audit, les motifs du plan, les routes supprimées en 2023 et, pour chaque profil, l'ancienne adresse par nom d'utilisateur.

<!-- urls:inventaire:familles:debut -->
Relevé du 14/10/2026 à 00:07 UTC : **207 adresses**, 295 requêtes GET. 91 sont écrites en clair plus bas ; les 116 autres portent le nom d'un profil et ne sont que comptées.

| Famille | Adresses relevées | Code aujourd'hui | Code après la bascule |
| --- | --- | --- | --- |
| `accueil` | 1 | 200 | 200 |
| `pages-fixes` | 12 | 200 | 200 |
| `mentions-legales` | 1 | 200 | 200 |
| `blog` | 1 | 200 | 200 |
| `article` | 10 | 200 | 200 |
| `talent` | 14 | 200 | 200 |
| `profil` | 41 | 200 | 200 |
| `profil-ancien-nom` | 73 | 308 | 308 en un saut |
| `slug-inconnu` | 3 | 404 | 404 |
| `recherche` | 7 | 200 | 200 |
| `toutes-les-news` | 1 | 200 | 301 en un saut |
| `plan-du-site` | 1 | 200 | 200 |
| `demande-envoyee` | 1 | 200 | 200 |
| `adresse-inconnue` | 2 | 404 | 404 |
| `double-barre` | 2 | 200 | 301 en un saut |
| `barre-finale` | 3 | 308 | 308 en un saut |
| `http` | 2 | 302 | 301 ou 308 en un saut |
| `www` | 3 | 302 | 301 ou 308 en un saut |
| `espace-connexion` | 4 | 200 | 200 |
| `espace-prive` | 1 | 307 | 307 en un saut |
| `espace-accueil-retire` | 1 | 307 | 308 en un saut |
| `espace-verification` | 2 | 200 | 200 |
| `espace-racine` | 1 | 200 | 307 en un saut |
| `espace-erreur` | 1 | 307, 200 | 200 |
| `api-nextauth` | 2 | 200, 302, 404 | 404 |
| `api-sendmail` | 1 | 405 | 404 |
| `sante` | 1 | 200 | 200 |
| `sitemap` | 1 | 200 | 200 |
| `robots` | 1 | 200 | 200 |
| `historiques` | 12 | 404 | 404 |
| `llms-txt` | 1 | 404 | 200 |
| **Total** | **207** |  |  |
<!-- urls:inventaire:familles:fin -->

### Du 09/10 au 14/10

Le relevé du 09/10/2026 comptait 206 adresses. Celui du 14/10/2026 en compte 207.

- Une adresse en plus : l'ancienne adresse d'un profil apparu entre les deux relevés (101 profils lus, contre 100). Elle répond 308 en un saut vers un profil non publiable.
- Sur les 206 adresses communes, aucun code n'a changé, ni aucun titre principal (h1). Les 13 adresses en 404 non voulue sont les mêmes.
- Les 15 profils du sitemap sont maintenant liés par le plan du site (`/site-map`), depuis le 13/10/2026.

### Adresses écrites en clair

<!-- urls:inventaire:adresses:debut -->
| Adresse | Aujourd'hui | Après la bascule | Famille |
| --- | --- | --- | --- |
| `/robots.txt` | 200 | 200 | `robots` |
| `/sitemap.xml` | 200 | 200 | `sitemap` |
| `/` | 200 | 200 | `accueil` |
| `/a-propos` | 200 | 200 | `pages-fixes` |
| `/blog` | 200 | 200 | `blog` |
| `/toutes-les-news` | 200 | 301 en un saut | `toutes-les-news` |
| `/contact` | 200 | 200 | `pages-fixes` |
| `/pourquoi-utiliser-my-makeup-en-tant-que-particulier` | 200 | 200 | `pages-fixes` |
| `/particulier/trouver-une-maquilleuse` | 200 | 200 | `pages-fixes` |
| `/particulier/centraliser-ses-recherches` | 200 | 200 | `pages-fixes` |
| `/particulier/explorer-les-profils` | 200 | 200 | `pages-fixes` |
| `/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse` | 200 | 200 | `pages-fixes` |
| `/maquilleuse/partenariats` | 200 | 200 | `pages-fixes` |
| `/solutions/pour-les-particuliers` | 200 | 200 | `pages-fixes` |
| `/solutions/pour-les-maquilleuses` | 200 | 200 | `pages-fixes` |
| `/cgu` | 200 | 200 | `pages-fixes` |
| `/mentions-legales` | 200 | 200 | `mentions-legales` |
| `/politique-de-confidentialite` | 200 | 200 | `pages-fixes` |
| `/talent/maquillage-mariee` | 200 | 200 | `talent` |
| `/talent/maquillage-fete` | 200 | 200 | `talent` |
| `/talent/maquillage-professionnel` | 200 | 200 | `talent` |
| `/talent/maquillage-artistique` | 200 | 200 | `talent` |
| `/talent/maquillage-homme` | 200 | 200 | `talent` |
| `/talent/maquillage-femme` | 200 | 200 | `talent` |
| `/talent/maquillage-enfant` | 200 | 200 | `talent` |
| `/talent/maquillage-beaute` | 200 | 200 | `talent` |
| `/talent/maquillage-soiree` | 200 | 200 | `talent` |
| `/talent/maquillage-film` | 200 | 200 | `talent` |
| `/talent/maquillage-specialise` | 200 | 200 | `talent` |
| `/talent/maquillage-theatre` | 200 | 200 | `talent` |
| `/talent/maquillage-fx` | 200 | 200 | `talent` |
| `/talent/maquillage-cinema` | 200 | 200 | `talent` |
| `/blog/cout-maquilleuse-professionnelle-guide-tarifs` | 200 | 200 | `article` |
| `/blog/choisir-maquilleuse-professionnelle-evenement` | 200 | 200 | `article` |
| `/blog/maximiser-investissement-maquilleuse-professionnelle` | 200 | 200 | `article` |
| `/blog/tendances-maquillage-professionnel` | 200 | 200 | `article` |
| `/blog/conseils-visibilite-maquilleuse-professionnelle` | 200 | 200 | `article` |
| `/blog/conseils-maquillage-professionnels-debutants` | 200 | 200 | `article` |
| `/blog/fiche-google-maquilleuse` | 200 | 200 | `article` |
| `/blog/prix-maquillage-mariee-2027` | 200 | 200 | `article` |
| `/blog/quand-reserver-maquilleuse-mariage` | 200 | 200 | `article` |
| `/blog/essai-maquillage-mariee` | 200 | 200 | `article` |
| `/search` | 200 | 200 | `recherche` |
| `/search?search=mariage&city=Paris` | 200 | 200 | `recherche` |
| `/search?city=Annecy` | 200 | 200 | `recherche` |
| `/search?search=zzqqxxyy` | 200 | 200 | `recherche` |
| `/auth/signin` | 200 | 200 | `espace-connexion` |
| `/auth/signup` | 200 | 200 | `espace-connexion` |
| `/site-map` | 200 | 200 | `plan-du-site` |
| `/page-inexistante-audit-zz` | 404 | 404 | `adresse-inconnue` |
| `/profil/audit-inexistant-zz9` | 404 | 404 | `slug-inconnu` |
| `/auth/profil` | 307, puis 200 en 1 saut | 307 en un saut | `espace-prive` |
| `http://my-makeup.fr/` | 302, puis 200 en 1 saut | 301 ou 308 en un saut | `http` |
| `http://www.my-makeup.fr/` | 302, puis 200 en 2 sauts | 301 ou 308 en un saut | `www` |
| `http://my-makeup.fr/blog` | 302, puis 200 en 1 saut | 301 ou 308 en un saut | `http` |
| `https://www.my-makeup.fr/` | 302, puis 200 en 1 saut | 301 ou 308 en un saut | `www` |
| `https://www.my-makeup.fr/blog` | 302, puis 200 en 1 saut | 301 ou 308 en un saut | `www` |
| `/llms.txt` | 404 | 200 | `llms-txt` |
| `/demande-envoyee` | 200 | 200 | `demande-envoyee` |
| `/404` | 404 | 404 | `adresse-inconnue` |
| `/blog/` | 308, puis 200 en 1 saut | 308 en un saut | `barre-finale` |
| `//blog` | 200 | 301 en un saut | `double-barre` |
| `/talent/inexistant-inventaire-zz9` | 404 | 404 | `slug-inconnu` |
| `/blog/inexistant-inventaire-zz9` | 404 | 404 | `slug-inconnu` |
| `/search?search=mariage&city=Annecy` | 200 | 200 | `recherche` |
| `/auth` | 200 | 307 en un saut | `espace-racine` |
| `/auth/init-account` | 307, puis 200 en 1 saut | 308 en un saut | `espace-accueil-retire` |
| `/auth/mot-de-passe-oublie` | 200 | 200 | `espace-connexion` |
| `/auth/reinitialiser` | 200 | 200 | `espace-connexion` |
| `/auth/verification-complete` | 200 | 200 | `espace-verification` |
| `/auth/verification-wall` | 200 | 200 | `espace-verification` |
| `/auth/error` | 307, puis 200 en 1 saut | 200 | `espace-erreur` |
| `/api/auth/signin` | 302, puis 200 en 1 saut | 404 | `api-nextauth` |
| `/api/auth/providers` | 200 | 404 | `api-nextauth` |
| `/api/sendMail` | 405 | 404 | `api-sendmail` |
| `/api/health` | 200 | 200 | `sante` |
| `/talent/maquillage-mariee/` | 308, puis 200 en 1 saut | 308 en un saut | `barre-finale` |
| `/maquilleuse` | 404 | 404 | `historiques` |
| `/particulier` | 404 | 404 | `historiques` |
| `/maquilleuse/partenaires` | 404 | 404 | `historiques` |
| `/affiliation` | 404 | 404 | `historiques` |
| `/cgv` | 404 | 404 | `historiques` |
| `/help` | 404 | 404 | `historiques` |
| `/parrainage` | 404 | 404 | `historiques` |
| `/recrutement` | 404 | 404 | `historiques` |
| `/deposer-un-projet` | 404 | 404 | `historiques` |
| `/profil` | 404 | 404 | `historiques` |
| `/signin` | 404 | 404 | `historiques` |
| `/signup` | 404 | 404 | `historiques` |
| `/search?search=mariage` | 200 | 200 | `recherche` |
| `/search?search=coiffure` | 200 | 200 | `recherche` |
<!-- urls:inventaire:adresses:fin -->

### Adresses de profil, en nombres

Ces adresses portent le nom d'utilisateur ou le slug d'une vraie maquilleuse. Elles ne sont pas dans le dépôt. La liste complète reste dans le fichier privé de l'outil de mesure, hors de tout dépôt public ; elle se régénère en relançant l'inventaire.

<!-- urls:inventaire:profils:debut -->
| Cas | Adresses | Aujourd'hui | Après la bascule | Famille |
| --- | --- | --- | --- | --- |
| Slug d'un profil publiable, dans le sitemap | 15 | 200 | 200 | `profil` |
| Nom d'utilisateur déjà au format du slug, profil non publiable (`noindex`) | 26 | 200 | 200 | `profil` |
| Ancien nom d'utilisateur, 308 en un saut vers un profil du sitemap | 13 | 308, puis 200 en 1 saut | 308 en un saut | `profil-ancien-nom` |
| Ancien nom d'utilisateur, 308 en un saut vers un profil non publiable (`noindex`) | 60 | 308, puis 200 en 1 saut | 308 en un saut | `profil-ancien-nom` |
| Profil du sitemap demandé avec une barre en double (`//profil/…`) | 1 | 200 | 301 en un saut | `double-barre` |
| Profil du sitemap demandé avec une barre finale | 1 | 308, puis 200 en 1 saut | 308 en un saut | `barre-finale` |
<!-- urls:inventaire:profils:fin -->

Les 13 profils vides du spam sont comptés dans ces lignes, avec les autres : l'inventaire ne les distingue pas. Ils ne sont pas repris par l'import, et leurs adresses répondront 404 (famille `profil-non-repris`). Le registre des changements voulus les désigne par leur numéro.

### Lectures complémentaires

L'outil de mesure ne lit ni les fichiers de vérification ni le relais de mesure `/u`. Ces 18 adresses ont été lues à part, le 14/10/2026, de la même façon.

<!-- urls:inventaire:complements:debut -->
| Adresse | Aujourd'hui | Après la bascule | Famille |
| --- | --- | --- | --- |
| `/BingSiteAuth.xml` | 200, mêmes octets que le fichier de `public/` | 200 | `verification-bing` |
| Fichier de clé IndexNow (`/<clé>.txt`) | 200, mêmes octets que le fichier de `public/` | 200 | `verification-indexnow` |
| `/favicon.webp` | 200, mêmes octets que le fichier de `public/` | 200 | `fichiers-publics` |
| `/favicon.ico` | 404 | 404 | `adresse-inconnue` |
| `/u/script.js` | 200 | 200 | `mesure-script` |
| `/u/api/send` | 405 | 405 | `mesure-envoi` |
| `/u/autre-chemin` | 404 | 404 | `mesure-autre` |
| `/u` | 404 | 404 | `mesure-autre` |
| `/api/auth/session` | 200 | 404 | `api-nextauth` |
| `/api/auth` | 404 | 404 | `api-nextauth` |
| `/admin` | 404 | Hors gel | — |
| `/api` | 404 | Hors gel | — |
| `https://api.my-makeup.fr/` | 200 | 301 en un saut | `ancienne-api` |
| `http://api.my-makeup.fr/` | 302 | 301 en un saut | `ancienne-api` |
| `/auth/error?error=erreur-inconnue` | 200 | 200 | `espace-erreur` |
| `/search/?city=Annecy` | 308 | 308 en un saut | `barre-finale` |
| `//toutes-les-news` | 200 | 301 en un saut | `double-barre` |
| `/Blog` | 404 | 404 | `adresse-inconnue` |
<!-- urls:inventaire:complements:fin -->

## Changer une adresse

Une adresse publique ne change pas sans laisser de trace.

1. Écrire la décision au journal des décisions.
2. Modifier la table `src/lib/frozen-urls.ts` : l'ancienne adresse reçoit sa redirection 308 en un saut, ou sa 404 attendue avec sa raison.
3. Lancer `bun scripts/migration/urls-doc.ts`, qui réécrit les tableaux de ce document.
4. Lancer `bun --no-env-file test tests/unit/frozen-urls.test.ts`.
5. Pendant la migration, ajouter la ligne au registre `CHANGEMENTS-VOULUS.md`.

L'inventaire, lui, ne se modifie pas à la main. Il se relance, puis se gèle de nouveau.
