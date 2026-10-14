# My Makeup

Annuaire de maquilleuses professionnelles indépendantes : [my-makeup.fr](https://my-makeup.fr).

## Branche `v3`

Cette branche porte la réécriture du site : une seule application Next.js et Payload, en TypeScript strict.

- Le site en ligne reste celui de la branche `main` tant que la bascule n'a pas eu lieu.
- L'ancien code (Next.js 15 en JavaScript, branché sur l'API Strapi) a été retiré de cette branche. Il reste lisible sur `main` et dans l'historique.
- `public/` est conservé : il contient les fichiers de vérification des moteurs de recherche, qui doivent continuer à répondre à la racine du site.
- `dev-assets/` est conservé : ce sont les sources de design.

## Suivre la migration

Deux documents, sous `docs/migration/` :

- [`CHANGEMENTS-VOULUS.md`](docs/migration/CHANGEMENTS-VOULUS.md) : le registre de tout ce que la v3 fait autrement que le site actuel, par décision. À la répétition de la bascule, seuls ces écarts sont acceptés.
- [`JOURNAL.md`](docs/migration/JOURNAL.md) : les faits datés de la migration.

## Ce que contient le squelette

Une application, trois zones, toutes sous `src/app/` :

| Zone | Dossier | Adresse | État |
|---|---|---|---|
| Pages publiques | `(front)/(site)/` | `/` | Page d'accueil provisoire |
| Espace maquilleuse | `(front)/(espace)/auth/` | `/auth` | Page d'attente |
| Administration | `(payload)/` | `/admin` et `/api` | Générée par Payload, une collection de comptes `admins` |

Les noms entre parenthèses rangent les fichiers et n'apparaissent pas dans les adresses.

Les pages publiques et l'espace maquilleuse partagent une seule coquille HTML, `(front)/layout.tsx` : passer de l'une à l'autre se fait sans recharger la page, comme sur le site actuel. L'administration a la sienne, générée par Payload, et ne charge pas la feuille de style du site.

Le reste :

- `src/payload.config.ts` : la configuration de Payload (base PostgreSQL, collection `admins`).
- `src/lib/env.ts` : les variables d'environnement, vérifiées au démarrage par `src/instrumentation.ts`.
- `src/migrations/` : les migrations versionnées de la base.
- `src/payload-types.ts` et `src/app/(payload)/admin/importMap.js` : fichiers générés par Payload, versionnés, jamais modifiés à la main.
- `docker-compose.yml` : la base PostgreSQL de développement.
- `.env.exemple` : la liste des variables d'environnement, sans aucune valeur.
- `tests/` : les tests. Un composant React s'y teste seul, sans navigateur : voir `docs/tests/composants.md`.

Les versions sont figées dans `package.json`, et `bun.lock` est le seul fichier de verrouillage.

### Complétude d'un profil

Une seule règle dit où en est un profil : `src/lib/profil/completude.ts`. Elle est portée de l'ancien site sans changement. Le schéma, l'espace maquilleuse, la recherche et le sitemap passent tous par elle, sans refaire le calcul de leur côté.

Elle donne :

- le score sur 13 et la liste des manques, pour la barre de progression ;
- les six conditions du profil publiable : photo principale, ville exploitable, spécialité, offre avec un prix chiffré, description d'au moins 200 caractères, canal de contact ;
- `actif` : photo principale, ville exploitable et spécialité ;
- `publiable` : les six conditions, sauf pour un compte interne, qui ne l'est jamais ;
- `entierementVide` : aucune des six conditions. Un profil qui n'a qu'un nom est entièrement vide ; une seule condition remplie suffit à ne plus l'être.

Le formulaire de devis ne compte pas comme canal de contact.

La règle lit les champs sous leurs noms de l'ancien site (type `ChampsDuProfil`) : le code qui l'appelle fait la correspondance depuis son propre document. Une photo se passe comme un objet ou une liste, jamais comme un simple identifiant, qui compterait comme « pas de photo ».

