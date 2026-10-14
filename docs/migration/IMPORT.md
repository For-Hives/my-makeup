# L'import des données de l'ancien site

L'import lit la base de l'ancienne API (Strapi 4) et écrit ce qu'elle contient dans la base de la v3, par l'API locale de Payload. Où va chaque champ, et pourquoi un champ n'est pas repris : [`SCHEMA.md`](SCHEMA.md). Ce que la v3 fait autrement que le site actuel : [`CHANGEMENTS-VOULUS.md`](CHANGEMENTS-VOULUS.md).

L'import se construit ticket par ticket. Il reprend aujourd'hui les comptes des maquilleuses (ticket 025), leurs photos, adoptées là où elles sont (ticket 058), l'identité de leurs profils (tickets 026 et 059), leurs listes, leurs réseaux et leurs photos (ticket 060), leur commune (ticket 063), les articles (ticket 061) et les talents (ticket 024). Le montant des prix (ticket 062) et les coordonnées (ticket 064) arrivent avec leurs tickets.

## Ce qu'il garantit

- **Il tourne à blanc par défaut.** Sans `--reel`, il lit la source et la cible, dit ce qu'il écrirait, et n'écrit rien, ni document ni schéma.
- **Il ne touche pas au schéma de la cible.** Les tables sont celles de l'application : ses migrations les créent quand elle démarre. L'import démarre Payload sans pousser le schéma du code dans une base de ce poste (l'interrupteur de Payload, `PAYLOAD_MIGRATING`) et sans jouer de migration en production. Une base cible qui n'a pas les tables de la v3 est refusée avant toute lecture : démarre l'application une fois sur cette base, ou, sur le banc, `bun run banc:prepare`.
- **La source est lue, jamais écrite.** Il l'ouvre en lecture seule : chaque transaction de sa connexion commence en lecture seule, et chaque lecture est une transaction en lecture seule, sur un seul instantané. Le rôle qui l'ouvre doit aussi être en lecture seule (sur le banc : `lecture_strapi`). Il prend l'empreinte de chaque table qu'il lit avant et après son passage, et le dit (plan 02, I43).
- **Il refuse une cible distante.** La base où il écrit est celle de `DATABASE_URI`. Une base qui n'est pas sur ce poste (`localhost`, `127.0.0.1`, `::1`) est refusée, sauf si la commande porte `--cible-distante`. Le refus a lieu avant que la configuration de Payload soit chargée : rien ne s'y connecte, rien n'y est écrit.
- **Il retrouve chaque document par son `strapiId`** ([`SCHEMA.md`](SCHEMA.md), règle 1). Absent : il le crée. Présent avec d'autres valeurs : il met à jour les seuls champs qui diffèrent, puis remet les dates de la source. Présent avec les mêmes valeurs : il n'écrit rien. **Un second passage sur une source inchangée n'écrit rien.**
- **Il ne supprime rien.** Un document de la cible que la source ne donne plus est listé, et il reste.
- **Il n'écrit rien dans le stockage des photos.** Une photo de l'ancien site est adoptée là où elle est : son média nomme l'objet existant, qui n'est ni copié, ni déplacé, ni renommé, et son adresse publique reste la même, caractère pour caractère (voir « Les photos »). Le stockage n'est lu que par des requêtes d'en-tête (`HEAD`), avant toute écriture.
- **Il n'appelle qu'un service extérieur, et garde ses réponses.** La ville d'un profil devient une commune du référentiel officiel, `geo.api.gouv.fr` (voir « Les communes »). Chaque réponse est gardée dans un fichier : un second passage ne demande plus rien, et donne les mêmes communes même si le référentiel a changé entre-temps. Hors ligne (`--hors-ligne`), il ne demande rien du tout. Le banc et les tests tournent hors ligne : aucun test n'appelle Internet. Le seul autre hôte qu'il interroge est celui des photos, par des requêtes d'en-tête : sur le banc, le stockage du banc.
- **Il ne prévient personne.** Chaque écriture porte le contexte d'import (`CONTEXTE_IMPORT`, `src/lib/contexte-import.ts`). Un crochet qui enverrait un email, rafraîchirait une page ou mettrait une photo à la corbeille le lit (`estUnImport`) et ne fait rien. Les tickets 045 (corbeille des photos) et 047 (rafraîchissement des pages) le lisent.
- **Rien n'est corrigé en silence.** Une valeur que la cible refuse est listée par identifiant et par champ, jamais avec la valeur (règle 5) : elle attend une décision (ticket 066). Un document refusé compte : la parité le dit incomplète, et la commande sort en 5.
- **Ce qu'il ne peut pas trancher l'arrête.** Des comptes qui portent le même email arrêtent l'import, à blanc comme en réel, avant toute écriture, tant que la table de décision ne dit pas lequel garder. Le profil d'un compte que la table écarte l'arrête aussi, tant qu'elle ne dit pas de l'écarter avec lui ([`SCHEMA.md`](SCHEMA.md), §11). Un profil qui n'a aucun compte dans la source l'arrête de même, sauf s'il est l'un des 13 profils vides laissés par le spam ([`SCHEMA.md`](SCHEMA.md), §4.1), que l'import écarte lui-même : la liste ne s'allonge pas toute seule. Le rapport les liste par identifiants.
- **Aucun hash ne sort de la mémoire.** Le hash bcrypt d'un compte est lu dans la source et écrit dans `pros.legacyBcrypt`, de base à base : jamais dans un fichier, un journal ou le rapport (règle 4). Les jetons de réinitialisation et de confirmation ne sont jamais lus, pas même pour l'empreinte.
- **Une erreur ne dit que son code.** Le texte d'une erreur de la base porte la requête et ses valeurs : un email, un hash. Une écriture que la base n'a pas faite (connexion perdue, délai dépassé, déclencheur, disque plein) arrête l'import, qui nomme la collection, le document par son identifiant et le code de l'erreur (`SQLSTATE`), jamais son texte. Il en va de même de toute erreur inattendue : son type et son code. Ce qui était écrit reste écrit, et un nouveau passage reprend à partir de là.
- **Il prouve sa parité.** Après un passage réel, il relit la cible et la compare, champ par champ, à ce que la source donne : tous les documents attendus, aucun refusé, aucun en trop, les mêmes valeurs, la même empreinte (plan 02, I39 et I40).

## Lancer l'import

Sur le banc de test, banc démarré, avec sa fausse base Strapi ([`docs/tests/source-strapi.md`](../tests/source-strapi.md)) :

```sh
bun run banc:prepare                # la base du banc, à jour et vide, si elle n'a pas encore ses tables
bun run banc:source                 # la fausse base Strapi
bun run banc:import                 # à blanc : ce qu'il écrirait
bun run banc:import --reel          # écrit dans la base du banc, puis relit la cible
```

`banc:import` prend l'environnement du banc de l'instance (`BANC_INSTANCE`, `BANC_DECALAGE`), comme toute commande du banc, et jamais le fichier `.env`. Il donne la table de décision du banc (`tests/fixtures/import/decisions-du-banc.json`), sauf si la commande en nomme une autre par `--decisions` : sans elle, l'import s'arrêterait, car quatre comptes de la fausse base portent le même email, et l'un des comptes écartés a un profil. Il donne aussi les réponses gardées du référentiel des communes pour les villes de la fausse base (`tests/fixtures/import/referentiel-du-banc.json`), hors ligne, sauf si la commande nomme un autre fichier par `--communes`.

Ailleurs, la commande lit `DATABASE_URI` et `STRAPI_SOURCE_URI` dans l'environnement (le `.env` de travail, par `bun run`) :

```sh
bun run migration:import                          # à blanc
bun run migration:import --reel                   # écrit
bun run migration:import --reel --rapport r.json  # écrit aussi le rapport en JSON
bun run migration:import --revue v.json           # écrit aussi la liste de revue privée des villes à revoir
```

| Option | Effet |
|---|---|
| (aucune) | À blanc : lit la source et la cible, annonce les créations et les mises à jour, n'écrit rien |
| `--reel` | Écrit dans la base de `DATABASE_URI`, puis relit la cible pour prouver la parité |
| `--cible-distante` | Accepte une base qui n'est pas sur ce poste. Sans lui, une telle base est refusée avant toute écriture |
| `--decisions <fichier>` | La table de décision : ce qu'une personne a tranché pour les cas que l'import ne tranche pas seul (ci-dessous) |
| `--rapport <fichier>` | Écrit aussi le rapport en JSON dans ce fichier, lisible par son seul propriétaire |
| `--communes <fichier>` | Les réponses gardées du référentiel des communes. Sans lui : `.migration/referentiel-communes.json`, jamais versionné. Absent, le fichier est créé ; une réponse reçue pendant le passage y est ajoutée, même si le passage s'arrête ensuite |
| `--hors-ligne` | Ne demande rien au référentiel des communes : chaque réponse doit déjà être dans le fichier des réponses gardées, sinon l'import s'arrête avant toute écriture. Le fichier n'est jamais réécrit |
| `--revue <fichier>` | Écrit aussi la liste de revue privée des villes à revoir dans ce fichier, lisible par son seul propriétaire (voir « Les communes ») |

| Variable | Rôle |
|---|---|
| `DATABASE_URI` | La base de Payload où l'import écrit |
| `STRAPI_SOURCE_URI` | La base Strapi qu'il lit, par un rôle en lecture seule. Sur le banc : la fausse base, dans `.env.test` |
| `R2_PUBLIC_URL` | La base des photos, celle de l'application (README, « Variables d'environnement ») : une photo de l'ancien site est adoptée quand son adresse est cette base suivie de sa clé. Sur le banc : le stockage du banc, par `S3_ENDPOINT` et `S3_BUCKET` |

