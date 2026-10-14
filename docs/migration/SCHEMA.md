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
- Tout autre profil sans compte arrête l'import (ticket 059) : la liste ne s'allonge pas toute seule.
- Leurs adresses répondent 404 dans la v3 (ticket 104).
- Si ces profils sont supprimés de Strapi avant la bascule, la liste ne désigne plus rien et reste sans effet.

### 4.2 Les comptes d'administration

Les comptes de l'admin de Strapi (`admin_users`, 2 lignes au 13/10/2026) et leurs tables (`admin_roles`, `admin_permissions` et leurs liens) ne sont **jamais lus par l'import ni migrés**. Les comptes `admins` de Payload sont créés à la main, avec de nouveaux mots de passe : un rôle `admin` et un rôle `redaction` (ticket 018).

Les colonnes `created_by_id` et `updated_by_id` des contenus, qui désignent ces comptes, sont abandonnées (§7).

### 4.3 Les fichiers non référencés

Seul un fichier désigné par un profil ou un article vivant devient un `media` (§8).

| Lignes de `files` au 13/10/2026 | Lignes | Sort |
|---|---|---|
| Désignées par une entrée vivante | 249 | Adoptées sans copie si ce sont des images. 1 n'est pas une image : signalée, non adoptée. 1 a son objet manquant dans le stockage (ligne 127 de `files`) : listée en « 404 connus ». |
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
| `username` | `string`, 3 caractères au moins, unique, requis | `pros.nom` (`text`) | Repris tel quel. Nom d'affichage, non unique dans Payload : 2 noms sont portés chacun par 2 comptes. Le slug du profil vient du `username` du profil (§5.2), pas de celui-ci. |
| `email` | `email`, 6 caractères au moins, requis | `pros.email` (identifiant de connexion, unique) | Transformé : espaces de bord retirés, minuscules. Jamais écrit dans un rapport. Une adresse est portée par 4 comptes : tant que la table de décision n'existe pas, l'import s'arrête (tickets 025 et 066). |
| `provider` | `string` | `pros.legacyProvider` (`text`) | Repris tel quel : `local`, `google` ou `facebook`. |
| `password` | `password`, privé | `pros.legacyBcrypt` (`text`, caché, ni lu ni modifié par l'API) | Seul un hash bcrypt complet est copié, de base à base (règle 4) ; toute autre valeur donne nul. 43 hash attendus au plus : un compte écarté par la table de décision des emails en double (ligne `email`) n'apporte pas le sien. Le mot de passe Payload du compte repris est tiré au hasard. Le hash hérité est effacé à la première connexion réussie (ticket 087). |
| `resetPasswordToken` | `string`, privé | — | Abandonné : jeton à usage unique de Strapi, sans valeur dans Payload. Jamais lu. Une réinitialisation en cours à la bascule est à redemander. |
| `confirmationToken` | `string`, privé | — | Abandonné : jeton à usage unique, et la confirmation d'email est coupée dans Strapi. Jamais lu. |
| `confirmed` | `boolean`, faux par défaut | `pros._verified` (champ d'authentification de Payload) | Vrai pour tout compte repris (plan `01` §2.4, M1). À la source : 91 vrai sur 91. Une ligne qui ne serait pas à vrai est signalée au rapport, par identifiant. Payload 3.90.2 ne crée ce champ que si `auth.verify` est activé sur la collection `pros` : il l'est donc dans le schéma lui-même, en permanence (tickets 019 et 082). Un interrupteur d'environnement qui retirerait `auth.verify` retirerait le champ avec lui. |
| `blocked` | `boolean`, faux par défaut | `pros.bloque` (`checkbox`) | Repris tel quel : 0 vrai, 91 faux. |
| `role` | `relation` plusieurs-à-un vers `plugin::users-permissions.role` | — | Abandonné : dans Payload, le rôle d'une maquilleuse est sa collection. Les rôles et permissions de Strapi ne sont pas repris. |
| `makeup_artiste` | `relation` un-à-un, côté inverse de `user` | `profils.pro` (porté par le profil) | Aucun champ sur `pros` : le lien est repris une seule fois, depuis l'attribut `user` du profil (§5.2). Un compte sans profil reste sans profil (ticket 025). |

Dans la table `up_users`, chaque colonne porte le nom de son attribut, sauf deux : `reset_password_token` (attribut `resetPasswordToken`) et `confirmation_token` (attribut `confirmationToken`). `role` et `makeup_artiste` n'ont pas de colonne : ce sont des tables de liens (§7).

### 5.2 Profil : `api::makeup-artiste.makeup-artiste` → `profils`

Table `makeup_artistes`, 101 lignes, sans brouillon dans Strapi : 88 profils à reprendre au plus (§3), 13 écartés (§4.1).

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `last_name` | `string`, 2 à 70 caractères | `profils.nom` (`text`) | Repris tel quel. |
| `first_name` | `string`, 2 à 70 caractères | `profils.prenom` (`text`) | Repris tel quel. |
| `speciality` | `string`, 70 caractères au plus | `profils.specialite` (`text`) | Repris tel quel. Texte libre. |
| `city` | `string`, 70 caractères au plus, texte libre | `profils.commune` (groupe : `nom`, `codeInsee`, `departement`, `latitude`, `longitude`) | Transformé (plan `01` §6.2, ticket 063) : le texte saisi devient une commune du référentiel officiel. Le texte saisi n'est copié dans aucun champ. Une adresse postale n'est jamais importée. Texte ambigu, ou qui n'est pas une commune : zone vide, profil à revoir (ticket 066). |
| `action_radius` | `integer`, 0 à 2 147 483 647 | `profils.rayonKm` (`number`, 0 à 200) | Repris tel quel de 0 à 200. L'ancien site accepte jusqu'à 1 000 km : une valeur au-dessus de 200 est comptée et listée (règle 5), jamais ramenée à 200 en silence. |
| `score` | `decimal` | `profils.score` (`number`, réservé à l'admin) | Repris tel quel. Jamais dans une lecture publique. Ce n'est pas la complétude, qui est calculée (§9). |
| `available` | `boolean` | `profils.disponible` (`checkbox`) | Transformé (plan `01` §6.2) : vrai et faux repris tels quels, **nul devient vrai** (48 profils). Seule exception à la règle 2. |
| `skills` | `component` répétable `makeupartists.skills` | `profils.competences` (`array`) | Lignes du §6.1, dans l'ordre. |
| `description` | `text`, 2 000 caractères au plus | `profils.description` (`textarea`, 2 000 au plus) | Repris tel quel. |
| `network` | `component` simple `makeupartists.network` | `profils.reseaux` et `profils.coordonnees` (groupes) | Champs du §6.5 : les réseaux d'un côté, le téléphone et l'email de contact de l'autre, fermés au public. |
| `user` | `relation` un-à-un vers `plugin::users-permissions.user` | `profils.pro` (`relationship` vers `pros`, unique, requis) | Lu dans `makeup_artistes_user_links` (88 liens) : le profil est relié au compte de même `strapiId`. Profil sans compte : écarté s'il est dans la liste du §4.1, sinon l'import s'arrête. |
| `experiences` | `component` répétable `makeupartists.experiences` | `profils.experiences` (`array`) | Lignes du §6.2, dans l'ordre. |
| `courses` | `component` répétable `makeupartists.courses` | `profils.formations` (`array`) | Lignes du §6.3, dans l'ordre. |
| `service_offers` | `component` répétable `makeupartists.service-offers` | `profils.prestations` (`array`) | Lignes du §6.6, dans l'ordre, avec leurs options (§6.7). |
| `image_gallery` | `media` multiple, images | `profils.galerie` (`upload` vers `media`, plusieurs, 10 au plus) | Fichiers et ordre lus dans `files_related_morphs`. Une photo dont le média n'est pas adopté est signalée, pas inventée. Une galerie de plus de 10 photos est comptée et listée (règle 5). |
| `main_picture` | `media` simple, images | `profils.photoPrincipale` (`upload` vers `media`) | Fichier lu dans `files_related_morphs`. Une photo dont le média n'est pas adopté est signalée, pas inventée. 49 profils en ont une ; l'objet de l'une d'elles manque dans le stockage (§4.3). |
| `language` | `component` répétable `makeupartists.language` | `profils.langues` (`array`) | Lignes du §6.4, dans l'ordre. |
| `username` | `string`, 70 caractères au plus | `profils.legacyUsername` (`text`, lecture seule) et `profils.slug` (`text`, unique) | `legacyUsername` : repris tel quel, il sert la redirection 308 de l'ancienne adresse. `slug` : calculé par la règle portée de l'ancien site (`src/lib/slug.ts`, ticket 016), suffixes `-2`, `-3` en cas de collision. |
| `pro` | `boolean`, faux par défaut | `profils.superMaquilleuse` (`checkbox`, réservé à l'admin) | Repris tel quel : 1 vrai, 100 faux. C'est le badge « Super maquilleuse » des cartes de la recherche. À ne pas confondre avec `profils.pro`, le compte propriétaire. Défaut pris ici, en attente de la question ouverte 14 (§11). |
| `company_artist_name` | `string`, 70 caractères au plus | `profils.nomArtiste` (`text`) | Repris tel quel. |

### 5.3 Article : `api::article.article` → `articles`

Table `articles`, 10 lignes, toutes publiées. Brouillons possibles dans Strapi. Les champs gardent leur nom de Strapi, comme l'écrit le plan `01` §6.1.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `title` | `string`, requis | `articles.title` (`text`, requis) | Repris tel quel. |
| `content` | `richtext`, requis | `articles.content` (`code`, markdown) | Repris tel quel, à l'octet près : le markdown reste du markdown. Champ `code` et non `textarea` : Payload limite `text` et `textarea` à 40 000 caractères par défaut. |
| `author` | `string`, requis | `articles.author` (`text`) | Repris tel quel. Signature affichée sur la page de l'article. |
| `galery` | `media` multiple, tous types de fichiers | `articles.galerie` (`upload` vers `media`, plusieurs, images seulement) | Nom corrigé : `galery` était une faute de frappe. Aucun article ne désigne de fichier au 13/10/2026. Une image est rattachée si son média est adopté ; un fichier qui n'est pas une image est signalé, non adopté. |
| `seo_title` | `string`, 70 caractères au plus, requis | `articles.seo_title` (`text`, 70 au plus) | Repris tel quel. |
| `seo_description` | `string`, 155 caractères au plus, requis | `articles.seo_description` (`textarea`, 155 au plus) | Repris tel quel. |
| `slug` | `string`, requis | `articles.slug` (`text`, unique) | Repris tel quel : l'adresse `/blog/<slug>` est conservée. Strapi n'impose pas l'unicité : un doublon est listé (règle 5). |
| `excerpt` | `text` | `articles.excerpt` (`textarea`) | Repris tel quel. |

### 5.4 Talent : `api::talent.talent` → `talents`

Table `talents`, 14 lignes, toutes publiées. Brouillons possibles dans Strapi. Les champs gardent leur nom de Strapi.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `title` | `string` | `talents.title` (`text`) | Repris tel quel. |
| `seo_title` | `string` | `talents.seo_title` (`text`) | Repris tel quel. |
| `description` | `text` | `talents.description` (`textarea`) | Repris tel quel. |
| `seo_description` | `text` | `talents.seo_description` (`textarea`) | Repris tel quel. |
| `content` | `richtext` | `talents.content` (`code`, markdown) | Repris tel quel, à l'octet près. Même raison que pour les articles. |
| `slug` | `string` | `talents.slug` (`text`, unique) | Repris tel quel : les 14 adresses `/talent/<slug>` sont conservées. Un doublon est listé (règle 5). |

## 6. Composants (7)

Chaque composant répétable devient un champ `array` du profil. L'identifiant d'une ligne de composant n'est pas repris (§7).

### 6.1 Compétence : `makeupartists.skills` → `profils.competences`

Table `components_makeupartists_skills`, 200 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string`, 70 caractères au plus | `profils.competences.nom` (`text`) | Repris tel quel. |
| `description` | `text`, 2 000 caractères au plus | `profils.competences.description` (`textarea`) | Repris tel quel. |

### 6.2 Expérience : `makeupartists.experiences` → `profils.experiences`

Table `components_makeupartists_experiences`, 57 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `company` | `string`, 70 caractères au plus | `profils.experiences.entreprise` (`text`) | Repris tel quel. |
| `job_name` | `string`, 70 caractères au plus | `profils.experiences.poste` (`text`) | Repris tel quel. |
| `city` | `string`, 70 caractères au plus | `profils.experiences.ville` (`text`) | Repris tel quel. C'est la ville d'un ancien poste, en texte libre : elle ne passe pas par le référentiel des communes. |
| `date_start` | `date` | `profils.experiences.debut` (`date`) | Repris tel quel : une date sans heure, qui reste au même jour quel que soit le fuseau. |
| `date_end` | `date` | `profils.experiences.fin` (`date`) | Même règle. Une fin antérieure au début est listée (règle 5), pas corrigée. |
| `description` | `text`, 2 000 caractères au plus | `profils.experiences.description` (`textarea`) | Repris tel quel. |

### 6.3 Formation : `makeupartists.courses` → `profils.formations`

Table `components_makeupartists_courses`, 47 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `diploma` | `string`, 70 caractères au plus | `profils.formations.diplome` (`text`) | Repris tel quel. |
| `school` | `string`, 70 caractères au plus | `profils.formations.ecole` (`text`) | Repris tel quel. |
| `date_graduation` | `date` | `profils.formations.obtenuLe` (`date`) | Repris tel quel : une date sans heure, qui reste au même jour. |
| `course_description` | `text`, 2 000 caractères au plus | `profils.formations.description` (`textarea`) | Repris tel quel. |

### 6.4 Langue : `makeupartists.language` → `profils.langues`

Table `components_makeupartists_languages`, 65 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string`, 70 caractères au plus | `profils.langues.nom` (`text`) | Repris tel quel. |

### 6.5 Réseaux et coordonnées : `makeupartists.network` → `profils.reseaux` et `profils.coordonnees`

Table `components_makeupartists_networks`, 101 lignes. Composant simple : une ligne par profil au plus.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `youtube` | `string`, 200 caractères au plus | `profils.reseaux.youtube` (`text`) | Repris tel quel. |
| `facebook` | `string`, 200 caractères au plus | `profils.reseaux.facebook` (`text`) | Repris tel quel. |
| `instagram` | `string`, 200 caractères au plus | `profils.reseaux.instagram` (`text`) | Repris tel quel. |
| `website` | `string`, 200 caractères au plus | `profils.reseaux.siteWeb` (`text`) | Repris tel quel. |
| `linkedin` | `string`, 200 caractères au plus | `profils.reseaux.linkedin` (`text`) | Repris tel quel. |
| `phone` | `string`, 20 caractères au plus | `profils.coordonnees.telephone` (`text`, fermé au public) | Repris tel quel. Jamais écrit dans un rapport. S'il est rempli, `contactPublic` passe à vrai (§9). |
| `email` | `string`, 200 caractères au plus | `profils.coordonnees.email` (`email`, fermé au public) | Repris tel quel. C'est l'email de contact du profil, pas celui du compte. Jamais écrit dans un rapport. S'il est rempli, `contactPublic` passe à vrai (§9). |

### 6.6 Prestation : `makeupartists.service-offers` → `profils.prestations`

Table `components_makeupartists_service_offers`, 118 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string`, 70 caractères au plus | `profils.prestations.nom` (`text`) | Repris tel quel. |
| `description` | `text` | `profils.prestations.description` (`textarea`) | Repris tel quel. |
| `options` | `component` répétable `service-offers.options` | `profils.prestations.options` (`array` imbriqué) | Lignes du §6.7, dans l'ordre de `components_makeupartists_service_offers_components`. |
| `price` | `text`, 70 caractères au plus | `profils.prestations.prixTexte` (`text`) et `profils.prestations.prixAPartirDe` (`number`) | `prixTexte` : repris tel quel, à l'octet près. `prixAPartirDe` : transformé (plan `01` §6.2, ticket 062), le nombre lu par la règle de prix unique (`src/lib/prix.ts`, ticket 032), nul quand le texte n'a pas de nombre lisible. |

### 6.7 Option d'une prestation : `service-offers.options` → `profils.prestations.options`

Table `components_service_offers_options`, 23 lignes.

| Attribut Strapi | Type Strapi | Champ Payload | Règle |
|---|---|---|---|
| `name` | `string` | `profils.prestations.options.nom` (`text`) | Repris tel quel. |
| `description` | `text`, 2 000 caractères au plus | `profils.prestations.options.description` (`textarea`) | Repris tel quel. |
| `price` | `text`, 70 caractères au plus | `profils.prestations.options.prixTexte` (`text`) et `profils.prestations.options.prixAPartirDe` (`number`) | Même règle que le prix d'une prestation (§6.6). |

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
| `makeup_artistes_user_links` | 88 | `id`, `makeup_artiste_id`, `user_id` | `profils.pro` |
| `makeup_artistes_components` | 585 | `id`, `entity_id`, `component_id`, `component_type`, `field`, `order` | Rattacher chaque ligne de composant (`component_id`, dans la table du composant que nomme `component_type`) à son profil (`entity_id`) et à son champ (`field`), dans l'ordre (`order`) |
| `components_makeupartists_service_offers_components` | 23 | `id`, `entity_id`, `component_id`, `component_type`, `field`, `order` | Rattacher chaque option (`component_id`) à sa prestation (`entity_id`), dans l'ordre (`order`) |
| `files_related_morphs` | 256 | `id`, `file_id`, `related_id`, `related_type`, `field`, `order` | `profils.photoPrincipale`, `profils.galerie`, `articles.galerie`, dans l'ordre (`order`) : le fichier `file_id` est désigné par l'entrée `related_id` du type `related_type`, dans son champ `field` ; 7 lignes visent une entrée disparue et sont ignorées |
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

## 9. Champs de Payload sans source dans Strapi

Pour mémoire : ces champs n'ont aucune ligne aux §5 et §6. Leur valeur à l'import est fixée ici quand le plan la donne.

| Champ Payload | Valeur à l'import | Défini par |
|---|---|---|
| `profils.contactPublic`, `profils.consentiLe` et la source du consentement | Téléphone ou email de contact rempli à la source : `contactPublic` vrai, `consentiLe` à la date de bascule (paramètre du passage), source « publié par la maquilleuse ». Sinon : faux, sans date. | Plan `01` §6.2 ; tickets 042 et 064 |
| `profils.statut` | Profil entièrement vide (aucune des six conditions du profil publiable) : brouillon. Sinon : publié. Les trois valeurs sont `brouillon`, `publie` et `masque` ; un profil créé dans la v3 commence en brouillon (ticket 021). | Décision du 13/10 ; tickets 021, 044 et 059 |
| `profils.completude`, `profils.actif`, `profils.publiable`, `profils.derniereActivite` | Calculés par le serveur à l'enregistrement, jamais lus dans Strapi | Tickets 031 et 044 |
| `profils.motif`, `profils.verifie`, `profils.siret`, `profils.verifieLe`, `profils.noteInterne` | Non renseignés. Écrits par un admin seulement ; la note interne n'est lue que par un admin, les autres par l'admin et la propriétaire, jamais par le public | Ticket 021 |
| `profils.aDomicile` | Non renseigné : Strapi ne le sait pas | Ticket 041 |
| `media.prefix`, `media.filename`, `media.owner`, `media.strapiFormats` | §8 | Tickets 043 et 058 |
| `admins` (toute la collection) | Rien d'importé (§4.2) | Ticket 018 |
| `demandes`, `journal`, `auth-evenements` | Nouvelles collections, vides à la bascule | Plan `01` §6.1 |

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

Le test `tests/unit/doc-schema-gele.test.ts` relit ce document et échoue si :

- un attribut de Strapi n'a pas sa ligne, en a deux, ou n'est pas à sa place ;
- une ligne n'a ni champ cible, ni abandon motivé ;
- un nombre du tableau ci-dessus ne correspond pas aux tableaux des §5 et §6 ;
- la liste des 13 profils écartés ou les décomptes du 13/10/2026 changent ;
- une règle « Transformé » n'est ni au registre des changements voulus, ni l'une des deux exceptions du §1 ;
- les colonnes d'une table de liens du §7 changent ;
- ce que le document dit de Payload (règle 1, `pros._verified`) n'est plus vrai sur la version installée ;
- le document contient un hash, une adresse email ou un numéro de téléphone.

```sh
bun --no-env-file test tests/unit/doc-schema-gele.test.ts
```

L'inventaire des attributs est figé dans le test. Pour le recomparer aux vrais fichiers de schéma, tant que le dépôt de l'ancienne API existe :

```sh
STRAPI_API_DIR=../api-my-makeup bun --no-env-file test tests/unit/doc-schema-gele.test.ts
```

## 11. Points en attente

Chaque point a un défaut, écrit dans ce document. Sans décision contraire, c'est le défaut qui s'applique.

| Point | Défaut pris ici | Qui tranche |
|---|---|---|
| Badge « Super maquilleuse » (`pro`, 1 profil) : repris ou abandonné ? | Repris dans `profils.superMaquilleuse`, pour ne rien perdre et garder la parité de la recherche | Question ouverte 14 des tickets de la v3 |
| Email porté par 4 comptes | L'import s'arrête sans table de décision | Tickets 025 et 066 ; question ouverte 3 |
| Profil dont le compte est écarté par cette table de décision | L'import s'arrête et liste le profil par identifiant | Ticket 066 |
| Texte de ville qui n'est pas une commune | Zone vide, profil à revoir | Ticket 066 ; question ouverte 13 |
| Rayon au-dessus de 200 km, galerie de plus de 10 photos, valeur plus longue que la limite cible | Comptés et listés, jamais tronqués | Ticket 066 |
| Fichier référencé qui n'est pas une image, objet manquant | Signalé, non adopté ; « 404 connus » | Ticket 066 |
| Lignes en double dans les listes | Gardées telles quelles, par parité | Question ouverte 15 |

Noms fixés par ce document, parce que le plan ne les donnait pas : `profils.legacyUsername`, `profils.superMaquilleuse`, `profils.photoPrincipale`, `profils.galerie`, `articles.galerie`, les sous-champs de `profils.commune`, de `profils.reseaux` et de `profils.coordonnees`, les champs des listes du §6, `publishedAt`.

## 12. Journal des changements

| Date | Changement |
|---|---|
| 14/10/2026 | Gel initial (ticket 015) : 71 attributs, schémas de Strapi au commit `ccd449d`, décomptes de l'instantané du 13/10/2026. |
| 14/10/2026 | Suites de la relecture (ticket 220), sans changer un nom de champ ni une règle de reprise : raison de la règle 1 corrigée ; 88 profils et 43 hash attendus « au plus », et défaut pour un profil dont le compte est écarté (§11) ; portée du mot « Transformé » (§1) ; colonnes des tables de liens (§7) et des deux jetons (§5.1) ; condition d'existence de `pros._verified` (§5.1). |
| 14/10/2026 | Ticket 021, sans changer un nom de champ : les valeurs de `profils.statut` (§9) ; `profils.superMaquilleuse` (§5.2) est créé avec les champs réservés à l'admin, et reste lu par le public, comme le badge de la recherche. |
