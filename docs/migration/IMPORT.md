# L'import des données de l'ancien site

L'import lit la base de l'ancienne API (Strapi 4) et écrit ce qu'elle contient dans la base de la v3, par l'API locale de Payload. Où va chaque champ, et pourquoi un champ n'est pas repris : [`SCHEMA.md`](SCHEMA.md). Ce que la v3 fait autrement que le site actuel : [`CHANGEMENTS-VOULUS.md`](CHANGEMENTS-VOULUS.md).

L'import se construit ticket par ticket. Il reprend aujourd'hui les comptes des maquilleuses (ticket 025), l'identité de leurs profils (tickets 026 et 059) et les talents (ticket 024). Le reste des profils, les photos et les articles arrivent avec leurs tickets.

## Ce qu'il garantit

- **Il tourne à blanc par défaut.** Sans `--reel`, il lit la source et la cible, dit ce qu'il écrirait, et n'écrit rien, ni document ni schéma.
- **Il ne touche pas au schéma de la cible.** Les tables sont celles de l'application : ses migrations les créent quand elle démarre. L'import démarre Payload sans pousser le schéma du code dans une base de ce poste (l'interrupteur de Payload, `PAYLOAD_MIGRATING`) et sans jouer de migration en production. Une base cible qui n'a pas les tables de la v3 est refusée avant toute lecture : démarre l'application une fois sur cette base, ou, sur le banc, `bun run banc:prepare`.
- **La source est lue, jamais écrite.** Il l'ouvre en lecture seule : chaque transaction de sa connexion commence en lecture seule, et chaque lecture est une transaction en lecture seule, sur un seul instantané. Le rôle qui l'ouvre doit aussi être en lecture seule (sur le banc : `lecture_strapi`). Il prend l'empreinte de chaque table qu'il lit avant et après son passage, et le dit (plan 02, I43).
- **Il refuse une cible distante.** La base où il écrit est celle de `DATABASE_URI`. Une base qui n'est pas sur ce poste (`localhost`, `127.0.0.1`, `::1`) est refusée, sauf si la commande porte `--cible-distante`. Le refus a lieu avant que la configuration de Payload soit chargée : rien ne s'y connecte, rien n'y est écrit.
- **Il retrouve chaque document par son `strapiId`** ([`SCHEMA.md`](SCHEMA.md), règle 1). Absent : il le crée. Présent avec d'autres valeurs : il met à jour les seuls champs qui diffèrent, puis remet les dates de la source. Présent avec les mêmes valeurs : il n'écrit rien. **Un second passage sur une source inchangée n'écrit rien.**
- **Il ne supprime rien.** Un document de la cible que la source ne donne plus est listé, et il reste.
- **Il ne prévient personne.** Chaque écriture porte le contexte d'import (`CONTEXTE_IMPORT`, `src/lib/contexte-import.ts`). Un crochet qui enverrait un email, rafraîchirait une page ou mettrait une photo à la corbeille le lit (`estUnImport`) et ne fait rien. Les tickets 045 (corbeille des photos) et 047 (rafraîchissement des pages) le lisent.
- **Rien n'est corrigé en silence.** Une valeur que la cible refuse est listée par identifiant et par champ, jamais avec la valeur (règle 5) : elle attend une décision (ticket 066). Un document refusé compte : la parité le dit incomplète, et la commande sort en 5.
- **Ce qu'il ne peut pas trancher l'arrête.** Des comptes qui portent le même email arrêtent l'import, à blanc comme en réel, avant toute écriture, tant que la table de décision ne dit pas lequel garder. Le profil d'un compte que la table écarte l'arrête aussi, tant qu'elle ne dit pas de l'écarter avec lui ([`SCHEMA.md`](SCHEMA.md), §11). Un profil qui n'a aucun compte dans la source l'arrête de même, sauf s'il est l'un des 13 profils vides laissés par le spam ([`SCHEMA.md`](SCHEMA.md), §4.1), que l'import écarte lui-même : la liste ne s'allonge pas toute seule. Le rapport les liste par identifiants.
- **Aucun hash ne sort de la mémoire.** Le hash bcrypt d'un compte est lu dans la source et écrit dans `pros.legacyBcrypt`, de base à base : jamais dans un fichier, un journal ou le rapport (règle 4). Les jetons de réinitialisation et de confirmation ne sont jamais lus, pas même pour l'empreinte.
- **Une erreur ne dit que son code.** Le texte d'une erreur de la base porte la requête et ses valeurs : un email, un hash. Une écriture que la base n'a pas faite (connexion perdue, délai dépassé, déclencheur, disque plein) arrête l'import, qui nomme la collection, le document par son identifiant et le code de l'erreur (`SQLSTATE`), jamais son texte. Il en va de même de toute erreur inattendue : son type et son code. Ce qui était écrit reste écrit, et un nouveau passage reprend à partir de là.
- **Il prouve sa parité.** Après un passage réel, il relit la cible et la compare, champ par champ, à ce que la source donne : tous les documents attendus, aucun refusé, aucun en trop, les mêmes valeurs, la même empreinte (plan 02, I39 et I40).

## Lancer l'import

Sur le banc de test, banc démarré, avec sa fausse base Strapi ([`docs/tests/source-strapi.md`](../tests/source-strapi.md)) :

```sh
bun run banc:prepare                # la base du banc, à jour et vide, si elle n'a pas encore ses tables
bun run banc:source                 # la fausse base Strapi
bun run banc:import                 # à blanc : ce qu'il écrirait
bun run banc:import --reel          # écrit dans la base du banc, puis relit la cible
```

`banc:import` prend l'environnement du banc de l'instance (`BANC_INSTANCE`, `BANC_DECALAGE`), comme toute commande du banc, et jamais le fichier `.env`. Il donne la table de décision du banc (`tests/fixtures/import/decisions-du-banc.json`), sauf si la commande en nomme une autre par `--decisions` : sans elle, l'import s'arrêterait, car quatre comptes de la fausse base portent le même email, et l'un des comptes écartés a un profil.

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
| 0 | Fini : la source n'a pas bougé, aucun document n'est refusé et, en réel, la parité est complète |
| 1 | Refusé avant de commencer : une variable manque ou ne va pas, la cible est distante sans `--cible-distante`, la cible n'a pas les tables de la v3, ou la table de décision est mal formée |
| 2 | Ligne de commande incomprise |
| 3 | Arrêté avant toute écriture : des cas attendent une décision, listés par identifiants |
| 4 | La source a changé pendant le passage, ou la cible s'écarte de la source par autre chose que des documents refusés : un écart que le rapport n'explique pas |
| 5 | Des documents sont refusés, avant l'écriture ou par Payload : listés par identifiant et par champ, ils attendent une décision. En réel, la parité est incomplète d'autant |
| 6 | Arrêté en cours de passage par une erreur de la base ou une erreur inattendue, nommée par son type et son code. Ce qui était écrit reste écrit ; un nouveau passage reprend à partir de là |

## La table de décision

Un fichier JSON, donné par `--decisions`. Pour les vraies données, il vit hors du dépôt, comme les listes privées qu'il tranche (ticket 066). Il nomme les comptes par leur identifiant dans l'ancienne base, jamais par leur email :

```json
{ "emailsPartages": [{ "comptes": [9, 10, 11, 12], "retenu": 9 }], "profilsEcartes": [29] }
```

- **`emailsPartages`** : des comptes de l'ancien site qui portent le même email, aux espaces de bord et aux majuscules près. La v3 n'a qu'un compte par email : seul `retenu` est repris, les autres sont écartés et listés dans le rapport. Un compte écarté n'apporte pas son hash.
- **`profilsEcartes`** : des profils qu'une personne a décidé d'écarter : le profil d'un compte écarté par une décision ci-dessus, ou un profil qui n'a aucun compte dans la source sans être l'un des 13 profils du spam ([`SCHEMA.md`](SCHEMA.md), §4.1). Un tel profil sans sa décision arrête l'import ([`SCHEMA.md`](SCHEMA.md), §11). Écarté, il est listé dans le rapport. Une autre issue, comme rattacher le profil au compte retenu, reste à trancher (ticket 066).
- Une décision vaut pour le cas exact qu'elle nomme. Un groupe qui a changé depuis (un compte ajouté ou supprimé) est un cas nouveau : l'import s'arrête. Une décision qui ne nomme aucun cas de la source, comme le profil d'un compte qui n'est pas écarté ou l'un des 13 profils du spam, est sans effet, et le rapport la compte.
- Une table mal formée (un compte retenu hors de son groupe, un compte dans deux groupes, un identifiant nommé deux fois, une clé inconnue) est refusée avant toute écriture.
- Sur le banc : `tests/fixtures/import/decisions-du-banc.json`, qui garde le compte 9 et écarte le profil 29 du compte 11.

## Le rapport

Il ne porte que des nombres, des identifiants de l'ancienne base et des empreintes : ni nom, ni email, ni téléphone, ni hash ([`SCHEMA.md`](SCHEMA.md), règle 8).

- **Par collection** : le nombre de documents de la source, les créations, les mises à jour, les inchangés, les refusés (identifiant, motif, champs), et les documents de la cible que la source ne donne plus. Pour les comptes, en plus : les comptes écartés par la table de décision, ceux qui n'étaient pas confirmés à la source, le nombre de comptes par fournisseur et le nombre de hash hérités. Pour les profils : ceux que la table de décision écarte, les 13 profils du spam écartés par l'import, le nombre de profils par statut, et les profils dont le statut calculé par le serveur n'est pas celui que donne la source (une section que l'import ne reprend pas encore, ou une ville qui ne donne aucune commune). Les profils de la source sont la somme des profils repris, de ceux que la table écarte et de ceux du spam (plan 02, I39).
- **L'arrêt**, s'il a lieu : les groupes de comptes au même email sans décision, les profils d'un compte écarté sans décision, et les profils sans compte hors de la liste du spam sans décision, par identifiants.
- **Les écarts voulus** : chaque transformation faite exprès, comptée par sa référence. Une référence est un repère du registre des changements voulus (`slug-stocke`), ou une section de [`SCHEMA.md`](SCHEMA.md) pour les deux transformations qui ne changent aucune page (§1). Un écart sans référence est un défaut : la parité le montre.
- **La parité**, après un passage réel : par collection, les documents attendus, présents, égaux, refusés, différents, manquants et en trop, et l'empreinte des valeurs attendues face à celle de la cible. Un document refusé compte parmi les attendus : la parité n'est complète que sans aucun refusé. Les empreintes laissent les refusés de côté, pour que seul un écart inexpliqué les sépare. Pour les comptes, le nombre de comptes par fournisseur et de hash hérités, relus dans la cible (plan 02, I39 et I44) ; pour les profils, le nombre de profils par statut.
- **La source** : le nombre de lignes et l'empreinte de chaque table lue, avant et après, et si elle a changé.

