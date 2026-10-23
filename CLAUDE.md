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
| contrôler en lecture toutes les adresses d'un hôte (jour de la bascule, hôte de production) | [`docs/tests/controle-hote.md`](docs/tests/controle-hote.md) |
| parcourir en navigateur 40 adresses d'un hôte, à deux largeurs d'écran, pour y chercher des défauts d'interface | [`docs/tests/crawl-interfaces.md`](docs/tests/crawl-interfaces.md) |
| appeler un service extérieur, ou le simuler dans un test | [`docs/tests/http-sortant.md`](docs/tests/http-sortant.md) |
| toucher la CI, un workflow ou le `Dockerfile` | [`docs/qualite.md`](docs/qualite.md), §6 à §9 |
| monter une version, toucher `renovate.json` | [`docs/qualite.md`](docs/qualite.md), §11 |
| créer ou changer une collection, un champ, ou l'import des données | [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md) |
| lancer l'import des données de l'ancien site, lire son rapport, y ajouter une collection | [`docs/migration/IMPORT.md`](docs/migration/IMPORT.md) |
| créer, déplacer ou retirer une adresse | [`docs/migration/URLS.md`](docs/migration/URLS.md) |
| toucher à l'édition directe du profil (blocs éditables, mode édition, jetons de la direction artistique) | [`docs/edition-directe.md`](docs/edition-directe.md) |
| préparer, lister ou lancer le courriel aux membres après la bascule (liste à blanc, verrous, journal d'envoi) | [`docs/membres-courriel.md`](docs/membres-courriel.md) |
| toucher au SIRET, au badge « Activité vérifiée » ou à l'appel de l'annuaire des entreprises | [`docs/activite-verifiee.md`](docs/activite-verifiee.md) |
| faire autrement que le site en ligne | [`docs/migration/CHANGEMENTS-VOULUS.md`](docs/migration/CHANGEMENTS-VOULUS.md) |
| jouer la bascule, ou savoir quoi faire à chaque étape du jour J et du retour arrière | [`docs/migration/BASCULE.md`](docs/migration/BASCULE.md) |
| savoir ce qui est déjà fait et vérifié | [`docs/migration/JOURNAL.md`](docs/migration/JOURNAL.md) |
| écrire une note de version, comprendre la publication d'une version | [`docs/publication.md`](docs/publication.md) |
| nommer un fichier, un dossier, une fonction, une variable ou une option ; renommer du code ; lire le contrôle des noms | « Conventions » et « Glossaire des noms » ci-dessous, puis [`docs/noms.md`](docs/noms.md) |

Les tickets cités par un numéro à trois chiffres (001 à 312) et les plans vivent dans le dépôt privé des plans, hors de ce dépôt. Le nouveau travail est suivi dans les issues GitHub de ce dépôt (voir « Agent skills » ci-dessous).

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
| `bun run test:ci-guard` | Les garde-fous de la CI, du `Dockerfile`, des tests sautés et de `renovate.json`. La CI les lance sur chaque PR. |
| `bun run renovate:validate` | Après un changement de `renovate.json` : Renovate dit s'il sait lire le fichier. Il lui faut `docker`. |
| `bun run bench:up` | Démarre le banc de test en conteneurs : base, capteur de mails, stockage d'objets, faux Google. `bun run bench:down` l'arrête et efface tout. |
| `bun run bench:full` | Le banc complet en une commande : pile, base par les migrations, comptes types, 12 profils types, 3 talents, 3 articles dont un brouillon, puis l'application sur le port du banc (3100, au premier plan : lance-la en arrière-plan). `--without-application` s'arrête avant. |
| `bun run bench:reset` | Remet le banc à son état de départ en une dizaine de secondes : base, stockage, capteur de mails, jeu. Les sessions ouvertes sont perdues. |
| `bun run bench:session <compte>` | La session d'un compte du banc (`admin`, `redaction`, `maquilleuse`, `profil-reference`, une adresse…), écrite dans `.banc/sessions/` : état d'un navigateur Playwright et en-têtes pour `curl -H @fichier`. Le jeton n'est jamais affiché. |
| `bun run test:integration` | Les tests d'intégration, sur le banc démarré. Avec un chemin : ce fichier seul. Chaque lancement vide la base du banc. |
| `bun run test:e2e` | Les essais de bout en bout, banc démarré : build de production, puis Playwright à 1440 et 390 px. Avec un chemin : ce fichier seul. Chaque lancement vide la base du banc. Le navigateur s'installe une fois par `bunx playwright install chromium`. |
| `bun run admin:create <email>` | Crée un compte de l'administration : la seule façon d'avoir le premier ; ensuite un admin crée les autres dans l'administration. Le mot de passe se tape au clavier, jamais en argument. |
| `bun run build` | Build de production. Il passe sans base ni secret. |
| `bun run payload:types` | Après un changement de collection : régénère `src/payload-types.ts`. |
| `bun run payload:importmap` | Après l'ajout d'un composant d'administration. |
| `bun run payload:migrate:create` | Écrit une migration depuis les collections (voir « Schéma »). |
| `bun run schema:drift` | Dit s'il manque une migration aux collections du code, sans base ni secret. Bloquant en CI depuis la migration `init` (ticket 049) : une collection changée sans sa migration rend le job `qualite` rouge. |
| `bun scripts/migration/urls-doc.ts` | Après un changement de la table des URL (voir « URL »). Avec `--check`, il dit seulement si le document suit la table. |
| `bun run notes:add <type> "<phrase>"` | Un changement qui se remarque par rapport au site en ligne : sa note de version, dans le même commit. Type `ajout`, `amelioration` ou `correction` (voir `docs/publication.md`). |
| `bun run members:mail [options]` | Le courriel unique aux membres (issue 998). Sans option, une liste à blanc : rien ne part, un rapport de nombres et de numéros de profil. L'envoi exige `--send`, `MEMBERS_MAIL_SEND=on`, `--limit` et `--send-log`. `bun run bench:members-mail` la joue sur le banc (voir [`docs/membres-courriel.md`](docs/membres-courriel.md)). |
| `bun run names:check [dossier…]` | Liste les noms encore français (fichiers, dossiers, noms déclarés, scripts, variables d'environnement, options), hors exceptions nommées. Code de sortie 1 s'il en reste. `--summary` donne les nombres (voir « Conventions » et [`docs/noms.md`](docs/noms.md)). Tourne dans la CI (job `qualite`, étape « English names »), sous `ci-ok` : un nom français nouveau la rend rouge. La liste d'attente est vide. |
| `bun run release:publish --dry-run` | Montre ce que ferait la prochaine publication : le numéro, les notes rangées dessous. N'écrit rien. Seul le workflow `release.yml` publie. |

### Un compte en ligne n'est jamais nécessaire : les quatre gestes du banc

Une tâche qui demandait un compte (voir une page connectée, l'administration, un parcours de maquilleuse) se fait sur le banc local, avec des comptes et des profils fictifs :

1. **Monter** : `bun run bench:full`. Il démarre la pile, charge le jeu et lance l'application sur `http://localhost:3100` (ou sur le port de l'instance : `BENCH_INSTANCE=mon-banc BENCH_OFFSET=20`). Il reste au premier plan ; pour la suite d'une session d'agent, lance-le en arrière-plan et attends la ligne « Application prête ».
2. **Obtenir une session** : `bun run bench:session admin` (ou `redaction`, `maquilleuse`, `profil-reference`…). Les fichiers sont dans `.banc/sessions/<banc>/` : `<compte>.etat.json` pour `browser.newContext({ storageState })`, `<compte>.entetes` pour `curl -H @fichier`. Aucun mot de passe n'existe, aucun jeton n'est affiché.
3. **Remettre à zéro** : `bun run bench:reset` (environ 10 secondes). Les sessions d'avant ne valent plus : redemande-les. `bun run test:integration` et `bun run test:e2e` vident aussi le banc, et `test:e2e` refuse de démarrer quand l'application du banc tient déjà son port.
4. **Arrêter** : `bun run bench:down` efface tout.

Le jeu et ses chiffres : [`docs/tests/banc.md`](docs/tests/banc.md), « Le banc complet ». Tout est fictif ; rien n'est réel, rien ne sort du poste.

## Architecture

Ce qui existe aujourd'hui est décrit dans le README, « Ce que contient le squelette ». Les règles ci-dessous valent dès le premier fichier de chaque module.

- **Une application, trois zones**, sous `src/app/` : les pages publiques dans `(front)/(site)/`, l'espace maquilleuse dans `(front)/(dashboard)/auth/`, l'administration et l'API dans `(payload)/`, générées par Payload. Le groupe `(front)` donne une seule coquille HTML au site et à l'espace. Les plans écrivent ces chemins sans `(front)`.
- **Deux collections de comptes.** `admins` ouvre l'administration (rôles `admin` et `editor`). `pros` porte les comptes des maquilleuses. Une maquilleuse n'entre jamais dans `/admin`.
- **Un seul point de lecture publique** : `src/services/public/`. Une page publique lit ses données par ce module, qui choisit ses champs un par un. Les coordonnées d'une maquilleuse n'en sortent que si elle les publie (`publicContact`).
- **Une seule règle par sujet**, dans `src/lib/`, testée en unitaire : complétude d'un profil (`src/lib/profile/completeness.ts`), slug (`src/lib/slug.ts`), zone (`src/lib/format-zone.ts`), prix (`src/lib/price.ts`), URL gelées (`src/lib/frozen-urls.ts`), variables d'environnement (`src/lib/env.ts`). Le reste du code les appelle et ne refait pas le calcul.
- **Les accès se décident dans les collections**, par rôle et par propriétaire, et jusqu'au champ pour ce qui est privé. Le code serveur qui agit pour une visiteuse ou une maquilleuse garde les règles actives (`overrideAccess: false`). Les règles elles-mêmes sont dans `src/lib/access.ts`, et toute règle d'accès ajoute ses lignes à la matrice d'accès (`tests/integration/payload-access.test.ts`), jouée par l'API REST et par l'API locale ([`docs/tests/banc.md`](docs/tests/banc.md), « La matrice d'accès »).
- **Les photos** vivent dans un stockage d'objets (Cloudflare R2, par `@payloadcms/storage-s3`). Une photo qui ne sert plus part à la corbeille, jamais à la suppression directe.
- **Les pages publiques sont rendues côté serveur** et rafraîchies par étiquettes : publier ou modifier un contenu rafraîchit les pages qui le lisent. Les pages et les étiquettes de chaque collection sont dans `src/lib/revalidate.ts` : une lecture mise en cache porte les étiquettes de ce qu'elle lit, et l'import ne rafraîchit rien. Le HTML de l'accueil, d'un profil, d'un talent et d'un article est gardé dans le cache de Next (ticket 269) : ces pages et leurs gabarits ne lisent ni `cookies()` ni `headers()`, et n'ont pas de `force-dynamic` (un test le garde, `tests/unit/page-cache.test.ts`). L'accueil est servi par `/home-cached/[key]`, où `next.config.ts` réécrit `/` : voir `docs/seo/cache-des-pages.md`.
- **Les emails** partent en SMTP par Resend (`@payloadcms/email-nodemailer`).
- **Fichiers générés, jamais modifiés à la main** : `src/payload-types.ts`, `src/app/(payload)/admin/importMap.js`, `src/migrations/index.ts`, les tableaux de `docs/migration/URLS.md` placés entre deux marques `urls:`, et `.release/version.json`, que seule la publication écrit : il déploie la prod.

## Interdits

Ces règles n'ont pas d'exception. Si une tâche semble en demander une, arrête-toi et dis-le.

1. **Aucune base de prod.** La v3 n'a pas de préprod : un seul environnement en ligne, la production, et le banc local (décision d'Andy du 16/10/2026, ticket 232). La seule base de travail est celle de `docker-compose.yml`, sur ce poste. L'adresse d'une base distante n'entre ni dans un `.env`, ni dans une commande, ni dans un test. La règle vise une base qu'on ouvrirait vers ce poste ; elle ferme la préprod disparue, et n'empêche pas l'import de production : il tourne dans le conteneur déployé, lit la base Strapi par le réseau interne avec un rôle en lecture seule et écrit dans la base de Payload par son adresse interne, sans qu'aucune base soit ouverte sur Internet (`docs/migration/IMPORT.md`, « En production », ticket 233). `--remote-target` exige alors `--expected-database`. Les tests ne connaissent qu'une base locale dont le nom finit par `_test`.
2. **Aucune poussée de schéma hors de ce poste.** Payload ne pousse son schéma que dans une base locale (`localhost`, `127.0.0.1`, `::1`). Partout ailleurs, le schéma change par une migration versionnée et relue, que l'application joue à son démarrage. Aucune commande `payload` ne se lance contre une base distante.
3. **Aucune donnée personnelle dans les tests**, ni dans les fixtures, les journaux, les documents ou les messages de commit. Tout y est fictif : noms inventés, adresses en `@example.test`, téléphones de la plage réservée à la fiction. Un vrai profil ou un vrai compte se désigne par son identifiant numérique, jamais par un nom, un email, un pseudo ou l'adresse de sa page.
4. **Aucun secret dans le dépôt.** `.env.exemple` liste les variables sans aucune valeur. Un message d'erreur nomme la variable, jamais sa valeur.
5. **Rien vers le site en ligne.** Jusqu'à la bascule, `main` ne reçoit aucun commit d'ici. Aucune écriture et aucun email ne vise `my-makeup.fr`, et les tests ne visent que le banc local. Les seules exceptions sont une sonde en lecture seule, rangée dans `tests/probes/`, et le contrôle d'un hôte, lui aussi en lecture seule, rangé dans `scripts/cutover/`.
6. **Les coordonnées d'une maquilleuse ne s'affichent au public que si elle l'a choisi.** Une page publique les lit par `src/services/public/`, qui ne les rend que si `publicContact` est vrai. Ni téléphone ni email dans un journal ou un événement de mesure.
7. **Aucune dépendance ajoutée en passant.** Une dépendance nouvelle a une version exacte, publiée depuis 7 jours au moins, sans avis de sécurité ouvert : ni dans la base de GitHub, ni parmi les avis de son propre dépôt, que les outils d'audit ne lisent pas. Elle est annoncée dans le compte rendu, avec la façon dont elle a été vérifiée.

