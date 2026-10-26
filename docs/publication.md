# Notes de version et publication

Chaque changement qu'une visiteuse ou une maquilleuse peut remarquer a sa note de version : une phrase en français, écrite dans le même commit que le changement. Les notes attendent dans un journal jusqu'à la publication suivante, qui leur donne un numéro et déploie la prod.

- Le journal : [`src/content/changelog.json`](../src/content/changelog.json). Une page « Nouveautés » le lira pour les maquilleuses.
- Le fichier de version : `.release/version.json`, écrit par la publication seule. Coolify le surveille pour déployer la prod.
- Le workflow : [`.github/workflows/release.yml`](../.github/workflows/release.yml).

## Écrire une note

Quand ton changement se remarque par rapport au site en ligne :

```sh
bun run notes:add ajout "Tu peux ajouter une vidéo à ta galerie."
```

Le premier mot est le type de la note :

| Type | Ce qu'une page affiche devant | Pour |
|---|---|---|
| `ajout` | Nouveau | Ce que la personne peut faire et ne pouvait pas faire |
| `amelioration` | Amélioré | Ce qui marche mieux pour elle |
| `correction` | Corrigé | Un défaut du site en ligne qui disparaît |

La commande range la note à la fin de `pending`, avec un identifiant tiré de la phrase, puis tu la commites avec ton changement. Une page reprise à l'identique ne demande pas de note.

La phrase dit ce que la personne peut faire, ou ce qui s'améliore pour elle. Elle tutoie la maquilleuse, comme son espace ; elle vouvoie la visiteuse, comme les pages publiques. La commande refuse, et dit pourquoi :

- une phrase vide, de plus de 280 caractères, sans majuscule au début ou sans point à la fin ;
- un nom de fichier, un dossier du dépôt ou du code entre accents graves ;
- un mot de technicien : `commit`, `API`, `Payload`… (la liste est dans `src/lib/release-notes.ts`) ;
- une adresse email ou un numéro de téléphone : aucune donnée personnelle.

Les tests unitaires relisent tout le journal avec la même règle : une note fautive, même écrite à la main, fait échouer la CI de sa pull request.

## Publier à blanc

```sh
bun run release:publish --dry-run
```

Elle montre ce que ferait la prochaine publication du commit extrait : le numéro, les notes qui passeraient dessous, le contenu de `.release/version.json`. Elle n'écrit rien. Le numéro qu'elle annonce se fonde sur les étiquettes connues de ton clone ; le vrai se décide à la publication, d'après celles du dépôt GitHub.

## La publication

Personne ne publie à la main. Le workflow `release.yml` publie quand la CI d'une poussée sur `main` a fini en vert :

1. Il démarre à la fin du workflow `CI` (`workflow_run`), seulement si la CI a réussi, pour une poussée (jamais une pull request) faite sur ce dépôt (jamais une copie), et jamais pour un commit qui est lui-même une publication (son message commence par `chore(release):`) : une version ne publie jamais une version, quel que soit le jeton qui l'a poussée.
2. Il extrait le commit dont la CI est verte, et lui seul.
3. Il relit sur GitHub le check `ci-ok` de ce commit, celui qu'exige la protection de la branche (`ci/required-checks.json`). S'il n'a pas réussi, rien n'est publié et le job est rouge.
4. Il réserve le numéro suivant, range les notes en attente dessous, écrit `.release/version.json`, commite les deux fichiers au nom de `github-actions[bot]` et pose l'étiquette `vX.Y.Z` sur ce commit.
5. Il pousse le commit et l'étiquette en une seule fois.
6. Un second job, `deployment`, attend que la prod serve ce commit (voir « Le déploiement vérifié »).

Le job ne lance aucun `bun install` : aucun code d'une dépendance ne tourne à côté du jeton qui pousse sur `main`. Le script n'importe que des modules de bun et des fichiers du dépôt, et un garde-fou le vérifie.

Les cas où il ne publie pas, sans erreur :

| Cas | Ce qu'il dit | Pourquoi |
|---|---|---|
| `main` a avancé depuis le commit de la CI | « dépassée » | Le commit plus récent publiera à la fin de sa propre CI, notes comprises. Aucun numéro n'est pris |
| Le job est relancé après avoir publié | « déjà publiée » | La tête de `main` est sa publication : aucun second numéro |

Une poussée refusée pour une autre raison (la protection de la branche, un jeton sans droit) rend le job rouge, avec le message de GitHub.

