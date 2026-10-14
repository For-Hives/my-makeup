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
- **L'administration est écrite par Payload**, en anglais pour l'instant : on y trouve un élément par son adresse (`a[href="/admin/account"]`) ou par une donnée du compte, pas par un libellé.
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

Le job `e2e` de `.github/workflows/ci.yml` lance les essais en deux lots côte à côte, `e2e (1/2)` et `e2e (2/2)`. Chaque lot fait ce qu'on fait sur un poste :

```sh
bunx playwright install --with-deps chromium   # le navigateur, et les bibliothèques du système qu'il demande
bun run banc:up
bun run test:e2e --shard=1/2                   # sa moitié des essais ; l'autre lot lance --shard=2/2
```

- Playwright partage les essais entre les deux lots ; chaque lot construit l'application lui-même, démarre son banc et ne dépend pas de l'autre. Un lot en échec n'arrête pas l'autre.
- GitHub règle `CI=true` : un essai en échec est rejoué deux fois, et un essai laissé en `.only` fait échouer le lancement.
- Un lot a 10 minutes au plus : au-delà, il est arrêté, et `ci-ok` est rouge. Sur un poste, un lot de 4 essais prend environ 13 secondes, build en cache compris (mesuré le 14/10/2026).
- Après un échec, le lot envoie `playwright-report/` et `test-results/` : l'artefact `e2e-1` ou `e2e-2` du passage, sur la page de la CI, gardé 14 jours. Le rapport s'ouvre par `bunx playwright show-report playwright-report`, une fois l'artefact décompressé.
- Pour le rejouer sur un poste, banc démarré : `CI=true bun run test:e2e --shard=1/2`.

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
