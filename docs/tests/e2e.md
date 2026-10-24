# Les essais de bout en bout

Un essai de bout en bout ouvre l'application dans un vrai navigateur, comme une visiteuse ou une maquilleuse. L'application est celle de ce dépôt, construite pour la production et branchée sur le banc de test local ([`banc.md`](banc.md)). Le navigateur est le Chromium de Playwright 1.59.1.

Chaque essai tourne à deux tailles d'écran :

| Projet | Largeur | Quels essais |
|---|---|---|
| `chromium` | 1440 px | Tous |
| `mobile` | 390 px, écran tactile | Ceux qui portent l'étiquette `@mobile` |

Aucun essai ne vise le site en ligne : voir « Ce qui empêche de viser la prod ».

## Une fois par poste : le navigateur

```sh
bunx playwright install chromium
```

Le navigateur s'installe hors du dépôt, dans le cache de Playwright. Il faut aussi Node 24 (`.nvmrc`) : Playwright tourne sous Node, pas sous bun.

## Lancer

```sh
bun run bench:up                                   # le banc de test, s'il ne tourne pas déjà
bun run test:e2e                                  # tous les essais de tests/e2e, aux deux tailles
bun run test:e2e tests/e2e/shell.spec.ts       # un seul fichier
bun run test:e2e --project=mobile                 # une seule taille
bun run bench:down                                 # à la fin : arrête le banc et efface tout
```

Toute option de `playwright test` passe telle quelle : `--headed` pour voir le navigateur, `--ui` pour l'interface de Playwright, `-g "un titre"` pour un seul essai.

Avec plusieurs bancs sur le poste, les deux variables du banc choisissent l'instance, et l'application écoute sur le port 3100 plus le décalage :

```sh
BENCH_INSTANCE=ticket-120 BENCH_OFFSET=20 bun run test:e2e   # application sur http://localhost:3120
```

Mesuré le 14/10/2026 sur un poste de développement : 21 secondes pour les 8 essais du ticket 013, build compris (16 secondes de build à froid, 5 à 7 secondes ensuite).

## Ce que fait un lancement

1. Il refuse de partir si la cible n'est pas l'application du banc, si le banc ne répond pas, ou si le port de l'application est déjà pris. Chaque refus dit quoi faire.
2. Il vide la base du banc : l'application la reconstruira par ses migrations. Il vide aussi ce qui vit à côté d'elle et qu'un lancement précédent a pu laisser, les tests d'intégration surtout : le capteur de mails, le stockage d'objets et la fausse base Strapi (ticket 225). Un essai part ainsi du même état que le banc ait servi ou non, sans « réinitialiser à la main » après `bun run test:integration`.
3. Il construit l'application pour la production (`bun run build`), sans base, sans secret et sans fichier `.env`, comme en CI.
4. Il lance Playwright, qui :
   - démarre l'application par `bun run start`, sur `127.0.0.1` et sur le port du banc, et attend que `/api/health` réponde ;
   - vérifie de nouveau la cible, puis que l'application est saine, et que sa base est celle des migrations, conforme au code et sans trace de poussée (préparation globale, `tests/support/e2e-server.ts`, voir ci-dessous) ;
   - lance les essais ;
   - arrête l'application, même si un essai échoue, et même sur un Ctrl+C.
