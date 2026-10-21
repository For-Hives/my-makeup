# La sonde continue : qui te prévient quand le site tombe

Une sonde lit le site toutes les 5 minutes, depuis un serveur de GitHub (donc **hors du serveur de Coolify**), et t'écrit après 2 échecs de suite. Elle répond à l'écart S4 / M2 de l'audit du 21/10/2026 : rien ne prévenait Andy si la v3 tombait.

Elle complète les sondes du lundi ([`sondes.md`](sondes.md)), qui vérifient le contenu une fois par semaine ; celle-ci ne vérifie que « le site répond », mais tout le temps.

## Le moyen choisi, et pourquoi

Un workflow GitHub planifié : [`.github/workflows/sonde-continue.yml`](../../.github/workflows/sonde-continue.yml), qui lance `bun run watch:site` (code : `scripts/watch/`). Il tourne sur un serveur de GitHub, sans aucun accès à Coolify, ne demande aucun service nouveau et n'écrit rien sur le site. Les secrets sont ceux du dépôt (« Settings » puis « Secrets and variables »), jamais dans les fichiers.

Écartés :

- **Un service externe gratuit** : il demande ton accord et un compte nouveau. À reprendre si le délai de GitHub (ci-dessous) se révèle trop long en pratique.
- **Uptime Kuma** (MES-13, plan 04) : il n'existe pas encore, et son serveur reste à poser. Si tu le poses un jour sur xenos, la sonde de GitHub devient le second filet.

**La limite à connaître :** GitHub lance les tâches planifiées « au mieux ». Aux heures chargées, un passage peut arriver avec plusieurs minutes de retard, voire sauter. Deux échecs de suite se lisent donc en 10 à 20 minutes dans le pire cas, contre 10 minutes en théorie : la promesse « alerte en moins de 15 minutes » tient en temps normal, pas garantie à la minute. Le critère se mesure (voir « Preuve de bout en bout ») ; s'il ne tient pas, le choix change.

## Ce qu'elle lit et ce qu'est un échec

Trois adresses de la cible, une à la fois, en GET, sans suivre de redirection :

1. `/api/health` ;
2. `/` (l'accueil) ;
3. un profil du sitemap, **choisi par empreinte** : celui dont l'empreinte (8 premiers caractères du SHA-256 de son chemin, la même que dans les sondes du lundi) est la plus petite. Le choix est stable d'un passage à l'autre. Tant que le sitemap ne contient aucun profil (la v3 avant l'import), cette lecture est ignorée et le journal le dit ; sitemap illisible = échec.

Un **échec** : un statut autre que 200 (une redirection en est un), une réponse qui dépasse 10 secondes, ou une santé sans version (`version` absente, vide ou `unknown`).

## Quand elle écrit

- **1 échec** : le passage devient rouge dans l'onglet Actions (GitHub t'écrit aussi pour chaque exécution rouge, comme second filet). Aucun message de la sonde.
- **2 échecs de suite** : **1 alerte** par email. Les échecs suivants n'en ajoutent pas.
- **Le premier passage sans échec après une alerte** : **1 message de fin**.

La sonde ne garde rien d'un passage à l'autre : le workflow lui passe les conclusions des 6 derniers passages terminés (`gh run list`), et le nombre d'échecs de suite se compte dessus. Une alerte qui n'a pas pu partir fait échouer le passage et s'écrit dans le journal (« ALERTE NON ENVOYÉE ») ; elle n'est pas rejouée. Un message de fin qui ne part pas ne fait pas échouer le passage.

## Les réglages (à poser par Andy)

| Nom | Où | Rôle |
|---|---|---|
| `WATCH_TARGET` | variable du dépôt | **La cible**, une origine : `https://v3.my-makeup.fr` avant l'échange, `https://my-makeup.fr` après. C'est le seul réglage qui change à la bascule (étape 9 de [`../migration/BASCULE.md`](../migration/BASCULE.md)). Absente : la sonde s'arrête (code 2) au lieu de choisir une cible |
| `WATCH_ACCESS_USER`, `WATCH_ACCESS_PASSWORD` | secrets | L'accès protégé de la v3 (Coolify). Envoyés dans l'en-tête `Authorization`, à la cible seulement. À retirer à l'étape 7 : sans eux, la sonde lit anonymement |
| `WATCH_RESEND_KEY` | secret | Une clé Resend **d'envoi seul, limitée au domaine** `send.my-makeup.fr` |
| `WATCH_ALERT_TO` | secret | L'adresse qui reçoit l'alerte |
| `WATCH_ALERT_FROM` | variable (facultative) | L'expéditeur, par défaut `Sonde My Makeup <sonde@send.my-makeup.fr>` |
| `WATCH_REF` | variable (facultative) | La branche dont le workflow lit le code, tant qu'il tourne depuis une copie sur `main` (voir ci-dessous) |

