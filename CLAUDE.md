# My Makeup, branche `v3` : guide de travail

My Makeup est un annuaire de maquilleuses professionnelles indépendantes. Cette branche réécrit le site en une seule application Next.js et Payload, en TypeScript strict, **à parité** avec le site en ligne : le même site, sans ses défauts. Le site en ligne vit sur la branche `main`.

[`AGENTS.md`](AGENTS.md) dit à quel rythme lancer les tests et quand un travail est fini. Il s'applique à chaque tâche, et Claude Code le charge avec ce guide :

@AGENTS.md

## Où lire, selon la tâche

| Tu vas | Lis d'abord |
|---|---|
| installer, démarrer, régler une variable d'environnement | [`README.md`](README.md) |
| écrire ou relire un test, toucher une liste éditée en place, changer un écran | [`docs/qualite.md`](docs/qualite.md) |
| tester un composant React | [`docs/tests/composants.md`](docs/tests/composants.md) |
| écrire un test d'intégration, démarrer le banc de test, obtenir un compte de test, tester la connexion Google | [`docs/tests/banc.md`](docs/tests/banc.md) |
| écrire ou lancer un essai de bout en bout, contrôler l'accessibilité d'une page | [`docs/tests/e2e.md`](docs/tests/e2e.md) |
| émettre un événement de mesure, toucher le chemin `/u` ou le faux Umami | [`docs/mesure/umami.md`](docs/mesure/umami.md) |
| lancer ou écrire une sonde du site en ligne, en lecture seule | [`docs/tests/sondes.md`](docs/tests/sondes.md) |
| contrôler en lecture toutes les adresses d'un hôte (jour de la bascule, préprod) | [`docs/tests/controle-hote.md`](docs/tests/controle-hote.md) |
| appeler un service extérieur, ou le simuler dans un test | [`docs/tests/http-sortant.md`](docs/tests/http-sortant.md) |
| toucher la CI, un workflow ou le `Dockerfile` | [`docs/qualite.md`](docs/qualite.md), §6 à §9 |
| monter une version, toucher `renovate.json` | [`docs/qualite.md`](docs/qualite.md), §11 |
| créer ou changer une collection, un champ, ou l'import des données | [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md) |
| lancer l'import des données de l'ancien site, lire son rapport, y ajouter une collection | [`docs/migration/IMPORT.md`](docs/migration/IMPORT.md) |
| comprendre ce que fait la préprod au démarrage, la remettre à zéro, lire son contrôle par la CI | [`docs/preprod.md`](docs/preprod.md) |
| créer, déplacer ou retirer une adresse | [`docs/migration/URLS.md`](docs/migration/URLS.md) |
| faire autrement que le site en ligne | [`docs/migration/CHANGEMENTS-VOULUS.md`](docs/migration/CHANGEMENTS-VOULUS.md) |
| savoir ce qui est déjà fait et vérifié | [`docs/migration/JOURNAL.md`](docs/migration/JOURNAL.md) |
| écrire une note de version, comprendre la publication d'une version | [`docs/publication.md`](docs/publication.md) |

Les tickets et les plans cités par leur numéro vivent dans le dépôt des plans, hors de ce dépôt.

## Commandes

Tout se lance depuis la racine du dépôt. La table complète est dans le README, « Commandes ».

