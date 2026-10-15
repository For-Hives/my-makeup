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
bun run banc:up                                   # le banc de test, s'il ne tourne pas déjà
bun run test:e2e                                  # tous les essais de tests/e2e, aux deux tailles
bun run test:e2e tests/e2e/coquille.spec.ts       # un seul fichier
bun run test:e2e --project=mobile                 # une seule taille
bun run banc:down                                 # à la fin : arrête le banc et efface tout
```

Toute option de `playwright test` passe telle quelle : `--headed` pour voir le navigateur, `--ui` pour l'interface de Playwright, `-g "un titre"` pour un seul essai.

Avec plusieurs bancs sur le poste, les deux variables du banc choisissent l'instance, et l'application écoute sur le port 3100 plus le décalage :

```sh
BANC_INSTANCE=ticket-120 BANC_DECALAGE=20 bun run test:e2e   # application sur http://localhost:3120
```

Mesuré le 14/10/2026 sur un poste de développement : 21 secondes pour les 8 essais du ticket 013, build compris (16 secondes de build à froid, 5 à 7 secondes ensuite).

## Ce que fait un lancement

1. Il refuse de partir si la cible n'est pas l'application du banc, si le banc ne répond pas, ou si le port de l'application est déjà pris. Chaque refus dit quoi faire.
2. Il vide la base du banc : l'application la reconstruira par ses migrations.
3. Il construit l'application pour la production (`bun run build`), sans base, sans secret et sans fichier `.env`, comme en CI.
4. Il lance Playwright, qui :
   - démarre l'application par `bun run start`, sur `127.0.0.1` et sur le port du banc, et attend que `/api/health` réponde ;
   - vérifie de nouveau la cible, puis que l'application est saine, et que sa base est celle des migrations, conforme au code et sans trace de poussée (préparation globale, `tests/outils/serveur-e2e.ts`, voir ci-dessous) ;
   - lance les essais ;
   - arrête l'application, même si un essai échoue, et même sur un Ctrl+C.

L'application des essais ne lit aucun fichier `.env`, ni au build ni au démarrage : elle ne reçoit que l'environnement du banc (`.env.test`). Ce qu'un `.env` de travail contient ne l'atteint jamais.

## La base : les migrations, puis le code

- Sur la base vide, l'application joue les migrations versionnées de `src/migrations/`, comme l'image Docker à son premier démarrage et comme la préprod. Ce sont elles seules qui construisent les tables : rien ne pousse le schéma du code dans la base du banc (ticket 049).
- Avant le premier essai, la préparation globale lit la base sans rien y changer : le Payload des essais se branche sans pousser de schéma (`sansChangementDeSchema`, `tests/outils/payload-test.ts`), comme celui de chaque essai.
- Elle refuse de lancer les essais, avec un message qui dit quoi faire, dans deux cas (`tests/outils/schema-du-banc.ts`) :
  - la base porte la trace d'une poussée du schéma, une ligne `dev` de lot -1 dans `payload_migrations` : un Payload s'est branché en poussant le schéma, et une migration manquante y passerait inaperçue ;
  - la base que les migrations ont construite ne décrit pas les collections du code : une collection changée sans sa migration, ou une migration dont le SQL ne crée pas ce que son instantané déclare. Le message donne le SQL qu'une migration contiendrait pour la rattraper, et demande d'écrire cette migration (`bun run payload:migrate:create`).
- Une table ou une colonne renommée dans le code sans que les migrations suivent est refusée aussitôt, d'après les noms : le contrôle ne pose jamais de question. S'il en attendait une malgré tout, la préparation globale s'arrêterait au bout de 30 secondes, avec un message.
- Après un lancement, la base garde ce que les essais y ont laissé, sans ligne `dev` ; le lancement suivant la vide. Les tests d'intégration la vident aussi.

## Écrire un essai

Un essai est un fichier `tests/e2e/<sujet>.spec.ts`. Playwright ne prend que les fichiers en `*.spec.ts` de ce dossier.

```ts
import { expect, test } from '@playwright/test'
import { creerCompte } from '../outils/fabrique-comptes'

