# Qualité

Ce document garde les règles de qualité de la v3. Il a quatre parties :

- **Les règles du travail, §1 à §5** : comment on teste, les sept règles des listes éditées en place, et ce qu'un écran doit tenir à 390 px. Ce sont des critères permanents : ils valent pour chaque ticket, sans être recopiés dans chacun.
- **La CI, §6 à §10** : ce qui empêche une modification cassée d'entrer dans `v3`. Ces parties décrivent la CI de la v3, le check `ci-ok`, les garde-fous qui empêchent de rendre la CI menteuse, et le canari. Le fichier de la CI est `.github/workflows/ci.yml`. Les garde-fous sont dans `tests/ci/garde-fous-ci.test.ts`.
- **Les mises à jour, §11** : les règles que Renovate suivra pour proposer les nouvelles versions, et pourquoi elles n'ont aucun effet avant la bascule. Le fichier est `renovate.json`. Sa garde est dans `tests/ci/renovate.test.ts`.
- **La dérive de schéma, §12** : le contrôle qui dit si les collections du code et la dernière migration décrivent le même schéma. Il est prêt, et devient un contrôle bloquant de la CI à la clôture de P3.

À lire avec ce document :

- Quand un travail est fini, et à quel rythme lancer les tests : [`AGENTS.md`](../AGENTS.md).
- Commandes, architecture, interdits et pièges : [`CLAUDE.md`](../CLAUDE.md).

Un test garde ce document et les deux guides : `bun --no-env-file test tests/unit/guides-agents.test.ts`. Il échoue si une commande citée n'existe pas, si un lien ne mène nulle part, ou si l'une des sept règles de liste disparaît.

## 1. Pourquoi les suites entières ne tournent qu'une fois

La règle est dans [`AGENTS.md`](../AGENTS.md) : tests ciblés pendant le travail, suites entières une fois à la fin, puis en CI.

Elle vient d'une mesure faite sur le site en ligne le 13/10/2026. Cinq petits correctifs avaient demandé environ 50 lancements de tests en 2 h 46, soit près de 3 000 tests joués pour 30 tests ajoutés : chaque preuve était rejouée par l'auteur, par chaque relecteur et par le correcteur. Le chantier suivant, deux correctifs menés avec la règle actuelle, a pris 34 minutes et 5 lancements.

Le nombre de lancements pèse plus que la durée de chacun. Une suite entière rejouée « pour être sûr » ne trouve rien de plus que la précédente.

## 2. Règles des tests

1. **Un défaut corrigé a son test, vu rouge avant le correctif.** Une seule preuve suffit : le test échoue sur l'ancien code et passe sur le nouveau.
2. **Une garde est prouvée rouge.** Un test qui garde un document, une configuration ou une règle porte son exemple fautif : on lit dans le même fichier ce qu'il refuse.
3. **Une saisie se teste comme elle se fait : caractère par caractère.** Un test qui remplit un champ d'un coup ne voit pas un focus perdu en cours de frappe (règle L2 ci-dessous).
4. **On attend un état, jamais une durée.** `fenetre.attendre` dans un test de composant, les attentes de Playwright dans un essai de bout en bout.
5. **Aucun test oublié en `.only` ou en `.skip`.** Biome les refuse dans `tests/`.
6. **Le code reçoit ses dépendances.** L'envoi d'un email, le stockage et l'horloge sont passés en paramètre, et le test en donne de faux. Aucun module n'est remplacé à la volée (`mock.module`). Un appel HTTP sortant se simule avec MSW, et un appel que rien ne simule fait échouer le test : [`docs/tests/http-sortant.md`](tests/http-sortant.md).
7. **Une seule règle par sujet, testée en unitaire.** La complétude d'un profil, le slug, la zone, le prix et les URL gelées ont chacun leur fichier dans `src/lib/`. Le reste du code les appelle et ne refait pas le calcul.
8. **Aucune donnée réelle, aucun service réel.** Les fixtures sont fictives : noms inventés, adresses en `@example.test`, téléphones de la plage réservée à la fiction. La garde d'environnement arrête tout lancement qui pourrait toucher autre chose que le banc local ([`README.md`](../README.md), « La garde d'environnement »).
9. **Chaque événement de mesure est testé.** Un événement émis deux fois, ou jamais, fausse les chiffres de la semaine : son test prouve qu'il part une fois.

Tester un composant React sans navigateur : [`docs/tests/composants.md`](tests/composants.md).

## 3. Listes éditées en place : sept règles

Une liste éditée en place est une liste que la maquilleuse modifie ligne par ligne dans son espace : les puces (langues, compétences), les lignes avec un formulaire (expériences, formations, prestations et leurs options), les photos du portfolio.

Ces sept règles viennent des défauts trouvés puis corrigés sur le site en ligne en octobre 2026 (les numéros de PR sont ceux de ce dépôt). Elles valent pour toute liste de la v3. Un ticket qui pose ou change une liste les rejoue toutes, avec un test par règle, dont le titre reprend le numéro (L1 à L7).

