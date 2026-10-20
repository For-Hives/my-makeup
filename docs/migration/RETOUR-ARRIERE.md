# Le retour arrière sans perdre de comptes

Ce document dit quoi faire si, après la bascule, on remet l'ancien site (ticket 234, `PLAN-PROD-DIRECT.md` §4.5). Le retour reste possible jusqu'à J+1 18:00 (ticket 193).

Le problème : dès l'échange des domaines, des maquilleuses s'inscrivent, modifient leur profil, envoient des photos et reçoivent des messages **sur la v3**. L'ancien site, lui, est gelé depuis avant l'échange et ne connaît rien de tout cela. L'export du delta liste ce qui a été écrit dans la v3 depuis la bascule, pour le rejouer à la main dans l'ancien site.

## Ce que l'export contient

Un fichier JSON, `my-makeup-delta-2` (le format 1 avait des clés françaises : `depuis`, `nombres`, `comptes`, `profils`, `comptesSupprimes`, `depuisLaBascule`, `cree` et `modifie` ; le format 2 donne les mêmes nombres sous les clés `since`, `counts`, `accounts`, `profiles`, `deletedAccounts`, `sinceCutover`, `created` et `updated`), avec `since` (l'instant de départ), `counts` (le nombre d'enregistrements de chaque rubrique) et cinq rubriques :

| Rubrique | Ce qu'elle liste | Champs gardés |
|---|---|---|
| `accounts` | Les comptes (`pros`) créés ou modifiés depuis la date | identifiant, email, nom, bloqué, adresse confirmée, dernière connexion, fournisseur d'origine, identifiant de l'ancien site, dates |
| `profiles` | Les profils créés ou modifiés | tous les champs du profil (aucun n'est secret) |
| `photos` | Les photos (`media`) envoyées ou modifiées | nom de fichier, type, taille, dimensions, texte alternatif, propriétaire, préfixe, dates |
| `messages` | Les messages du formulaire de contact reçus ou modifiés | tous les champs du message |
| `deletedAccounts` | Les comptes de l'ancien site supprimés dans la v3 depuis la date | l'identifiant de l'ancien site et le jour |

Les champs d'un enregistrement portent les noms anglais de la base (ticket 250) : `name`, `blocked` et `lastSignInAt` pour un compte ; `status`, `mailStatus`, `firstName`, `lastName` et `phone` pour un message, avec les valeurs `new`, `forwarded`, `answered`, `spam`, `pending`, `sent` et `failed` ; `firstName`, `lastName`, `artistName`, `specialty`, `city`, `radiusKm`, `homeService`, `available`, `networks`, `contactDetails`, `publicContact`, `mainPicture`, `gallery`, `status` (`draft`, `published`, `hidden`) pour un profil (ticket 251) ; ses listes sont `serviceOffers` (`name`, `description`, `priceText`, `priceFrom`, `options` avec `name`, `priceText` et `priceFrom`), `skills` et `languages` (`name`, `description`), `courses` (`diploma`, `school`, `graduatedAt`, `description`) et `experiences` (`company`, `jobTitle`, `city`, `startDate`, `endDate`, `description`) (ticket 252). À rejouer dans l'ancien site : `name` est son `username`, `blocked` son `blocked`. Pour les listes d'un profil, les noms de l'ancien site sont : `service_offers` pour `serviceOffers`, `price` pour `priceText` (`priceFrom` est calculé à partir de ce texte, il ne se rejoue pas), `job_name` pour `jobTitle`, `date_start` et `date_end` pour `startDate` et `endDate`, `date_graduation` pour `graduatedAt` et `course_description` pour la `description` d'une formation ; `skills`, `language`, `courses` et `experiences` gardent leurs noms.

Chaque enregistrement porte `sinceCutover` : `created` s'il a été créé après la date, `updated` s'il existait avant et a changé depuis.

**Jamais dans le fichier :** mot de passe, hash (le hash hérité de l'ancien site non plus), sel, jeton de confirmation ou de réinitialisation, identifiant de session. Les comptes et les photos sont choisis champ par champ (une liste blanche) ; tout enregistrement passe en plus par un filtre qui retire toute clé nommée comme un mot de passe, un hash, un sel, un jeton, un secret ou une session. Un test le vérifie (`tests/integration/bascule-delta.test.ts`).

**Ce que l'export ne voit pas :**

- une photo supprimée dans la v3 (par sa propriétaire, ou avec son profil) ne laisse aucune ligne : l'objet est déplacé sous `deleted/` dans le compartiment, c'est la seule trace ;
- un compte créé dans la v3 puis supprimé : l'ancien site ne l'a jamais connu, il n'a rien à rejouer ;
- une connexion seule (`lastSignInAt`) compte comme une modification du compte : un compte importé qui s'est seulement reconnecté apparaît avec `updated`. C'est du bruit, pas une perte.

Un enregistrement importé et jamais touché porte les dates de l'ancien site (l'import les réécrit), donc plus anciennes que la bascule : il n'est pas dans le fichier.

## Le lancer

C'est une adresse réservée aux admins du site, sans base ouverte sur Internet et sans accès SSH (même esprit que l'import dans le conteneur, ticket 233) :

