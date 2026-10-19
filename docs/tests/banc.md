# Le banc de test local

Le banc est ce contre quoi tournent les tests d'intégration : six conteneurs, sur ce poste, que l'on démarre et que l'on jette. Rien n'y est réel. La base est vide et en mémoire, les mails n'en sortent pas, le stockage d'objets est un simulateur, le faux Google ne connaît que des personnes inventées, le faux Umami ne compte que les visites du banc et la fausse liste des communes répond à la place de geo.api.gouv.fr.

| Service | Rôle | Adresse par défaut |
|---|---|---|
| PostgreSQL 18.6 | La base, en mémoire, sans durabilité | `127.0.0.1:5443`, base `mymakeup_test` |
| Mailpit | Le capteur de mails : il reçoit tout ce que l'application envoie et ne transmet rien | SMTP `127.0.0.1:1025`, boîte et API `http://127.0.0.1:8025` |
| S3Mock | Le stockage d'objets, avec l'API S3 | `http://127.0.0.1:9090`, espace `mymakeup-test` |
| Faux Google | Un fournisseur OpenID Connect qui tient la place de Google pour la connexion Google | `http://127.0.0.1:7080` |
| Faux Umami | Une instance Umami qui tient la place de la vraie : elle sert un traceur et note ce que le site lui relaie | `http://127.0.0.1:4200` |

La même pile sert sur un poste et en CI : `compose.test.yml`.

## Démarrer et arrêter

```sh
bun run banc:up     # démarre les six conteneurs, rend la main quand les six services répondent
bun run banc:down   # arrête tout, supprime conteneurs, réseau et volumes
```

`banc:up` attend au plus une minute. Images déjà téléchargées, il met 5 à 7 secondes (mesuré le 14/10/2026, avec quatre services : 4,7 s, puis 6,7 s juste après un arrêt). Il ne se contente pas de l'état des conteneurs : il interroge chaque service depuis le poste.

- la base exécute une requête ;
- le capteur de mails répond en SMTP, et son API est prête ;
- le stockage a son espace ;
- le faux Google se présente sous l'adresse de l'instance ;
- le faux Umami dit qui il est ;
- la fausse liste des communes dit qui elle est.

Relancé sur un banc déjà démarré, `banc:up` ne change rien et redit les adresses.

`banc:down` ne garde rien : la base vit en mémoire, le capteur de mails et le stockage écrivent dans leur conteneur, le faux Google n'écrit nulle part. Il vérifie ensuite qu'il ne reste ni conteneur ni volume au nom du banc.

Il faut Docker avec Compose. Sans démon Docker, les commandes du banc passent d'elles-mêmes par Podman quand son socket existe (`$XDG_RUNTIME_DIR/podman/podman.sock`). Une variable `DOCKER_HOST` déjà réglée est respectée.

## L'environnement du banc : `.env.test`

`.env.test` décrit le banc. Il est versionné, parce que toutes ses valeurs sont factices : elles n'ouvrent que des conteneurs jetables, sur ce poste.

| Variable | Valeur |
|---|---|
| `APP_ENV` | `test` |
| `DATABASE_URI` | La base du banc. Son nom finit par `_test` |
| `PAYLOAD_SECRET` | Un secret factice, qui ne signe que les sessions du banc |
| `NEXT_PUBLIC_SITE_URL` | L'adresse de l'application lancée contre le banc : `http://localhost:3100` |
| `SMTP_HOST`, `SMTP_PORT` | Le capteur de mails. L'application envoie tous ses mails par ce relais |
| `MAILPIT_URL` | L'API du capteur, par laquelle un test lit les mails reçus |
| `EMAIL_FROM` | L'expéditeur des mails du banc, sur le domaine réservé `example.test`. Pas d'identifiant : le capteur n'en demande pas (`SMTP_USER` et `SMTP_PASSWORD` sont ceux du site) |
| `S3_ENDPOINT`, `S3_BUCKET` | Le stockage d'objets et son espace. Le nom de l'espace finit par `-test` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | La clé avec laquelle l'application signe ses requêtes au stockage. Le simulateur accepte toute clé : ces deux valeurs portent le mot « factice ». Sans `R2_PUBLIC_URL`, l'adresse publique d'une photo du banc est celle du simulateur : `S3_ENDPOINT`, puis l'espace, puis la clé de l'objet |
| `STRAPI_SOURCE_URI` | La fausse base Strapi que lit l'import, ouverte par un rôle qui ne peut rien y écrire. Elle vit dans le PostgreSQL du banc, dans une base à elle dont le nom finit par `_test` ([`source-strapi.md`](source-strapi.md)) |
| `GOOGLE_OIDC_ISSUER` | L'adresse du faux Google : c'est elle qui le fait prendre pour Google par l'application |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Le client factice du banc et son secret factice. Les deux portent le mot « factice » |

Règles du fichier :

- des lignes `NOM=valeur` seulement, sans guillemet ni variable dans une valeur ;
- jamais un vrai secret, jamais une adresse distante. La garde des tests les refuse, et un test vérifie que ce fichier passe la garde (`tests/unit/garde-tests.test.ts`, U87) ;
- une variable s'y ajoute par le ticket qui commence à la lire.

Le fichier décrit l'instance par défaut. Les commandes du banc le lisent elles-mêmes et y appliquent le décalage de ports de l'instance (voir plus bas) : c'est pourquoi les tests d'intégration se lancent par `bun run test:integration`, pas par `bun --env-file=.env.test test`.

## Plusieurs bancs sur le même poste

Chaque banc a un nom et ses propres ports. Deux variables d'environnement les règlent, à écrire devant chaque commande du banc :

| Variable | Rôle | Par défaut |
|---|---|---|
| `BANC_INSTANCE` | Le nom du banc. Les conteneurs et le réseau le portent | `my-makeup-test` |
| `BANC_DECALAGE` | Un nombre de 0 à 900, ajouté à chaque port de `.env.test` | `0` |

```sh
BANC_INSTANCE=ticket-018 BANC_DECALAGE=20 bun run banc:up
BANC_INSTANCE=ticket-018 BANC_DECALAGE=20 bun run test:integration
BANC_INSTANCE=ticket-018 BANC_DECALAGE=20 bun run banc:down
```

Avec un décalage de 20 : base sur 5463, SMTP sur 1045, boîte sur 8045, stockage sur 9110, faux Google sur 7100, application sur 3120.

- Deux bancs de noms et de décalages différents ne partagent rien : ni conteneur, ni réseau, ni port, ni donnée.
- Aucun décalage ne pose un banc sur un port du développement (5442 pour la base de `docker-compose.yml`, 5432, 3000).
- Si un port est déjà pris, `banc:up` s'arrête avant de démarrer quoi que ce soit, nomme les ports et propose de choisir un autre décalage.
- Un outil de test refuse d'écrire si la base réglée n'est pas celle de son instance : on ne vide jamais le banc du voisin.

## Lancer les tests d'intégration

```sh
bun run test:integration                                       # tout le dossier tests/integration/
bun run test:integration tests/integration/banc-base.test.ts   # un seul fichier
```

La commande fait trois choses :

1. Elle interroge les six services. Si l'un d'eux ne répond pas, elle s'arrête avant le premier test et dit quoi démarrer :

   ```
   Le banc de test « my-makeup-test » ne répond pas : base (127.0.0.1:5443), capteur de mails (127.0.0.1:1025), stockage d’objets (127.0.0.1:9090), faux Google (127.0.0.1:7080), faux Umami (127.0.0.1:4200), fausse liste des communes (127.0.0.1:2050).
   Démarre-le d’abord : bun run banc:up
   ```

2. Elle efface le schéma de la base du banc, puis y joue les migrations versionnées de `src/migrations/`, comme l'image de production à son premier démarrage. Elle s'arrête avant le premier test si la base qu'elles construisent ne décrit pas les collections du code (voir « Préparer la base du banc »).
3. Elle lance `bun test` sous l'environnement du banc, sans lire le fichier `.env` de travail.

Le schéma est effacé à chaque lancement : les migrations repartent d'une base vide, et rien d'un lancement précédent ne reste.

Conséquence : **lancer les tests d'intégration vide le banc**. Les données qu'on y aurait chargées à la main sont perdues.

`bun run test` ne lance que les tests unitaires : il n'a pas besoin du banc.

### Les délais, la charge et la remise à zéro de la base (ticket 225)