Les tests sont dans `tests/unit/completude.test.ts` et se lancent seuls avec `bun test tests/unit/completude.test.ts`. Deux fichiers de `tests/unit/fixtures/` servent de référence :

- `completude-cas.json` : les cas partagés avec l'ancien site, copiés tels quels ;
- `completude-ancien-site.json` : les réponses du code de l'ancien site sur ces cas et sur ceux de son API. Ces valeurs ne se corrigent jamais à la main : un écart est un défaut du port.

## Démarrer en local

Il faut [bun](https://bun.sh) 1.3.14, Node 24 (`.nvmrc`), Docker avec Compose et `openssl`.

### 1. Installer

```sh
bun install --frozen-lockfile
```

### 2. Créer le fichier `.env` (une seule fois)

```sh
test -e .env || printf 'DATABASE_URI=postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev\nPAYLOAD_SECRET=%s\n' "$(openssl rand -hex 32)" > .env
```

Cette commande écrit les deux variables obligatoires de `.env.exemple` :

- `DATABASE_URI` : l'adresse de la base locale de `docker-compose.yml`. Ces identifiants sont jetables et ne servent qu'à cette base.
- `PAYLOAD_SECRET` : un secret tiré au hasard par `openssl`, propre à ce poste.

Elle ne touche pas à un fichier `.env` déjà présent. Sans ce fichier, l'application refuse de démarrer : elle nomme les variables qui manquent et s'arrête.

Le fichier `.env` n'est jamais versionné. Il ne doit jamais contenir l'adresse d'une base distante. Garde-fou : Payload ne pousse son schéma que dans une base de ce poste (voir « Configuration durcie »).

### 3. Démarrer la base

```sh
docker compose up -d --wait
```

PostgreSQL écoute sur `127.0.0.1:5442`, donc sur ce poste seulement. Le port 5432 est laissé libre pour les autres projets.

Sans démon Docker, avec Podman : ajouter `DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock` devant chaque commande `docker compose`.

### 4. Démarrer l'application

```sh
bun run dev
```

- Accueil provisoire : <http://localhost:3000>
- Espace maquilleuse : <http://localhost:3000/auth>
- Administration : <http://localhost:3000/admin>. À la première visite, Payload crée ses tables puis propose de créer le premier compte.

Le serveur de développement n'écoute que sur `127.0.0.1` : il n'est pas joignable depuis le réseau local, où le premier venu pourrait créer ce premier compte.

Si le port 3000 est pris : `PORT=3100 bun run dev`.

### Arrêter

```sh
docker compose down      # arrête la base, garde les données
docker compose down -v   # arrête la base et efface les données
```

## Configuration durcie

### Variables d'environnement

L'application vérifie ses variables à chaque démarrage (`bun run dev`, `bun run start`, image Docker). S'il en manque une, ou si une valeur est refusée, elle s'arrête aussitôt et liste les variables à corriger. Le message ne montre jamais une valeur.

| Variable | Règle |
|---|---|
| `DATABASE_URI` | Obligatoire. Une adresse `postgres://` avec un hôte et un nom de base. |
| `PAYLOAD_SECRET` | Obligatoire. 32 caractères au moins. |
| `NEXT_PUBLIC_SITE_URL` | Obligatoire en production (`bun run start`, image Docker), inutile pour `bun run dev`. Sans `/` final, et l'une de ces adresses seulement : `https://my-makeup.fr`, `https://preprod.my-makeup.fr`, ou une adresse de ce poste comme `http://localhost:3000`. |
| `PAYLOAD_DROP_DATABASE` | Refusée si la base n'est pas sur ce poste : avec `true`, Payload efface toutes les tables. |

- `bun run build` est la seule exception : il ne vérifie rien et passe sans secret ni base.
- Le CLI de Payload (`bun run payload`, `payload:types`, `payload:importmap`, `payload:migrate`…) charge la même configuration : il lui faut un `.env` valide.
- `NEXT_PUBLIC_SITE_URL` est publique. Présente au moment du build, même vide, elle est figée dans le build. Absente du build, elle est lue au démarrage.
- Une nouvelle variable s'ajoute dans `src/lib/env.ts` et dans `.env.exemple`, par le ticket qui commence à la lire.

### Base de données

- Payload ne pousse son schéma que dans une base de ce poste : hôte `localhost`, `127.0.0.1` ou `::1`. Un nom de service Docker ou une adresse privée ne compte pas.
- Partout ailleurs, le schéma change par les migrations versionnées de `src/migrations/`, que Payload joue quand il démarre en production. `bun run payload:migrate:create` en écrit une, à relire avant de la versionner.
- Il n'y a encore aucune migration : démarrée en production sur une base vide, l'application n'a pas de tables.
- Hors de ce poste, une base qui n'existe pas est une erreur : Payload ne la crée pas.
- Chaque processus ouvre 5 connexions au plus.

### Accès

- GraphQL est coupé : `/api/graphql` et `/api/graphql-playground` répondent 404.
- Un cookie de session n'est accepté que depuis une origine de confiance. En production, c'est l'adresse de `NEXT_PUBLIC_SITE_URL` et elle seule : le site ne fait pas confiance à la préprod, ni la préprod au site. Ailleurs, c'est ce poste : `localhost` et `127.0.0.1`, sur le port du serveur.
- Un client qui n'est pas un navigateur (`curl`, un test) doit envoyer l'en-tête `Origin` d'une origine de confiance avec son cookie de session. Sans cet en-tête, le cookie est ignoré.
- Aucun autre site ne peut lire l'API depuis un navigateur : aucune origine n'est ouverte en CORS.
- `/api/og`, l'image de partage de l'administration, est fermée.

## Route de santé

`GET /api/health` dit si l'application peut servir. C'est l'adresse que lisent Coolify, le contrôle de santé de l'image et la surveillance du site. Le chemin et les clés sont ceux du site en ligne.

| Cas | Réponse |
|---|---|
| La base répond | `200` et `{"ok":true,"version":"…"}` |
| La base ne répond pas dans les 2 secondes | `503` et `{"ok":false}`, sans aucun détail |

- La question est posée à la base à chaque appel, par la connexion de Payload. La réponse n'est jamais mise en cache (`Cache-Control: no-store`) ni indexée (`X-Robots-Tag: noindex`).
- La cause d'un 503 n'est écrite que dans les journaux du serveur, sur une ligne `[health] check failed: …` qui se termine par un code : `ECONNREFUSED` (base arrêtée), `timeout` (pas de réponse en 2 secondes), `PAYLOAD_INIT` (Payload n'a pas démarré).
- Sans base, ou sans les deux variables obligatoires du `.env`, la route répond 503 : Payload ne démarre pas.
- Au premier appel après un démarrage, la route attend Payload. S'il lui faut plus de 2 secondes (par exemple pendant la poussée du schéma en développement), elle répond 503 cette fois-là, puis 200 dès qu'il est prêt.

`version` est le commit déployé, réduit à ses 7 premiers caractères. Il est cherché dans cet ordre :

1. `NEXT_PUBLIC_APP_VERSION`, lue au build : un libellé est affiché tel quel, un commit complet (40 caractères) est raccourci ;
2. `SOURCE_COMMIT` donné au build (dans Coolify : « Include Source Commit in Build ») ;
3. `SOURCE_COMMIT` donné au conteneur qui tourne, si le build n'en avait pas ;
4. la version de `package.json`.

En local, sans ces variables, `version` est donc la version de `package.json`.

```sh
curl -i http://localhost:3000/api/health
bun test tests/unit/health.test.ts tests/unit/version.test.ts
```

## Commandes

| Commande | Rôle |
|---|---|
| `bun run dev` | Serveur de développement, sur `127.0.0.1` seulement |
| `bun run build` | Build de production |
| `bun run start` | Sert le build de production |
| `bun run check` | Biome : format, lint et tri des imports, avec écriture des corrections sûres |
| `bun run lint` | Biome : lint seul, sans écriture |
| `bun run ci:biome` | Biome en lecture seule, pour la CI |
| `bun run typecheck` | Génère les types de routes de Next, puis contrôle les types (`tsc --noEmit`) |
| `bun run payload:types` | Régénère `src/payload-types.ts` après un changement de collection |
| `bun run payload:importmap` | Régénère `importMap.js` après l'ajout d'un composant d'administration |
| `bun run payload:migrate` | Joue les migrations de `src/migrations/` qui ne l'ont pas encore été |
| `bun run payload:migrate:create` | Écrit une migration à partir des collections, à relire avant de la versionner |
| `bun run payload` | Le CLI de Payload |
| `bun run test` | Tous les tests qui existent aujourd'hui : les tests unitaires |
| `bun run test:unit` | Les tests unitaires de `tests/unit/`, sans lire le fichier `.env` |

Biome se lance par ces scripts ou par `bunx @biomejs/biome`, jamais par `npx biome` : c'est un paquet homonyme.

## Tests

Les tests tournent avec `bun test`, lancé par les scripts ci-dessus. Pour un seul fichier : `bun --no-env-file test tests/unit/garde-tests.test.ts`.

### Où ranger un test

| Dossier | Contenu |
|---|---|
| `tests/unit/` | Tests unitaires, en `*.test.ts` : ni base, ni réseau |
| `tests/integration/` | Tests d'intégration, en `*.test.ts`, contre la pile de test locale |
| `tests/e2e/` | Essais de bout en bout, en `*.spec.ts` |
| `tests/sondes/` | Sondes du site en ligne, en lecture seule |
| `tests/ci/` | Garde-fous de la CI |
| `tests/fixtures/` | Données fictives et fichiers témoins |
| `tests/outils/` | Outils partagés par les tests |

Seuls `unit/`, `fixtures/` et `outils/` existent pour l'instant : chaque autre dossier arrive avec son premier test.

### La garde d'environnement

`bun test` charge `tests/outils/garde-environnement.ts` avant tout fichier de test (`bunfig.toml`, section `[test]`). Si l'environnement permet de toucher autre chose que le banc de test local, la garde arrête tout avant le premier test. Son message nomme la variable en cause et ne recopie jamais une adresse complète.

| Variable | Règle |
|---|---|
| `APP_ENV` | `test` (ou rien), ou `preprod`. `prod` est toujours refusé, toute autre valeur aussi |
| `DATABASE_URI` | Hôte local, et nom de base fini par `_test` |
| `BASE_URL`, `NEXT_PUBLIC_SITE_URL` | Adresse locale. La préprod seulement avec `APP_ENV=preprod`. Jamais la prod |
| `SMTP_HOST` | Hôte local : le capteur de mails |
| `SMTP_*`, `EMAIL_*`, `MAILGUN_*`, `RESEND_*` | Aucun domaine en `my-makeup.fr` : un expéditeur de test écrit depuis `@example.test` |
| `S3_ENDPOINT` | Hôte local |
| `S3_BUCKET` | Nom fini par `-test` |

Un hôte local est `localhost`, `127.0.0.1` ou `::1`, ou le nom du service dans le réseau de la pile de test : `postgres`, `mailpit`, `minio`. Une variable absente n'est pas vérifiée : les tests unitaires tournent sans aucune variable.

`bun test` lit le fichier `.env` tout seul. Lancé sans `--no-env-file` sur un poste de développement, il y trouve la base `mymakeup_dev`, et la garde l'arrête. C'est voulu : les tests ne lisent jamais le `.env` de travail, et les scripts passent `--no-env-file`.

Une nouvelle variable qui désigne un service extérieur s'ajoute à la garde, avec son cas dans `tests/unit/garde-tests.test.ts`.

## Licence

Aucune licence n'est accordée pour l'instant : tous droits réservés.
