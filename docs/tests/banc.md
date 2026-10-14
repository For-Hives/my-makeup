# Le banc de test local

Le banc est ce contre quoi tournent les tests d'intégration : quatre conteneurs, sur ce poste, que l'on démarre et que l'on jette. Rien n'y est réel. La base est vide et en mémoire, les mails n'en sortent pas, le stockage d'objets est un simulateur, et le faux Google ne connaît que des personnes inventées.

| Service | Rôle | Adresse par défaut |
|---|---|---|
| PostgreSQL 18.6 | La base, en mémoire, sans durabilité | `127.0.0.1:5443`, base `mymakeup_test` |
| Mailpit | Le capteur de mails : il reçoit tout ce que l'application envoie et ne transmet rien | SMTP `127.0.0.1:1025`, boîte et API `http://127.0.0.1:8025` |
| S3Mock | Le stockage d'objets, avec l'API S3 | `http://127.0.0.1:9090`, espace `mymakeup-test` |
| Faux Google | Un fournisseur OpenID Connect qui tient la place de Google pour la connexion Google | `http://127.0.0.1:7080` |

La même pile sert sur un poste et en CI : `compose.test.yml`.

## Démarrer et arrêter

```sh
bun run banc:up     # démarre les quatre conteneurs, rend la main quand les quatre services répondent
bun run banc:down   # arrête tout, supprime conteneurs, réseau et volumes
```

`banc:up` attend au plus une minute. Images déjà téléchargées, il met 5 à 7 secondes (mesuré le 14/10/2026, avec les quatre services : 4,7 s, puis 6,7 s juste après un arrêt). Il ne se contente pas de l'état des conteneurs : il interroge chaque service depuis le poste.

- la base exécute une requête ;
- le capteur de mails répond en SMTP, et son API est prête ;
- le stockage a son espace ;
- le faux Google se présente sous l'adresse de l'instance.

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
| `EMAIL_FROM` | L'expéditeur des mails du banc, sur le domaine réservé `example.test` |
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

1. Elle interroge les quatre services. Si l'un d'eux ne répond pas, elle s'arrête avant le premier test et dit quoi démarrer :

   ```
   Le banc de test « my-makeup-test » ne répond pas : base (127.0.0.1:5443), capteur de mails (127.0.0.1:1025), stockage d’objets (127.0.0.1:9090), faux Google (127.0.0.1:7080).
   Démarre-le d’abord : bun run banc:up
   ```

2. Elle efface le schéma de la base du banc. Payload le reconstruit depuis les collections du code au début des tests.
3. Elle lance `bun test` sous l'environnement du banc, sans lire le fichier `.env` de travail.

Le schéma est effacé à chaque lancement pour une raison précise. Quand une collection a changé, Payload demande une confirmation avant de modifier une base qui contient déjà des tables. Dans un lancement de tests, personne ne répond. Sur une base vide, il ne demande rien.

Conséquence : **lancer les tests d'intégration vide le banc**. Les données qu'on y aurait chargées à la main sont perdues.

`bun run test` ne lance que les tests unitaires : il n'a pas besoin du banc.

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
| `await payloadDeTest()` | Le Payload des tests, branché sur la base du banc. Le même pour tous les fichiers d'un lancement |
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

## Préparer la base du banc

```sh
bun run banc:prepare
```

Efface le schéma de la base du banc, puis le reconstruit depuis les collections du code. La base est alors vide et à jour. À lancer avant de démarrer l'application contre le banc, ou après avoir changé une collection. Les tests d'intégration le font d'eux-mêmes.

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

Les profils types (ticket 051) et la commande qui charge le tout (ticket 052) viendront s'ajouter au jeu.

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
| `visible`, `absent` | Pour `lire` avec un `champ` : le document lu porte le champ, avec la valeur stockée ; ou il est lu sans ce champ, que Payload a retiré de la réponse. Les lignes de lecture des champs visent le profil publié de « A » et sa photo, que tous les rôles lisent |

Tout autre constat est `incoherent` : refusé mais écrit quand même, ou une liste que personne n'attend. Le test échoue.

À savoir :

