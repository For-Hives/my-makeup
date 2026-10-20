# Schéma gelé : de Strapi à Payload

> Gelé le 14/10/2026 (ticket 015). Ce document dit où va chaque champ de l'ancienne API (Strapi 4) dans la v3 (Payload 3), ou pourquoi il n'est pas repris. Il fige le tableau du plan technique (`01` §6.1) et les transformations du §6.2.
>
> Il ne contient aucune valeur de la base : seulement des noms de champs, des types, des nombres et des identifiants numériques.

## 1. Sources et mode d'emploi

| Source | État lu |
|---|---|
| Schémas de Strapi | Dépôt `api-my-makeup`, commit `ccd449d` du 13/10/2026 : 4 types de contenu, 7 composants, 1 extension du greffon d'envoi de fichiers |
| Données | Instantané du dump du 13/10/2026 à 03:00 UTC (rapport `snapshot.md` de l'outil de migration des plans, empreinte `91f32ca81abb…`) : des nombres, jamais une valeur |
| Photos | Contrôle des photos du 13/10/2026 (rapport `controle-photos.md` du même outil) |
| Cible | Plan `01` §2.3, §2.4, §6.1 et §6.2 ; décisions du 13/10/2026 au soir ; Payload 3.90.2 |

Comment lire les tableaux des §5 et §6 :

- **Une ligne par attribut de Strapi**, dans l'ordre du fichier de schéma. Le nombre de lignes est contrôlé (§10).
- **Champ Payload** s'écrit `collection.champ`. Le type de champ de Payload est entre parenthèses.
- **Repris tel quel** : la même valeur, à l'octet près.
- **Transformé** : la règle est écrite ici. Quand elle vient du plan `01` §6.2 ou change ce que montre une page, elle est aussi inscrite au registre des changements voulus (`docs/migration/CHANGEMENTS-VOULUS.md`, ticket 017). Deux transformations ne changent aucune page et n'y sont pas : l'email du compte, mis en minuscules (§5.1), et la taille d'un fichier, relue en octets (§8).
- **Abandonné** : le champ n'est pas repris, la raison est donnée. La colonne « Champ Payload » porte alors un tiret.

Ce document est gelé : un ticket qui crée une collection reprend ces noms. S'il doit s'en écarter, il modifie ce document dans le même changement, ajoute une ligne datée au §12, et le contrôle du §10 reste vert.

## 2. Règles transverses

1. **`strapiId`, jamais `id`.** L'identifiant de Strapi est rangé dans un champ numérique `strapiId`, sur `pros`, `profils`, `articles`, `talents` et `media`. Payload garde ses propres identifiants. Dans Payload 3.90.2, un champ nommé `id` n'est pas un champ ordinaire : au premier niveau d'une collection, il devient la clé primaire (`@payloadcms/drizzle/dist/postgres/schema/setColumnID.js`) ; dans une liste, c'est l'identifiant de la ligne (`payload/dist/fields/baseFields/baseIDField.js`). Il ne peut donc pas porter l'identifiant de Strapi à côté de celui de Payload. `strapiId` est unique dans sa collection, posé par l'import seulement, jamais modifiable par l'API, absent des lectures publiques. Il est vide pour un document créé dans la v3. L'import retrouve un document par son `strapiId` : un second passage ne crée rien.
2. **Nul reste nul.** Une valeur absente à la source reste absente dans Payload. L'import ne la remplace ni par une chaîne vide, ni par zéro, ni par faux. La seule exception est `available` (§5.2).
3. **Les dates d'origine sont gardées.** `created_at` devient `createdAt`, `updated_at` devient `updatedAt`, `published_at` devient l'état publié et `publishedAt` (§7). Ces dates sont des données : l'ancien site affiche `updatedAt` sur les articles et dans le `lastmod` du sitemap, et trie le blog par date de publication. Payload 3.90.2 garde un `createdAt` et un `updatedAt` fournis à la création, mais remplace `updatedAt` par l'heure courante à chaque mise à jour (`payload/dist/collections/operations/utilities/update.js`, lignes 310-311). Une mise à jour faite par l'import après la création ferait donc perdre la date d'origine.
4. **Aucun hash dans un fichier.** Le hash bcrypt d'un mot de passe est copié de la base de Strapi à la base de Payload. Il ne passe que par la mémoire du script. Il n'est jamais écrit dans un fichier, un instantané, un journal, un rapport, une fixture ni ce dépôt. Les jetons de réinitialisation et de confirmation ne sont jamais lus.
5. **Rien n'est tronqué ni corrigé en silence.** Une valeur que le champ cible refuse (longueur, borne, format, doublon d'un champ unique) est comptée et listée par identifiant dans le rapport d'import, puis tranchée (ticket 066). Les seules corrections automatiques sont celles de ce document.
6. **L'ordre est une donnée.** Les lignes d'une liste (compétences, langues, formations, expériences, prestations, options, galerie) gardent l'ordre de la table de liens de Strapi.
7. **La source est lue, jamais écrite.** L'import lit Strapi par un rôle en lecture seule et ne supprime rien, ni dans la base ni dans le stockage des photos.
8. **Aucune donnée personnelle hors de la base.** Les rapports, les tests et ce dépôt ne portent que des nombres, des identifiants numériques et des empreintes.
9. **GraphQL est désactivé** et **aucune table ne dépasse 100 colonnes** (règles du plan `01` §6.1).

## 3. Décomptes de l'instantané du 13/10/2026

**La cible de parité du plan `01` §5 (« 114 / 100 / 6 / 14 ») est périmée.** Elle venait du dump du 08/10/2026. Depuis, 24 comptes de spam ont été supprimés (10/10), un compte s'est inscrit et des articles ont été publiés. Les nombres qui font foi sont ceux du 13/10/2026, jusqu'au prochain instantané : la parité se mesure toujours contre l'instantané du jour de l'import.

| Donnée | Plan `01` (dump du 08/10/2026, périmé) | Instantané du 13/10/2026 | Attendu dans Payload |
|---|---|---|---|
| Comptes (`up_users`) | 114 | 91 | 91, moins les comptes écartés par la table de décision des emails en double (§5.1) |
| Profils (`makeup_artistes`) | 100 | 101 | 88 au plus : les 101, moins les 13 profils écartés (§4.1), moins les profils dont le compte est écarté par la table de décision des emails en double (§5.1, §11) |
| Articles (`articles`) | 6 | 10 | 10 |
| Talents (`talents`) | 14 | 14 | 14 |
| Fichiers (`files`) | 574, dont 325 non référencés | 574, dont 325 non référencés | 248 au plus : les 249 fichiers référencés, moins 1 qui n'est pas une image (§8) |

Détail du 13/10/2026, en nombres :

| Mesure | Valeur au 13/10/2026 |
|---|---|
| Comptes par fournisseur | `local` 42, `google` 40, `facebook` 9 |
| Comptes avec un hash bcrypt complet | 43 (`local` 42, `google` 1) ; 48 sans mot de passe |
| Comptes confirmés, comptes bloqués | 91 sur 91, 0 sur 91 |
| Emails portés par plusieurs comptes | 1 adresse, 4 comptes |
| Comptes sans profil | 3 |
| Liens compte-profil | 88 ; aucun compte lié à plusieurs profils |
| Profils sans compte | 13 (§4.1) |
| Profils : `available` | 48 vrai, 5 faux, 48 nul |
| Profils : `pro` | 1 vrai, 100 faux |
| Profils dont le `username` n'est pas déjà son slug | 73 sur 101 ; aucune collision de slug |
| Articles publiés, talents publiés | 10 sur 10, 14 sur 14 |
| Comptes d'administration (`admin_users`) | 2 |
| Lignes de composants | compétences 200, expériences 57, formations 47, langues 65, réseaux 101, prestations 118, options 23 |
| Fichiers référencés, par champ | `image_gallery` 200, `main_picture` 49 ; aucun par un article ou un talent |

Chiffres du plan `01` §6.2, à ne plus citer sans les recompter :

| Chiffre du plan (08/10/2026) | État au 13/10/2026 |
|---|---|
| 47 profils avec `available` nul | 48 |
| 72 `username` sur 100 hors de la règle de slug | 73 sur 101 |
| 38 profils vides | 39 profils entièrement vides sur 101 (décision du 13/10), dont les 13 écartés : 26 à reprendre en brouillon, à recompter par l'import |
| 14 comptes sans profil | 3 |
| 44 villes vides, 45 valeurs distinctes | Non mesuré le 13/10 : à compter par l'import |
| 55 prix non numériques sur 118 prestations | 118 prestations ; part non numérique non mesurée le 13/10 |
| 47 profils qui affichent un téléphone ou un email | Non mesuré le 13/10 : à compter par l'import |

## 4. Exclusions

### 4.1 Les 13 profils sans propriétaire

Treize profils sont restés sans compte après la suppression, le 10/10/2026, de 24 comptes de spam d'inscription. Ils sont entièrement vides : ni photo, ni description, ni ville. Décision du 13/10/2026 au soir : **ils ne sont pas repris**.

Identifiants (`makeup_artistes.id`) : 67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108.

- L'import les compte « écartés » ; ils sont absents de Payload, avec leurs lignes de composants.
- Aucun fichier n'est référencé par eux.
- Tout autre profil sans compte arrête l'import (ticket 059) : la liste ne s'allonge pas toute seule. Seule une décision par profil de la table de décision de l'import l'écarte (`excludedProfiles`, `docs/migration/IMPORT.md`).
- Leurs adresses répondent 404 dans la v3 (ticket 104).
- Si ces profils sont supprimés de Strapi avant la bascule, la liste ne désigne plus rien et reste sans effet.