5. Il le lance **trois fois**, l'une après l'autre (`playwrightPhases`, `tests/support/e2e.ts`) : d'abord tous les essais aux deux tailles ; puis, seul, le crawl des interfaces (`ui-crawl.spec.ts`, projet `crawl-alone`, ticket 312) ; puis, seul, l'import réel de la fausse base Strapi (`imported-profile-slice.spec.ts`, projet `import-final`). Chaque passage rejoue même quand le précédent a échoué. Pourquoi l'import : cet essai vide la base et le stockage avant d'importer, parce que l'import refuse les adresses du jeu du banc (`zoe-lefevre`, `ines-morel`) et compte « en trop » tout compte qui porte un identifiant de l'ancien site sans venir de la source (les comptes du jeu, ceux des essais de la connexion Google) : aucun autre essai ne peut tourner à côté. Pourquoi le crawl : il lit 40 adresses, dont la recherche et l'accueil, qui listent tous les profils du banc à cet instant ; or chaque autre essai crée des profils et les retire par son propre Payload, qui ne prévient pas le cache de l'application : une liste montre alors une carte dont la photo n'existe plus, et l'optimiseur d'images répond 404 (« upstream image response failed … 404 » sur `jeu-page-*.webp`), à chaque nouvelle tentative. Aucun essai ne peut s'écarter d'un crawl qui lit les profils de tous : il joue donc seul, sur une application redémarrée et un cache vidé, quand plus rien ne bouge. Les options passent aux trois passages (`--shard`, `--workers`, un fichier, `-g`), un passage qui ne trouve aucun essai réussit ; `--project=mobile` ne joue que le premier, `--project=crawl-alone` que le deuxième, `--project=import-final` que le troisième. Les traces des deux derniers passages sont dans `test-results/essais-crawl/` et `test-results/essais-final/` et leurs résultats sur l'écran : ils n'effacent ni le rapport ni les traces du premier. (Les dépendances de projets de Playwright n'y suffisent pas : un fichier demandé rejouerait toute la suite, et un lot de la CI recevrait tous les essais.)

L'application des essais ne lit aucun fichier `.env`, ni au build ni au démarrage : elle ne reçoit que l'environnement du banc (`.env.test`). Ce qu'un `.env` de travail contient ne l'atteint jamais.

## La base : les migrations, puis le code

- Sur la base vide, l'application joue les migrations versionnées de `src/migrations/`, comme l'image Docker à son premier démarrage. Ce sont elles seules qui construisent les tables : rien ne pousse le schéma du code dans la base du banc (ticket 049).
- Avant le premier essai, la préparation globale lit la base sans rien y changer : le Payload des essais se branche sans pousser de schéma (`withoutSchemaChange`, `tests/support/payload-test.ts`), comme celui de chaque essai.
- Elle refuse de lancer les essais, avec un message qui dit quoi faire, dans deux cas (`tests/support/bench-schema.ts`) :
  - la base porte la trace d'une poussée du schéma, une ligne `dev` de lot -1 dans `payload_migrations` : un Payload s'est branché en poussant le schéma, et une migration manquante y passerait inaperçue ;
  - la base que les migrations ont construite ne décrit pas les collections du code : une collection changée sans sa migration, ou une migration dont le SQL ne crée pas ce que son instantané déclare. Le message donne le SQL qu'une migration contiendrait pour la rattraper, et demande d'écrire cette migration (`bun run payload:migrate:create`).
- Une table ou une colonne renommée dans le code sans que les migrations suivent est refusée aussitôt, d'après les noms : le contrôle ne pose jamais de question. S'il en attendait une malgré tout, la préparation globale s'arrêterait au bout de 30 secondes, avec un message.
- Après un lancement, la base garde ce que les essais y ont laissé, sans ligne `dev` ; le lancement suivant la vide. Les tests d'intégration la vident aussi.

## Écrire un essai

Un essai est un fichier `tests/e2e/<sujet>.spec.ts`. Playwright ne prend que les fichiers en `*.spec.ts` de ce dossier.

```ts
import { expect, test } from '@playwright/test'
import { createAccount } from '../outils/fabrique-comptes'

test('l’administration s’ouvre déjà connectée', { tag: '@mobile' }, async ({ context, page }) => {
	const compte = await createAccount('admin')
	await context.addCookies(compte.session.cookies)

	await page.goto('/admin/account')

	await expect(page.getByRole('heading', { level: 1, name: compte.email })).toBeVisible()
})
```

Règles :

