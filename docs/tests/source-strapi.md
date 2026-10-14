# La fausse base Strapi du banc

L'import de la v3 lit la base de l'ancienne API (Strapi 4) et adopte ses photos sans les copier. Sur le banc, il lit une fausse base Strapi : les seize tables utiles de l'ancienne API, avec les mêmes colonnes et les mêmes types, et leurs photos dans le stockage d'objets. Elle porte chaque cas connu de la vraie base au 13/10/2026, sur quelques comptes inventés. Tout y est fictif et déterministe : créée deux fois, elle est identique, à l'octet près.

Les tickets d'import (024 et suivants) et la connexion des comptes repris (095) s'en servent. Le schéma de référence est [`docs/migration/SCHEMA.md`](../migration/SCHEMA.md).

| Élément | Où |
|---|---|
| La base | Une base à elle, `strapi_source_test`, dans le PostgreSQL du banc, à côté de la base de l'application |
| Qui la lit | Le rôle `lecture_strapi`, qui ne peut rien y écrire : c'est `STRAPI_SOURCE_URI`, dans `.env.test` |
| Les photos | Dans l'espace du banc (`S3_BUCKET`), là où l'application lit les siennes : à la racine, et sous `1/` |
| Les données | `tests/outils/source-strapi/donnees.ts` ; les tables : `tests/outils/source-strapi/schema.ts` |
| L'outil | `tests/outils/source-strapi.ts` ; la commande : `scripts/source-strapi.ts` |

## La commande

Banc démarré (`bun run banc:up`) :

```sh
bun run banc:source               # crée la source, ou la recrée de zéro, puis donne son inventaire et son empreinte
bun run banc:source --empreinte   # donne l'empreinte de la source telle qu'elle est, sans y toucher
bun run banc:source --effacer     # efface la base, le rôle en lecture seule et les objets de la source
```

Comme toute commande du banc, elle vise l'instance de `BANC_INSTANCE` et `BANC_DECALAGE`. Elle met environ une seconde. Elle n'affiche que des nombres et des empreintes : ni hash, ni email, ni mot de passe.

`bun run test:integration` ne touche pas à la source : il n'efface que le schéma de la base de l'application. Mais un fichier de tests qui vide le stockage (`viderLeStockage()`) emporte ses photos. Un test qui lit la source la crée donc lui-même, au début, et l'efface à la fin.

## Dans un test

```ts
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { creerLaSourceStrapi, effacerLaSourceStrapi, empreinteDeLaSource, ouvrirLaSource } from '../outils/source-strapi'

beforeAll(() => creerLaSourceStrapi())
afterAll(() => effacerLaSourceStrapi())

test('l’import ne change pas la source', async () => {
	const avant = await empreinteDeLaSource()
	// … l'import lit la source par ouvrirLaSource() …
	expect((await empreinteDeLaSource()).empreinte).toBe(avant.empreinte)
})
```

| Outil (`tests/outils/source-strapi.ts`) | Effet |
|---|---|
| `await creerLaSourceStrapi()` | Crée la source de zéro : base, tables, lignes, hash, rôle en lecture seule, objets. Rend sa définition |
| `ouvrirLaSource()` | Une connexion à la source par le rôle en lecture seule, comme l'import l'ouvre. À fermer par `await sql.close()` |
| `await empreinteDeLaSource()` | L'empreinte de la source, lue par le rôle en lecture seule |
| `inventaire(await lireLaSource())` | L'inventaire de la source, cas par cas, lu par le rôle en lecture seule |
| `await effacerLaSourceStrapi()` | Supprime la base, le rôle et les objets de la source. Rien d'autre du banc |
| `COMPTES_DE_FIXTURE` | Les trois comptes dont le mot de passe est connu : `strapiId`, email, fournisseur, mot de passe |

Chaque outil s'arrête avant d'ouvrir quoi que ce soit si `DATABASE_URI`, `STRAPI_SOURCE_URI`, `S3_ENDPOINT` ou `S3_BUCKET` ne sont pas exactement ceux de l'instance du banc. La garde des tests refuse aussi une `STRAPI_SOURCE_URI` qui n'est pas locale ou dont la base ne finit pas par `_test` : un test ne lit jamais la vraie base Strapi.

## Le rôle en lecture seule

L'import lit la source par un rôle qui ne peut rien y écrire (SCHEMA.md, règle 7). Sur le banc, ce rôle est `lecture_strapi` :

