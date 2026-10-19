# Les sondes du site en ligne, en lecture seule

Une sonde lit le site en ligne comme une visiteuse anonyme, sans jamais rien y écrire. C'est la seule exception à la règle « rien vers le site en ligne » ([`CLAUDE.md`](../../CLAUDE.md), interdit 5) : tous les autres tests visent le banc local.

Les adresses du site ne changent pas avec la v3 (`src/lib/urls-gelees.ts`) : les mêmes sondes lisent aujourd'hui le site actuel, et la v3 après la bascule.

## Lancer

```sh
bun run sondes                                       # le site en ligne, https://my-makeup.fr
SONDES_CIBLE=http://localhost:3100 bun run sondes    # une autre cible : le banc, un domaine temporaire
SONDES_STATS_TOKEN=… bun run sondes                  # avec le jeton du service : R02 compare le sitemap aux profils publiables
SONDES_API=aucune bun run sondes                     # Strapi est arrêté : plus de partie Strapi dans R05
```

- `SONDES_CIBLE` est une origine seule : `https://` et un hôte, ou `http://` sur ce poste (`localhost`, `127.0.0.1`, `::1`). Un chemin, un paramètre ou un identifiant dans l'adresse est refusé.
- `SONDES_STATS_TOKEN` : le jeton de service de la route `/api/stats/weekly` (variable `STATS_TOKEN` de l'application). Sans lui, R02 dit « inconnu ». Il ne part que vers cette route, sur la cible, jamais ailleurs, et le rapport ne l'écrit jamais. Le workflow du lundi n'en a pas (aucun secret de prod) : R02 y reste « inconnu » tant qu'Andy ne lance pas les sondes à la main avec le jeton (voir « Le lancement du lundi »).
- `SONDES_API` : l'origine de l'API Strapi lue par R05. Par défaut `https://api.my-makeup.fr` quand la cible est le site en ligne, rien ailleurs. `aucune` retire la partie Strapi : à poser le jour où Strapi s'arrête, sinon la redirection de l'ancienne adresse de l'API la rend rouge.
- La commande ne lit aucun fichier `.env`. Les deux variables viennent de l'environnement du shell.
- Un lancement contre le banc fait 16 requêtes (7,7 s mesurées le 15/10/2026). Contre le site en ligne : autant sur le site, plus 3 sur l'API Strapi, 1 à 3 sur les registres de domaines (RDAP), et 5 poignées TLS sans requête.

| Code de sortie | Sens |
|---|---|
| 0 | Aucune sonde n'est rouge (certaines peuvent être « inconnu » : le rapport le dit, et ce n'est pas un vert) |
| 1 | Au moins une sonde est rouge, ou n'a pas été lancée |
| 2 | La cible est refusée : rien n'est parti |