- **Un essai ouvre un chemin**, comme `/admin`, jamais une adresse complète : l'hôte est celui de la cible, vérifié par la garde (garde-fou C07).
- **Un essai attend un état, jamais une durée** : `await expect(…)`, `expect.poll`, `page.waitForURL`. Ni `waitForTimeout`, ni `setTimeout` (garde-fou C06).
- **Une session sans mot de passe** : `createAccount` crée un compte fictif dans la base du banc et rend son cookie de session, que `context.addCookies` pose dans le navigateur. Chaque appel donne un compte distinct ; chaque essai part d'un navigateur neuf, sans cookie.
- **`@mobile`** fait tourner l'essai aussi à 390 px. Un parcours qu'on fait au téléphone le porte.
- **`@lent`** marque un essai qui attend une vraie durée (une session de 8 s qui finit d'elle-même, E13). Aucune configuration ne le filtre encore : il tourne avec les autres, et le ticket de la CI nocturne décidera de le séparer.
- **L'administration est écrite par Payload**, en français (ticket 221) : on y trouve un élément par son adresse (`a[href="/admin/account"]`) ou par une donnée du compte, pas par un libellé.
- **Aucune donnée réelle** : les comptes sont en `@example.test`, comme partout dans les tests.
- **Un essai ne lit que ses propres données** (ticket 225). Tous les essais partagent le même banc et tournent en même temps : un essai ne compte jamais ce que le banc contient en tout (les mails du capteur, les profils d'une ville, les résultats d'un mot, les comptes d'une collection). Il crée ce qu'il lit sous un préfixe unique par essai (`crypto.randomUUID()`), lit les mails de l'adresse de sa personne fictive (`mailReceived(email)`, `waitMail`), et cherche un mot ou une commune que seuls ses profils portent. Il ne vide jamais un service partagé (capteur de mails, stockage, base).

Les deux fichiers du ticket 013 servent d'exemples : `shell.spec.ts` (l'accueil, puis l'administration avec une session de la fabrique, et sans session) et `a11y.spec.ts`.

## L'accessibilité

```ts
import { violationsSevere } from '../outils/axe'

expect(await violationsSevere(page)).toEqual([])
```

`violationsSevere` lance axe dans la page telle qu'elle est, sur les règles WCAG 2.0 et 2.1, niveaux A et AA, et rend les violations des deux niveaux les plus graves d'axe, « serious » et « critical ». Une liste vide veut dire : aucune. Attends d'abord l'état à contrôler, axe lit la page une fois.

- Chaque violation dit sa règle, son niveau, ce qu'elle demande, un lien vers son explication et les éléments en cause.
- L'option `sauf` retire des sélecteurs du contrôle. Elle sert pour un composant que le site n'écrit pas, jamais pour cacher une faute du site.
- `a11y.spec.ts` contrôle l'accueil provisoire aux deux tailles, et prouve que le contrôle sait échouer : sur une page fautive, il trouve une image sans texte et un contraste trop faible.
- Un contrôle automatique ne voit qu'une partie des fautes. L'ordre de lecture, le focus et ce que dit un vrai lecteur d'écran se vérifient à la main, à la recette.

## La recette de l'espace maquilleuse (ticket 142)

`tests/e2e/direct-edit-acceptance.spec.ts` se joue une fois, aux deux tailles, sur la page d'édition directe ; la CI le rejoue avec les autres essais, puis compte les orphelins (`bun run bench:reconcile --outside-import`).

- **E67, E68** : une maquilleuse au profil plein ouvre l'un après l'autre les 15 blocs de l'édition directe. Pour chacun : 0 violation grave d'axe, Échap le ferme, le focus revient sur son bouton. La liste des boutons est comparée à celle de la page : un panneau ajouté sans entrer dans la recette fait échouer l'essai.
- **E37** : la photo principale est changée deux fois par l'interface ; l'`og:image` du profil public change, et sert la nouvelle image.
- **Zoom à 200 %** : la largeur de la fenêtre est divisée par deux (320 px au plus bas, la largeur de la règle WCAG 1.4.10 de reflux). Ni défilement de côté, ni deux liens, boutons, champs ou titres qui se recouvrent, dans chaque éditeur. Le contrôle de recouvrement compare les boîtes ligne par ligne et prouve qu'il sait échouer.
- Le reste de la liste du ticket (E02, E19 à E36, U25 à U32, U79 à U81, I23 à I27, I36, I38) est joué par les essais de chaque section.

## Les 15 pages clés et les listes, une dernière fois (ticket 178)

Deux essais se jouent à la fin, quand tout est livré ; la CI les rejoue avec les autres.

- **`frame-ban.spec.ts`** (ticket 271) : une page d'une autre origine (un petit serveur de l'essai, sur un autre port de `127.0.0.1`) met `/auth/signin` dans un `iframe` : le navigateur le refuse (page d'erreur `chrome-error:`, aucun formulaire) ; un cadre de même origine s'affiche et se lit.
- **`a11y-key-pages.spec.ts`** : axe ne trouve aucune violation « serious » ni « critical » sur 15 pages, aux deux tailles. Les 12 pages ouvertes à tous : accueil, recherche d'une ville, un profil public, un talent, le blog, un article, le contact, les mentions légales, la connexion, l'inscription, le mot de passe oublié, la page 404. Les 3 pages de l'espace : l'espace lui-même (avec quatre panneaux de nature différente ouverts l'un après l'autre : un texte, la recherche de commune, une liste avec ses options, le portfolio), l'aperçu du profil, la première étape de l'accueil. Deux états s'y ajoutent : la recherche sans résultat et le formulaire de contact avec ses erreurs. Le dernier essai compte les 15 pages. E67 et E68 parcourent les douze panneaux et la suppression (`dashboard-acceptance.spec.ts`).
- **`lists-removal.spec.ts`** : sur chacune des sept listes de l'édition directe (langues, compétences, expériences, formations, prestations, options d'une prestation, photos du portfolio), la zone `role="status"` est là et vide à l'ouverture ; un retrait au clavier puis un retrait au clic ou au toucher laissent le focus dans le panneau (jamais sur un champ de saisie après un clic), et chacun est annoncé par une phrase qui change. Ce sont les règles L4 et L5 de [`docs/qualite.md`](../qualite.md), §3, dans un vrai navigateur ; les sept règles ont chacune leur test en unitaire pour chaque panneau.

## La parité des adresses (I45)

`tests/e2e/url-parity.spec.ts` demande à l'application chaque adresse gelée ([`docs/migration/URLS.md`](../migration/URLS.md)) et vérifie le code que la table promet, la redirection en un seul saut vers la bonne destination, et le même h1 que l'ancien site. Il n'ouvre pas de navigateur : il interroge l'application avec `request`, sans suivre les redirections, et lit le HTML comme l'outil de mesure l'a lu.

```sh
bun run test:e2e tests/e2e/url-parity.spec.ts
```

- **Les cas du banc** : les adresses écrites en clair dans l'inventaire gelé, les exemples de la table, et, pour les pages qui dépendent des données (profils, talents, articles), le jeu fictif du banc, que l'essai charge lui-même. Les hôtes (`http`, `www`, ancienne API) ne sont pas des cas : l'hébergeur répond.
- **Le h1 de l'ancien site** est dans `tests/fixtures/url-parity-h1.json`, en empreintes : pour chaque adresse, le nombre de h1 et le SHA-256 de leur texte. Le texte n'y est jamais. Une page qui avait deux h1 doit en avoir un seul. Une page de recherche avec des paramètres doit en avoir un seul, dont le texte dit ce qui a été cherché (registre des changements voulus). Pour refaire le fichier : `bun --no-env-file scripts/migration/parity-urls-h1.ts <baseline-2026-10.csv>`, avec le fichier privé de l'outil de mesure.
- **Le bilan par type** s'affiche à chaque lancement : pour chaque famille de la table, les adresses vertes et celles « à venir ». Les familles de la liste `LIVREES` du fichier sont livrées : une adresse de ces familles qui ne répond plus comme la table fait échouer l'essai. Un ticket qui livre un type l'ajoute à cette liste dans son commit. Un type qui n'y est pas mais répond juste est compté vert.
- **Un écart connu** est affiché et ne fait ni vert ni rouge. Aujourd'hui, un seul : Next répond lui-même à toute adresse avec `//`, par un 308, avant que le site ne lise l'adresse (`proxy.ts` ne la voit jamais). La table promet un 301 ; `//toutes-les-news` fait deux sauts. Le cas se règle chez l'hébergeur (une règle de réécriture devant l'application), pas dans le code.
- **Sur la copie importée** : `PARITE_URLS_LISTE=<baseline-2026-10.csv> bun run test:e2e tests/e2e/url-parity.spec.ts` rejoue toutes les adresses du fichier privé de l'outil de mesure, profils compris, contre un banc où l'import a tourné ([`docs/migration/IMPORT.md`](../migration/IMPORT.md)). Aucune adresse de profil n'est écrite nulle part : un profil se lit « profil #n » dans le bilan et dans les messages. Les profils vides du spam, que l'import ne reprend pas, répondent 404 ; la liste ne les distingue pas des autres, les deux codes sont admis.
- **Le titre de l'onglet des talents** (ticket 108) : sur la copie importée seulement, chaque adresse `/talent/<slug>` qui répond 200 doit avoir un `<title>` de 50 à 60 caractères, différent de son h1 (`talentTitleDefaults`, `tests/support/url-parity.ts`). C'est le titre que la rédaction écrit dans le champ `pageTitle` de l'administration ; tant qu'il est vide, l'onglet garde le titre court suivi du nom du site et le contrôle échoue. Sur le banc, les talents d'essai n'ont pas ce titre : le contrôle ne s'y applique pas.

