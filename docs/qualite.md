# Qualité : ce qui empêche une modification cassée d'entrer dans `v3`

Ce document décrit la CI de la v3, le check `ci-ok` et les garde-fous qui empêchent de rendre la CI menteuse. Le fichier de la CI est `.github/workflows/ci.yml`. Les garde-fous sont dans `tests/ci/garde-fous-ci.test.ts`.

## Les deux checks requis

La protection de la branche `v3` exige deux checks. Leur liste est dans `ci/checks-requis.json`.

| Check | D'où il vient | Ce qu'il dit |
|---|---|---|
| `ci-ok` | Le dernier job de `.github/workflows/ci.yml` | Qualité, tests unitaires et image Docker ont tous réussi |
| `CodeQL` | L'analyse de code de GitHub, en configuration par défaut | Aucune nouvelle alerte de sécurité dans le code |

La protection elle-même se règle dans GitHub, pas dans ce dépôt.

### Ce qui dépend de la protection de `v3`

- Tant que `v3` n'est pas protégée, `ci-ok` tourne et s'affiche, mais n'empêche aucune fusion.
- Tant que `v3` n'est pas protégée, CodeQL n'analyse pas les pull requests vers `v3`. Sa configuration par défaut n'analyse que les pull requests vers la branche par défaut (`main`) ou vers une branche protégée. Le check `CodeQL` apparaît donc sur une pull request vers `v3` à partir du jour où la branche est protégée.
- Aucun workflow de ce dépôt ne peut lancer CodeQL à la place : GitHub refuse une analyse écrite dans un workflow tant que la configuration par défaut est active.

Relevé du 14/10/2026, en lecture seule : la configuration par défaut de CodeQL est active sur le dépôt, pour les langages `actions` et `javascript-typescript` ; le check s'appelle bien `CodeQL` sur les pull requests vers `main` ; `v3` n'est pas encore protégée et n'a encore aucune analyse.

Pour le vérifier une fois `v3` protégée, sur le dernier commit d'une pull request vers `v3` :

```sh
gh api repos/For-Hives/my-makeup/branches/v3/protection --jq '{checks: .required_status_checks.contexts, admins: .enforce_admins.enabled}'
gh api repos/For-Hives/my-makeup/commits/COMMIT/check-runs --jq '.check_runs[] | [.name, .app.slug, .conclusion] | @tsv'
```

La seconde commande doit montrer une ligne `ci-ok` de `github-actions` et une ligne `CodeQL` de `github-advanced-security`.

## Ce que lance la CI

La CI se lance à chaque pull request et à chaque poussée sur `v3`. Trois jobs tournent en parallèle, puis `ci-ok` rend le verdict.

| Job | Ce qu'il lance | Limite |
|---|---|---|
| `qualite` | Les fichiers générés par Payload sont à jour ; `bun run typecheck` ; `bun run ci:biome` ; `bun run test:ci-garde` | 10 min |
| `unit` | `bun run test:unit` | 10 min |
| `build` | `bun run image:build`, sans secret ni base, puis `bun run image:controle` | 12 min |
| `ci-ok` | Rouge si l'un des trois a échoué, a été annulé ou a été sauté | 2 min |

- Dans `qualite`, les quatre contrôles sont tous joués, même quand l'un échoue : une seule poussée montre toutes les fautes.
- La plus longue chaîne, `build` puis `ci-ok`, est limitée à 14 minutes. Une CI verte dure donc moins de 15 minutes, hors attente d'une machine.
- La CI ne lit aucun secret. Les deux variables que réclame le CLI de Payload reçoivent des valeurs de remplissage, écrites en clair dans le fichier.

### Pourquoi `ci-ok`

GitHub compte un job requis « sauté » comme réussi. Un job qui en attend un autre est sauté quand cet autre échoue. Exiger chaque job un par un laisserait donc passer des fusions. `ci-ok` tourne toujours (`if: always()`), attend tous les autres jobs, et échoue dès que l'un d'eux n'a pas le résultat `success`.

Son script est testé tel quel : le test le lit dans `ci.yml` et le lance avec chaque résultat possible.

## Les garde-fous

Chaque garde-fou est joué deux fois : sur les fichiers du dépôt, où il ne doit rien trouver, et sur un exemple fautif fabriqué à partir de ces mêmes fichiers, où il doit trouver la faute. Lancer : `bun run test:ci-garde`.

| Garde | Ce qu'elle refuse | État |
|---|---|---|
| C01 | `continue-on-error`, et toute commande qui avale son échec (`\|\| true`, `set +e`) | En place |
| C02 | Une étape qui dépend de `cache-hit` ; un cache d'autre chose que `.next/cache` | En place |
| C03 | Un check de `ci/checks-requis.json` absent ou renommé ; un job nommé `CodeQL` ; une analyse CodeQL écrite dans un workflow | En place |
| C04 | Des versions de Node ou de bun qui diffèrent entre `.nvmrc`, `engines`, `packageManager`, le `Dockerfile` et les workflows ; une image sans digest | En place |
| C05 | Un test en `.only` ; un test sauté sans son ticket (`// issue #N` sur la ligne ou la ligne du dessus) | En place |
| C06 | Une attente fixe dans les essais de bout en bout | Arrive avec les essais de bout en bout |
| C07 | Une configuration Playwright qui peut viser la prod | Arrive avec les essais de bout en bout |
| C08 | Un fichier JavaScript écrit à la main (seul `importMap.js`, généré par Payload, est admis) | En place |

Le même fichier garde aussi :

