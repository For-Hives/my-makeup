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

Le schéma est `WeeklyStats` (`src/lib/weekly-stats.ts`), strict : une clé inconnue est refusée. L'exemple publié est [`stats-hebdo.exemple.json`](stats-hebdo.exemple.json). L'outil du rapport, qui n'a aucune dépendance, relit la même forme à la main, et chaque côté teste cet exemple.

### Version 2 (ticket 253)

La réponse porte `"version": 2`. La version 1 avait des clés françaises ; la version 2 a les mêmes nombres sous des clés anglaises. La version 1 n'existe plus : un lecteur qui ne connaît pas la version 2 doit refuser la réponse, pas lire des zéros.

| Version 1 | Version 2 |
|---|---|
| `periode` : `debut`, `fin` | `period` : `start`, `end` |
| `genereLe` | `generatedAt` |
| `comptes` : `total`, `nouveaux` | `accounts` : `total`, `new` |
| `profils` : `entierementVides`, `actifs`, `publiables`, `masques`, `complets11`, `quasiVides`, `sansCanal`, `modifies90j`, `crees` | `profiles` : `fullyEmpty`, `active`, `publishable`, `hidden`, `complete11`, `nearlyEmpty`, `noChannel`, `modified90d`, `created` |
| `cohorte` : `profils`, `actifs` | `cohort` : `profiles`, `active` |
| `inscriptions` : `creeLe`, `completude`, `actif`, `publiable` | `signUps` : `createdOn`, `completeness`, `active`, `publishable` |
| `publiables` : `parDepartement` (`inconnu`), `slugs` | `publishable` : `byDepartment` (`unknown`), `slugs` |
| `contact` : `parStatut` (`nouvelle`, `transmise`, `repondue`, `spam`), `parEtatMail` (`en-attente`, `envoye`, `echec`) | `contact` : `byStatus` (`new`, `forwarded`, `answered`, `spam`), `byMailState` (`pending`, `sent`, `failed`) |
| `auth` : `parType` (`connexion`, `deconnexion`, `deconnexion-partout`, `inscription`, `renvoi`, `mot-de-passe-oublie`, `reinitialisation`, `blocage`, `deblocage`), `connexions` : `parCode`, `dureeP95Ms` | `auth` : `byType` (`sign-in`, `sign-out`, `sign-out-everywhere`, `sign-up`, `resend`, `forgot-password`, `password-reset`, `block`, `unblock`), `signIns` : `byCode`, `durationP95Ms` |
| `herites` : `hashRestants`, `sansMotDePasseParFournisseur` (`autre`) | `inherited` : `remainingHashes`, `withoutPasswordByProvider` (`other`) |

Ne changent pas : `version`, `total`, `slugs`, `confirmation` (un type d'événement) et les codes de `byCode`, qui sont ceux du journal d'authentification (`ok`, `heritee`, `identifiants-invalides`, `trop-de-tentatives`, `inconnu`…). Les valeurs des listes fermées de la base sont celles des tickets 250 à 252 : les clés des compteurs en sont les valeurs telles quelles.

**Ordre de mise en ligne.** La route et l'outil du rapport changent ensemble. L'outil du dépôt des plans lit la version 2 et refuse toute autre version avec une erreur claire (« réponse inattendue (version) ») : mettre l'outil à jour **avant** le déploiement de la v3 qui répond en version 2. Une v3 en version 2 lue par l'ancien outil donne une source indisponible dans le rapport, jamais des zéros.

- `accounts` : total, et créés dans la période.
- `profiles` : total, entièrement vides (comptés à part, et dans le total), actifs, publiables, masqués, complets (11 critères sur 13 ou plus), quasi vides (2 ou moins), sans canal de contact, modifiés dans les 90 jours, créés dans la période.
- `cohort` : les profils créés dans les 28 jours avant la période, et combien sont actifs aujourd'hui (chiffre 6 du rapport).
- `signUps` : un élément par profil créé dans la période, avec le jour (Paris), la complétude, `active` et `publishable`. Ni nom, ni identifiant.
- `publishable` : les adresses (`slugs`) des profils qu'une visiteuse voit, et leur nombre par département (`unknown` quand la commune n'en a pas). C'est le seul détail donné sur un profil, et seulement pour ceux-là.

« Publiable » veut dire ici : les quatre conditions remplies (photo, ville, spécialité, moyen de contact, règle du 27/10/2026) **et** profil publié. Un profil masqué ou en brouillon n'est ni compté, ni nommé, même s'il remplit les quatre conditions. Les profils indexables (dans le sitemap) en sont un sous-ensemble que cette réponse ne donne pas encore.

Clés facultatives (ticket 169), pour les relevés de J+1, J+7 et J+30. Un lecteur de la version 2 doit continuer à lire une réponse qui en a moins :