## Des données pour les pages publiques

- Le cache de données de Next (`unstable_cache`, étiquettes `talents` et `profils`) est sur le disque, dans `.next/cache/fetch-cache`, et survit à un build : `bun run test:e2e` le vide avant de construire.
- Dans un lancement, une page lue avant que les données n'existent garde ce qu'elle a vu. Un essai qui charge des données avec son propre Payload demande à l'application de rafraîchir (`tests/support/public-pages.ts` : `refreshProfilePages`, `createContent`, `deleteContent` passent par l'API REST, donc par les crochets de l'application).
- Les essais de la recherche et de la parité chargent leurs propres profils, « Essai … » (`tests/fixtures/search-profiles.ts`), sous un verrou entre les processus (`tests/support/lock.ts`), et non le jeu du banc : la fausse base de l'import (`imported-profile-slice.spec.ts`) porte les mêmes noms inventés que le jeu, et refuse leurs adresses si le jeu est déjà là.
- L'essai de la fraîcheur (`page-freshness.spec.ts`, ticket 117) prouve qu'une page vient du cache en changeant la base **derrière le dos de l'application** : un `payload.update` du processus de l'essai n'est pas une requête de Next, rien n'est rafraîchi, et la page doit encore montrer l'ancien texte ; un enregistrement par l'API REST la rafraîchit. Chaque essai pose son propre profil (« Essai Fraicheur… », tiré du profil type « actif mais pas publiable ») et le retire par l'application.
- L'essai des pages de la recherche (`keyword-search.spec.ts`, E41 et I29) a besoin de plus de 20 résultats, que le banc n'a pas : il crée 45 profils générés par la fabrique (`tests/support/profile-factory.ts`, `buildByApplication`) **par l'API de l'application**, pour que chaque enregistrement rafraîchisse les pages comme pour une visiteuse, et les retire à la fin. Ils sont à Lille et à Lillers (`LILLE_AREA`, à 42 km l'une de l'autre), loin d'Annecy et de Nantes, et aucun ne se déplace : les autres recherches du banc ne les voient pas, et la recherche « Lille » avec leur mot coupe ses sections entre les pages (« À Lille », puis « Plus loin, à moins de 50 km »). Chaque projet (1440 et 390 px) a son préfixe et son mot : ils ne se voient pas. La même fabrique sème, par l'API locale, les 500 profils de l'essai de charge I31 (`tests/integration/search.test.ts`).
- L'essai du frein (I30) envoie ses requêtes avec un `X-Forwarded-For` de la plage de documentation, tiré au hasard : une requête qui n'est pas passée par le proxy (sans l'en-tête, ou avec l'adresse de bouclage que Next y écrit) n'est jamais freinée, si bien que les essais qui partent tous de l'adresse du poste ne se gênent pas.
- L'application des essais ne demande pas la liste officielle des communes (geo.api.gouv.fr), qui répondait trop lentement ou pas du tout depuis la CI : elle demande la fausse liste du banc, par `BENCH_CITIES` ([`banc.md`](banc.md), « La fausse liste des communes »). Un essai qui choisit une commune la trouve là, aux deux tailles, sans Internet.
- L'optimiseur d'images de Next n'accepte que l'hôte des photos, en https. Pour que les photos du banc (le simulateur de stockage, en http sur `127.0.0.1`) se chargent, le build et le serveur des essais reçoivent `BENCH_IMAGES=http://127.0.0.1:<port>/<espace>` (`tests/support/e2e.ts`) : `next.config.ts` ouvre alors cet espace-là et lui seul (`benchImages`, `src/lib/security-headers.ts`). La production ne règle jamais cette variable ; une valeur qui n'est pas exactement une adresse locale avec un port et un espace est refusée, et un test garde la configuration de production fermée aux adresses locales.