| Commande | Quand, et ce qu'il faut savoir |
|---|---|
| `bun install --frozen-lockfile` | Après un clone ou un changement de branche. `bun.lock` est le seul fichier de verrouillage. |
| `docker compose up -d --wait` | La base locale, sur `127.0.0.1:5442`. |
| `bun run dev` | Le serveur local, sur `127.0.0.1` seulement. Il lui faut le `.env` du README, « Démarrer en local ». |
| `bun --no-env-file test tests/unit/<fichier>` | Pendant le travail : le fichier de tests que tu touches. |
| `bun run check` | Biome : format, lint, tri des imports. Il écrit ses corrections. |
| `bun run ci:biome` | Biome en lecture seule. |
| `bun run typecheck` | Types de routes de Next, puis `tsc` sans sortie. |
| `bun run test` | Les tests unitaires : ceux qui tournent sans le banc de test, et sans le `.env` de travail. |
| `bun run test:ci-garde` | Les garde-fous de la CI, du `Dockerfile`, des tests sautés et de `renovate.json`. La CI les lance sur chaque PR. |
| `bun run renovate:valide` | Après un changement de `renovate.json` : Renovate dit s'il sait lire le fichier. Il lui faut `docker`. |
| `bun run banc:up` | Démarre le banc de test en conteneurs : base, capteur de mails, stockage d'objets, faux Google. `bun run banc:down` l'arrête et efface tout. |
| `bun run banc:complet` | Le banc complet en une commande : pile, base par les migrations, comptes types, 12 profils types, 3 talents, 3 articles dont un brouillon, puis l'application sur le port du banc (3100, au premier plan : lance-la en arrière-plan). `--sans-application` s'arrête avant. |
| `bun run banc:reinitialiser` | Remet le banc à son état de départ en une dizaine de secondes : base, stockage, capteur de mails, jeu. Les sessions ouvertes sont perdues. |
| `bun run banc:session <compte>` | La session d'un compte du banc (`admin`, `redaction`, `maquilleuse`, `profil-reference`, une adresse…), écrite dans `.banc/sessions/` : état d'un navigateur Playwright et en-têtes pour `curl -H @fichier`. Le jeton n'est jamais affiché. |
| `bun run test:integration` | Les tests d'intégration, sur le banc démarré. Avec un chemin : ce fichier seul. Chaque lancement vide la base du banc. |
| `bun run test:e2e` | Les essais de bout en bout, banc démarré : build de production, puis Playwright à 1440 et 390 px. Avec un chemin : ce fichier seul. Chaque lancement vide la base du banc. Le navigateur s'installe une fois par `bunx playwright install chromium`. |
| `bun run admin:creer <email>` | Crée un compte de l'administration : la seule façon d'avoir le premier ; ensuite un admin crée les autres dans l'administration. Le mot de passe se tape au clavier, jamais en argument. |
| `bun run build` | Build de production. Il passe sans base ni secret. |
| `bun run payload:types` | Après un changement de collection : régénère `src/payload-types.ts`. |
| `bun run payload:importmap` | Après l'ajout d'un composant d'administration. |
| `bun run payload:migrate:create` | Écrit une migration depuis les collections (voir « Schéma »). |
| `bun run schema:derive` | Dit s'il manque une migration aux collections du code, sans base ni secret. Bloquant en CI depuis la migration `init` (ticket 049) : une collection changée sans sa migration rend le job `qualite` rouge. |
| `bun scripts/migration/urls-doc.ts` | Après un changement de la table des URL (voir « URL »). Avec `--check`, il dit seulement si le document suit la table. |
| `bun run notes:ajouter <type> "<phrase>"` | Un changement qui se remarque par rapport au site en ligne : sa note de version, dans le même commit. Type `ajout`, `amelioration` ou `correction` (voir `docs/publication.md`). |
| `bun run release:publier --a-blanc` | Montre ce que ferait la prochaine publication : le numéro, les notes rangées dessous. N'écrit rien. Seul le workflow `release.yml` publie. |

### Un compte en ligne n'est jamais nécessaire : les quatre gestes du banc