## Ce qui est repris

| Collection | Ticket | Règles |
|---|---|---|
| `pros` | 025 | Email sans espaces de bord, en minuscules ; nom (`username`), fournisseur d'origine, blocage, dates et `strapiId` tels quels ([`SCHEMA.md`](SCHEMA.md), §5.1). Le compte arrive confirmé, sans session, avec un mot de passe tiré au hasard que personne ne connaît, sans email envoyé et sans profil. Seul un hash bcrypt complet est copié dans `legacyBcrypt` ; toute autre valeur ne donne rien. Un second passage ne touche ni au mot de passe, ni au hash d'un compte inchangé |
| `profils` | 026, 059 | Seuls les profils reliés à un compte repris, un pour un (plan 02, I41). Le lien au compte (`pro`), le slug, l'ancien nom d'utilisateur (`legacyUsername`, tel quel : il sert la redirection 308), le prénom, le nom, le nom d'artiste, la spécialité, la description, le score, le badge « Super maquilleuse » (`superMaquilleuse`) et les dates, tels quels ([`SCHEMA.md`](SCHEMA.md), §5.2). Le slug est celui de l'ancien site : la règle portée (`src/lib/slug.ts`), calculée sur tous les profils de la source, le plus ancien gardant un slug que deux noms d'utilisateur donnent (registre, `slug-stocke`). Une disponibilité jamais réglée (`null`) devient « disponible » (registre, `disponibilite-par-defaut`). Le statut n'est jamais écrit : le serveur le calcule à chaque enregistrement depuis ce que l'import écrit (ticket 044), brouillon pour un profil entièrement vide (registre, `profils-vides-brouillon`), publié sinon ; l'import laisse le choix du statut à la règle (`statutChoisi` à `automatique`), et compare le statut enregistré à celui que donne la règle. Les 13 profils vides laissés sans compte par le spam sont écartés et comptés (registre, `profils-spam-non-repris`). Tout autre profil sans compte, et le profil d'un compte que la table de décision écarte, arrêtent l'import, sauf si la table les écarte : ils sont alors listés. Les listes : 060 ; les photos : 058 |
| `talents` | 024 | Chaque champ tel quel ([`SCHEMA.md`](SCHEMA.md), §5.4). Publié si la source a une date de publication, brouillon sinon. Un slug qui n'a pas la forme d'une adresse, ou que deux talents portent, est refusé et listé : le plus ancien garde le slug |

