# Registre des changements voulus

Ce registre liste tout ce que la v3 fait autrement que le site actuel, par décision.

À la répétition de la bascule, la v3 est comparée au site actuel, page par page. Seuls les écarts écrits ici sont acceptés. Tout autre écart est un défaut.

Les faits datés de la migration sont dans [`JOURNAL.md`](JOURNAL.md).

## Règles

- Une ligne par changement. Chaque ligne a un repère, sa source et les pages touchées.
- Le repère ne change jamais : les outils et les tickets le citent.
- La source est une section d'un plan, une décision datée ou un ticket.
- Les pages sont des familles d'adresses, comme `/profil/<slug>`. Jamais l'adresse d'un vrai profil.
- La case « Pages touchées » ne nomme que les familles où un écart est attendu : les outils de comparaison lisent chaque adresse qu'elle contient comme une page qui change. Une page qui ne change pas se dit dans la case qui décrit la v3, jamais ici. Sans page touchée, la case commence par « Aucune » et ne nomme aucune adresse.
- Aucune donnée personnelle : ni nom, ni email, ni téléphone, ni pseudo, ni slug. Un profil ou un compte se désigne par son identifiant numérique dans l'ancienne base. Une adresse du site lui-même, sur le domaine `my-makeup.fr`, n'est pas une donnée personnelle.
- Un nombre porte la date de sa source : le plan ou un relevé. L'import le recomptera.
- Un changement visible sans ligne ici n'est pas fini. La ligne s'ajoute en bas du tableau de sa partie, dans le même commit que le changement.
- Une décision qui annule un changement retire sa ligne. Le journal en garde la trace.

Un test garde la forme du registre : `bun --no-env-file test tests/unit/registre-changements.test.ts`.

## Sources citées

- « plan 01 » : le plan technique. « plan 02 » : le plan de tests.
- « décision du JJ/MM/AAAA » : une entrée du journal des décisions, à cette date et à cette heure.
- « ticket NNN » : un ticket de la v3.

Ces documents vivent dans le dépôt des plans, hors de ce dépôt.

## 1. Données reprises de l'ancien site

Les huit premières lignes sont les transformations du plan 01 §6.2, dans son ordre.

| Repère | Avant | Dans la v3 | Source | Pages touchées |
|---|---|---|---|---|
| `ville-en-commune` | La ville est un texte libre. Plan du 08/10/2026 : 44 villes vides, 45 valeurs distinctes, dont des adresses postales et « France ». | La ville devient une commune du référentiel officiel (`geo.api.gouv.fr`) : nom, code INSEE, département, coordonnées. Une adresse postale n'est jamais reprise. Un cas ambigu part en revue à la main. | plan 01 §6.2 « Ville » | `/profil/<slug>`, `/search`, `/auth/profil` |
| `prix-numerique` | Le prix d'une prestation est un texte libre. Plan du 08/10/2026 : 55 prix sur 118 ne sont pas un nombre. | Deux champs. `prixAPartirDe` : le nombre, quand le texte se lit, vide sinon. `prixTexte` : le texte d'origine, gardé tel quel. | plan 01 §6.2 « Prix » | `/profil/<slug>`, `/auth/profil` |
| `disponibilite-par-defaut` | La disponibilité n'a jamais été réglée sur 47 profils (plan du 08/10/2026) : la valeur est vide. | Une disponibilité vide devient « disponible ». Sans effet attendu sur `/profil/<slug>` et `/search`, qui comptent déjà une valeur vide comme « disponible » (lu dans le code du site actuel le 14/10/2026). | plan 01 §6.2 « `available` » | `/auth/profil` : le badge passe à « disponible ». |
| `slug-stocke` | L'adresse d'un profil est `/profil/<slug>`. L'ancienne adresse `/profil/<username>` redirige en 308. Plan du 08/10/2026 : 72 noms d'utilisateur sur 100 portent une majuscule, un espace ou un accent. | Le slug est calculé par la règle du site actuel, portée telle quelle, puis stocké avec le profil. L'ancien nom d'utilisateur est gardé pour la redirection 308, en un saut. `/profil/<slug>` et `/profil/<username>` répondent comme aujourd'hui. | plan 01 §6.2 « Username » ; plan 01 §6.3 | Aucune : aucun changement d'adresse attendu. |
| `coordonnees-consentement` | Un téléphone ou un email saisi par la maquilleuse s'affiche sur son profil. Plan du 08/10/2026 : 47 profils. | Les coordonnées sont rangées dans un groupe fermé au public. Un profil qui les affiche aujourd'hui garde l'affichage sur `/profil/<slug>` : `contactPublic` vrai, consentement daté de la bascule, source « publié par la maquilleuse ». La maquilleuse peut couper l'affichage dans son espace. | plan 01 §6.2 « Coordonnées » | `/auth/profil` : nouvel interrupteur. |
| `profils-vides-brouillon` | Plan du 08/10/2026 : 38 profils vides. Relevé du 13/10/2026 : 39 profils entièrement vides sur 101, dont les 13 de la ligne `profils-spam-non-repris`. Leur page est déjà en noindex et hors du sitemap. | Les profils vides sont repris avec le statut « brouillon », en noindex. Ils restent hors de `/sitemap.xml`. | plan 01 §6.2 « Profils vides » | `/profil/<slug>` de ces profils. |
| `comptes-sans-profil` | Plan du 08/10/2026, avant le ménage du 10/10/2026 : 14 comptes n'ont pas de profil. | Ces comptes sont repris sans profil. Le profil est créé à la première connexion. Les pages publiques ne changent pas. | plan 01 §6.2 « Comptes sans profil » | `/auth/profil`, à la première connexion. |
| `comptes-inactifs-24-mois` | Les CGU n'ont pas de règle sur les comptes inactifs. | Règle écrite dans les CGU : un compte sans connexion depuis 24 mois reçoit un avis, puis est supprimé 30 jours après. À confirmer : par défaut, la règle reste hors de la bascule (question ouverte 26 des tickets de la v3). | plan 01 §6.2 « Minimisation » | `/cgu` |
| `profils-spam-non-repris` | 13 profils entièrement vides et sans compte, restes de comptes de spam supprimés le 10/10/2026. Identifiants dans l'ancienne base : 67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108. Leur page répond encore, en noindex, hors recherche et hors sitemap. | Ces 13 profils ne sont pas repris à l'import. Leur adresse répond 404. S'ils sont supprimés de l'ancienne base avant la bascule, l'écart disparaît. | décisions du 13/10/2026 ~12:00 et ~20:45 ; plan 01 §6.3 « Slug inconnu » | `/profil/<slug>` de ces 13 profils : 404 attendue. |

