# Les sondes du site en ligne, en lecture seule

Une sonde lit le site en ligne comme une visiteuse anonyme, sans jamais rien y écrire. C'est la seule exception à la règle « rien vers le site en ligne » ([`CLAUDE.md`](../../CLAUDE.md), interdit 5) : tous les autres tests visent le banc local.

Les adresses du site ne changent pas avec la v3 (`src/lib/urls-gelees.ts`) : les mêmes sondes lisent aujourd'hui le site actuel, et la v3 après la bascule.

## Lancer

```sh
bun run sondes                                       # le site en ligne, https://my-makeup.fr
SONDES_CIBLE=http://localhost:3100 bun run sondes    # une autre cible : le banc, un domaine temporaire
```

- `SONDES_CIBLE` est une origine seule : `https://` et un hôte, ou `http://` sur ce poste (`localhost`, `127.0.0.1`, `::1`). Un chemin, un paramètre ou un identifiant dans l'adresse est refusé.
- La commande ne lit aucun fichier `.env` et ne demande aucun secret.
- Un lancement fait 8 requêtes et dure environ 4 secondes. Mesuré le 14/10/2026 contre le site actuel : 8 requêtes GET en 3,6 s, toutes les sondes vertes.

| Code de sortie | Sens |
|---|---|
| 0 | Toutes les sondes sont vertes |
| 1 | Au moins une sonde est rouge, ou n'a pas été lancée |
| 2 | La cible est refusée : rien n'est parti |

## Ce que vérifie chaque sonde

Les numéros sont ceux du plan de tests (02 §7.6).

| Sonde | Ce qu'elle vérifie | Requêtes |
|---|---|---|
| R01 | La garde interrompt toute requête autre qu'une lecture, et bloque la mesure d'audience. Elle se vérifie avant toute requête, sans réseau : si la garde laisse passer une seule requête interdite, rien d'autre ne tourne | Aucune |
| R03 | 5 profils tirés au hasard dans `/sitemap.xml` répondent 200, avec un `h1` dans le HTML que le serveur envoie, et ni « undefined » ni « null » dans ce que la page montre | 6 : le sitemap, puis les 5 profils |
| R04 | Une adresse inconnue répond 404, à la racine et sous `/profil/` | 2 |

Détails :

- **R03 lit le HTML du serveur, pas la page dans un navigateur.** Aucun script de la page ne s'exécute : un `h1` écrit par le navigateur seulement ne compte pas. Les mots « undefined » et « null » se cherchent comme mots entiers dans les textes, le titre, les attributs lus comme du texte (`alt`, `title`, `aria-label`, `placeholder`) et le contenu des balises `meta`. Les scripts, où les données de la page contiennent `null` à bon droit, ne sont pas lus.
- **Un profil répond 200 du premier coup.** Une redirection n'est jamais suivie : un profil du sitemap qui redirige est rouge.
- **R04 tire un nom nouveau à chaque lancement** (`/sonde-inexistante-…` et `/profil/sonde-inexistante-…`), pour qu'aucun cache ne réponde à la place du site. La table des URL gelées promet 404 pour ces deux familles, aujourd'hui et après la bascule.

## La garde

Toute requête d'une sonde passe par `garder()` (`tests/sondes/garde.ts`). Elle laisse passer une lecture, et rien d'autre :

- **GET seulement.** Toute autre méthode est interrompue avant de quitter le poste.
- **Rien sous `/u`**, où le site relaie sa mesure d'audience (Umami : `/u/script.js`, `/u/api/send`). Une sonde n'est jamais comptée comme une visite.
- **Rien vers un autre hôte que la cible**, celui d'Umami compris.
- **Anonyme** : ni cookie ni en-tête `Authorization`.
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

## Ce qui vient ensuite

- R02 (le sitemap contre les profils publiables), R05 (en-têtes de sécurité, routes fermées) et R06 (certificats et domaines) : ticket 156, qui rejoue aussi R03 et R04 contre le banc.
- Le lancement automatique du lundi et sa lecture par le rapport de la semaine : ticket 157.