- il a le droit de se connecter à la base de la source et de lire ses tables, rien d'autre : ni insertion, ni modification, ni suppression, ni vidage, ni création de table, ni table temporaire, ni compteur ;
- chacune de ses transactions commence en lecture seule (`default_transaction_read_only`). Même s'il la remet en écriture, il n'a aucun droit d'écrire.

Toute écriture échoue avec une erreur de PostgreSQL (`42501`, droit refusé, ou `25006`, transaction en lecture seule). Le test d'intégration essaie chacune.

## Les trois comptes de fixture

Les comptes 1 et 2 (`local`) et 3 (`google`, avec un mot de passe, comme un vrai compte) ont un mot de passe connu, écrit dans `COMPTES_DE_FIXTURE`. Ce document ne le recopie pas. Ce sont eux qui se connecteront par le chemin hérité (plan `01` §2.4, M2 ; ticket 095).

Les hash ne sont écrits dans aucun fichier. PostgreSQL les calcule à la création de la source, par la fonction `crypt` de son extension `pgcrypto`, avec un sel tiré de l'identifiant du compte : le même compte a toujours le même hash. Ils commencent par `$2a$10$`, comme ceux de Strapi. L'extension est posée dans un schéma à part, retiré dès les hash écrits : la source ne garde que les tables de Strapi.

Les six autres comptes à hash ont un mot de passe que rien n'exporte. Le test d'intégration vérifie chacun des neuf hash avec `Bun.password.verify`, une autre implémentation de bcrypt que celle qui l'a écrit, et contrôle qu'aucun mot de passe de fixture n'ouvre un autre compte.

## L'empreinte

L'empreinte dit si la source a changé. Elle couvre :

- le schéma : chaque table du schéma `public`, celles que la source n'a pas créées comprises, avec ses colonnes et leurs types ;
- chaque ligne de chaque table, toutes colonnes comprises : PostgreSQL la sérialise et la hache lui-même, aucune valeur n'en sort ;
- chaque objet que nomment les fichiers, originaux et formats dérivés : son contenu et son type, ou son absence.

Elle se calcule par le rôle en lecture seule et n'écrit rien. Recréer la source redonne la même empreinte ; changer une ligne ou un objet la change.

Les adresses des photos portent le port du stockage de l'instance : deux instances du banc n'ont donc pas la même empreinte. Sur une même instance, elle ne change pas d'une création à l'autre.

## Inventaire

Les nombres de la vraie base viennent de l'instantané du 13/10/2026 ([`SCHEMA.md`](../migration/SCHEMA.md), §3) et de l'analyse du même jour pour les profils actifs et publiables. « — » : non mesuré ce jour-là. Un test compare ce tableau à l'inventaire calculé sur les données (`bun --no-env-file test tests/unit/source-strapi.test.ts`), et le test d'intégration le compare à la base créée. `bun run banc:source` l'affiche sous cette forme.

