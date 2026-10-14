# L'import des données de l'ancien site

L'import lit la base de l'ancienne API (Strapi 4) et écrit ce qu'elle contient dans la base de la v3, par l'API locale de Payload. Où va chaque champ, et pourquoi un champ n'est pas repris : [`SCHEMA.md`](SCHEMA.md). Ce que la v3 fait autrement que le site actuel : [`CHANGEMENTS-VOULUS.md`](CHANGEMENTS-VOULUS.md).

L'import se construit ticket par ticket. Il reprend aujourd'hui les comptes des maquilleuses (ticket 025) et les talents (ticket 024). Les profils, les photos et les articles arrivent avec leurs tickets.

## Ce qu'il garantit

- **Il tourne à blanc par défaut.** Sans `--reel`, il lit la source et la cible, dit ce qu'il écrirait, et n'écrit rien.
- **La source est lue, jamais écrite.** Il l'ouvre en lecture seule : chaque transaction de sa connexion commence en lecture seule, et chaque lecture est une transaction en lecture seule, sur un seul instantané. Le rôle qui l'ouvre doit aussi être en lecture seule (sur le banc : `lecture_strapi`). Il prend l'empreinte de chaque table qu'il lit avant et après son passage, et le dit (plan 02, I43).
- **Il refuse une cible distante.** La base où il écrit est celle de `DATABASE_URI`. Une base qui n'est pas sur ce poste (`localhost`, `127.0.0.1`, `::1`) est refusée, sauf si la commande porte `--cible-distante`. Le refus a lieu avant que la configuration de Payload soit chargée : rien ne s'y connecte, rien n'y est écrit.
- **Il retrouve chaque document par son `strapiId`** ([`SCHEMA.md`](SCHEMA.md), règle 1). Absent : il le crée. Présent avec d'autres valeurs : il met à jour les seuls champs qui diffèrent, puis remet les dates de la source. Présent avec les mêmes valeurs : il n'écrit rien. **Un second passage sur une source inchangée n'écrit rien.**
- **Il ne supprime rien.** Un document de la cible que la source ne donne plus est listé, et il reste.
- **Il ne prévient personne.** Chaque écriture porte le contexte d'import (`CONTEXTE_IMPORT`, `src/lib/contexte-import.ts`). Un crochet qui enverrait un email, rafraîchirait une page ou mettrait une photo à la corbeille le lit (`estUnImport`) et ne fait rien. Les tickets 045 (corbeille des photos) et 047 (rafraîchissement des pages) le lisent.
- **Rien n'est corrigé en silence.** Une valeur que la cible refuse est listée par identifiant et par champ, jamais avec la valeur (règle 5) : elle attend une décision (ticket 066).
- **Ce qu'il ne peut pas trancher l'arrête.** Des comptes qui portent le même email arrêtent l'import, à blanc comme en réel, avant toute écriture, tant que la table de décision ne dit pas lequel garder. Le rapport les liste par identifiants.
- **Aucun hash ne sort de la mémoire.** Le hash bcrypt d'un compte est lu dans la source et écrit dans `pros.legacyBcrypt`, de base à base : jamais dans un fichier, un journal ou le rapport (règle 4). Les jetons de réinitialisation et de confirmation ne sont jamais lus, pas même pour l'empreinte.
- **Il prouve sa parité.** Après un passage réel, il relit la cible et la compare, champ par champ, à ce que la source donne : tous les documents attendus, aucun en trop, les mêmes valeurs, la même empreinte (plan 02, I39 et I40).

## Lancer l'import

Sur le banc de test, banc démarré, avec sa fausse base Strapi ([`docs/tests/source-strapi.md`](../tests/source-strapi.md)) :

```sh
bun run banc:source                 # la fausse base Strapi
bun run banc:import                 # à blanc : ce qu'il écrirait
bun run banc:import --reel          # écrit dans la base du banc, puis relit la cible
```

`banc:import` prend l'environnement du banc de l'instance (`BANC_INSTANCE`, `BANC_DECALAGE`), comme toute commande du banc, et jamais le fichier `.env`. Il donne la table de décision du banc (`tests/fixtures/import/decisions-du-banc.json`), sauf si la commande en nomme une autre par `--decisions` : sans elle, l'import s'arrêterait, car quatre comptes de la fausse base portent le même email.

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
| `--decisions <fichier>` | La table de décision : ce qu'une personne a tranché pour les cas que l'import ne tranche pas seul (ci-dessous) |
| `--rapport <fichier>` | Écrit aussi le rapport en JSON dans ce fichier, lisible par son seul propriétaire |

| Variable | Rôle |
|---|---|
| `DATABASE_URI` | La base de Payload où l'import écrit |
| `STRAPI_SOURCE_URI` | La base Strapi qu'il lit, par un rôle en lecture seule. Sur le banc : la fausse base, dans `.env.test` |

