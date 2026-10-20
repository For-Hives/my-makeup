# Les noms du code : la règle et le contrôle

Le code de la v3 est en anglais jusque dans ses noms. Ce document dit ce que la règle couvre, comment le contrôle la vérifie, ce que fait un changement qui ajoute un nom. La règle, le glossaire et les exceptions sont dans [`CLAUDE.md`](../CLAUDE.md), « Conventions » et « Glossaire des noms » : ils s'appliquent à toute tâche. Le plan complet (inventaire, risques, ordre des lots) est `PLAN-ANGLAIS.md`, dans le dépôt des plans.

## 1. Ce que le contrôle lit

`bun run names:check` découpe chaque nom en mots (camelCase, PascalCase, `-`, `_`, `.`, chiffres), retire les accents, et compare chaque mot à `scripts/naming/french-words.txt` (la liste de l'annexe du plan, moins `preprod`, dont la garde du ticket 232 interdit le mot dans `scripts/` : 1 587 mots). Un nom qui contient un mot de la liste est « français ». Il lit :

| Famille | Ce qui est lu |
|---|---|
| fichiers et dossiers | chaque segment de chemin sous `src/`, `scripts/` et `tests/`, sans l'extension ni les chiffres |
| noms déclarés | `const`, `let`, `var` (noms destructurés compris), `function`, `class`, `interface`, `type`, `enum`, avec le drapeau « exporté » |
| scripts | les clés de `scripts` dans `package.json` |
| variables d'environnement | `process.env.NOM`, `Bun.env.NOM`, `env.NOM`, un destructurage de ces objets, les clés d'un `Record<'NOM', …>` |
| options | une chaîne qui est exactement `--une-option` (ou `--une-option=`), dans `scripts/` et `tests/support/` |

Il ne lit **ni les chaînes** (hors la forme exacte d'une option), **ni les commentaires**, ni le texte des pages. Les titres des tests et les lignes de journal sont des chaînes : ils restent en français sans exception à écrire.

Un mot anglais qui s'écrit comme un mot français (`table`, `page`, `image`, `message`, `section`, `date`…) n'est pas dans la liste, donc n'est pas signalé. Si un mot de la liste s'avère être de l'anglais dans le code, on le retire de la liste ; si un mot français passe entre les mailles, on l'y ajoute (un mot par ligne ou plusieurs par ligne, `#` ouvre un commentaire).

## 2. Lancer le contrôle

| Commande | Effet |
|---|---|
| `bun run names:check` | Tout le dépôt, hors exceptions nommées. Code 1 s'il reste un nom français. |
| `bun run names:check src/lib/auth tests/unit` | Un ou plusieurs dossiers ou fichiers. |
| `bun run names:check --summary` | Les nombres par famille (français / total) en plus. |
| `bun run names:check --json` | Le rapport complet : échecs, noms en attente, noms excusés, exceptions qui ne désignent plus rien. |

La sortie groupe les noms par fichier, avec les mots français trouvés. Le contrôle tourne dans la CI, dans le job `qualite` (étape « English names »), donc sous `ci-ok` sans nouveau check requis : un nom français hors des exceptions nommées rend la CI rouge. La liste d'attente est vide depuis le ticket 254 ; `tests/ci/names-check.test.ts` échoue si une entrée y revient.

## 3. Les exceptions

Elles vivent dans `scripts/naming/config.json`.

- **`exceptions.paths`** : un fichier ou un dossier dont le **nom** reste français, avec sa raison. Ce sont les dossiers des adresses gelées (le nom du dossier est l'adresse). Les workflows de `.github/` (`sondes.yml`, `ci.yml`) sont hors du périmètre du contrôle, qui ne lit que `src/`, `scripts/`, `tests/` et `package.json`. L'exception ne couvre pas ce que le dossier contient.
- **`exceptions.words`** : un mot qui reste partout, ou seulement sous les chemins de `in`. Aujourd'hui : `specialite`, dans `src/lib/search/input.ts` (le paramètre `?specialite=`).
- **`waiting`** et **`owners`** : vides. Le mécanisme (un chemin et tout ce qu'il contient, pour un travail de renommage en cours) reste dans le contrôle, mais une entrée n'est plus admise : un nom français se renomme dans le changement qui l'écrit.

Une exception qui ne désigne plus aucun chemin est signalée (« à mettre à jour ou à retirer »). Les autres exceptions de `CLAUDE.md` (catalogue Umami, codes d'erreur de l'authentification, noms Strapi, clés des registres, `ci-ok`, titres des tests, lignes de journal) sont des chaînes : le contrôle ne les lit pas, il n'y a rien à écrire. Une exception nouvelle s'ajoute avec une raison d'au moins une phrase, et s'annonce dans le compte rendu du changement.

## 4. Ajouter un nom

1. Écrire le nom en anglais, avec le mot du glossaire de `CLAUDE.md` s'il y en a un ; un mot absent s'y ajoute dans le même changement.
2. `bun run names:check <dossier>` doit sortir 0. Si le contrôle signale un mot anglais qui s'écrit comme un mot français, le retirer de `scripts/naming/french-words.txt`.
3. `bun run check`, `bun run typecheck`, `bun run test`.

Le test du contrôle est `tests/unit/naming/check.test.ts`.

## 5. L'outil de renommage : retiré

Le ticket 254 retire `bun run names:rename` (`scripts/naming/rename.ts` et son test) : les lots 236 à 253 sont faits, et un outil que personne ne lance ne se maintient pas. Il reste dans l'historique de git, au commit qui précède ce retrait, si un renommage de grande taille revient un jour.

## 6. Les nombres mesurés au ticket 237

Mesure sur `v3` au commit `6a151dc`, sans liste d'attente (`bun run names:check --no-waiting --summary`), comparée à `PLAN-ANGLAIS.md` §2 :

| Famille | Plan (français / total) | Contrôle (français / total) | Écart sur les noms français |
|---|---:|---:|---:|
| fichiers de `src/`, `scripts/`, `tests/` | 616 / 846 | 616 / 860 | 0 % |
| dossiers | 54 / 131 | 54 / 136 | 0 % |
| noms déclarés (distincts) | 4 849 / 6 586 | 4 958 / 6 910 | +2,2 % |
| noms exportés (distincts) | 2 062 / 2 428 | 2 056 / 2 458 | -0,3 % |
| variables d'environnement lues | 26 / 67 | 25 / 70 | -3,8 % |
| scripts de `package.json` | 20 / 39 | 20 / 41 | 0 % |
| options des scripts | environ 20 / environ 23 | 19 / 70 | -5 % |

Les totaux du contrôle comptent les fichiers de ce ticket (`scripts/naming/`, `tests/unit/naming/`) et, pour les variables et les options, tout ce qui a la forme d'une variable ou d'une option (le plan ne compte que celles qui sont les nôtres) : seuls les nombres de noms français se comparent.

## 7. Les nombres finaux (ticket 254)

Mesure sur la branche du ticket 254, sans liste d'attente (`bun run names:check --summary`) : il ne reste que les exceptions nommées du §3.

| Famille | Au départ, ticket 237 (français / total) | Final (français / total) | Dont exceptions nommées |
|---|---:|---:|---:|
| fichiers de `src/`, `scripts/`, `tests/` | 616 / 860 | 0 / 833 | 0 |
| dossiers | 54 / 136 | 19 / 136 | 19 (les adresses gelées) |
| noms déclarés (distincts) | 4 958 / 6 910 | 0 / 6 557 | 0 |
| noms exportés (distincts) | 2 056 / 2 458 | 0 / 2 450 | 0 |
| variables d'environnement lues | 25 / 70 | 0 / 70 | 0 |
| scripts de `package.json` | 20 / 41 | 0 / 40 | 0 |
| options des scripts | 19 / 70 | 0 / 66 | 0 |

Hors de ce compte, le mot `specialite` reste dans `src/lib/search/input.ts` (le paramètre `?specialite=`, exception de mot). Les totaux baissent parce que l'outil de renommage et son test sont retirés.