| Code de sortie | Sens |
|---|---|
| 0 | Fini : la source n'a pas bougé, aucun document n'est refusé et, en réel, la parité est complète |
| 1 | Refusé avant toute écriture : une variable manque ou ne va pas, la cible est distante sans `--cible-distante`, la cible n'a pas les tables de la v3, la table de décision est mal formée ou donne une commune que le référentiel ne connaît pas, le fichier des réponses gardées est mal formé, le référentiel des communes ne répond pas, hors ligne, une de ses réponses n'est pas gardée, ou le stockage des photos ne répond pas à une requête d'en-tête par 200 ou 404 dans les 10 secondes |
| 2 | Ligne de commande incomprise |
| 3 | Arrêté avant toute écriture : des cas attendent une décision, listés par identifiants |
| 4 | La source a changé pendant le passage, ou la cible s'écarte de la source par autre chose que des documents refusés : un écart que le rapport n'explique pas |
| 5 | Des documents sont refusés, avant l'écriture ou par Payload : listés par identifiant et par champ, ils attendent une décision. En réel, la parité est incomplète d'autant |
| 6 | Arrêté en cours de passage par une erreur de la base ou une erreur inattendue, nommée par son type et son code. Ce qui était écrit reste écrit ; un nouveau passage reprend à partir de là |