### 4.2 Les comptes d'administration

Les comptes de l'admin de Strapi (`admin_users`, 2 lignes au 13/10/2026) et leurs tables (`admin_roles`, `admin_permissions` et leurs liens) ne sont **jamais lus par l'import ni migrés**. Les comptes `admins` de Payload sont créés à la main, avec de nouveaux mots de passe : un rôle `admin` et un rôle `editor` (la rédaction, ticket 018).

Les colonnes `created_by_id` et `updated_by_id` des contenus, qui désignent ces comptes, sont abandonnées (§7).

### 4.3 Les fichiers non référencés

Seul un fichier désigné par un profil ou un article vivant devient un `media` (§8).

| Lignes de `files` au 13/10/2026 | Lignes | Sort |
|---|---|---|
| Désignées par une entrée vivante | 249 | Adoptées sans copie si ce sont des images. 1 n'est pas une image : signalée, non adoptée. 1 a son objet manquant dans le stockage (ligne 127 de `files`) : adoptée quand même, sans taille, et listée en « 404 connus ». |
| Liées à un profil supprimé | 7 | Non adoptées |
| Sans aucune ligne de relation | 318 | Non adoptées |

- Les formats dérivés de Strapi (vignettes) ne deviennent pas des `media` : leur description est archivée dans `media.strapiFormats`.
- Les objets du stockage sans ligne dans `files` (18 583 au contrôle du 13/10/2026) ne sont pas touchés.
- **Rien n'est supprimé par l'import**, ni une ligne de `files` ni un objet. La purge est une autre décision, après un contrôle complet (tickets 055, 197 et 205).

### 4.4 Les tables internes de Strapi

Non reprises : `strapi_core_store_settings`, `strapi_database_schema`, `strapi_migrations`, `strapi_api_tokens`, `strapi_transfer_tokens`, `strapi_webhooks`, `strapi_releases` et leurs liens, `i18n_locale`, `up_roles`, `up_permissions` et leurs liens, `upload_folders` et ses liens. Ce qu'elles règlent (rôles, fournisseurs de connexion, modèles d'email) est configuré à neuf dans la v3. Elles peuvent contenir des secrets : l'import ne les ouvre pas.

## 5. Types de contenu (4)

### 5.1 Compte : `plugin::users-permissions.user` → `pros`

