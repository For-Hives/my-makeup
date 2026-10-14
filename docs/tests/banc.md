# Le banc de test local

Le banc est ce contre quoi tournent les tests d'intégration : trois conteneurs, sur ce poste, que l'on démarre et que l'on jette. Rien n'y est réel. La base est vide et en mémoire, les mails n'en sortent pas, le stockage d'objets est un simulateur.

| Service | Rôle | Adresse par défaut |
|---|---|---|
| PostgreSQL 18.6 | La base, en mémoire, sans durabilité | `127.0.0.1:5443`, base `mymakeup_test` |
| Mailpit | Le capteur de mails : il reçoit tout ce que l'application envoie et ne transmet rien | SMTP `127.0.0.1:1025`, boîte et API `http://127.0.0.1:8025` |
| S3Mock | Le stockage d'objets, avec l'API S3 | `http://127.0.0.1:9090`, espace `mymakeup-test` |

La même pile sert sur un poste et en CI : `compose.test.yml`.

## Démarrer et arrêter

```sh
bun run banc:up     # démarre les trois conteneurs, rend la main quand les trois services répondent
bun run banc:down   # arrête tout, supprime conteneurs, réseau et volumes
```

`banc:up` attend au plus une minute. Images déjà téléchargées, il met environ 5 secondes (mesuré le 14/10/2026 : 4,5 s). Il ne se contente pas de l'état des conteneurs : il interroge chaque service depuis le poste.

- la base exécute une requête ;
- le capteur de mails répond en SMTP, et son API est prête ;
- le stockage a son espace.

Relancé sur un banc déjà démarré, `banc:up` ne change rien et redit les adresses.

`banc:down` ne garde rien : la base vit en mémoire, les deux autres services écrivent dans leur conteneur. Il vérifie ensuite qu'il ne reste ni conteneur ni volume au nom du banc.

Il faut Docker avec Compose. Sans démon Docker, les commandes du banc passent d'elles-mêmes par Podman quand son socket existe (`$XDG_RUNTIME_DIR/podman/podman.sock`). Une variable `DOCKER_HOST` déjà réglée est respectée.

## L'environnement du banc : `.env.test`

`.env.test` décrit le banc. Il est versionné, parce que toutes ses valeurs sont factices : elles n'ouvrent que des conteneurs jetables, sur ce poste.

| Variable | Valeur |
|---|---|
| `APP_ENV` | `test` |
| `DATABASE_URI` | La base du banc. Son nom finit par `_test` |
| `PAYLOAD_SECRET` | Un secret factice, qui ne signe que les sessions du banc |
| `NEXT_PUBLIC_SITE_URL` | L'adresse de l'application lancée contre le banc : `http://localhost:3100` |
| `SMTP_HOST`, `SMTP_PORT` | Le capteur de mails |
| `MAILPIT_URL` | L'API du capteur, par laquelle un test lit les mails reçus |
| `S3_ENDPOINT`, `S3_BUCKET` | Le stockage d'objets et son espace. Le nom de l'espace finit par `-test` |

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

Avec un décalage de 20 : base sur 5463, SMTP sur 1045, boîte sur 8045, stockage sur 9110, application sur 3120.

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

1. Elle interroge les trois services. Si l'un d'eux ne répond pas, elle s'arrête avant le premier test et dit quoi démarrer :

   ```
   Le banc de test « my-makeup-test » ne répond pas : base (127.0.0.1:5443), capteur de mails (127.0.0.1:1025), stockage d’objets (127.0.0.1:9090).
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
- **La remise à zéro ne vide que la base.** Le capteur de mails et le stockage d'objets ont leurs propres outils, qui arrivent avec leur ticket.
- **Hors du banc, rien n'est écrit.** `payloadDeTest()` et `viderLaBase()` s'arrêtent si la base réglée n'est pas exactement celle du banc de l'instance : un test lancé à la main avec un `.env` de travail ne touche pas la base de développement.

`tests/integration/banc-base.test.ts` est le test coquille : il crée un document, le relit, vide la base. Lancé seul, banc démarré, il passe en 2 à 3 secondes (mesuré le 14/10/2026 : 2,2 s, commande comprise).

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

## En CI

Les mêmes commandes : `bun run banc:up`, puis `bun run test:integration`. Lancé sans les commandes du banc (`docker compose -f compose.test.yml up -d --wait`), `compose.test.yml` démarre l'instance par défaut, sur les ports de `.env.test`.

## Images

Chaque image est épinglée par son étiquette exacte et par son empreinte, dans `compose.test.yml`.

| Image | Version | Datée du | Avis de sécurité ouverts au 14/10/2026 |
|---|---|---|---|
| `postgres` | 18.6-alpine | 17/09/2026 | Aucun : la même image que la base de développement, vérifiée au ticket 001 |
| `axllent/mailpit` | v1.31.4 | 03/10/2026 | Aucun. 15 avis dans la base GitHub et 16 sur le dépôt, tous corrigés en 1.31.2 au plus tard |
| `adobe/s3mock` | 5.2.3 | 19/09/2026 | Aucun, ni dans la base GitHub ni sur le dépôt |

- **Mailpit** : la v1.31.5 existe, mais elle n'avait que 3 jours le 14/10/2026. La règle des 7 jours donne la v1.31.4.
- **S3Mock à la place de MinIO** : le plan nommait MinIO, avec S3Mock en repli. Le 14/10/2026, MinIO ne remplit plus les conditions : son dépôt est archivé (dernier commit en avril 2026), son image n'est plus téléchargeable (Docker Hub et quay.io refusent l'accès à `minio/minio`), et le dépôt a publié 7 avis de sécurité en 2026, dont 4 élevés, corrigés seulement dans des versions de 2026 alors que la dernière version publiée sur GitHub date d'octobre 2025. S3Mock est maintenu (dernier commit le 08/10/2026) et n'a aucun avis.
- Vérifié par `gh api repos/<dépôt>/releases`, `gh api repos/<dépôt>/security-advisories` et `gh api "/advisories?ecosystem=…&affects=…"`, puis `skopeo inspect` pour les empreintes et les dates. Les paquets du système de chaque image n'ont pas été passés au scanner.

Une montée de version change l'étiquette et l'empreinte ensemble. `tests/integration/banc-pile.test.ts` vérifie que la version qui tourne est bien celle qui est épinglée.

## Limites

- **S3Mock n'est pas un vrai stockage.** Il accepte n'importe quels identifiants et ne vérifie ni les signatures ni les droits : une règle d'accès aux objets ne se prouve pas sur le banc. Il ne connaît que les adresses de la forme `http://hôte:port/espace/clé`.
- **Le banc n'écoute que sur ce poste** (`127.0.0.1`). Il n'a ni mot de passe sérieux ni chiffrement : il ne doit jamais être exposé.
- **`bun --env-file=.env.test test`** ne vaut que pour l'instance par défaut, et saute la reconstruction du schéma. Passer par `bun run test:integration`.