- **Un délai de 5 secondes est celui de bun par défaut, et il ne suffit pas sous charge.** Sur un poste qui fait tourner plusieurs bancs ou plusieurs agents à la fois (charge de 20 à 30 relevée le 16/10/2026), la suite complète a vu 20 tests dépasser 5 secondes. Un test qui expire laisse ses requêtes tourner : elles passent dans le fichier suivant, et le `TRUNCATE` de celui-ci tombe sur un interblocage (`deadlock detected`), d'où les rouges en cascade.
- **Les fichiers lourds portent donc un délai explicite**, en tête de fichier : `setDefaultTimeout(30_000)` (il ne vaut que pour ce fichier, et pour ses crochets). Les fichiers concernés : les comptes (`banc-comptes-types`, `auth-comptes-sans-mot-de-passe`, `espace-suppression`, `admin-suppression-compte`), les médias (`espace-portfolio`, `espace-photo`, `envoi-photo`, `rapprochement`) et l'import (`import-comptes`, `import-talents`, `revalidation`). Le délai borne un appel qui se bloque ; il n'est pas une durée que le test promet. Un test qui promet une durée l'écrit dans son `expect` (le « moins de 5 secondes » de `banc-comptes-types.test.ts`).
- **Un test qui vide la base attend la fin de son `TRUNCATE`** (`await viderLaBase()`, dans le test ou dans `afterEach`) avant de rendre la main : aucune requête ne doit lui survivre. `viderLaBase` n'est jamais lancée sans `await`, ni dans un `Promise.all` avec d'autres requêtes de la même base.
- **Un test d'ordre n'attend pas l'horloge.** Deux mails envoyés au même instant peuvent porter la même date : un test qui veut « le plus récent d'abord » attend le premier mail dans le capteur avant d'envoyer le second (`banc-stockage-mails.test.ts`).
- **Aucun test n'est sauté selon la commande.** `import-puis-connexion.test.ts` (ticket 095) fait partie de la suite complète : il vide la base, le capteur et le stockage avant et après, comme les autres essais de l'import, et crée puis efface sa source.

## Écrire un test d'intégration

Le fichier se range dans `tests/integration/`, en `*.test.ts`.

```ts
import { afterEach, expect, test } from 'bun:test'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

afterEach(viderLaBase)

test('un compte créé se relit', async () => {
	const payload = await payloadDeTest()

	const cree = await payload.create({
		collection: 'admins',
		data: { email: 'lea@example.test', password: crypto.randomUUID(), role: 'admin' },
	})

	expect((await payload.findByID({ collection: 'admins', id: cree.id })).email).toBe('lea@example.test')
})
```

| Outil (`tests/outils/payload-test.ts`) | Effet |
|---|---|
| `await payloadDeTest()` | Le Payload des tests, branché sur la base du banc, sans jamais en changer le schéma. Le même pour tous les fichiers d'un lancement |
| `await viderLaBase()` | Remise à zéro : vide toutes les tables et remet les compteurs à 1. Le schéma reste |
| `await compterLesDocuments()` | Le nombre de documents de chaque collection, celles de Payload comprises |
| `await compterLesLignes()` | Le nombre de lignes de chaque table, y compris celles qu'une collection cache (sessions, relations) |

Règles :

- **Chaque fichier remet la base à zéro** après ses tests (`afterEach(viderLaBase)` ou `afterAll(viderLaBase)`) : le fichier suivant part d'une base vide.
- **Aucune donnée réelle.** Les adresses sont en `@example.test`.
- **La remise à zéro ne vide que la base.** Le capteur de mails et le stockage d'objets ont chacun la leur : `viderLeCapteur()` et `viderLeStockage()`, plus bas. Un fichier qui envoie des mails ou dépose des objets les vide après ses tests.
- **Hors du banc, rien n'est écrit.** `payloadDeTest()` et `viderLaBase()` s'arrêtent si la base réglée n'est pas exactement celle du banc de l'instance : un test lancé à la main avec un `.env` de travail ne touche pas la base de développement.

`tests/integration/banc-base.test.ts` est le test coquille de la base : il crée un document, le relit, vide la base. Lancé seul, banc démarré, il passe en 2 à 3 secondes (mesuré le 14/10/2026 : 2,2 s, commande comprise).

`tests/integration/banc-stockage-mails.test.ts` est le test coquille de la base, du stockage et du capteur de mails : il écrit un document, un objet et un mail, puis relit les trois. Lancé seul, banc démarré, le fichier entier passe en 2 à 3 secondes (mesuré le 14/10/2026 : 2,3 s, commande comprise).

## Lire les mails : le capteur

Sur le banc, l'application envoie ses mails par l'adaptateur de Payload, réglé par `SMTP_HOST`, `SMTP_PORT` et `EMAIL_FROM` : tout arrive dans le capteur, et rien ne sort du poste. Un test lit ce que l'application a envoyé.

```ts
import { attendreLeMail, lienDuMail } from '../outils/mailpit'

const mail = await attendreLeMail({ pour: compte.email })

expect(mail.sujet).toBe('Vérifie ton adresse email')
const lien = lienDuMail(mail, '/auth/verification')
```

| Outil (`tests/outils/mailpit.ts`) | Effet |
|---|---|
| `await attendreLeMail({ pour, sujet? })` | Le mail reçu par cette adresse, dès qu'il est là ; le plus récent s'il y en a plusieurs. `sujet` choisit parmi eux : le sujet exact, ou un motif |
| `await mailsRecus(pour)` | Tous les mails reçus par cette adresse, le plus récent d'abord. Une liste vide si elle n'a rien reçu : rien n'est attendu |
| `lienDuMail(mail, vers)` | Le lien du mail qui mène à une page : son chemin exact (`'/auth/verification'`), ou un motif |
| `await compterLesMails()` | Le nombre de mails que tient le capteur, tous destinataires confondus |
| `await viderLeCapteur()` | Remise à zéro : supprime tous les mails du capteur |

Un mail lu porte `de`, `destinataires` (À, Cc et Cci), `repondreA`, `sujet`, `texte`, `html`, `liens` et `date`.

À savoir :

- **Un mail se cherche par son destinataire, entier.** Chaque test écrit à une adresse qui lui est propre, en `@example.test` : deux tests qui tournent en même temps ne lisent jamais le mail l'un de l'autre.
- **`liens` ne garde que les liens web**, chacun une fois : ceux de la partie HTML, lus comme un navigateur les lit (`&amp;` vaut `&`), puis les adresses que seule la partie texte contient. Un `mailto:` n'en fait pas partie.
- **`attendreLeMail` attend un état, pas une durée.** Il regarde la boîte jusqu'à trouver le mail, 2,5 secondes au plus (`delaiMs` pour en changer). Passé ce délai, son erreur dit ce que l'adresse a reçu.
- **`texte` est rendu sans le retour à la ligne final** que le transport ajoute toujours.
- **Capteur arrêté : l'erreur est dite en une phrase, tout de suite.** Chaque outil s'arrête avec le service qui ne répond pas, son adresse et la commande qui démarre le banc. Un capteur qui accepte la connexion sans répondre est abandonné au bout de 2 secondes. Dans tous les cas, moins de 5 secondes.
- **L'application, elle, ne sait pas que le capteur est arrêté** : l'envoi échoue aussitôt avec l'erreur du transport, qui nomme l'adresse du relais (`connect ECONNREFUSED 127.0.0.1:1025`).
- **Hors du banc, rien n'est lu ni vidé.** Le client s'arrête si `MAILPIT_URL`, `SMTP_HOST` ou `SMTP_PORT` ne sont pas exactement ceux du banc de l'instance.

## Déposer et relire un objet : le stockage

```ts
import { deposerUnObjet, lireUnObjet, listerLesObjets } from '../outils/s3'

await deposerUnObjet('photos/une.webp', octets, { type: 'image/webp' })

const objet = await lireUnObjet('photos/une.webp')
expect(objet?.type).toBe('image/webp')
expect(await listerLesObjets('photos/')).toEqual([{ cle: 'photos/une.webp', taille: octets.length }])
```

| Outil (`tests/outils/s3.ts`) | Effet |
|---|---|
| `await deposerUnObjet(cle, contenu, { type? })` | Dépose un objet dans l'espace du banc, à la place de celui qui avait cette clé. `contenu` est un texte ou des octets |
| `await lireUnObjet(cle)` | L'objet : sa clé, ses octets, son type. `undefined` si la clé n'existe pas |
| `await listerLesObjets(prefixe?)` | La clé et la taille de chaque objet dont la clé commence par `prefixe`, dans l'ordre des clés. Tous : les pages du stockage sont suivies jusqu'à la dernière |
| `await supprimerUnObjet(cle)` | Supprime un objet. Une clé absente n'est pas une erreur |
| `await viderLeStockage()` | Remise à zéro : supprime tous les objets de l'espace. L'espace reste |

À savoir :

- **Range les objets d'un test sous un préfixe qui lui est propre** : deux tests ne se marchent pas dessus, et une liste ne rend que les siens.
- **Une clé garde ses espaces, ses accents et ses signes.** Une clé vide, qui commence par `/`, ou qui contient un segment `.` ou `..` est refusée : elle sortirait de l'espace.
- **Ce client est un outil de test, pas la façon dont l'application écrit ses photos.** Ses requêtes ne sont pas signées, ce que S3Mock accepte : il ne lit donc aucun identifiant, et ne pourrait pas atteindre un vrai stockage.
- **Hors du banc, rien n'est lu ni vidé.** Le client s'arrête si `S3_ENDPOINT` ou `S3_BUCKET` ne sont pas exactement ceux du banc de l'instance, et il refuse toute adresse qui n'est pas sur ce poste et tout espace dont le nom ne finit pas par `-test`.
- **Stockage arrêté** : la même erreur en une phrase que pour le capteur.

### Espionner ce que l'application demande au stockage

L'application écrit ses photos par le client S3 du SDK d'AWS : le greffon de stockage et la corbeille des photos (ticket 045). Un test enregistre chacune de ses requêtes, fait tomber le stockage exprès, et échoue si l'application efface un objet :

