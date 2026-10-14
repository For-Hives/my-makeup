# My Makeup

Annuaire de maquilleuses professionnelles indépendantes : [my-makeup.fr](https://my-makeup.fr).

## Branche `v3`

Cette branche porte la réécriture du site : une seule application Next.js et Payload, en TypeScript strict.

- Le site en ligne reste celui de la branche `main` tant que la bascule n'a pas eu lieu.
- L'ancien code (Next.js 15 en JavaScript, branché sur l'API Strapi) a été retiré de cette branche. Il reste lisible sur `main` et dans l'historique.
- `public/` est conservé : il contient les fichiers de vérification des moteurs de recherche, qui doivent continuer à répondre à la racine du site.
- `dev-assets/` est conservé : ce sont les sources de design.

## Suivre la migration

Cinq documents, sous `docs/migration/` :

- [`CHANGEMENTS-VOULUS.md`](docs/migration/CHANGEMENTS-VOULUS.md) : le registre de tout ce que la v3 fait autrement que le site actuel, par décision. À la répétition de la bascule, seuls ces écarts sont acceptés.
- [`JOURNAL.md`](docs/migration/JOURNAL.md) : les faits datés de la migration.
- [`SCHEMA.md`](docs/migration/SCHEMA.md) : le schéma gelé. Il dit où va chaque champ de l'ancienne API dans la v3, ou pourquoi il n'est pas repris.
- [`URLS.md`](docs/migration/URLS.md) : les URL gelées. Il dit ce que répond chaque famille d'adresses après la bascule.
- [`IMPORT.md`](docs/migration/IMPORT.md) : l'import des données de l'ancien site. Il dit ce que l'import garantit, comment le lancer, à blanc ou pour de vrai, et ce que dit son rapport.

## Travailler dans ce dépôt

Trois documents disent comment travailler ici, à une personne comme à un agent :

- [`CLAUDE.md`](CLAUDE.md) : les commandes, l'architecture, les interdits et les pièges.
- [`AGENTS.md`](AGENTS.md) : à quel rythme lancer les tests, et quand un travail est fini.
- [`docs/qualite.md`](docs/qualite.md) : les règles des tests, les sept règles des listes éditées en place, ce qu'on regarde sur un écran à 390 px, puis la CI, ses garde-fous et le canari, et les règles des mises à jour (Renovate).

Un test les garde : une commande qu'ils citent existe, un lien qu'ils donnent mène quelque part (`bun --no-env-file test tests/unit/guides-agents.test.ts`).

## Ce que contient le squelette

Une application, trois zones, toutes sous `src/app/` :

| Zone | Dossier | Adresse | État |
|---|---|---|---|
| Pages publiques | `(front)/(site)/` | `/`, `/profil/<slug>` | Page d'accueil provisoire ; page publique d'un profil, première tranche : son nom en titre, sa spécialité et sa description, lus par `src/services/public/` |
| Espace maquilleuse | `(front)/(espace)/auth/` | `/auth` | Page d'attente |
| Administration | `(payload)/` | `/admin` et `/api` | Générée par Payload : les comptes `admins`, aux rôles `admin` et `redaction`, les comptes des maquilleuses, `pros`, leurs profils, `profils`, les photos, `media`, les talents, `talents`, et les articles du blog, `articles` |

Les noms entre parenthèses rangent les fichiers et n'apparaissent pas dans les adresses.

Les pages publiques et l'espace maquilleuse partagent une seule coquille HTML, `(front)/layout.tsx` : passer de l'une à l'autre se fait sans recharger la page, comme sur le site actuel. L'administration a la sienne, générée par Payload, et ne charge pas la feuille de style du site.

Le reste :