| Groupe | Cas | Base réelle, 13/10/2026 | Fausse base |
|---|---|---|---|
| Comptes | Comptes | 91 | 17 |
| Comptes | Comptes `local` | 42 | 8 |
| Comptes | Comptes `google` | 40 | 6 |
| Comptes | Comptes `facebook` | 9 | 3 |
| Comptes | Comptes avec un hash bcrypt complet | 43 | 9 |
| Comptes | … dont des comptes `google` | 1 | 1 |
| Comptes | … dont des comptes de fixture, au mot de passe connu | — | 3 |
| Comptes | Comptes sans mot de passe | 48 | 8 |
| Comptes | Comptes confirmés | 91 | 17 |
| Comptes | Comptes bloqués | 0 | 0 |
| Comptes | Adresses email portées par plusieurs comptes | 1 | 1 |
| Comptes | … comptes qui portent ces adresses | 4 | 4 |
| Comptes | Emails avec des majuscules ou des espaces de bord | — | 1 |
| Comptes | Noms (`username`) portés par plusieurs comptes | 2 | 2 |
| Comptes | … comptes qui portent ces noms | 4 | 4 |
| Comptes | Comptes sans profil | 3 | 3 |
| Profils | Profils | 101 | 27 |
| Profils | Profils reliés à un compte | 88 | 14 |
| Profils | Profils sans compte, dans la liste des 13 écartés | 13 | 13 |
| Profils | Profils sans compte, hors de cette liste | 0 | 0 |
| Profils | Profils entièrement vides reliés à un compte | 26 | 1 |
| Profils | Profils actifs | 41 | 3 |
| Profils | Profils publiables | 15 | 2 |
| Profils | `available` vrai | 48 | 7 |
| Profils | `available` faux | 5 | 2 |
| Profils | `available` nul | 48 | 18 |
| Profils | `pro` vrai (badge « Super maquilleuse ») | 1 | 1 |
| Profils | `username` qui n’est pas déjà son slug | 73 | 25 |
| Profils | Slugs de profil en collision (suffixe `-2`) | 0 | 0 |
| Profils | Rayon d’action au-dessus de 200 km | — | 1 |
| Profils | Ville vide ou nulle | — | 16 |
| Profils | Ville lue comme une adresse postale | — | 1 |
| Profils | Ville qui n’est pas une commune exploitable (pays, texte libre) | — | 1 |
| Profils | Ville homonyme de plusieurs communes | — | 1 |
| Listes | Compétences | 200 | 6 |
| Listes | Expériences | 57 | 3 |
| Listes | Formations | 47 | 2 |
| Listes | Langues | 65 | 4 |
| Listes | Réseaux | 101 | 27 |
| Listes | Prestations | 118 | 11 |
| Listes | Options de prestation | 23 | 3 |
| Listes | Lignes de liste qu’aucun lien ne rattache | 3 | 3 |
| Listes | Lignes identiques dans une même liste | — | 1 |
| Listes | Listes rangées par `order` dans un autre ordre que leurs liens | — | 2 |
| Listes | Réseaux avec un téléphone ou un email de contact | — | 3 |
| Listes | Prix écrits sans nombre lisible (prestations et options) | — | 4 |
| Listes | Prix vides ou nuls (prestations et options) | — | 2 |
| Fichiers | Fichiers | 574 | 13 |
| Fichiers | Fichiers désignés par un profil | 249 | 9 |
| Fichiers | … comme photo principale | 49 | 3 |
| Fichiers | … dans une galerie | 200 | 6 |
| Fichiers | … qui ne sont pas des images | 1 | 1 |
| Fichiers | … dont l’objet manque dans le stockage | 1 | 1 |
| Fichiers | Formats dérivés des fichiers désignés | 242 | 4 |
| Fichiers | Fichiers désignés par un article | 0 | 0 |
| Fichiers | Fichiers à la racine du stockage | 134 | 3 |
| Fichiers | Fichiers sous le préfixe `1/` | 440 | 10 |
| Fichiers | Liens de fichier vers une entrée disparue | 7 | 2 |
| Fichiers | Fichiers sans aucun lien | 318 | 2 |
| Fichiers | Fichiers avec `uploaded_by` rempli | — | 1 |
| Articles et talents | Articles | 10 | 2 |
| Articles et talents | Articles publiés | 10 | 2 |
| Articles et talents | Talents | 14 | 3 |
| Articles et talents | Talents publiés | 14 | 3 |

Un profil se lit avec les règles de la v3 : le slug par `src/lib/slug.ts`, le prix par `src/lib/prix.ts`, la ville et la complétude par `src/lib/profil/`. Un email en double se compte sans casse ni espaces de bord, comme l'import le normalisera.

## Où trouver chaque cas

Les identifiants sont ceux de la fausse base, jamais ceux de la vraie.

**Comptes** (`up_users`), ids 1 à 18 ; il manque le 13, comme le trou que laisse un compte supprimé.

- 1 et 2 : `local`, mot de passe de fixture. 3 : `google` avec un mot de passe de fixture.
- 7, 8, 9, 11, 14 et 17 : `local`, hash au mot de passe que rien n'expose. 4, 10, 15, 16 et 18 : `google` sans mot de passe. 5, 6 et 12 : `facebook` sans mot de passe.
- 7 : email avec des majuscules et des espaces de bord ; son profil, 27, est entièrement vide.
- 8 : sans profil.
- 9 à 12 : le même email. Les noms de 9 et 10 sont identiques, ceux de 11 et 12 aussi. 9 et 11 ont un profil, 10 et 12 n'en ont pas : écarter l'un des deux premiers par la table de décision laisse un profil sans compte (SCHEMA.md §11).

