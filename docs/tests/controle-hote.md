# Le contrôle d'un hôte, en lecture seule

Une commande lit, sur un hôte donné, toutes les adresses de l'inventaire gelé, le sitemap, le fichier robots, les anciennes routes d'authentification et le script de mesure, et écrit un rapport daté. C'est le contrôle du jour de la bascule et de sa répétition. Elle ne fait que des lectures : comme les sondes, c'est une exception à « rien vers le site en ligne » ([`CLAUDE.md`](../../CLAUDE.md), interdit 5), et elle a sa propre garde.

Les adresses et les réponses attendues sont celles de la table des URL gelées ([`../migration/URLS.md`](../migration/URLS.md), `src/lib/urls-gelees.ts`). La vérification est celle du test I45 ([`../../tests/outils/parite-urls.ts`](../../tests/outils/parite-urls.ts)) : le code que promet la table, la redirection en un saut, le même `h1` que l'ancien site (comparé par empreinte).

## Lancer

```sh
CONTROLE_HOTE_CIBLE=http://127.0.0.1:3100 bun run bascule:controle   # le banc, un build de ce poste
CONTROLE_HOTE_CIBLE=https://my-makeup.fr bun run bascule:controle     # le site, lectures seules
PREPROD_BASIC_AUTH_USER=… PREPROD_BASIC_AUTH_PASSWORD=… \
  CONTROLE_HOTE_CIBLE=https://preprod.my-makeup.fr bun run bascule:controle   # la préprod, voir ci-dessous
```

| Variable | Rôle |
|---|---|
| `CONTROLE_HOTE_CIBLE` | Obligatoire. Une origine seule : `https://` et un hôte, ou `http://` sur ce poste (`localhost`, `127.0.0.1`, `::1`). Un chemin, un paramètre ou un identifiant est refusé |
| `PREPROD_BASIC_AUTH_USER`, `PREPROD_BASIC_AUTH_PASSWORD` | L'accès protégé de la préprod : obligatoires pour `https://preprod.my-makeup.fr`, et inutilisés ailleurs. Ils ne partent que vers cet hôte, dans un seul en-tête, et ne s'écrivent jamais |
| `INDEXNOW_KEY` | Facultative. La clé IndexNow de l'hôte, pour lire son fichier de clé. Sans elle, cette adresse n'est pas lue et le rapport le dit |
| `CONTROLE_HOTE_SORTIE` | Facultative. Un fichier où écrire aussi le rapport, en JSON |

La commande ne lit aucun fichier `.env`.

| Code de sortie | Sens |
|---|---|
| 0 | Tout est conforme |
| 1 | Au moins une adresse n'est pas conforme, ou une réponse 5xx, ou l'hôte ne répond pas |
| 2 | La cible est refusée : rien n'est parti |

## Ce qu'elle lit

1. `/api/health`, pour la version servie.
2. `/sitemap.xml` : 200, du XML, un `urlset` complet, des adresses. Les profils, talents et articles qu'il liste sont ceux de l'hôte : chacun est lu.
3. **Chaque adresse de l'inventaire** et chaque exemple de la table (sauf les familles que l'hébergeur sert : `http`, `www`, ancienne API), plus chaque adresse du sitemap que l'inventaire ne nomme pas (200, un seul `h1`).
4. `/robots.txt` : 200, du texte brut, `User-agent`, la ligne `Sitemap` et l'API interdite.
5. Les anciennes routes d'authentification et l'ancien envoi du formulaire : `/api/auth/signin`, `/api/auth/signout`, `/api/auth/session`, `/api/auth/csrf`, `/api/auth/providers`, `/api/auth/callback/credentials`, `/api/auth/callback/google`, `/api/sendMail`. Toutes en 404.
6. `/u/script.js` : 200, du JavaScript, non vide. C'est le script de mesure, servi par le site lui-même.

Une redirection n'est jamais suivie : la première réponse est lue, puis sa destination une fois. Une adresse de la table qui promet un saut unique et qui en fait deux est un défaut.