1. Ouvre `https://my-makeup.fr/admin` et connecte-toi avec ton compte **admin** (pas la rédaction). Après un retour des domaines vers `https://v3.my-makeup.fr`, c'est là qu'il faut se connecter : le cookie est propre à chaque adresse.
2. Ouvre dans le même navigateur `https://my-makeup.fr/api/cutover/delta`. Le navigateur télécharge `delta-since-AAAA-MM-JJ.json`.
3. Pour une autre date de départ, ajoute `?since=` suivi d'un instant avec son fuseau : `/api/cutover/delta?since=2026-11-02T08:30:00Z`.

Par défaut, le début est le jour de `CUTOVER_DATE` à 00:00 UTC. **Donne plutôt l'instant précis de l'échange** (ou de la fin du dernier passage réel de l'import) si l'import ou des modifications de l'ancien site ont eu lieu ce jour-là avant l'échange : sinon ils apparaissent dans le fichier.

Réponses : 200 le fichier ; 401 pas de session ; 403 un compte qui n'est pas admin, ou une application qui n'est pas le site (poste de travail, banc de test : l'export ne tourne qu'en production, `APP_ENV=prod`, `NEXT_PUBLIC_SITE_URL=https://my-makeup.fr`) ; 400 sans `CUTOVER_DATE` ni `depuis`, ou un `depuis` illisible.

Deux lancements donnent exactement le même fichier tant que rien n'a changé dans la v3 : il ne porte aucune heure de génération.

**Le journal de l'application** garde une ligne par rubrique, préfixée `[bascule]` : les nombres et les identifiants numériques seulement, jamais un email, un nom ou un texte. Il sert de contrôle (« 3 comptes, 3 profils, 2 photos, 1 message »), pas de copie.

## Garder le fichier

Il porte des emails, des téléphones et des messages de visiteuses : c'est une donnée privée.

- Écris-le **hors du dépôt**, par exemple dans `~/my-makeup-prive/bascule/`, puis `chmod 600` ;
- ne le colle dans aucun message, ticket ni outil en ligne ;
- supprime-le quand le retour arrière n'est plus possible et que la décision de garder la v3 est prise.

## La marche à suivre

1. **Exporter d'abord**, pendant que la v3 répond encore : télécharge le fichier (ci-dessus) et note les nombres du journal. Le fichier est un instantané : si des maquilleuses écrivent encore dans la v3, refais-le à la fin de l'étape 2 et prends le second.
2. **Prod v3** : domaines ramenés à `https://v3.my-makeup.fr`, accès protégé remis, redéployer. Ou arrêter la v3 (alors `my-makeup.fr` répond 404 jusqu'à l'étape 3). Si tu arrêtes la v3 avant d'avoir exporté, l'export est perdu pour de bon : ne le fais jamais dans cet ordre.
3. **Ancien front** : domaines `https://my-makeup.fr,https://www.my-makeup.fr`, accès protégé coupé, `noindex_domains` vide, redéployer.
4. **Ancienne API** : retirer `LEGACY_READ_ONLY` (et `MEDIA_SWEEP=off` si tu l'avais posé) et redémarrer. Une minute. Les écritures sont de nouveau permises : c'est le moment de rejouer.
5. **Rejouer à la main dans l'ancien site**, d'après le fichier :
   - `deletedAccounts` : supprimer ces comptes dans l'ancien site (leur propriétaire a demandé à être oubliée) ;
   - `accounts` avec `created` : recréer le compte à l'identique (même email, même nom). Il n'y a **pas de mot de passe** dans le fichier : la maquilleuse passe par « Mot de passe oublié » de l'ancien site, et il faut que le mail parte. Dis-le-lui si tu la connais ;
   - `accounts` avec `updated` : reporter le changement (nom, blocage) sur le compte de même identifiant d'ancien site (`strapiId`) ;
   - `profiles` : recréer ou corriger le profil du compte (la clé `pro` est l'identifiant du compte dans la v3, à rapprocher de l'email dans `accounts`) ;
   - `photos` : le fichier d'une photo envoyée dans la v3 vit sous `media/<nom de fichier>` dans le compartiment partagé, mais l'ancien site ne la connaît pas : la renvoyer par le profil, ou ajouter la ligne dans son admin ;
   - `messages` : les relire, et répondre à celles qui attendent.
6. **Contrôler** : le compte des comptes de l'ancien site, l'accueil, un profil, la connexion d'un compte de test, la page de contact.

## Ce qu'il ne faut pas faire

- Ne jamais relancer l'import vers la v3 pour « resynchroniser » après le retour : l'ancien site a changé et la v3 aussi (garde du ticket 227, `--target-in-service`).
- Ne pas diffuser le fichier, ni le garder dans le dépôt, dans Coolify ou dans un ticket.

## Ce qui est testé

- `tests/unit/cutover-delta.test.ts` : refus hors du site, 401 et 403, 400, en-têtes, journal sans email, mêmes octets au second appel, filtre des secrets.
- `tests/integration/bascule-delta.test.ts`, sur le banc : un profil créé après la date apparaît, un profil importé et inchangé n'apparaît pas, un compte modifié apparaît en `updated`, aucune clé ni valeur de mot de passe, hash, sel ou session dans le fichier, et la route avec une vraie session admin, une session de maquilleuse et sans session.