**Profils** (`makeup_artistes`) : 21 à 34, reliés chacun à un compte d'un autre numéro ; 67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108, sans compte et vides, les ids de la liste des écartés (SCHEMA.md §4.1).

| Profil | Ce qu'il porte |
|---|---|
| 21 | Complet et publiable. Une compétence en double ; des liens de compétences écrits dans un autre ordre que `order` ; une prestation avec deux options, liens dans le désordre ; photo principale avec deux formats dérivés ; galerie de trois photos sous `1/`, liens dans le désordre |
| 22 | « 74000 Annecy » ; `available` nul ; photos de l'ancien fournisseur, à la racine du stockage ; une option au prix « 0,50 € / km », hors des bornes d'un prix |
| 23 | Ville en adresse postale ; photo principale dont l'objet manque ; publiable quand même, comme sur le site en ligne |
| 24 | « Toulouse (31) » ; `available` faux ; un PDF dans la galerie ; prix « 2 h : 150 € », sans nombre lisible |
| 25 | « 75116 » ; badge « Super maquilleuse » ; photo envoyée par son compte (`uploaded_by`) ; un prix nul, un prix vide |
| 26 | « France » ; rayon de 400 km ; prix « 1 200 € » |
| 27 | Entièrement vide : un nom seul |
| 28 | « Saint-Julien », nom de plusieurs communes |
| 29, 31 | Ville vide (chaîne vide), ville nulle |
| 30 | « annecy », en minuscules, avec un espace final |
| 32 à 34 | Profils simples ; 34 a été créé la veille de l'instantané |

Les villes de ces profils ont leurs réponses du référentiel des communes dans `tests/fixtures/import/referentiel-du-banc.json` : des données publiques de `geo.api.gouv.fr`, que l'import du banc lit hors ligne ([`docs/migration/IMPORT.md`](../migration/IMPORT.md), « Les communes »). Une ville ajoutée à la source y ajoute ses réponses, sinon l'import du banc s'arrête.

**Listes** : la compétence 6, la langue 4 et la prestation 11 n'ont aucun lien. Chaque profil a sa ligne de réseaux, vide ou non.

**Fichiers** (`files`), ids 101 à 113 : 101 à 104, 107 à 111 et 113 sous `1/` (fournisseur courant) ; 105, 106 et 112 à la racine (ancien fournisseur). 107 est désigné et son objet manque ; 108 est un PDF désigné ; 110 et 111 sont liés au profil 70, qui n'existe plus ; 112 et 113 (une vidéo) n'ont aucun lien. Les formats dérivés sont à la racine, comme ceux de Strapi.

**Articles** 1 et 7, **talents** 1 à 3 : tous publiés. Le talent 3 n'a pas de description pour les moteurs (nulle).

## Ce que la source ne porte pas

Ces cas n'étaient pas dans la vraie base le 13/10/2026, ou n'y ont pas été mesurés. La source ne les invente pas : un ticket qui en a besoin les ajoute dans son propre test, par le propriétaire du banc, jamais par le rôle en lecture seule.

- un compte bloqué ou non confirmé, un jeton de réinitialisation ou de confirmation rempli, un hash bcrypt incomplet ;
- un article ou un talent en brouillon, un fichier désigné par un article ;
- une galerie de plus de 10 photos, une valeur plus longue que la limite de la v3, une fin d'expérience avant son début ;
- un fichier dont `hash` et `ext` ne donnent pas le nom de l'objet, un `uploaded_by` qui désigne un autre compte que celui du profil ;
- un lien vers une ligne de liste qui n'existe pas.

Les tables que l'import n'ouvre jamais ne sont pas dans la source : comptes et rôles de l'administration de Strapi, permissions, jetons, réglages, dossiers de la médiathèque et leurs liens (SCHEMA.md, §4.2 et §4.4).

## Limites

- **Les données sont peu nombreuses.** La source porte chaque cas, pas les volumes : 17 comptes au lieu de 91. La parité en nombres contre la vraie base se fait à la répétition sur une copie de la vraie base (ticket 065).
- **Les photos sont de petites images d'une couleur**, de quelques dizaines de pixels, écrites octet par octet. Leurs dimensions dans `files` sont les leurs.
- **S3Mock n'est pas R2.** Les adresses des photos sont celles du stockage du banc, `S3_ENDPOINT` suivi de `S3_BUCKET` ; celles de la vraie base sont sur le domaine public des photos.
