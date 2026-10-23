# Pages de zone : « maquilleuse près de chez vous »

Ticket 1015. Une page par département, `/maquilleuses/<département>` (par exemple `/maquilleuses/haute-savoie`).

## La règle, en un seul endroit

`src/lib/seo/zones.ts` décide de la page, de sa balise `robots`, de sa ligne dans le sitemap et de sa ligne dans le plan du site. Une maquilleuse compte dans la zone quand elle est **publiable** (les six conditions), **visible dans la liste** (ni indisponible, ni masquée, ni entièrement vide) et que **la commune de son profil est dans le département**. Une zone à l'étranger n'est pas une zone. Une maquilleuse qui seulement se déplace dans le département (rayon) n'est pas comptée : la page ne peut pas le montrer sans le deviner.

| Profils comptés | La page | Sitemap et plan du site |
|---|---|---|
| 0, ou département inconnu | 404 | non |
| 1 ou 2 | 200, `noindex, follow`, pas d'adresse canonique | non |
| 3 ou plus | 200, indexable, adresse canonique, données structurées | oui |

La page montre exactement les profils qu'elle compte. Une zone qui repasse sous 3 passe en `noindex` et sort du sitemap au rafraîchissement suivant, sans suppression.

## Décisions par défaut de Claude (à corriger par Andy)

- **Par quelles zones commencer** : toute la France, par la règle du seuil (décision du 13/10/2026, « toute la France pour le moment »). Aucune liste de zones à la main.
- **Qui écrit le texte local** : personne pour l'instant. La page n'a que des faits tirés des données (nombre de profils, cartes). Le plan SEO demandait aussi 300 mots uniques par page ; sans texte écrit par un humain, ce critère n'est pas appliqué et le seuil est de 3 profils. Écrire ce texte demande un champ éditable : décision d'Andy.
- **Lien profil et page « talent »** : non fait. Un lien d'un profil vers sa zone toucherait la page de profil en cache ; ticket suivant.
- **Adresse** : le segment est le nom du département écrit en minuscules sans accent (`haute-savoie`). C'est la partie difficile à défaire : une adresse indexée reste. Le choix est dans une seule fonction, `departmentSlug` ; un changement ultérieur demanderait une redirection permanente.
- **Pas de note, pas de prix médian** : aucune donnée inventée, aucun `AggregateRating`.

## Découpage (une journée au plus chacun)

1. Pages par commune, `/maquilleuses/<département>/<commune>`, même règle (reste à décider : commune homonyme dans le département).
2. Pages « prestation × commune », même règle.
3. Lien d'un profil vers sa zone, et zones voisines (maillage).
4. Texte local écrit par un humain (champ éditable) et critère de mots.