```ts
import { espionnerLeStockage, suppressionsSansCorbeille } from '../outils/espion-s3'

const espion = espionnerLeStockage()
espion.fairePanne(commande => commande.nom === 'CopyObject') // le stockage « tombe » pour ces requêtes
// … le test …
expect(suppressionsSansCorbeille(espion.journal)).toEqual([])
espion.arreter()
```

| Outil (`tests/outils/espion-s3.ts`) | Effet |
|---|---|
| `espionnerLeStockage()` | Enregistre chaque requête de tout client S3 du processus, dans `espion.journal` : son nom (`PutObject`, `HeadObject`, `CopyObject`, `DeleteObject`…), ce qu'elle a reçu (`Key`, `CopySource`…) et si le stockage a répondu sans erreur |
| `espion.fairePanne(regle)` | Désormais, une requête pour laquelle `regle` est vraie échoue avant de partir, comme un stockage qui ne répond pas (503) |
| `espion.arreter()` | Remet le client du SDK comme avant. À appeler après chaque test, sinon le fichier suivant hérite de l'espion |
| `suppressionsSansCorbeille(journal)` | Les clés retirées sans être la seconde moitié d'un déplacement vers la corbeille : un retrait sans copie confirmée sous `deleted/`, un retrait dans la corbeille, un retrait de plusieurs objets à la fois. Vide quand l'application n'a rien effacé |

- **Il voit tout ce que fait Payload**, parce que Payload tourne dans le processus des tests, et les appels REST aussi. Il ne voit pas le client de test ci-dessus, qui passe par `fetch` : un test vide son espace librement.
- `tests/integration/media-corbeille.test.ts` s'en sert après chaque test.

## Écouter le cache de Next : l'espion

Un enregistrement d'un profil, d'un article ou d'un talent dit à Next quelles pages publiques rafraîchir (README, « Rafraîchissement des pages publiques »). Sur le banc, aucune requête de Next n'est en cours : l'espion prend la place de `revalidatePath` et `revalidateTag` le temps d'une action, et rend ce qu'elle a demandé.

```ts
import { espionnerLeCache } from '../outils/espion-cache'

const { chemins, etiquettes, appels } = await espionnerLeCache(() =>
	appelerRest('PATCH', `/api/profils/${profil.id}`, { enTetes: compte.session.enTetes, corps: { description } })
)

expect(chemins).toEqual([`/profil/${profil.slug}`, '/search', '/site-map', '/sitemap.xml'])
```

| Outil (`tests/outils/espion-cache.ts`) | Effet |
|---|---|
| `await espionnerLeCache(action)` | Lance l'action et rend ce qu'elle a demandé au cache de Next : `chemins` et `etiquettes`, triés, un doublon compté deux fois, et `appels`, chaque appel dans son ordre avec son second argument |

À savoir :

- **`next/cache` est remplacé dès le chargement du fichier, pour tout le lancement.** Hors d'un `espionnerLeCache`, ses fonctions sont celles de Next, qui refusent de rafraîchir hors d'une de ses requêtes : l'enregistrement passe sans rien rafraîchir, comme dans un script.
- **Un espion à la fois** : `espionnerLeCache` ne s'imbrique pas.
- **Il dit ce que Next reçoit, pas ce que Next fait de son cache.** Qu'une page rafraîchie montre la modification se prouve de bout en bout (ticket 117, `tests/e2e/fraicheur-pages.spec.ts`).

## Préparer la base du banc

```sh
bun run banc:prepare
```

Efface le schéma de la base du banc, puis y joue les migrations versionnées de `src/migrations/`. La base est alors vide et à jour. À lancer avant de démarrer l'application contre le banc, ou après avoir écrit une migration. Les tests d'intégration le font d'eux-mêmes.

Depuis la migration `init` (ticket 049), la base du banc n'est construite que par les migrations, comme celle de la production : rien ne pousse le schéma du code, ni la commande, ni le Payload des tests (`sansChangementDeSchema`, `tests/outils/payload-test.ts`). Une migration manquante se voit donc ici, et non en production. Une fois les migrations jouées, la commande refuse de continuer, avec un message qui dit quoi faire (`tests/outils/schema-du-banc.ts`) :

- si la base porte la trace d'une poussée du schéma, une ligne `dev` de lot -1 dans `payload_migrations` ;
- si la base que les migrations ont construite ne décrit pas les collections du code : une collection changée sans sa migration, ou une migration dont le SQL ne crée pas ce que son instantané déclare. Le message donne le SQL qu'une migration contiendrait pour la rattraper ;
- si un nom n'existe que d'un côté, à côté d'autres noms de l'autre côté : une colonne renommée sans sa migration. Le refus vient tout de suite, sans question.

Une migration qui échoue arrête aussi la commande, avec le message de Payload.

Le contrôle de la migration elle-même, sur une base effacée puis rejouée, est le test I22 : `tests/integration/migrations.test.ts`.

## Réécrire la migration `init` et vider une base

Le site n'est pas en production, et aucune base de production n'a joué une migration : le schéma tient donc dans **une seule migration, `init`**, réécrite à chaque changement de collection au lieu d'empiler des migrations de renommage (ticket 249, `PLAN-ANGLAIS.md` §7). Tant que ce n'est plus vrai, cette marche à suivre cesse : chaque changement de collection reprend sa propre migration, relue.

Pour la réécrire, banc démarré (`bun run banc:up`, ou l'instance de ton lot) :

1. Supprimer `src/migrations/*_init.ts` et `*_init.json`, et remplacer `src/migrations/index.ts` par `export const migrations = []`.
2. Lancer `bun run payload:migrate:create init`, avec `DATABASE_URI` et `PAYLOAD_SECRET` du banc dans l'environnement (`.env.test`, port décalé de l'instance). Sans migration avant elle, Payload écrit le schéma entier.
3. Remettre en forme le fichier généré comme l'ancien : `import { type MigrateDownArgs, type MigrateUpArgs, sql }`, arguments `{ db }` seuls, l'en-tête qui dit ce que fait `init`. Puis `bun run check`.
4. `bun run payload:types` et `bun run payload:importmap` : les fichiers générés ne doivent changer que si les collections ont changé.
5. `bun run schema:derive` (aucune dérive), puis `bun run banc:prepare`.

Pour vérifier qu'un regroupement ne change rien, comparer `pg_dump --schema-only` de la base bâtie par l'ancienne chaîne et de celle bâtie par la nouvelle `init`. Une seule différence est normale : l'ordre des colonnes d'une table. Une colonne ajoutée plus tard par une migration passe à la fin, alors que `init` suit l'ordre des champs de la collection. L'ordre d'une colonne ne change rien à ce qu'un programme lit.

**Vider une base** (après une réécriture de `init`, la base ne se rattrape pas par une migration) :

| Base | Commande |
|---|---|
| le banc de test | `bun run banc:prepare` (le schéma est effacé, puis rejoué), ou `bun run banc:reinitialiser` pour retrouver aussi le jeu de données ; les tests d'intégration le font d'eux-mêmes |
| la base de développement du poste (`docker-compose.yml`, port 5442) | `docker compose down -v && docker compose up -d --wait`, puis `bun run dev` : le volume `postgres-data` est effacé, et la base repart vide. Un compte admin créé là est à recréer (`bun run admin:creer`) |

## Comptes de test : la fabrique

Un appel crée un compte fictif dans la base du banc et rend sa session, prête à servir. Personne ne saisit de mot de passe.

```ts
import { creerCompte } from '../outils/fabrique-comptes'

const compte = await creerCompte('admin')
// compte.email : admin-<identifiant unique>@example.test
// compte.id, compte.collection, compte.session
```

La session est une vraie session : Payload l'ouvre par sa propre connexion et l'inscrit sur le compte. Elle se donne sous deux formes.

| Pour | Usage |
|---|---|
| Un client HTTP (`fetch`, une route appelée dans un test) | `fetch(adresse, { headers: compte.session.enTetes })` : le cookie et l'en-tête `Origin` qui va avec |
| Un navigateur (Playwright) | `await context.addCookies(compte.session.cookies)`, puis ouvrir le site à l'adresse de `NEXT_PUBLIC_SITE_URL` |

Dans un essai de bout en bout, la page s'ouvre par un chemin (`page.goto('/admin')`) : la commande `bun run test:e2e` règle l'adresse. Voir [`e2e.md`](e2e.md).

À savoir :

- **Le cookie seul ne suffit pas à un client HTTP.** L'application ignore un cookie de session qui n'arrive pas d'une origine de confiance : il faut envoyer les deux en-têtes de `session.enTetes`. Un navigateur, lui, dit de lui-même d'où part la requête.
- **Le cookie vaut pour l'adresse exacte du site.** Posé pour `http://localhost:3100`, il n'est pas envoyé à `http://127.0.0.1:3100`.
- **Chaque appel donne un compte distinct** : deux tests en parallèle ne se partagent jamais un compte. Tous disparaissent à la remise à zéro, et leurs sessions avec eux.
- **Aucun mot de passe ne sort de la fabrique.** Elle en tire un au hasard, s'en sert une fois pour ouvrir la session et l'oublie : il n'est ni rendu, ni écrit dans les journaux.
- **Un test qui doit connaître le mot de passe le choisit** : `creerCompte('maquilleuse-bloquee', { motDePasse: () => connu })`. Un compte de l'ancien site ne le reçoit jamais : son mot de passe reste inconnu, comme après l'import.
- **Hors du banc, la fabrique s'arrête avant toute écriture.** Elle vérifie l'environnement, puis la base à laquelle Payload est réellement connecté.

