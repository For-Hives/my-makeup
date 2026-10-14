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
		data: { email: 'lea@example.test', password: crypto.randomUUID() },
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

`tests/integration/banc-stockage-mails.test.ts` est le test coquille des trois services : il écrit un document, un objet et un mail, puis relit les trois. Lancé seul, banc démarré, le fichier entier passe en 2 à 3 secondes (mesuré le 14/10/2026 : 2,3 s, commande comprise).

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
- **Hors du banc, la fabrique s'arrête avant toute écriture.** Elle vérifie l'environnement, puis la base à laquelle Payload est réellement connecté.

Les types de compte sont déclarés dans `TYPES_DE_COMPTE` (`tests/outils/fabrique-comptes.ts`). Aujourd'hui il n'y en a qu'un, `admin`, le compte d'administration du squelette. Une collection de comptes y ajoute son type par une déclaration :

```ts
export const TYPES_DE_COMPTE = {
	admin: declarer({ collection: 'admins', donnees: () => ({}) }),
	// maquilleuse: declarer({ collection: 'pros', donnees: () => ({ … }) }),
}
```

`donnees` rend ce que le compte porte en plus de son adresse et de son mot de passe. Le compilateur vérifie ces données contre les champs de la collection.

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

## En CI

Les mêmes commandes : `bun run banc:up`, puis `bun run test:integration`. Lancé sans les commandes du banc (`docker compose -f compose.test.yml up -d --wait`), `compose.test.yml` démarre l'instance par défaut, sur les ports de `.env.test`.

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