## Quand un essai échoue

| Quoi | Où |
|---|---|
| Trace (chaque action, le réseau, la page à chaque étape), vidéo et capture de l'essai en échec | `test-results/essais/<essai>/` : `trace.zip`, `video.webm`, `test-failed-1.png` |
| Le rapport complet, traces et vidéos comprises | `playwright-report/`, à ouvrir par `bunx playwright show-report playwright-report` |
| Les résultats, pour un outil | `test-results/resultats.json` (premier passage) |
| L'essai de l'import réel, joué seul à la fin | `test-results/essais-final/` ; ses résultats sont sur l'écran |
| Ce que l'application a écrit | Dans la sortie du lancement, sur les lignes qui commencent par `[WebServer]` |

Une trace s'ouvre par `bunx playwright show-trace`, suivi du chemin de son `trace.zip`.

Les traces et les vidéos des essais réussis ne sont pas gardées. Les deux dossiers sont ignorés par git, et Playwright vide `test-results/essais/` au début de chaque lancement.

En CI, un essai en échec est rejoué deux fois, et un essai laissé en `.only` fait échouer le lancement.

## En CI

Le job `e2e` de `.github/workflows/ci.yml` lance les essais en quatre lots côte à côte, de `e2e (1/4)` à `e2e (4/4)`. Chaque lot fait ce qu'on fait sur un poste :