## Schéma

- Les noms des collections et des champs sont ceux de [`docs/migration/SCHEMA.md`](docs/migration/SCHEMA.md). S'en écarter, c'est modifier ce document dans le même changement.
- Tout changement de collection se termine par `bun run payload:types`. Le fichier généré est versionné, et relancer la commande ne le change plus.
- Une migration s'écrit avec `bun run payload:migrate:create`. **Lis son SQL avant de la versionner** : elle contient ce que ton changement demande, rien d'autre, et aucune suppression que tu n'as pas voulue. Relancée aussitôt, la commande ne trouve plus aucun changement de schéma : c'est la preuve qu'il n'y a pas de dérive.
- Le schéma de P3 est figé dans une seule migration, `init` (ticket 049, regroupée au ticket 249). **Tant qu'aucune base de production ne l'a jouée, `init` se réécrit à chaque changement de collection** (`docs/tests/banc.md`, « Réécrire la migration `init` et vider une base ») ; ensuite, **tout changement de collection vient avec sa migration, dans le même commit** : la CI le vérifie (`bun run schema:drift`), et le banc de test refuse de lancer ses tests sur une base que les migrations ne construisent pas comme le code la décrit.
- Le banc de test ne pousse jamais le schéma : sa base est construite par les migrations versionnées seules, comme celle de la production. Seule la base de développement de `docker-compose.yml` reçoit encore le schéma poussé par `bun run dev`.