test('l’administration s’ouvre déjà connectée', { tag: '@mobile' }, async ({ context, page }) => {
	const compte = await creerCompte('admin')
	await context.addCookies(compte.session.cookies)

	await page.goto('/admin/account')

	await expect(page.getByRole('heading', { level: 1, name: compte.email })).toBeVisible()
})
```

Règles :

- **Un essai ouvre un chemin**, comme `/admin`, jamais une adresse complète : l'hôte est celui de la cible, vérifié par la garde (garde-fou C07).
- **Un essai attend un état, jamais une durée** : `await expect(…)`, `expect.poll`, `page.waitForURL`. Ni `waitForTimeout`, ni `setTimeout` (garde-fou C06).
- **Une session sans mot de passe** : `creerCompte` crée un compte fictif dans la base du banc et rend son cookie de session, que `context.addCookies` pose dans le navigateur. Chaque appel donne un compte distinct ; chaque essai part d'un navigateur neuf, sans cookie.
- **`@mobile`** fait tourner l'essai aussi à 390 px. Un parcours qu'on fait au téléphone le porte.
- **`@lent`** marque un essai qui attend une vraie durée (une session de 8 s qui finit d'elle-même, E13). Aucune configuration ne le filtre encore : il tourne avec les autres, et le ticket de la CI nocturne décidera de le séparer.
- **L'administration est écrite par Payload**, en français (ticket 221) : on y trouve un élément par son adresse (`a[href="/admin/account"]`) ou par une donnée du compte, pas par un libellé.
- **Aucune donnée réelle** : les comptes sont en `@example.test`, comme partout dans les tests.

Les deux fichiers du ticket 013 servent d'exemples : `coquille.spec.ts` (l'accueil, puis l'administration avec une session de la fabrique, et sans session) et `a11y.spec.ts`.

## L'accessibilité

```ts
import { violationsGraves } from '../outils/axe'

