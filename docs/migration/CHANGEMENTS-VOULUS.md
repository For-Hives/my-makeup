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
| `profils-vides-brouillon` | Plan du 08/10/2026 : 38 profils vides. Relevé du 13/10/2026 : 39 profils entièrement vides sur 101, dont les 13 de la ligne `profils-spam-non-repris`. Leur page est déjà en noindex et hors du sitemap. | Les profils vides sont repris avec le statut « brouillon », en noindex. Ils restent hors de `/sitemap.xml`. La même règle vaut pour tout profil, à chaque enregistrement : un profil entièrement vide est en brouillon, et passe à « publié » dès qu'il remplit une des six conditions du profil publiable ; un statut posé par un admin n'est jamais changé. | plan 01 §6.2 « Profils vides » ; ticket 044 | `/profil/<slug>` de ces profils. |
| `comptes-sans-profil` | Plan du 08/10/2026, avant le ménage du 10/10/2026 : 14 comptes n'ont pas de profil. | Ces comptes sont repris sans profil. Le profil est créé à la première connexion. Les pages publiques ne changent pas. | plan 01 §6.2 « Comptes sans profil » | `/auth/profil`, à la première connexion. |
| `comptes-inactifs-24-mois` | Les CGU n'ont pas de règle sur les comptes inactifs. | Règle écrite dans les CGU : un compte sans connexion depuis 24 mois reçoit un avis, puis est supprimé 30 jours après. À confirmer : par défaut, la règle reste hors de la bascule (question ouverte 26 des tickets de la v3). | plan 01 §6.2 « Minimisation » | `/cgu` |
| `profils-spam-non-repris` | 13 profils entièrement vides et sans compte, restes de comptes de spam supprimés le 10/10/2026. Identifiants dans l'ancienne base : 67, 74, 76, 77, 78, 79, 87, 88, 94, 95, 96, 104, 108. Leur page répond encore, en noindex, hors recherche et hors sitemap. | Ces 13 profils ne sont pas repris à l'import. Leur adresse répond 404. S'ils sont supprimés de l'ancienne base avant la bascule, l'écart disparaît. | décisions du 13/10/2026 ~12:00 et ~20:45 ; plan 01 §6.3 « Slug inconnu » | `/profil/<slug>` de ces 13 profils : 404 attendue. |
| `fichiers-non-images-non-repris` | La galerie d'un profil prend n'importe quel fichier. Instantané du 13/10/2026 : 1 fichier désigné par un profil n'est pas une image. | Seules les images (JPEG, PNG, WebP, GIF, AVIF) sont reprises, à leur place dans le stockage, sans copie. Un fichier qui n'est pas une image n'est pas repris : la galerie du profil ne le montre plus, et l'import le liste par son identifiant. Les photos reprises gardent leur adresse, caractère pour caractère. | plan 01 §6.1 « upload/files » ; ticket 058 | `/profil/<slug>` du profil qui le désigne. |

## 2. Pages publiques

| Repère | Avant | Dans la v3 | Source | Pages touchées |
|---|---|---|---|---|
| `recherche-sans-profils-vides` | Jusqu'au 13/10/2026, la recherche listait aussi les profils entièrement vides : 96 cartes, dont 39 vides. | La recherche (`/search`) ne liste pas un profil entièrement vide, c'est-à-dire un profil qui ne remplit aucune des six conditions du profil publiable. Le site actuel le fait déjà depuis le 13/10/2026 à 23:06 (57 cartes) : la v3 garde ce comportement. | décisions du 13/10/2026 ~20:45 et ~23:06 | Aucune depuis le 13/10/2026 à 23:06 : le site actuel a déjà ce comportement. |
| `en-tetes-securite` | Le site actuel n'envoie aucun en-tête de sécurité avec ses pages (relevé du 14/10/2026 sur l'accueil). | Chaque réponse part avec cinq en-têtes : `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` et `Content-Security-Policy-Report-Only`. La politique de contenu est en mode rapport : le navigateur signale ce qu'elle refuserait, et ne bloque rien. Elle ne nomme aucun domaine tiers pour la mesure. Comme aujourd'hui, aucune réponse ne nomme la technologie du site, et l'optimiseur d'images n'accepte que l'hôte des photos. | plan 01 §4.8 ; ticket 034 | `/` et toutes les autres adresses du site : les en-têtes de la réponse seulement. |
| `nav-sans-icones` | Les menus de la Nav portent une icône de la police Material Icons devant chaque entrée. | Les entrées des menus n'ont plus d'icône : la police d'icônes n'est pas dans la table des versions vérifiées de la v3, et le site sert alors seulement ses propres fichiers. Les noms et les descriptions sont ceux du site actuel. | ticket 068 | `/` |
| `erreur-francais-gabarit` | Une adresse inconnue répond 404 dans une page sans Nav ni pied de page. Une erreur du serveur répond en anglais, sans page du site. | Une adresse inconnue, un profil ou un article inconnu répondent 404 dans le gabarit du site, avec Nav et pied de page. Une erreur du serveur, une base indisponible par exemple, affiche une page en français sans aucune trace technique, avec un code 5xx. Aucune de ces pages n'est indexée. | ticket 069 | `/profil/<slug>` |

## 3. Comptes et espace maquilleuse