1. **L1. Un identifiant par ligne.** Chaque ligne reçoit à sa création un identifiant qui lui est propre et qui ne change plus. Il ne vient jamais de son contenu.
   - Test : deux lignes de même contenu ; retirer ou modifier l'une laisse l'autre intacte.
   - Origine : deux lignes identiques partageaient leur identifiant, « Retirer » supprimait les deux et « Modifier » écrasait les deux (corrigé le 13/10/2026, PR #966 et #968).
2. **L2. La frappe garde le focus.** Saisir dans un champ d'une ligne ne déplace jamais le focus, y compris juste après un enregistrement. La clé d'affichage d'une ligne ne dépend pas de ce qu'on y saisit.
   - Test : juste après un enregistrement, saisir 20 caractères un par un dans chaque champ ; le champ garde le focus et reçoit les 20 caractères.
   - Origine : après un enregistrement, les champs d'une option perdaient le focus à chaque caractère, et aucun test ne le voyait (en ligne du 10/10 au 13/10/2026, corrigé par la PR #964).
3. **L3. Retirer la ligne en cours de modification ne perd rien.** Le formulaire repasse en « Ajouter » et garde ce qui était saisi.
   - Test : ouvrir une ligne par « Modifier », changer un champ, retirer cette ligne ; le formulaire est en ajout et le champ a gardé sa valeur.
   - Origine : la modification en cours était perdue (corrigé le 13/10/2026, PR #966 et #968).
4. **L4. Après un retrait, le focus reste dans le panneau.** Il va sur la ligne qui prend la place de la ligne retirée, ou sur celle du dessus. Quand la liste devient vide, il va sur le formulaire d'ajout. Une exception : après un clic ou un tap, il ne va jamais sur un champ de saisie, qui ouvrirait le clavier du téléphone ; il va alors sur le titre du panneau.
   - Test : après chaque retrait, au clavier puis au clic, l'élément qui a le focus est dans le panneau ; un cas pour la dernière ligne, un cas pour la seule ligne.
   - Origine : le focus tombait hors du panneau, à une tabulation de « Sauvegarder » (corrigé le 13/10/2026, PR #964, #968 et #972).
5. **L5. Chaque retrait est annoncé.** Une zone `role="status"`, présente et vide dès l'ouverture du panneau, reçoit une phrase qui nomme ce qui part. Deux retraits de même nom sont annoncés deux fois.
   - Test : la zone existe avant le premier retrait ; après un retrait, elle nomme la ligne retirée ; après le retrait d'une seconde ligne de même nom, l'annonce est renouvelée.
   - Origine : un retrait n'était pas dit aux lecteurs d'écran (corrigé le 13/10/2026, PR #969).
6. **L6. Un doublon est refusé, et le refus est dit.** Une ligne identique à une ligne de la liste n'est pas ajoutée, et un message visible le dit près du formulaire. Une ligne ouverte par « Modifier » et validée sans changement est acceptée.
   - Test : ajouter deux fois la même ligne ; la liste garde une ligne et le message s'affiche. Valider une ligne sans la changer ; aucun message, le formulaire repasse en ajout.
   - Origine : le bouton ne faisait rien, sans un mot (corrigé le 13/10/2026, PR #969 et #970).
7. **L7. Entrée maintenue n'agit qu'une fois.** Sur un bouton, la touche Entrée tenue enfoncée donne un seul ajout, un seul retrait, un seul enregistrement. Dans un champ de texte long, elle garde son effet : des retours à la ligne.
   - Test : envoyer au bouton un appui sur Entrée, puis ses répétitions (`repeat: true`) ; une seule action a eu lieu.
   - Origine : Entrée maintenue retirait les lignes l'une après l'autre, puis validait le formulaire (corrigé le 13/10/2026, PR #969).

Ce que ces tests ne prouvent pas : le rendu d'un vrai lecteur d'écran et le clavier d'un vrai téléphone. Les deux se vérifient à la main, à la recette.

## 4. Un écran se regarde à 390 px

390 px est la largeur de téléphone de référence de la v3. Tout changement d'un écran se termine par une capture à cette largeur, regardée avant de dire « fini » :

```sh
bunx playwright screenshot --viewport-size=390,844 --full-page http://127.0.0.1:3000/ /tmp/capture-390.png
```

L'adresse est celle de la page changée, sur le serveur local (`bun run dev`). La capture s'écrit hors du dépôt. Elle demande le navigateur de Playwright, installé une fois par poste avec `bunx playwright install chromium` ([`docs/tests/e2e.md`](tests/e2e.md)).

Ce qu'on y cherche :

- aucun débordement horizontal, aucun texte coupé ;
- un seul titre principal ;
- l'action principale de la page visible et atteignable au doigt ;
- ni « undefined », ni « null », ni image cassée.

## 5. Biome et TypeScript

La configuration de Biome est celle du dépôt de référence, PortefolioAndy. Elle monte de version en même temps dans les deux dépôts. Les écarts sont voulus :

| Sujet | Dépôt de référence | Ici | Pourquoi |
|---|---|---|---|
| Fichiers vus par Biome | Les sources et les « stories » | Les sources, `tests/` et `scripts/` | Pas de « stories » ici ; les tests sont tenus aux mêmes règles, et un `.only` ou un `.skip` oublié est une erreur |
| Node | 25 | 24 (`.nvmrc`) | Version maintenue jusqu'au 30/04/2028 |
| Essais de bout en bout | `*.spec.js` | `*.spec.ts` | TypeScript partout |
| `tsconfig.json` | `strict` | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch` | Code neuf : aucun coût de reprise |

Une règle que la configuration ne dit pas : `dangerouslySetInnerHTML` n'est accepté que pour du markdown converti et assaini côté serveur, et pour des données structurées sérialisées par le code. Jamais pour un texte saisi tel quel.

## 6. Les deux checks requis

La protection de la branche `v3` exige deux checks. Leur liste est dans `ci/checks-requis.json`.

| Check | D'où il vient | Ce qu'il dit |
|---|---|---|
| `ci-ok` | Le dernier job de `.github/workflows/ci.yml` | Qualité, tests unitaires, image Docker, tests d'intégration et essais de bout en bout ont tous réussi |
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

### Ce qui reste à constater sur GitHub

Au 14/10/2026, tout ce document a été vérifié sur un poste de développement : les garde-fous, le script de `ci-ok`, la construction et le contrôle de l'image. La CI a tourné une première fois sur GitHub le même jour, à la poussée de `v3` qui apportait `ci.yml` : les deux premières lignes ci-dessous sont constatées. `v3` n'est pas protégée : les deux suivantes restent à constater, puis à dater ici. Les trois dernières viennent avec les jobs `integration` et `e2e` (ticket 014) : les deux premières sont constatées à la première poussée de `v3` qui les portait, la dernière attend une pull request qui porte la faute.

| À constater | Quand | Comment | Constaté le |
|---|---|---|---|
| La CI tourne : `qualite`, `unit`, `build` verts, puis `ci-ok` vert | À la première poussée de `v3` qui contient `ci.yml` | `gh run list --repo For-Hives/my-makeup --branch v3 --limit 5`, puis `gh run view NUMERO` | 14/10/2026 : CI 38501556779, sur le commit `2fe3629`, les quatre jobs verts |
| Une CI verte dure moins de 15 minutes | Au même passage | La commande de « Durée de la CI » | 14/10/2026 : 1 min 35 s |
| CodeQL analyse chaque pull request vers `v3`, sous le nom `CodeQL` | Dès que `v3` est protégée | Les deux commandes ci-dessus | Pas encore |
| `ci-ok` rouge sur une pull request cassée, fusion bloquée pour un administrateur aussi | Dès que `v3` est protégée | « Canari », plus bas | Pas encore |
| La CI à cinq jobs tourne : `integration` et les deux lots `e2e` verts, puis `ci-ok` vert | À la première poussée de `v3` qui contient ces deux jobs | `gh run view NUMERO`, puis la seconde commande de « Durée de la CI » | 14/10/2026 : CI 38512540493, sur le commit `1016d81`, les sept jobs verts (46 tests d'intégration, 4 essais par lot `e2e`) |
| Une CI verte dure moins de 15 minutes, et chaque lot `e2e` moins de 10 | Au même passage | Les deux commandes de « Durée de la CI » | 14/10/2026 : 1 min 52 s ; chaque lot `e2e` 1 min 44 s |
| Un essai de bout en bout faux exprès rend `e2e`, puis `ci-ok`, rouges | Au canari, ou sur toute pull request qui porte la faute `tests/e2e/canari.spec.ts` | « Canari », plus bas : la ligne `e2e` | Oui, le 14/10/2026 : pull request #975, fermée sans fusion, CI 38513184222 ; `e2e (1/2)` rouge sur cet essai (3 tentatives), `e2e (2/2)` vert, puis `ci-ok` rouge, « Un job n'a pas réussi (failure) » |

Au premier passage, le job `build` a été vert sur le Docker de GitHub. Avant lui, ces trois points n'avaient tourné que derrière Podman : s'il passe au rouge sans que l'image ait changé, les regarder d'abord.

- `scripts/image/controle.ts`, `startApplication` : le contrôle lance le conteneur avec `--health-interval=2s` en gardant la commande de santé de l'image. Docker l'accepte, Podman le refuse : seul le repli (le rythme de l'image, 30 secondes) a été joué.
- Le même fichier, `UNHEALTHY_ANSWER_MAX_MS` : base arrêtée, le premier 503 doit arriver en moins de 3 secondes. La route abandonne la base au bout de 2 secondes ; le relevé local est de 1,7 à 1,8 seconde.
- `bun run image:build` : un « docker build » avec BuildKit, sur la machine de GitHub.

## 7. Ce que lance la CI

La CI se lance à chaque pull request et à chaque poussée sur `v3`. Cinq jobs tournent en parallèle, puis `ci-ok` rend le verdict.

| Job | Ce qu'il lance | Limite |
|---|---|---|
| `qualite` | Les fichiers générés par Payload sont à jour ; aucune dérive de schéma (`bun run schema:derive`) ; `bun run typecheck` ; `bun run ci:biome` ; `bun run test:ci-garde` | 10 min |
| `unit` | `bun run test:unit` | 10 min |
| `build` | `bun run image:build`, sans secret ni base, puis `bun run image:controle` | 12 min |
| `integration` | `bun run banc:up`, puis `bun run test:integration` : les tests d'intégration sur le banc de test ([`docs/tests/banc.md`](tests/banc.md)) | 10 min |
| `e2e` | En deux lots côte à côte, `e2e (1/2)` et `e2e (2/2)`. Chacun installe le Chromium de Playwright, lance `bun run banc:up`, puis `bun run test:e2e` sur sa moitié des essais ([`docs/tests/e2e.md`](tests/e2e.md)) | 10 min par lot |
| `ci-ok` | Rouge si l'un des cinq a échoué, a été annulé ou a été sauté | 2 min |

- Dans `qualite`, les cinq contrôles sont tous joués, même quand l'un échoue : une seule poussée montre toutes les fautes.
- Un lot `e2e` en échec n'arrête pas l'autre (`fail-fast: false`). Pour `ci-ok`, les deux lots ne font qu'un job : il est en échec dès qu'un lot l'est, annulé dès qu'un lot atteint sa limite.
- Un lot `e2e` en échec envoie son rapport, ses traces, ses vidéos et ses captures : l'artefact `e2e-1` ou `e2e-2` du passage, gardé 14 jours.
- Les tests d'intégration et les essais de bout en bout tournent sur le même banc de test que sur un poste, avec les mêmes commandes : chaque job démarre le sien.
- La plus longue chaîne, `build` puis `ci-ok`, est limitée à 14 minutes : voir « Durée de la CI ».
- Chaque commande tourne sous `bash -eo pipefail` (`defaults: run: shell: bash`) : une commande qui échoue arrête son étape, même au milieu d'un tube.
- La CI ne lit aucun secret. Les deux variables que réclame le CLI de Payload reçoivent des valeurs de remplissage, écrites en clair dans le fichier.

### Durée de la CI

Deux choses à ne pas confondre :

- **La limite d'un job** (`timeout-minutes`) est un coupe-circuit : elle arrête un job bloqué. Ce n'est pas sa durée normale.
- **Les 15 minutes** sont la durée qu'une CI verte ne doit pas atteindre.

Aujourd'hui les cinq jobs tournent côte à côte. La plus longue chaîne est `build` (12 minutes) puis `ci-ok` (2 minutes) : 14 minutes de limites. La garde vérifie que cette somme reste sous 15 : aucune CI ne peut durer 15 minutes, hors attente d'une machine.

Les essais de bout en bout n'attendent pas `build`, contrairement au plan qui leur faisait reprendre le build de ce job : chaque lot construit l'application lui-même, comme `bun run test:e2e` sur un poste (16 secondes à froid, mesuré sur un poste au ticket 013). La limite d'un lot, 10 minutes, est aussi la borne du critère « bout en bout en moins de 10 minutes » : un lot vert a duré moins que sa limite, et la garde refuse une limite plus haute.

Cette somme ne tiendra plus sous 15 le jour où un job s'enchaîne après un autre (`needs: [build]`, par exemple). Il faudrait des limites au ras des durées normales, et une machine lente rendrait la CI rouge sans raison. Ce jour-là :

1. Donner au nouveau job une limite de coupe-circuit : deux à trois fois sa durée normale.
2. Relever `CI_LIMIT_MINUTES`, dans `tests/ci/garde-fous-ci.test.ts`, à la somme des limites de la nouvelle chaîne. La garde borne alors les coupe-circuits, et non plus les 15 minutes.
3. Lire les 15 minutes sur la durée mesurée d'une CI verte, avec la première commande ci-dessous, et dater le relevé dans le tableau.

La durée de la dernière CI verte de `v3`, puis celle de chaque job d'une CI :

```sh
gh run list --repo For-Hives/my-makeup --branch v3 --status success --limit 20 \
  --json databaseId,workflowName,startedAt,updatedAt \
  --jq 'map(select(.workflowName == "CI"))[0] | "CI \(.databaseId) : \(((.updatedAt | fromdate) - (.startedAt | fromdate)) / 60 | floor) min \(((.updatedAt | fromdate) - (.startedAt | fromdate)) % 60) s"'
gh run view NUMERO --repo For-Hives/my-makeup --json jobs \
  --jq '.jobs[] | "\(.name) : \(.conclusion), \(((.completedAt | fromdate) - (.startedAt | fromdate)) / 60 | floor) min \(((.completedAt | fromdate) - (.startedAt | fromdate)) % 60) s"'
```

| Date | Où | Durée |
|---|---|---|
| 14/10/2026 | Poste de développement, Podman : ce n'est pas une CI | Image construite sans cache en 1 min 26 s ; contrôle de l'image en 2 min 11 s, au rythme de Podman ; tests unitaires, garde-fous, types et Biome en moins de 10 secondes à eux quatre |
| 14/10/2026 | GitHub, CI 38501556779, commit `2fe3629` | 1 min 35 s en tout : `qualite` 21 s, `unit` 19 s, `build` 1 min 28 s, `ci-ok` 2 s |
| 14/10/2026 | Poste de développement, Podman, les commandes des jobs `integration` et `e2e` jouées une à une : ce n'est pas une CI | Banc prêt en 4,2 s, images déjà téléchargées ; tests d'intégration : 37 verts en 7,2 s ; chaque lot `e2e` avec `CI=true` : 4 essais verts, build compris, en 13 s environ (build déjà en cache) |
| 14/10/2026 | GitHub, CI 38512540493, commit `1016d81`, la première à cinq jobs | 1 min 52 s en tout : `qualite` 31 s, `unit` 19 s, `build` 1 min 27 s, `integration` 55 s, `e2e (1/2)` 1 min 44 s, `e2e (2/2)` 1 min 44 s, `ci-ok` 3 s |

### Pourquoi `ci-ok`

GitHub compte un job requis « sauté » comme réussi. Un job qui en attend un autre est sauté quand cet autre échoue. Exiger chaque job un par un laisserait donc passer des fusions. `ci-ok` tourne toujours (`if: always()`), attend tous les autres jobs, et échoue dès que l'un d'eux n'a pas le résultat `success`.

Son script est testé tel quel : le test le lit dans `ci.yml` et le lance avec chaque résultat possible.

## 8. Les garde-fous

Chaque garde-fou est joué deux fois : sur les fichiers du dépôt, où il ne doit rien trouver, et sur un exemple fautif fabriqué à partir de ces mêmes fichiers, où il doit trouver la faute. Lancer : `bun run test:ci-garde`.

| Garde | Ce qu'elle refuse | État |
|---|---|---|
| C01 | `continue-on-error` ; un workflow sans `defaults: run: shell: bash`, donc sans `pipefail` ; un `shell` propre à une étape ou à un job ; les façons connues d'avaler un échec : `\|\|` suivi d'autre chose que `exit 1`, `set +e`, `set +o pipefail`, une commande `true`, `:` ou `exit 0` seule | En place |
| C02 | Une étape qui dépend de `cache-hit` ; un cache d'autre chose que `.next/cache` | En place |
| C03 | Un check de `ci/checks-requis.json` absent ou renommé ; un second job affiché sous le nom `ci-ok`, dans n'importe quel workflow ; un job nommé `CodeQL` ; une analyse CodeQL écrite dans un workflow | En place |
| C04 | Des versions de Node ou de bun qui diffèrent entre `.nvmrc`, `engines`, `packageManager`, le `Dockerfile` et les workflows ; une image sans digest | En place |
| C05 | Un test en `.only` ; un test sauté sans son ticket : `.skip`, `.fixme`, `.todo`, `.skipIf(true)`, `.if(false)`. Le ticket s'écrit `// issue #N`, sur une ligne de l'appel ou sur la ligne du dessus | En place |
| C06 | Une attente fixe dans `tests/e2e` : `waitForTimeout`, le minuteur `setTimeout` (nu ou de la page), sa forme en promesse (`timers/promises`). `test.setTimeout`, qui fixe la durée maximale d'un essai, n'en est pas une | En place |
| C07 | Une configuration Playwright qui peut viser la prod : `forbidOnly` faux en CI, des fichiers autres que `*.spec.ts`, une `baseURL` sur `my-makeup.fr` ou ses sous-domaines (la préprod exceptée) ; un réglage écrit dans `playwright.config.ts` au lieu de `tests/outils/e2e.ts` ; un essai qui ouvre une adresse complète au lieu d'un chemin. Playwright lancé vers la prod est joué pour de vrai : il s'arrête avant le premier essai | En place |
| C08 | Un fichier JavaScript écrit à la main (seul `importMap.js`, généré par Payload, est admis) | En place |

Le même fichier garde aussi :

- les déclencheurs de la CI : aucun filtre de chemins, aucun filtre sur les pull requests, `v3` dans les poussées, jamais `pull_request_target` ;
- les actions : chacune figée par un commit complet, avec sa version en commentaire ;
- les secrets : `ci.yml` n'en lit aucun, ni par son nom, ni en bloc (`toJSON(secrets)`, un nom calculé, `secrets: inherit`). Le jeton de la CI compte comme un secret, sous ses deux noms : `secrets.GITHUB_TOKEN` et `github.token`. Les autres workflows ne lisent que les secrets de la liste admise du test : aujourd'hui le jeton du passage, que `release.yml` reçoit pour pousser la publication ([`docs/publication.md`](publication.md)), et les deux secrets de l'accès protégé de la préprod, `PREPROD_BASIC_AUTH_USER` et `PREPROD_BASIC_AUTH_PASSWORD`, que lit `preprod.yml` ([`docs/preprod.md`](preprod.md)) ;
- les permissions : `ci.yml` lit le dépôt, rien de plus. Le workflow de publication donne l'écriture à son seul job ; `tests/ci/publication.test.ts` le garde, avec sa dépendance à `ci-ok` ;
- `ci-ok` : il tourne toujours et attend tous les jobs. Aucun job n'est sous condition. Une commande (`run`) ne porte que `always()` ou `!cancelled()`, qui la font tourner plus souvent, jamais moins. `failure()` est réservé aux actions (`uses`) qui envoient un rapport : sous cette condition, une commande serait sautée quand tout va bien, et le job resterait vert sans elle ;
- les durées : chaque job a sa limite, et la somme des limites de la plus longue chaîne reste sous 15 minutes (voir « Durée de la CI ») ;
- le banc de test en CI : les jobs `integration` et `e2e` existent ; chacun lance `bun run banc:up` avant ses tests, chaque commande seule dans son étape ; `e2e` tourne en deux lots (`matrix: shard: [1, 2]`, et rien d'autre), sans qu'un lot en échec annule l'autre (`fail-fast: false`), sous Node, avec le Chromium de Playwright, et sa limite ne dépasse pas 10 minutes ;
- l'image Docker : variables publiques seulement, quelle que soit la casse de leur nom, utilisateur sans droits, contrôle de santé, contexte de build en liste blanche (voir le README, « Image Docker »).

### Ce que les garde-fous ne voient pas

Un garde-fou lit un texte. Il arrête les fautes connues, pas toutes les ruses. Ce qui reste à la relecture :

- **Un script qui gère lui-même ses erreurs.** `if ! commande; then echo "tant pis"; fi`, ou `commande && autre` au milieu d'un script : le shell continue, et aucune garde ne peut le voir. La règle de `ci.yml` : une étape lance une commande, ou des commandes reliées par `&&` sur une seule ligne. Le seul script est celui de `ci-ok`, et il est testé tel quel.
- **Une action sous `failure()`.** La garde admet toute action sous cette condition, sans savoir ce qu'elle fait. Elle doit envoyer un rapport, jamais lancer un contrôle.
- **Le jeton que reçoivent les actions.** `actions/checkout`, `actions/setup-node` et `oven-sh/setup-bun` reçoivent le jeton de la CI par défaut, sans qu'il soit écrit dans `ci.yml`. Ce jeton ne peut que lire le dépôt (`permissions: contents: read`), et le checkout ne le garde pas (`persist-credentials: false`).
- **Les réglages de GitHub.** Les gardes lisent les fichiers du dépôt. La protection de la branche, les checks réellement exigés et la durée réelle d'une CI se lisent sur GitHub : voir « Ce qui reste à constater sur GitHub ».

## 9. Modifier la CI

- **Ajouter un job** : lui donner un `name`, un `timeout-minutes`, et l'ajouter au `needs` de `ci-ok`. La garde échoue si `ci-ok` ne l'attend pas. Si ce job en attend un autre (`needs`), lire d'abord « Durée de la CI ».
- **Écrire une commande** : une seule ligne par étape, sans `||` ni `exit 0`. Le script de `ci-ok` est la seule exception. Pour qu'une étape tourne même après un échec, lui donner `if: ${{ !cancelled() }}`.
- **Envoyer un rapport après un échec** (une trace, des captures) : une action (`uses`) sous `if: failure()`, jamais une commande.
- **Ajouter un workflow** : il déclare `defaults: run: shell: bash`, et aucun de ses jobs ne s'affiche sous le nom `ci-ok` ou `CodeQL`.
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
| `actions/upload-artifact` | v7.0.1 | 10/04/2026 |

`actions/upload-artifact` envoie le rapport d'un lot `e2e` en échec. La v7.0.2, publiée le 07/10/2026, n'avait pas 7 jours le 14/10/2026 : la règle donne la v7.0.1. Vérifié par `gh api repos/actions/upload-artifact/releases`, `gh api repos/actions/upload-artifact/security-advisories` et `gh api "/advisories?ecosystem=actions&affects=actions/upload-artifact"` (aucun avis), et le commit de l'étiquette par `gh api repos/actions/upload-artifact/git/ref/tags/v7.0.1`.

## 10. Canari : la preuve que `ci-ok` peut échouer

Un check requis qui ne peut pas échouer ne protège rien. Le canari est une pull request cassée exprès : un test faux, une erreur de type, une erreur Biome et un essai de bout en bout faux. GitHub doit refuser de la fusionner, même à un administrateur. Il se joue une fois dès que `v3` est protégée, puis une fois par trimestre.

`bun run ci:canari` écrit les quatre fichiers fautifs. Il refuse d'écrire ailleurs que sur une branche dont le nom commence par `canari-`. Il n'écrit que ces fichiers : il ne commite rien et ne pousse rien.

| Fichier | Faute | Ce qui doit passer au rouge |
|---|---|---|
| `tests/unit/canari.test.ts` | Un test faux | Job `unit` |
| `tests/ci/canari-types.ts` | Une erreur de type | Job `qualite`, étape « Types » |
| `tests/ci/canari-biome.ts` | Une variable jamais lue | Job `qualite`, étape « Biome » |
| `tests/e2e/canari.spec.ts` | Un essai de bout en bout faux | Job `e2e`, étape « End-to-end tests », dans le lot qui le reçoit |

Les quatre fichiers sont sous `tests/`, hors de l'image Docker : le job `build` reste vert, et chaque rouge désigne un seul outil. L'essai faux n'ouvre aucune page : il échoue de la même façon dans les deux lots, et se rejoue sans navigateur.

### Le jouer

Il faut que `v3` soit protégée : `ci-ok` et `CodeQL` requis, administrateurs soumis à la règle.

```sh
git fetch origin
git switch -c canari-2026-10 origin/v3
bun run ci:canari
git add tests/unit/canari.test.ts tests/ci/canari-types.ts tests/ci/canari-biome.ts tests/e2e/canari.spec.ts
git commit -m "test(v3): canary, four faults on purpose, never merge"
git push -u origin canari-2026-10
gh pr create --base v3 --title "Canari : ne pas fusionner" --body "Quatre fautes posées exprès (docs/qualite.md, « Canari »). À fermer sans fusion."
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
| `integration` | Vert |
| `e2e` | Rouge : un lot en échec, l'essai faux rejoué deux fois ; l'autre lot vert |
| `ci-ok` | Rouge |
| `mergeStateStatus` | `BLOCKED` |
| `enforce_admins.enabled` | `true` : la fusion est bloquée pour un administrateur aussi |

Ne pas essayer le bouton de fusion « pour voir » : si la protection était mal réglée, le canari entrerait dans `v3`. Les deux dernières lignes du tableau suffisent.

Puis fermer sans fusionner, et noter le résultat dans le tableau ci-dessous :

```sh
gh pr close NUMERO --delete-branch
```

### Résultats

| Date | Pull request | `qualite` | `unit` | `build` | `integration` | `e2e` | `ci-ok` | Fusion |
|---|---|---|---|---|---|---|---|---|
| À jouer dès que `v3` est protégée | | | | | | | | |

### Répétition locale du 14/10/2026

Ce n'est pas le canari : rien n'a été poussé, aucune pull request n'a été ouverte. Sur une copie de travail, les trois premiers fichiers fautifs ont été écrits, chaque commande a été lancée une fois, puis les fichiers ont été retirés. Le quatrième, l'essai de bout en bout faux, a été répété de la même façon le même jour, avec le ticket 014, sur un banc à part : les deux dernières lignes.

| Commande | Résultat |
|---|---|
| `bun --no-env-file test`, sur le fichier fautif `tests/unit/canari.test.ts` | 1 test en échec, code de sortie 1 |
| `bun run ci:biome` | `noUnusedVariables` sur `tests/ci/canari-biome.ts`, et rien d'autre ; code de sortie 1 |
| `bun run typecheck` | `TS2322` sur `tests/ci/canari-types.ts`, et rien d'autre ; code de sortie 2 |
| Le script de `ci-ok`, avec un job en `failure` | Code de sortie 1 (test de `tests/ci/garde-fous-ci.test.ts`) |
| `CI=true bun run test:e2e --shard=1/2`, puis `--shard=2/2`, l'essai faux `tests/e2e/canari.spec.ts` posé, banc démarré | Lot 1 : l'essai faux en échec, puis rejoué deux fois, code de sortie 1. Lot 2 : 4 essais verts, code de sortie 0. Le job `e2e` aurait donc le résultat `failure` |
| Le script de `ci-ok`, avec `success` pour les quatre premiers jobs et `failure` pour `e2e` | Code de sortie 1, « Un job n'a pas réussi (failure) : ci-ok est rouge. » |

Le kit ne peut pas pourrir en silence : `tests/ci/canari.test.ts` rejoue les quatre fautes à chaque CI, dans un dossier temporaire, et échoue si l'une d'elles n'est plus une faute. L'essai faux y est lancé par Playwright lui-même, sans navigateur ni banc.

## 11. Renovate : les mises à jour des dépendances

Renovate est le robot qui propose les nouvelles versions par des pull requests. `renovate.json` porte ses règles pour la v3. Elles sont écrites, validées et gardées par un test. Elles ne font encore rien.

### Sans effet avant la bascule

Renovate ne lit sa configuration que sur la branche par défaut du dépôt, `main`.

- **Tant que `main` porte l'ancien site, c'est le `renovate.json` de `main` qui s'applique : la sécurité seule.** Il ne propose que les correctifs de sécurité, et ne fusionne rien seul. Cette branche n'y touche pas, et Renovate n'ouvre aucune pull request vers `v3`.
- **Le fichier d'ici arrive sur `main` avec la v3**, par la fusion de la bascule. La règle « sécurité seule » s'arrête donc au moment où `main` cesse de porter l'ancien site, pas avant.
- **Avant cette fusion, `main` doit être protégée** : `ci-ok` et `CodeQL` requis, administrateurs compris, comme pour `v3` (« Les deux checks requis », plus haut). La fusion automatique est confiée à GitHub, qui fusionne une pull request de Renovate quand les checks requis sont verts. Sans check requis sur `main`, plus rien ne tient cette porte : la protection vient d'abord, la configuration ensuite.
- Le dépôt doit aussi autoriser la fusion automatique des pull requests (réglage « Allow auto-merge » de GitHub).

Relevé du 14/10/2026, en lecture seule : le `renovate.json` de `main` est en sécurité seule ; `main` exige les checks de l'ancien site, pas encore `ci-ok` ; « Allow auto-merge » est activé ; aucune pull request n'a jamais visé `v3`.

Pour le relire, avant la bascule puis après :

```sh
gh api "repos/For-Hives/my-makeup/contents/renovate.json?ref=main" --jq '.content | @base64d | fromjson | {extends, regles: [.packageRules[].description]}'
gh api repos/For-Hives/my-makeup/branches/main/protection --jq '{checks: .required_status_checks.contexts, admins: .enforce_admins.enabled}'
gh api repos/For-Hives/my-makeup --jq .allow_auto_merge
gh pr list --repo For-Hives/my-makeup --author "app/renovate" --state open
```

### Ce que les règles décident

| Sujet | Règle |
|---|---|
| Versions | Exactes partout, jamais une plage. Les actions sont figées par leur commit, les images par leur étiquette et leur empreinte, qui montent ensemble. |
| Attente | 7 jours après la publication, pour toute version. Une version dont la date de publication est inconnue attend. |
| Rythme | Le lundi avant 7 h, heure de Paris. 3 pull requests ouvertes au plus, 2 nouvelles par heure au plus. |
| Fusion automatique | Une mineure, un correctif ou une empreinte, d'une version qui n'est pas une 0.x. Toujours par une pull request, que GitHub fusionne derrière les checks requis. |
| Jamais fusionnés seuls | Payload, Next, Biome et Playwright. Aussi : bun, PostgreSQL, les versions forcées (`overrides`), les actions et la machine de la CI. |
| Majeures | Proposées seulement après une case cochée au tableau de bord de Renovate, et jamais fusionnées seules. |
| Sécurité | Un correctif de sécurité est proposé tout de suite, sans les 7 jours, avec l'étiquette `securite`. Il n'est jamais fusionné seul : il a moins de 7 jours. |
| `bun.lock` | Recalculé une fois par mois, le premier du mois. Jamais fusionné seul : les dépendances indirectes y montent sans les 7 jours d'attente. |
| Limites | Next reste en 16.3, TypeScript en 6, Node sur une ligne à support long (24, puis 26). |
| Non suivi | `engines.node` : il vaut « 24.x », et Renovate le figerait sur une version exacte. |

Ce qui monte ensemble, dans une seule pull request :

| Groupe | Contenu | Pourquoi |
|---|---|---|
| `payload` | `payload` et tous les paquets `@payloadcms` | Chacun exige la version exacte de `payload` |
| `next` | `next` et les paquets `@next` | Même version |
| `react` | `react`, `react-dom` et leurs types | `react-dom` exige la version de `react` |
| `tailwind` | `tailwindcss` et son plugin PostCSS | Le plugin exige la même version exacte |
| `biome` | Biome | Il monte en même temps que dans le dépôt de référence, et `biome.json` nomme sa version |
| `playwright` | Playwright, ses navigateurs et axe | Les navigateurs sont ceux d'une version précise |
| `node` | `.nvmrc` et les images Node du `Dockerfile` | La garde C04 exige le même Node partout |
| `bun` | `packageManager`, l'image du `Dockerfile`, celle du faux Google dans `compose.test.yml`, et les types | La garde C04 exige le même bun partout, et un test du banc la même image dans les deux fichiers |
| `postgres` | L'image de `docker-compose.yml` et celle de `compose.test.yml` | La même base en développement et sur le banc |

Chaque règle de `renovate.json` dit sa raison dans son champ `description`.

### La garde

`tests/ci/renovate.test.ts` fige ces règles. Il tourne avec les autres garde-fous : `bun run test:ci-garde`, ou seul : `bun --no-env-file test tests/ci/renovate.test.ts`.

- Il lit les règles comme Renovate les applique : toutes celles qui correspondent, dans l'ordre du fichier, la dernière l'emporte. Déplacer une règle peut donc changer la réponse, et la garde le voit.
- Il pose la question pour chaque dépendance du dépôt et chaque type de mise à jour : les paquets de `package.json`, les images du `Dockerfile` et des fichiers compose, le Node de `.nvmrc`, les actions de la CI. Une dépendance ajoutée demain est contrôlée sans toucher au test.
- Un réglage ou un filtre que la garde ne connaît pas est une faute en soi. Pour s'en servir : l'ajouter à `tests/outils/renovate.ts` avec son contrôle, dans le même commit.
- Chaque contrôle est joué sur le fichier du dépôt, puis sur un exemple fautif fabriqué à partir de lui.

Ce que la garde ne voit pas :

- **Ce que font les préréglages** (`extends`). Leur liste est figée : en ajouter un, c'est changer la garde.
- **Ce que Renovate fait vraiment d'une règle.** Les réponses de la garde ont été comparées une fois à celles du moteur de Renovate lui-même : voir « Relevés ».
- **Les réglages de GitHub** : la protection de `main` et « Allow auto-merge ».

### Modifier `renovate.json`

1. Changer la règle et la garde dans le même commit.
2. Demander à Renovate s'il sait lire le fichier :

   ```sh
   bun run renovate:valide
   ```

   La commande lance le validateur de Renovate en mode strict : une option inconnue, un horaire ou une expression illisibles, ou un réglage écrit à l'ancienne façon la font échouer. Il lui faut la commande `docker`, et rien d'autre. Avec Podman : `DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock bun run renovate:valide`.
3. Relancer la garde.

Le validateur tourne dans l'image officielle de Renovate, figée par son étiquette et son empreinte dans `scripts/ci/renovate-valide.ts`. Le conteneur n'a ni réseau ni dossier de ce poste : il reçoit le fichier sur son entrée, et rien d'autre. Le premier lancement télécharge l'image, environ 440 Mo.

- **Monter l'image du validateur** : choisir une version d'au moins 7 jours, sans avis de sécurité ouvert (base de GitHub et avis du dépôt renovatebot/renovate), et changer l'étiquette et l'empreinte ensemble. Rien ne la monte seule : à faire avant la bascule, puis quand le fichier change.
- **Ne pas chercher le validateur sous son nom dans le registre npm** : le paquet `renovate-config-validator` appartient à un tiers. Le vrai validateur est livré dans le paquet `renovate`.
- La CI ne lance pas le validateur : elle n'a pas à télécharger l'image à chaque passage. Elle lance la garde.

### Ce qui reste à faire à la main sur une pull request de Renovate

- **Une action de la CI** : la garde de la CI cite la version de `actions/checkout`, et le tableau de « Modifier la CI » liste les versions. La pull request reste rouge tant que le test n'est pas mis à jour, et les avis de sécurité du dépôt de l'action se relisent avant de fusionner.
- **Biome** : `biome.json` nomme la version dans l'adresse de son schéma.
- **Payload** : relancer `bun run payload:types` et `bun run payload:importmap`. La CI refuse des fichiers générés qui ne sont plus à jour.
- **Une alerte de sécurité ne respecte pas les limites de version.** Renovate peut ouvrir une pull request de sécurité vers Next 16.4 : elle se ferme à la main tant que la limite tient.
- **Lever la limite de Next** : quand une version 3.x de Payload porte le correctif des noms d'erreurs, retirer la règle, sa ligne dans la garde et la ligne `next-16-3` du registre des changements voulus, ensemble.

### Relevés

| Date | Contrôle | Résultat |
|---|---|---|
| 14/10/2026 | `bun run renovate:valide`, Renovate 44.140.0, mode strict | Valide. Le même validateur refuse une option inconnue, un horaire illisible, une expression fausse et un réglage écrit à l'ancienne façon (quatre essais) |
| 14/10/2026 | Renovate 44.140.0 lancé à blanc sur une copie du dépôt : il lit et cherche les versions, il n'écrit rien et n'a reçu aucun jeton | Il lit `package.json` et `bun.lock`, le `Dockerfile`, les deux fichiers compose, `.nvmrc` et `ci.yml`. Il ne propose ni Next 16.4, ni TypeScript 7, et ne touche pas à `engines.node`. bun 1.4 arrive dans une seule proposition pour `packageManager`, l'image et les types. Cinq versions de moins de 7 jours sont retenues. |
| 14/10/2026 | Le moteur de Renovate 44.140.0, préréglages compris, interrogé sur chaque dépendance du dépôt et chaque type de mise à jour | 608 réponses, les mêmes que celles de la garde. Rien n'est fusionné seul hors des mineures, correctifs et empreintes ; aucune majeure sans approbation ; aucun correctif de sécurité fusionné seul |

Ce que ces relevés ne montrent pas : les actions de la CI n'ont pas été cherchées, faute de jeton GitHub, et rien de ce qui se passe sur GitHub n'a pu être joué : une vraie pull request de Renovate, sa fusion par GitHub, le tableau de bord. Cela se constate le premier lundi après la bascule.

## 12. La dérive de schéma

La dérive, c'est l'écart entre le schéma que décrivent les collections du code et celui que créent les migrations versionnées. Une collection changée sans sa migration, c'est une base de préprod ou de prod qui ne suit plus le code.

```sh
bun run schema:derive
```

- La commande compare les collections du code à l'instantané que Payload a rangé avec la dernière migration (`src/migrations/*.json`). C'est la réponse de `migrate:create --skip-empty`, sans rien écrire.
- Code de sortie 0 : « Aucune dérive de schéma ». Code de sortie 1 : elle liste le SQL qu'une migration contiendrait, puis dit d'écrire la migration par `bun run payload:migrate:create` et d'en relire le SQL.
- Elle n'ouvre aucune base et ne lit aucun secret : Payload est chargé sans connexion, et les deux variables que réclame sa configuration reçoivent des valeurs de remplissage. Elle tourne en moins d'une seconde.
- Un nom qui n'existe que d'un côté, alors que d'autres n'existent que de l'autre (une colonne renommée, ou retirée pendant qu'une autre était ajoutée), est une dérive en soi. La commande le dit tout de suite. Sans ce contrôle, drizzle-kit poserait la question « renommée ? » sur le terminal et attendrait pour toujours dans une CI : essayé le 14/10/2026, le processus a été arrêté au bout de 15 secondes sans réponse.
- `--avant <instantane.json>` compare à un autre instantané que celui de la dernière migration, et `--instantane <fichier.json>` écrit celui des collections : ce sont les outils de son test, `tests/ci/derive-schema.test.ts`.

### Bloquante depuis la migration `init`

Le schéma de P3 est figé dans une seule migration, `init` (ticket 049), qui a remplacé les migrations provisoires. Depuis, la commande est une étape du job `qualite` :

```yaml
      - name: Schema drift
        if: ${{ !cancelled() }}
        run: bun run schema:derive
```

- Une collection changée sans sa migration rend le job `qualite` rouge, donc `ci-ok`. La garde des fichiers générés et cette étape disent ensemble : un changement de collection vient avec ses types et sa migration, dans le même commit.
- La garde de `tests/ci/derive-schema.test.ts` garde l'étape : la commande exacte, seule dans son étape, après l'installation, sans condition qui la sauterait (`schemaDriftProblems`, `tests/outils/garde-fous-ci.ts`). Le même test prouve que la commande voit une colonne ajoutée, une table ajoutée et une colonne renommée, et qu'elle ne trouve aucune dérive sur le dépôt.
- La commande compare les collections à l'instantané de la dernière migration, pas au SQL de la migration. Une migration dont le SQL ne crée pas ce que son instantané déclare lui échappe : c'est le banc de test qui la voit, avant le premier test d'intégration et avant le premier essai de bout en bout ([`docs/tests/banc.md`](tests/banc.md), « Préparer la base du banc »).
- Relevé du 14/10/2026 : aucune dérive, contre `20261014_134242_init`. Un champ ajouté à `talents` sans sa migration, essayé sur un poste puis retiré : code 1, avec les deux instructions qu'une migration contiendrait (la table et ses versions).