### Dans la préprod

La préprod lance l'import elle-même, au démarrage, sur une base vide : elle pose la fausse base Strapi du banc à côté de sa base, puis l'importe en réel, avec la table de décision du banc ([`docs/preprod.md`](../preprod.md), ticket 027). L'import tourne alors dans le processus de l'application, sous Node : il lit la source par le client PostgreSQL de Payload (`scripts/migration/import/source-pg.ts`), en lecture seule comme avec bun. Son rapport, en nombres seulement, est écrit dans le journal de démarrage. Aucune vraie base Strapi n'est lue : `STRAPI_SOURCE_URI` ne sert pas là. La préprod n'a pas de stockage des photos : l'import n'y adopte aucune photo et ne sonde aucun objet, et le rapport liste chaque fichier « sans-stockage ».

## La table de décision

Un fichier JSON, donné par `--decisions`. Pour les vraies données, il vit hors du dépôt, comme les listes privées qu'il tranche (ticket 066). Il nomme les comptes par leur identifiant dans l'ancienne base, jamais par leur email :

```json
{
	"emailsPartages": [{ "comptes": [9, 10, 11, 12], "retenu": 9 }],
	"profilsEcartes": [29],
	"communes": [{ "profil": 28, "codeInsee": "69215" }, { "profil": 26, "codeInsee": null }]
}
```

