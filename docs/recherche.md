# La page de recherche dans le look du kit (issue 1111)

La page `/search` applique la direction artistique ([`direction-artistique.md`](direction-artistique.md)) : fond papier, titres en Bodoni, cartes du kit, puces de 44 px. Son référencement ne change pas (`noindex`, pas d'adresse canonique), ni la mesure, ni les règles de classement de [`/classement`](../src/lib/search/ranking.ts).

Depuis le 26/10/2026, toute la page tient dans le cadre des pages (`page-frame`, [`direction-artistique.md`](direction-artistique.md), « Le cadre des pages ») au lieu de 72rem : la barre, les filtres, la sélection, les résultats et les états vides partent sous le logo. Le formulaire de la barre garde 64rem au plus, à gauche ; la grille garde ses trois colonnes et prend 56 px entre deux cartes dès 1024 px, la liste 32 px entre deux lignes dès 768 px.

## Ce qui est à l'écran

| Zone | Composant | Règle |
|---|---|---|
| Barre | `SearchBar` | un formulaire GET (`search`, `city`), seul à porter la marque de soumission de la mesure ; libellés « Prestation recherchée » et « Ville de la prestation » |
| Filtres | `SearchRefine` | **des liens**, pas un formulaire : spécialité, budget, tri, présentation. Chaque lien garde le mot, la ville et les autres choix, et revient à la première page. `prefetch={false}` (chaque préchargement est une recherche que le frein compte) |
| Résultats | `SearchGrid` | `ProfileRowCard` (`layout=list`, défaut) ou `ProfileCard` (`layout=grid`) ; un seul lien par carte, clic mesuré avec son rang, aucune coordonnée |
| Sans critère | `PresetRow` | la sélection (voir plus bas), sans rang de clic |
| États vides | `SearchStates` | mêmes textes et mêmes liens qu'avant, style du kit |

Paramètres d'adresse : `search`, `city`, `page`, `specialty`, `minPrice`, `maxPrice`, `sort`, `layout` (`list` par défaut, n'est pas écrit). Une valeur inconnue est ignorée.

## Le budget vient des prix réels

`priceBands` (`src/lib/search/filters.ts`) coupe les prix de départ de l'annuaire en trois tranches de même effectif, arrondies à 10 € (5 € sous 50 €). Moins de 6 profils chiffrés, ou des prix tous égaux : aucune tranche, la page ne devine rien. L'adresse, elle, accepte tout entier entre `PRICE_MIN` et `PRICE_MAX` : un lien partagé garde son sens quand les prix bougent, et un budget qu'aucune puce ne porte s'affiche comme une puce à part. Une maquilleuse « sur devis » n'a pas de prix à comparer : elle n'est pas montrée sous un budget (la page le dit).

## La disponibilité

Une maquilleuse en pause n'est pas listée, et aucune date n'existe : il n'y a donc pas de filtre de disponibilité (il ne ferait rien). La ligne de comptage dit « Seules les maquilleuses disponibles sont listées ».

## La sélection sans critère

Critère unique, écrit sur la page : **les visites de la page du profil sur les 30 derniers jours** (compteur du ticket 1001 : ni robots, ni la maquilleuse, ni l'équipe, une fois par onglet). Ce n'est ni une demande de devis, ni une note, et la page ne dit jamais « demandées ».

- Lecture : `readMostViewedSlugs` (`src/services/public/most-viewed.ts`), à part de la lecture publique (la collection est réservée aux admins), un agrégat par profil ; **seul l'ordre des adresses sort**, jamais un nombre. Mis en cache (`cachedMostViewed`, étiquette `profils`, une heure) : le HTML de `/search` reste dynamique comme avant (il lit l'adresse), les lectures sont dans le cache de Next.
- Éligibles (`src/lib/search/preset.ts`) : dans l'annuaire (donc publiées, ni masquées ni suspendues), publiables, joignables, dans une commune de France.
- Planchers : 10 visites par profil, 6 profils éligibles. En dessous, ou si la lecture échoue : **« Les mieux classées »**, le début de l'ordre de l'annuaire, avec la phrase qui le dit.
- Règle publiée sur `/classement` (`preset`), jouée par `tests/unit/ranking-transparency.test.tsx`.

Les planchers sont des constantes (`MOST_VIEWED_MIN_VIEWS`, `MOST_VIEWED_MIN_PROFILES`) : à régler quand les vrais volumes seront connus.

## Tests

`tests/unit/search-filters.test.ts` (adresse, tranches), `search-preset.test.ts` (sélection), `search-art.test.tsx` (composants), `tests/integration/most-viewed.test.ts` (le compteur, sur le banc), `tests/e2e/search-filters.spec.ts` et `search-preset.spec.ts` (390 et 1440 px, axe, cibles de 44 px).
