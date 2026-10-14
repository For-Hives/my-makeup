# My Makeup

Annuaire de maquilleuses professionnelles indépendantes : [my-makeup.fr](https://my-makeup.fr).

## Branche `v3`

Cette branche porte la réécriture du site : une seule application Next.js et Payload, en TypeScript strict.

- Le site en ligne reste celui de la branche `main` tant que la bascule n'a pas eu lieu.
- L'ancien code (Next.js 15 en JavaScript, branché sur l'API Strapi) a été retiré de cette branche. Il reste lisible sur `main` et dans l'historique.
- `public/` est conservé : il contient les fichiers de vérification des moteurs de recherche, qui doivent continuer à répondre à la racine du site.
- `dev-assets/` est conservé : ce sont les sources de design.

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

Cette commande écrit les deux variables listées dans `.env.exemple` :

- `DATABASE_URI` : l'adresse de la base locale de `docker-compose.yml`. Ces identifiants sont jetables et ne servent qu'à cette base.
- `PAYLOAD_SECRET` : un secret tiré au hasard par `openssl`, propre à ce poste.

Elle ne touche pas à un fichier `.env` déjà présent. Sans ce fichier, l'accueil répond mais l'administration ne s'affiche pas : Payload refuse de démarrer sans secret.

Le fichier `.env` n'est jamais versionné. Il ne doit jamais contenir l'adresse d'une base distante : en développement, Payload pousse son schéma dans la base qu'on lui donne.

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

Si le port 3000 est pris : `PORT=3100 bun run dev`.

### Arrêter

```sh
docker compose down      # arrête la base, garde les données
docker compose down -v   # arrête la base et efface les données
```

## Commandes

| Commande | Rôle |
|---|---|
| `bun run dev` | Serveur de développement |
| `bun run build` | Build de production |
| `bun run start` | Sert le build de production |
| `bun run check` | Biome : format, lint et tri des imports, avec écriture des corrections sûres |
| `bun run lint` | Biome : lint seul, sans écriture |
| `bun run ci:biome` | Biome en lecture seule, pour la CI |
| `bun run typecheck` | Génère les types de routes de Next, puis contrôle les types (`tsc --noEmit`) |
| `bun run payload:types` | Régénère `src/payload-types.ts` après un changement de collection |
| `bun run payload:importmap` | Régénère `importMap.js` après l'ajout d'un composant d'administration |
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