Les types de compte sont déclarés dans `TYPES_DE_COMPTE` (`tests/outils/fabrique-comptes.ts`) :

| Type | Collection | Ce que c'est |
|---|---|---|
| `admin` | `admins` | Un compte de l'administration avec le rôle `admin` : il peut tout |
| `redaction` | `admins` | Un compte de l'administration avec le rôle `redaction` : articles et talents, et son propre compte |
| `maquilleuse` | `pros` | Le compte d'une maquilleuse, adresse confirmée, avec son profil vide, comme à l'inscription. Deux appels donnent « A » et « B » |
| `maquilleuse-non-verifiee` | `pros` | Le compte d'une maquilleuse qui n'a pas confirmé son adresse. Il ne peut pas se connecter : `session` vaut `null` |
| `maquilleuse-sans-profil` | `pros` | Le compte d'une maquilleuse sans profil, comme certains comptes de l'ancien site. Sa création porte `CONTEXTE_SANS_PROFIL` (`src/collections/Profils.ts`) |
| `maquilleuse-bloquee` | `pros` | Le compte d'une maquilleuse bloquée par l'admin (`bloque` vrai), avec son profil. `session` vaut `null` : bloquer ferme les sessions, et la connexion la refusera (ticket 089) |
| `reprise-avec-hash` | `pros` | Un compte repris de l'ancien site avec son hash bcrypt, le hash de fixture. Il se connectera par le chemin hérité du site (ticket 087) : d'ici là, `session` vaut `null` |
| `reprise-google` | `pros` | Un ancien compte Google, sans mot de passe. Sa session est ouverte sans mot de passe, comme par la connexion Google |
| `reprise-google-avec-hash` | `pros` | Un ancien compte Google qui a aussi un hash, comme un compte réel. Session ouverte comme par Google |
| `reprise-facebook` | `pros` | Un ancien compte Facebook. Facebook n'existe plus et il n'a pas de mot de passe : `session` vaut `null` jusqu'à ce qu'il s'en crée un par « Mot de passe oublié » (ticket 093) |

Aucun mail ne part : la fabrique coupe le mail de confirmation que Payload enverrait à une nouvelle maquilleuse. Chaque maquilleuse reçoit un nom d'affichage fictif qui lui est propre, et son profil vide, sauf `maquilleuse-sans-profil`.

`tests/integration/banc-comptes-types.test.ts` crée chaque type et vérifie sa session sur « mon compte », ou qu'il n'en a pas et qu'aucun mot de passe connu ne l'ouvre. Toutes les variantes, créées puis vidées, tiennent en moins de 5 secondes : 0,9 à 1,3 s, la plus longue avec le calcul du hash de fixture (mesuré le 14/10/2026, trois passages).

Une collection de comptes y ajoute son type par une déclaration :

```ts
export const TYPES_DE_COMPTE = {
	admin: declarer({ collection: 'admins', donnees: () => ({ role: 'admin' }) }),
	redaction: declarer({ collection: 'admins', donnees: () => ({ role: 'redaction' }) }),
}
```

`donnees` rend ce que le compte porte en plus de son adresse et de son mot de passe. Le compilateur vérifie ces données contre les champs de la collection. `reprise` décrit un compte de l'ancien site, `connexion` dit comment il ouvre sa session (`declarerSansSession`, `declarerSansMotDePasse`). Un type nouveau a aussi son compte dans le jeu du banc : le compilateur le demande.

### Les comptes de l'ancien site

Les quatre types `reprise-*` sont les comptes tels que l'import les écrit (plan `01` §2.4, ticket 025) : adresse confirmée, fournisseur d'origine (`legacyProvider` : `local`, `google` ou `facebook`), identifiant de l'ancien site (`strapiId`), et un mot de passe tiré au hasard que personne ne connaît.

- **Le hash de fixture vient d'un mot de passe fictif connu** : `MOT_DE_PASSE_HERITE_DE_FIXTURE`, exporté par la fabrique. C'est lui qu'un test de la connexion héritée saisit. Le hash est au format de l'ancien site (`$2a$10$`), avec un sel fixe (`SEL_BCRYPT_DE_FIXTURE`) : c'est toujours le même.
- **Aucun hash n'est écrit dans le dépôt.** Le PostgreSQL du banc le calcule, avec pgcrypto, comme pour la fausse base Strapi. pgcrypto n'existe que le temps d'une transaction annulée : la base du banc n'en garde rien. Un test unitaire vérifie qu'aucun fichier versionné ne contient de hash bcrypt complet.
- **La connexion de Payload refuse ces comptes**, avec le message générique : ni le mot de passe d'un test, ni celui de l'ancien site ne l'ouvrent. Le chemin hérité du site (ticket 087) lira le hash.
- **Leur `strapiId` part de 1 000 000** (`strapiIdDeTest()`) : loin de ceux de la fausse base Strapi et du jeu du banc, qu'un test ne prend donc jamais.

### Une session sans mot de passe

Un compte qui n'a pas de mot de passe connu reçoit sa session comme la connexion Google la donnera : Payload inscrit une session sur le compte et signe son jeton, sans passer par le mot de passe. C'est ce que la fabrique fait pour les anciens comptes Google ; un test peut le faire pour tout compte du banc qui peut se connecter :

```ts
import { ouvrirSessionSansMotDePasse } from '../outils/session'

const session = await ouvrirSessionSansMotDePasse(payload, { collection: 'pros', id })
```

La session a les deux mêmes formes que celle de la fabrique. L'outil ne vérifie ni la confirmation ni le blocage du compte : Payload ignore la session d'un compte non confirmé, et le refus d'un compte bloqué appartient à la connexion (ticket 089).

## Le jeu du banc : un compte fixe de chaque type

Le jeu pose dans la base du banc un exemplaire fixe de chaque type de la fabrique : toujours la même adresse, le même nom, le même identifiant de l'ancien site.

```ts
import { poserLesComptesDuJeu } from '../fixtures/comptes'

const { comptes, crees, presents } = await poserLesComptesDuJeu()
```

| Ce qui est fixe | Valeur |
|---|---|
| L'adresse | `jeu-<type>@example.test` (`adresseDuJeu(type)`) : `jeu-admin@example.test`, `jeu-reprise-google@example.test`… |
| Le nom d'une maquilleuse | Il dit ce qu'est le compte : « Maquilleuse du jeu », « Bloquée du jeu », « Reprise Google du jeu »… |
| L'identifiant de l'ancien site | 900 001 à 900 004, pour les quatre comptes repris |
| L'identifiant de chaque compte | Le même sur une base vide : les comptes sont créés un par un, dans l'ordre de `COMPTES_DU_JEU` |

- **Rejouer le jeu ne crée aucun doublon.** Un compte se retrouve par son adresse ; s'il est là, il est laissé tel quel (`presents`), sinon il est créé (`crees`).
- **Aucun mot de passe, aucune session.** Chaque compte reçoit un mot de passe tiré au hasard et oublié. Un test qui veut la session d'un compte du jeu l'ouvre par `ouvrirSessionSansMotDePasse`.
- **Hors du banc, le jeu s'arrête avant toute lecture et toute écriture**, comme la fabrique.
- Les données sont dans `tests/fixtures/comptes.ts` : `COMPTES_DU_JEU`. Un chargement sur une base vide prend 2 à 2,3 s pour les dix comptes (mesuré le 14/10/2026, trois passages).

Les profils types sont la section suivante. La commande qui charge le tout (ticket 052) viendra s'ajouter au jeu.

## Le jeu du banc : les 12 profils types

Le jeu pose aussi douze profils fictifs, les types du plan `02` §6. Chacun a sa maquilleuse fictive et ses photos, et c'est toujours le même contenu.

```ts
import { poserLesProfilsDuJeu } from '@/jeu-fictif/chargement'

const { profils, crees, presents } = await poserLesProfilsDuJeu(await payloadDeTest())
// profils : pour chaque type, dans l'ordre du tableau, sa clé, son compte, son profil et son slug
```