| Repère | Avant | Dans la v3 | Source | Pages touchées |
|---|---|---|---|---|
| `confirmation-email` | La confirmation d'email est coupée. Un compte est confirmé dès l'inscription. | Une inscription envoie un email de confirmation. Tant que l'email n'est pas confirmé, le compte ne se connecte pas. Les comptes repris de l'ancien site gardent leur état confirmé. | décision du 13/10/2026 ~20:45 ; ticket 082 ; plan 01 §6.1 | `/auth/signup`, `/auth/signin`, `/auth/verification-*` |
| `liens-reseaux-web` | Le formulaire des réseaux accepte un lien en `javascript:` ou en `data:`, et l'API l'enregistre tel quel : la page du profil en ferait un lien. | Un lien de réseau ou de site qui nomme un protocole autre que `http` ou `https` est refusé, avec le message « Ce lien doit commencer par http:// ou https:// ». Un lien sans protocole, comme `@pseudo`, reste accepté. | ticket 042 | `/auth/profil` : un message d'erreur pour un lien qui nomme un autre protocole. |
| `listes-profil-bornes` | La fin d'une expérience peut précéder son début, et une formation peut être datée de n'importe quel jour : ni les fenêtres de l'espace ni l'API ne comparent ces dates (lu dans le code du site actuel le 14/10/2026). Le prix d'une prestation n'est qu'un texte. | Le serveur refuse, avec un message en français, la fin d'une expérience antérieure à son début (le même jour passe) et une formation obtenue plus d'un an après la date du jour. Le montant d'un prix, quand il y en a un, va de 5 à 10 000 €, les bornes qui comptent déjà pour un profil publiable ; le texte du prix reste libre. Chaque ligne d'une liste garde l'identifiant que le serveur lui a donné. | plan 02 §7.2 U30 ; ticket 040 ; ticket 032 | `/auth/profil` |
| `rayon-200-km` | Le rayon d'action se saisit en kilomètres entiers, 1 000 km au plus (décision du 10/10/2026 ~00:45, qui relevait 400 km au plus en prod). | Le rayon d'action va de 0 à 200 km, en kilomètres entiers. Au-delà, l'enregistrement est refusé avec un message en français. Un rayon de plus de 200 km repris de l'ancien site n'est jamais ramené à 200 en silence : il est compté et listé à l'import, puis tranché (ticket 066). | plan 01 §3.3 P7.4 ; ticket 041 | `/auth/profil` |
| `photos-corbeille` | Une photo remplacée ou retirée, et les photos d'un compte supprimé, sont effacées du stockage (décision du 09/10/2026 ~18:50). | Elles partent à la corbeille du stockage (`deleted/`), avec leurs tailles dérivées : l'application n'efface jamais un objet, et une règle du stockage vide la corbeille au bout de 30 jours. Comme aujourd'hui, l'adresse publique de la photo ne répond plus. Si le stockage tombe pendant le déplacement, l'enregistrement est refusé et rien ne change. Pour que ce soit vrai partout, les photos et les profils se suppriment un par un : l'administration ne supprime plus plusieurs lignes à la fois dans ces deux listes. | plan 01 §1.8 ; ticket 045 | Aucune. |
| `photos-noms-imprevisibles` | Une photo envoyée garde son nom d'origine dans l'adresse de son fichier (`photo_<hash>.jpg`). | Une photo envoyée dans la v3 est rangée sous `media/<uuid>.<ext>` : le nom d'origine n'apparaît plus dans l'adresse. Les types (JPEG, PNG, WebP) et la limite de 10 Mo sont ceux de l'ancienne API, lus dans le contenu du fichier. Un refus de taille répond 400 et non 413. Les photos importées de l'ancien site gardent leur adresse. | plan 01 §6.1 ; ticket 133 | Aucune. |

## 4. Écarts au plan technique

Ces lignes s'écartent du plan technique, pas du site actuel. Aucune différence n'est attendue dans les pages.

| Repère | Le plan disait | La v3 fait | Source | Pages touchées |
|---|---|---|---|---|
| `emails-resend` | Les emails partent par Mailgun, en SMTP. | Les emails partent par Resend, en SMTP, depuis le domaine `send.my-makeup.fr`. Le site actuel envoie déjà par Resend depuis le 09/10/2026, et sa page `/politique-de-confidentialite` nomme déjà Resend. | décision du 09/10/2026 ; décision du 14/10/2026 ~01:15 (ticket 001) | Aucune. |
| `groupe-front` | Deux dossiers à la racine de `src/app/` : `(site)/` et `(espace)/auth/` (plan 01 §4.4). | Un groupe parent `(front)` les contient : `src/app/(front)/(site)/` et `src/app/(front)/(espace)/auth/`. Il n'y a qu'une coquille HTML : passer du site à l'espace ne recharge pas la page, comme aujourd'hui. Un nom entre parenthèses n'apparaît pas dans les adresses. | décision du 14/10/2026 ~02:10 (ticket 002) | Aucune : les adresses sont identiques. |
| `next-16-3` | Next 16.4.x. | Next 16.3.8. Payload 3.90.2 nomme ses erreurs par le nom de leur classe, et Next 16.4 raccourcit ces noms en production : les messages d'erreur de l'administration seraient perdus. La 16.4 reste bloquée tant qu'une version 3.x de Payload n'a pas le correctif. | décision du 14/10/2026 ~01:15 (ticket 001) | Aucune. |