- **La distribution est faite une fois par fichier** (`distribuer()`, `tests/outils/matrice-acces.ts`) : un compte par rôle, par la fabrique, avec ses documents. Le profil de « A » (`maquilleuse`) y est publié, celui de « B » (`autreMaquilleuse`) reste un brouillon : une ligne de lecture dit ce que le public voit, et ce qu'il ne voit pas.
- **Une ligne ne change pas la distribution.** Une valeur modifiée est remise comme avant, et une suppression qui doit réussir vise un document jetable de la même collection.
- **Une collection nouvelle** donne à la matrice son portrait (`PORTRAITS`, même fichier) : le champ ordinaire à modifier, les données d'une création, un document jetable (qui appartient à celui qui agit, quand la collection a des propriétaires), les documents que lit le public (`publics`), et `fichier` pour une collection de fichiers, dont une création envoie une photo. **Un rôle nouveau** prend un type de la fabrique (`TYPE_DU_ROLE`).
- **Les photos de la distribution** : « A » et « B » ont chacune un média, la photo principale de leur profil. La matrice vide le stockage d'objets après ses lignes.
- **Une photo de test** vient de `tests/outils/photos.ts` : un vrai PNG de 1 × 1 pixel, sous un nom à lui, pour l'API locale (`fichierPourPayload`) ou pour un formulaire (`fichierPourFormulaire`). `appelerRest` envoie un formulaire avec fichier par son option `formulaire` (`formulaireAvecFichier`, `tests/outils/rest.ts`), comme le site.
- **Les collections de la rédaction** (`COLLECTIONS_EDITORIALES` : les talents, puis les articles) ont des brouillons, et leurs documents n'appartiennent à personne. La distribution en tient un publié et un brouillon par collection (`contenus`), qu'une ligne désigne par `publie` ou `brouillon`. Publier, c'est modifier `_status` : `{ champ: '_status', valeur: 'published' }` sur le brouillon ; dépublier, `'draft'` sur le document publié.
- **L'appel REST passe par la vraie route de l'application** (`appelerRest`, `tests/outils/rest.ts`), sans serveur : mêmes gestionnaires, même contrôle de session, mêmes règles. Il ne prouve pas l'aiguillage de Next lui-même, qu'un essai de bout en bout prouve.

## Le faux Google

La connexion Google se teste sans compte Google, sans secret Google et sans Internet. Le banc lance un fournisseur OpenID Connect qui tient la place de Google : il a le même document de découverte, les mêmes chemins, le même échange de code, un jeton d'identité signé et ses clés publiques. Il ne connaît que des personnes inventées.

### Le faire prendre pour Google

Une variable suffit : `GOOGLE_OIDC_ISSUER`, l'adresse du fournisseur. `.env.test` la règle sur le faux Google, avec le client factice du banc.

| Variable | Sur le banc | Sur le site et sa préprod |
|---|---|---|
| `GOOGLE_OIDC_ISSUER` | `http://127.0.0.1:7080` | Absente : c'est Google, `https://accounts.google.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Le client et le secret factices de `.env.test` | Ceux de la console Google, donnés au conteneur, jamais dans le dépôt |

Le fournisseur publie ses adresses dans son document de découverte, `<GOOGLE_OIDC_ISSUER>/.well-known/openid-configuration`, comme Google. Ses chemins sont ceux de Google : `/o/oauth2/v2/auth`, `/token`, `/v1/userinfo`, `/oauth2/v3/certs`.

La connexion Google elle-même n'existe pas encore dans l'application : elle arrive avec son ticket (090), qui lira cette variable (`googleIssuer`, dans `src/lib/env.ts`) et ajoutera le client et son secret. Le banc fournit déjà le fournisseur, la variable et ses garde-fous.

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
- **Le site et sa préprod refusent un fournisseur local.** Avec une adresse de site déployée dans `NEXT_PUBLIC_SITE_URL`, une `GOOGLE_OIDC_ISSUER` locale arrête l'application au démarrage (README, « Configuration durcie »).

Le code est dans `tests/outils/faux-google/` : `fournisseur.ts` (le fournisseur), `identite.ts` (scénarios et identités), `serveur.ts` (ce que lance le conteneur). L'outil des tests est `tests/outils/faux-google.ts`.

## La fausse base Strapi

L'import lit l'ancienne base Strapi. Sur le banc, il lit une fausse base qui porte chaque cas connu de la vraie, avec ses photos dans le stockage d'objets, et qu'un rôle en lecture seule ouvre. Une commande la crée, à l'identique à chaque fois :

```sh
bun run banc:source
```

Son contenu, son inventaire, son empreinte et ses outils de test : [`source-strapi.md`](source-strapi.md).

## En CI

Les mêmes commandes, dans le job `integration` de `.github/workflows/ci.yml` : `bun run banc:up`, puis `bun run test:integration`. Le banc y tourne sous le nom et sur les ports par défaut, avec le Docker de la machine de GitHub. Chaque lot du job `e2e` démarre aussi le sien ([`e2e.md`](e2e.md), « En CI »). Un job en échec rend `ci-ok` rouge ([`docs/qualite.md`](../qualite.md), « Ce que lance la CI »).

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
- **`bun --env-file=.env.test test`** ne vaut que pour l'instance par défaut, et saute la reconstruction du schéma. Passer par `bun run test:integration`.