Les secrets ne s'écrivent dans aucun journal : le script écrit des statuts, des durées et des empreintes, jamais une adresse de profil ni l'accès protégé (test : `tests/unit/watch.test.ts`). Le jour où `my-makeup.fr` n'est plus protégé, retire les deux secrets d'accès.

## Où elle tourne (le point qui demande ton geste)

GitHub ne planifie un workflow que s'il est sur la **branche par défaut** du dépôt, aujourd'hui `main`, l'ancien site, qui reste intact jusqu'à la fusion (étape 16). Deux façons, à toi de choisir :

- **A. Une copie du fichier sur `main`**, avec la variable `WATCH_REF=v3` : le workflow lit alors le script de `v3`. Ça ajoute un fichier à l'historique de l'ancien site, ce que [`../migration/GEL.md`](../migration/GEL.md) ne prévoit pas : il te revient de l'autoriser. Retire `WATCH_REF` à la fusion de `v3` dans `main` (étape 16), où le fichier arrive de toute façon.
- **B. Passer la branche par défaut du dépôt à `v3`** (réglage GitHub, rien dans l'historique de `main`). Les pull requests de l'ancien site ciblent alors `v3` par défaut : à repasser sur `main` à l'étape 16.

Sans l'un des deux, la sonde ne tourne qu'à partir de l'étape 16, c'est-à-dire trop tard pour se rôder avant la bascule.

## Se rôder avant la bascule

1. `v3.my-makeup.fr` avec l'accès protégé : `WATCH_TARGET=https://v3.my-makeup.fr` et les deux secrets d'accès.
2. Puis l'ancien site, quelques jours : `WATCH_TARGET=https://my-makeup.fr`, tant qu'il y répond (sa santé est lue sur `/api/health`, avec la version de l'ancien site).
3. Après l'échange : `WATCH_TARGET=https://my-makeup.fr` pour la v3.

## Lancer à la main (essai local)

```sh
WATCH_TARGET=http://localhost:3477 bun run watch:site                       # une lecture, sans alerte
WATCH_TARGET=http://localhost:3477 WATCH_PREVIOUS=failure,success bun run watch:site   # joue le deuxième échec
```

`WATCH_PREVIOUS` est la liste des conclusions précédentes, la plus récente d'abord (`success` ou `failure`). Codes de sortie : 0 tout répond ; 1 une lecture a échoué (ou l'alerte n'est pas partie) ; 2 la cible est refusée, rien n'est parti (l'`http` n'est permis que sur ce poste).

## Preuve de bout en bout (à faire une fois, sans toucher la production)

Le code est testé sans réseau (`tests/unit/watch.test.ts` : 200, puis 503 deux fois, donne 1 alerte, le retour à 200 donne 1 message de fin). Le test réel demande les secrets, donc ton geste :

1. Pose `WATCH_RESEND_KEY` et `WATCH_ALERT_TO`.
2. Pose `WATCH_TARGET` sur une adresse qui répond 503 ou n'existe pas, par exemple `https://sonde-essai.my-makeup.fr` (nom inexistant : échec réseau) ; lance « Run workflow ».
3. Note ici l'heure du premier échec (journal du passage) et l'heure de l'email reçu. Critère : moins de 15 minutes.
4. Remets `WATCH_TARGET`.

| Mesure | Valeur |
|---|---|
| Heure du premier échec | à noter |
| Heure de réception de l'alerte | à noter |
| Écart | à noter (critère : moins de 15 min) |

## La disponibilité du rapport du lundi

Le rapport du lundi vit dans le dépôt des plans, hors de celui-ci : ce ticket ne le change pas. La donnée est prête à être lue : le taux de disponibilité de la semaine est la part de passages verts de ce workflow, par exemple

```sh
gh run list --workflow sonde-continue.yml --limit 2100 --json conclusion,createdAt \
  --jq '[.[] | select(.createdAt > (now - 604800 | todate))] | {passages: length, verts: map(select(.conclusion=="success")) | length}'
```

(2 016 passages par semaine à 5 minutes). Les passages sautés par GitHub ne comptent ni en vert ni en rouge : le rapport doit afficher le nombre de passages à côté du taux.