- `src/payload.config.ts` : la configuration de Payload (base PostgreSQL, collections `admins`, `pros`, `profils`, `media`, `talents`, `articles` et `auth-evenements`, stockage d'objets des photos).
- `src/lib/langue-payload.ts` : Payload parle français, et seulement français : l'enveloppe d'un refus (« Le champ suivant n’est pas valide : Téléphone »), ses refus et ses messages traduits, et l'administration, même quand la requête demande l'anglais ; restent en anglais quelques messages codés en dur dans Payload (« Route not found », `QueryError`, certains `APIError`), que l'espace ne montre jamais. Un refus construit avec les erreurs de Payload leur passe `req.t`, sinon il sort en anglais.
- `src/collections/` : les collections de Payload. `src/lib/acces.ts` : qui peut lire, créer, modifier ou supprimer quoi (voir « Accès »).
- `src/services/public/` : la seule lecture publique des données. Une page publique y lit un profil, champ par champ, avec les règles d'accès d'une visiteuse : jamais ce qu'ont écrit l'import ou un admin. Elle donne aussi la liste des profils (listé : ni masqué, ni indisponible, ni entièrement vide ; règle dans `src/lib/profil/visibilite.ts`), dit si un profil est indexable (publiable), et ne rend ses coordonnées que si la maquilleuse les publie (`contactPublic`). Un test unitaire échoue si une page de `(front)` lit une collection sans passer par ce dossier, ou si une lecture en liste de ce dossier n'a pas de `limit`.
- `scripts/migration/` : les outils de la migration, dont l'import des données de l'ancien site (voir `docs/migration/IMPORT.md`).
- `src/preprod/` : ce que fait la préprod quand elle démarre, et elle seule : sur une base vide, elle charge le jeu fictif du banc (12 profils types, 3 talents, 3 articles) ; un jeton de `PREPROD_REMISE_A_ZERO` la remet à zéro. `scripts/preprod/controle.ts` : le contrôle que la CI lance contre elle (voir [`docs/preprod.md`](docs/preprod.md)).
- `src/components/gabarit/` : le gabarit des pages publiques (Nav et menu mobile, pied de page, pages 404 et d'erreur), posé par `(front)/(site)/layout.tsx`. Il ne lit ni cookie ni session : les pages restent statiques. `src/app/global-not-found.tsx` répond la 404 d'une adresse qu'aucune route ne connaît, dans ce même gabarit.
- `src/lib/seo/` et `src/proxy.ts` : le socle SEO. Titre (60 caractères au plus), description (70 à 155), adresse canonique absolue sur `https://my-makeup.fr` sans barre finale, et consigne robots. `src/proxy.ts` pose `X-Robots-Tag` à chaque requête : `noindex` sur `/auth` et `/search`, qui ne sont pas bloquées dans `robots.txt`, et sur toute la préprod (`APP_ENV=preprod`, lu au démarrage de l'application et non au build). Une page `noindex` n'a pas d'adresse canonique. Jamais `noarchive`, `nocache`, `nosnippet` ni `max-snippet` : les assistants citent le site.
- `src/app/api/stats/weekly/route.ts` : les statistiques du rapport du lundi, des agrégats seulement, derrière le jeton `STATS_TOKEN` (voir [`docs/mesure/statistiques-hebdomadaires.md`](docs/mesure/statistiques-hebdomadaires.md)).
- `src/lib/env.ts` : les variables d'environnement, vérifiées au démarrage par `src/instrumentation.ts`.
- `src/migrations/` : les migrations versionnées de la base.
- `src/lib/auth/` : la connexion des maquilleuses. `connexion.ts` (email et mot de passe, un code d'erreur et jamais le compte), `frein.ts` et `ip-client.ts` (le frein par adresse cliente, voir « Connexion et frein »), `retour.ts` (la page de retour, interne seulement), `session.ts` (la garde des pages privées), `espace-ferme.ts` et `src/proxy.ts` (la porte rapide sans cookie).
- `src/payload-types.ts` et `src/app/(payload)/admin/importMap.js` : fichiers générés par Payload, versionnés, jamais modifiés à la main.
- `docker-compose.yml` : la base PostgreSQL de développement.
- `Dockerfile` et `.dockerignore` : l'image de production (voir « Image Docker »).
- `.github/workflows/ci.yml` et `ci/checks-requis.json` : la CI et les checks requis (voir « Intégration continue »).
- `renovate.json` : les règles des mises à jour des dépendances, sans effet avant la bascule (voir « Mises à jour des dépendances »).
- `.env.exemple` : la liste des variables d'environnement, sans aucune valeur.
- `tests/` : les tests. Un composant React s'y teste seul, sans navigateur : voir `docs/tests/composants.md`. Un service extérieur s'y simule, et aucun test n'appelle Internet : voir `docs/tests/http-sortant.md`.
- `compose.test.yml` et `.env.test` : le banc de test local et son environnement factice, voir « Le banc de test ».
- `src/jeu-fictif/` : le jeu fictif du banc de test, que la préprod charge aussi : les 12 profils types, leurs maquilleuses fictives et leurs photos, trois talents et trois articles dont un brouillon, voir « Le banc de test ».
- `playwright.config.ts` : les essais de bout en bout, voir « Les essais de bout en bout ». Il ne règle rien lui-même : tout vient de `tests/outils/e2e.ts`.
- `src/content/changelog.json` : les notes de version, en attente puis publiées ; `.github/workflows/release.yml` : la publication d'une version, qui écrit `.release/version.json` (voir « Notes de version et publication »).

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

Les tests sont dans `tests/unit/completude.test.ts` et se lancent seuls avec `bun --no-env-file test tests/unit/completude.test.ts`. Deux fichiers de `tests/unit/fixtures/` servent de référence :

- `completude-cas.json` : les cas partagés avec l'ancien site, copiés tels quels ;
- `completude-ancien-site.json` : les réponses du code de l'ancien site sur ces cas et sur ceux de son API. Ces valeurs ne se corrigent jamais à la main : un écart est un défaut du port.

### Listes d'un profil

Un profil porte cinq listes : les prestations, chacune avec ses options, les compétences, les langues, les formations et les expériences. Les champs sont dans `src/collections/profils-listes.ts`, leurs noms dans [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md), §6. Les règles sont dans `src/lib/profil/listes.ts`, que les formulaires de l'espace maquilleuse appelleront aussi.

- **L'ordre est celui de l'envoi.** Une liste s'envoie entière, dans l'ordre voulu. Une sauvegarde qui n'envoie pas une liste la laisse telle quelle.
- **Le serveur donne l'identifiant de chaque ligne, et le garde.** Une ligne renvoyée avec son identifiant le garde d'une sauvegarde à l'autre, et retirer une ligne ne change l'identifiant d'aucune autre. Toute autre ligne est une ligne nouvelle, qui reçoit un identifiant neuf : une ligne sans identifiant, une ligne venue avec un identifiant que le serveur n'a pas donné à cette liste (tiré de son contenu, ou pris à un autre profil), la seconde copie d'une même ligne. Après une sauvegarde, les identifiants se relisent dans la réponse.
- **Les bornes**, refusées avec un message en français, sans rien écrire : 70 caractères pour un nom, un prix saisi, un diplôme, une école, une entreprise, un poste ou une ville ; 2 000 pour une description ; un montant de 5 à 10 000 €, la règle de `src/lib/prix.ts`, ou rien pour un prix « sur devis » ; la fin d'une expérience pas avant son début ; une formation obtenue au plus un an après la date du jour.
- **Une date est un jour**, rangé à 12:00 UTC : le même jour dans tous les fuseaux de la France. Un texte « AAAA-MM-JJ » donne ce jour, et un texte vide ne donne aucune date.
- Aucun champ d'une ligne n'est obligatoire pour le serveur : une ligne reprise de l'ancien site garde ses valeurs vides. Les formulaires de l'espace disent ce qu'ils exigent.

Les tests : `tests/unit/listes-profil.test.ts` pour les règles, `tests/integration/profils-listes.test.ts` pour la collection, sur le banc de test.

### Zone d'un profil

La zone d'un profil est une commune de la liste officielle, un rayon d'action et « à domicile », partout en France. Elle n'a aucun champ pour une adresse postale. Les règles et leurs messages en français sont dans `src/lib/profil/zone.ts`, les champs dans `src/collections/profils/zone.ts` :

- `commune` : son nom et son code INSEE, jamais l'un sans l'autre, et les coordonnées de son centre si on les connaît. Elle s'envoie entière : ce qu'une requête n'en donne pas est vidé, jamais repris de la commune déjà enregistrée. Le serveur refuse une commune sans code INSEE, un code mal formé, une ville tapée en texte libre sans code, une commune envoyée en liste, un nom qui ressemble à une adresse (un numéro, un code postal, une virgule, « rue des Lilas »), et un nom fait d'autres caractères que des lettres, des espaces, des traits d'union, des apostrophes et des parenthèses (un email, un site, « St. »). Aucun nom de la liste officielle n'est refusé par la règle des adresses : elle a été jouée sur toute la liste du 14/10/2026. Les coordonnées sont gardées à deux décimales : le centre de la commune à environ 1 km près, jamais un point qui situe un domicile. Le code peut être celui d'un des 101 départements ou d'une des collectivités d'outre-mer de la liste officielle (975, 977, 978, 984, 986 à 989). Le serveur calcule lui-même le département depuis le code (« 74010 » donne « 74 », « 2A004 » donne « 2A », « 97701 » donne « 977 ») : une valeur envoyée pour lui est remplacée. `null` vide la commune.
- `rayonKm` : de 0 à 200 km, en kilomètres entiers, ou vide. L'affichage garde sa propre borne de 1 000 km (`src/lib/format-zone.ts`), pour les valeurs de l'ancien site.
- `aDomicile` : vide tant que la maquilleuse ne l'a pas dit.

La zone suit la lecture de son profil, sans règle d'accès propre : qui lit un profil lit toute sa zone, code INSEE et coordonnées du centre de la commune compris, qui sont des données publiques de référence. Le public la lit donc avec les profils publiés. Que la commune existe vraiment dans la liste officielle, et que son nom soit celui de son code, le serveur ne le vérifie pas : il ne vérifie que la forme du nom. Un nom bien formé à côté d'un code bien formé est donc accepté, même s'il n'est pas celui de ce code. L'espace maquilleuse et l'import choisiront la commune dans cette liste, nom et code ensemble (tickets 123 et 063). Tests : `tests/unit/zone-profil.test.ts`, et sur le banc `tests/integration/profils-zone.test.ts`.

### État d'un profil

À chaque enregistrement d'un profil, quel qu'en soit l'auteur (la maquilleuse, un admin, l'import), le serveur calcule où il en est par la règle unique de la complétude, puis l'enregistre avec lui. Les règles sont dans `src/lib/profil/etat.ts`, les champs dans `src/collections/profils/etat.ts` :

- `completude` : le score sur 13 ; `actif`, `publiable` et `entierementVide` : les drapeaux de la règle ;
- `actifDepuis`, `publiableDepuis` et `entierementVideDepuis` : pour chaque drapeau, la date à laquelle il a pris sa valeur. Elle ne bouge pas tant que le drapeau garde la sienne.

La règle lit le profil comme la v3 le tient : la ville est le nom de la commune, qui a toujours son code INSEE (un nom que la règle trouve trop long, comme « Pont de Montvert - Sud Mont Lozère », seul cas de la liste officielle, est relu avec ses traits d'union collés) ; une photo compte par son seul identifiant ; le prix chiffré d'une offre est son montant (`prixAPartirDe`), qu'un texte sans montant (« Sur devis ») n'a pas ; le téléphone et l'email de contact ne comptent que si la maquilleuse les montre (`contactPublic`).

Aucune API n'écrit ces champs : ce qu'une requête envoie dessus est ignoré, et le serveur les recalcule. Le score et les trois drapeaux sont lus par tous ceux qui lisent le profil : ils ne disent rien qu'on ne voie déjà, et les pages publiques en ont besoin (noindex, sitemap, recherche). Les dates ne sont lues que par la propriétaire et un admin.

Le statut (`statut`) est calculé lui aussi : aucune API ne l'écrit, pas même un admin. Il suit le choix de l'admin (`statutChoisi`, écrit par un admin seulement, lu aussi par la propriétaire) :

- `automatique`, le choix d'un profil neuf : un profil entièrement vide est en brouillon, et passe à publié dès qu'il remplit une des six conditions ; il repasse en brouillon s'il les perd toutes ;
- `brouillon`, `publie` ou `masque` : le statut reste celui-là, quoi qu'on enregistre. Un profil masqué ne redevient visible que par un admin. L'admin rend le statut à la règle en choisissant `automatique` ; la règle s'applique dès cet enregistrement.

Seul un choix différent de celui qui est enregistré change le choix. Le formulaire de l'administration renvoie tous ses champs : chargé avant un enregistrement de la maquilleuse, il renvoie l'ancien statut, ignoré, et le choix qu'il a lu, inchangé ; il ne fixe donc rien. Le code serveur qui écrit `statut` lui-même, règles d'accès levées (l'import, un jeu d'essai, un test), en fait le choix de l'admin.

Tests : `tests/unit/etat-profil.test.ts`, et sur le banc `tests/integration/profils-completude.test.ts`, qui écrit chaque cas partagé de la complétude comme l'import l'écrira (`tests/outils/cas-completude.ts`) et compare l'état enregistré à la règle et aux réponses de l'ancien site.

### Corbeille des photos

Une photo qui ne sert plus part à la corbeille du stockage, jamais à la suppression directe : l'application n'efface jamais un objet. La règle du déplacement est dans `src/lib/corbeille.ts`, le moment où une photo ne sert plus dans `src/collections/corbeille.ts`, et le détail au §8 de [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md).

- La corbeille est le dossier `deleted/`, à la racine du stockage : `media/photo.webp` y devient `deleted/media/photo.webp`, avec chacune de ses tailles dérivées. L'objet y est copié, la copie est vérifiée, puis l'original est retiré : c'est le seul retrait de l'application (`src/lib/stockage.ts`), et un test échoue si un autre fichier en fait un.
- Une photo part à la corbeille quand son média est supprimé, quand son fichier est remplacé, ou quand plus rien ne la désigne après un enregistrement ou la suppression de son profil : le serveur supprime alors lui-même son média. Une photo encore désignée par un profil, un article ou une version d'article reste où elle est.
- Le greffon de stockage supprimait lui-même les objets : il n'en supprime plus aucun (`avecLaCorbeille`, dans `src/payload.config.ts`).
- Si le stockage tombe pendant un déplacement, ce qui avait déjà bougé est remis en place, une fois, et la requête échoue en 503 avec le message « Le stockage des photos ne répond pas : rien n’a été modifié. Réessaie dans quelques minutes. ». Documents et objets restent comme avant.
- Les médias et les profils se suppriment et se modifient un par un, par leur identifiant. Une opération sur plusieurs à la fois, par un filtre `where`, est refusée en 403 avant toute écriture, par toutes les API, l'API locale sans contrôle d'accès comprise (`unALaFois`) : Payload l'enregistrerait même si le stockage tombait pour l'un d'eux. La liste de l'administration n'offre donc plus de supprimer ni de modifier plusieurs lignes de ces deux collections. Seul l'import y échappe.
- Sans stockage d'objets (`S3_ENDPOINT` absent), le ménage d'un profil ne supprime aucun média : leur objet ne pourrait pas bouger.
- L'import n'y touche pas : sous son contexte, rien ne bouge.
- L'adresse publique d'une photo en corbeille ne répond plus. Sur le site, le cache de R2 peut encore la servir quelques heures. Une règle du stockage efface la corbeille au bout de 30 jours : elle se pose à la main dans R2 (ticket 205). D'ici là, `remettreEnPlace` (`src/lib/corbeille.ts`) remet un objet à sa place.
- Le journal du serveur écrit une ligne `[corbeille]` par déplacement : combien d'objets, jamais leurs clés.

Tests : `tests/unit/corbeille.test.ts`, et sur le banc `tests/integration/media-corbeille.test.ts`, où chaque requête de l'application au stockage est espionnée (`tests/outils/espion-s3.ts`, voir [`docs/tests/banc.md`](docs/tests/banc.md)).

### Rafraîchissement des pages publiques

Quand un profil, un article ou un talent est créé, modifié ou supprimé, le serveur dit à Next quelles pages publiques ne sont plus à jour : il les nomme par leur adresse (`revalidatePath`) et par leurs étiquettes (`revalidateTag`). La règle est dans `src/lib/revalidation.ts`, les crochets de Payload dans `src/collections/revalidation.ts` :

| Document | Pages rafraîchies | Étiquettes |
|---|---|---|
| Profil | `/profil/<slug>`, `/search`, `/site-map`, `/sitemap.xml` | `profil:<slug>`, `profils` |
| Article | `/blog/<slug>`, `/blog`, `/site-map`, `/sitemap.xml` | `article:<slug>`, `articles` |
| Talent | `/talent/<slug>`, `/` (l'accueil liste les talents), `/site-map`, `/sitemap.xml` | `talent:<slug>`, `talents` |

- **Seul compte ce que voit le public.** Un document est rafraîchi s'il est public avant ou après l'enregistrement : un profil `publie`, un article ou un talent publié. Un brouillon qui reste brouillon, un profil masqué qui le reste ne rafraîchissent rien. Quand l'adresse d'un document publié change, l'ancienne page et la nouvelle le sont toutes les deux.
- **L'état public se lit dans la ligne enregistrée**, avant et après l'écriture, quels que soient les champs que la requête choisit ou peut lire. Pour un article ou un talent, c'est le document publié, jamais la version en brouillon enregistrée par-dessus : un article retiré alors qu'un brouillon plus récent l'attend est bien rafraîchi. Un brouillon enregistré sur un article publié le rafraîchit aussi, pour rien : rien ne le distingue d'une modification de la version publiée.
- **Une étiquette expire tout de suite** (`{ expire: 0 }`), sans être servie périmée une dernière fois : un profil masqué ou des coordonnées retirées ne sont plus servis dès la visite suivante.
- **Une lecture mise en cache porte les étiquettes de ce qu'elle lit** (`ETIQUETTES`) : celle de la liste pour plusieurs documents (la recherche, le sitemap, le plan du site, l'accueil), celle du document pour un seul. Les pages publiques passent par le cache avec le ticket 117 ; jusque-là, elles sont lues à chaque requête.
- **L'import ne rafraîchit rien**, et ne lit rien pour cela : il porte le contexte d'import ([`docs/migration/IMPORT.md`](docs/migration/IMPORT.md)).
- **Next ne prend un rafraîchissement que pendant une de ses requêtes** : l'API REST, l'administration, une Server Action. Hors de là (un script, l'API locale dans un test, une tâche de fond), l'enregistrement passe, et les pages gardent leur cache jusqu'à ce qu'il expire. Un rafraîchissement qui échoue n'annule jamais l'enregistrement : l'erreur est journalisée.

Tests : `tests/unit/revalidation.test.ts`, et sur le banc `tests/integration/revalidation.test.ts` (I21), qui écoute Next par l'espion du cache (`tests/outils/espion-cache.ts`, voir [`docs/tests/banc.md`](docs/tests/banc.md)).

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
| `APP_ENV` | Facultative. Où l'application dit tourner : `test` (le banc de test, `.env.test`), `preprod` ou `prod`. Absente sur un poste de développement. Sur la préprod, `preprod` est ce qui lui fait charger le jeu fictif au démarrage ; `preprod` est refusée ailleurs que sur `https://preprod.my-makeup.fr` en production, et une autre valeur est refusée sur la préprod : l'application ne démarre pas. |
| `PAYLOAD_DROP_DATABASE` | Refusée si la base n'est pas sur ce poste : avec `true`, Payload efface toutes les tables. |
| `R2_PUBLIC_URL` | Facultative. L'adresse publique des photos : `https://`, un hôte, sans chemin ni `/` final. Absente, c'est celle des photos du site en ligne, sauf sur le banc de test (voir plus bas). |
| `S3_ENDPOINT` | Facultative. L'API S3 du stockage d'objets des photos : `https://` et un hôte, ou sur ce poste `http://127.0.0.1:PORT`, sans chemin ni `/` final. Absente, aucune photo n'est reçue. Refusée si elle est sur ce poste alors que le site est déployé. |
| `S3_BUCKET` | Obligatoire dès que `S3_ENDPOINT` est réglée. L'espace des photos : 3 à 63 caractères, minuscules, chiffres, points et tirets. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Obligatoires dès que `S3_ENDPOINT` est réglée. La clé d'accès au stockage et son secret. |
| `SMTP_HOST` | Le relais SMTP par lequel partent tous les mails : un nom d'hôte seul, sans protocole ni port (Resend : `smtp.resend.com`). Facultative sur un poste, sur le banc et sur la préprod : absente, l'application n'envoie rien et écrit une ligne de journal, sans adresse (y compris pour les mails propres à Payload : confirmation, mot de passe oublié), à la place de chaque mail. **Obligatoire sur le site** (`https://my-makeup.fr` en production), et refusée si elle désigne ce poste : l'application ne démarre pas. |
| `SMTP_PORT` | Obligatoire dès que `SMTP_HOST` est réglée. Le port du relais, de 1 à 65535. |
| `EMAIL_FROM` | Obligatoire dès que `SMTP_HOST` est réglée. L'expéditeur de tous les mails : `Nom <adresse@domaine>`, ou une adresse seule. |
| `SMTP_USER`, `SMTP_PASSWORD` | L'identifiant du relais et son mot de passe, toujours ensemble (Resend : `resend` et une clé d'envoi limitée au domaine d'envoi). Obligatoires sur le site. Le port 465 est chiffré d'emblée ; tout autre port doit passer en TLS avant l'envoi de l'identifiant. Le mot de passe ne figure dans aucun message d'erreur. |
| `STATS_TOKEN` | Facultative. Le jeton de service de `GET /api/stats/weekly`, que lit le rapport du lundi : 32 caractères au moins (`openssl rand -hex 32`). Absente, la route refuse tout le monde. Jamais donnée au build. |
| `GOOGLE_OIDC_ISSUER` | Facultative. Le fournisseur auquel parle la connexion Google. Absente, c'est Google : `https://accounts.google.com`. Sur ce poste seulement, l'adresse du faux Google du banc de test, comme `http://127.0.0.1:7080`, sans `/` final. Refusée sur le site et sa préprod. |
| `PREPROD_REMISE_A_ZERO` | Préprod seulement, jamais dans un `.env` local. Un jeton de 8 à 64 caractères (minuscules, chiffres, tirets), comme `2026-10-15-matin` : au démarrage suivant, avant ses migrations, la préprod efface toute sa base et sa fausse source, rejoue les migrations et recharge le jeu fictif, une fois par jeton, et seulement sur sa base `mymakeup_preprod`. Refusée partout ailleurs, le site d'abord : l'application ne démarre pas (voir [`docs/preprod.md`](docs/preprod.md)). |

- `bun run build` est la seule exception : il ne vérifie rien, sauf `R2_PUBLIC_URL`, et passe sans secret ni base.
- Le CLI de Payload (`bun run payload`, `payload:types`, `payload:importmap`, `payload:migrate`…) charge la même configuration : sans `DATABASE_URI` et `PAYLOAD_SECRET` valides, il s'arrête avec le même message. Le `.env` de l'étape 2 de « Démarrer en local » suffit.
- `payload:types` et `payload:importmap` n'ouvrent aucune connexion : la base peut être arrêtée. Sur un clone sans `.env` (la CI, par exemple), deux valeurs de remplissage passées dans l'environnement suffisent : une adresse `postgres://` bien formée, sans base derrière, et 32 caractères quelconques.
- `NEXT_PUBLIC_SITE_URL` est publique. Présente au moment du build, même vide, elle est figée dans le build. Absente du build, elle est lue au démarrage.
- `https://v3.my-makeup.fr`, l'adresse provisoire de la prod avant la bascule, est refusée pour l'instant dans `NEXT_PUBLIC_SITE_URL`. Le ticket qui ouvrira cette adresse l'ajoute à `DEPLOYED_ORIGINS` (`src/lib/env.ts`), avec son test.
- `R2_PUBLIC_URL` est publique. Elle est lue plus tôt que les autres, quand Next charge `next.config.ts` : une valeur refusée arrête aussi le build. Voir « Images ».
- `NEXT_PUBLIC_APP_VERSION` et `SOURCE_COMMIT` sont facultatives. Elles sont lues dans `src/lib/env.ts` sans être vérifiées : aucune valeur n'arrête le démarrage (voir « Route de santé »). `next.config.ts` lit aussi `SOURCE_COMMIT`, au moment du build, pour le figer dans le build : il le lit lui-même, par son nom. De `src/lib/env.ts`, il n'appelle que `mediaOrigin`, pour `R2_PUBLIC_URL`.
- `SMTP_HOST`, `SMTP_PORT`, `EMAIL_FROM`, `SMTP_USER` et `SMTP_PASSWORD` règlent l'adaptateur d'email de Payload. Elles ne se donnent jamais au build. Aucune connexion n'est ouverte au démarrage : un relais injoignable fait échouer l'envoi du mail, pas le démarrage. Sans identifiant, le relais est utilisé tel quel, sans chiffrement : cela ne convient qu'au capteur de mails du banc de test, où `.env.test` règle les trois premières.
- **Un email part par un seul point d'envoi** (`src/lib/emails/`, ticket 073), passé comme dépendance : `envoiEmailDePayload(payload, env)` rend un `EnvoyerEmail`. Le gabarit commun (`composerEmail`) écrit le texte et le HTML en français, avec un lien absolu construit depuis un chemin du site ; un lien qui sort du site, un sujet sur deux lignes ou un destinataire illisible sont refusés. Avec le contexte d'import (`CONTEXTE_IMPORT`), rien ne part. Sans relais, rien ne part non plus et une ligne de journal le dit. Un relais en échec donne une `EnvoiEmailEchoue` à l'appelant, une phrase qu'on peut montrer ; le journal garde la nature de la panne, jamais l'adresse, le sujet, le lien ni le jeton. Un test d'intégration lit l'email dans le capteur du banc (`tests/integration/emails.test.ts`).
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` et `S3_SECRET_ACCESS_KEY` règlent le stockage des photos (`@payloadcms/storage-s3`) : Cloudflare R2 sur le site, le simulateur S3 sur le banc de test, où `.env.test` les règle. Elles ne se donnent jamais au build. Sans elles, la collection `media` garde ses champs (le schéma ne dépend pas de l'environnement), mais une photo envoyée est refusée : rien n'est jamais écrit sur le disque du serveur.
- L'adresse publique d'une photo est la base des photos, puis la clé de son objet : son préfixe (`media/` pour une photo envoyée dans la v3), puis son nom de fichier. La base est `R2_PUBLIC_URL` ; sans elle, sur le banc de test, c'est le simulateur et son espace (`http://127.0.0.1:9090/mymakeup-test`), sinon l'hôte des photos du site en ligne. La règle est dans `src/lib/medias.ts`. La route de fichier de Payload, `/api/media/file/<nom>`, ne lit jamais le disque : elle renvoie par une redirection (302) vers cette adresse, pour qui peut lire le média.
- Un média nomme toujours son objet : une création qui n'a pas de nom de fichier est refusée (400), comme un envoi sans fichier. Seul l'import crée un média sans recevoir de fichier : il adopte une photo de l'ancien site là où elle est, avec le préfixe et le nom lus dans son adresse, sans rien écrire dans le stockage (ticket 058, `docs/migration/IMPORT.md`, « Les photos »).
- `GOOGLE_OIDC_ISSUER` fait prendre le faux Google du banc de test pour Google (voir « Le banc de test »). Une adresse locale est refusée dès que `NEXT_PUBLIC_SITE_URL` est celle du site ou de sa préprod, quel que soit le mode : l'application s'arrête au démarrage. Un build de production servi sur ce poste, comme pour les essais de bout en bout, l'accepte. La connexion Google elle-même, avec son client et son secret, arrive avec son ticket.
- Une nouvelle variable s'ajoute dans `src/lib/env.ts` et dans `.env.exemple`, par le ticket qui commence à la lire.

### Base de données

- Payload ne pousse son schéma que dans une base de ce poste : hôte `localhost`, `127.0.0.1` ou `::1`. Un nom de service Docker ou une adresse privée ne compte pas.
- Partout ailleurs, le schéma change par les migrations versionnées de `src/migrations/`, que Payload joue quand il démarre en production. `bun run payload:migrate:create` en écrit une, à relire avant de la versionner.
- La migration `init` porte tout le schéma (ticket 049) : démarrée en production sur une base vide, l'application crée ses tables à son premier appel (voir « Image Docker »). Tout changement de collection vient ensuite avec sa propre migration, dans le même commit : la CI le vérifie (`bun run schema:derive`, voir `docs/qualite.md`, « La dérive de schéma »). Après `bun run payload:migrate:create`, passer `bun run check` : Biome remet en forme les fichiers écrits par Payload.
- Le banc de test ne pousse pas le schéma : sa base est construite par les migrations seules, et ses tests refusent de tourner sur une base que les migrations ne construisent pas comme le code la décrit (voir `docs/tests/banc.md`, « Préparer la base du banc »).
- Hors de ce poste, une base qui n'existe pas est une erreur : Payload ne la crée pas.
- Chaque processus ouvre 5 connexions au plus.

### Connexion et frein

- La connexion est une Server Action (`src/app/(front)/(espace)/auth/signin/actions.ts`). Le jeton de session n'existe que dans le cookie `payload-token` (HttpOnly, SameSite=Lax, Secure en production, 14 jours) : aucune réponse de l'API, aucune page ne le porte.
- `/auth/profil` et `/auth/init-account` sans cookie : une seule redirection 307 vers `/auth/signin?callbackUrl=<page>` (`src/proxy.ts`). Avec un cookie qui ne vaut plus rien, la page elle-même fait la même redirection, et la connexion affiche son formulaire : une seule règle (`maquilleuseConnectee`) décide dans les deux sens, donc aucune boucle. La session d'un compte admin n'ouvre pas l'espace.
- Toutes les pages `/auth/**` partent avec `Cache-Control: private, no-store` et `X-Robots-Tag: noindex, nofollow` (`next.config.ts`).
- Le frein compte les échecs par adresse cliente : 10 par 15 minutes, le 11e est refusé (code `trop-de-tentatives` pour le formulaire, 429 pour `POST /api/pros/login`). Jamais par compte : le compte visé n'est pas verrouillé (`maxLoginAttempts: 0`). L'adresse est la dernière entrée de `X-Forwarded-For`, celle que le proxy a écrite ; si un autre relais de confiance se tient devant (CDN avec proxy actif), `TRUSTED_PROXY_CIDRS` (adresses ou plages séparées par des virgules) liste ses plages : elles sont sautées en lisant de droite à gauche. À renseigner avant la bascule si Cloudflare proxifie le domaine de l'application, sinon tous les visiteurs partagent une adresse ; une IPv6 compte par bloc /64. Les compteurs sont en mémoire, par processus : une seule instance de l'application. Aucune adresse n'est journalisée.
- **Le journal d'authentification** (`auth-evenements`, ticket 077) garde une ligne par connexion, réussie ou refusée : un type et une issue pris dans deux listes fermées (`src/lib/auth/journal.ts`), une durée en millisecondes et une date. Aucun champ de texte : ni adresse IP, ni email, ni nom, ni jeton n'y entrent, même glissés dans la saisie. Seul un admin le lit, aucune API ne l'écrit (l'admin non plus) : c'est le serveur, hors de la transaction de la connexion, si bien qu'une écriture qui échoue ne fait jamais échouer la connexion. Le formulaire écrit sa ligne dans `connecter`, la porte REST (`POST /api/pros/login`) dans les hooks de `pros` (`src/lib/auth/journal-payload.ts`) : jamais deux lignes pour une tentative. Le compte garde aussi la date de sa dernière connexion (`pros.derniereConnexion`).
- **Les tâches quotidiennes** (`src/lib/taches/`, ticket 077) : une liste de purges, `TACHES_QUOTIDIENNES`, lancée une fois par jour par le serveur de production (la première fois 5 minutes après le démarrage, jamais par un build, un script ni un test). La première purge supprime les lignes du journal de plus de 90 jours. Une tâche s'ajoute à la liste, reçoit l'horloge, est idempotente et ne compte que des lignes. Une seule instance de l'application les lance.
- Brique réutilisable : `creerFrein({ nom, limite, fenetreMs })` (`src/lib/auth/frein.ts`) avec `ipClient(headers)`. L'inscription, l'oubli de mot de passe, la recherche et le contact prennent chacun leur frein.

### Accès

- GraphQL est coupé : `/api/graphql` et `/api/graphql-playground` répondent 404.
- Un cookie de session n'est accepté que depuis une origine de confiance. En production, c'est l'adresse de `NEXT_PUBLIC_SITE_URL` et elle seule : le site ne fait pas confiance à la préprod, ni la préprod au site. Ailleurs, c'est ce poste : `localhost` et `127.0.0.1`, sur le port du serveur.
- Un client qui n'est pas un navigateur (`curl`, un test) doit envoyer l'en-tête `Origin` d'une origine de confiance avec son cookie de session. Sans cet en-tête, le cookie est ignoré.
- Dans un navigateur, une page ouverte depuis un autre site (un lien dans un webmail, un résultat de recherche) arrive sans en-tête `Origin` et avec `Sec-Fetch-Site: cross-site` : le cookie de session est ignoré pour cette page, et la personne y paraît déconnectée. Une adresse tapée, un favori et un lien du site lui-même ne sont pas concernés. Une page privée de l'espace (`/auth/profil`) traite cette personne comme n'ayant pas de session : une redirection vers `/auth/signin?callbackUrl=…`, où elle se reconnecte une fois (ticket 075).
- Aucun autre site ne peut lire l'API depuis un navigateur : aucune origine n'est ouverte en CORS.
- `/api/og`, l'image de partage de l'administration, est fermée.
- Deux rôles ouvrent l'administration : `admin` peut tout ; `redaction` ne lit et ne modifie que son propre compte, sans pouvoir changer son rôle. Une session de l'administration dure 8 heures. Le premier compte d'une base vide est toujours un `admin`, quel que soit le rôle choisi sur l'écran du premier compte.
- Une maquilleuse (collection `pros`) n'entre jamais dans l'administration. Elle ne lit et ne modifie que son propre compte, sans pouvoir changer ses champs réservés (bloqué, vérifié, fournisseur d'origine, identifiant de l'ancien site). Aucun anonyme ne crée de compte par l'API REST, même sur une base vide. Le mot de passe, le hash hérité de l'ancien site et les sessions ne sortent jamais, pas même pour un admin : Payload rend la liste des sessions toujours vide. L'email d'un compte est rangé en minuscules : deux adresses qui ne diffèrent que par la casse sont le même compte.
- Créer le compte d'une maquilleuse crée son profil vide (collection `profils`), avec un slug unique calculé par le serveur à partir du nom du compte (`src/lib/slug.ts`) : `-2`, `-3` pour les homonymes, `maquilleuse-<identifiant>` pour un nom qui ne donne rien. Le slug ne change plus ensuite, et aucune API ne l'écrit. Une création qui porte `CONTEXTE_SANS_PROFIL` (`src/collections/Profils.ts`) laisse le compte sans profil : c'est ce que fera l'import pour les comptes qui n'en ont pas. Une maquilleuse ne modifie que son propre profil ; un compte sans profil ne modifie rien. Un compte qui a encore un profil n'est pas supprimé : le profil part d'abord.
- Un profil a un statut : `brouillon` (celui d'un profil neuf), `publie` ou `masque`. L'anonyme et le rôle `redaction` ne lisent que les profils publiés ; une maquilleuse lit le sien, quel que soit son statut, et les profils publiés. Le serveur calcule lui-même le statut : brouillon pour un profil entièrement vide, publié sinon, à moins qu'un admin n'en ait choisi un autre (voir « État d'un profil »). Ce que lit le public d'un profil est son identité et le badge « Super maquilleuse », jamais le compte relié, ni ce qu'a écrit l'import (`strapiId`, `legacyUsername`), ni ce qu'a décidé un admin. Seul un admin écrit le choix du statut, le motif, la vérification et sa date, le SIRET, la note interne, le score et le badge : ce qu'une maquilleuse envoie sur ces champs est ignoré. Elle lit son statut, son motif, sa vérification et son SIRET, jamais la note interne ni le score.
- Les réseaux d'un profil sont publics. Ses coordonnées (`coordonnees` : téléphone et email de contact) ne sont lues que par la propriétaire et un admin, jamais par le public ni par le rôle `redaction`, même quand elle a choisi de les montrer (`contactPublic`) : une page publique les lira par `src/services/public/`. Quand `contactPublic` devient vrai, le serveur pose lui-même la date (`consentiLe`) et la source du consentement (`sourceConsentement` : `maquilleuse` ou `admin`, selon le compte qui enregistre) ; il les vide quand il redevient faux. Aucune API ne les écrit. Un téléphone de plus de 20 caractères ou un email mal formé est refusé, avec le message de l'ancien site. Un lien de réseau qui nomme un protocole autre que `http` ou `https` (`javascript:`, `data:`) est refusé : la page publique en fera un lien.
- Les photos (collection `media`) sont des objets du stockage, chacun sous son propre préfixe. Le public ne liste jamais les médias : il lit un média seulement s'il est la photo principale ou une photo de la galerie d'un profil publié ; un autre est introuvable (404). Une maquilleuse envoie ses photos, liste et lit les siennes, ne modifie et ne supprime que les siennes ; le serveur la pose comme propriétaire (`owner`), quel que soit le propriétaire que dit sa requête, et ce que dit une requête sur l'objet lui-même (nom, préfixe, adresse, type, taille) est ignoré. Un profil n'accepte que des photos de son compte : une photo principale et une galerie ordonnée de 10 photos au plus. Le propriétaire, l'identifiant et les formats de l'ancien site ne sont pas publics. Un document demandé par un identifiant qu'aucun document ne peut porter (`/api/media/abc`, `/api/pros/99999999999`) est refusé (403) avant toute requête à la base, dans toutes les collections.
- Les talents (collection `talents`, les pages `/talent/<slug>`) sont écrits par la rédaction, c'est-à-dire les rôles `admin` et `redaction` : créer, modifier, publier, dépublier, supprimer, lire les brouillons et les versions. Tout autre visiteur, maquilleuse connectée comprise, ne lit que les talents publiés, même en demandant les brouillons (`?draft=true`), et n'écrit rien. Deux talents n'ont jamais le même slug ; un slug s'écrit déjà comme une adresse (minuscules sans accent, mots séparés par un tiret), sinon il est refusé à la publication, jamais corrigé. L'identifiant de l'ancien site (`strapiId`) n'est écrit que par l'import et ne sort que pour la rédaction. Ces règles de la rédaction sont dans `src/collections/redaction.ts`, pour les articles aussi.
- Les articles du blog (collection `articles`, les pages `/blog/<slug>`) suivent les mêmes règles que les talents : la rédaction les écrit, les publie et les dépublie ; tout autre visiteur ne lit que les articles publiés. Les champs sont ceux de l'ancien site (titre, adresse, auteur, extrait, titre et description pour les moteurs de recherche, 70 et 155 caractères au plus), sauf la galerie, `galerie`. Le contenu est du markdown, sans limite de longueur, relu à l'identique. La galerie ne prend que des images de la rédaction (JPEG, PNG, WebP, GIF ou AVIF), brouillon compris : un PDF, la photo d'une maquilleuse ou un identifiant qu'aucun média ne peut porter y sont refusés (400), pour la rédaction, un admin comme pour l'import. Ses photos n'appartiennent à personne : la rédaction les envoie, les liste, les modifie et les supprime, sans jamais toucher à une photo de maquilleuse. Le public lit une photo d'article quand elle est dans la galerie d'un article publié et n'appartient à personne ; celle d'un brouillon reste introuvable, y compris quand un brouillon l'ajoute à un article déjà publié, jusqu'à sa publication.
- Toute requête est bornée avant la base (`src/lib/requete-bornee.ts`), dans chaque collection, celles que Payload ajoute lui-même comprises (verrous des documents, préférences) : un filtre de plus de 20 conditions, ou un filtre ou un tri sur l'email d'un compte, les coordonnées, la note interne ou le score d'un profil, est refusé (400) à tout autre qu'un admin, même par une relation (`pro.email`). Les secrets d'un compte (mot de passe, sel, sessions, hash hérité, jetons) ne servent jamais de filtre ni de tri, pas même à un admin. La réponse est la même phrase en français, que la valeur existe ou non. Payload refuse de lui-même un filtre ou un tri sur tout autre champ que la personne ne peut pas lire. Le code du serveur qui lit sans les règles (`overrideAccess`) n'est pas borné. Une lecture en liste par l'API REST est plafonnée pour tout compte autre que `admin` (ticket 071, défaut en attente de la parole d'Andy) : 100 documents au plus, 10 sans `limit`, `pagination=false` ignoré ; le plafond est posé par un endpoint `GET /` en tête de chaque collection, pas par l'API locale (pages, sitemap, relations).
- Les règles sont dans `src/lib/acces.ts`. Chacune a ses lignes dans la matrice d'accès, jouée par l'API REST et par l'API locale (`tests/integration/payload-acces.test.ts`, voir [`docs/tests/banc.md`](docs/tests/banc.md), « La matrice d'accès »).

### En-têtes de sécurité

Chaque réponse part avec cinq en-têtes, sur toutes les adresses : pages, API, administration, fichiers, erreurs.

| En-tête | Valeur | Effet |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000` | Pendant un an, le navigateur ne demande plus le site qu'en https. Ce domaine seulement : ni `includeSubDomains`, ni `preload`. Sans effet sur une adresse en http, donc sur ce poste. |
| `X-Content-Type-Options` | `nosniff` | Un fichier est lu selon le type que le serveur annonce, jamais selon son contenu. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Un autre site apprend de quel site vient la visite, sans le chemin ni les paramètres. |
| `Permissions-Policy` | caméra, micro, position, paiement et USB coupés | Le site ne s'en sert pas : ni une page ni un cadre inclus ne peut les demander. |
| `Content-Security-Policy-Report-Only` | la politique de contenu | En mode rapport : voir ci-dessous. |

- Aucune réponse ne nomme la technologie du site : il n'y a pas d'en-tête `X-Powered-By`.
- La politique de contenu est en mode rapport. Le navigateur écrit dans sa console ce qu'elle refuserait, et ne bloque rien. Aucun rapport n'est envoyé, ni au site ni ailleurs.
- Elle ne nomme qu'une origine extérieure : celle des photos. La mesure passe par le site lui-même : aucun domaine tiers n'y figure pour elle, et il ne faut pas en ajouter.
- Elle autorise les scripts écrits dans la page : Next en a besoin pour les pages rendues d'avance. `bun run dev` autorise en plus `eval`, dont React a besoin en développement.
- Les valeurs sont dans `src/lib/security-headers.ts`, et `next.config.ts` les pose sur `/:path*`. Un en-tête propre à certaines adresses s'ajoute dans `next.config.ts`, après cette entrée.

### Images

- `/_next/image` ne va chercher une image distante que sur l'hôte des photos, en https. Toute autre adresse reçoit une erreur 400, sans qu'aucune requête ne parte.
- L'hôte des photos est celui de `R2_PUBLIC_URL`. Sans cette variable, c'est celui des photos du site en ligne.
- Cet hôte est aussi le seul que nomme la politique de contenu.
- `R2_PUBLIC_URL` se donne au build et à `bun run start`, avec la même valeur : la politique de contenu garde l'hôte du build, et `/_next/image` relit la variable au démarrage.
- Une image servie par `/_next/image` porte en plus la politique de Next pour les images, appliquée celle-là : ni script, ni cadre.

```sh
curl -sI http://localhost:3000/ | grep -i -E 'strict-transport|x-content-type|referrer-policy|permissions-policy|content-security|x-powered'
bun --no-env-file test tests/unit/security-headers.test.ts
```

## Route de santé

`GET /api/health` dit si l'application peut servir. C'est l'adresse que lisent Coolify, le contrôle de santé de l'image et la surveillance du site. Le chemin et les clés sont ceux du site en ligne.

| Cas | Réponse |
|---|---|
| La base répond | `200` et `{"ok":true,"version":"…"}` |
| La base ne répond pas dans les 2 secondes | `503` et `{"ok":false}`, sans aucun détail |

- La question est posée à la base à chaque appel, par la connexion de Payload. La réponse n'est jamais mise en cache (`Cache-Control: no-store`) ni indexée (`X-Robots-Tag: noindex`).
- La cause d'un 503 n'est écrite que dans les journaux du serveur, sur une ligne `[health] check failed: …` qui se termine par un code : `ECONNREFUSED` (base arrêtée), `timeout` (pas de réponse en 2 secondes), `PAYLOAD_INIT` (Payload n'a pas démarré).
- Sans base, la route répond 503 : Payload ne démarre pas. Sans une variable obligatoire, la route ne répond pas du tout : l'application refuse de démarrer (voir « Configuration durcie »).
- Au premier appel après un démarrage, la route attend Payload. S'il lui faut plus de 2 secondes (par exemple pendant la poussée du schéma en développement), elle répond 503 cette fois-là, puis 200 dès qu'il est prêt.

`version` est le commit déployé, réduit à ses 7 premiers caractères. Il est cherché dans cet ordre :

1. `NEXT_PUBLIC_APP_VERSION`, lue au build : un libellé est affiché tel quel, un commit complet (40 caractères) est raccourci ;
2. `SOURCE_COMMIT` donné au build (dans Coolify : « Include Source Commit in Build ») ;
3. `SOURCE_COMMIT` donné au conteneur qui tourne, si le build n'en avait pas ;
4. la version de `package.json`.

En local, sans ces variables, `version` est donc la version de `package.json`.

```sh
curl -i http://localhost:3000/api/health
bun --no-env-file test tests/unit/health.test.ts tests/unit/version.test.ts
```

## Image Docker

Le `Dockerfile` construit l'image que l'hébergeur déploie : le serveur autonome de Next.js (`output: 'standalone'`) sur Node 24, sans bun, sans sources et sans dépendances de développement.

L'image lance ce serveur autonome (`node server.js`). Sur ton poste, `bun run start` sert le même build avec `next start` : Next affiche alors « "next start" does not work with "output: standalone" configuration ». Cet avertissement est attendu : le site est servi normalement. `bun run start` reste la commande de ton poste, avec ses options `-p` et `-H`.

```sh
bun run image:build      # construit l'image my-makeup:local
bun run image:controle   # la démarre contre une base jetable et vérifie le tableau ci-dessous
```

| Ce que l'image garantit | Comment |
|---|---|
| Elle se construit sans base ni secret | Le build ne reçoit que des variables publiques (liste ci-dessous). Les noms des variables d'exécution n'apparaissent ni dans l'historique de l'image ni dans sa configuration. |
| Elle tourne sans droits d'administration | Le serveur tourne sous l'utilisateur `node` (uid 1000), jamais `root`. |
| Elle joue les migrations une fois | Sur une base vide, le premier appel reçu démarre Payload, qui joue les migrations de `src/migrations/`. Aux démarrages suivants, rien n'est rejoué. |
| Elle dit si elle est saine | Son contrôle de santé interroge `/api/health` toutes les 30 secondes : « healthy » quand la base répond, « unhealthy » après 3 échecs de suite. Pendant les 60 premières secondes, un échec ne compte pas. |
| Elle redimensionne les images | `sharp` est dans l'image : `/_next/image` rend une image à la largeur demandée. |

### Variables

| Variable | Donnée | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Au build (`--build-arg`, « Build Variable » dans Coolify) | L'adresse du site, figée dans le build. Une image construite sans elle est une image de test : le conteneur doit alors la recevoir au démarrage. |
| `SOURCE_COMMIT` | Au build | Le commit construit : c'est la `version` de `/api/health`. |
| `NEXT_PUBLIC_APP_VERSION` | Au build, facultative | Un libellé de version, à la place du commit. |
| `DATABASE_URI`, `PAYLOAD_SECRET`, `S3_*` | Au conteneur seulement | Jamais au build : dans Coolify, la case « Build Variable » reste décochée. |

- Une nouvelle variable publique de build s'ajoute à trois endroits : une ligne `ARG` du `Dockerfile`, la liste de `scripts/image/regles.ts`, et `.env.exemple`.
- Une nouvelle variable d'exécution ne s'ajoute qu'à `.env.exemple` (et à `src/lib/env.ts`). La garde de `tests/ci/` refuse alors tout `Dockerfile` qui la nomme, et `bun run image:controle` toute image qui la porte.
- `.dockerignore` refuse tout, puis laisse passer ce dont le build a besoin. Un `.env` local, un dump de `.migration/` ou l'historique git n'atteignent jamais le build. La liste est figée par un test de `tests/ci/`.
- Les versions de Node et de bun du `Dockerfile` sont celles de `.nvmrc` et de `packageManager`, chaque image étant figée par son digest. La garde C04 de `tests/ci/` échoue si l'une d'elles s'écarte.

### Le contrôle de l'image

`bun run image:controle [image]` a besoin de la commande `docker`, et de rien d'autre. Il crée un réseau, une base PostgreSQL en mémoire sans port publié, démarre l'image deux fois, puis arrête la base. Il supprime tout à la fin, même en cas d'échec. Il ne lit aucun fichier `.env`.

| Variable | Effet |
|---|---|
| `CONTROLE_IMAGE_NOM` | Préfixe des conteneurs et du réseau (défaut : `mm-controle-image`). À changer pour lancer deux contrôles en même temps. |
| `CONTROLE_IMAGE_PORT` | Port de l'application sur `127.0.0.1` (défaut : un port libre). |
| `CONTROLE_IMAGE_COMMIT` | Le commit donné au build en `SOURCE_COMMIT` : la `version` de `/api/health` doit en être les 7 premiers caractères. |

Pour rendre son verdict vite, le contrôle demande au moteur de jouer le contrôle de santé de l'image toutes les 2 secondes. Podman refuse ce réglage : le contrôle suit alors le rythme de l'image, et dure un peu plus de 2 minutes.

Avec Podman, l'image se construit au format Docker, sinon Podman retire le contrôle de santé :

```sh
podman build --format docker --tag my-makeup:local .
DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock bun run image:controle
```

## Intégration continue

Chaque pull request et chaque poussée sur `v3` lancent `.github/workflows/ci.yml` : cinq jobs en parallèle, puis `ci-ok`, le seul check à exiger pour fusionner.

Chaque poussée sur `v3` lance aussi `.github/workflows/preprod.yml`, qui n'est pas un check requis : il attend que la préprod serve le commit poussé, puis lit la page du profil fictif (voir [`docs/preprod.md`](docs/preprod.md)). Il lit deux secrets du dépôt, l'accès protégé de la préprod, et ne fait que des GET.

| Job | Ce qu'il lance |
|---|---|
| `qualite` | Fichiers générés par Payload à jour, `bun run typecheck`, `bun run ci:biome`, `bun run test:ci-garde` |
| `unit` | `bun run test:unit` |
| `build` | `bun run image:build` sans secret ni base, puis `bun run image:controle` |
| `integration` | `bun run banc:up`, puis `bun run test:integration` : le banc de test, en CI comme sur un poste |
| `e2e` | En deux lots côte à côte : le Chromium de Playwright, `bun run banc:up`, puis `bun run test:e2e` sur la moitié des essais |
| `ci-ok` | Rouge si l'un des cinq a échoué, a été annulé ou a été sauté |

Avant de pousser, les mêmes commandes se lancent en local : `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:ci-garde`, et, banc démarré, `bun run test:integration` et `bun run test:e2e`.

La CI ne lit aucun secret, n'a aucun filtre de chemins et ne tolère aucun échec. Ces règles sont tenues par les garde-fous de `tests/ci/` : voir [`docs/qualite.md`](docs/qualite.md), qui dit aussi comment ajouter un job ou une action.

## Mises à jour des dépendances

`renovate.json` porte les règles que Renovate suivra pour proposer les nouvelles versions : versions exactes, 7 jours d'attente, majeures sur approbation, et une fusion automatique réservée aux petites mises à jour, derrière le check requis `ci-ok`. Payload, Next, Biome et Playwright ne sont jamais fusionnés seuls.

- **Ces règles n'ont aucun effet avant la bascule.** Renovate ne lit que le `renovate.json` de la branche par défaut : tant que `main` porte l'ancien site, c'est le sien qui s'applique, en sécurité seule.
- Une garde de `tests/ci/` fige les règles, et `bun run renovate:valide` demande à Renovate s'il sait lire le fichier.

Le détail est dans [`docs/qualite.md`](docs/qualite.md), « Renovate » : ce que chaque règle décide, comment en changer une, et ce qui doit être réglé sur `main` avant la bascule.

## Notes de version et publication

Un changement qu'une visiteuse ou une maquilleuse peut remarquer a sa note de version, ajoutée dans le même commit : `bun run notes:ajouter ajout "Tu peux ajouter une vidéo à ta galerie."`. Elle attend dans `src/content/changelog.json`.

Quand la CI d'une poussée sur `main` est verte, `ci-ok` compris, le workflow `.github/workflows/release.yml` réserve le numéro suivant (`3.0.0`, puis `3.0.1`…), range les notes en attente dessous et pousse `.release/version.json` avec l'étiquette du numéro. Coolify surveille ce fichier pour déployer la prod. Personne ne publie à la main ; `bun run release:publier --a-blanc` montre ce que ferait la prochaine publication, sans rien écrire.

Rien ne se publie avant la fusion de `v3` dans `main`. Le détail, et ce qu'il reste à régler dans GitHub et Coolify : [`docs/publication.md`](docs/publication.md).

## Commandes

| Commande | Rôle |
|---|---|
| `bun run dev` | Serveur de développement, sur `127.0.0.1` seulement |
| `bun run build` | Build de production |
| `bun run start` | Sert le build de production avec `next start`. L'avertissement de Next sur `output: standalone` est attendu (voir « Image Docker ») |
| `bun run check` | Biome : format, lint et tri des imports, avec écriture des corrections sûres |
| `bun run lint` | Biome : lint seul, sans écriture |
| `bun run ci:biome` | Biome en lecture seule, pour la CI |
| `bun run ci:canari` | Écrit les quatre fautes du canari de la CI, sur une branche `canari-…` seulement (voir `docs/qualite.md`) |
| `bun run renovate:valide` | Fait valider `renovate.json` par Renovate, en mode strict. Il lui faut `docker` (voir `docs/qualite.md`, « Renovate ») |
| `bun run typecheck` | Génère les types de routes de Next, puis contrôle les types (`tsc --noEmit`) |
| `bun run payload:types` | Régénère `src/payload-types.ts` après un changement de collection |
| `bun run payload:importmap` | Régénère `importMap.js` après l'ajout d'un composant d'administration |
| `bun run payload:migrate` | Joue les migrations de `src/migrations/` qui ne l'ont pas encore été |
| `bun run payload:migrate:create` | Écrit une migration à partir des collections, à relire avant de la versionner |
| `bun run schema:derive` | Dit si les collections du code et la dernière migration décrivent le même schéma, sans base ni secret (voir `docs/qualite.md`, « La dérive de schéma ») |
| `bun run payload` | Le CLI de Payload |
| `bun run test` | Les tests qui tournent sans le banc de test : les tests unitaires |
| `bun run test:unit` | Les tests unitaires de `tests/unit/`, sans lire le fichier `.env` |
| `bun run test:ci-garde` | Les garde-fous de `tests/ci/`, lancés à part de `bun run test` |
| `bun run banc:up` | Démarre le banc de test : base, capteur de mails, stockage d'objets et faux Google, en conteneurs |
| `bun run banc:down` | Arrête le banc de test et efface tout ce qu'il contenait |
| `bun run banc:complet` | Le banc complet en une commande : démarre la pile, la remet à son état de départ (base reconstruite par les migrations, comptes types, 12 profils types avec photos, 3 talents, 3 articles dont un brouillon), construit l'application et la lance sur le port du banc. `--sans-application` s'arrête avant l'application (voir « Le banc de test ») |
| `bun run banc:reinitialiser` | Remet le banc à son état de départ, application ou non : base, stockage, capteur de mails, jeu. Environ 10 secondes |
| `bun run banc:session <compte>` | Ouvre la session d'un compte du banc (`admin`, `redaction`, `maquilleuse`, `profil-reference`… ou une adresse) et l'écrit dans `.banc/sessions/`, sans jamais afficher le jeton |
| `bun run banc:prepare` | Reconstruit la base du banc par les migrations versionnées, vide, puis vérifie qu'elle décrit les collections du code |
| `bun run banc:source` | Crée la fausse base Strapi que lit l'import, banc démarré : base, rôle en lecture seule, photos dans le stockage. Relancée, elle la recrée à l'identique et donne la même empreinte. `--empreinte` la lit sans la toucher, `--effacer` la supprime (voir `docs/tests/source-strapi.md`) |
| `bun run banc:import` | L'import des données de l'ancien site sur le banc : il lit la fausse base Strapi et écrit dans la base du banc. À blanc par défaut, `--reel` pour écrire (voir `docs/migration/IMPORT.md`) |
| `bun run banc:rapprocher [--json] [--hors-import]` | Le rapprochement à blanc du stockage et de la base du banc : objets sans média, médias sans objet, médias sans profil, avec la corbeille comptée à part. Ne supprime rien (aucune option ne le permet) ; code de sortie 1 s'il trouve un orphelin. La CI le lance après les essais de bout en bout (voir `docs/tests/banc.md`, « Le rapprochement du stockage et de la base »). |
| `bun run migration:import` | L'import des données de l'ancien site, avec `DATABASE_URI` et `STRAPI_SOURCE_URI` de l'environnement. À blanc par défaut ; `--reel` écrit ; une base qui n'est pas sur ce poste demande `--cible-distante` (voir `docs/migration/IMPORT.md`) |
| `bun run test:integration` | Les tests d'intégration de `tests/integration/`, sur le banc. Avec un chemin : ce fichier seul |
| `bun run test:e2e` | Les essais de bout en bout de `tests/e2e/`, dans un vrai navigateur, contre l'application construite et branchée sur le banc. Avec un chemin : ce fichier seul |
| `bun run sondes` | Les sondes de `tests/sondes/` : lisent le site en ligne, en GET seulement, 2 requêtes par seconde au plus. Une autre cible par `SONDES_CIBLE` (voir « Les sondes du site en ligne ») |
| `bun run image:build` | Construit l'image Docker `my-makeup:local` |
| `bun run image:controle` | Vérifie l'image construite contre une base jetable (voir « Image Docker ») |
| `bun run notes:ajouter` | Ajoute une note de version en attente : un type (`ajout`, `amelioration`, `correction`), puis la phrase entre guillemets (voir « Notes de version et publication ») |
| `bun run release:publier` | Avec `--a-blanc` : montre la prochaine publication sans rien écrire. Avec `--pousser` : publie, dans le workflow `release.yml` seulement |
| `bun run preprod:controle` | Lit la page du profil fictif sur la préprod, après avoir attendu le commit de `CONTROLE_PREPROD_COMMIT` : 200 et son nom en h1. Il lui faut `PREPROD_BASIC_AUTH_USER` et `PREPROD_BASIC_AUTH_PASSWORD` ; `CONTROLE_PREPROD_ADRESSE` vise un build de ce poste (voir [`docs/preprod.md`](docs/preprod.md)) |

Biome se lance par ces scripts ou par `bunx @biomejs/biome`, jamais par `npx biome` : c'est un paquet homonyme.

`bun run payload` et les scripts `payload:*` ont besoin des deux variables obligatoires, donc du `.env` de l'étape 2 de « Démarrer en local » : voir « Configuration durcie ».

## Tests

Les tests tournent avec `bun test`, lancé par les scripts ci-dessus. Pour un seul fichier : `bun --no-env-file test tests/unit/garde-tests.test.ts`.

### Où ranger un test

| Dossier | Contenu |
|---|---|
| `tests/unit/` | Tests unitaires, en `*.test.ts`, et tests de composants React, en `*.test.tsx` : ni base, ni réseau |
| `tests/integration/` | Tests d'intégration, en `*.test.ts`, contre la pile de test locale |
| `tests/e2e/` | Essais de bout en bout, en `*.spec.ts` |
| `tests/sondes/` | Sondes du site en ligne, en lecture seule |
| `tests/ci/` | Garde-fous de la CI et de l'image Docker : chacun est joué sur le dépôt, puis sur un exemple fautif |
| `tests/fixtures/` | Données fictives et fichiers témoins |
| `tests/outils/` | Outils partagés par les tests |

Tous ces dossiers existent. `tests/sondes/` ne contient aucun fichier `*.test.ts` ni `*.spec.ts` : les sondes se lancent par `bun run sondes`, et leurs tests sont dans `tests/unit/sondes.test.ts`.

### La garde d'environnement

`bun test`, lancé depuis la racine du dépôt, charge `tests/outils/garde-environnement.ts` avant tout fichier de test (`bunfig.toml`, section `[test]`). Si l'environnement permet de toucher autre chose que le banc de test local, la garde arrête tout avant le premier test. Son message nomme la variable en cause et ne recopie jamais une adresse complète.

Lancé depuis un sous-dossier, `bun test` ne charge pas la garde : bun lit le `bunfig.toml` du dossier où il est lancé, pas celui d'un dossier parent. Un outil de test qui ouvre lui-même une base appelle donc `verifierBase` sur l'adresse qu'il va ouvrir, sans compter sur ce chargement.

| Variable | Règle |
|---|---|
| `APP_ENV` | `test` (ou rien), ou `preprod`. `prod` est toujours refusé, toute autre valeur aussi |
| `DATABASE_URI` | Hôte local, nom de base fini par `_test`, et aucun paramètre `host` ni `hostaddr` : il remplacerait l'hôte de l'adresse |
| `STRAPI_SOURCE_URI` | La même règle que `DATABASE_URI` : la fausse base Strapi du banc, jamais la vraie |
| `BASE_URL`, `NEXT_PUBLIC_SITE_URL` | Adresse locale. La préprod seulement avec `APP_ENV=preprod`. Jamais la prod |
| `SMTP_HOST` | Hôte local : le capteur de mails |
| `MAILPIT_URL` | Hôte local : l'API du capteur de mails |
| `SMTP_*`, `EMAIL_*`, `MAILGUN_*`, `RESEND_*` | Aucun domaine en `my-makeup.fr` : un expéditeur de test écrit depuis `@example.test` |
| `S3_ENDPOINT` | Hôte local |
| `S3_BUCKET` | Nom fini par `-test` |
| `GOOGLE_OIDC_ISSUER` | Hôte local : le faux Google du banc, jamais Google |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Une valeur qui porte le mot « factice », et jamais sans `GOOGLE_OIDC_ISSUER` : la connexion viserait Google lui-même |

Un hôte local est `localhost`, `127.0.0.1` ou `::1`, ou le nom du service dans le réseau de la pile de test : `postgres`, `mailpit`, `s3mock`, `faux-google`. Une variable absente n'est pas vérifiée : les tests unitaires tournent sans aucune variable.

`bun test` lit tout seul le fichier `.env`, puis `.env.test`, qui l'emporte. Lancé sans `--no-env-file` sur un poste de développement, il tourne donc sous l'environnement du banc de test, et tout ce que `.env.test` ne règle pas vient du `.env` de travail : la garde vérifie aussi ces variables-là. Les tests ne dépendent jamais du `.env` de travail : les scripts passent `--no-env-file`, et c'est par eux qu'on lance les tests.

Une nouvelle variable qui désigne un service extérieur s'ajoute à la garde, avec son cas dans `tests/unit/garde-tests.test.ts`.

### Le banc de test

Les tests d'intégration tournent contre quatre conteneurs jetables : PostgreSQL en mémoire, un capteur de mails, un stockage d'objets avec l'API S3 et un faux Google. Rien n'y est réel, et rien n'est gardé à l'arrêt.

Pour travailler dans le site local, sans écrire de test, **quatre gestes** (l'agent n'a plus besoin d'un compte en ligne) :

```sh
bun run banc:complet        # 1. monter : pile, base, jeu fictif, application sur http://localhost:3100 (premier plan)
bun run banc:session admin  # 2. une session : fichiers dans .banc/sessions/<banc>/, le jeton n'est pas affiché
bun run banc:reinitialiser  # 3. remettre à l'état de départ, en une dizaine de secondes (reprendre une session ensuite)
bun run banc:down           # 4. tout arrêter et tout effacer
```

Le jeu : 12 profils types (comptes `jeu-profil-*@example.test`), 3 talents, 3 articles dont un brouillon, et un compte de chaque type du site (`jeu-admin@example.test`…). L'administration en compte 19 profils : les 12 types et les 7 profils vides que le serveur crée avec les comptes types. Détail : [`docs/tests/banc.md`](docs/tests/banc.md), « Le banc complet ».

```sh
bun run banc:up                                                # démarre le banc, rend la main quand les quatre services répondent
bun run test:integration                                       # lance les tests d'intégration
bun run test:integration tests/integration/banc-base.test.ts   # un seul fichier
bun run banc:down                                              # arrête tout et efface les données
```

- `.env.test` décrit le banc. Il est versionné, parce que toutes ses valeurs sont factices.
- Sans le banc, `bun run test:integration` s'arrête avant le premier test et dit quoi démarrer.
- Lancer les tests d'intégration vide la base du banc.
- Plusieurs bancs tournent côte à côte sur un même poste, chacun sous son nom et sur ses ports : `BANC_INSTANCE=mon-banc BANC_DECALAGE=20 bun run banc:up`.
- Un test obtient un compte fictif et sa session en un appel, sans mot de passe à saisir : `await creerCompte('admin')`, `'redaction'`, `'maquilleuse'` (avec son profil vide), `'maquilleuse-sans-profil'`, ou `'maquilleuse-non-verifiee'` (sans session).
- La fabrique crée aussi les comptes que l'ancien site apporte et ceux qui ne se connectent pas : `'maquilleuse-bloquee'`, `'reprise-avec-hash'` (hash bcrypt d'un mot de passe fictif connu), `'reprise-google'` et `'reprise-google-avec-hash'` (session ouverte sans mot de passe, comme par Google), `'reprise-facebook'`. Le jeu du banc en pose un exemplaire fixe de chaque type, sans doublon quand on le rejoue : `await poserLesComptesDuJeu()` (`tests/fixtures/comptes.ts`).
- Le jeu du banc pose aussi les 12 profils types du plan de tests (référence, ville voisine, ville éloignée, indisponible, disponibilité inconnue, vide, actif non publiable, sans contact public, ancien nom accentué, vérifiée, masquée, textes maximaux), chacun avec sa maquilleuse fictive et ses photos, toujours les mêmes, sans doublon quand on le rejoue : `await poserLesProfilsDuJeu(payload)` (`src/jeu-fictif/`). Hors du banc et de la préprod, il refuse de tourner avant de rien lire ni écrire.
- Toute règle d'accès a ses lignes dans la matrice d'accès, jouées par l'API REST et par l'API locale avec les règles actives : `tests/integration/payload-acces.test.ts`.
- Sur le banc, l'application envoie tous ses mails au capteur. Un test lit le sien, avec son destinataire, son sujet et ses liens : `await attendreLeMail({ pour: adresse })`.
- Un test dépose un objet dans le stockage et le relit : `await deposerUnObjet(cle, contenu)`, `await lireUnObjet(cle)`.
- L'import se teste sur une fausse base Strapi qui porte chaque cas connu de la vraie, ouverte en lecture seule, avec ses photos dans le stockage : `bun run banc:source` la crée, à l'identique à chaque fois. `bun run banc:import --reel` y lance l'import ; un test le lance par `importerSurLeBanc()` (`tests/outils/import.ts`).
- La connexion Google se teste sans compte Google ni secret : le faux Google tient la place de Google (`GOOGLE_OIDC_ISSUER`), et un test choisit qui se connecte et comment cela finit, parmi quatre scénarios : `fauxGoogle().choisir({ scenario: 'refus' })`.

Le détail est dans [`docs/tests/banc.md`](docs/tests/banc.md) : les services et leurs adresses, les deux variables d'instance, l'écriture d'un test d'intégration, la remise à zéro, le capteur de mails, le stockage d'objets, la fabrique de comptes et ses types, le jeu de comptes fixes, les 12 profils types, le faux Google et ses quatre scénarios, les images épinglées, la fausse base Strapi.

### Les essais de bout en bout

Un essai de bout en bout ouvre l'application dans un vrai navigateur, à 1440 px et à 390 px. L'application est construite pour la production, démarrée sur le port du banc et branchée sur lui ; elle ne lit aucun fichier `.env`.

```sh
bunx playwright install chromium               # une fois par poste : le navigateur de Playwright
bun run banc:up
bun run test:e2e                               # tous les essais
bun run test:e2e tests/e2e/coquille.spec.ts    # un seul fichier
```

- La commande vide la base du banc, construit l'application, puis Playwright la démarre, lance les essais et l'arrête.
- Une session s'obtient sans mot de passe : `creerCompte('admin')`, puis `context.addCookies(compte.session.cookies)`.
- `violationsGraves(page)` (`tests/outils/axe.ts`) rend les violations d'accessibilité « serious » et « critical » de la page.
- Un essai en échec garde sa trace, sa vidéo et sa capture dans `test-results/essais/`.
- Une cible sur `my-makeup.fr` arrête tout avant le premier essai.

Le détail est dans [`docs/tests/e2e.md`](docs/tests/e2e.md) : écrire un essai, l'accessibilité, lire un échec, les garde-fous, les pièges.

### Les sondes du site en ligne

Les sondes lisent le site en ligne comme une visiteuse anonyme, sans jamais rien y écrire : c'est la seule exception à « rien vers le site en ligne ». Les adresses ne changent pas avec la v3 : elles lisent aujourd'hui le site actuel.

```sh
bun run sondes                                       # https://my-makeup.fr
SONDES_CIBLE=http://localhost:3100 bun run sondes    # une autre cible : le banc, un domaine temporaire
```

- R01 : la garde interrompt toute requête autre qu'un GET, tout ce qui va vers la mesure d'audience (`/u`) ou vers un autre hôte. Elle se vérifie avant la première requête.
- R03 : 5 profils au hasard du sitemap répondent 200, avec un `h1` dans le HTML du serveur, sans « undefined » ni « null ».
- R04 : une adresse inconnue répond 404.
- Une requête à la fois, 2 par seconde au plus. Le rapport désigne un profil par une empreinte, jamais par son adresse.
- `SONDES_CIBLE` n'est lue que par les sondes : la garde des essais refuse toujours la prod.

Le détail est dans [`docs/tests/sondes.md`](docs/tests/sondes.md) : chaque sonde, la garde, lire le rapport, retrouver un profil rouge.

### Le HTTP sortant

Aucun test n'appelle Internet. `bun test`, lancé depuis la racine du dépôt, charge `tests/outils/precharge-http-sortant.ts` avant tout fichier de test (`bunfig.toml`, section `[test]`) : dès lors, aucune requête HTTP ne quitte le poste.

- Un service extérieur se simule en une déclaration, dans le test :

  ```ts
  simuler(http.get('https://referentiel.example.test/communes', () => HttpResponse.json([{ nom: 'Annecy', code: '74010' }])))
  ```

- Une requête vers un hôte que rien ne déclare est refusée, et le test échoue avec un message qui nomme l'hôte, même si le code testé attrape l'erreur.
- Les services du banc de test ne sont pas interceptés : ce poste, et les services de `compose.test.yml`.
- Le code appelle un service extérieur par `fetch` : sous bun, c'est la seule sortie qui se simule.

Le détail est dans [`docs/tests/http-sortant.md`](docs/tests/http-sortant.md) : les gestes (panne, réseau coupé, service muet), ce qui passe, les deux couches et leurs limites.

## Licence

Aucune licence n'est accordée pour l'instant : tous droits réservés.