Une version sans note se publie quand même : elle déploie un correctif invisible ou une mise à jour. Elle prend un numéro et écrit `.release/version.json`, mais n'ajoute rien au journal : une publication technique n'invente pas de nouveauté.

### Le numéro

- Le premier est la version de `package.json` : `3.0.0`.
- Ensuite, le correctif suivant le plus haut numéro déjà pris : `3.0.1`, `3.0.2`…
- Pour ouvrir une nouvelle ligne, monte `version` dans `package.json` (`3.1.0`) : la publication suivante prend ce numéro, s'il n'est pas déjà dépassé.

Un numéro pris, c'est une étiquette `vX.Y.Z` du dépôt GitHub, le numéro de `.release/version.json` ou une version du journal. Les étiquettes de l'ancien site (`v0.4.3` à `v1.0.6`) sont toutes sous `3.0.0`.

### Pourquoi jamais deux fois le même numéro

- Le numéro suit chaque numéro déjà pris, lu sur le dépôt GitHub au moment de publier.
- La poussée est atomique et jamais forcée : la branche n'avance que depuis le commit où la publication a commencé, et une étiquette qui existe n'est jamais remplacée. Si une autre publication est passée avant, les deux refus tombent ensemble : rien n'est pris, et celle-ci se dit « dépassée ».
- Une seule publication tourne à la fois (`concurrency`), et aucune n'est coupée en route. GitHub peut remplacer une publication en attente par une plus récente : celle-ci publie tout, notes comprises.

`tests/unit/publication.test.ts` joue ces cas pour de vrai, sur des dépôts git créés dans un dossier temporaire : deux publications à la suite, deux publications lancées du même état, un numéro pris par une étiquette seule, un passage relancé, un commit dépassé, une poussée refusée par la branche.

## Ce que Coolify surveille

L'application de prod suit la branche `main`, avec `/.release/version.json` dans ses Watch Paths (plan 01 §4.9) : une poussée sur `main` ne déploie que si elle change ce fichier, et seule la publication l'écrit. Ne le modifie jamais à la main.

Réglages relevés et posés le 26/10/2026, Coolify 4.5.0 (du 23 au 26/10/2026, le déploiement automatique était resté coupé depuis la mise en place : chaque déploiement a été lancé à la main) :

- **Déploiement automatique actif, sur ce seul fichier.** À chaque poussée sur `main`, GitHub prévient Coolify (application GitHub) ; Coolify compare les fichiers changés entre l'avant et l'après de la poussée et ne déploie que si `.release/version.json` en fait partie (il retire de lui-même la barre du début). Une fusion ne touche jamais ce fichier : une version, un déploiement ; une fusion seule, aucun.
- **Pas de boucle.** La publication pousse avec le jeton du workflow, et une poussée faite avec ce jeton ne lance aucun workflow : la CI ne repart pas sur le commit de publication. L'étiquette `vX.Y.Z` n'est pas une branche : Coolify l'ignore. Un déploiement ne pousse rien.
- **Un mauvais déploiement garde l'ancien site.** Coolify démarre la nouvelle version à côté de l'ancienne et attend le `HEALTHCHECK` du `Dockerfile` (`/api/health`) ; si elle n'est pas saine, il la retire, l'ancienne reste en ligne et le déploiement est en échec. Le contrôle de santé de Coolify lui-même reste coupé : il appelle `curl` ou `wget`, absents de l'image, et Coolify lit alors celui du `Dockerfile`.
- **Aucun déploiement de prévisualisation** des pull requests : il tournerait avec les variables de la prod.
- **Sauvegardes de la base**, sur le serveur : toutes les heures (48 gardées, deux jours) et chaque nuit (14 gardées, 30 jours), avec une alerte après un jour sans sauvegarde de nuit. Elles remplacent la sauvegarde faite à la main avant chaque déploiement.
- **Savoir d'où vient un déploiement** : `coolify-api GET "/deployments/applications/<uuid de l'application>?take=3"` ; `is_webhook: true` pour un déploiement venu de GitHub, `is_api: true` pour un déploiement lancé à la main.

## Le déploiement vérifié

Coolify déploie quand GitHub le prévient, et GitHub ne renvoie jamais un message perdu ; Coolify garde aussi l'ancienne version quand la nouvelle n'est pas saine. Dans ces deux cas la version est publiée et la prod ne la sert pas. Le job `deployment` de `release.yml` le voit :