- **`emailsPartages`** : des comptes de l'ancien site qui portent le même email, aux espaces de bord et aux majuscules près. La v3 n'a qu'un compte par email : seul `retenu` est repris, les autres sont écartés et listés dans le rapport. Un compte écarté n'apporte pas son hash.
- **`profilsEcartes`** : des profils qu'une personne a décidé d'écarter : le profil d'un compte écarté par une décision ci-dessus, ou un profil qui n'a aucun compte dans la source sans être l'un des 13 profils du spam ([`SCHEMA.md`](SCHEMA.md), §4.1). Un tel profil sans sa décision arrête l'import ([`SCHEMA.md`](SCHEMA.md), §11). Écarté, il est listé dans le rapport. Une autre issue, comme rattacher le profil au compte retenu, reste à trancher (ticket 066).
- **`communes`** : pour un profil dont la ville est « à revoir » (voir « Les communes »), la commune qu'une personne a choisie, par son code INSEE, ou `null` pour aucune : la zone reste vide, et le profil n'est plus à revoir. Une commune qui n'est pas parmi celles que la liste de revue propose est demandée au référentiel par son code ; un code qu'il ne connaît pas arrête l'import avant toute écriture. Une ligne par profil au plus.
- Une décision vaut pour le cas exact qu'elle nomme. Un groupe qui a changé depuis (un compte ajouté ou supprimé) est un cas nouveau : l'import s'arrête. Une décision qui ne nomme aucun cas de la source, comme le profil d'un compte qui n'est pas écarté, l'un des 13 profils du spam, ou un profil dont la ville n'est pas à revoir, est sans effet, et le rapport la compte.
- Une table mal formée (un compte retenu hors de son groupe, un compte dans deux groupes, un identifiant nommé deux fois, une clé inconnue) est refusée avant toute écriture.
- Sur le banc : `tests/fixtures/import/decisions-du-banc.json`, qui garde le compte 9 et écarte le profil 29 du compte 11.

## Le rapport

Il ne porte que des nombres, des identifiants de l'ancienne base et des empreintes : ni nom, ni email, ni téléphone, ni hash ([`SCHEMA.md`](SCHEMA.md), règle 8).