Une tâche qui demandait un compte (voir une page connectée, l'administration, un parcours de maquilleuse) se fait sur le banc local, avec des comptes et des profils fictifs :

1. **Monter** : `bun run banc:complet`. Il démarre la pile, charge le jeu et lance l'application sur `http://localhost:3100` (ou sur le port de l'instance : `BANC_INSTANCE=mon-banc BANC_DECALAGE=20`). Il reste au premier plan ; pour la suite d'une session d'agent, lance-le en arrière-plan et attends la ligne « Application prête ».
2. **Obtenir une session** : `bun run banc:session admin` (ou `redaction`, `maquilleuse`, `profil-reference`…). Les fichiers sont dans `.banc/sessions/<banc>/` : `<compte>.etat.json` pour `browser.newContext({ storageState })`, `<compte>.entetes` pour `curl -H @fichier`. Aucun mot de passe n'existe, aucun jeton n'est affiché.
3. **Remettre à zéro** : `bun run banc:reinitialiser` (environ 10 secondes). Les sessions d'avant ne valent plus : redemande-les. `bun run test:integration` et `bun run test:e2e` vident aussi le banc, et `test:e2e` refuse de démarrer quand l'application du banc tient déjà son port.
4. **Arrêter** : `bun run banc:down` efface tout.

Le jeu et ses chiffres : [`docs/tests/banc.md`](docs/tests/banc.md), « Le banc complet ». Tout est fictif ; rien n'est réel, rien ne sort du poste.

## Architecture

Ce qui existe aujourd'hui est décrit dans le README, « Ce que contient le squelette ». Les règles ci-dessous valent dès le premier fichier de chaque module.

- **Une application, trois zones**, sous `src/app/` : les pages publiques dans `(front)/(site)/`, l'espace maquilleuse dans `(front)/(espace)/auth/`, l'administration et l'API dans `(payload)/`, générées par Payload. Le groupe `(front)` donne une seule coquille HTML au site et à l'espace. Les plans écrivent ces chemins sans `(front)`.
- **Deux collections de comptes.** `admins` ouvre l'administration (rôles `admin` et `redaction`). `pros` porte les comptes des maquilleuses. Une maquilleuse n'entre jamais dans `/admin`.
- **Un seul point de lecture publique** : `src/services/public/`. Une page publique lit ses données par ce module, qui choisit ses champs un par un. Les coordonnées d'une maquilleuse n'en sortent que si elle les publie (`contactPublic`).
- **Une seule règle par sujet**, dans `src/lib/`, testée en unitaire : complétude d'un profil (`src/lib/profil/completude.ts`), slug (`src/lib/slug.ts`), zone (`src/lib/format-zone.ts`), prix (`src/lib/prix.ts`), URL gelées (`src/lib/urls-gelees.ts`), variables d'environnement (`src/lib/env.ts`). Le reste du code les appelle et ne refait pas le calcul.
- **Les accès se décident dans les collections**, par rôle et par propriétaire, et jusqu'au champ pour ce qui est privé. Le code serveur qui agit pour une visiteuse ou une maquilleuse garde les règles actives (`overrideAccess: false`). Les règles elles-mêmes sont dans `src/lib/acces.ts`, et toute règle d'accès ajoute ses lignes à la matrice d'accès (`tests/integration/payload-acces.test.ts`), jouée par l'API REST et par l'API locale ([`docs/tests/banc.md`](docs/tests/banc.md), « La matrice d'accès »).
- **Les photos** vivent dans un stockage d'objets (Cloudflare R2, par `@payloadcms/storage-s3`). Une photo qui ne sert plus part à la corbeille, jamais à la suppression directe.
- **Les pages publiques sont rendues côté serveur** et rafraîchies par étiquettes : publier ou modifier un contenu rafraîchit les pages qui le lisent. Les pages et les étiquettes de chaque collection sont dans `src/lib/revalidation.ts` : une lecture mise en cache porte les étiquettes de ce qu'elle lit, et l'import ne rafraîchit rien.
- **Les emails** partent en SMTP par Resend (`@payloadcms/email-nodemailer`).
- **Fichiers générés, jamais modifiés à la main** : `src/payload-types.ts`, `src/app/(payload)/admin/importMap.js`, `src/migrations/index.ts`, les tableaux de `docs/migration/URLS.md` placés entre deux marques `urls:`, et `.release/version.json`, que seule la publication écrit : il déploie la prod.