## URL

- La table qui fait foi est `src/lib/frozen-urls.ts` : chaque famille d'adresses et le code qu'elle répond. [`docs/migration/URLS.md`](docs/migration/URLS.md) en est la lecture.
- Une adresse publique nouvelle, déplacée ou retirée a sa ligne dans la table et son test. Une adresse déplacée répond par une redirection permanente (308), en un seul saut.
- `bun scripts/migration/urls-doc.ts` réécrit ensuite les tableaux du document. Un code qui change pour une visiteuse a aussi sa ligne au registre des changements voulus.
- Aucune adresse de profil réel dans le dépôt : `/profil/<slug>`, ou un profil fictif du banc de test.

## Conventions

- **Langues.** Le code, les commentaires et les messages de commit sont en anglais. Les textes affichés et les documents sont en français, avec leurs accents.
- **Noms en anglais.** Le code est en anglais jusque dans ses noms : fichiers, dossiers, identifiants (fonctions, types, constantes, variables), scripts de `package.json`, variables d'environnement lues, options de nos scripts. Un mot du glossaire ci-dessous s'écrit toujours de la même façon ; un mot qui n'y est pas s'y ajoute, dans ce fichier, au lieu d'en inventer un second. Les titres des tests, les lignes de journal, les messages et les textes affichés sont des phrases : ils restent en français. `bun run names:check` liste les noms encore français. Une partie du dépôt est encore sur sa **liste d'attente** (`scripts/naming/config.json`, clé `waiting`) : les lots de renommage (tickets 238 à 253) la raccourcissent, et le contrôle tourne déjà dans la CI avec elle ; le ticket 254 la fait passer à vide. Un dossier hors de la liste n'a aucun nom français ; ne lui en ajoute pas.
- **Ce qui garde son nom français** (les exceptions, et leur raison) :
  - les dossiers des **adresses gelées** (avec Next.js, le nom du dossier est l'adresse) : `/a-propos`, `/demande-envoyee`, `/mentions-legales`, `/politique-de-confidentialite`, `/maquilleuse/partenariats`, `/particulier/…`, `/solutions/pour-les-…`, les deux `/pourquoi-…`, `/profil/<slug>`, `/auth/profil`, `/auth/apercu-profil`, `/auth/mot-de-passe-oublie`, `/auth/reinitialiser`. Les autres adresses `/auth/*` du registre (familles `espace-*`) restent comme elles sont : les emails déjà envoyés par l'ancien site et les favoris y mènent ;
  - le **catalogue Umami** (noms d'événements, propriétés, valeurs) : renommer une valeur coupe sa série de mesure. Les constantes qui le portent changent de nom, pas ses valeurs ;
  - les **codes d'erreur de l'authentification** (`identifiants-invalides`, `google-echec`…) : une seule famille de chaînes sert à la fois de valeur Umami, de `?error=`, de code du journal et de clé des statistiques ;
  - le paramètre **`?specialite=`** de `/search` : des liens de l'ancien site le portent ;
  - les **noms de la base Strapi** que l'import lit : ils sont déjà en anglais ;
  - les **clés des registres** (familles d'adresses, registre des changements voulus) : ce sont des identifiants de documents ;
  - les fichiers **`sondes.yml`** et **`ci.yml`**, et le check requis **`ci-ok`** : l'historique de GitHub et le rapport du lundi les lisent par leur nom ;
  - les **titres des tests** et les **lignes de journal** : ce sont des phrases.

  Les chaînes de caractères ne sont jamais lues par le contrôle : seules les exceptions qui sont des noms (dossiers gelés, `specialite`) sont écrites dans `scripts/naming/config.json`, chacune avec sa raison. Les workflows de `.github/` sont hors du périmètre du contrôle.
- **Textes du site.** Un texte repris du site en ligne se copie au mot près ; le changer est un changement visible. Un texte nouveau prend le ton du site : il tutoie la maquilleuse dans son espace et vouvoie sur les pages publiques.
- **Commits.** Format conventionnel, portée `v3`, avec le numéro du ticket : `feat(v3): … (033)`.
- **TypeScript partout.** Le seul fichier JavaScript du dépôt est `importMap.js`, généré.

## Glossaire des noms

Le même mot français a le même mot anglais partout (source : `PLAN-ANGLAIS.md` §5, dans le dépôt des plans). Pour un mot absent de la table, ajoute une ligne ici, dans le même changement, sans inventer un second mot. La liste des mots français que le contrôle reconnaît est `scripts/naming/french-words.txt` : un mot français nouveau y entre aussi.

| Français | Anglais | Français | Anglais |
|---|---|---|---|
| maquilleuse | `artist` | prestation | `serviceOffer` (Strapi `service_offers`) |
| profil | `profile` | compétence | `skill` |
| espace (de la maquilleuse) | `dashboard` | langue | `language` |
| compte | `account` | formation | `course` (Strapi `courses`) |
| connexion / déconnexion | `signIn` / `signOut` | expérience | `experience` |
| inscription | `signUp` | réseaux | `networks` (Strapi `network`) |
| mot de passe oublié / réinitialisation | `forgotPassword` / `passwordReset` | coordonnées | `contactDetails` |
| renvoi (d'un email) | `resend` | galerie / photo principale | `gallery` / `mainPicture` |
| jeton | `token` | commune / département | `city` / `department` |
| frein, refus pour excès | `rateLimit`, `throttled` | rayon | `radius` |
| journal (d'authentification) | `authLog` | complétude / publiable | `completeness` / `publishable` |
| événement | `event` | statut / brouillon / publié / masqué | `status` / `draft` / `published` / `hidden` |
| demande (de contact) | `contactRequest` | actif / entièrement vide | `active` / `fullyEmpty` |
| hérité (de l'ancien site) | `legacy` | corbeille | `trash` |
| bascule | `cutover` | rédaction (rôle) | `editor` |
| banc (de test) | `bench` | tâche quotidienne | `dailyTask` |
| jeu fictif | `demoData` (dossier `src/demo-data`) | mesure (Umami) | `analytics` |
| outils (des tests) | `support` (dossier `tests/support`) | santé | `health` |
| sonde | `probe` | gel / gelé | `freeze` / `frozen` |
| faux (Google, Umami, communes) | `fake` | registre des changements voulus | `intendedChanges` |
| témoin (de test) | `sentinel` | parité / écart | `parity` / `gap` |
| garde | `guard` | rapprochement (des médias) | `reconciliation` |
| recherche / résultat | `search` / `result` | à blanc / réel / contrôle (import) | `dry-run` / `real` / `check` |
| lire / enregistrer / chercher | `read` / `save` / `find` | cible / source / empreinte | `target` / `source` / `fingerprint` |
| accueil (onboarding de l'espace) | `onboarding` | aperçu | `preview` |
| adresse (URL) | `url` ou `path` | notes de version | `releaseNotes` |
| hôte / en-têtes | `host` / `headers` | verrou | `lock` |
| plancher (temps minimal d'une réponse) / plafond (de session) | `floor` / `cap` | prolonger / prolongement | `extend` / `extension` |
| boîte (email) | `mailbox` | page de relais | `relay` |
| nettoyage (des cookies hérités) | `cleanup` | session expirée (message de reconnexion) | `signedOut` |
| revendications (jeton Google) | `claims` | compte bloqué | `blockedAccount` |
| puce (langue, compétence) | `bullet` | ligne (d'une liste) | `row` |
| saisie (texte tapé) / saisie gardée | `input` / `guardedInput` | étape (de l'accueil) | `step` |
| envoi (d'un fichier) | `upload` | avancement (du profil) | `progress` |
| refus | `refusal` | suppression (du compte) | `deletion` |
| lieu (ville ou département tapé) / annuaire (liste des profils) | `place` / `directory` | pertinence (classement par mots) / voie (rue) | `relevance` / `street` |
| particulier (visiteur) / page d'accueil (publique) | `client` / `home` | gabarit (en-tête, pied) / blocs | `layout` / `blocks` |
| pages fixes / fil d'Ariane | `static pages` (dossiers `static-pages`) / `breadcrumb` | métadonnées / partage (réseaux sociaux) | `metadata` / `share` |
| tâches (dossier `src/lib/tasks`) / planificateur | `tasks` / `scheduler` | marque (de connexion) / opposition (à la mesure) | `mark` (`sign-in-mark`) / `optOut` |
| échec (d'envoi) / doublon | `failure` / `duplicate` | frein (d'un contact) / reprise | `rateLimit` / `retry` |
| purge / conservation | `purge` / `retention` | chargeur (du script de mesure) / valeurs | `loader` / `values` |
| accès / médias | `access` / `media` | stockage / prestataire | `storage` / `provider` |
| prix / montant | `price` / `amount` | rédaction (contenu : articles, talents) | `editorial` (dossier `src/demo-data/editorial.ts`) |
| requête bornée / étiquette (cache) | `boundedQuery` / `tag` | rafraîchissement (du cache) | `refresh` / `revalidate` |
| référentiel (des communes) / hors ligne | `reference` / `offline` | revue (liste des villes à revoir) / décisions (table) | `review` / `decisions` |
| prêt (d'un hash) / à revoir | `lend` / `toReview` | canari (test de la CI) / dérive (du schéma) | `canary` / `drift` |
| valider / contrôler (un hôte, une image) | `validate` / `check` | delta (export du retour arrière) / depuis la bascule | `delta` / `sinceCutover` |
| jeu de données (du banc) / capture (d'écran) | `dataset` / `screenshot` | écoute (adresse d'un faux service) / décalage (de ports) | `listen` / `offset` |
| pays / ville (à l'étranger) | `country` / `town` | type de zone / code postal | `zoneKind` / `postalCode` |
| revue de zone (privée, d'un profil) / candidate (commune possible) | `zoneReview` / `candidate` | à l'étranger / drapeau | `abroad` / `flag` |
| relance (courriel de rappel) / désinscription | `reminder` / `unsubscribe` | inactif (compte sans activité) / rapport (interne) | `inactive` / `report` |
| devis (demande de) / formulaire de devis | `quoteRequest` / `quote form` | consentement / interrupteur (d'exploitation) | `consent` / `switch` |
| courriel aux membres (envoi unique) / journal d'envoi | `membersMail` / `sendLog` | plafond (d'une passe) / destinataire | `limit` / `recipient` |
| édition directe (sur la page) / bloc éditable | `direct-edit` (dossier `src/components/direct-edit`) / `EditableBlock` (jamais « zone » : le mot est pris par la localisation) | mode édition / session d'édition | `edit mode` / `EditSession` |
| modèle (de prestation) / médiane (des prix) | `OfferModel` (`src/lib/price-median.ts`) / `median` | prestation phare / noms de départ (du profil) | `flagship` (`flagship-offer.ts`) / `initialNames` |
| annuaire public des entreprises (l'API « Recherche d'entreprises », jamais `directory`, pris par la liste des profils) / établissement | `businessRegistry` (`src/lib/activity/registry.ts`) / `establishment` | contrôle d'activité (du SIRET) / cessée | `activityCheck` (dossier `src/lib/activity`) / `ceased` |

## Pièges

- **Biome** se lance par les scripts ci-dessus ou par `bunx @biomejs/biome`. Le paquet `biome` du registre npm est un homonyme : un lancement par npx l'installerait à sa place.
- **`bun test` sans option lit le fichier `.env`, puis `.env.test`, qui l'emporte.** Il tourne alors sous l'environnement du banc de test, et ce que `.env.test` ne règle pas vient du `.env` de travail. Les tests ne dépendent jamais de ce fichier : passe `--no-env-file`, et lance depuis la racine, où `bunfig.toml` charge la garde.
- **Aucun test n'appelle Internet.** Sous `bun test`, une requête vers un hôte qui n'est pas du banc est refusée et fait échouer le test, même si le code attrape l'erreur. Le service se simule dans le test, par `simuler`. Le code l'appelle par `fetch` : c'est la seule sortie qui se simule. Vers un service extérieur, une requête faite par `node:http`, `undici` ou `Bun.fetch` est toujours refusée.
- **Après un arrêt forcé du serveur de développement**, `bun run typecheck` peut échouer sur un fichier de `.next/dev/types/`. Supprime le dossier `.next/dev/` et relance.
- **Branches.** `v3` est la branche d'intégration. Une branche de travail s'appelle `v3-<numéros des tickets>` : git refuse `v3/…` tant que `v3` existe. Avant une poussée, `git status -sb` montre la branche suivie : une branche créée depuis `origin/main` pousserait vers `main`.
- **Versions figées.** Next est en 16.4.1 (correctif de sécurité du 23/10/2026), et les paquets `@payloadcms/*` restent à la version exacte de `payload`. Aucune montée de version en passant. Renovate ne propose rien sur `v3` : `renovate.json` ne prend effet qu'à la bascule.
- **`payload` est corrigé par un patch** (`patches/payload@3.90.2.patch`, `patchedDependencies` de `package.json`, que `bun install` applique) : le contrôle du verrou d'un document lit dans la transaction de l'enregistrement. Sans lui, cinq enregistrements simultanés par REST bloquent l'application pour de bon (`tests/integration/payload-locks.test.ts`). Le patch ne vaut que pour la version que sa clé nomme : après une montée de `payload`, bun ne l'applique plus, sans rien dire. Il corrige aussi `logError` : le niveau d'un refus se lit par le constructeur (`APIError`, `AuthenticationError`, `UnverifiedEmail`), car le nom des classes est renommé dans le build de production et les clés de `loggingLevels` n'y correspondaient plus (ticket 223). `tests/unit/patch-payload.test.ts` le dit alors : vérifier si la nouvelle version passe `req` à cette lecture et lit le niveau par `err.name` seulement, puis refaire le patch avec la commande « patch » de bun, ou le retirer.
- **Le pool de la base a un délai d'attente de connexion** (`src/lib/pool-base.ts`, 5 s, ticket 222) : si toutes les connexions sont prises, la requête suivante échoue avec « timeout exceeded when trying to connect » au lieu d'attendre pour toujours (`tests/integration/pool-delay.test.ts`). Signalement du bug du verrou à Payload (payloadcms/payload) : **pas encore publié**, c'est une publication sur un dépôt public et elle attend l'accord d'Andy. Une fois publié, noter ici son adresse : elle sert à retirer le patch à la montée de version.
- **`slugField()` de Payload** échoue à la création d'un document publié sans slug. Le slug d'un profil vient de `src/lib/slug.ts`.
- **Un client qui n'est pas un navigateur** (`curl`, un test) envoie l'en-tête `Origin` d'une origine de confiance avec son cookie de session, sinon le cookie est ignoré (README, « Accès »).
- **Ces guides sont écrits à la main.** Le serveur de développement de Next n'en génère pas (`agentRules: false` dans `next.config.ts`). Un test les garde : `bun --no-env-file test tests/unit/guides-agents.test.ts`.

## Agent skills

### Issue tracker

Les tickets sont des issues GitHub de `For-Hives/my-makeup` (dépôt public : aucun secret, aucune donnée personnelle dans une issue). Voir `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulaire par défaut : `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` ; catégories `bug` et `feature`. Voir `docs/agents/triage-labels.md`.

### Domain docs

Contexte unique : le glossaire est dans ce guide et dans `docs/noms.md`. Voir `docs/agents/domain.md`.