```sh
bunx playwright install --with-deps chromium   # le navigateur, et les bibliothèques du système qu'il demande
bun run bench:up
bun run test:e2e --shard=1/4                   # son quart des essais ; les autres lots lancent --shard=2/4 à 4/4
```

- Playwright partage les essais entre les lots ; chaque lot construit l'application lui-même, démarre son banc et ne dépend d'aucun autre. Un lot en échec n'arrête pas les autres.
- Dans un lot, deux processus de Playwright jouent les essais côte à côte, sur le même banc et la même application. Un essai ne compte donc jamais ce que toute la base ou tout le faux Umami contient : il lit ce qu'il a posé lui-même (son talent, ses profils « Essai … », les mesures de son propre navigateur, `testAgent` de `tests/support/fake-umami.ts`), et ne vide jamais ce qui est partagé.
- Le nombre de lots est celui de `SHARDS` (`tests/support/ci-guardrails.ts`) : la garde refuse une matrice, un nom de job ou une commande qui en dirait un autre.
- GitHub règle `CI=true` : un essai en échec est rejoué deux fois, et un essai laissé en `.only` fait échouer le lancement.
- Un lot a 10 minutes au plus : au-delà, il est arrêté, et `ci-ok` est rouge.
- Après un échec, le lot envoie `playwright-report/` et `test-results/` : l'artefact `e2e-1` à `e2e-4` du passage, sur la page de la CI, gardé 14 jours. Le rapport s'ouvre par `bunx playwright show-report playwright-report`, une fois l'artefact décompressé.
- Pour le rejouer sur un poste, banc démarré : `CI=true bun run test:e2e --shard=1/4 --workers=2`.