| # | Type (`cle`) | Maquilleuse, slug | Ce que porte le profil | État calculé par le serveur |
|---|---|---|---|---|
| 1 | `reference` | Inès Morel, `ines-morel` | Complet, disponible, à Annecy, « Maquillage mariage », trois offres chiffrées, une photo principale et six photos en galerie. Il publie son téléphone et son email | Publiable, publié, 13 sur 13 |
| 2 | `ville-voisine` | Léa Garnier, `lea-garnier` | Complet, à Annemasse | Publiable, publié |
| 3 | `ville-eloignee` | Chloé Bertin, `chloe-bertin` | Complet, à Nantes | Publiable, publié |
| 4 | `indisponible` | Manon Faure, `manon-faure` | Complet, à Annecy, `disponible` faux | Publiable, publié |
| 5 | `disponibilite-inconnue` | Jade Roussel, `jade-roussel` | Complet, à Annecy, `disponible` vide (nul) | Publiable, publié |
| 6 | `vide` | Nina Perret, `nina-perret` | Rien : le profil tel que l'inscription le crée | Ni actif ni publiable, entièrement vide, brouillon, 0 sur 13 |
| 7 | `actif-non-publiable` | Clara Dumas, `clara-dumas` | Complet, mais ses offres sont « sur devis », sans montant | Actif, pas publiable, publié |
| 8 | `sans-contact-public` | Louise Girard, `louise-girard` | Complet, sans réseau ; téléphone et email enregistrés mais fermés au public | Actif, pas publiable, publié, 12 sur 13 |
| 9 | `ancien-nom-accentue` | Zoé Lefèvre, `zoe-lefevre` | Complet, à Thonon-les-Bains, avec l'ancien nom d'utilisateur « zoé lefèvre » | Publiable, publié |
| 10 | `verifiee` | Emma Chevalier, `emma-chevalier` | Complet ; vérifiée par un admin, avec le badge des cartes de la recherche | Publiable, publié |
| 11 | `masquee` | Alice Fontaine, `alice-fontaine` | Complet ; masqué par un admin (`statutChoisi`), avec un motif | Publiable, masqué |
| 12 | `textes-maximaux` | Un nom de 141 caractères, et le slug le plus long : 70 caractères | Chaque texte à la borne du serveur, le rayon à 200 km, dix photos en galerie, la commune au nom le plus long de la liste officielle | Publiable, publié |

| Ce qui est fixe | Valeur |
|---|---|
| Le compte de chaque maquilleuse | `jeu-profil-<cle>@example.test` (`adresseDuProfil(cle)`), confirmé, sous le nom du tableau. Son mot de passe est tiré au hasard et oublié aussitôt : un test qui veut sa session l'ouvre par `ouvrirSessionSansMotDePasse` |
| Les identifiants | Les mêmes sur une base vide : les types sont créés un par un, dans l'ordre du tableau. Après les comptes du jeu, ils les suivent |
| Les photos | Six fichiers WebP de 400 × 400 pixels, moins de 30 Ko chacun, sans métadonnées, dans `src/jeu-fictif/photos/`. Ils sont tirés des illustrations de `dev-assets/illustration/` : des visages dessinés, aucune personne réelle |
| Les objets du stockage | Chaque photo d'un profil est un média à elle, qui appartient au compte de la maquilleuse, sous la clé `media/jeu-<cle>-principale.webp` ou `media/jeu-<cle>-galerie-<rang>.webp` : la même à chaque chargement |
| Les coordonnées | Des numéros de la plage réservée à la fiction (06 39 98 …), des adresses et des liens sur `example.test`. Le consentement à montrer les coordonnées est daté du 01/09/2026, donné par la maquilleuse |

- **Le jeu écrit ce qu'écrit une maquilleuse ou un admin**, et rien de ce que calcule le serveur : le slug vient du nom du compte, l'état et le statut de la règle (ticket 044). Seul le profil masqué choisit son statut.
- **Rejouer le jeu ne crée rien.** Un type se retrouve par l'adresse de son compte ; s'il est là, il est laissé tel quel (`presents`), même s'il a changé.
- **Chaque type s'écrit dans une transaction.** Interrompu, il ne laisse ni compte, ni profil, ni média. Les photos déjà envoyées restent dans le stockage jusqu'au chargement suivant, qui réécrit les mêmes clés : il ne reste alors aucun objet orphelin.
- **Aucun mail ne part** : la confirmation d'un compte neuf n'est pas envoyée.
- **Hors du banc, rien n'est lu ni écrit** (`src/jeu-fictif/garde.ts`). Le jeu accepte `APP_ENV=test` avec une base de ce poste en `_test`, le stockage de ce poste dans un espace en `-test` et aucune adresse déployée. Il refuse `APP_ENV=prod`, l'adresse du site en ligne, un `APP_ENV` absent (comme dans un `.env` de développement) ou inconnu, l'absence de stockage d'objets sur le banc, et un Payload branché sur une autre base que `DATABASE_URI`. Le refus (`JeuFictifRefuse`) nomme la variable, jamais sa valeur.
- **Avec les comptes du jeu, la base tient 19 profils** : les 12 types, et les profils vides des sept comptes de maquilleuse du jeu qui en ont un (voir « Le banc complet »).
- Un chargement sur une base vide prend environ 4 secondes, et 20 à 40 millisecondes sur une base déjà remplie (mesuré le 14/10/2026, deux passages : 3,9 s et 4,0 s, puis 36 ms et 23 ms).

Les données sont dans `src/jeu-fictif/profils.ts` (`PROFILS_DU_JEU`), avec, pour chaque type, ce que le serveur doit calculer (`attendu`). Le jeu vit sous `src/` et non sous `tests/`, parce que les collections et les outils du banc le chargent sans passer par Next, et que l'image Docker ne contient pas `tests/`.

`tests/unit/jeu-fictif.test.ts` vérifie le jeu sans le banc : les douze types, l'état que leur donne la règle unique, les longueurs du profil aux textes maximaux, les six photos et la garde. `tests/integration/banc-profils-types.test.ts` le charge sur le banc : chaque profil relié à sa maquilleuse, l'état enregistré, les photos et leurs objets, le rechargement.

## Le banc complet : une commande, la session dont on a besoin

Pour travailler dans le site local sans écrire de test (voir une page connectée, l'administration, un parcours de maquilleuse), quatre gestes. Aucun compte en ligne n'est nécessaire, rien n'est réel.

```sh
bun run banc:complet         # 1. monter : la pile, la base, le jeu, l'application
bun run banc:session admin   # 2. obtenir la session dont on a besoin
bun run banc:reinitialiser   # 3. remettre à l'état de départ
bun run banc:down            # 4. tout arrêter et tout effacer
```

**1. `bun run banc:complet`**, dans cet ordre :

1. démarre les six conteneurs, ou constate qu'ils tournent déjà (`banc:up`) ;
2. remet le banc à son état de départ (voir 3) ;
3. construit l'application pour la production, sans base ni secret, comme `test:e2e` ;
4. la démarre sur le port du banc, `http://localhost:3100` par défaut, `127.0.0.1` seulement, et dit « Application prête » quand `/api/health` répond.

Elle reste au premier plan jusqu'à Ctrl+C, qui l'arrête sans arrêter le banc. Un agent la lance en arrière-plan et attend la ligne « Application prête ». `--sans-application` s'arrête après le jeu (la pile et les données, sans application). Mesuré le 14/10/2026, images déjà téléchargées : environ 10 secondes pour la pile, 10 pour le jeu, 35 pour le build et le démarrage de l'application. Sur un poste neuf, il y a en plus le téléchargement des quatre images (voir « Images »).

L'application porte le nom et le port de l'instance (`BANC_INSTANCE`, `BANC_DECALAGE`, voir « Plusieurs bancs sur le même poste »). Si le port est déjà pris, la commande le dit et s'arrête : `bun run test:e2e` démarre sa propre application sur le même port, et refuse de son côté quand celle-ci tourne.

**2. `bun run banc:session <compte>`** ouvre une session et l'écrit dans deux fichiers de `.banc/sessions/<instance>/`, que git ignore et que la CI ne publie pas :

| Compte | Qui |
|---|---|
| `admin`, `redaction`, `maquilleuse`, `maquilleuse-non-verifiee`, `maquilleuse-sans-profil`, `maquilleuse-bloquee`, `reprise-avec-hash`, `reprise-google`, `reprise-google-avec-hash`, `reprise-facebook` | Le compte de ce type dans le jeu fixe (`jeu-<type>@example.test`) |
| `profil-reference`, `profil-ville-voisine`… | La maquilleuse d'un des 12 profils types (`jeu-profil-<cle>@example.test`) |
| Une adresse | N'importe quel compte du banc, administration ou maquilleuse |

- `<compte>.etat.json` : l'état d'un contexte de navigateur de Playwright, `browser.newContext({ storageState: '…' })`, puis `/admin` ou la page voulue.
- `<compte>.entetes` : les en-têtes `Cookie` et `Origin` d'un client qui n'est pas un navigateur, `curl -H @fichier http://localhost:3100/api/admins/me`.

La commande dit le compte, la fin de la session et les deux chemins. **Le jeton n'est jamais affiché**, ni sur la sortie standard, ni dans une erreur : il n'est que dans les deux fichiers (lisibles par leur propriétaire seul). Aucun mot de passe n'existe : la session est ouverte comme le fait une connexion, sans en connaître (voir « Une session sans mot de passe »). Un compte inconnu est refusé avec la liste des noms.

**3. `bun run banc:reinitialiser`** remet le banc dans l'état où `banc:complet` le laisse, application lancée ou non, en environ 10 secondes (mesuré : 9,6 s à 10 s, deux fois de suite) :

- la base est effacée, puis reconstruite par les migrations versionnées, comme la production (voir « Préparer la base du banc ») ;
- le stockage d'objets et le capteur de mails sont vidés ;
- le jeu est chargé : un compte de chaque type du jeu fixe, les 12 profils types avec leurs photos, 3 talents, 3 articles dont un brouillon.

Les identifiants sont les mêmes à chaque fois. Les sessions ouvertes avant ne valent plus (les comptes sont recréés) : redemande-les par `banc:session`. Une application qui tourne continue de servir la même base. Les tests d'intégration et les essais de bout en bout vident aussi le banc, sans recharger le jeu : ce qu'on y avait chargé à la main est perdu.

**4. `bun run banc:down`** efface tout, comme toujours.

### Ce que contient le jeu

| Quoi | Combien | Détail |
|---|---|---|
| Comptes d'administration | 2 | `jeu-admin@example.test` (rôle `admin`), `jeu-redaction@example.test` (rôle `redaction`) |
| Comptes de maquilleuses | 20 | 8 du jeu fixe (voir « Le jeu du banc : un compte fixe de chaque type ») et 12 des profils types |
| Profils types | 12 | Les douze du tableau « Le jeu du banc : les 12 profils types », avec leurs photos |
| Talents | 3 | `maquillage-mariee`, `maquillage-soiree`, `maquillage-photo`, tous publiés |
| Articles | 3 | `preparer-sa-peau-avant-un-maquillage` et `choisir-sa-maquilleuse-pour-un-mariage` (publiés), `tendances-maquillage-de-la-saison` (brouillon, jamais lu par le public) |

Le critère « l'administration compte 12 profils » compte les **12 profils types**, ceux dont le compte est `jeu-profil-*`. La liste des profils en montre 19 : les 12 types, plus les profils vides que le serveur crée avec les 7 comptes de maquilleuse du jeu fixe qui en ont un (le compte « sans profil » n'en a pas). Le jeu fixe n'a pas été changé pour tomber sur 12 : ses comptes servent à essayer chaque type de session, et un compte de maquilleuse avec profil a son profil vide. Les talents et les articles du jeu sont écrits dans `src/jeu-fictif/redaction.ts`, sous `src/` comme les profils, comme pour le reste du jeu. Les comptes d'administration, eux, ne sont que sur le banc.

