# Le gel de l'ancien site

Pour que la v3 refasse ce que le site actuel fait, le site actuel doit cesser de bouger. Ce document dit **quand** il se fige, **ce qui reste permis**, **ce qu'on refait** à ce moment, et **comment on le contrôle**.

## Quand

Le gel n'a pas de date fixée. Depuis la décision d'Andy du 14/10/2026 (« le calendrier fait tout à la suite sans date »), c'est une étape : **il commence le jour et à l'heure où la répétition de la bascule démarre** (ticket 180). Le plan prévoyait le 23/11 ; cette date ne compte plus.

Jusque-là, l'ancien site reçoit la sécurité, les bugs, les contenus et la mesure, comme depuis le 13/10.

## Ce qui reste permis après le début du gel

Quatre sortes de changements, et rien d'autre dans l'historique de l'ancien site (le front `For-Hives/my-makeup` sur `main` et `For-Hives/api-my-makeup`) :

| Catégorie | Exemples |
|---|---|
| Sécurité | un correctif de faille, une mise à jour de dépendance pour un avis de sécurité |
| Bandeau | le bandeau qui annonce la bascule |
| Lecture seule | le réglage qui ferme les écritures de l'ancienne API (ticket 171) |
| Contenus | un article, une page légale, un texte édité |

Un correctif de bug, une nouveauté, une mesure ou une retouche d'interface attendent la v3 ou sont refusés.

### Comment un commit se déclare

Le message nomme sa catégorie par sa portée : `fix(security): …`, `feat(bandeau): …`, `feat(lecture-seule): …`, `content: …`. Quand la portée est déjà prise (une mise à jour de dépendance : `chore(deps): …`), une ligne de pied de message la donne :

```
chore(deps): bump x to 1.2.3

Gel: security
```

Valeurs acceptées : `security` (ou `securite`), `bandeau` (ou `banner`), `lecture-seule` (ou `readonly`), `contenus` (ou `content`). Les fusions de PR ne portent aucun changement à elles seules : elles ne comptent pas, leurs commits oui.

## Le jour où la répétition démarre

1. **Écrire le début du gel au journal des décisions** (`plans/decisions.md`), avec la date et l'heure (UTC) : « Gel de l'ancien site, début : AAAA-MM-JJ HH:MM UTC, la répétition de la bascule démarre. » C'est cette heure que l'on passe au contrôle ci-dessous. Le journal de la migration ([`JOURNAL.md`](JOURNAL.md)) reprend la ligne.
2. **Refaire, après cette heure**, la capture de référence de l'ancien site (outil `outils/migration`, `capture-site --tout-le-sitemap`, ticket 054) et l'inventaire des adresses ([`urls-inventaire.json`](urls-inventaire.json), voir [`URLS.md`](URLS.md)). Ceux d'avant le gel décrivent un site qui a pu bouger depuis.
3. **Lancer le contrôle** (ci-dessous), puis le relancer à chaque comparaison de la prod et de la v3 (ticket 181) : il dit si l'historique est resté dans les quatre catégories.

## Le contrôle

```
bun --no-env-file scripts/migration/freeze.ts \
  --start 2026-12-01T09:00:00Z \
  --repository <chemin du dépôt de l'ancien site> \
  [--ref origin/main] \
  [--capture <date de la capture de référence>] \
  [--inventory <date de l'inventaire>]
```

(ou `bun run migration:freeze -- …`). Il lit `git log` du dépôt donné, sans rien écrire. Il sort en code 1 et liste chaque commit interdit si un commit daté du début du gel ou après n'est dans aucune des quatre catégories, ou si la capture ou l'inventaire donnés sont plus anciens que le gel. Le dépôt de l'API se contrôle de la même façon, avec son chemin.

Les règles sont dans `scripts/migration/freeze-rules.ts`, leurs tests dans `tests/unit/gel.test.ts`.

## Ce que ce document ne fait pas

Il n'écrit pas la date du gel : elle n'existe pas avant la répétition. Il ne ferme pas les écritures de l'ancienne API : c'est le réglage du ticket 171.