## Ce qui empêche de viser la prod

- La garde des tests (`tests/support/environment-guard.ts`) refuse toute cible sur `my-makeup.fr` et ses sous-domaines, dans tout environnement. Il n'y a pas de préprod (ticket 232) : les tests ne visent qu'une adresse locale. Elle est appelée trois fois avant le premier essai : par `bun run test:e2e` avant tout build, au chargement de la configuration de Playwright, puis par la préparation globale. Un lancement vers la prod s'arrête avant le premier essai, avec un message qui nomme la variable en cause.
- Un essai n'ouvre que des chemins (garde-fou C07).
- `playwright.config.ts` ne règle rien lui-même : tous les réglages viennent de `tests/support/e2e.ts`, que les garde-fous de `tests/ci/` lisent (C07 : pas de `.only` en CI, seuls les `*.spec.ts`, aucune adresse de la prod dans `baseURL`).
- Les sondes de `tests/probes/` lisent le site en ligne, en GET seulement ([`sondes.md`](sondes.md)). Elles ne passent ni par Playwright ni par cette garde, qu'elles n'assouplissent pas : elles ont leur propre garde et leur propre variable, `PROBES_TARGET`.

## Lancer Playwright sans la commande

`bunx playwright test --list` liste les essais sans rien lancer. Sans l'environnement du banc, Playwright ne démarre aucune application : la préparation globale dit alors de passer par `bun run test:e2e`. Vers une autre adresse que celle du banc (`BASE_URL`), il ne démarre rien non plus ; les essais qui demandent un compte de la fabrique n'y tournent pas, puisqu'elle n'écrit que dans la base du banc.

## Pièges

- **`localhost` n'est pas `127.0.0.1`.** Le cookie de session vaut pour l'adresse exacte de l'application, `http://localhost:<port>` : un essai qui ouvrirait `127.0.0.1` y serait déconnecté.
- **`.next/` contient ensuite le build des essais**, construit sans l'adresse du site. Avant un `bun run start` à toi, relance `bun run build`.
- **Le Payload des essais régénère `src/payload-types.ts`** quand une collection a changé, comme dans les tests d'intégration. Un fichier modifié après un lancement veut dire que `bun run payload:types` n'a pas été lancé.
- **L'administration charge un avatar depuis gravatar.com**, avec l'empreinte d'une adresse fictive. Sur l'accueil et l'administration, c'est la seule adresse hors du poste que le navigateur contacte (relevé du 14/10/2026). Les tickets de l'administration la retirent. Un essai qui compte les erreurs de la console de l'administration appelle `withoutOutsideNetwork(context)` (`tests/support/offline.ts`) : toute requête qui sort du poste reçoit une image vide, et le réseau ne peut pas le rendre rouge (relevé du 16/10 : `net::ERR_NETWORK_CHANGED` pendant un passage complet).

## Passe seul, échoue en série : les causes relevées (ticket 225)

Relevé du 16/10/2026, sur `0833b85` : chaque cause a été trouvée, puis corrigée dans l'essai ou dans l'outillage, jamais par une relance, une attente fixe ou un délai allongé seul.

