# La page de recherche dans le look du kit (issue 1111)

La page `/search` applique la direction artistique ([`direction-artistique.md`](direction-artistique.md)) : fond papier, titres en Bodoni, cartes du kit, puces de 44 px. Son référencement ne change pas (`noindex`, pas d'adresse canonique), ni la mesure, ni les règles de classement de [`/classement`](../src/lib/search/ranking.ts).

Depuis le 26/10/2026, toute la page tient dans le cadre des pages (`page-frame`, [`direction-artistique.md`](direction-artistique.md), « Le cadre des pages ») au lieu de 72rem : la barre, les filtres, la sélection, les résultats, le message « aucune maquilleuse pour ces filtres » et les cartes lointaines partent sous le logo ; « aucun résultat » et l'échec de la recherche gardent leur colonne centrée de 42rem, avec la gouttière de 24 px du cadre. Le formulaire de la barre garde 64rem au plus, à gauche ; la grille garde ses trois colonnes et prend 56 px entre deux cartes dès 1024 px, la liste 24 px entre deux lignes, 32 px dès 768 px (plus que les 20 px du fond du survol).

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
- Éligibles (`src/lib/search/preset.ts`) : dans l'annuaire (donc publiées, ni masquées ni suspendues), publiables (photo, ville, spécialité, contact), joignables, dans une commune de France.
- Planchers : 10 visites par profil, 6 profils éligibles. En dessous, ou si la lecture échoue : **« Les mieux classées »**, le début de l'ordre de l'annuaire, avec la phrase qui le dit.
- Règle publiée sur `/classement` (`preset`), jouée par `tests/unit/ranking-transparency.test.tsx`.

Les planchers sont des constantes (`MOST_VIEWED_MIN_VIEWS`, `MOST_VIEWED_MIN_PROFILES`) : à régler quand les vrais volumes seront connus.

## Les badges et le léger bonus de tri (issue 1170)

Deux cases d'un admin (`profiles.superArtist`, « Super maquilleuse », et `profiles.verified`, « Vérifiée ») posent un badge sur les cartes et sur la page du profil, et donnent un **léger bonus de tri, jamais un filtre**. Les mots sont dans `src/lib/profile/badges.ts` (une seule source : cartes, page `/classement`, administration).

- **Le badge** (`PhotoBadges`, `src/components/art/ProfileBadges.tsx`) : « Super maquilleuse » en pastille encre pleine (le plus marqué), « Vérifiée » en pastille blanche à filet avec le bouclier du kit ; du texte, aucune étoile. Sur la carte en grille et sur la carte de la recherche (`ResultCard`), il est posé sur la photo, en bas à gauche ; sur la carte en ligne, à cheval sur le bord haut de la carte (la photo de 96 px est trop petite pour les mots). Il ne prend pas de place dans la carte : sa hauteur ne change pas. « Super maquilleuse » se lit en premier, « Vérifiée » à côté. Il remplace l'ancien badge « Pro ».
- **L'ordre** : le palier (`badgeTier` : 2 super maquilleuse, 1 vérifiée, 0 les autres) est lu une fois, à la lecture de l'annuaire (`readDirectory` : tri stable, l'ordre de la base reste l'ordre dans un palier), et la recherche par distance l'applique après la distance et la pertinence, avant le nom (`sectionsByDistance`, option `tier`). Il ne passe jamais avant « zone indiquée » ni « coordonnées » (ces regroupements viennent après). Sans ville reconnue, il est donc avant la complétude. Il agit aussi sur « Les mieux classées », les pages de zone et les blocs sous un texte, qui lisent le même annuaire. Personne n'est retiré, et la pagination coupe la même liste.
- **L'explication** : la page `/classement` a la règle « badges » et la section « Les badges … » (ancre `#badges`, lien « Que veulent dire ces badges ? » sous les badges de la page d'un profil). Les mots restent prudents : « Vérifiée » veut dire « profil relu par l'équipe », rien sur la qualité du travail. Le badge « Activité vérifiée » (SIRET) est un autre badge, sans bonus de tri, expliqué plus bas dans la même page.
- **Le garde** : `tests/unit/ranking-transparency.test.tsx` refuse que le code de tri nomme une case (il ne lit que le nombre `badgeTier`).

## Tests

`tests/unit/search-filters.test.ts` (adresse, tranches), `search-preset.test.ts` (sélection), `search-art.test.tsx` (composants), `tests/integration/most-viewed.test.ts` (le compteur, sur le banc), `tests/e2e/search-filters.spec.ts` et `search-preset.spec.ts` (390 et 1440 px, axe, cibles de 44 px).