- `contact` : les messages de contact reçus dans la période (`total`), par statut (`byStatus`) et par état de l'email (`byMailState`). Chaque état de ces listes est présent, à zéro s'il n'y a rien. Rien de ce que la visiteuse a saisi ne sort.
- `auth` : les événements du journal d'authentification de la période, par type (`byType`) ; pour les seules connexions (`signIns`), le total, le compte par issue (`byCode`, dont `heritee` pour une connexion avec l'ancien mot de passe) et `durationP95Ms`, le 95e centile de leur durée en millisecondes (rang le plus proche ; `null` sans aucune durée). Le journal ne garde ni IP ni email : il n'y a rien à retirer. Il est purgé après 90 jours, ce qui borne la période utile.
- `inherited` : une photo du jour, pas de la période. `remainingHashes` est le nombre de comptes qui ont encore le hash de l'ancien site (le suivi M6 du plan technique) ; `withoutPasswordByProvider` compte, par fournisseur d'origine (`google`, `facebook`, `other`), les comptes sans hash hérité. Les comptes `local` n'y sont pas : sans hash, ils se sont déjà connectés avec leur ancien mot de passe et en ont un. Payload ne garde aucune marque d'un mot de passe posé plus tard par le lien de réinitialisation : un compte Google ou Facebook qui en a posé un reste compté, donc ce nombre est un plafond. Le hash lui-même n'est jamais lu, seulement compté.
- `views` (ticket 1001) : les vues des profils dans la période, d'après le compteur par jour : `total`, et `byDay`, le nombre de chaque jour de Paris qui en a eu (`AAAA-MM-JJ`), tous profils confondus. Aucun détail par profil, aucun visiteur. Les lignes du compteur sont gardées 92 jours, comme la plus longue période de la route. Un lecteur qui ne trouve pas la clé (une v3 plus ancienne) écrit « inconnu » dans le rapport, jamais zéro.

- `searches` (issue 1002) : les recherches de la période, comptées par jour sans aucun texte. `total`, `withCity` (une ville ou un département tapé), `noResult` (personne à montrer), `noResultShare` (la part sans résultat, de 0 à 1, trois décimales ; `null` sans aucune recherche) et `byDepartment` (`total` et `noResult` par code de département, `unknown` quand la recherche n'en vise aucun ou en vise plusieurs). Les jours sont ceux de Paris, de celui de `from` compris à celui de `to` exclu. L'outil du rapport (dépôt des plans) doit lire cette clé facultative et afficher la part sans résultat et les départements où elle est la plus haute : c'est la liste de prospection.

Pas de zone pilote (abandonnée le 13/10/2026). Les vues de profil par jour viennent avec l'issue 1001.

### Le compteur de recherches (issue 1002)

- **Quand on compte.** Le navigateur ajoute 1 une fois par recherche, par la même décision que l'événement Umami `search_submit` (`src/lib/analytics/duplicate.ts`) : les autres pages des résultats et le retour arrière ne recomptent pas, une validation du formulaire compte. Un navigateur qui s'est opposé à la mesure (`umami.disabled`) ne compte pas. Un navigateur automatisé (`navigator.webdriver`, comme pour Umami) ne compte pas, ni un automate sans JavaScript : le parcours en lecture seule des interfaces n'écrit donc rien. Le compte est une Server Action (`src/app/(front)/(site)/search/actions.ts`), freinée à 60 par minute et par adresse, qui ne répond rien.
- **Ce qui est gardé.** Une ligne par jour de Paris et par département : trois nombres (`total`, `withCity`, `noResult`). Jamais le texte tapé, ni la ville tapée, ni l'adresse IP, ni un identifiant, ni un cookie. Le département est calculé par le serveur de la page (celui que la recherche nomme, ou celui de la commune connue de la liste officielle) ; le serveur du compte n'accepte que trois clés et un code de la liste fermée.
- **Combien de temps.** 400 jours, puis la tâche quotidienne `purge-compteurs-recherche` supprime les lignes (`src/lib/tasks/search-counts.ts`). La politique de confidentialité le dit.
- **Précision.** Le département vient du navigateur : un client malveillant peut gonfler un compteur (freiné par adresse), pas lire quoi que ce soit.

## Garde-fous

- Test unitaire (`tests/unit/weekly-stats.test.ts`) : période, jeton, réponses, comptes sur des profils fictifs, aucune donnée personnelle, schéma et exemple.
- Ticket 169 : `tests/unit/weekly-stats.test.ts` (comptes, centile, clés facultatives) et `tests/integration/weekly-stats-contact-sign-ins.test.ts` (un message par état, connexions de durée connue, hash du jeu, baisse après la première connexion héritée, aucun `@`, IP ou nom).
- Test d'intégration sur le jeu du banc (`tests/integration/weekly-stats.test.ts`) : nombres exacts tirés de ce que le jeu promet de chaque profil, aucun champ avec « @ », 9 chiffres ou un nom du jeu (hors la liste des adresses), le jeton refusé ailleurs.
