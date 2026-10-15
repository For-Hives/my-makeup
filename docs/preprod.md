# La préprod de la v3

La préprod est la v3 en ligne, fermée au public : `https://preprod.my-makeup.fr`. Coolify la construit avec le `Dockerfile` du dépôt et la redéploie à chaque poussée sur `v3`. Elle est derrière un accès protégé (HTTP Basic), porte la consigne `noindex` et n'envoie aucun mail. Sa base est à elle, non publique, et ne reçoit que des données fictives. Depuis la migration `init` (ticket 049), son schéma vient de cette seule migration, puis des migrations qui la suivront : elle ne repart d'une base vide que par une remise à zéro.

Ce document dit ce que fait la préprod quand elle démarre (tickets 027 et 053), comment la remettre à zéro, et comment la CI la contrôle.

## Ce qu'elle fait au démarrage

La première requête qui arrive après un démarrage (le contrôle de santé de l'image, une visite) démarre Payload. Sur la préprod seulement, dans cet ordre :

1. **Remise à zéro**, si `PREPROD_REMISE_A_ZERO` porte un jeton nouveau (voir plus bas). Elle a lieu quand Payload se connecte à sa base, **avant** qu'il joue ses migrations.
2. **Migrations** : Payload joue celles de `src/migrations/` qui manquent à la base, comme partout en production. Une migration qui échoue arrête l'application.
3. **Base déjà remplie ?** Si l'une des collections qu'écrit le jeu (`pros`, `media`, `profils`, `talents`, `articles`) contient un document, rien d'autre ne se passe : la base est gardée telle quelle. Un compte admin seul ne compte pas.
4. **Base vide** : l'application charge le **jeu fictif du banc de test** ([`tests/banc.md`](tests/banc.md), « Le banc complet ») : les 12 profils types avec leur maquilleuse fictive et leurs photos, 3 talents et 3 articles dont un brouillon. Ce chargement a remplacé l'import de la fausse base Strapi que faisait la première tranche. Il ne crée **aucun compte d'administration** : le premier admin se crée par `bun run admin:creer` (README, « Créer un compte admin »), l'écran du premier compte de `/admin` étant fermé.
5. Le profil fictif de Zoé Lefèvre (le type 9, l'ancien nom accentué) est alors en ligne : `https://preprod.my-makeup.fr/profil/zoe-lefevre`, son nom en titre.

Il faut deux choses dans Coolify, en variables d'exécution (jamais « Build Variable »), pour que ce chargement ait lieu et soit complet :

| Variable | Pourquoi |
|---|---|
| `APP_ENV=preprod` | Sans elle, le démarrage ne charge rien et le dit dans le journal. C'est la deuxième clé de la garde du jeu, avec l'adresse de la préprod. Elle est refusée ailleurs que sur la préprod : l'application ne démarre pas |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Le stockage d'objets des photos, dans un espace **à part** de celui du site (plan `01` §4.9). Sans eux, les 12 profils sont chargés **sans photo** : ils sont tous dans l'administration et la page du profil fictif répond (le contrôle de la CI est vert), mais, faute de photo principale, aucun n'est actif ni publiable au sens de la règle, et les états que le banc promet ne tiennent pas. Le jeu ne repasse pas sur une base déjà remplie : après avoir réglé le stockage, il faut un jeton nouveau de `PREPROD_REMISE_A_ZERO` |

Ce qui est garanti :

- **Jamais ailleurs que sur la préprod.** La préprod est un build de production servi depuis `https://preprod.my-makeup.fr` (`NEXT_PUBLIC_SITE_URL`). Sur le site, sur un poste, dans les tests ou pendant `next build`, rien ne se passe ; la tâche appelée hors de la préprod refuse avant de rien lire (test ciblé : `tests/unit/preprod.test.ts`). Le jeu a de plus sa propre garde, qui refuse `APP_ENV=prod` et l'adresse du site en ligne (`src/jeu-fictif/garde.ts`).
- **Sur la base de la préprod seulement.** Le chargement vérifie d'abord que `DATABASE_URI` mène bien à la base de la préprod, `mymakeup_preprod` (ticket 011). Sur toute autre base, une application de préprod mal réglée par exemple, il n'écrit rien et l'écrit dans le journal.
- **Une seule fois.** Un second démarrage trouve la base remplie et ne crée rien. Un chargement coupé en route laisse une base que le démarrage suivant ne complète pas : un jeton nouveau de `PREPROD_REMISE_A_ZERO` repart d'une base vide.
- **Aucune donnée réelle.** Le jeu est entièrement fictif : noms inventés, adresses en `@example.test`, téléphones de la plage réservée à la fiction, photos tirées des illustrations de maquette.
- **L'application sert toujours.** Une erreur du démarrage est écrite dans le journal par son type et son code, jamais par son texte, et le site continue de répondre. Le contrôle de la CI trouve alors la page du profil fictif absente.
- **Un processus qui migre ne fait rien** : `payload migrate`, ou la commande de l'import, qui posent `PAYLOAD_MIGRATING`.

Le code : `src/preprod/au-demarrage.ts` (branché dans `src/payload.config.ts` : la remise autour de la connexion de l'adaptateur de base, le chargement dans le crochet `onInit` de Payload), `src/preprod/remise.ts` (la remise) et `src/preprod/jeu.ts` (le chargement). Le jeu : `src/jeu-fictif/`. Les photos du jeu sont lues sur le disque, dans `src/jeu-fictif/photos/` : `next.config.ts` (`outputFileTracingIncludes`) les garde dans la sortie autonome de l'image. L'ancien import de démarrage (`src/preprod/tranche.ts`, `scripts/migration/import/source-pg.ts`) n'est plus lancé au démarrage ; il reste, et ses tests avec, pour l'import que le ticket 183 lancera dans le conteneur déployé. `.dockerignore` laisse encore entrer les fichiers de l'import et de la fausse source pour lui.

## Le journal de démarrage

Chaque ligne commence par `[preprod]`. Elles se lisent dans l'onglet « Logs » de l'application dans Coolify, ou par son API (`GET /api/v1/applications/<uuid>/logs`). Elles ne portent que des nombres : ni nom, ni email, ni hash. Sur une base vide, avec `APP_ENV=preprod` et son stockage :

```text
[preprod] Base vide (pros 0, media 0, profils 0, talents 0, articles 0) : le jeu fictif est chargé.
[preprod] Jeu fictif chargé : 12 profils types, 3 talents, 3 articles (pros 12, media 36, profils 12, talents 3, articles 3).
```

Sans stockage d'objets, une ligne s'ajoute avant la dernière : `Aucun stockage d’objets (S3_ENDPOINT) : les profils sont chargés sans leurs photos.` Sans `APP_ENV=preprod`, le démarrage dit : `APP_ENV n’est pas « preprod » : le jeu fictif n’est pas chargé. Pose APP_ENV=preprod dans Coolify.`

Aux démarrages suivants, une seule ligne : `Base déjà remplie (pros 12, media 36, profils 12, talents 3, articles 3) : pas de jeu fictif au démarrage.`

## Remettre la préprod à zéro

La remise à zéro efface **toute** la base de la préprod (les comptes admin compris) et sa fausse source, laisse Payload jouer ses migrations sur une base vide, puis le démarrage recharge le jeu fictif. Elle sert à repartir de rien : après un changement de migration qui ne s'applique pas sur l'ancienne base (la migration `init` du ticket 049), après un chargement interrompu, après avoir réglé le stockage des photos, ou pour passer de l'ancien import de démarrage au jeu fictif (ticket 053) : une préprod que l'import de la première tranche a remplie est « déjà remplie », et ne reçoit le jeu qu'avec un jeton nouveau.

Elle a lieu quand Payload se connecte, **avant** ses migrations. C'est ce qui la rend utile pour une migration que l'ancienne base ne prend pas : sans remise, Payload arrête l'application sur la première table qui existe déjà, avant tout autre code.

1. Dans Coolify, sur l'application de préprod, poser la variable `PREPROD_REMISE_A_ZERO` avec un jeton nouveau : 8 à 64 caractères, minuscules, chiffres et tirets, par exemple la date, `2026-10-15-matin`. Variable d'exécution seulement : jamais « Build Variable ».
2. Redéployer (ou redémarrer) l'application.
3. Lire le journal : `Remise à zéro « 2026-10-15-matin » faite : … migrations rejouées sur une base vide.`, puis le chargement du jeu.

**Pour la migration `init` du ticket 049** : la base de la préprod a joué les migrations provisoires (`20261014_010035_socle_provisoire` et les suivantes), que `init` remplace. `init` ne s'applique pas sur cette base : elle crée des tables qui y existent déjà. Poser un jeton nouveau **avant** que la poussée sur `v3` qui apporte `init` soit déployée, ou au plus tard avec elle. Si ce déploiement est déjà parti sans jeton, l'application s'arrête au démarrage (`Error running migration 2026…_init` dans le journal) : poser le jeton, puis redéployer. Au démarrage suivant, la base est vidée avant que Payload joue `init` sur une base vide, et le journal dit : `Remise à zéro « … » faite : 1 migration rejouée sur une base vide.` Puis le contrôle de la CI (`preprod.yml`) relit la page du profil fictif.

Gardes :

- **Une fois par jeton.** Le jeton est écrit sur le schéma de la base, dans la même transaction qui le vide. Un redémarrage avec le même jeton n'efface rien (`Remise à zéro « … » déjà faite : rien n’est effacé.`). La variable peut donc rester posée ; un jeton nouveau refait une remise.
- **Refusée hors de la préprod.** Posée sur le site, sur un poste ou dans un build qui n'est pas celui de la préprod, la variable arrête l'application au démarrage, avant toute connexion (README, « Variables d'environnement »). Un jeton mal formé aussi.
- **Sur la base `mymakeup_preprod` seulement.** Sur une autre base, rien n'est effacé : `Remise à zéro « … » non faite, la base est gardée.`, suivi de la raison. L'application démarre ensuite sur la base telle qu'elle est.
- Sans migration à rejouer, la remise est refusée avant d'effacer quoi que ce soit.
- Une erreur pendant la remise est écrite dans le journal par son type et son code, et l'application démarre sur la base telle qu'elle est.
- Le premier compte admin est à recréer après une remise, par `bun run admin:creer` depuis un poste, par une ouverture temporaire de la base (README, « Créer un compte admin », dernière puce) : l'écran du premier compte de `/admin` est fermé. **Avant que cette version arrive sur la préprod**, il faut donc que le premier admin existe déjà, sinon `/admin` n'offre plus aucun moyen d'en créer un.

## Relancer l'import

Depuis le ticket 053, le démarrage de la préprod n'importe plus la fausse source Strapi : il charge le jeu fictif, une seule fois, sur une base vide. Le code de l'ancien import de démarrage (`src/preprod/tranche.ts`, `scripts/migration/import/source-pg.ts`) reste dans le dépôt, avec ses tests : c'est celui que le ticket 183 reprendra pour lancer l'import complet dans le conteneur déployé, par un geste dans Coolify. En attendant, il n'existe aucun geste qui lance un import sur la préprod. Sur un poste, l'import se lance contre le banc de test (`bun run banc:import`, [`migration/IMPORT.md`](migration/IMPORT.md)), jamais contre la base de la préprod. Le lancement de l'import à la demande (`bun run migration:import`, `bun run banc:import`) n'a pas changé.

## Le contrôle de la CI

`.github/workflows/preprod.yml` tourne à chaque poussée sur `v3`, et à la main (« Run workflow »). Il attend que la préprod serve le commit poussé (la `version` de `/api/health`, 20 minutes au plus), puis lit la page du profil fictif : 200, et « Zoé Lefèvre » dans le seul `h1` du HTML du serveur. Ce n'est pas un check requis : rouge, il dit que la préprod est en retard ou cassée, sans bloquer aucune fusion.

Il lit deux secrets du dépôt, à poser par Andy dans GitHub (Settings › Secrets and variables › Actions) : `PREPROD_BASIC_AUTH_USER` et `PREPROD_BASIC_AUTH_PASSWORD`, l'accès protégé de la préprod. Tant qu'ils ne sont pas posés, le job ne contrôle rien et reste vert : sa première étape le dit par un avertissement sur la page du passage (« Contrôle de la préprod sauté »), et l'étape du contrôle est sautée. Un seul des deux posé compte comme aucun. Une fois posés, le contrôle tourne, et un secret faux le rend rouge (401). Il n'installe aucune dépendance : aucun code tiers ne tourne à côté des secrets, et le script ne les affiche jamais.

Le même contrôle se lance depuis un poste :

```sh
PREPROD_BASIC_AUTH_USER=… PREPROD_BASIC_AUTH_PASSWORD=… bun run preprod:controle
CONTROLE_PREPROD_ADRESSE=http://127.0.0.1:3227 bun run preprod:controle   # un build de ce poste, sans accès protégé
```

| Variable | Rôle |
|---|---|
| `PREPROD_BASIC_AUTH_USER`, `PREPROD_BASIC_AUTH_PASSWORD` | L'accès protégé de la préprod. Obligatoires pour la préprod, inutiles pour un build de ce poste |
| `CONTROLE_PREPROD_COMMIT` | Le commit que la préprod doit servir avant la lecture de la page. Absente : toute version |
| `CONTROLE_PREPROD_ADRESSE` | Une autre cible : un build de ce poste, `http://127.0.0.1:PORT`. Le site n'est jamais une cible |

Les tests : `tests/unit/preprod-controle.test.ts`, contre une préprod simulée.

## Les contrôles par la CI, sans mot de passe saisi (ticket 174)

`.github/workflows/preprod-controles.yml` se lance **à la main** (« Run workflow », sur la branche `v3` seulement : sur une autre branche, la première étape s'arrête avant de récupérer le code). Un lancement suffit. Dans l'ordre :

1. **Remise à l'état semé** (`bun run preprod:remise-ci`, `scripts/preprod/remise-ci.ts`). Le script demande à Coolify l'application de la préprod, vérifie que Coolify la donne bien pour `https://preprod.my-makeup.fr` et pour rien d'autre (le site, son `www` et son `api` ne sont jamais une cible : U86), pose **une seule variable**, `PREPROD_REMISE_A_ZERO`, avec un jeton fait du numéro du lancement (`ci-<lancement>-<tentative>`, neuf à chaque lancement et à chaque relance), redémarre l'application, puis lit son journal jusqu'à la ligne `Remise à zéro « … » faite`. Un journal qui dit « non faite », « interrompue » ou « déjà faite », ou qui reste muet 15 minutes, rend le lancement rouge. Le jeton n'est pas un secret.
2. **Parcours rapides** (`bun run preprod:controle`) : la version servie, puis la page du profil fictif (200, son nom dans le seul `h1`).
3. **Contrôle de l'hôte** (`bun run bascule:controle`, [`tests/controle-hote.md`](tests/controle-hote.md)) : toutes les adresses de l'inventaire, le sitemap, le fichier robots, les anciennes routes d'authentification et le script de mesure, en lecture seule, sur `https://preprod.my-makeup.fr`.

Le résultat se lit dans le résumé du lancement (« Summary » de la page du lancement) : une partie par étape, en nombres et en empreintes. Rouge : l'étape qui échoue le dit, et les suivantes ne tournent pas.

**Aucun mot de passe n'est saisi par un agent ni par une personne** : le lancement lit quatre secrets du dépôt, à poser par Andy dans GitHub (Settings › Secrets and variables › Actions) :

| Secret | Rôle |
|---|---|
| `PREPROD_BASIC_AUTH_USER`, `PREPROD_BASIC_AUTH_PASSWORD` | L'accès protégé de la préprod (déjà lus par `preprod.yml`) |
| `COOLIFY_URL` | L'adresse de Coolify, en `https://`, sans chemin ni identifiant |
| `COOLIFY_TOKEN` | Un jeton d'API Coolify, créé pour cet usage, qui peut écrire une variable et redémarrer une application (droits « write » et « deploy »). Il est envoyé à Coolify seul, dans un en-tête, et ne s'écrit jamais |

Chaque secret se lit par son nom, dans le bloc `env` d'une étape, et nulle part ailleurs (test : `tests/unit/preprod-controles-ci.test.ts`). Sans l'un d'eux, l'étape échoue et nomme la variable, pas sa valeur. Aucune étape n'installe de dépendance : aucun code tiers ne tourne à côté des secrets.

Gardes :

- **La préprod seulement.** La cible du contrôle est écrite dans le fichier du workflow, et le test ci-dessus échoue si le fichier nomme un autre hôte. Le script de remise refuse toute application que Coolify ne donne pas pour la préprod seule.
- **Une base marquée préprod seulement.** Le script n'écrit que `PREPROD_REMISE_A_ZERO` : il ne lit pas les variables de l'application et ne touche pas à `DATABASE_URI`. C'est l'application qui efface, et elle refuse toute base autre que `mymakeup_preprod` (« Remettre la préprod à zéro », gardes) et la variable elle-même hors de la préprod.
- **Une remise efface tout**, le compte admin compris : après un lancement, le premier compte est à recréer (README, « Créer un compte admin »). Un lancement n'a donc rien à faire un jour où quelqu'un travaille sur la préprod.
- **Un lancement à la fois** : un second attend la fin du premier.

## Les tests

- `tests/unit/preprod-controles-ci.test.ts` (ticket 174) : la remise de la CI contre un Coolify simulé (l'ordre, une seule variable, la préprod seule, aucun secret écrit) et le fichier du workflow (lancement à la main, branche `v3`, cible unique, secrets dans les blocs `env`).
- `tests/unit/preprod.test.ts` : où est la préprod, `APP_ENV` et la variable de remise refusées ailleurs, la tâche qui refuse hors de la préprod ou sur une autre base sans rien toucher (le site en particulier : ni lecture, ni écriture), le jeu qui ne se charge pas sur une base déjà remplie ni sans `APP_ENV=preprod`, la remise avant la connexion de Payload (jeton nouveau, même jeton, autre base, erreur), le crochet et la remise branchés dans la configuration de Payload, la source posée à côté de la base et entièrement fictive.
- `tests/integration/preprod-demarrage.test.ts` : sur le banc, le démarrage sur une base vide (les 12 profils types, 3 talents et 3 articles chargés, page du profil fictif), le second démarrage qui n'écrit rien, le refus sur une autre base, et des démarrages entiers de Payload en production, chacun dans son processus (`tests/fixtures/demarrage-preprod.ts`) : la remise une fois par jeton et le schéma que les migrations reconstruisent ; une migration `init` fictive que l'ancienne base ne prend pas, qui arrête Payload sans jeton et passe avec un jeton nouveau ; une remise refusée sur une autre base. Enfin le lecteur `pg` de la source, qui lit comme celui de bun. `tests/integration/banc-jeu-complet.test.ts` charge le jeu sans stockage, comme la préprod qui n'en a pas encore.