- **Par collection** : le nombre de documents de la source, les créations, les mises à jour, les inchangés, les refusés (identifiant, motif, champs), et les documents de la cible que la source ne donne plus. Pour les comptes, en plus : les comptes écartés par la table de décision, ceux qui n'étaient pas confirmés à la source, le nombre de comptes par fournisseur et le nombre de hash hérités. Pour les profils : ceux que la table de décision écarte, les 13 profils du spam écartés par l'import, le nombre de profils par statut, et les profils dont le statut calculé par le serveur n'est pas celui que donne la source (une section que l'import ne reprend pas encore, ou une ville qui ne donne aucune commune). Les profils de la source sont la somme des profils repris, de ceux que la table écarte et de ceux du spam (plan 02, I39). Les communes, en nombres : les villes renseignées, celles rattachées à une commune et leur part (cible 90 %), les profils non vides qui ont une commune, et, par identifiants, les villes à revoir, les adresses postales dont seule la commune est reprise, et les villes tranchées par la table de décision.
- **L'arrêt**, s'il a lieu : les groupes de comptes au même email sans décision, les profils d'un compte écarté sans décision, et les profils sans compte hors de la liste du spam sans décision, par identifiants.
- **Les photos** : pour les médias, les fichiers de la source désignés par un profil ou un article repris, et ceux qu'aucune entrée reprise ne désigne (liés à une entrée non reprise, à une entrée disparue, ou sans lien), en nombres ; par identifiants, les fichiers non adoptés et pourquoi, les « 404 connus », les objets nommés autrement que `hash` suivi de `ext`, les fichiers envoyés par un autre compte. Pour les profils et les articles, les photos non reprises, chacune par son entrée et son fichier. Pour les profils, ceux dont une liste a un lien qui ne nomme aucune ligne. Jamais une adresse ni un nom de fichier : la clé d'un objet peut porter le nom d'une personne.
- **Les écarts voulus** : chaque transformation faite exprès, comptée par sa référence. Une référence est un repère du registre des changements voulus (`slug-stocke`), ou une section de [`SCHEMA.md`](SCHEMA.md) pour les deux transformations qui ne changent aucune page (§1). Un écart sans référence est un défaut : la parité le montre.
- **La parité**, après un passage réel : par collection, les documents attendus, présents, égaux, refusés, différents, manquants et en trop, et l'empreinte des valeurs attendues face à celle de la cible. Un document refusé compte parmi les attendus : la parité n'est complète que sans aucun refusé. Les empreintes laissent les refusés de côté, pour que seul un écart inexpliqué les sépare. Pour les comptes, le nombre de comptes par fournisseur et de hash hérités, relus dans la cible (plan 02, I39 et I44) ; pour les profils, le nombre de profils par statut.
- **La source** : le nombre de lignes et l'empreinte de chaque table lue, avant et après, et si elle a changé.

## Les communes

La ville d'un profil est un texte libre sur l'ancien site. L'import en fait une commune du référentiel officiel, `geo.api.gouv.fr`, pour toute la France : son nom, son code INSEE, son département et son centre, gardé à deux décimales (registre, `ville-en-commune` ; plan 03, SEO-24). Le texte saisi n'est copié nulle part. Les règles sont dans `scripts/migration/import/communes.ts`, le référentiel et ses réponses gardées dans `scripts/migration/import/referentiel.ts`.

- **Ce qu'il cherche.** Le texte est lu par la règle de l'ancien site qui publie une ville (`src/lib/profil/lieu-public.ts`) : la commune de « 74000 Annecy », de « Toulouse (31) », d'une adresse postale. Il demande au référentiel les communes de ce nom et du code postal saisi, jamais une rue. « St » s'y écrit « saint », et un arrondissement donne sa ville (« Paris 16e »).
- **La commune.** Un nom que le référentiel donne une seule fois, dans le département ou avec le code postal saisi quand il y en a un, est la commune. Un code postal seul que porte une seule commune aussi (« 75116 » donne Paris), comme le nom d'une commune qui n'existe plus avec le code postal de celle qui l'a reprise.
- **Une adresse postale n'est jamais importée.** Sa commune l'est, jamais sa rue ni son numéro, et le profil est signalé dans le rapport (`adresses`).
- **À revoir.** Un texte qui nomme plusieurs communes (« Saint-Julien »), aucune, ou qui n'est pas une commune (« France », « Paris, Lyon et Annecy ») laisse la zone vide : le profil est repris, « à revoir ». Il part dans la liste de revue privée (`--revue`), avec ce qui a été demandé au référentiel et les communes qu'il pourrait être, jamais le texte saisi. Une ligne de la table de décision le tranche (`communes`, ci-dessus ; ticket 066).
- **Les réponses gardées.** Le fichier de `--communes` garde chaque réponse sous sa question (`nom:annecy`, `codePostal:74000`, `code:74010`), dans l'ordre : deux passages sur la même source donnent les mêmes communes, sans rien redemander. Il ne contient que des données publiques du référentiel et les noms demandés, jamais une rue ; il vit hors du dépôt pour les vraies données. Un référentiel qui ne répond pas, ou pas dans les 10 secondes, arrête l'import avant toute écriture ; les réponses déjà reçues restent gardées.

## Les photos