Rejouer le chargement ne crée rien : un talent ou un article se retrouve par son adresse, brouillon compris, et reste tel qu'il est.

Les tests : `tests/integration/banc-jeu-complet.test.ts` (le jeu complet, rejoué sans doublon, les commandes `banc:reinitialiser` et `banc:session` lancées comme une personne les lance), `tests/e2e/jeu-du-banc.spec.ts` (l'administration, ouverte avec l'admin du jeu, compte les 12 profils types, les 3 talents et les 3 articles dont le brouillon), `tests/unit/jeu-redaction.test.ts` et `tests/unit/banc-complet.test.ts` (sans le banc).

## La matrice d'accès

Toute règle d'accès, qui dit qui lit, crée, modifie ou supprime quoi, ajoute ses lignes à la matrice d'accès, dans le même commit : `tests/integration/payload-acces.test.ts`. Les règles elles-mêmes sont dans `src/lib/acces.ts`, et les collections les appellent.

Une ligne dit qui agit, sur quoi, et ce qui doit arriver :

```ts
{ role: 'redaction', collection: 'admins', operation: 'modifier', document: 'admin', attendu: 'refuse' },
{ role: 'redaction', collection: 'admins', operation: 'modifier', document: 'redaction', champ: 'role', valeur: 'admin', attendu: 'ignore' },
```

Chaque ligne est jouée deux fois : par l'API REST, avec la session de la fabrique, et par l'API locale avec les règles actives (`overrideAccess: false`). Cela fait un test par voie, dont le nom redit la ligne.

| Champ de la ligne | Valeurs |
|---|---|
| `role` | Qui agit : `anonyme`, ou un compte de la distribution (`admin`, `redaction`, `maquilleuse` pour « A », `autreMaquilleuse` pour « B », `sansProfil` pour un compte sans profil) |
| `collection` | La collection visée |
| `operation` | `lister`, `lire`, `creer`, `modifier`, `supprimer` |
| `document` | Le document visé, désigné par le rôle à qui il appartient (`lire`, `modifier`, `supprimer`). Sur une collection de la rédaction, dont les documents n'appartiennent à personne : `publie` ou `brouillon` |
| `champ`, `valeur` | Pour `modifier` : le champ envoyé et sa valeur. Sans eux, la matrice change un champ ordinaire de la collection. `{ compteDe: 'sansProfil' }` vaut le compte de ce rôle. Pour `lire` : `champ` seul, le champ dont la ligne regarde s'il est dans le document lu |
| `attendu` | Ce qui doit arriver, ci-dessous |