expect(await violationsGraves(page)).toEqual([])
```

`violationsGraves` lance axe dans la page telle qu'elle est, sur les règles WCAG 2.0 et 2.1, niveaux A et AA, et rend les violations des deux niveaux les plus graves d'axe, « serious » et « critical ». Une liste vide veut dire : aucune. Attends d'abord l'état à contrôler, axe lit la page une fois.

- Chaque violation dit sa règle, son niveau, ce qu'elle demande, un lien vers son explication et les éléments en cause.
- L'option `sauf` retire des sélecteurs du contrôle. Elle sert pour un composant que le site n'écrit pas, jamais pour cacher une faute du site.
- `a11y.spec.ts` contrôle l'accueil provisoire aux deux tailles, et prouve que le contrôle sait échouer : sur une page fautive, il trouve une image sans texte et un contraste trop faible.
- Un contrôle automatique ne voit qu'une partie des fautes. L'ordre de lecture, le focus et ce que dit un vrai lecteur d'écran se vérifient à la main, à la recette.

## La recette de l'espace maquilleuse (ticket 142)

`tests/e2e/espace-recette.spec.ts` se joue une fois, aux deux tailles, quand toutes les sections de l'espace sont livrées ; la CI le rejoue avec les autres essais, puis compte les orphelins (`bun run banc:rapprocher --hors-import`).

- **E67, E68** : une maquilleuse au profil plein ouvre l'un après l'autre les 12 panneaux et la fenêtre de suppression. Pour chacun : 0 violation grave d'axe, Échap le ferme, le focus revient sur son bouton. La liste des boutons est comparée à celle de la page : un panneau ajouté sans entrer dans la recette fait échouer l'essai.
- **E37** : la photo principale est changée deux fois par l'interface ; l'`og:image` du profil public change, et sert la nouvelle image.
- **Zoom à 200 %** : la largeur de la fenêtre est divisée par deux (320 px au plus bas, la largeur de la règle WCAG 1.4.10 de reflux). Ni défilement de côté, ni deux liens, boutons, champs ou titres qui se recouvrent, sur la page et dans chaque panneau. Le contrôle de recouvrement compare les boîtes ligne par ligne et prouve qu'il sait échouer.
- Le reste de la liste du ticket (E02, E19 à E36, U25 à U32, U79 à U81, I23 à I27, I36, I38) est joué par les essais de chaque section.

## La parité des adresses (I45)

`tests/e2e/parite-urls.spec.ts` demande à l'application chaque adresse gelée ([`docs/migration/URLS.md`](../migration/URLS.md)) et vérifie le code que la table promet, la redirection en un seul saut vers la bonne destination, et le même h1 que l'ancien site. Il n'ouvre pas de navigateur : il interroge l'application avec `request`, sans suivre les redirections, et lit le HTML comme l'outil de mesure l'a lu.

```sh
bun run test:e2e tests/e2e/parite-urls.spec.ts
```

- **Les cas du banc** : les adresses écrites en clair dans l'inventaire gelé, les exemples de la table, et, pour les pages qui dépendent des données (profils, talents, articles), le jeu fictif du banc, que l'essai charge lui-même. Les hôtes (`http`, `www`, ancienne API) ne sont pas des cas : l'hébergeur répond.
- **Le h1 de l'ancien site** est dans `tests/fixtures/parite-urls-h1.json`, en empreintes : pour chaque adresse, le nombre de h1 et le SHA-256 de leur texte. Le texte n'y est jamais. Une page qui avait deux h1 doit en avoir un seul. Une page de recherche avec des paramètres doit en avoir un seul, dont le texte dit ce qui a été cherché (registre des changements voulus). Pour refaire le fichier : `bun --no-env-file scripts/migration/parite-urls-h1.ts <baseline-2026-10.csv>`, avec le fichier privé de l'outil de mesure.
- **Le bilan par type** s'affiche à chaque lancement : pour chaque famille de la table, les adresses vertes et celles « à venir ». Les familles de la liste `LIVREES` du fichier sont livrées : une adresse de ces familles qui ne répond plus comme la table fait échouer l'essai. Un ticket qui livre un type l'ajoute à cette liste dans son commit. Un type qui n'y est pas mais répond juste est compté vert.
- **Un écart connu** est affiché et ne fait ni vert ni rouge. Aujourd'hui, un seul : Next répond lui-même à toute adresse avec `//`, par un 308, avant que le site ne lise l'adresse (`proxy.ts` ne la voit jamais). La table promet un 301 ; `//toutes-les-news` fait deux sauts. Le cas se règle chez l'hébergeur (une règle de réécriture devant l'application), pas dans le code.
- **Sur la copie importée** : `PARITE_URLS_LISTE=<baseline-2026-10.csv> bun run test:e2e tests/e2e/parite-urls.spec.ts` rejoue toutes les adresses du fichier privé de l'outil de mesure, profils compris, contre un banc où l'import a tourné ([`docs/migration/IMPORT.md`](../migration/IMPORT.md)). Aucune adresse de profil n'est écrite nulle part : un profil se lit « profil #n » dans le bilan et dans les messages. Les profils vides du spam, que l'import ne reprend pas, répondent 404 ; la liste ne les distingue pas des autres, les deux codes sont admis.
- **Le titre de l'onglet des talents** (ticket 108) : sur la copie importée seulement, chaque adresse `/talent/<slug>` qui répond 200 doit avoir un `<title>` de 50 à 60 caractères, différent de son h1 (`defautsDuTitreDeTalent`, `tests/outils/parite-urls.ts`). C'est le titre que la rédaction écrit dans le champ `titreDeLaPage` de l'administration ; tant qu'il est vide, l'onglet garde le titre court suivi du nom du site et le contrôle échoue. Sur le banc, les talents d'essai n'ont pas ce titre : le contrôle ne s'y applique pas.

## Des données pour les pages publiques