Une photo de l'ancien site n'est jamais copiée : son média est adopté là où l'objet est déjà, dans le même stockage ([`SCHEMA.md`](SCHEMA.md), §4.3 et §8 ; plan 02, I39 et I42). Les règles sont dans `scripts/migration/import/medias.ts`.

- **Ce qui est adopté.** Chaque image (JPEG, PNG, WebP, GIF, AVIF) que désigne un profil repris (photo principale, galerie) ou un article repris (galerie). Un fichier qu'aucune entrée reprise ne désigne n'est pas adopté : lié à un profil écarté, à une entrée qui n'existe plus, ou à rien. Aucun orphelin.
- **Un fichier qui n'est pas une image** (un PDF, une vidéo, un SVG) est listé, non adopté (registre, `fichiers-non-images-non-repris`) : la galerie qui le désignait ne le montre plus.
- **Où est l'objet.** Le préfixe (le dossier, vide à la racine du stockage) et le nom du fichier se lisent dans l'adresse de chaque fichier, après la base des photos de l'application. L'adresse que l'application recompose doit être celle de la source, caractère pour caractère : sinon le fichier est refusé (`adresse-hors-de-la-base`) et attend une décision (ticket 066). Le nom doit aussi être `hash` suivi de `ext` : sinon le fichier est adopté et signalé.
- **Le stockage n'est lu que par des requêtes d'en-tête**, une par objet à adopter, avant toute écriture. 200 : l'objet est là, et sa taille en octets devient `filesize` (la taille de Strapi est arrondie, en kilo-octets ; [`SCHEMA.md`](SCHEMA.md) §8, `size`). 404 : l'objet manque ; le fichier est adopté quand même, sans taille, et listé parmi les « 404 connus » : son profil garde sa photo, comme sur l'ancien site. Toute autre réponse, ou aucune dans les 10 secondes, arrête l'import avant toute écriture (code 1). Ni l'adresse ni le nom du fichier ne sont écrits dans un message.
- **Le propriétaire** d'un média est le compte du profil qui désigne son fichier ; un fichier d'article n'en a pas. Un fichier que désignent des entrées de plusieurs comptes (deux profils, ou un profil et un article) est refusé (`plusieurs-proprietaires`) : une photo n'appartient qu'à un compte. `uploaded_by` ne sert que de contrôle : un fichier qu'un autre compte a envoyé est adopté et signalé.
- **Ce qui est repris** : le texte alternatif, le préfixe et le nom, le type, la largeur et la hauteur tels quels, la taille de l'objet, les formats dérivés de Strapi tels quels en archive (`strapiFormats` : les vignettes restent où elles sont et ne deviennent pas des médias), et les dates.
- **Rien ne bouge dans le stockage** : le média est créé par l'API locale sans fichier, avec le contexte `skipCloudStorage` du greffon de stockage, qui ne touche alors ni au préfixe ni au stockage, et avec le contexte d'import, qui coupe la corbeille. Hors de l'import, un média se crée toujours avec son fichier (README, « Variables d'environnement »).
- **Une photo dont le fichier n'est pas adopté** (pas une image, refusé, aucun stockage) est signalée par son profil ou son article, jamais inventée : la photo principale reste vide, la galerie la saute.
- **Sans stockage** (la préprod), l'import ne reçoit pas de base des photos : aucun fichier n'est adopté, aucun objet n'est sondé, chaque fichier désigné est listé « sans-stockage ».
- **Compte refusé** : un fichier dont le compte est refusé par Payload (un email déjà pris, par exemple) n’est pas adopté : il est listé « compte-refuse », car un média sans propriétaire passerait pour une photo de la rédaction. Le passage suivant le prend, une fois le compte créé.

## Ce qui est repris