| Attendu | Ce que la matrice a constaté |
|---|---|
| `refuse` | Refusé (403 ou 404 en REST, erreur de l'API locale), et rien n'a changé en base : rien de créé, rien de modifié, rien de supprimé |
| `autorise` | Accepté, et la base le montre : le document lu est le bon, le document existe, la nouvelle valeur est stockée, le document a disparu |
| `ignore` | Accepté, mais le champ a gardé sa valeur : un champ que ce rôle ne peut pas écrire |
| `aucun`, `soi`, `tous` | Pour `lister` : une liste vide, exactement les documents de celui qui agit, ou tous les documents de la distribution |
| `publies`, `soiEtPublies` | Pour `lister` : exactement les documents de la distribution que lit le public, ou exactement ceux-là plus ceux de celui qui agit. Le portrait de la collection dit lesquels le public lit (`publics`). Sur une collection de la rédaction, `publies` : le document publié de la distribution, jamais son brouillon, et seulement des documents publiés |
| `sansProprietaire` | Pour `lister` sur `media` : exactement les photos des articles de la distribution, qui n'appartiennent à personne |
| `visible`, `absent` | Pour `lire` avec un `champ` : le document lu porte le champ, avec la valeur stockée ; ou il est lu sans ce champ, que Payload a retiré de la réponse. Les lignes de lecture des champs visent le profil publié de « A » et sa photo, que tous les rôles lisent |

Tout autre constat est `incoherent` : refusé mais écrit quand même, ou une liste que personne n'attend. Le test échoue.

À savoir :

- **La distribution est faite une fois par fichier** (`distribuer()`, `tests/outils/matrice-acces.ts`) : un compte par rôle, par la fabrique, avec ses documents. Le profil de « A » (`maquilleuse`) y est publié, celui de « B » (`autreMaquilleuse`) reste un brouillon : une ligne de lecture dit ce que le public voit, et ce qu'il ne voit pas. Les deux statuts sont choisis par un admin (`statutChoisi`) : avec sa photo, « B » serait sinon publiée par la règle du ticket 044, à la première ligne qui enregistre son profil.
- **Une ligne ne change pas la distribution.** Une valeur modifiée est remise comme avant, et une suppression qui doit réussir vise un document jetable de la même collection.
- **Une collection nouvelle** donne à la matrice son portrait (`PORTRAITS`, même fichier) : le champ ordinaire à modifier, les données d'une création, un document jetable (qui appartient à celui qui agit, quand la collection a des propriétaires), les documents que lit le public (`publics`), et `fichier` pour une collection de fichiers, dont une création envoie une photo. **Un rôle nouveau** prend un type de la fabrique (`TYPE_DU_ROLE`).
- **Les photos de la distribution** : « A » et « B » ont chacune un média, la photo principale de leur profil. La matrice vide le stockage d'objets après ses lignes.
- **Une photo de test** vient de `tests/outils/photos.ts` : un vrai PNG de 1 × 1 pixel, sous un nom à lui, pour l'API locale (`fichierPourPayload`) ou pour un formulaire (`fichierPourFormulaire`). `appelerRest` envoie un formulaire avec fichier par son option `formulaire` (`formulaireAvecFichier`, `tests/outils/rest.ts`), comme le site.
- **Les collections de la rédaction** (`COLLECTIONS_EDITORIALES` : les talents et les articles) ont des brouillons, et leurs documents n'appartiennent à personne. La distribution en tient un publié et un brouillon par collection (`contenus`), qu'une ligne désigne par `publie` ou `brouillon`. Publier, c'est modifier `_status` : `{ champ: '_status', valeur: 'published' }` sur le brouillon ; dépublier, `'draft'` sur le document publié. Leurs lignes communes sont écrites une fois (`lignesDeLaRedaction`), puis jouées pour chaque collection.
- **Les photos des articles** : chaque article de la distribution a une photo dans sa galerie, un média qui n'appartient à personne (`photosDesArticles`). Sur `media`, une ligne les désigne par l'état de leur article : `publie` pour la photo de l'article publié, `brouillon` pour celle du brouillon.
- **L'appel REST passe par la vraie route de l'application** (`appelerRest`, `tests/outils/rest.ts`), sans serveur : mêmes gestionnaires, même contrôle de session, mêmes règles. Il ne prouve pas l'aiguillage de Next lui-même, qu'un essai de bout en bout prouve.

## Le faux Google

La connexion Google se teste sans compte Google, sans secret Google et sans Internet. Le banc lance un fournisseur OpenID Connect qui tient la place de Google : il a le même document de découverte, les mêmes chemins, le même échange de code, un jeton d'identité signé et ses clés publiques. Il ne connaît que des personnes inventées.

### Le faire prendre pour Google

Une variable suffit : `GOOGLE_OIDC_ISSUER`, l'adresse du fournisseur. `.env.test` la règle sur le faux Google, avec le client factice du banc.

| Variable | Sur le banc | Sur le site |
|---|---|---|
| `GOOGLE_OIDC_ISSUER` | `http://127.0.0.1:7080` | Absente : c'est Google, `https://accounts.google.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Le client et le secret factices de `.env.test` | Ceux de la console Google, donnés au conteneur, jamais dans le dépôt |

Le fournisseur publie ses adresses dans son document de découverte, `<GOOGLE_OIDC_ISSUER>/.well-known/openid-configuration`, comme Google. Ses chemins sont ceux de Google : `/o/oauth2/v2/auth`, `/token`, `/v1/userinfo`, `/oauth2/v3/certs`.

La connexion Google de l'application (tickets 090 et 091) lit cette variable (`googleIssuer`, dans `src/lib/env.ts`) avec le client et son secret. Son code est dans `src/lib/auth/google/` : un client OpenID Connect écrit à la main (code d'autorisation, PKCE, `state` et `nonce` dans un cookie scellé, jeton d'identité vérifié RS256), la règle du compte, et le retour. Deux adresses : `/auth/google` (le départ, derrière le bouton) et `/auth/google/callback`.

Deux tests la jouent contre ce fournisseur :

```sh
bun run test:integration tests/integration/auth-google.test.ts   # les règles, avec la vraie base et le vrai faux Google
bun run test:e2e tests/e2e/connexion-google.spec.ts              # E07 : le bouton, dans un navigateur
```

Pour un essai à la main, ouvre le site du banc et clique sur « Se connecter avec Google » : sans choix, `camille.google@example.test` s'inscrit au premier passage et se connecte au suivant.

### Choisir qui se connecte

Un test choisit l'identité renvoyée et la façon dont la connexion finit. Le choix voyage avec la demande d'autorisation, dans un cookie du fournisseur.

```ts
import { fauxGoogle } from '../outils/faux-google'

const google = fauxGoogle()
const choix = google.choisir({ scenario: 'email-verifie', email: 'lea@example.test', prenom: 'Léa', nomDeFamille: 'Martin' })
```

| Pour | Usage |
|---|---|
| Un navigateur (Playwright) | `await context.addCookies(choix.cookies)`, puis cliquer sur le bouton Google du site |
| Un client HTTP (un test d'intégration) | `const retour = await google.autoriser(adresseDAutorisation, choix)` : l'outil joue le navigateur et rend l'adresse où Google le renvoie, avec `code` et `state`, ou `error` |

Les quatre scénarios :

| Scénario | Ce que voit l'application |
|---|---|
| `email-verifie` | La connexion aboutit. Le jeton d'identité dit `email_verified: true` |
| `email-non-verifie` | La connexion aboutit. Le jeton d'identité dit `email_verified: false` |
| `refus` | La personne ferme l'écran de Google : le navigateur revient avec `error=access_denied` et `state`, sans code |
| `panne` | Le navigateur revient avec un code, puis l'échange du code répond 503 avec une page et non du JSON, à chaque essai : comme une vraie panne |

À savoir :

- **Sans choix, une personne fictive se connecte**, toujours la même, à l'adresse vérifiée : `camille.google@example.test`. C'est ce qui arrive quand on clique sur le bouton Google du site local sans rien préparer.
- **La même adresse est le même compte Google.** L'identifiant Google (`sub`) se déduit de l'adresse, sans tenir compte de la casse : un second passage retrouve le même compte. Un test peut aussi donner son propre `sub`.
- **Deux tests en parallèle ne se gênent pas.** Le fournisseur ne retient aucun choix : chaque demande porte le sien.
- **Une adresse est toujours fictive.** Hors d'un domaine en `.test`, l'outil refuse l'identité, et le fournisseur refait le contrôle de son côté.
- **Google ne dit que ce qu'on lui demande.** Sans la portée `email`, le jeton n'a pas d'adresse ; sans `profile`, pas de nom. La photo (`picture`) n'est rendue que si le test en donne une.
- **L'outil ne parle qu'au faux Google.** `google.autoriser` refuse une adresse qui n'est pas la sienne : si l'application a construit une adresse vers Google, le test échoue sans que rien ne parte.

### Ce qu'il refuse, comme Google

- un autre client que le client factice du banc : page d'erreur 401 `invalid_client` ;
- une adresse de retour qui n'est pas sur ce poste (`localhost` ou `127.0.0.1`) : page d'erreur 400 `redirect_uri_mismatch`, et le navigateur n'est renvoyé nulle part ;
- un secret faux à l'échange du code : 401 `invalid_client` ;
- un code déjà échangé, ou vieux de plus d'une minute : 400 `invalid_grant` ;
- une adresse de retour différente entre la demande et l'échange : 400 `redirect_uri_mismatch` ;
- une preuve PKCE absente ou fausse quand la demande portait un défi : 400 `invalid_grant`.

### Le test coquille

`tests/integration/banc-faux-google.test.ts` joue un aller-retour complet contre le conteneur : demande d'autorisation avec état, nonce et défi PKCE, retour avec le code, échange, signature du jeton d'identité vérifiée contre les clés publiées, lecture du profil. Puis les quatre scénarios, un par un. Chaque aller-retour doit tenir en moins de 5 secondes ; il prend 10 à 50 millisecondes (mesuré le 14/10/2026).

```sh
bun run test:integration tests/integration/banc-faux-google.test.ts
```

`google.allerRetour(choix)` est cet aller-retour, prêt à l'emploi. Il prouve le fournisseur : ce n'est pas la connexion de l'application.

Le fournisseur se teste aussi sans le banc, appelé comme une fonction : `bun --no-env-file test tests/unit/banc-faux-google.test.ts`.

### Aucun secret Google réel

- Le client et le secret de `.env.test` sont inventés et portent le mot « factice ». Le fournisseur refuse de démarrer avec une valeur qui ne le porte pas, et la garde des tests arrête tout lancement qui en contient une.
- La garde arrête aussi un lancement qui viserait Google lui-même : `GOOGLE_OIDC_ISSUER` doit être locale, et un client Google réglé sans elle est refusé.
- La clé qui signe les jetons est tirée au démarrage du conteneur. Elle n'est écrite nulle part et change à chaque démarrage.
- **Le site refuse un fournisseur local.** Avec une adresse de site déployée dans `NEXT_PUBLIC_SITE_URL`, une `GOOGLE_OIDC_ISSUER` locale arrête l'application au démarrage (README, « Configuration durcie »).

Le code est dans `tests/outils/faux-google/` : `fournisseur.ts` (le fournisseur), `identite.ts` (scénarios et identités), `serveur.ts` (ce que lance le conteneur). L'outil des tests est `tests/outils/faux-google.ts`.

## Le rapprochement du stockage et de la base

`bun run banc:rapprocher` (ticket 137, plan 02 I27 et §10.1 point 5) compare les objets du stockage du banc aux médias de sa base. Il ne supprime rien et n'écrit rien : il liste le stockage, lit la base, et n'a aucune option qui supprime. La même règle (`src/lib/rapprochement.ts`) servira au contrôle complet d'avant purge, sur d'autres données.

Il nomme trois sortes d'orphelins, par clé d'objet ou par identifiant, sans aucune donnée personnelle :

- **un objet sans média** : une clé du stockage qu'aucun média ne nomme (hors corbeille) ;
- **un média sans objet** : un média dont l'objet d'origine ou une taille dérivée manque ;
- **un média sans profil** : un média qu'aucune photo principale, aucune galerie de profil, aucun article (versions comprises) ne désigne.

La corbeille (`deleted/`) est comptée à part, comme les vignettes de l'ancien site décrites dans `media.strapiFormats` : ce ne sont pas des orphelins. Code de sortie 0 sans orphelin (« 0 orphelin »), 1 avec, 2 si le banc ne répond pas. Avec `--json`, la sortie est le rapport en JSON. Avec `--hors-import`, les médias que l'import a repris de l'ancien site (`strapiId`) restent listés mais ne comptent pas pour le code de sortie : c'est l'option de la CI, parce que l'essai de bout en bout de l'import efface sa fausse source à la fin, et que les médias repris perdent alors leurs objets exprès. Le contrôle complet d'avant purge se lance sans l'option.

En CI, l'étape « Reconcile the storage and the database » du job `e2e` le lance (avec `--hors-import`) après les essais de bout en bout : à ce moment, les objets hors corbeille doivent être exactement ceux des photos des profils et des articles. Un orphelin fait passer l'étape au rouge, donc `ci-ok` au rouge. `tests/integration/rapprochement.test.ts` prouve les trois sortes d'orphelins, l'absence de toute écriture et le code de sortie ; `tests/ci/garde-fous-ci.test.ts` garde l'étape dans le workflow.

## La fausse base Strapi

L'import lit l'ancienne base Strapi. Sur le banc, il lit une fausse base qui porte chaque cas connu de la vraie, avec ses photos dans le stockage d'objets, et qu'un rôle en lecture seule ouvre. Une commande la crée, à l'identique à chaque fois :

```sh
bun run banc:source
```

Son contenu, son inventaire, son empreinte et ses outils de test : [`source-strapi.md`](source-strapi.md).

## En CI

Les mêmes commandes, dans le job `integration` de `.github/workflows/ci.yml`, en trois lots côte à côte : `bun run banc:up`, puis `bun run test:integration --shard=N/3`. bun répartit les fichiers de tests entre les lots, un fichier sur trois dans l'ordre alphabétique ; chaque lot démarre son propre banc, si bien que deux lots ne partagent jamais une base. Pour rejouer un lot sur un poste, banc démarré : `bun run test:integration --shard=2/3`. Le banc y tourne sous le nom et sur les ports par défaut, avec le Docker de la machine de GitHub. Chaque lot du job `e2e` démarre aussi le sien ([`e2e.md`](e2e.md), « En CI »). Un job en échec rend `ci-ok` rouge ([`docs/qualite.md`](../qualite.md), « Ce que lance la CI »).

Lancé sans les commandes du banc (`docker compose -f compose.test.yml up -d --wait`), `compose.test.yml` démarre l'instance par défaut, sur les ports de `.env.test`.

## Images

Chaque image est épinglée par son étiquette exacte et par son empreinte, dans `compose.test.yml`.

| Image | Version | Datée du | Avis de sécurité ouverts au 14/10/2026 |
|---|---|---|---|
| `postgres` | 18.6-alpine | 17/09/2026 | Aucun : la même image que la base de développement, vérifiée au ticket 001 |
| `axllent/mailpit` | v1.31.4 | 03/10/2026 | Aucun. 15 avis dans la base GitHub et 16 sur le dépôt, tous corrigés en 1.31.2 au plus tard |
| `adobe/s3mock` | 5.2.3 | 19/09/2026 | Aucun, ni dans la base GitHub ni sur le dépôt |
| `oven/bun` | 1.3.14 | 13/05/2026 | Aucun : la même image, à la même empreinte, que celle du `Dockerfile`, vérifiée au ticket 001 |

- **Mailpit** : la v1.31.5 existe, mais elle n'avait que 3 jours le 14/10/2026. La règle des 7 jours donne la v1.31.4.
- **S3Mock à la place de MinIO** : le plan nommait MinIO, avec S3Mock en repli. Le 14/10/2026, MinIO ne remplit plus les conditions : son dépôt est archivé (dernier commit en avril 2026), son image n'est plus téléchargeable (Docker Hub et quay.io refusent l'accès à `minio/minio`), et le dépôt a publié 7 avis de sécurité en 2026, dont 4 élevés, corrigés seulement dans des versions de 2026 alors que la dernière version publiée sur GitHub date d'octobre 2025. S3Mock est maintenu (dernier commit le 08/10/2026) et n'a aucun avis.
- **bun pour le faux Google** : ce n'est pas une image de plus. Le faux Google est du code de ce dépôt (`tests/outils/faux-google/`), lu en lecture seule par le conteneur, et lancé par le bun qui construit déjà l'image du site. Un test vérifie que les deux références sont identiques (`tests/unit/banc-pile.test.ts`).
- Vérifié par `gh api repos/<dépôt>/releases`, `gh api repos/<dépôt>/security-advisories` et `gh api "/advisories?ecosystem=…&affects=…"`, puis `skopeo inspect` pour les empreintes et les dates. Les paquets du système de chaque image n'ont pas été passés au scanner.

Une montée de version change l'étiquette et l'empreinte ensemble. `tests/integration/banc-pile.test.ts` vérifie que la version qui tourne est bien celle qui est épinglée.

## Limites

- **S3Mock n'est pas un vrai stockage.** Il accepte n'importe quels identifiants et ne vérifie ni les signatures ni les droits : une règle d'accès aux objets ne se prouve pas sur le banc. Il ne connaît que les adresses de la forme `http://hôte:port/espace/clé`.
- **Le capteur n'est pas un vrai relais.** Il ne demande ni identifiant ni chiffrement, et l'application n'en règle aucun pour l'instant : un envoi par un vrai fournisseur ne se prouve pas sur le banc.
- **Le faux Google n'est pas Google.** Il n'a ni écran de connexion, ni écran de consentement, ni jeton de rafraîchissement, ni révocation. Il ne connaît qu'un client. Son adresse est en `http` et son émetteur n'est pas `https://accounts.google.com` : ce que l'application ferait d'un vrai certificat ou du vrai émetteur ne se prouve pas sur le banc.
- **Le faux Google lit son code dans le dépôt.** Le conteneur monte `tests/outils/faux-google/` en lecture seule. Après un changement dans ce dossier, relancer `bun run banc:down` puis `bun run banc:up`. Sur un poste où SELinux est actif (Fedora, avec Podman), ce montage demande `label=disable`, déjà réglé dans `compose.test.yml`.
- **Le banc n'écoute que sur ce poste** (`127.0.0.1`). Il n'a ni mot de passe sérieux ni chiffrement : il ne doit jamais être exposé.
- **`bun --env-file=.env.test test`** ne vaut que pour l'instance par défaut, et saute la reconstruction de la base par les migrations : le Payload des tests ne crée aucune table. Passer par `bun run test:integration`.

## Le faux Umami

La mesure d'audience se teste sans la vraie instance Umami. Le site relaie sa mesure vers l'adresse de `UMAMI_ORIGIN` (voir [`docs/mesure/umami.md`](../mesure/umami.md)) ; `.env.test` la règle sur le faux Umami, et la garde des tests refuse toute autre instance.

Il tient la place de la vraie sur deux chemins, ceux que le site relaie :

| Chemin | Ce qu'il fait |
|---|---|
| `GET /script.js` | Sert un traceur de remplacement : il lit les mêmes attributs que le vrai (`data-website-id`, `data-host-url`, `data-domains`, `data-tag`, `data-before-send`), envoie une page vue au chargement, passe par le filtre de la page avant chaque envoi et expose `window.umami.track` |
| `POST /api/send` | Note l'envoi : son corps, et si un cookie, un Referer, un en-tête d'autorisation et l'adresse du visiteur l'accompagnaient. La valeur d'un cookie n'est jamais gardée |
| `GET` et `DELETE /_recus` | Lit, puis oublie, ce qui a été reçu |
| `GET /_sante` | Dit qui répond : la sonde du banc |

Un test le lit par `fauxUmami()` (`tests/outils/faux-umami.ts`) : `recus()`, `envois('cta_click')` et `vider()`. Le traceur est un remplaçant, pas une copie du vrai : il prouve ce que le site lui donne et ce qu'il relaie, pas le comportement de la version d'Umami en ligne.

Le navigateur de Playwright se déclare automatisé (`navigator.webdriver`, agent `HeadlessChrome`), et le filtre du site refuse de le mesurer. Un essai qui veut voir arriver une mesure joue un navigateur ordinaire : un agent d'un Chrome ordinaire et `webdriver` à faux (`tests/e2e/mesure-umami.spec.ts`).

Les noms d'hôte que le traceur compte sont ceux du banc (`NEXT_PUBLIC_UMAMI_DOMAINS` de `.env.test`) ; le build des essais de bout en bout les reçoit, parce que les pages les figent.

## La fausse liste des communes

L'espace de la maquilleuse demande la liste officielle des communes (geo.api.gouv.fr) : quand elle cherche sa commune, et quand elle l'enregistre (`src/lib/espace/referentiel-communes.ts`). Depuis les machines de la CI, la vraie liste répondait parfois en plus de 5 secondes, ou pas du tout, et les essais qui choisissent une commune échouaient avec elle (CI du 15/10/2026). L'application des essais de bout en bout ne l'appelle donc plus : elle demande la fausse liste du banc, `tests/outils/faux-communes/`, qui répond aux mêmes questions à partir de quelques communes de la liste officielle (celles du jeu fictif et de la fabrique de profils, et Lillers et Lillebonne, qui partagent le début du nom de Lille).

| Chemin | Ce qu'il fait |
|---|---|
| `GET /communes?nom=…` | Les communes dont le nom contient le texte, accents et majuscules mis à part : le nom exact d'abord, puis les plus peuplées ; `limit` borne la réponse |
| `GET /communes?codePostal=…` | Les communes d'un code postal |
| `GET /communes/<code INSEE>` | Une commune, ou 404 en texte, comme la liste officielle |
| `GET /_sante` | Dit qui répond : la sonde du banc |

- `.env.test` donne son adresse sous `FAUSSES_COMMUNES`. `bun run test:e2e` et `bun run banc:complet` la passent à l'application sous `COMMUNES_DU_BANC` (`tests/outils/e2e.ts`), et à elle seule.
- Les tests d'intégration ne la voient pas : ils simulent la liste officielle elle-même, par `simuler`, pour jouer aussi ses pannes ([`http-sortant.md`](http-sortant.md)).
- Comme `IMAGES_DU_BANC`, la production ne règle jamais `COMMUNES_DU_BANC` : une valeur qui n'est pas exactement `http://127.0.0.1:PORT` (ou `localhost`), ou qui est donnée à un site déployé, est refusée bruyamment au lieu d'être suivie (`tests/unit/banc-fausses-communes.test.ts`).
- Un essai qui a besoin d'une autre commune l'ajoute à `COMMUNES` de `tests/outils/faux-communes/fournisseur.ts`, avec les données de la liste officielle : nom, code INSEE, département, codes postaux, centre.