- Le cache de données de Next (`unstable_cache`, étiquettes `talents` et `profils`) est sur le disque, dans `.next/cache/fetch-cache`, et survit à un build : `bun run test:e2e` le vide avant de construire.
- Dans un lancement, une page lue avant que les données n'existent garde ce qu'elle a vu. Un essai qui charge des données avec son propre Payload demande à l'application de rafraîchir (`tests/outils/pages-publiques.ts` : `rafraichirLesPagesDesProfils`, `creerContenu`, `supprimerContenu` passent par l'API REST, donc par les crochets de l'application).
- Les essais de la recherche et de la parité chargent leurs propres profils, « Essai … » (`tests/fixtures/profils-de-recherche.ts`), sous un verrou entre les processus (`tests/outils/verrou.ts`), et non le jeu du banc : la fausse base de l'import (`tranche-profil-importe.spec.ts`) porte les mêmes noms inventés que le jeu, et refuse leurs adresses si le jeu est déjà là.
- L'essai de la fraîcheur (`fraicheur-pages.spec.ts`, ticket 117) prouve qu'une page vient du cache en changeant la base **derrière le dos de l'application** : un `payload.update` du processus de l'essai n'est pas une requête de Next, rien n'est rafraîchi, et la page doit encore montrer l'ancien texte ; un enregistrement par l'API REST la rafraîchit. Chaque essai pose son propre profil (« Essai Fraicheur… », tiré du profil type « actif mais pas publiable ») et le retire par l'application.
- L'essai des pages de la recherche (`recherche-mot-cle.spec.ts`, E41 et I29) a besoin de plus de 20 résultats, que le banc n'a pas : il crée 45 profils générés par la fabrique (`tests/outils/fabrique-profils.ts`, `fabriquerParLApplication`) **par l'API de l'application**, pour que chaque enregistrement rafraîchisse les pages comme pour une visiteuse, et les retire à la fin. Ils sont dans des communes loin d'Annecy et de Nantes et aucun ne se déplace : pour les autres recherches du banc, ils viennent en dernier, sous « Autres maquilleuses ». Chaque projet (1440 et 390 px) a son préfixe et son mot : ils ne se voient pas. La même fabrique sème, par l'API locale, les 500 profils de l'essai de charge I31 (`tests/integration/recherche.test.ts`).
- L'essai du frein (I30) envoie ses requêtes avec un `X-Forwarded-For` de la plage de documentation, tiré au hasard : une requête qui n'est pas passée par le proxy (sans l'en-tête, ou avec l'adresse de bouclage que Next y écrit) n'est jamais freinée, si bien que les essais qui partent tous de l'adresse du poste ne se gênent pas.
- L'application des essais ne demande pas la liste officielle des communes (geo.api.gouv.fr), qui répondait trop lentement ou pas du tout depuis la CI : elle demande la fausse liste du banc, par `COMMUNES_DU_BANC` ([`banc.md`](banc.md), « La fausse liste des communes »). Un essai qui choisit une commune la trouve là, aux deux tailles, sans Internet.
- L'optimiseur d'images de Next n'accepte que l'hôte des photos, en https. Pour que les photos du banc (le simulateur de stockage, en http sur `127.0.0.1`) se chargent, le build et le serveur des essais reçoivent `IMAGES_DU_BANC=http://127.0.0.1:<port>/<espace>` (`tests/outils/e2e.ts`) : `next.config.ts` ouvre alors cet espace-là et lui seul (`imagesDuBanc`, `src/lib/security-headers.ts`). La production ne règle jamais cette variable ; une valeur qui n'est pas exactement une adresse locale avec un port et un espace est refusée, et un test garde la configuration de production fermée aux adresses locales.

## Quand un essai échoue

| Quoi | Où |
|---|---|
| Trace (chaque action, le réseau, la page à chaque étape), vidéo et capture de l'essai en échec | `test-results/essais/<essai>/` : `trace.zip`, `video.webm`, `test-failed-1.png` |
| Le rapport complet, traces et vidéos comprises | `playwright-report/`, à ouvrir par `bunx playwright show-report playwright-report` |
| Les résultats, pour un outil | `test-results/resultats.json` |
| Ce que l'application a écrit | Dans la sortie du lancement, sur les lignes qui commencent par `[WebServer]` |

Une trace s'ouvre par `bunx playwright show-trace`, suivi du chemin de son `trace.zip`.

Les traces et les vidéos des essais réussis ne sont pas gardées. Les deux dossiers sont ignorés par git, et Playwright vide `test-results/essais/` au début de chaque lancement.

En CI, un essai en échec est rejoué deux fois, et un essai laissé en `.only` fait échouer le lancement.

## En CI

Le job `e2e` de `.github/workflows/ci.yml` lance les essais en quatre lots côte à côte, de `e2e (1/4)` à `e2e (4/4)`. Chaque lot fait ce qu'on fait sur un poste :