| Collection | Ticket | Règles |
|---|---|---|
| `pros` | 025 | Email sans espaces de bord, en minuscules ; nom (`username`), fournisseur d'origine, blocage, dates et `strapiId` tels quels ([`SCHEMA.md`](SCHEMA.md), §5.1). Le compte arrive confirmé, sans session, avec un mot de passe tiré au hasard que personne ne connaît, sans email envoyé et sans profil. Seul un hash bcrypt complet est copié dans `legacyBcrypt` ; toute autre valeur ne donne rien. Un second passage ne touche ni au mot de passe, ni au hash d'un compte inchangé |
| `media` | 058 | Voir « Les photos » ([`SCHEMA.md`](SCHEMA.md), §8) |
| `profils` | 026, 059, 060 | Seuls les profils reliés à un compte repris, un pour un (plan 02, I41). Le lien au compte (`pro`), le slug, l'ancien nom d'utilisateur (`legacyUsername`, tel quel : il sert la redirection 308), le prénom, le nom, le nom d'artiste, la spécialité, la description, le score, le badge « Super maquilleuse » (`superMaquilleuse`) et les dates, tels quels ([`SCHEMA.md`](SCHEMA.md), §5.2). Le slug est celui de l'ancien site : la règle portée (`src/lib/slug.ts`), calculée sur tous les profils de la source, le plus ancien gardant un slug que deux noms d'utilisateur donnent (registre, `slug-stocke`). Une disponibilité jamais réglée (`null`) devient « disponible » (registre, `disponibilite-par-defaut`). La ville devient une commune du référentiel, jamais une adresse (voir « Les communes »). Le statut n'est jamais écrit : le serveur le calcule à chaque enregistrement depuis ce que l'import écrit (ticket 044), brouillon pour un profil entièrement vide (registre, `profils-vides-brouillon`), publié sinon ; l'import laisse le choix du statut à la règle (`statutChoisi` à `automatique`), et compare le statut enregistré à celui que donne la règle. Les 13 profils vides laissés sans compte par le spam sont écartés et comptés (registre, `profils-spam-non-repris`). Tout autre profil sans compte, et le profil d'un compte que la table de décision écarte, arrêtent l'import, sauf si la table les écarte : ils sont alors listés. Les listes (compétences, langues, formations, expériences, prestations avec leurs options), dans l'ordre de la table de liens de Strapi, jamais dans celui des identifiants, chaque valeur telle quelle : une ligne en double reste en double, un jour est gardé à midi UTC, et le prix est le texte saisi, à l'octet près, dans `prixTexte` (son montant, `prixAPartirDe`, est le ticket 062). Une ligne qu'aucun lien ne rattache n'est pas reprise ; un lien qui ne nomme aucune ligne est signalé. Chaque ligne reçoit son identifiant de Payload, et le garde : un second passage ne réécrit pas une liste inchangée. Les réseaux (`reseaux`), les cinq liens tels quels ; le téléphone et l'email de contact sont le ticket 064. La photo principale et la galerie, dans l'ordre : les médias adoptés de leurs fichiers (voir « Les photos »), une photo non adoptée signalée |
| `articles` | 061 | Chaque champ tel quel ([`SCHEMA.md`](SCHEMA.md), §5.3), le markdown à l'octet près ; `galery` devient `galerie`. Publié avec sa date si la source a une date de publication, brouillon sans date sinon. Un slug qui n'a pas la forme d'une adresse, ou que deux articles portent, est refusé et listé : le plus ancien garde le slug. Une image de la galerie est rattachée si son fichier est adopté ; sinon elle est signalée |
| `talents` | 024 | Chaque champ tel quel ([`SCHEMA.md`](SCHEMA.md), §5.4). Publié si la source a une date de publication, brouillon sinon. Un slug qui n'a pas la forme d'une adresse, ou que deux talents portent, est refusé et listé : le plus ancien garde le slug |

## Jusqu'à la bascule seulement

L'import suit la source : chaque passage remet dans la cible ce que l'ancien site contient. C'est ce qu'il faut tant que l'ancien site est en service, puisqu'une maquilleuse peut y changer son email ou son mot de passe. Relancé après la bascule, il remettrait l'email de l'ancien site et son hash hérité sur un compte que la maquilleuse a changé dans la v3, et un ancien mot de passe ouvrirait de nouveau le compte. Rien ne l'empêche encore : les tickets de la connexion par le hash hérité (087), de l'import suivi des connexions héritées (095) et de l'import lancé depuis l'application déployée (183) en tiennent compte.

