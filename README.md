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
- `src/lib/env.ts` : les variables d'environnement, vérifiées au démarrage par `src/instrumentation.ts`.
- `src/migrations/` : les migrations versionnées de la base.
- `src/payload-types.ts` et `src/app/(payload)/admin/importMap.js` : fichiers générés par Payload, versionnés, jamais modifiés à la main.
- `docker-compose.yml` : la base PostgreSQL de développement.
- `.env.exemple` : la liste des variables d'environnement, sans aucune valeur.

Les versions sont figées dans `package.json`, et `bun.lock` est le seul fichier de verrouillage.

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

Biome se lance par ces scripts ou par `bunx @biomejs/biome`, jamais par `npx biome` : c'est un paquet homonyme.

## Licence

Aucune licence n'est accordée pour l'instant : tous droits réservés.