```sh
bunx playwright install --with-deps chromium   # le navigateur, et les bibliothèques du système qu'il demande
bun run banc:up
bun run test:e2e --shard=1/4                   # son quart des essais ; les autres lots lancent --shard=2/4 à 4/4
```

- Playwright partage les essais entre les lots ; chaque lot construit l'application lui-même, démarre son banc et ne dépend d'aucun autre. Un lot en échec n'arrête pas les autres.
- Dans un lot, deux processus de Playwright jouent les essais côte à côte, sur le même banc et la même application. Un essai ne compte donc jamais ce que toute la base ou tout le faux Umami contient : il lit ce qu'il a posé lui-même (son talent, ses profils « Essai … », les mesures de son propre navigateur, `agentDeLEssai` de `tests/outils/faux-umami.ts`), et ne vide jamais ce qui est partagé.
- Le nombre de lots est celui de `SHARDS` (`tests/outils/garde-fous-ci.ts`) : la garde refuse une matrice, un nom de job ou une commande qui en dirait un autre.
- GitHub règle `CI=true` : un essai en échec est rejoué deux fois, et un essai laissé en `.only` fait échouer le lancement.
- Un lot a 10 minutes au plus : au-delà, il est arrêté, et `ci-ok` est rouge.
- Après un échec, le lot envoie `playwright-report/` et `test-results/` : l'artefact `e2e-1` à `e2e-4` du passage, sur la page de la CI, gardé 14 jours. Le rapport s'ouvre par `bunx playwright show-report playwright-report`, une fois l'artefact décompressé.
- Pour le rejouer sur un poste, banc démarré : `CI=true bun run test:e2e --shard=1/4 --workers=2`.

## Ce qui empêche de viser la prod

- La garde des tests (`tests/outils/garde-environnement.ts`) refuse toute cible sur `my-makeup.fr` et ses sous-domaines, dans tout environnement. La préprod n'est admise qu'avec `APP_ENV=preprod`. Elle est appelée trois fois avant le premier essai : par `bun run test:e2e` avant tout build, au chargement de la configuration de Playwright, puis par la préparation globale. Un lancement vers la prod s'arrête avant le premier essai, avec un message qui nomme la variable en cause.
- Un essai n'ouvre que des chemins (garde-fou C07).
- `playwright.config.ts` ne règle rien lui-même : tous les réglages viennent de `tests/outils/e2e.ts`, que les garde-fous de `tests/ci/` lisent (C07 : pas de `.only` en CI, seuls les `*.spec.ts`, aucune adresse de la prod dans `baseURL`).
- Les sondes de `tests/sondes/` lisent le site en ligne, en GET seulement ([`sondes.md`](sondes.md)). Elles ne passent ni par Playwright ni par cette garde, qu'elles n'assouplissent pas : elles ont leur propre garde et leur propre variable, `SONDES_CIBLE`.

## Lancer Playwright sans la commande

`bunx playwright test --list` liste les essais sans rien lancer. Sans l'environnement du banc, Playwright ne démarre aucune application : la préparation globale dit alors de passer par `bun run test:e2e`. Vers la préprod (`APP_ENV=preprod` et `BASE_URL`), il ne démarre rien non plus ; les essais qui demandent un compte de la fabrique n'y tournent pas, puisqu'elle n'écrit que dans la base du banc.

## Pièges

- **`localhost` n'est pas `127.0.0.1`.** Le cookie de session vaut pour l'adresse exacte de l'application, `http://localhost:<port>` : un essai qui ouvrirait `127.0.0.1` y serait déconnecté.
- **`.next/` contient ensuite le build des essais**, construit sans l'adresse du site. Avant un `bun run start` à toi, relance `bun run build`.
- **Le Payload des essais régénère `src/payload-types.ts`** quand une collection a changé, comme dans les tests d'intégration. Un fichier modifié après un lancement veut dire que `bun run payload:types` n'a pas été lancé.
- **L'administration charge un avatar depuis gravatar.com**, avec l'empreinte d'une adresse fictive. Sur l'accueil et l'administration, c'est la seule adresse hors du poste que le navigateur contacte (relevé du 14/10/2026). Les tickets de l'administration la retirent.