## Interdits

Ces règles n'ont pas d'exception. Si une tâche semble en demander une, arrête-toi et dis-le.

1. **Aucune base de prod ni de préprod.** La seule base de travail est celle de `docker-compose.yml`, sur ce poste. L'adresse d'une base distante n'entre ni dans un `.env`, ni dans une commande, ni dans un test. Les tests ne connaissent qu'une base locale dont le nom finit par `_test`.
2. **Aucune poussée de schéma hors de ce poste.** Payload ne pousse son schéma que dans une base locale (`localhost`, `127.0.0.1`, `::1`). Partout ailleurs, le schéma change par une migration versionnée et relue, que l'application joue à son démarrage. Aucune commande `payload` ne se lance contre une base distante.
3. **Aucune donnée personnelle dans les tests**, ni dans les fixtures, les journaux, les documents ou les messages de commit. Tout y est fictif : noms inventés, adresses en `@example.test`, téléphones de la plage réservée à la fiction. Un vrai profil ou un vrai compte se désigne par son identifiant numérique, jamais par un nom, un email, un pseudo ou l'adresse de sa page.
4. **Aucun secret dans le dépôt.** `.env.exemple` liste les variables sans aucune valeur. Un message d'erreur nomme la variable, jamais sa valeur.
5. **Rien vers le site en ligne.** Jusqu'à la bascule, `main` ne reçoit aucun commit d'ici. Aucune écriture et aucun email ne vise `my-makeup.fr`, et les tests ne visent que le banc local. Les seules exceptions sont une sonde en lecture seule, rangée dans `tests/sondes/`, et le contrôle d'un hôte, lui aussi en lecture seule, rangé dans `scripts/bascule/`.
6. **Les coordonnées d'une maquilleuse ne s'affichent au public que si elle l'a choisi.** Une page publique les lit par `src/services/public/`, qui ne les rend que si `contactPublic` est vrai. Ni téléphone ni email dans un journal ou un événement de mesure.
7. **Aucune dépendance ajoutée en passant.** Une dépendance nouvelle a une version exacte, publiée depuis 7 jours au moins, sans avis de sécurité ouvert : ni dans la base de GitHub, ni parmi les avis de son propre dépôt, que les outils d'audit ne lisent pas. Elle est annoncée dans le compte rendu, avec la façon dont elle a été vérifiée.

## Schéma

- Les noms des collections et des champs sont ceux de [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md). S'en écarter, c'est modifier ce document dans le même changement.
- Tout changement de collection se termine par `bun run payload:types`. Le fichier généré est versionné, et relancer la commande ne le change plus.
- Une migration s'écrit avec `bun run payload:migrate:create`. **Lis son SQL avant de la versionner** : elle contient ce que ton changement demande, rien d'autre, et aucune suppression que tu n'as pas voulue. Relancée aussitôt, la commande ne trouve plus aucun changement de schéma : c'est la preuve qu'il n'y a pas de dérive.
- Le schéma de P3 est figé dans une seule migration, `init` (ticket 049). Depuis, **tout changement de collection vient avec sa migration, dans le même commit** : la CI le vérifie (`bun run schema:derive`), et le banc de test refuse de lancer ses tests sur une base que les migrations ne construisent pas comme le code la décrit.
- Le banc de test ne pousse jamais le schéma : sa base est construite par les migrations versionnées seules, comme celle de la préprod. Seule la base de développement de `docker-compose.yml` reçoit encore le schéma poussé par `bun run dev`.

## URL

- La table qui fait foi est `src/lib/urls-gelees.ts` : chaque famille d'adresses et le code qu'elle répond. [`docs/migration/URLS.md`](docs/migration/URLS.md) en est la lecture.
- Une adresse publique nouvelle, déplacée ou retirée a sa ligne dans la table et son test. Une adresse déplacée répond par une redirection permanente (308), en un seul saut.
- `bun scripts/migration/urls-doc.ts` réécrit ensuite les tableaux du document. Un code qui change pour une visiteuse a aussi sa ligne au registre des changements voulus.
- Aucune adresse de profil réel dans le dépôt : `/profil/<slug>`, ou un profil fictif du banc de test.

