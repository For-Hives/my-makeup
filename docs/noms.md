# Les noms du code : la règle, le contrôle et l'outil de renommage

Le code de la v3 est en anglais jusque dans ses noms. Ce document dit ce que la règle couvre, comment le contrôle la vérifie, comment un lot de renommage s'y prend et ce que l'outil de renommage fait pour lui. La règle, le glossaire et les exceptions sont dans [`CLAUDE.md`](../CLAUDE.md), « Conventions » et « Glossaire des noms » : ils s'appliquent à toute tâche. Le plan complet (inventaire, risques, ordre des lots) est `PLAN-ANGLAIS.md`, dans le dépôt des plans.

## 1. Ce que le contrôle lit

`bun run names:check` découpe chaque nom en mots (camelCase, PascalCase, `-`, `_`, `.`, chiffres), retire les accents, et compare chaque mot à `scripts/naming/french-words.txt` (la liste de l'annexe du plan, moins `preprod`, dont la garde du ticket 232 interdit le mot dans `scripts/` : 1 587 mots). Un nom qui contient un mot de la liste est « français ». Il lit :

| Famille | Ce qui est lu |
|---|---|
| fichiers et dossiers | chaque segment de chemin sous `src/`, `scripts/` et `tests/`, sans l'extension ni les chiffres |
| noms déclarés | `const`, `let`, `var` (noms destructurés compris), `function`, `class`, `interface`, `type`, `enum`, avec le drapeau « exporté » |
| scripts | les clés de `scripts` dans `package.json` |
| variables d'environnement | `process.env.NOM`, `Bun.env.NOM`, `env.NOM`, un destructurage de ces objets, les clés d'un `Record<'NOM', …>` |
| options | une chaîne qui est exactement `--une-option` (ou `--une-option=`), dans `scripts/` et `tests/outils/` |

Il ne lit **ni les chaînes** (hors la forme exacte d'une option), **ni les commentaires**, ni le texte des pages. Les titres des tests et les lignes de journal sont des chaînes : ils restent en français sans exception à écrire.

Un mot anglais qui s'écrit comme un mot français (`table`, `page`, `image`, `message`, `section`, `date`…) n'est pas dans la liste, donc n'est pas signalé. Si un mot de la liste s'avère être de l'anglais dans le code, on le retire de la liste ; si un mot français passe entre les mailles, on l'y ajoute (un mot par ligne ou plusieurs par ligne, `#` ouvre un commentaire).

## 2. Lancer le contrôle

| Commande | Effet |
|---|---|
| `bun run names:check` | Tout le dépôt, hors liste d'attente et exceptions. Code 1 s'il reste un nom français. |
| `bun run names:check src/lib/auth tests/unit` | Un ou plusieurs dossiers ou fichiers. |
| `bun run names:check --no-waiting` | Sans la liste d'attente : la taille réelle du travail. |
| `bun run names:check --summary` | Les nombres par famille (français / total) en plus. |
| `bun run names:check --json` | Le rapport complet : échecs, noms en attente, noms excusés, entrées de la liste d'attente qui ne désignent plus rien. |

La sortie groupe les noms par fichier, avec les mots français trouvés. Le contrôle tourne dans la CI, dans le job `qualite` (étape « English names »), donc sous `ci-ok` sans nouveau check requis : un nom français hors de la liste d'attente et des exceptions rend la CI rouge. Tant que la liste d'attente n'est pas vide (lots 238 à 248), il tourne avec elle ; la passe finale du ticket 254 (liste vide, décompte final) reste à faire quand ces lots sont fusionnés.

## 3. La liste d'attente et les exceptions

Les deux vivent dans `scripts/naming/config.json`.

- **`waiting`** : les fichiers et dossiers qu'aucun lot n'a encore traités. Une entrée couvre le chemin et tout ce qu'il contient, en respectant les dossiers (`src/lib/maquilleuse` ne couvre pas `src/lib/maquilleuse-bis`). `!chemin` en retire un chemin de la liste (utilisé pour `tests/unit/naming`, que ce lot a écrit en anglais). `=chemin` couvre ce chemin seul, pas ce qu'il contient (le dossier `(espace)` dont le nom est français alors que ses enfants sont listés un à un). **Un lot retire de la liste les entrées qu'il vient de traiter**, dans le même commit que ses renommages : le contrôle dit alors qu'il n'en reste aucun dans ses dossiers. Une entrée qui ne désigne plus aucun chemin est signalée (« à retirer »), de même qu'une exception devenue sans objet (un dossier gelé déplacé, `saisie.ts` renommé).
- **`exceptions.paths`** : un fichier ou un dossier dont le **nom** reste français, avec sa raison. Ce sont les dossiers des adresses gelées (le nom du dossier est l'adresse). Les workflows de `.github/` (`sondes.yml`, `ci.yml`) sont hors du périmètre du contrôle, qui ne lit que `src/`, `scripts/`, `tests/` et `package.json`. L'exception ne couvre pas ce que le dossier contient.
- **`exceptions.words`** : un mot qui reste partout, ou seulement sous les chemins de `in`. Aujourd'hui : `specialite`, dans `src/lib/search/input.ts` (le paramètre `?specialite=`).

Les autres exceptions de `CLAUDE.md` (catalogue Umami, codes d'erreur de l'authentification, noms Strapi, clés des registres, `ci-ok`, titres des tests, lignes de journal) sont des chaînes : le contrôle ne les lit pas, il n'y a rien à écrire. Une exception nouvelle s'ajoute avec une raison d'au moins une phrase, et s'annonce dans le compte rendu du lot.

## 4. Conduire un lot de renommage

C'est la méthode du plan, §8 :

1. Écrire la table du lot : les fichiers et dossiers à déplacer, les noms à renommer (voir §5).
2. `bun run names:rename table.json --dry-run`, puis sans `--dry-run`. Les déplacements passent par `git mv` : **un commit mécanique à part** pour eux, un second pour les renommages de noms et les corrections.
3. Corriger à la main ce que l'outil liste comme encore mentionné (documents, JSON, workflows, `README.md`, `CLAUDE.md`).
4. Retirer de `waiting` les dossiers traités. `bun run names:check <dossiers du lot>` doit sortir 0.
5. `bun run check`, `bun run typecheck`, `bun run test`. Aucun texte affiché ne change.

## 5. L'outil de renommage

`bun run names:rename <table.json> [--dry-run] [--no-git] [--project tsconfig.json]`, lancé depuis la racine. Il passe par le service de langage de TypeScript (déjà installé, aucune dépendance de plus) : jamais de `sed` sur un identifiant.

```json
{
  "files": [
    { "from": "src/lib/maquilleuse", "to": "src/lib/dashboard" },
    { "from": "src/lib/dashboard/lire.ts", "to": "src/lib/dashboard/read.ts" }
  ],
  "names": [
    { "file": "src/lib/dashboard/read.ts", "from": "lireLeProfil", "to": "readProfile" }
  ]
}
```

- **`files`** s'exécute d'abord, dans l'ordre. Un dossier se déplace avec son contenu. Les importeurs, les imports du fichier déplacé, les alias (`@/…`) et les ré-exports sont réécrits par `getEditsForFileRename`. Les chemins sont relatifs à la racine.
- **`names`** s'exécute ensuite, sur les chemins **après** les déplacements. Chaque entrée renomme toutes les déclarations de ce nom dans le fichier, et leurs références dans tout le projet (importeurs, ré-exports, propriétés abrégées : `{ lireLeProfil }` devient `{ lireLeProfil: readProfile }`). Les chaînes et les commentaires ne bougent pas.
- Tout est vérifié avant d'écrire : chemin absent, cible déjà existante, nom non déclaré, nouveau nom déjà déclaré dans le fichier, deux renommages qui se touchent. Une erreur arrête l'outil, rien n'est écrit.
- Tous les noms de la table sont calculés sur le même état du projet puis appliqués ensemble : une table de plusieurs centaines de noms ne coûte pas une reconstruction par nom. Les déplacements, eux, se font l'un après l'autre (chacun change le projet) : préférer une entrée par dossier à une entrée par fichier.
- À la fin, l'outil liste (par `git grep`) les fichiers qui citent encore un ancien chemin ou un ancien nom : ce sont des textes que le service de langage ne suit pas, à corriger à la main. Il ne touche ni aux adresses, ni aux valeurs de chaînes, ni aux colonnes de la base.
- Durées mesurées sur ce poste, sur tout le dépôt : un déplacement coûte environ 45 secondes (le programme TypeScript est reconstruit à chaque déplacement), une table de deux noms avec leurs 38 références environ 4 secondes. Préférer une entrée par dossier à une entrée par fichier.

Un nom qui change de casse seule (`Profile` → `profile`) n'est pas supporté sur un système de fichiers qui ignore la casse ; c'est sans objet sous Linux. **Gardé, avec sa raison** (ticket 254, passe partielle) : les lots 238 à 248 n'ont pas encore tourné, et ils renomment par cet outil ; le retirer maintenant les ferait renommer à la main ou par `sed`. Il se retire dans la passe finale, quand la liste d'attente est vide.

Son test : `tests/unit/naming/rename.test.ts` (un petit projet dans un dossier temporaire). Celui du contrôle : `tests/unit/naming/check.test.ts`.

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