## Jusqu'à la bascule seulement

L'import suit la source : chaque passage remet dans la cible ce que l'ancien site contient. C'est ce qu'il faut tant que l'ancien site est en service, puisqu'une maquilleuse peut y changer son email ou son mot de passe. Relancé après la bascule, il remettrait l'email de l'ancien site et son hash hérité sur un compte que la maquilleuse a changé dans la v3, et un ancien mot de passe ouvrirait de nouveau le compte. Rien ne l'empêche encore : les tickets de la connexion par le hash hérité (087), de l'import suivi des connexions héritées (095) et de l'import lancé depuis l'application déployée (183) en tiennent compte.

## Les tests

- `tests/unit/import-socle.test.ts` : la cible, la configuration de Payload sans changement de schéma, la ligne de commande, le contexte, la comparaison, la parité et ses refusés, le rapport, les codes de sortie, les erreurs dites par leur code. Sans base.
- `tests/integration/import-talents.test.ts` : les passages sur le banc, à blanc et réels, deux fois de suite, la source changée, la cible refusée (distante, ou sans le schéma de la v3, où rien n'est créé), le schéma jamais poussé, le rapport sans valeur.
- `tests/unit/import-comptes.test.ts` et `tests/integration/import-comptes.test.ts` : un compte repris champ par champ, les hash copiés et vérifiés, une erreur de la base qui n'en dit rien, un compte refusé que la parité compte, l'arrêt sur les emails partagés et la table de décision, le second passage, et chaque écart lu contre sa règle.
- `tests/unit/import-profils.test.ts` et `tests/integration/import-profils.test.ts` : un profil relié à son compte, son slug et son identité, la disponibilité nulle devenue vraie, le statut calculé par le serveur et le choix rendu à la règle, les 13 profils du spam écartés, l'arrêt sur un autre profil sans compte et sur le profil d'un compte écarté, le second passage, et la lecture publique qui le donne.
- `tests/e2e/tranche-profil-importe.spec.ts` : la première tranche de bout en bout, en un seul essai. La fausse base Strapi, l'import lancé comme une personne le lance, en production comme l'application, puis la page publique du profil fictif 21 dans l'application construite : 200, son nom dans le seul h1 du HTML du serveur, aucune coordonnée ni aucun champ réservé ; un slug inconnu en 404 ; un second import qui n'écrit rien. Ce que répond la page d'un brouillon (aujourd'hui 404, demain 200 en noindex) est au ticket 104.
- Dans un test d'intégration, `importerSurLeBanc()` lance un passage dans le processus du test, et `commandeDImport([...])` lance la commande (`tests/outils/import.ts`).
