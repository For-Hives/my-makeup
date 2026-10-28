# Pages de zone : « maquilleuse près de chez vous »

Ticket 1015. Une page par département, `/maquilleuses/<département>` (par exemple `/maquilleuses/haute-savoie`).

## La règle, en un seul endroit

`src/lib/seo/zones.ts` décide de la page, de sa balise `robots`, de sa ligne dans le sitemap et de sa ligne dans le plan du site. Une maquilleuse compte dans la zone quand elle est **indexable** (publiable, avec une description de 100 caractères et une prestation chiffrée ou une photo de galerie : un profil mince est en `noindex`, il ne fait pas une page de zone), **visible dans la liste** (ni indisponible, ni masquée, ni entièrement vide) et que **la commune de son profil est dans le département**. Une zone à l'étranger n'est pas une zone. Une maquilleuse qui seulement se déplace dans le département (rayon) n'est pas comptée : la page ne peut pas le montrer sans le deviner.

| Profils comptés | La page | Sitemap et plan du site |
|---|---|---|
| 0, ou département inconnu | 404 | non |
| 1 ou plus | 200, indexable, adresse canonique, données structurées | oui |

La page montre exactement les profils qu'elle compte. Une zone qui retombe à 0 profil répond 404 et sort du sitemap au rafraîchissement suivant, sans suppression. Le seuil est la constante `ZONE_THRESHOLD` (1) : le relever à nouveau remettrait une zone en `noindex` (200, sans adresse canonique, hors sitemap) tant qu'elle est sous le seuil.

**Décision du propriétaire, 24/10/2026 : le seuil passe de 3 à 1 profil indexable.** Une zone avec un seul profil est indexable ; aucun texte n'est inventé pour la remplir. Le même seuil vaudra pour la page de prestation par commune quand elle existera (ticket suivant).

**Ordre (issue 1170).** Les cartes suivent l'ordre de l'annuaire : les super maquilleuses, puis les profils vérifiés, puis les autres, chaque palier de la fiche la plus complète à la plus récemment mise à jour. Aucun profil n'est retiré.

## Décisions par défaut de Claude (à corriger par Andy)

- **Par quelles zones commencer** : toute la France, par la règle du seuil (décision du 13/10/2026, « toute la France pour le moment »). Aucune liste de zones à la main.
- **Qui écrit le texte local** : personne pour l'instant. La page n'a que des faits tirés des données (nombre de profils, cartes). Le plan SEO demandait aussi 300 mots uniques par page ; sans texte écrit par un humain, ce critère n'est pas appliqué (le seuil, de 3 profils à l'origine, est de 1 depuis la décision du 24/10/2026). Écrire ce texte demande un champ éditable : décision d'Andy.
- **Lien profil et page « talent »** : non fait. Un lien d'un profil vers sa zone toucherait la page de profil en cache ; ticket suivant.
- **Adresse** : le segment est le nom du département écrit en minuscules sans accent (`haute-savoie`). C'est la partie difficile à défaire : une adresse indexée reste. Le choix est dans une seule fonction, `departmentSlug` ; un changement ultérieur demanderait une redirection permanente.
- **Pas de note, pas de prix médian** : aucune donnée inventée, aucun `AggregateRating`.

## Découpage (une journée au plus chacun)

1. Pages par commune, `/maquilleuses/<département>/<commune>`, même règle (reste à décider : commune homonyme dans le département).
2. Pages « prestation × commune », même règle.
3. Lien d'un profil vers sa zone, et zones voisines (maillage).
4. Texte local écrit par un humain (champ éditable) et critère de mots.
