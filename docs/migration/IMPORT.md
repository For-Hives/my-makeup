# L'import des données de l'ancien site

L'import lit la base de l'ancienne API (Strapi 4) et écrit ce qu'elle contient dans la base de la v3, par l'API locale de Payload. Où va chaque champ, et pourquoi un champ n'est pas repris : [`SCHEMA.md`](SCHEMA.md). Ce que la v3 fait autrement que le site actuel : [`CHANGEMENTS-VOULUS.md`](CHANGEMENTS-VOULUS.md).

L'import se construit ticket par ticket. Il reprend aujourd'hui les talents (ticket 024). Les comptes, les profils, les photos et les articles arrivent avec leurs tickets.

## Ce qu'il garantit

- **Il tourne à blanc par défaut.** Sans `--reel`, il lit la source et la cible, dit ce qu'il écrirait, et n'écrit rien.
- **La source est lue, jamais écrite.** Il l'ouvre en lecture seule : chaque transaction de sa connexion commence en lecture seule, et chaque lecture est une transaction en lecture seule, sur un seul instantané. Le rôle qui l'ouvre doit aussi être en lecture seule (sur le banc : `lecture_strapi`). Il prend l'empreinte de chaque table qu'il lit avant et après son passage, et le dit (plan 02, I43).
- **Il refuse une cible distante.** La base où il écrit est celle de `DATABASE_URI`. Une base qui n'est pas sur ce poste (`localhost`, `127.0.0.1`, `::1`) est refusée, sauf si la commande porte `--cible-distante`. Le refus a lieu avant que la configuration de Payload soit chargée : rien ne s'y connecte, rien n'y est écrit.
- **Il retrouve chaque document par son `strapiId`** ([`SCHEMA.md`](SCHEMA.md), règle 1). Absent : il le crée. Présent avec d'autres valeurs : il met à jour les seuls champs qui diffèrent, puis remet les dates de la source. Présent avec les mêmes valeurs : il n'écrit rien. **Un second passage sur une source inchangée n'écrit rien.**
- **Il ne supprime rien.** Un document de la cible que la source ne donne plus est listé, et il reste.
- **Il ne prévient personne.** Chaque écriture porte le contexte d'import (`CONTEXTE_IMPORT`, `src/lib/contexte-import.ts`). Un crochet qui enverrait un email, rafraîchirait une page ou mettrait une photo à la corbeille le lit (`estUnImport`) et ne fait rien. Les tickets 045 (corbeille des photos) et 047 (rafraîchissement des pages) le lisent.
- **Rien n'est corrigé en silence.** Une valeur que la cible refuse est listée par identifiant et par champ, jamais avec la valeur (règle 5) : elle attend une décision (ticket 066).
- **Il prouve sa parité.** Après un passage réel, il relit la cible et la compare, champ par champ, à ce que la source donne : tous les documents attendus, aucun en trop, les mêmes valeurs, la même empreinte (plan 02, I39 et I40).

## Lancer l'import

Sur le banc de test, banc démarré, avec sa fausse base Strapi ([`docs/tests/source-strapi.md`](../tests/source-strapi.md)) :

```sh
bun run banc:source                 # la fausse base Strapi
bun run banc:import                 # à blanc : ce qu'il écrirait
bun run banc:import --reel          # écrit dans la base du banc, puis relit la cible
```

`banc:import` prend l'environnement du banc de l'instance (`BANC_INSTANCE`, `BANC_DECALAGE`), comme toute commande du banc, et jamais le fichier `.env`.

Ailleurs, la commande lit `DATABASE_URI` et `STRAPI_SOURCE_URI` dans l'environnement (le `.env` de travail, par `bun run`) :

```sh
bun run migration:import                          # à blanc
bun run migration:import --reel                   # écrit
bun run migration:import --reel --rapport r.json  # écrit aussi le rapport en JSON
```

| Option | Effet |
|---|---|
| (aucune) | À blanc : lit la source et la cible, annonce les créations et les mises à jour, n'écrit rien |
| `--reel` | Écrit dans la base de `DATABASE_URI`, puis relit la cible pour prouver la parité |
| `--cible-distante` | Accepte une base qui n'est pas sur ce poste. Sans lui, une telle base est refusée avant toute écriture |
| `--rapport <fichier>` | Écrit aussi le rapport en JSON dans ce fichier, lisible par son seul propriétaire |

| Variable | Rôle |
|---|---|
| `DATABASE_URI` | La base de Payload où l'import écrit |
| `STRAPI_SOURCE_URI` | La base Strapi qu'il lit, par un rôle en lecture seule. Sur le banc : la fausse base, dans `.env.test` |

| Code de sortie | Sens |
|---|---|
| 0 | Fini : la source n'a pas bougé et, en réel, la parité est complète |
| 1 | Refusé avant de commencer : une variable manque, ou la cible est distante sans `--cible-distante` |
| 2 | Ligne de commande incomprise |
| 4 | La source a changé pendant le passage, ou la parité d'un passage réel est incomplète |

## Le rapport

Il ne porte que des nombres, des identifiants de l'ancienne base et des empreintes : ni nom, ni email, ni téléphone, ni hash ([`SCHEMA.md`](SCHEMA.md), règle 8).

- **Par collection** : le nombre de documents de la source, les créations, les mises à jour, les inchangés, les refusés (identifiant, motif, champs), et les documents de la cible que la source ne donne plus.
- **Les écarts voulus** : chaque transformation faite exprès, comptée par sa référence. Une référence est un repère du registre des changements voulus (`slug-stocke`), ou une section de [`SCHEMA.md`](SCHEMA.md) pour les deux transformations qui ne changent aucune page (§1). Un écart sans référence est un défaut : la parité le montre.
- **La parité**, après un passage réel : par collection, les documents attendus, présents, égaux, différents, manquants et en trop, et l'empreinte des valeurs attendues face à celle de la cible.
- **La source** : le nombre de lignes et l'empreinte de chaque table lue, avant et après, et si elle a changé.

## Ce qui est repris

| Collection | Ticket | Règles |
|---|---|---|
| `talents` | 024 | Chaque champ tel quel ([`SCHEMA.md`](SCHEMA.md), §5.4). Publié si la source a une date de publication, brouillon sinon. Un slug qui n'a pas la forme d'une adresse, ou que deux talents portent, est refusé et listé : le plus ancien garde le slug |

## Les tests

- `tests/unit/import-socle.test.ts` : la cible, la ligne de commande, le contexte, la comparaison, la parité, le rapport. Sans base.
- `tests/integration/import-talents.test.ts` : les passages sur le banc, à blanc et réels, deux fois de suite, la source changée, la cible refusée, le rapport sans valeur.
- Dans un test d'intégration, `importerSurLeBanc()` lance un passage dans le processus du test, et `commandeDImport([...])` lance la commande (`tests/outils/import.ts`).