## Les tests

- `tests/unit/import-socle.test.ts` : la cible, la configuration de Payload sans changement de schéma, la ligne de commande, le contexte, la comparaison, la parité et ses refusés, le rapport, les codes de sortie, les erreurs dites par leur code. Sans base.
- `tests/integration/import-talents.test.ts` : les passages sur le banc, à blanc et réels, deux fois de suite, la source changée, la cible refusée (distante, ou sans le schéma de la v3, où rien n'est créé), le schéma jamais poussé, le rapport sans valeur.
- `tests/unit/import-comptes.test.ts` et `tests/integration/import-comptes.test.ts` : un compte repris champ par champ, les hash copiés et vérifiés, une erreur de la base qui n'en dit rien, un compte refusé que la parité compte, l'arrêt sur les emails partagés et la table de décision, le second passage, et chaque écart lu contre sa règle.
- `tests/unit/import-profils.test.ts` et `tests/integration/import-profils.test.ts` : un profil relié à son compte, son slug et son identité, la disponibilité nulle devenue vraie, le statut calculé par le serveur et le choix rendu à la règle, les 13 profils du spam écartés, l'arrêt sur un autre profil sans compte et sur le profil d'un compte écarté, le second passage, et la lecture publique qui le donne.
- `tests/unit/import-communes.test.ts` et `tests/integration/import-communes.test.ts` : la ville devenue commune (simple, avec son code postal, adresse postale sans sa rue), les cas à revoir et leur ligne de décision, la liste de revue privée, le référentiel simulé, ses pannes, ses réponses gardées pour deux passages identiques, le passage hors ligne, et la part des villes rattachées.
- `tests/unit/import-medias.test.ts` et `tests/integration/import-medias.test.ts` : l'adresse lue en préfixe et en nom, les fichiers adoptés, signalés ou refusés, les requêtes d'en-tête simulées, puis sur le banc les médias adoptés (aucun orphelin), le stockage identique avant et après sans aucun appel du client S3, l'adresse publique égale à celle de la source en 200, le « 404 connu » qui ne bloque rien, le second passage, et un média sans fichier toujours refusé hors de l'import.
- `tests/unit/import-sections.test.ts` et `tests/integration/import-profils-sections.test.ts` : chaque liste dans son ordre, options comprises, le prix saisi à l'octet près, les réseaux, la photo principale et la galerie, la photo non adoptée signalée, le lien sans ligne, et un second passage qui ne réécrit rien et garde les identifiants des lignes.
- `tests/unit/import-articles.test.ts` et `tests/integration/import-articles.test.ts` : les articles à l'identique, un brouillon de plus de 60 000 caractères, l'état et la date de publication, l'image de galerie rattachée, le PDF signalé, le slug refusé, le second passage.
- `tests/e2e/tranche-profil-importe.spec.ts` : la première tranche de bout en bout, en un seul essai. La fausse base Strapi, l'import lancé comme une personne le lance, en production comme l'application, puis la page publique du profil fictif 21 dans l'application construite : 200, son nom dans le seul h1 du HTML du serveur, aucune coordonnée ni aucun champ réservé ; un slug inconnu en 404 ; un second import qui n'écrit rien. Ce que répond la page d'un brouillon (aujourd'hui 404, demain 200 en noindex) est au ticket 104.
- `tests/integration/preprod-demarrage.test.ts` : l'import de démarrage de la préprod, sur le banc, et le lecteur `pg` de la source, qui donne le même rapport que celui de bun ([`docs/preprod.md`](../preprod.md)).
- Dans un test d'intégration, `importerSurLeBanc()` lance un passage dans le processus du test, et `commandeDImport([...])` lance la commande (`tests/outils/import.ts`).