- il démarre après la publication, quand elle a donné un commit de version (« publiée » ou « déjà publiée » ; rien quand elle est « dépassée », la plus récente vérifiera) ;
- il lit `https://my-makeup.fr/api/health` toutes les 20 secondes, jusqu'à ce que sa `version` soit le sha court du commit de version (`bun run release:check-deployment`, `scripts/release/deployment-check.ts`) ;
- il est vert dès qu'elle l'est, rouge au bout de 20 minutes, en disant ce que la prod sert encore ou pourquoi elle ne répond pas. GitHub prévient d'un workflow rouge par courriel.

Il n'a que la lecture du dépôt, aucun jeton ni secret dans son environnement, et n'installe rien : le script n'importe que des modules de bun (garde-fous de `tests/ci/publication.test.ts`). Il tient le groupe `publication` pendant qu'il attend : la publication suivante part après lui, et ne peut pas le doubler. Le groupe garde toutes les publications en attente, dans l'ordre (`queue: max`) : avec la file d'une seule de GitHub, une exécution mise en file derrière annulerait sans bruit celle qui attend (la relance d'une ancienne CI, une pull request d'une copie dont la branche s'appelle `main`).

Quand il est rouge : le journal du déploiement dans Coolify dit pourquoi (pas de déploiement : le message de GitHub s'est perdu ; « New container is not healthy » : la nouvelle version ne démarre pas). Pour relancer, déploie depuis Coolify ou par `coolify-api POST "/deploy?uuid=<uuid de l'application>"` ; ne renvoie pas le message de GitHub une fois le déploiement passé, Coolify le referait.

## Les réglages de GitHub

- **Une règle sur `main`, à poser** (ruleset « main ») : pull request obligatoire, conversations résolues, check `ci-ok` réussi sur une branche à jour, fusion par squash, ni poussée forcée ni suppression. Seule l'application « GitHub Actions » passe outre, pour la poussée de la publication : le commit de publication n'a pas de pull request et aucune CI ne tourne sur lui. Depuis le 24/10/2026, `main` n'a aucune protection : la protection classique refusait la publication (« GH006 »), elle a été retirée. La règle attend l'accord du mainteneur, parce qu'elle donne à GitHub Actions le droit de passer outre ; la première publication qui suit sa pose dit si l'exemption suffit (job rouge sur « GH006 » sinon).
- **Fusion par squash seulement** (réglé le 26/10/2026) : chaque pull request devient un seul commit sur `main`, qui ne contient que son changement. Avec une fusion classique, la poussée contient aussi les commits « Merge origin/main into … » de la branche ; quand la comparaison de GitHub échoue ou dépasse 300 fichiers, Coolify lit la liste de ces commits, y trouve `.release/version.json`, et déploierait la fusion avant que sa CI ait tourné.
- **L'étape « Version file untouched »** du job `qualite` : une pull request ou une poussée qui change `.release/version.json` est rouge. Seule la publication l'écrit, et Coolify déploie dès qu'il change.

## Avant la bascule

- **Rien ne se publie avant la fusion de `v3` dans `main`.** GitHub ne lance un workflow `workflow_run` que depuis la branche par défaut, qui porte encore l'ancien site.
- **La protection de `main` doit laisser passer la publication.** Le commit de publication est poussé par le jeton du workflow, sans pull request : une protection qui exige `ci-ok` sur chaque poussée le refuse, et le job est rouge. La protection classique la refusait : elle a été retirée le 24/10/2026, et la règle qui la remplace en exemptant « GitHub Actions » reste à poser (voir « Les réglages de GitHub »).
- **Coolify** : Watch Paths `/.release/version.json` sur l'application de prod, et le déploiement automatique rétabli (fait le 26/10/2026, voir « Ce que Coolify surveille »).

## Les garde-fous

| Test | Ce qu'il vérifie |
|---|---|
| `bun --no-env-file test tests/unit/release-notes.test.ts` | La règle d'une note, la forme du journal, et le journal du dépôt lui-même |
| `bun --no-env-file test tests/unit/publication.test.ts` | Le numéro, la publication à blanc, la publication sur de vrais dépôts git, la lecture de `ci-ok` |
| `bun --no-env-file test tests/ci/publication.test.ts` | Le workflow : C01 à C03, la dépendance à `ci-ok`, jamais une publication d'une publication, une seule commande par job, aucun `bun install`, les permissions, le job `deployment` en lecture seule, l'étape « Version file untouched » |
| `bun --no-env-file test tests/unit/deployment-check.test.ts` | L'attente du déploiement : la version lue, vert dès qu'elle est servie, rouge au bout du délai avec la raison |