| Code de sortie | Sens |
|---|---|
| 0 | Fini : la source n'a pas bougé et, en réel, la parité est complète |
| 1 | Refusé avant de commencer : une variable manque, la cible est distante sans `--cible-distante`, ou la table de décision est mal formée |
| 2 | Ligne de commande incomprise |
| 3 | Arrêté avant toute écriture : des cas attendent une décision, listés par identifiants |
| 4 | La source a changé pendant le passage, ou la parité d'un passage réel est incomplète |

## La table de décision

Un fichier JSON, donné par `--decisions`. Pour les vraies données, il vit hors du dépôt, comme les listes privées qu'il tranche (ticket 066). Il nomme les comptes par leur identifiant dans l'ancienne base, jamais par leur email :

```json
{ "emailsPartages": [{ "comptes": [9, 10, 11, 12], "retenu": 9 }] }
```

- **`emailsPartages`** : des comptes de l'ancien site qui portent le même email, aux espaces de bord et aux majuscules près. La v3 n'a qu'un compte par email : seul `retenu` est repris, les autres sont écartés et listés dans le rapport. Un compte écarté n'apporte pas son hash.
- Une décision vaut pour le groupe exact qu'elle nomme. Un groupe qui a changé depuis (un compte ajouté ou supprimé) est un cas nouveau : l'import s'arrête. Une décision qui ne nomme aucun groupe de la source est sans effet, et le rapport la compte.
- Une table mal formée (un compte retenu hors de son groupe, un compte dans deux groupes, une clé inconnue) est refusée avant toute écriture.
- Sur le banc : `tests/fixtures/import/decisions-du-banc.json`, qui garde le compte 9.

## Le rapport

Il ne porte que des nombres, des identifiants de l'ancienne base et des empreintes : ni nom, ni email, ni téléphone, ni hash ([`SCHEMA.md`](SCHEMA.md), règle 8).

- **Par collection** : le nombre de documents de la source, les créations, les mises à jour, les inchangés, les refusés (identifiant, motif, champs), et les documents de la cible que la source ne donne plus. Pour les comptes, en plus : les comptes écartés par la table de décision, ceux qui n'étaient pas confirmés à la source, le nombre de comptes par fournisseur et le nombre de hash hérités.
- **L'arrêt**, s'il a lieu : les groupes de comptes au même email sans décision, par identifiants.
- **Les écarts voulus** : chaque transformation faite exprès, comptée par sa référence. Une référence est un repère du registre des changements voulus (`slug-stocke`), ou une section de [`SCHEMA.md`](SCHEMA.md) pour les deux transformations qui ne changent aucune page (§1). Un écart sans référence est un défaut : la parité le montre.
- **La parité**, après un passage réel : par collection, les documents attendus, présents, égaux, différents, manquants et en trop, et l'empreinte des valeurs attendues face à celle de la cible. Pour les comptes, le nombre de comptes par fournisseur et de hash hérités, relus dans la cible (plan 02, I39 et I44).
- **La source** : le nombre de lignes et l'empreinte de chaque table lue, avant et après, et si elle a changé.

## Ce qui est repris

| Collection | Ticket | Règles |
|---|---|---|
| `pros` | 025 | Email sans espaces de bord, en minuscules ; nom (`username`), fournisseur d'origine, blocage, dates et `strapiId` tels quels ([`SCHEMA.md`](SCHEMA.md), §5.1). Le compte arrive confirmé, sans session, avec un mot de passe tiré au hasard que personne ne connaît, sans email envoyé et sans profil. Seul un hash bcrypt complet est copié dans `legacyBcrypt` ; toute autre valeur ne donne rien. Un second passage ne touche ni au mot de passe, ni au hash d'un compte inchangé |
| `talents` | 024 | Chaque champ tel quel ([`SCHEMA.md`](SCHEMA.md), §5.4). Publié si la source a une date de publication, brouillon sinon. Un slug qui n'a pas la forme d'une adresse, ou que deux talents portent, est refusé et listé : le plus ancien garde le slug |

## Les tests

- `tests/unit/import-socle.test.ts` : la cible, la ligne de commande, le contexte, la comparaison, la parité, le rapport. Sans base.
- `tests/integration/import-talents.test.ts` : les passages sur le banc, à blanc et réels, deux fois de suite, la source changée, la cible refusée, le rapport sans valeur.
- `tests/unit/import-comptes.test.ts` et `tests/integration/import-comptes.test.ts` : un compte repris champ par champ, les hash copiés et vérifiés, l'arrêt sur les emails partagés et la table de décision, le second passage, et chaque écart lu contre sa règle.
- Dans un test d'intégration, `importerSurLeBanc()` lance un passage dans le processus du test, et `commandeDImport([...])` lance la commande (`tests/outils/import.ts`).