## Conventions

- **Langues.** Le code, les commentaires et les messages de commit sont en anglais. Les textes affichés et les documents sont en français, avec leurs accents.
- **Textes du site.** Un texte repris du site en ligne se copie au mot près ; le changer est un changement visible. Un texte nouveau prend le ton du site : il tutoie la maquilleuse dans son espace et vouvoie sur les pages publiques.
- **Commits.** Format conventionnel, portée `v3`, avec le numéro du ticket : `feat(v3): … (033)`.
- **TypeScript partout.** Le seul fichier JavaScript du dépôt est `importMap.js`, généré.

## Pièges

- **Biome** se lance par les scripts ci-dessus ou par `bunx @biomejs/biome`. Le paquet `biome` du registre npm est un homonyme : un lancement par npx l'installerait à sa place.
- **`bun test` sans option lit le fichier `.env`, puis `.env.test`, qui l'emporte.** Il tourne alors sous l'environnement du banc de test, et ce que `.env.test` ne règle pas vient du `.env` de travail. Les tests ne dépendent jamais de ce fichier : passe `--no-env-file`, et lance depuis la racine, où `bunfig.toml` charge la garde.
- **Aucun test n'appelle Internet.** Sous `bun test`, une requête vers un hôte qui n'est pas du banc est refusée et fait échouer le test, même si le code attrape l'erreur. Le service se simule dans le test, par `simuler`. Le code l'appelle par `fetch` : c'est la seule sortie qui se simule. Vers un service extérieur, une requête faite par `node:http`, `undici` ou `Bun.fetch` est toujours refusée.
- **Après un arrêt forcé du serveur de développement**, `bun run typecheck` peut échouer sur un fichier de `.next/dev/types/`. Supprime le dossier `.next/dev/` et relance.
- **Branches.** `v3` est la branche d'intégration. Une branche de travail s'appelle `v3-<numéros des tickets>` : git refuse `v3/…` tant que `v3` existe. Avant une poussée, `git status -sb` montre la branche suivie : une branche créée depuis `origin/main` pousserait vers `main`.
- **Versions figées.** Next reste en 16.3 (registre des changements voulus, repère `next-16-3`), et les paquets `@payloadcms/*` restent à la version exacte de `payload`. Aucune montée de version en passant. Renovate ne propose rien sur `v3` : `renovate.json` ne prend effet qu'à la bascule.
- **`payload` est corrigé par un patch** (`patches/payload@3.90.2.patch`, `patchedDependencies` de `package.json`, que `bun install` applique) : le contrôle du verrou d'un document lit dans la transaction de l'enregistrement. Sans lui, cinq enregistrements simultanés par REST bloquent l'application pour de bon (`tests/integration/verrous-payload.test.ts`). Le patch ne vaut que pour la version que sa clé nomme : après une montée de `payload`, bun ne l'applique plus, sans rien dire. `tests/unit/patch-payload.test.ts` le dit alors : vérifier si la nouvelle version passe `req` à cette lecture, puis refaire le patch avec la commande « patch » de bun, ou le retirer.
- **`slugField()` de Payload** échoue à la création d'un document publié sans slug. Le slug d'un profil vient de `src/lib/slug.ts`.
- **Un client qui n'est pas un navigateur** (`curl`, un test) envoie l'en-tête `Origin` d'une origine de confiance avec son cookie de session, sinon le cookie est ignoré (README, « Accès »).
- **Ces guides sont écrits à la main.** Le serveur de développement de Next n'en génère pas (`agentRules: false` dans `next.config.ts`). Un test les garde : `bun --no-env-file test tests/unit/guides-agents.test.ts`.