- les déclencheurs de la CI : aucun filtre de chemins, aucun filtre sur les pull requests, `v3` dans les poussées, jamais `pull_request_target` ;
- les actions : chacune figée par un commit complet, avec sa version en commentaire ;
- les secrets : aucun n'est lu ;
- les permissions : lecture du dépôt, rien de plus ;
- `ci-ok` : il tourne toujours, attend tous les jobs, et aucun job ni aucune étape ne peut être sauté par une condition ;
- les durées : chaque job a sa limite, et la plus longue chaîne reste sous 15 minutes ;
- l'image Docker : variables publiques seulement, utilisateur sans droits, contrôle de santé, contexte de build en liste blanche (voir le README, « Image Docker »).

## Modifier la CI

- **Ajouter un job** : lui donner un `name`, un `timeout-minutes`, et l'ajouter au `needs` de `ci-ok`. La garde échoue si `ci-ok` ne l'attend pas.
- **Ajouter une action** : la figer par son commit complet, avec sa version en commentaire sur la même ligne (`# v1.2.3`). Choisir une version d'au moins 7 jours, sans avis de sécurité ouvert.
- **Lire un secret** : jamais dans `ci.yml`. Dans un autre workflow, ajouter son nom à la liste admise du test, dans le même commit.
- **Mettre en cache** : seulement `.next/cache`. Aucune étape ne dépend du cache.
- **Écrire un fichier JavaScript** : non. Si un outil en génère un, l'ajouter à la liste de la garde C08.

Les actions utilisées, vérifiées le 14/10/2026 (date de publication, base d'avis de GitHub et avis du dépôt de chaque action : aucun avis ouvert) :

| Action | Version | Publiée le |
|---|---|---|
| `actions/checkout` | v6.1.0 | 20/07/2026 |
| `actions/setup-node` | v6.5.0 | 14/07/2026 |
| `oven-sh/setup-bun` | v2.2.0 | 14/03/2026 |

## Canari : la preuve que `ci-ok` peut échouer

Un check requis qui ne peut pas échouer ne protège rien. Le canari est une pull request cassée exprès : un test faux, une erreur de type et une erreur Biome. GitHub doit refuser de la fusionner, même à un administrateur. Il se joue une fois dès que `v3` est protégée, puis une fois par trimestre.

`bun run ci:canari` écrit les trois fichiers fautifs. Il refuse d'écrire ailleurs que sur une branche dont le nom commence par `canari-`. Il n'écrit que ces fichiers : il ne commite rien et ne pousse rien.

| Fichier | Faute | Ce qui doit passer au rouge |
|---|---|---|
| `tests/unit/canari.test.ts` | Un test faux | Job `unit` |
| `tests/ci/canari-types.ts` | Une erreur de type | Job `qualite`, étape « Types » |
| `tests/ci/canari-biome.ts` | Une variable jamais lue | Job `qualite`, étape « Biome » |

Les trois fichiers sont sous `tests/`, hors de l'image Docker : le job `build` reste vert, et chaque rouge désigne un seul outil.

### Le jouer

Il faut que `v3` soit protégée : `ci-ok` et `CodeQL` requis, administrateurs soumis à la règle.

```sh
git fetch origin
git switch -c canari-2026-10 origin/v3
bun run ci:canari
git add tests/unit/canari.test.ts tests/ci/canari-types.ts tests/ci/canari-biome.ts
git commit -m "test(v3): canary, three faults on purpose, never merge"
git push -u origin canari-2026-10
gh pr create --base v3 --title "Canari : ne pas fusionner" --body "Trois fautes posées exprès (docs/qualite.md, « Canari »). À fermer sans fusion."
```

Une fois la CI terminée :

```sh
gh pr checks NUMERO
gh pr view NUMERO --json mergeStateStatus --jq .mergeStateStatus
gh api repos/For-Hives/my-makeup/branches/v3/protection --jq .enforce_admins.enabled
```

| Ce qu'on lit | Attendu |
|---|---|
| `qualite` | Rouge : « Types » et « Biome » en échec, les autres étapes vertes |
| `unit` | Rouge : un test en échec |
| `build` | Vert |
| `ci-ok` | Rouge |
| `mergeStateStatus` | `BLOCKED` |
| `enforce_admins.enabled` | `true` : la fusion est bloquée pour un administrateur aussi |

Ne pas essayer le bouton de fusion « pour voir » : si la protection était mal réglée, le canari entrerait dans `v3`. Les deux dernières lignes du tableau suffisent.

Puis fermer sans fusionner, et noter le résultat dans le tableau ci-dessous :

```sh
gh pr close NUMERO --delete-branch
```

### Résultats

| Date | Pull request | `qualite` | `unit` | `build` | `ci-ok` | Fusion |
|---|---|---|---|---|---|---|
| À jouer dès que `v3` est protégée | | | | | | |

### Répétition locale du 14/10/2026

Ce n'est pas le canari : rien n'a été poussé, aucune pull request n'a été ouverte. Sur une copie de travail, les trois fichiers fautifs ont été écrits, chaque commande a été lancée une fois, puis les fichiers ont été retirés.

| Commande | Résultat |
|---|---|
| `bun --no-env-file test tests/unit/canari.test.ts` | 1 test en échec, code de sortie 1 |
| `bun run ci:biome` | `noUnusedVariables` sur `tests/ci/canari-biome.ts`, et rien d'autre ; code de sortie 1 |
| `bun run typecheck` | `TS2322` sur `tests/ci/canari-types.ts`, et rien d'autre ; code de sortie 2 |
| Le script de `ci-ok`, avec un job en `failure` | Code de sortie 1 (test de `tests/ci/garde-fous-ci.test.ts`) |

Le kit ne peut pas pourrir en silence : `tests/ci/canari.test.ts` rejoue les trois fautes à chaque CI, dans un dossier temporaire, et échoue si l'une d'elles n'est plus une faute.