## 2. Pages publiques

| Repère | Avant | Dans la v3 | Source | Pages touchées |
|---|---|---|---|---|
| `recherche-sans-profils-vides` | Jusqu'au 13/10/2026, la recherche listait aussi les profils entièrement vides : 96 cartes, dont 39 vides. | La recherche (`/search`) ne liste pas un profil entièrement vide, c'est-à-dire un profil qui ne remplit aucune des six conditions du profil publiable. Le site actuel le fait déjà depuis le 13/10/2026 à 23:06 (57 cartes) : la v3 garde ce comportement. | décisions du 13/10/2026 ~20:45 et ~23:06 | Aucune depuis le 13/10/2026 à 23:06 : le site actuel a déjà ce comportement. |

## 3. Comptes et espace maquilleuse

| Repère | Avant | Dans la v3 | Source | Pages touchées |
|---|---|---|---|---|
| `confirmation-email` | La confirmation d'email est coupée. Un compte est confirmé dès l'inscription. | Une inscription envoie un email de confirmation. Tant que l'email n'est pas confirmé, le compte ne se connecte pas. Les comptes repris de l'ancien site gardent leur état confirmé. | décision du 13/10/2026 ~20:45 ; ticket 082 ; plan 01 §6.1 | `/auth/signup`, `/auth/signin`, `/auth/verification-*` |

## 4. Écarts au plan technique

Ces lignes s'écartent du plan technique, pas du site actuel. Aucune différence n'est attendue dans les pages.

| Repère | Le plan disait | La v3 fait | Source | Pages touchées |
|---|---|---|---|---|
| `emails-resend` | Les emails partent par Mailgun, en SMTP. | Les emails partent par Resend, en SMTP, depuis le domaine `send.my-makeup.fr`. Le site actuel envoie déjà par Resend depuis le 09/10/2026, et sa page `/politique-de-confidentialite` nomme déjà Resend. | décision du 09/10/2026 ; décision du 14/10/2026 ~01:15 (ticket 001) | Aucune. |
| `groupe-front` | Deux dossiers à la racine de `src/app/` : `(site)/` et `(espace)/auth/` (plan 01 §4.4). | Un groupe parent `(front)` les contient : `src/app/(front)/(site)/` et `src/app/(front)/(espace)/auth/`. Il n'y a qu'une coquille HTML : passer du site à l'espace ne recharge pas la page, comme aujourd'hui. Un nom entre parenthèses n'apparaît pas dans les adresses. | décision du 14/10/2026 ~02:10 (ticket 002) | Aucune : les adresses sont identiques. |
| `next-16-3` | Next 16.4.x. | Next 16.3.8. Payload 3.90.2 nomme ses erreurs par le nom de leur classe, et Next 16.4 raccourcit ces noms en production : les messages d'erreur de l'administration seraient perdus. La 16.4 reste bloquée tant qu'une version 3.x de Payload n'a pas le correctif. | décision du 14/10/2026 ~01:15 (ticket 001) | Aucune. |