**Écarts connus.** `//x` : Next répond lui-même par un 308 avant que le site ne lise l'adresse, au lieu du 301 de la table ([`../migration/URLS.md`](../migration/URLS.md)). Le rapport les compte à part (« écarts connus »), ils ne rendent pas le contrôle non conforme.

## La garde

Toute requête passe par `garder()` (`scripts/bascule/garde-hote.ts`), qui laisse passer une lecture et rien d'autre :

- **GET seulement, sans corps.** Toute autre méthode est interrompue avant de quitter le poste.
- **La cible seulement.** Une adresse s'écrit après l'origine telle quelle : `//x` est un chemin du site, jamais un autre hôte.
- **Sous `/u`**, où le site relaie sa mesure d'audience, quatre adresses seulement, en GET et sans paramètre : `/u`, `/u/script.js`, `/u/api/send`, `/u/autre-chemin`. Ce sont celles de l'inventaire. Un GET n'enregistre aucun événement (un événement est un POST) ; tout autre chemin sous `/u`, avec ou sans encodage, est interrompu.
- **Anonyme** : ni cookie, ni `Authorization` de l'appelant. La seule identité est l'accès protégé de la préprod, posé par la commande et envoyé à cet hôte seul.
- **Aucune redirection suivie.**

Une requête interdite arrête le contrôle : c'est un défaut de la commande, pas de l'hôte.

Les requêtes partent **une à la fois, à 500 ms d'écart au moins** entre deux départs : 2 par seconde au plus, comme les sondes (`tests/sondes/lecteur.ts`). Une page qui n'est pas revenue en entier au bout de 15 secondes est abandonnée. Chaque requête se présente sous le nom `my-makeup-controle-hote/1 (lecture seule)`.

La commande n'importe aucune dépendance installée par `bun install` : la CI la lance sans l'installer, à côté des secrets.

## Lire le rapport

Le rapport s'affiche dans le terminal : une ligne par partie (CONFORME ou NON CONFORME), puis ce qu'elle a vu en nombres et en empreintes, le nombre de requêtes, l'écart le plus court entre deux départs, l'empreinte de la liste des adresses et le verdict. L'en-tête porte la date et l'hôte.

- **Jamais l'adresse d'un profil** ([`CLAUDE.md`](../../CLAUDE.md), interdit 3). Un profil est désigné par `profil #xxxxxxxx`, les 8 premiers chiffres du SHA-256 de son chemin (voir [`sondes.md`](sondes.md) pour retrouver un profil sur son poste).
- Le sitemap, le fichier robots et le script de mesure ont chacun leur empreinte (8 chiffres du SHA-256 du corps) : deux contrôles successifs d'un hôte qui n'a pas changé donnent les mêmes.
- « Empreinte des adresses » résume l'état de toutes les adresses lues : elle change dès qu'une adresse change d'état.
- Une adresse cassée exprès (`/a-propos` en 500, une ancienne route qui répond, un script absent) rend la partie concernée NON CONFORME, la nomme et fait sortir la commande en 1 (`tests/unit/bascule-controle-hote.test.ts`).

## Les tests

- `tests/unit/bascule-controle-hote.test.ts` : la garde (écritures, `/u`, double barre, cookie, accès protégé), les réglages, la lecture du sitemap, un hôte simulé conforme et des hôtes cassés exprès, le rapport sans adresse de profil, le rythme de 2 requêtes par seconde avec une horloge simulée. `bun --no-env-file test tests/unit/bascule-controle-hote.test.ts`.
- `tests/e2e/controle-hote.spec.ts` (I45, U61 à U64) : la commande contre l'application du banc, avec des profils, un talent et un article d'essai dans le sitemap. Les familles dont les pages ne sont pas encore toutes construites dans le code (l'espace des maquilleuses, la page 404 d'un talent ou d'un article inconnu, qui n'a pas de `h1` dans le HTML du serveur) sont comptées « à venir » dans ce seul essai ; le jour de la bascule la commande n'en connaît aucune.