Un verdict a quatre valeurs : **VERT** (vérifié), **ROUGE** (alerte), **INCONNU** (la sonde n'a pas pu regarder : pas de jeton, registre muet, cible locale pour les certificats), **NON LANCÉE** (une sonde précédente a arrêté le lancement). Seul le vert est un vert.

## Ce que vérifie chaque sonde

Les numéros sont ceux du plan de tests (02 §7.6).

| Sonde | Ce qu'elle vérifie | Requêtes |
|---|---|---|
| R01 | La garde interrompt toute requête autre qu'une lecture, et bloque la mesure d'audience. Elle se vérifie avant toute requête, sans réseau : si la garde laisse passer une seule requête interdite, rien d'autre ne tourne | Aucune |
| R02 | Les adresses de profil du sitemap sont exactement les profils publiables que donne `/api/stats/weekly` (`publiables.slugs`) : même nombre, mêmes adresses. Un écart est dit par des comptes et des empreintes. Sans jeton : INCONNU, sans aucune requête | 2 : le sitemap, les statistiques |
| R03 | 5 profils tirés au hasard dans `/sitemap.xml` répondent 200, avec un `h1` dans le HTML que le serveur envoie, et ni « undefined » ni « null » dans ce que la page montre | 6 : le sitemap, puis les 5 profils |
| R04 | Une adresse inconnue répond 404, à la racine et sous `/profil/` | 2 |
| R05 | L'accueil porte les cinq en-têtes de sécurité (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy-Report-Only`) et pas de `X-Powered-By`. `/api/admins`, `/api/pros` et `/api/auth-events` répondent 401 ou 403, `/api/stats/weekly` sans jeton 401, et les anciennes routes `/api/upload/files`, `/api/users` et `/documentation` 404. Tant que Strapi tourne, son API est lue aussi : `/api/upload/files` et `/api/users` en 403, `/documentation` en 404 | 8 sur le site, 3 sur l'API Strapi |
| R06 | Les certificats de la cible (et de `www`, de l'API Strapi pour le site réel), du domaine des photos et d'Umami restent valides 21 jours au moins ; les domaines enregistrés (`my-makeup.fr`, `andy-cinquin.fr`, `wadefade.fr`) 30 jours au moins, selon le registre public (RDAP). Une cible en `http` (le banc) : INCONNU | 1 poignée TLS par hôte, 1 GET par domaine |

Détails :

- **R03 lit le HTML du serveur, pas la page dans un navigateur.** Aucun script de la page ne s'exécute : un `h1` écrit par le navigateur seulement ne compte pas. Les mots « undefined » et « null » se cherchent comme mots entiers dans les textes, le titre, les attributs lus comme du texte (`alt`, `title`, `aria-label`, `placeholder`) et le contenu des balises `meta`. Les scripts, où les données de la page contiennent `null` à bon droit, ne sont pas lus.
- **Un profil répond 200 du premier coup.** Une redirection n'est jamais suivie : un profil du sitemap qui redirige est rouge.
- **R04 tire un nom nouveau à chaque lancement** (`/sonde-inexistante-…` et `/profil/sonde-inexistante-…`), pour qu'aucun cache ne réponde à la place du site. La table des URL gelées promet 404 pour ces deux familles, aujourd'hui et après la bascule.

R05 est celle de la v3. Contre le site actuel, ses en-têtes et ses listes sont rouges : c'est le constat, pas une panne de la sonde. Les cinq en-têtes ne sont pas posés sur une redirection de normalisation (« / » final) : R05 ne vise que des adresses sans « / » final.

R06 : la poignée TLS vérifie la chaîne et le nom, lit la date de fin du certificat et se ferme sans rien envoyer. C'est la seule connexion que les sondes ouvrent hors de la garde, et seul `tests/sondes/certificats.ts` le fait (un test le garde). Un certificat que la poignée refuse (échu, mauvais nom) est rouge. Un registre qui ne répond pas, ou qui ne donne pas de date de fin, rend le domaine « inconnu ». Les registres connus : `.fr` (AFNIC) et `.com` ; une autre extension est « inconnu ». Le seuil est « sous 21 jours » (certificat) et « sous 30 jours » (domaine) : exactement 21 jours est vert.

## La garde

Toute requête d'une sonde passe par `garder()` (`tests/sondes/garde.ts`). Elle laisse passer une lecture, et rien d'autre :

- **GET seulement.** Toute autre méthode est interrompue avant de quitter le poste.
- **Rien sous `/u`**, où le site relaie sa mesure d'audience (Umami : `/u/script.js`, `/u/api/send`). Une sonde n'est jamais comptée comme une visite.
- **Rien vers un autre hôte que la cible**, celui d'Umami compris.
- **Anonyme** : ni cookie ni en-tête `Authorization`. Une seule identité est permise, le jeton de service de R02, et seulement en `GET /api/stats/weekly` sur la cible, avec exactement la valeur de `SONDES_STATS_TOKEN`. R01 essaie ce jeton vers la page d'accueil, vers `/u`, avec un autre jeton et avec un cookie : tout est interrompu.
- **Aucune redirection suivie** : une redirection pourrait mener ailleurs, ou vers `/u`.

Une requête interdite pendant une sonde la rend rouge et arrête les suivantes : une sonde qui tente d'écrire est cassée, quoi qu'elle ait trouvé.

Les requêtes partent une à la fois, à 500 ms d'écart au moins entre deux départs, soit 2 par seconde au plus, le sitemap compris. Une page qui n'est pas revenue en entier au bout de 15 secondes est abandonnée. Chaque requête se présente sous le nom `my-makeup-sondes/1 (lecture seule)`, pour qu'on la reconnaisse dans les journaux du site.

## Lire le rapport

Le rapport s'affiche dans le terminal : une ligne par sonde (VERT, ROUGE ou NON LANCÉE), puis ce qu'elle a vu, puis le nombre de requêtes et l'écart le plus court entre deux d'entre elles.

**Le rapport n'écrit jamais l'adresse d'un profil** ([`CLAUDE.md`](../../CLAUDE.md), interdit 3). Un profil y est désigné par une empreinte : les 8 premiers chiffres du SHA-256 de son chemin. Par exemple, le profil fictif `/profil/zoe-lefevre` du banc s'écrit `profil #02d9dcb6`. Pour retrouver un profil rouge, calcule les empreintes du sitemap sur ton poste, sans rien recopier ailleurs :

```sh
curl -s https://my-makeup.fr/sitemap.xml | grep -o '/profil/[^<]*' | while read -r chemin; do echo "$(printf %s "$chemin" | sha256sum | cut -c1-8) $chemin"; done
```

## Les sondes et les tests

- Les sondes ne tournent pas sous `bun test` : là, aucune requête ne quitte le poste ([`http-sortant.md`](http-sortant.md)). Leur logique se teste dans `tests/unit/sondes.test.ts`, contre un site simulé et des profils fictifs : `bun --no-env-file test tests/unit/sondes.test.ts`.
- Elles ne passent pas par Playwright, et `tests/sondes/` ne contient aucun fichier `*.spec.ts` ni `*.test.ts`.
- **La garde des essais de bout en bout refuse toujours la prod** (U86, [`e2e.md`](e2e.md)). Les sondes ont leur propre garde et leur propre variable, `SONDES_CIBLE` : elles ne lisent ni `BASE_URL` ni `NEXT_PUBLIC_SITE_URL`, et n'assouplissent rien.

## Le banc

Pour rejouer les six sondes contre le banc (ticket 156) :

```sh
BANC_INSTANCE=mon-banc BANC_DECALAGE=20 bun run banc:complet       # dans un autre terminal, jusqu'à « Application prête »
SONDES_CIBLE=http://localhost:3120 bun run sondes                   # R03, R04, R05 vertes ; R02 et R06 inconnues
```

R02 demande un jeton : le banc ne règle pas `STATS_TOKEN`. Lance l'application construite avec un jeton factice (32 caractères au moins) dans son environnement, puis donne le même à `SONDES_STATS_TOKEN` : R02 est verte (« égalité exacte »).

## Le lancement du lundi

Le workflow `.github/workflows/sondes.yml` lance `bun run sondes` contre le site en ligne **chaque lundi à 07:00, heure de Paris** (le cron porte son fuseau : l'heure d'été ne le décale pas). Tu peux aussi le lancer à la main (« Run workflow »). Il écrit le rapport des sondes dans le résumé de l'exécution, et n'a **aucun secret de prod** : ni jeton, ni variable.

- **Une sonde rouge, ou non lancée, fait échouer l'exécution** (code de sortie 1). Rien ne l'adoucit : ni `continue-on-error`, ni `|| true`. Un test le garde et joue une sonde faussée exprès (`tests/unit/sondes-lundi-ci.test.ts`).
- **R02 reste « inconnu »** dans ce workflow, faute du jeton de service. Ce n'est pas un échec : l'exécution est verte (décision du ticket 157). Pour comparer le sitemap aux profils publiables, lance les sondes à la main avec `SONDES_STATS_TOKEN`.
- **Les planifications ne tournent que sur la branche par défaut** du dépôt, et GitHub les désactive après 60 jours sans activité dans un dépôt public. Tant que `main` porte l'ancien site, le lundi ne se déclenche pas : il commence à la bascule.
- Contre le site actuel, R05 est rouge par construction (voir plus haut) : l'exécution du lundi est rouge jusqu'à la bascule.

### Comment le rapport de 07:30 lit le résultat

Le rapport lit l'activité GitHub en lecture seule (`gh api --method GET`, source `github`). Le contrat avec ce workflow :

| Cas | Ce que le rapport écrit |
|---|---|
| Dernière exécution terminée du workflow `sondes.yml` en `success` | VERT |
| Dernière exécution terminée en `failure` (une sonde rouge ou non lancée, ou le job a échoué) | ROUGE : alerte |
| Aucune exécution, ou la dernière terminée date de 8 jours ou plus, ou elle est `cancelled` ou `skipped` | INCONNU : ni vert ni alerte de sonde, mais dit |
| Exécution en cours | Ignorée : on lit la dernière terminée |

Le compte des **lundis verts de suite** : en partant de la dernière exécution planifiée (`event=schedule`), on compte les exécutions `success` consécutives, une par lundi ; la première `failure` arrête le compte, et un lundi sans exécution aussi. Les lancements à la main n'entrent pas dans ce compte. Le critère de clôture est 4.

L'écriture de cette lecture dans l'outil du rapport (`plans/mesures/outil`) se fait hors de ce dépôt.