Table `up_users`, 91 lignes. Collection d'authentification des maquilleuses (plan `01` §2.3).

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `username` | `string`, 3 caractères au moins, unique, requis | `pros.name` (`text`) | Repris tel quel. Nom d'affichage, non unique dans Payload : 2 noms sont portés chacun par 2 comptes. Le slug du profil vient du `username` du profil (§5.2), pas de celui-ci. |
| `email` | `email`, 6 caractères au moins, requis | `pros.email` (identifiant de connexion, unique) | Transformé : espaces de bord retirés, minuscules. Jamais écrit dans un rapport. Une adresse est portée par 4 comptes : tant que la table de décision n'existe pas, l'import s'arrête (tickets 025 et 066). |
| `provider` | `string` | `pros.legacyProvider` (`text`) | Repris tel quel : `local`, `google` ou `facebook`. Depuis le ticket 091, une personne qui s'inscrit avec Google après la bascule reçoit aussi `google` : c'est ce qui dit à la connexion Google que le compte est le sien. Aucun autre code ne l'écrit. |
| `password` | `password`, privé | `pros.legacyBcrypt` (`text`, caché, ni lu ni modifié par l'API) | Seul un hash bcrypt complet est copié, de base à base (règle 4) ; toute autre valeur donne nul. 43 hash attendus au plus : un compte écarté par la table de décision des emails en double (ligne `email`) prête le sien au compte retenu quand celui-ci n'en a pas (registre, `comptes-email-partage`) ; il n'ajoute donc pas de hash en plus. Le prêt est le défaut du ticket 066 et ne vaut que pour un compte retenu « local » : l'ancien site ne vérifiait pas les emails, et un mot de passe ne doit pas ouvrir un compte Google ou Facebook qui n'en avait pas (la connexion par le hash hérité, ticket 087, est déjà en place). Pour un compte retenu non local, le prêt demande `"pretDuHash": true` dans la table de décision ; il se refuse pour tout groupe avec `"pretDuHash": false`. Un compte non local qui a reçu un prêt par décision garde son fournisseur : l'égalité de I44 (hash hérités = comptes locaux) devient « comptes locaux + comptes non locaux qui ont reçu un prêt ». Le mot de passe Payload du compte repris est tiré au hasard. Le hash hérité est effacé à la première connexion réussie (ticket 087). |
| `resetPasswordToken` | `string`, privé | — | Abandonné : jeton à usage unique de Strapi, sans valeur dans Payload. Jamais lu. Une réinitialisation en cours à la bascule est à redemander. |
| `confirmationToken` | `string`, privé | — | Abandonné : jeton à usage unique, et la confirmation d'email est coupée dans Strapi. Jamais lu. |
| `confirmed` | `boolean`, faux par défaut | `pros._verified` (champ d'authentification de Payload) | Vrai pour tout compte repris (plan `01` §2.4, M1). À la source : 91 vrai sur 91. Une ligne qui ne serait pas à vrai est signalée au rapport, par identifiant. Payload 3.90.2 ne crée ce champ que si `auth.verify` est activé sur la collection `pros` : il l'est donc dans le schéma lui-même, en permanence (tickets 019 et 082). Un interrupteur d'environnement qui retirerait `auth.verify` retirerait le champ avec lui. |
| `blocked` | `boolean`, faux par défaut | `pros.blocked` (`checkbox`) | Repris tel quel : 0 vrai, 91 faux. |
| `role` | `relation` plusieurs-à-un vers `plugin::users-permissions.role` | — | Abandonné : dans Payload, le rôle d'une maquilleuse est sa collection. Les rôles et permissions de Strapi ne sont pas repris. |
| `makeup_artiste` | `relation` un-à-un, côté inverse de `user` | `profiles.pro` (porté par le profil) | Aucun champ sur `pros` : le lien est repris une seule fois, depuis l'attribut `user` du profil (§5.2). Un compte sans profil reste sans profil (ticket 025). |

Dans la table `up_users`, chaque colonne porte le nom de son attribut, sauf deux : `reset_password_token` (attribut `resetPasswordToken`) et `confirmation_token` (attribut `confirmationToken`). `role` et `makeup_artiste` n'ont pas de colonne : ce sont des tables de liens (§7).

### 5.2 Profil : `api::makeup-artiste.makeup-artiste` → `profils`

Table `makeup_artistes`, 101 lignes, sans brouillon dans Strapi : 88 profils à reprendre au plus (§3), 13 écartés (§4.1).

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `last_name` | `string`, 2 à 70 caractères | `profiles.lastName` (`text`) | Repris tel quel. |
| `first_name` | `string`, 2 à 70 caractères | `profiles.firstName` (`text`) | Repris tel quel. |
| `speciality` | `string`, 70 caractères au plus | `profiles.specialty` (`text`) | Repris tel quel. Texte libre. |
| `city` | `string`, 70 caractères au plus, texte libre | `profiles.city` (groupe : `name`, `inseeCode`, `department`, `latitude`, `longitude`) | Transformé (plan `01` §6.2, ticket 063) : le texte saisi devient une commune du référentiel officiel. Le texte saisi n'est copié dans aucun champ. Une adresse postale n'est jamais importée : seule sa commune l'est, jamais sa rue. Texte ambigu, ou qui n'est pas une commune : zone vide, profil à revoir (ticket 066). Le serveur refuse une commune sans code INSEE ou dont le code est mal formé, un nom qui ressemble à une adresse, et un nom fait d'autres caractères que ceux d'un nom de commune (lettres, espaces, traits d'union, apostrophes, parenthèses) ; une commune s'enregistre entière. Il ne compare pas le nom à celui de son code : c'est la liste officielle de l'espace et de l'import qui les donne ensemble. Il calcule lui-même `department` depuis le code : un des 101 départements, ou une collectivité d'outre-mer de la liste officielle (975, 977, 978, 984, 986 à 989). Il garde `latitude` et `longitude` à deux décimales, le centre de la commune à environ 1 km près (ticket 041). |
| `action_radius` | `integer`, 0 à 2 147 483 647 | `profiles.radiusKm` (`number`, 0 à 200) | Repris tel quel de 0 à 200. L'ancien site accepte jusqu'à 1 000 km : une valeur au-dessus de 200 est comptée et listée (règle 5), jamais ramenée à 200 en silence : le champ reste vide, le profil est repris, le rapport donne son identifiant et la valeur (ticket 226, registre `rayon-200-km`). |
| `score` | `decimal` | `profiles.score` (`number`, réservé à l'admin) | Repris tel quel. Jamais dans une lecture publique. Ce n'est pas la complétude, qui est calculée (§9). |
| `available` | `boolean` | `profiles.available` (`checkbox`) | Transformé (plan `01` §6.2) : vrai et faux repris tels quels, **nul devient vrai** (48 profils). Seule exception à la règle 2. |
| `skills` | `component` répétable `makeupartists.skills` | `profiles.skills` (`array`) | Lignes du §6.1, dans l'ordre. |
| `description` | `text`, 2 000 caractères au plus | `profiles.description` (`textarea`, 2 000 au plus) | Repris tel quel. |
| `network` | `component` simple `makeupartists.network` | `profiles.networks` et `profiles.contactDetails` (groupes) | Champs du §6.5 : les réseaux d'un côté, le téléphone et l'email de contact de l'autre, fermés au public. |
| `user` | `relation` un-à-un vers `plugin::users-permissions.user` | `profiles.pro` (`relationship` vers `pros`, unique, requis) | Lu dans `makeup_artistes_user_links` (88 liens) : le profil est relié au compte de même `strapiId`. Profil sans compte : écarté s'il est dans la liste du §4.1, sinon l'import s'arrête. |
| `experiences` | `component` répétable `makeupartists.experiences` | `profiles.experiences` (`array`) | Lignes du §6.2, dans l'ordre. |
| `courses` | `component` répétable `makeupartists.courses` | `profiles.courses` (`array`) | Lignes du §6.3, dans l'ordre. |
| `service_offers` | `component` répétable `makeupartists.service-offers` | `profiles.serviceOffers` (`array`) | Lignes du §6.6, dans l'ordre, avec leurs options (§6.7). |
| `image_gallery` | `media` multiple, images | `profiles.gallery` (`upload` vers `media`, plusieurs, 10 au plus) | Fichiers et ordre lus dans `files_related_morphs`. Une photo dont le média n'est pas adopté est signalée, pas inventée. Une galerie de plus de 10 photos est comptée et listée (règle 5). |
| `main_picture` | `media` simple, images | `profiles.mainPicture` (`upload` vers `media`) | Fichier lu dans `files_related_morphs`. Une photo dont le média n'est pas adopté est signalée, pas inventée. 49 profils en ont une ; l'objet de l'une d'elles manque dans le stockage (§4.3). |
| `language` | `component` répétable `makeupartists.language` | `profiles.languages` (`array`) | Lignes du §6.4, dans l'ordre. |
| `username` | `string`, 70 caractères au plus | `profiles.legacyUsername` (`text`, lecture seule) et `profiles.slug` (`text`, unique) | `legacyUsername` : repris tel quel, il sert la redirection 308 de l'ancienne adresse. `slug` : calculé par la règle portée de l'ancien site (`src/lib/slug.ts`, ticket 016), suffixes `-2`, `-3` en cas de collision. |
| `pro` | `boolean`, faux par défaut | `profiles.superArtist` (`checkbox`, réservé à l'admin) | Repris tel quel : 1 vrai, 100 faux. C'est le badge « Super maquilleuse » des cartes de la recherche. À ne pas confondre avec `profiles.pro`, le compte propriétaire. Défaut pris ici, en attente de la question ouverte 14 (§11). |
| `company_artist_name` | `string`, 70 caractères au plus | `profiles.artistName` (`text`) | Repris tel quel. |

### 5.2 bis. Zone du profil hors de France et codes postaux (tickets 258 et 259)

Ces champs n'ont pas d'attribut dans Strapi : ils sont nés dans la v3 (`PLAN-ZONES.md`). L'ancien site garde la ville en texte libre (`city`, ligne du §5.2) ; la v3 en fait une zone de deux types. Le schéma change par une migration versionnée qui ne fait que des ajouts, `20261020_215218_zone_countries_postal_codes` : la production a déjà joué `init`.

| Champ Payload | Type | Règle |
|---|---|---|
| `profiles.zoneKind` | `select` : `city` ou `countries`, `city` par défaut | Une zone a un seul type. À l'enregistrement, le serveur vide les champs de l'autre type. Une requête qui remplit les deux types est refusée en français. Un profil déjà stocké est de type `city`. Public. |
| `profiles.city.postalCodes` | `text`, plusieurs valeurs (`hasMany`) | Les codes postaux de la commune, donnés par la liste officielle avec elle : cinq chiffres chacun, écrits sans espace, triés, sans doublon. Une commune envoyée sans codes postaux n'en garde pas ceux de la commune qu'elle remplace. Public (données de référence). |
| `profiles.countries` | `text`, plusieurs valeurs (`hasMany`) | De un à cinq codes ISO 3166-1 alpha-2 de la liste embarquée (`src/lib/countries.ts` : 232 pays, la France comprise, sans les douze codes d'outre-mer que la liste officielle tient pour des communes ni les cinq territoires sans habitants), en capitales, sans doublon, au moins un pays étranger : la France seule est refusée. Public. |
| `profiles.town` | `text`, 70 caractères au plus | Facultative, et seulement avec un seul pays étranger. Mêmes règles qu'un nom de commune : ni chiffre, ni type de voie, ni autres caractères que ceux d'un nom. Jamais une adresse. Public. |
| `profiles.zoneReview` | groupe : `reason` (`sharedPostalCode`, `homonyms`, `notFound`, `notACity`), `postalCode`, `candidates` (`json`) | Ce que l'import n'a pas pu décider de la zone. Lu par l'admin et la propriétaire seulement, écrit par aucune API, posé par l'import seul, vidé par le serveur à chaque enregistrement d'une zone non vide. Ne contient jamais le texte saisi. |

Le rayon (`radiusKm`) et « à domicile » (`homeService`) sont communs aux deux types. Les règles pures sont dans `src/lib/profile/zone.ts` (`countriesErrors`, `townErrors`, `postalCodesErrors`, `isPostalCode`), les champs dans `src/collections/profiles/zone.ts`. Dans l'administration, chaque champ ne s'affiche que pour son type, `zoneReview` est en lecture seule, et la liste des profils a une colonne et un filtre « Zone à revoir ». `hasMany` d'un `text` dans le groupe `city` s'enregistre et se relit avec l'adaptateur Postgres de Payload 3.90.2 (constaté par `tests/integration/profile-zone.test.ts`) : le repli sur un `json` n'a pas servi.

### 5.3 Article : `api::article.article` → `articles`

Table `articles`, 10 lignes, toutes publiées. Brouillons possibles dans Strapi. Les champs gardent leur nom de Strapi, comme l'écrit le plan `01` §6.1.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `title` | `string`, requis | `articles.title` (`text`, requis pour publier) | Repris tel quel. |
| `content` | `richtext`, requis | `articles.content` (`code`, markdown) | Repris tel quel, à l'octet près : le markdown reste du markdown. Champ `code` et non `textarea` : Payload limite `text` et `textarea` à 40 000 caractères par défaut. |
| `author` | `string`, requis | `articles.author` (`text`) | Repris tel quel. Signature affichée sur la page de l'article. |
| `galery` | `media` multiple, tous types de fichiers | `articles.gallery` (`upload` vers `media`, plusieurs, images seulement) | Nom corrigé : `galery` était une faute de frappe. Aucun article ne désigne de fichier au 13/10/2026. Une image est rattachée si son média est adopté ; un fichier qui n'est pas une image est signalé, non adopté. Une image, c'est un média de type JPEG, PNG, WebP, GIF ou AVIF : tout autre type (PDF, vidéo, SVG) est refusé, brouillon compris. Un média de la galerie n'a pas de propriétaire : la photo d'une maquilleuse y est refusée, brouillon compris (§8). |
| `seo_title` | `string`, 70 caractères au plus, requis | `articles.seo_title` (`text`, 70 au plus) | Repris tel quel. |
| `seo_description` | `string`, 155 caractères au plus, requis | `articles.seo_description` (`textarea`, 155 au plus) | Repris tel quel. |
| `slug` | `string`, requis | `articles.slug` (`text`, unique, requis pour publier) | Repris tel quel : l'adresse `/blog/<slug>` est conservée. Strapi n'impose pas l'unicité : un doublon est listé (règle 5). Comme pour les talents, un slug qui n'a pas déjà la forme d'une adresse est refusé, puis listé (règle 5) ; les 10 slugs du 13/10/2026 l'ont. |
| `excerpt` | `text` | `articles.excerpt` (`textarea`) | Repris tel quel. |

### 5.4 Talent : `api::talent.talent` → `talents`

Table `talents`, 14 lignes, toutes publiées. Brouillons possibles dans Strapi. Les champs gardent leur nom de Strapi.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `title` | `string` | `talents.title` (`text`, requis pour publier) | Repris tel quel. |
| `seo_title` | `string` | `talents.seo_title` (`text`) | Repris tel quel. |
| `description` | `text` | `talents.description` (`textarea`) | Repris tel quel. |
| `seo_description` | `text` | `talents.seo_description` (`textarea`) | Repris tel quel. |
| `content` | `richtext` | `talents.content` (`code`, markdown) | Repris tel quel, à l'octet près. Même raison que pour les articles. |
| `slug` | `string` | `talents.slug` (`text`, unique, requis pour publier) | Repris tel quel : les 14 adresses `/talent/<slug>` sont conservées. Un doublon, ou un slug qui n'a pas déjà la forme d'une adresse (celle que donne `src/lib/slug.ts` : minuscules sans accent, mots séparés par un tiret), est refusé, puis listé (règle 5). |

Un champ de plus, qui n'existe pas dans Strapi (ticket 108) : `talents.pageTitle` (`text`, optionnel). C'est le titre de la page (l'onglet et les résultats de recherche), écrit par la rédaction : de 50 à 60 caractères, et différent de `seo_title`, qui reste le titre affiché en haut de la page. Il est vide à l'import et l'import ne l'écrit jamais ; vide, la page garde le titre du site actuel (`talents.title` suivi du nom du site).

## 6. Composants (7)

Chaque composant répétable devient un champ `array` du profil. L'identifiant d'une ligne de composant n'est pas repris (§7).

### 6.1 Compétence : `makeupartists.skills` → `profiles.skills`

Table `components_makeupartists_skills`, 200 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string`, 70 caractères au plus | `profiles.skills.name` (`text`) | Repris tel quel. |
| `description` | `text`, 2 000 caractères au plus | `profiles.skills.description` (`textarea`) | Repris tel quel. |

### 6.2 Expérience : `makeupartists.experiences` → `profiles.experiences`

Table `components_makeupartists_experiences`, 57 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `company` | `string`, 70 caractères au plus | `profiles.experiences.company` (`text`) | Repris tel quel. |
| `job_name` | `string`, 70 caractères au plus | `profiles.experiences.jobTitle` (`text`) | Repris tel quel. |
| `city` | `string`, 70 caractères au plus | `profiles.experiences.city` (`text`) | Repris tel quel. C'est la ville d'un ancien poste, en texte libre : elle ne passe pas par le référentiel des communes. |
| `date_start` | `date` | `profiles.experiences.startDate` (`date`) | Repris tel quel : une date sans heure, qui reste au même jour quel que soit le fuseau. |
| `date_end` | `date` | `profiles.experiences.endDate` (`date`) | Même règle. Une fin antérieure au début est listée (règle 5), pas corrigée : le serveur refuserait le profil entier, donc la ligne est laissée de côté et listée par profil et par rang, le reste du profil est repris (ticket 226, §11). |
| `description` | `text`, 2 000 caractères au plus | `profiles.experiences.description` (`textarea`) | Repris tel quel. |

### 6.3 Formation : `makeupartists.courses` → `profiles.courses`

Table `components_makeupartists_courses`, 47 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `diploma` | `string`, 70 caractères au plus | `profiles.courses.diploma` (`text`) | Repris tel quel. |
| `school` | `string`, 70 caractères au plus | `profiles.courses.school` (`text`) | Repris tel quel. |
| `date_graduation` | `date` | `profiles.courses.graduatedAt` (`date`) | Repris tel quel : une date sans heure, qui reste au même jour. Le serveur refuse une date de plus d'un an après le jour de l'enregistrement : cette ligne est laissée de côté et listée par profil et par rang, le reste du profil est repris (ticket 226, §11). |
| `course_description` | `text`, 2 000 caractères au plus | `profiles.courses.description` (`textarea`) | Repris tel quel. |

### 6.4 Langue : `makeupartists.language` → `profiles.languages`

Table `components_makeupartists_languages`, 65 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string`, 70 caractères au plus | `profiles.languages.name` (`text`) | Repris tel quel. |

### 6.5 Réseaux et coordonnées : `makeupartists.network` → `profiles.networks` et `profiles.contactDetails`

Table `components_makeupartists_networks`, 101 lignes. Composant simple : une ligne par profil au plus.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `youtube` | `string`, 200 caractères au plus | `profiles.networks.youtube` (`text`) | Repris tel quel. |
| `facebook` | `string`, 200 caractères au plus | `profiles.networks.facebook` (`text`) | Repris tel quel. |
| `instagram` | `string`, 200 caractères au plus | `profiles.networks.instagram` (`text`) | Repris tel quel. |
| `website` | `string`, 200 caractères au plus | `profiles.networks.website` (`text`) | Repris tel quel. |
| `linkedin` | `string`, 200 caractères au plus | `profiles.networks.linkedin` (`text`) | Repris tel quel. |
| `phone` | `string`, 20 caractères au plus | `profiles.contactDetails.phone` (`text`, fermé au public) | Repris tel quel. Jamais écrit dans un rapport. S'il est rempli, `contactPublic` passe à vrai (§9). |
| `email` | `string`, 200 caractères au plus | `profiles.contactDetails.email` (`email`, fermé au public) | Repris tel quel. C'est l'email de contact du profil, pas celui du compte. Jamais écrit dans un rapport. S'il est rempli, `contactPublic` passe à vrai (§9). |

Un lien de `profiles.networks` qui nomme un protocole autre que `http` ou `https` (`javascript:`, `data:`…) est refusé à toute écriture, import compris : la page publique en fait un lien (registre des changements voulus, `liens-reseaux-web`). Un lien sans protocole, comme `@pseudo`, est repris tel quel.

### 6.6 Prestation : `makeupartists.service-offers` → `profiles.serviceOffers`

Table `components_makeupartists_service_offers`, 118 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string`, 70 caractères au plus | `profiles.serviceOffers.name` (`text`) | Repris tel quel. |
| `description` | `text` | `profiles.serviceOffers.description` (`textarea`, 2 000 caractères au plus) | Repris tel quel. Strapi ne borne pas ce texte, le serveur de la v3 le borne à 2 000 : une prestation plus longue est laissée de côté avec ses options et listée par profil et par rang, le reste du profil est repris (ticket 226, §11). |
| `options` | `component` répétable `service-offers.options` | `profiles.serviceOffers.options` (`array` imbriqué) | Lignes du §6.7, dans l'ordre de `components_makeupartists_service_offers_components`. |
| `price` | `text`, 70 caractères au plus | `profiles.serviceOffers.priceText` (`text`) et `profiles.serviceOffers.priceFrom` (`number`) | `priceText` : repris tel quel, à l'octet près. `priceFrom` : transformé (plan `01` §6.2, ticket 062), le nombre lu par la règle de prix unique (`src/lib/price.ts`, ticket 032), nul quand le texte n'a pas de nombre lisible. |

### 6.7 Option d'une prestation : `service-offers.options` → `profiles.serviceOffers.options`

Table `components_service_offers_options`, 23 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string` | `profiles.serviceOffers.options.name` (`text`, 70 caractères au plus) | Repris tel quel. Strapi ne borne pas ce nom, le serveur de la v3 le borne à 70 : une option plus longue est laissée de côté et listée par profil, par rang de sa prestation et par son rang, le reste du profil est repris (ticket 226, §11). |
| `description` | `text`, 2 000 caractères au plus | `profiles.serviceOffers.options.description` (`textarea`) | Repris tel quel. |
| `price` | `text`, 70 caractères au plus | `profiles.serviceOffers.options.priceText` (`text`) et `profiles.serviceOffers.options.priceFrom` (`number`) | Même règle que le prix d'une prestation (§6.6). |

## 7. Colonnes système et tables de liens

Ces colonnes ne sont pas des attributs des schémas : Strapi les ajoute à chaque table.

| Colonne Strapi | Tables | Champ Payload | Règle |
|---|---|---|---|
| `id` | `up_users`, `makeup_artistes`, `articles`, `talents`, `files` | `strapiId` (`number`, unique) | Règle 1. |
| `id` | Les 7 tables de composants | — | Abandonné : une ligne de liste reçoit l'identifiant que Payload lui donne. L'ordre vient de la table de liens, et le contrôle de parité compare les lignes par profil et par position. |
| `created_at` | Les 4 types, `files` | `createdAt` | Règle 3 : fourni à la création. |
| `updated_at` | Les 4 types, `files` | `updatedAt` | Règle 3 : fourni à la création. Un second passage qui n'écrit rien le laisse intact. |
| `published_at` | `articles`, `talents` | `_status` et `publishedAt` (`date`) | Nul : brouillon (`_status` à `draft`). Sinon : publié (`_status` à `published`), date reprise telle quelle. Les profils n'ont pas de brouillon dans Strapi : leur `statut` est calculé (§9). |
| `created_by_id`, `updated_by_id` | Les 4 types, `files` | — | Abandonné : désigne un compte d'administration de Strapi, non repris (§4.2). |

Les dates de Strapi sont des `timestamp without time zone`. Elles sont lues comme l'ancienne API les rend, en UTC ; le contrôle de parité les compare à celles de l'API publique.

| Table de liens | Lignes au 13/10/2026 | Colonnes | Sert à |
|---|---|---|---|
| `makeup_artistes_user_links` | 88 | `id`, `makeup_artiste_id`, `user_id` | `profiles.pro` |
| `makeup_artistes_components` | 585 | `id`, `entity_id`, `component_id`, `component_type`, `field`, `order` | Rattacher chaque ligne de composant (`component_id`, dans la table du composant que nomme `component_type`) à son profil (`entity_id`) et à son champ (`field`), dans l'ordre (`order`) |
| `components_makeupartists_service_offers_components` | 23 | `id`, `entity_id`, `component_id`, `component_type`, `field`, `order` | Rattacher chaque option (`component_id`) à sa prestation (`entity_id`), dans l'ordre (`order`) |
| `files_related_morphs` | 256 | `id`, `file_id`, `related_id`, `related_type`, `field`, `order` | `profiles.mainPicture`, `profiles.gallery`, `articles.gallery`, dans l'ordre (`order`) : le fichier `file_id` est désigné par l'entrée `related_id` du type `related_type`, dans son champ `field` ; 7 lignes visent une entrée disparue et sont ignorées |
| `up_users_role_links` | 91 | `id`, `user_id`, `role_id`, `user_order` | Non reprise (§5.1, `role`) |
| `files_folder_links` | 574 | `id`, `file_id`, `folder_id`, `file_order` | Non reprise (§8, `folder_path`) |

Les colonnes sont celles de l'instantané du 13/10/2026 : des noms, jamais une valeur.

L'import part des liens, pas des tables de composants. Les 6 composants de premier niveau comptent 588 lignes pour 585 liens : une ligne de composant sans lien n'appartient à aucun profil et n'est pas reprise ; un lien sans ligne est signalé.

## 8. Fichiers : `plugin::upload.file` → `media`

Table `files`, 574 lignes, 21 colonnes. Ce type appartient au greffon d'envoi de fichiers de Strapi : il ne fait pas partie des 4 types de contenu du §5, mais le plan `01` §6.1 le reprend. Seuls les fichiers du §4.3 sont adoptés.

**Un fichier adopté n'est ni copié, ni déplacé, ni renommé** : son adresse publique reste la même, caractère pour caractère (ticket 058).

| Colonne Strapi | Type | Champ Payload | Règle |
|---|---|---|---|
| `id` | `integer` | `media.strapiId` (`number`, unique) | Règle 1. |
| `name` | `character varying` | — | Abandonné : nom du fichier sur l'appareil de la personne qui l'a envoyé. Il n'est affiché nulle part au public et peut porter un nom de personne. La clé de l'objet suffit. |
| `alternative_text` | `character varying` | `media.alt` (`text`) | Repris tel quel ; nul reste nul. |
| `caption` | `character varying` | — | Abandonné : jamais affiché par l'ancien site. |
| `width`, `height` | `integer` | `media.width`, `media.height` (champs d'envoi de Payload) | Repris tels quels. |
| `formats` | `jsonb` | `media.strapiFormats` (`json`, archive) | Repris tel quel. Les vignettes de Strapi restent où elles sont et ne deviennent pas des `media`. |
| `hash`, `ext` | `character varying` | `media.filename` (champ d'envoi de Payload) | Le nom de l'objet dans le stockage, lu à la fin de `url`. Il doit être égal à `hash` suivi de `ext` : sinon le fichier est signalé. |
| `mime` | `character varying` | `media.mimeType` (champ d'envoi de Payload) | Repris tel quel. Un fichier qui n'est pas une image est signalé, non adopté. |
| `size` | `numeric`, en kilo-octets | `media.filesize` (champ d'envoi de Payload, en octets) | Transformé : la taille en octets est celle de l'objet lue dans le stockage, pas la valeur arrondie de Strapi. |
| `url` | `character varying` | `media.prefix` et `media.filename` | Le dossier de l'objet est lu dans l'adresse de chaque fichier : 134 fichiers sont à la racine du stockage, 440 sous un préfixe. L'adresse que Payload recompose doit être égale à `url`. |
| `preview_url` | `character varying` | — | Abandonné : ne sert qu'aux vidéos, qui ne sont pas adoptées. |
| `provider` | `character varying` | — | Abandonné : nom du greffon de stockage de Strapi (`minio-for-strapi-v4` 134, `strapi-provider-cloudflare-r2` 440). Tous les objets sont aujourd'hui dans le même stockage. |
| `provider_metadata` | `jsonb` | — | Abandonné : réglage du greffon de stockage de Strapi. |
| `folder_path` | `character varying` | — | Abandonné : dossier de la médiathèque de l'admin de Strapi (1 seul dossier). |
| `created_at`, `updated_at` | `timestamp without time zone` | `media.createdAt`, `media.updatedAt` | Règle 3. |
| `created_by_id`, `updated_by_id` | `integer` | — | Abandonné (§4.2). |
| `uploaded_by` | `integer` | `media.owner` (`relationship` vers `pros`) | Le propriétaire est le compte du profil qui désigne le fichier. `uploaded_by` (le compte qui a envoyé le fichier, nul pour les envois anciens) sert de contrôle : s'il est rempli et désigne un autre compte, le fichier est signalé. Un fichier d'article n'a pas de propriétaire. |

Les nouveaux fichiers, envoyés dans la v3, suivent d'autres règles (préfixe `media/`, nom imprévisible, jpeg, png ou webp, 10 Mo au plus) : elles sont écrites par le ticket 043, pas ici.

Règles du ticket 043, pour tout `media` :

- **Chaque document porte le préfixe de son objet** (`media.prefix`, vide à la racine du stockage) et son nom de fichier (`media.filename`, unique dans la collection). La clé de l'objet est le préfixe, puis le nom ; l'adresse publique est la base des photos (`R2_PUBLIC_URL`), puis cette clé (`src/lib/media.ts`). Une photo envoyée dans la v3 est rangée sous `media/` ; une photo adoptée garde le préfixe lu dans son adresse, à la racine ou non.
- **Le serveur seul écrit où est l'objet** : ce qu'une requête dit du nom, du préfixe, de l'adresse, du type ou de la taille est ignoré. L'import adopte un fichier sans le copier par l'API locale, sans compte, avec le contexte `skipCloudStorage` du greffon de stockage, qui ne touche alors ni au préfixe ni au stockage.
- **`media.owner`** est posé par le serveur : la maquilleuse qui envoie la photo, quel que soit le propriétaire que dit sa requête. Seul un admin le change. Il n'est pas lu par le public.
- **Un profil n'accepte que des photos de son compte** : `profiles.mainPicture` et `profiles.gallery` (10 photos au plus, dans l'ordre) ne désignent que des médias dont `owner` est le compte du profil. Une photo que le profil a déjà reste, comme sur l'ancienne API, qui ne vérifie que les fichiers nouveaux.
- **Un article n'accepte que des images de la rédaction** (ticket 046) : `articles.gallery` ne désigne que des médias sans `owner`, de type JPEG, PNG, WebP, GIF ou AVIF. La règle vaut pour la rédaction, pour un admin et pour l'import, brouillon compris, et pour chaque photo de la galerie à chaque enregistrement. Un article publié n'ouvre au public que ses photos sans propriétaire : une photo qu'un admin donne ensuite à une maquilleuse suit les règles des photos de son compte.
- Les types, la taille, le nom imprévisible et les tailles dérivées d'une photo envoyée sont ceux du ticket 133 ; la corbeille d'une photo qui ne sert plus, ceux du ticket 045.

Règles du ticket 133, pour tout fichier envoyé à `media` (par une maquilleuse, la rédaction ou un admin ; l'import n'envoie aucun fichier) :

- **Une vraie photo seulement** : JPEG, PNG ou WebP, reconnu à ses premiers octets, jamais au type ni au nom que l'expéditeur annonce (`src/lib/photo-upload.ts`, repris de l'ancienne API). 10 Mo au plus (10 × 1024 × 1024 octets). Tout le reste (PDF, SVG, HEIC, AVIF, GIF, vidéo) est refusé en 400, avec les messages de l'ancien site, avant que Payload lise le fichier : aucun objet n'est écrit, aucun document créé. Le remplacement du fichier d'un média suit la même règle.
- **Un nom imprévisible** : l'objet est rangé sous `media/<uuid>.<ext>`, l'extension venant du vrai type. Le nom d'origine n'apparaît ni dans la clé, ni dans l'adresse publique, ni dans le document.
- **Des tailles dérivées** (`media.sizes`, quatre tailles comme l'ancien site : `thumbnail` 245, `small` 500, `medium` 750, `large` 1000 pixels de large), faites par `sharp` et rangées à côté de l'original, sous le même préfixe. Payload ne fabrique que les tailles que la photo est assez large pour porter. La corbeille déplace l'original et chaque taille (ticket 045). Migration `20261014_173900_sizes_des_medias` : des colonnes ajoutées à `media`, rien d'autre.
- **Les photos d'un profil** : `profiles.mainPicture` et `profiles.gallery` refusent, avant toute lecture de la base, une entrée qui ne nomme aucun identifiant, un identifiant qu'aucun média ne peut avoir et une liste donnée à la photo principale, avec le message « Choisis à nouveau ta photo… » sur le champ (400, jamais 500).

Règles du ticket 045, pour tout `media` :

- **Une photo qui ne sert plus part à la corbeille, jamais à la suppression directe.** Son objet et chacune de ses tailles dérivées passent sous `deleted/`, à la même clé derrière : `media/photo.webp` devient `deleted/media/photo.webp`. L'application n'efface jamais un objet. Une règle du stockage efface la corbeille au bout de 30 jours (ticket 205) ; d'ici là, un objet se remet en place. Les vignettes de l'ancien site, décrites dans `media.strapiFormats`, ne bougent pas : le contrôle des médias les compte (tickets 197 et 205).
- **Une photo ne sert plus** quand son média est supprimé (par sa propriétaire, un admin ou la rédaction), quand son fichier est remplacé, quand un enregistrement la retire d'un profil (photo principale remplacée, photo retirée de la galerie), ou quand son profil est supprimé. Dans ces deux derniers cas, le serveur supprime lui-même le média, si plus rien ne le désigne : ni un profil, ni un article, ni une version d'article. Un profil supprimé emporte aussi les photos de son compte que rien ne désigne. Une photo encore désignée reste où elle est.
- **Si le stockage tombe pendant un déplacement**, ce qui avait déjà bougé est remis en place, une fois, et la requête échoue (503) sans rien changer : documents et objets restent comme avant.
- **`media` et `profils` se suppriment et se modifient un par un**, par leur identifiant. Une opération sur plusieurs documents à la fois (un filtre `where`) est refusée (403) avant toute écriture, par toutes les API et pour tous les rôles, l'API locale sans contrôle d'accès comprise : Payload enregistre une telle opération même quand l'un de ses documents échoue. La liste de l'administration n'offre plus ces actions sur ces deux collections (`disableBulkDelete`, `disableBulkEdit`). Un code serveur qui supprime plusieurs profils ou plusieurs photos les supprime un par un, sous `heldTrash` (`src/collections/trash.ts`).
- **Sans stockage d'objets**, le ménage d'un profil ne supprime aucun média : son objet ne pourrait pas bouger.
- **Sous le contexte d'import** (`IMPORT_CONTEXT`), rien de tout cela : aucun média n'est supprimé par ce ménage, aucun objet ne bouge.

## 9. Champs de Payload sans source dans Strapi

Pour mémoire : ces champs n'ont aucune ligne aux §5 et §6. Leur valeur à l'import est fixée ici quand le plan la donne.

| Champ Payload | Valeur à l'import | Défini par |
|---|---|---|
| `profiles.publicContact`, `profiles.consentedAt` et la source du consentement, `profiles.consentSource` | Téléphone ou email de contact rempli à la source : `publicContact` vrai, `consentedAt` à la date de bascule (paramètre du passage), source « publié par la maquilleuse » (valeur `import` de `profiles.consentSource`). Sinon : faux, sans date. Dans la v3, le serveur pose lui-même la date et la source quand `publicContact` devient vrai (`artist` ou `admin`, selon le compte qui enregistre) et les vide quand il redevient faux ; aucune API ne les écrit. Une écriture du serveur sans compte, l'import, garde la date et la source qu'elle donne. | Plan `01` §6.2 ; tickets 042 et 064 |
| `profiles.status` | Profil entièrement vide (aucune des six conditions du profil publiable) : brouillon. Sinon : publié. Les trois valeurs sont `draft`, `published` et `hidden` ; un profil créé dans la v3 commence en brouillon (ticket 021). Aucune API ne l'écrit, pas même un admin : à chaque enregistrement, le serveur le calcule depuis `profiles.chosenStatus`, et, tant que celui-ci vaut `automatic`, pose brouillon ou publié par cette règle ; `hidden` ne vient jamais de la règle. Le code serveur qui l'écrit lui-même, règles d'accès levées, en fait le choix de l'admin. L'import ne l'écrit pas : il le laisse à la règle. | Décision du 13/10 ; tickets 021, 044 et 059 |
| `profiles.chosenStatus` | `automatic` (la règle, la valeur d'un profil neuf), `draft`, `published` ou `hidden` : le statut que choisit un admin, gardé quoi qu'on enregistre. Seul un choix différent de celui qui est enregistré le change : un formulaire chargé avant le dernier enregistrement de la maquilleuse, qui renvoie le choix qu'il a lu, ne fixe rien. Écrit par un admin seulement, lu par l'admin et la propriétaire. L'import ne l'écrit que pour un profil à garder en brouillon ou masqué | Ticket 044 |
| `profiles.completeness` (score sur 13), `profiles.active`, `profiles.publishable`, `profiles.fullyEmpty`, et la date à laquelle chacun des trois drapeaux a pris sa valeur : `profiles.activeSince`, `profiles.publishableSince`, `profiles.fullyEmptySince` | Calculés par le serveur à chaque enregistrement, l'import compris, par la règle unique (`src/lib/profile/completeness.ts`), jamais lus dans Strapi ni écrits par une API. À l'import, les dates sont celles de l'import : Strapi ne les connaît pas | Tickets 031 et 044 |
| `profiles.derniereActivite` | Pas encore créé : le ticket 044 ne le porte pas, et le plan `04` §3.6 met la dernière activité sur le compte (`pros.derniereActivite`, P5) | Plan `01` §6.1 ; plan `04` §3.6 |
| `profiles.reason`, `profiles.verified`, `profiles.siret`, `profiles.verifiedAt`, `profiles.internalNote` | Non renseignés. Écrits par un admin seulement ; la note interne n'est lue que par un admin, les autres par l'admin et la propriétaire, jamais par le public | Ticket 021 |
| `profiles.homeService` | Non renseigné : Strapi ne le sait pas | Ticket 041 |
| `media.prefix`, `media.filename`, `media.owner`, `media.strapiFormats` | §8 | Tickets 043 et 058 |
| `admins` (toute la collection) | Rien d'importé (§4.2) | Ticket 018 |
| `contact-requests`, `auth-events` | Nouvelles collections, vides à la bascule | Plan `01` §6.1 |
| `contact-requests` (toute la collection) | Les messages du formulaire de contact (tickets 158 et 159), vide à la bascule, réservée au type `contact` : `type`, `status` (`new`, `forwarded`, `answered`, `spam`), `mailStatus` (`pending`, `sent`, `failed`), `firstName`, `lastName`, `email`, `phone` et `message` (100, 100, 254, 30 et 5 000 caractères au plus, comme le site en ligne), et les dates de Payload. Lue par un admin seulement, jamais créée ni supprimée par une API : le serveur l'écrit avant d'envoyer le mail, et un mail qui échoue marque `failed` sans perdre le message. Un admin ne change que le `status` (cycle `new` → `forwarded` → `answered`, et `spam` depuis chacun ; le retour de `answered` à `forwarded` est refusé) ; tous les autres champs sont figés, et le bouton « Renvoyer l'email » (`POST /api/contact-requests/:id/resend`, admin seulement) ne renvoie qu'un message en `failed`, une seule fois par clic. `conclue`, `perdue` et la demande à une maquilleuse viennent avec leur ticket | Tickets 158 et 159 ; plan `01` §5 P8 |
| `deleted-accounts` (toute la collection) | Les comptes de l'ancien site supprimés dans la v3, vide à la bascule. Une ligne par compte supprimé qui avait un identifiant de l'ancien site (`strapiId`, unique) et le jour de la suppression : aucun email, aucun nom, aucun jeton. Écrite par le serveur dans la transaction de la suppression (`src/lib/account/deletion.ts`), jamais purgée, lue par un admin seulement et par l'import, qui ne ramène jamais un compte qui y figure (`docs/migration/IMPORT.md`, « Jusqu'à la bascule seulement ») | Ticket 227 |
| `auth-events` (toute la collection) | Le journal d'authentification, vide à la bascule. Une ligne par connexion (réussie ou refusée), déconnexion, inscription, confirmation d'email, demande de lien de mot de passe oublié et choix d'un nouveau mot de passe : `type` (`sign-in`, `sign-out`, `sign-out-everywhere`, `sign-up`, `confirmation`, `resend`, `forgot-password`, `password-reset`, `block`, `unblock`), `code` et `method` (`password` ou `google`, vide sur les lignes d'avant la connexion Google) pris dans des listes fermées (`src/lib/auth/auth-log.ts` ; le code `heritee` dit une connexion par l'ancien mot de passe, ticket 087), `durationMs` et `date`. Aucun champ de texte : ni IP, ni email, ni nom, ni jeton n'y entrent. Lue par un admin seulement, jamais écrite par une API : le serveur l'écrit, et une tâche quotidienne supprime les lignes de plus de 90 jours | Ticket 077 ; plan `01` §2.3 |
| `pros.lastSignInAt` | La date de la dernière connexion, écrite par le serveur à chaque connexion ; lue par la propriétaire et un admin, écrite par aucune requête. Ce n'est pas `pros.derniereActivite` du plan `04` §3.6 (une écriture par 24 h au plus, à chaque visite de l'espace), qui reste à créer | Ticket 077 |
| `pros.profile` | Champ de jointure vers `profiles.pro`, sans colonne ni valeur stockée : il dit à la liste des comptes de l'administration si un profil existe. Lu par un admin seulement ; aucune requête ne l'écrit. Le panneau ne filtre pas dessus (« sans profil » passe par les propriétaires de profils) | Ticket 168 |

## 10. Contrôle du nombre de lignes

| Type ou composant | Table Strapi | Attributs | Repris | Abandonnés |
|---|---|---|---|---|
| `plugin::users-permissions.user` | `up_users` | 10 | 7 | 3 |
| `api::makeup-artiste.makeup-artiste` | `makeup_artistes` | 20 | 20 | 0 |
| `api::article.article` | `articles` | 8 | 8 | 0 |
| `api::talent.talent` | `talents` | 6 | 6 | 0 |
| `makeupartists.skills` | `components_makeupartists_skills` | 2 | 2 | 0 |
| `makeupartists.experiences` | `components_makeupartists_experiences` | 6 | 6 | 0 |
| `makeupartists.courses` | `components_makeupartists_courses` | 4 | 4 | 0 |
| `makeupartists.language` | `components_makeupartists_languages` | 1 | 1 | 0 |
| `makeupartists.network` | `components_makeupartists_networks` | 7 | 7 | 0 |
| `makeupartists.service-offers` | `components_makeupartists_service_offers` | 4 | 4 | 0 |
| `service-offers.options` | `components_service_offers_options` | 3 | 3 | 0 |

Total : **71 attributs**, 44 dans les 4 types de contenu et 27 dans les 7 composants ; 68 repris, 3 abandonnés.

Le test `tests/unit/frozen-schema-doc.test.ts` relit ce document et échoue si :

- un attribut de Strapi n'a pas sa ligne, en a deux, ou n'est pas à sa place ;
- une ligne n'a ni champ cible, ni abandon motivé ;
- un nombre du tableau ci-dessus ne correspond pas aux tableaux des §5 et §6 ;
- la liste des 13 profils écartés ou les décomptes du 13/10/2026 changent ;
- une règle « Transformé » n'est ni au registre des changements voulus, ni l'une des deux exceptions du §1 ;
- les colonnes d'une table de liens du §7 changent ;
- ce que le document dit de Payload (règle 1, `pros._verified`) n'est plus vrai sur la version installée ;
- le document contient un hash, une adresse email ou un numéro de téléphone.

```sh
bun --no-env-file test tests/unit/frozen-schema-doc.test.ts
```

L'inventaire des attributs est figé dans le test. Pour le recomparer aux vrais fichiers de schéma, tant que le dépôt de l'ancienne API existe :

```sh
STRAPI_API_DIR=../api-my-makeup bun --no-env-file test tests/unit/frozen-schema-doc.test.ts
```

## 11. Points en attente

Chaque point a un défaut, écrit dans ce document. Sans décision contraire, c'est le défaut qui s'applique.

| Point | Défaut pris ici | Qui tranche |
|---|---|---|
| Badge « Super maquilleuse » (`pro`, 1 profil) : repris ou abandonné ? | Repris dans `profiles.superArtist`, pour ne rien perdre et garder la parité de la recherche | Question ouverte 14 des tickets de la v3 |
| Email porté par 4 comptes | L'import s'arrête sans table de décision | Tickets 025 et 066 ; question ouverte 3 |
| Profil dont le compte est écarté par cette table de décision | L'import s'arrête et liste le profil par identifiant | Ticket 066 |
| Profil sans compte, hors de la liste du §4.1 | L'import s'arrête et liste le profil par identifiant ; une décision par profil l'écarte | Tickets 059 et 066 |
| Texte de ville qui n'est pas une commune | Zone vide, profil à revoir, dans la liste de revue privée de l'import ; une ligne `communes` de sa table de décision le tranche | Tickets 063 et 066 ; question ouverte 13 |
| Rayon au-dessus de 200 km | Champ laissé vide, profil repris, profil et valeur listés (registre `rayon-200-km`), jamais ramené à 200 | Ticket 066 |
| Ligne d'une liste hors d'une borne de la v3 : fin d'expérience avant son début, formation datée de plus d'un an après le jour, nom d'option de plus de 70 caractères, description de prestation de plus de 2 000 | La ligne est laissée de côté (une prestation emporte ses options), listée par profil, liste et rang, jamais par son texte ; le reste du profil est repris. Écrire la ligne ferait refuser le profil entier | Ticket 066 |
| Galerie de plus de 10 photos, autre valeur plus longue que la limite cible | Comptés et listés, jamais tronqués | Ticket 066 |
| Fichier référencé qui n'est pas une image, objet manquant | Pas une image : signalé, non adopté. Objet manquant : adopté sans taille, listé en « 404 connus ». Adresse que la v3 ne redonne pas à l'identique, ou fichier désigné par les entrées de plusieurs comptes : refusé, listé | Ticket 066 |
| Lignes en double dans les listes | Gardées telles quelles, par parité | Question ouverte 15 |

Noms fixés par ce document, parce que le plan ne les donnait pas : `profiles.legacyUsername`, `profiles.superArtist`, `profiles.mainPicture`, `profiles.gallery`, `articles.gallery`, les sous-champs de `profiles.city`, de `profiles.networks` et de `profiles.contactDetails`, les champs des listes du §6, `publishedAt`, `profiles.consentSource` (ticket 042), `profiles.fullyEmpty`, `profiles.activeSince`, `profiles.publishableSince`, `profiles.fullyEmptySince` et `profiles.chosenStatus` (ticket 044).

## 12. Journal des changements

| Date | Changement |
|---|---|
| 14/10/2026 | Gel initial (ticket 015) : 71 attributs, schémas de Strapi au commit `ccd449d`, décomptes de l'instantané du 13/10/2026. |
| 14/10/2026 | Suites de la relecture (ticket 220), sans changer un nom de champ ni une règle de reprise : raison de la règle 1 corrigée ; 88 profils et 43 hash attendus « au plus », et défaut pour un profil dont le compte est écarté (§11) ; portée du mot « Transformé » (§1) ; colonnes des tables de liens (§7) et des deux jetons (§5.1) ; condition d'existence de `pros._verified` (§5.1). |
| 14/10/2026 | Ticket 021, sans changer un nom de champ : les valeurs de `profils.statut` (§9) ; `profils.superMaquilleuse` (§5.2) est créé avec les champs réservés à l'admin, et reste lu par le public, comme le badge de la recherche. |
| 14/10/2026 | Ticket 042 : la source du consentement est nommée `profils.sourceConsentement`, de valeurs `maquilleuse`, `admin` et `import` (§9, §11). |
| 14/10/2026 | Ticket 043, sans changer un nom de champ : les règles des médias de la v3 (§8) : préfixe propre à chaque document, adresse publique, propriétaire posé par le serveur, photos d'un profil limitées à son compte. |
| 14/10/2026 | Talents (ticket 022), sans changer un nom de champ : `talents.title` et `talents.slug` sont requis pour publier (un brouillon peut s'en passer) ; un slug qui n'a pas déjà la forme d'une adresse est refusé, pas corrigé (§5.4). |
| 14/10/2026 | Zone du profil (ticket 041), sans changer un nom de champ : règles du serveur sur `profils.commune` ajoutées au §5.2, dont les collectivités d'outre-mer de la liste officielle, le refus d'un nom qui ressemble à une adresse ou qui n'a pas les caractères d'un nom de commune, et des coordonnées gardées à deux décimales. |
| 14/10/2026 | État du profil (ticket 044) : `profils.entierementVide`, les trois dates de passage et `profils.statutChoisi` sont créés ; `profils.statut` devient calculé par le serveur, l'admin choisit par `profils.statutChoisi` ; la règle du statut est écrite au §9 ; `profils.derniereActivite` n'est pas créé, le plan `04` §3.6 le met sur le compte. |
| 14/10/2026 | Articles (ticket 046), sans changer un nom de champ : les règles des talents (`articles.title` et `articles.slug` requis pour publier, slug refusé s'il n'a pas la forme d'une adresse) ; les types d'image de `articles.galerie`, refusés aussi dans un brouillon ; un média de la galerie n'a pas de propriétaire, et la photo d'une maquilleuse y est refusée (§5.3, §8). `author`, `content`, `seo_title` et `seo_description`, requis par Strapi, ne le sont pas dans la v3, comme le tableau le disait déjà : un article importé n'est jamais refusé pour un de ces champs vide. |
| 14/10/2026 | Identité des profils à l'import (ticket 059), sans changer un nom de champ : un profil sans compte hors de la liste du §4.1 arrête l'import, sauf décision par profil (§4.1, §11). |
| 14/10/2026 | Communes à l'import (ticket 063), sans changer un nom de champ : une adresse postale donne sa commune, jamais sa rue (§5.2) ; un texte de ville à revoir se tranche par la table de décision de l'import (§11). |
| 14/10/2026 | Migration `init` (ticket 049), sans changer un nom de champ : le schéma de P3 est figé dans une seule migration, `20261014_134242_init`, qui remplace les douze migrations provisoires ; son instantané est celui de la dernière d'entre elles. Tout changement d'une collection vient désormais avec sa migration, dans le même commit (`CLAUDE.md`, « Schéma »). |
| 14/10/2026 | Photos à l'import (ticket 058), sans changer un nom de champ : une image est un fichier JPEG, PNG, WebP, GIF ou AVIF ; un fichier désigné dont l'objet manque est adopté sans taille et listé en « 404 connus » (§4.3) ; un fichier dont l'adresse n'est pas la base des photos suivie d'une clé que la v3 redonne à l'identique, ou que désignent les entrées de plusieurs comptes, est refusé et attend une décision (§11). Hors de l'import, un média se crée toujours avec son fichier (§8). |
| 14/10/2026 | Coordonnées à l'import (ticket 064), sans changer un nom de champ : une valeur de téléphone ou d'email faite d'espaces est vide ; `contactPublic` vrai dès que l'un des deux est rempli, avec la date de bascule donnée à la commande (`--consent-date`). |
| 15/10/2026 | Talents (ticket 108) : `talents.titreDeLaPage` est créé (§5.4), le titre de la page de 50 à 60 caractères que Bing demande ; les autres champs ne changent pas. |
| 14/10/2026 | Sections des profils à l'import (ticket 060), sans changer un nom de champ : un lien de liste qui ne nomme aucune ligne est signalé, rien n'est inventé à sa place (§7) ; `prixAPartirDe` reste vide jusqu'au ticket 062, le téléphone et l'email de contact jusqu'au ticket 064. |
| 14/10/2026 | Articles à l'import (ticket 061), sans changer un nom de champ : une image de la galerie est rattachée si son fichier est adopté, un autre fichier est signalé (§5.3). |
| 14/10/2026 | Ticket 076, sans changer un nom de champ de l'import : `pros` n'a plus ni `loginAttempts` ni `lockUntil` (`maxLoginAttempts: 0`). Le frein de connexion est par adresse cliente, jamais par compte : des essais faux ne verrouillent pas le compte visé. Migration `pros_sans_verrou_de_compte`. |
| 14/10/2026 | Ticket 094, sans changer un nom de champ de l'import : `admins` n'a plus ni `loginAttempts` ni `lockUntil` (`maxLoginAttempts: 0`), comme `pros` ; le frein de connexion est par adresse. Migration `admins_sans_verrou_de_compte`. |
| 14/10/2026 | Ticket 133, sans changer un nom de champ : les règles d'envoi d'une photo (§8) : types lus dans le contenu, 10 Mo, nom imprévisible, quatre tailles dérivées (`media.sizes`, colonnes ajoutées par la migration `sizes_des_medias`), identifiants de photo vérifiés avant la base. |
| 14/10/2026 | Ticket 077, sans changer un nom de champ de l'import : la collection `auth-evenements` (journal d'authentification, 90 jours) et le champ `pros.derniereConnexion` sont créés (§9). Migration `auth_journal_et_derniere_connexion`. |
| 14/10/2026 | Tickets 090 et 091, sans changer un nom de champ de l'import : `auth-evenements.methode` (`mot-de-passe` ou `google`) et quatre issues de plus (`email-non-verifie`, `compte-refuse`, `annule`, `retour-invalide`) au journal. Migration `google_methode_du_journal`. `pros.legacyProvider` vaut aussi `google` pour un compte créé par la connexion Google. |
| 14/10/2026 | Ticket 082, sans changer un nom de champ ni le schéma : `pros._verificationToken`, une fois le lien de confirmation suivi, ne garde plus le jeton mais la trace de son usage (`utilise:` et un hachage), pour que le même lien dise « déjà confirmé » sans pouvoir servir. `pros.nom` est le nom saisi à l'inscription, libre et non unique ; le slug du profil en est tiré par le serveur (§5.2). |
| 14/10/2026 | Tickets 085 et 086, sans changer un nom de champ : le journal `auth-evenements` accepte deux types de plus, `mot-de-passe-oublie` (une demande de lien) et `reinitialisation` (le choix d'un nouveau mot de passe), par une migration de l'énumération `type`. Le lien d'un mot de passe oublié vit dans les champs que Payload ajoute à `pros` (`resetPasswordToken`, `resetPasswordExpiration`), une heure, et sert une fois : choisir un mot de passe vide les sessions du compte, efface `legacyBcrypt` et le jeton. |
| 14/10/2026 | Ticket 087, sans changer un nom de champ de l'import : la liste des issues de `auth-evenements.code` gagne `heritee` (connexion par l'ancien mot de passe). Migration `auth_evenements_heritee`. |
| 15/10/2026 | Tickets 158 et 159, sans changer un nom de champ de l'import : la collection `demandes` (messages du formulaire de contact) est créée (§9). Migration `contact_demandes`. |
| 15/10/2026 | Ticket 168, sans changer un nom de champ de l'import ni le schéma de la base : `pros.profil`, un champ de jointure vers `profiles.pro` (lu par un admin seulement), montre dans la liste des comptes si un profil existe ; il n'a ni colonne ni migration. `pros._verified` prend l'étiquette « Adresse confirmée ». |
| 16/10/2026 | Ticket 226, sans changer un nom de champ : le rayon d'action est repris (§5.2) ; une ligne de liste hors d'une borne de la v3 est laissée de côté et listée au lieu de faire refuser le profil (§6.2, §6.3, §6.6, §6.7, §11). |
| 16/10/2026 | Ticket 227, sans changer un nom de champ de l'import : la collection `comptes-supprimes` (identifiants de l'ancien site des comptes supprimés dans la v3) est créée (§9), pour qu'un rejeu ne ramène pas un compte supprimé. Migration `comptes_supprimes`. |
| 19/10/2026 | Ticket 249, sans changer un nom de champ ni une colonne : les quinze migrations (`init` et les quatorze qui la suivent ; le ticket en comptait seize) deviennent une seule `init` (l'`init` réécrite, aujourd'hui `20261019_151825_init`), qui produit le même schéma que la chaîne (comparaison de `pg_dump --schema-only`, à l'ordre des colonnes près (quatre tables : `pros`, `talents`, `_talents_v`, `auth_evenements`, dont des colonnes ajoutées plus tard par une migration passaient en dernier)). Les lots 250 à 252 la réécrivent (`docs/tests/banc.md`, « Réécrire la migration `init` et vider une base »). |
| 19/10/2026 | Ticket 250 (noms anglais de la base, `PLAN-ANGLAIS.md` §7) : les collections `profils`, `auth-evenements`, `demandes` et `comptes-supprimes` deviennent `profiles`, `auth-events`, `contact-requests` et `deleted-accounts` (tables `profiles`, `auth_events`, `contact_requests`, `deleted_accounts`) ; `pros.nom`, `pros.bloque`, `pros.derniereConnexion` et `pros.profil` deviennent `pros.name`, `pros.blocked`, `pros.lastSignInAt` et `pros.profile` ; `talents.titreDeLaPage` devient `talents.pageTitle` et `articles.galerie` `articles.gallery` ; `auth-events.methode` et `auth-events.dureeMs` deviennent `method` (`mot-de-passe` → `password`) et `durationMs`, les valeurs de `type` passent en anglais, `code` ne change pas ; `contact-requests` : `statut` → `status` (`nouvelle`, `transmise`, `repondue` → `new`, `forwarded`, `answered`), `etatMail` → `mailStatus` (`en-attente`, `envoye`, `echec` → `pending`, `sent`, `failed`), `prenom`, `nom`, `telephone` → `firstName`, `lastName`, `phone` ; le rôle `redaction` de `admins` devient `editor`. Les libellés de l'administration ne changent pas. `status` et `name` ne heurtent aucun nom réservé de Payload 3.90.2 (`reservedFieldNames` : `salt` et `hash` pour un compte, `file` pour un envoi ; `_status` n'existe que sur les collections à brouillons, `talents` et `articles`, qui n'ont pas de champ `status`). L'adresse d'administration passe de `/admin/collections/profils` à `/admin/collections/profiles`, et le renvoi d'un email de `/api/demandes/:id/resend` à `/api/contact-requests/:id/resend`. Le schéma est réécrit dans `init` (ticket 249). Les champs des profils restent pour les tickets 251 et 252. |
| 19/10/2026 | Ticket 251 (noms anglais des champs simples des profils, `PLAN-ANGLAIS.md` §7) : identité `prenom`, `nom`, `nomArtiste`, `specialite`, `disponible`, `aDomicile` → `firstName`, `lastName`, `artistName`, `specialty`, `available`, `homeService` ; lieu `commune` (`nom`, `codeInsee`, `departement`) → `city` (`name`, `inseeCode`, `department`), `radiusKm` → `radiusKm` ; contact `reseaux` (`siteWeb`) → `networks` (`website`), `coordonnees` (`telephone`) → `contactDetails` (`phone`), `contactPublic` → `publicContact`, `consentiLe` → `consentedAt`, `sourceConsentement` → `consentSource` (valeur `maquilleuse` → `artist`) ; photos `photoPrincipale`, `galerie` → `mainPicture`, `gallery` ; état `statut` → `status` (`brouillon`, `publie`, `masque` → `draft`, `published`, `hidden`), `statutChoisi` → `chosenStatus` (`automatique` → `automatic`), `completude`, `actif`, `publiable`, `entierementVide`, leurs dates et `superMaquilleuse` → `completeness`, `active`, `publishable`, `fullyEmpty`, `activeSince`, `publishableSince`, `fullyEmptySince`, `superArtist` ; vérification `motif`, `verifie`, `verifieLe`, `noteInterne` → `reason`, `verified`, `verifiedAt`, `internalNote`. Les listes (`prestations`, `competences`, `langues`, `formations`, `experiences`) restent pour le ticket 252. Les noms de la base Strapi lus par l'import ne changent pas ; les clés JSON de `/api/stats/weekly` non plus (ticket 253). Les libellés de l'administration ne changent pas. Le schéma est réécrit dans `init` (ticket 249). |
| 19/10/2026 | Ticket 252 (noms anglais des listes des profils, `PLAN-ANGLAIS.md` §7) : `prestations` → `serviceOffers` (`nom`, `prixTexte`, `prixAPartirDe` → `name`, `priceText`, `priceFrom`, et pour ses `options` aussi), `competences` → `skills` et `langues` → `languages` (`nom` → `name`), `formations` → `courses` (`diplome`, `ecole`, `obtenuLe` → `diploma`, `school`, `graduatedAt`), `experiences` (`entreprise`, `poste`, `ville`, `debut`, `fin` → `company`, `jobTitle`, `city`, `startDate`, `endDate`). Les tables suivent : `profiles_service_offers`, `profiles_service_offers_options`, `profiles_skills`, `profiles_languages`, `profiles_courses` (colonnes `name`, `price_text`, `price_from`, `diploma`, `school`, `graduated_at`, `company`, `job_title`, `city`, `start_date`, `end_date`). Les noms de la base Strapi lus par l'import ne changent pas, les libellés de l'administration non plus. Le schéma est réécrit dans `init` (ticket 249). |
| 20/10/2026 | Zone hors de France (tickets 258 et 259), sans changer un nom de champ : `profiles.zoneKind`, `profiles.countries`, `profiles.town`, `profiles.city.postalCodes` et `profiles.zoneReview` sont créés (§5.2 bis), par la migration `20261020_215218_zone_countries_postal_codes` (ajouts seulement : deux types énumérés, cinq colonnes de `profiles`, la table `profiles_texts`). |

Note d'intégration (tickets 085 et 086, historique : ces migrations sont regroupées dans `init` depuis le ticket 249) : la migration `20261014_203454_auth_oubli_journal` reconstruit l'énumération `enum_auth_evenements_type` à la descente à partir de la liste des cinq types qui la précèdent. Quand plusieurs lots ajoutent des types au journal, régénérer leurs migrations dans l'ordre de fusion ; une descente dans le désordre échouerait ou ferait perdre des valeurs.
