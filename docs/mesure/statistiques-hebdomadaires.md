# Statistiques hebdomadaires (`/api/stats/weekly`)

La route que lit le rapport du lundi (plan `04`, §3.6 ; ticket 149). Elle donne des nombres sur les comptes et les profils, et la liste des adresses des profils visibles. Aucune donnée personnelle ne sort.

## Appeler la route

```sh
curl -H "Authorization: Bearer $STATS_TOKEN" \
  "https://my-makeup.fr/api/stats/weekly?from=2026-10-04T22:00:00Z&to=2026-10-11T22:00:00Z"
```

- `from` et `to` : deux instants ISO 8601 avec leur décalage (`Z` ou `+02:00`). `from` est compris, `to` est exclu. `from` précède `to`, 92 jours au plus. Pas de période par défaut.
- Le jeton est la variable `STATS_TOKEN` de l'application (32 caractères au moins, `openssl rand -hex 32`). Sans cette variable, la route refuse tout le monde. Le jeton ne vaut que pour cette route : sur le reste de l'API, il est lu comme une visiteuse.

| Réponse | Quand |
|---|---|
| 200 | jeton valide, période lisible |
| 401 | jeton absent, faux, ou non réglé sur le serveur |
| 400 | période illisible (jeton valide) |
| 405 | tout verbe autre que `GET`, avec `Allow: GET` |

Toutes les réponses portent `Cache-Control: no-store` et `X-Robots-Tag: noindex`.

## Ce que la réponse contient

Le schéma est `StatsHebdo` (`src/lib/stats-hebdo.ts`), strict : une clé inconnue est refusée. L'exemple publié est [`stats-hebdo.exemple.json`](stats-hebdo.exemple.json). L'outil du rapport, qui n'a aucune dépendance, relit la même forme à la main, et chaque côté teste cet exemple.

- `comptes` : total, et créés dans la période.
- `profils` : total, entièrement vides (comptés à part, et dans le total), actifs, publiables, masqués, complets (11 critères sur 13 ou plus), quasi vides (2 ou moins), sans canal de contact, modifiés dans les 90 jours, créés dans la période.
- `cohorte` : les profils créés dans les 28 jours avant la période, et combien sont actifs aujourd'hui (chiffre 6 du rapport).
- `inscriptions` : un élément par profil créé dans la période, avec le jour (Paris), la complétude, `actif` et `publiable`. Ni nom, ni identifiant.
- `publiables` : les adresses (`slugs`) des profils qu'une visiteuse voit, et leur nombre par département. C'est le seul détail donné sur un profil, et seulement pour ceux-là.

« Publiable » veut dire ici : les six conditions remplies **et** profil publié. Un profil masqué ou en brouillon n'est ni compté, ni nommé, même s'il remplit les six conditions.

Pas de zone pilote (abandonnée le 13/10/2026). Les vues de profil et les recherches par jour viennent avec les tickets 212 et 213 ; le ticket 169 ajoutera des clés facultatives : un lecteur de `version: 1` doit continuer à lire une réponse qui en a moins.

## Garde-fous

- Test unitaire (`tests/unit/stats-hebdo.test.ts`) : période, jeton, réponses, comptes sur des profils fictifs, aucune donnée personnelle, schéma et exemple.
- Test d'intégration sur le jeu du banc (`tests/integration/stats-hebdo.test.ts`) : nombres exacts tirés de ce que le jeu promet de chaque profil, aucun champ avec « @ », 9 chiffres ou un nom du jeu (hors la liste des adresses), le jeton refusé ailleurs.