| Essai | Cause | Correction |
|---|---|---|
| Import de la tranche | Le jeu du banc tient les slugs `zoe-lefevre` et `ines-morel` : l'import refuse les profils 21 et 23, et il compte « en trop » les comptes 900001 à 900004 (et ceux que d'autres essais créent avec un identifiant de l'ancien site) : sortie 4 | Un passage à part, seul, qui vide la base et le stockage avant d'importer (voir « Ce que fait un lancement », point 5) |
| E07, connexion Google | `countMails()` comptait tous les mails du capteur, et `beforeEach` le vidait : un mail d'un essai voisin le rendait rouge | L'essai lit les mails de l'adresse de sa personne fictive (`mailReceived`) et ne vide plus le capteur |
| E39, profil masqué, recherche par ville | Les listes sont coupées à 20 résultats et leur nombre bouge avec les profils des autres essais (le jeu, la fabrique, les essais de l'espace) : une maquilleuse d'essai passait en page 2, un titre comptait des profils d'autres essais | Les profils d'essai de la recherche portent un mot à eux dans leur spécialité (`TEST_WORD`, `tests/fixtures/search-profiles.ts`) : chaque recherche le tape avec son mot ou sa ville, et ne trouve que ces profils |
| Premier passage après les tests d'intégration | Ils laissent des mails, des photos aux noms du jeu et la fausse source Strapi : la base est vidée, ces restes non | Le lancement les vide aussi (point 2 de « Ce que fait un lancement ») |
| Admin, filtre « sans profil » (`admin-accounts.spec.ts`) | Vu au passage complet : avec plus de 20 profils dans le banc, le panneau ignorait le filtre. Son lien écrivait un paramètre par propriétaire (`[0]` à `[n]`), et `qs` transforme en objet toute liste de plus de 20 entrées. C'était un défaut du site, pas de l'essai | Le lien écrit une seule valeur à virgules (`where[id][not_in]=3,7`) : `src/lib/account/admin-filters.ts` |

| Admin, erreurs de console (`admin-comptes`, `admin-profils`, `admin-messages-contact`) | Le panneau demande l'avatar de gravatar.com : un changement de réseau du poste pendant le passage (`net::ERR_NETWORK_CHANGED`) devenait une erreur de console, donc un rouge qui n'est pas celui du site | Les trois essais répondent eux-mêmes à toute requête qui sort du poste (`withoutOutsideNetwork`) |
| Plan du site en mobile (`sitemap.spec.ts`) | Il lisait la page du plan, puis le sitemap, et exigeait les mêmes profils sur les deux, tous ceux du banc : `public-profile.spec.ts` publie et masque ses propres profils entre les deux lectures (vu : `page-juliet` dans le sitemap, pas dans le plan) | Les deux pages doivent s'accorder sur les profils de ce fichier, dans un sens et dans l'autre ; les profils des autres essais ne comptent pas |
| Déconnexion, « mêmes en-têtes de cache » (`sign-out.spec.ts`, ticket 256) | Vu 1 fois sur 30 répétitions : l'essai comparait le HTML brut de deux requêtes. Ce HTML porte le flux RSC (`self.__next_f.push`), dont les morceaux s'écrivent dans l'ordre où le serveur les termine : deux réponses identiques pour le visiteur peuvent différer d'octets. Essai mal écrit, pas un défaut du cache | L'essai compare le balisage sans ses `<script>` (`markupOf`) : ce que voit le visiteur. 60 répétitions vertes |
| I45 sur un hôte (`host-check.spec.ts`, ticket 256) | Vu au passage complet : `bench-dataset.spec.ts` charge le jeu du banc dans la base commune et l'y laisse ; ses talents `maquillage-mariee` et `maquillage-soiree` portent des slugs du vrai site, donc une fois au sitemap la commande comparait leur h1 fictif au h1 réel de l'ancien site (5 écarts, dont la variante avec barre finale). Vert quand l'essai passait avant l'autre | L'essai retire de la table des anciens h1 les pages du jeu (talents et articles de `src/demo-data/`) : elles gardent le contrôle de toute page (un h1, le bon statut), sans la comparaison au texte réel. Deux passages complets verts |

Le deuxième passage de `bun run test:e2e` redémarre l'application et vide de nouveau le cache de données du disque : il n'y retrouve pas les pages que le premier passage y a laissées (la fiche `zoe-lefevre` du jeu, par exemple).

Les autres essais vus intermittents (accueil E02, réseaux U28 en mobile, mesure Umami, `bench-dataset`) sont verts aux deux passages complets du 16/10 : aucune cause de leur côté à corriger, ils ne sont pas touchés.
