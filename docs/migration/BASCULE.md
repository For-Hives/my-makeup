# La bascule, pas à pas

Ce document est le déroulé du jour de la bascule (ticket 184, jour J = ticket 193). Pour chaque étape : **qui** la fait, **le geste**, **le contrôle** (un nombre, jamais « ça a l'air bon »), **la durée** et **quand on s'arrête**. Les gestes d'Andy sont un guide qu'il suit, étape après étape. Les contrôles sont faits en lecture par Claude, qui tient aussi le journal ([`JOURNAL.md`](JOURNAL.md)).

Il remplace le tableau du plan 01 §7 (écrit pour une bascule du 24/03, avec une préprod et des emails). Ce qui a changé depuis :

- **L'ancien site se gèle par un réglage**, pas en retirant des droits à la main : `LEGACY_READ_ONLY=true` sur l'application de l'API, puis un redémarrage ([`LECTURE-SEULE.md`](LECTURE-SEULE.md)).
- **Il n'y a pas de préprod.** La v3 est déjà en production, sur `https://v3.my-makeup.fr`, derrière un accès protégé et en `noindex`. L'échange de domaine ne reconstruit rien : le site est construit pour `https://my-makeup.fr` depuis le début.
- **L'import tourne dans le conteneur de la v3**, sans accès SSH, par un jeton nouveau à chaque passage ([`IMPORT.md`](IMPORT.md), « En production »). Il laisse de côté les **13 profils de spam** et rend la parité à 100 % sans eux.
- **La confirmation d'email existe dans la v3.** Les comptes importés arrivent déjà confirmés ; une inscription neuve doit cliquer le lien reçu par email. D'où l'essai d'inscription de l'étape 10.
- **Umami est servi par le site** (`/u/script.js`) : une visite de test se lit dans Umami dès l'échange ([`../mesure/umami.md`](../mesure/umami.md)).
- **Aucun email n'est envoyé avant la bascule.** Le seul avertissement est le bandeau de l'espace de l'ancien site, sept jours avant (ticket 192). Les emails J-14 et J-2 du plan 01 sont abandonnés.
- **Les essais de session passent après l'échange** (étape 10), pas avant : ils laissent des traces dans la v3 qui feraient refuser tout passage d'import suivant, et aucune session ne marche sur `v3.my-makeup.fr` (le site est construit pour `my-makeup.fr`, son cookie n'y est pas reconnu).

Aucun secret n'est écrit ici : seulement des **noms** de variables. Les commandes de chaque geste (Coolify, GitHub) sont dans `PLAN-PROD-DIRECT.md`, §8 (G1 à G31), du dépôt des plans.

## La règle qui s'applique partout

**Une étape rouge arrête tout.** On ne passe pas à la suivante et on n'improvise pas : on suit la colonne « On s'arrête si », qui renvoie au retour arrière A (avant l'échange) ou B (après). Une étape qui dure plus du double de son budget est une étape rouge.

## La liste de feu vert

Andy fixe la date (ticket 191) quand **toute** cette liste est cochée. Chaque ligne dit où est sa preuve.

- [ ] **Le commit à déployer est vert.** `ci-ok` vert sur ce commit, et `https://v3.my-makeup.fr/api/health` répond 200 avec sa version.
- [ ] **La répétition complète tient dans ses 2 heures.** `bun run rehearsal` sur la sauvegarde de la nuit : durée par étape, parité à 100 %, 13 profils absents, second passage à 0 création et 0 mise à jour (ticket 180, [`IMPORT.md`](IMPORT.md), « La répétition complète »).
- [ ] **Un passage à blanc a été fait sur la v3 de production** (`IMPORT_MODE=dry-run`) : code 0, table de décision écrite hors du dépôt, liste des villes à revoir lue.
- [ ] **La base de production de la v3 est vide**, avec le seul compte admin d'Andy : elle est recréée après toute répétition réelle (la date de consentement se fige au premier passage réel, et l'import ne supprime rien).
- [ ] **Le correctif de lecture seule est déployé sur l'API** (ticket 171, partie API) et la variable est absente : l'API se comporte comme avant.
- [ ] **L'export de ce qui est écrit après l'échange est prêt** (ticket 234, [`RETOUR-ARRIERE.md`](RETOUR-ARRIERE.md)) : essais verts sur le banc.
- [ ] **Les réglages de la v3 de production sont posés** : leurs noms sont tous là, sans valeur affichée (ticket 186) ; l'adresse de retour de la connexion Google est déclarée ; le jeton du stockage des photos est posé.
- [ ] **Les redirections `www` et `http` sont permanentes** : l'étiquette de Coolify porte `permanent=true` sur l'application de la v3 (aujourd'hui, l'ancien site répond en 302 ; ticket 193).
- [ ] **La sauvegarde de la v3 se restaure** (ticket 187) et la sauvegarde quotidienne de sa base a réussi une fois.
- [ ] **Le bandeau de l'espace de l'ancien site est en ligne depuis 7 jours au moins** (ticket 192), et l'étiquette `v1-legacy-final` et la branche `legacy-v1` sont posées sur son dernier état.
- [ ] **Les domaines et les certificats ont plus de 30 jours devant eux** (ticket 170, sonde R06 de `bun run probes`).
- [ ] **La recette manuelle, la politique de confidentialité et la vitesse sont verts** (tickets 190, 189, 179).
- [ ] **Renovate, les notes de version et la publication sont prêts pour `main`** (tickets 035 et 036 ; [`../publication.md`](../publication.md), [`../qualite.md`](../qualite.md), « Renovate »). Les réglages de GitHub sont préparés mais **pas appliqués** : ils attendent l'étape 15.
- [ ] **Le compte de test d'Andy existe sur l'ancien site**, avec un mot de passe (il ne s'y crée plus une fois le gel posé), et la boîte qui reçoit les messages du formulaire de contact est lue.
- [ ] **La date, le créneau et la limite du retour arrière (J+1 18:00) sont écrits au journal des décisions** : créneau creux d'une heure en semaine, 7 jours au moins après la décision, lendemain libre.

## Le jour J

T0 est l'heure du gel. Les durées sont des **budgets** : leur total jusqu'à l'échange est de 58 minutes, sous l'heure promise. Les mesures déjà faites sont citées ; le reste est estimé et sera remplacé par les durées réelles de la première bascule.

| N° | Qui | Geste | Contrôle chiffré | Durée | On s'arrête si |
|---|---|---|---|---|---|
| 1 | Andy | **Gel de l'ancienne API.** Dans Coolify, sur l'application de l'API, pose `LEGACY_READ_ONLY=true` et `MEDIA_SWEEP=off` (variables d'exécution), puis redémarre | Claude : une inscription à corps vide répond 403 (sans le gel : 400, rien n'est créé) et un envoi de photo sans jeton répond 403, soit 2 sur 2 ; une lecture de profil et la recherche répondent 200, 2 sur 2 ; le journal de l'API porte la ligne `[read-only] LEGACY_READ_ONLY=true` | 5 min | Une écriture ne répond pas 403 : retire les deux variables, redémarre. Retour arrière A |
| 2 | Andy | **Instantané final.** Dans Coolify, base de Strapi, Backups, « Backup now » | Claude : la sauvegarde est « success », sa taille n'est pas nulle, sa date est après l'étape 1 : 3 vérifications sur 3 | 5 min | La sauvegarde échoue deux fois. Retour arrière A |
| 3 | Andy pose, Claude lit | **Import réel.** Sur l'application de la v3, pose `IMPORT_CONSENT_DATE` (le jour J, `AAAA-MM-JJ`), `IMPORT_DECISIONS`, `IMPORT_MODE=real` et un `IMPORT_TOKEN` qui n'a jamais servi, puis redémarre | Claude lit les lignes `[import]` : code 0 ; empreintes de la source avant = après ; parité par collection (comptes, profils, médias, articles, talents) à 0 différent, 0 manquant, 0 en trop ; comptes repris = comptes de la source moins les écartés par décision ; 13 profils de spam écartés ; hash hérités = comptes locaux plus les prêts confirmés, tous au format `$2a$10$` ; médias adoptés tous en 200, hors les « 404 connus » listés par identifiant | 10 min (le passage seul : 25 à 45 s mesurées le 08/10, plus les réponses du référentiel des communes) | Code 3 (une décision manque) : écris-la, jeton neuf, **un seul** nouvel essai. Tout autre code, ou un second échec : retour arrière A |
| 4 | Andy pose, Claude lit | **Second passage.** Nouveau `IMPORT_TOKEN`, `IMPORT_MODE=real`, redémarre | Claude : code 0, 0 création, 0 mise à jour, tous les comptes « inchangés » | 6 min | Un seul changement : la source a bougé, le gel est mal tenu. Retour arrière A |
| 5 | Andy pose, Claude lit | **Contrôle de la cible.** Nouveau `IMPORT_TOKEN`, `IMPORT_MODE=check`, redémarre | Claude : code 0 et la ligne « la cible est la source » ; 0 ligne `[import]` qui contient `@` ou `$2a$` | 6 min | Code 4 (écart). Retour arrière A |
| 6 | Claude | **Contrôle de l'hôte, avant l'échange.** `bun run cutover:check` contre `https://v3.my-makeup.fr`, avec `HOST_CHECK_TARGET` et l'accès protégé en `HOST_CHECK_ACCESS_USER` et `HOST_CHECK_ACCESS_PASSWORD` ([`../tests/controle-hote.md`](../tests/controle-hote.md)) | `/api/health` 200 et sa version est celle du commit vert ; rapport : 100 % des adresses conformes ou en écart connu (les écarts connus sont les adresses en `//`, qui répondent 200 avec le canonical du chemin propre derrière Traefik : `adresse-double-barre-308`), 0 adresse en échec, 0 réponse 5xx, code de sortie 0 | 6 min (107 requêtes à 2 par seconde au plus : 54 s au moins, mesurées sur le banc) | Une adresse non conforme ou une 5xx. Retour arrière A |
| 7 | Andy | **Échange, côté v3** (détail ci-dessous). Dans l'interface d'abord : accès protégé coupé, `noindex_domains` réduit à `https://v3.my-makeup.fr`. Puis `CUTOVER_DATE` (le jour J), retire **toutes** les `IMPORT_*` d'un coup, domaines `my-makeup.fr`, `www.my-makeup.fr` et `v3.my-makeup.fr`, redéploie | Claude : le déploiement est « finished » ; `https://v3.my-makeup.fr/api/health` répond 200 sans mot de passe, avec la version attendue | 10 min (le build de la CI dure 1 min 27 s ; sur le serveur, non mesuré) | Le déploiement échoue : remets les domaines de la v3 à `https://v3.my-makeup.fr`. Retour arrière A |
| 8 | Andy | **Échange, côté ancien front** (détail ci-dessous), dès que le conteneur v3 tourne. Dans l'interface d'abord : accès protégé actif et `noindex_domains` sur `https://ancien.my-makeup.fr`. Puis domaine `https://ancien.my-makeup.fr`, redéploie | Claude : `https://my-makeup.fr/api/health` répond 200 avec la version de la v3, 3 fois de suite à 10 secondes d'écart ; `https://ancien.my-makeup.fr` répond 401 sans mot de passe | 10 min (le build de l'ancien front : 3 à 6 min estimées) | `my-makeup.fr` ne sert pas la v3 à T0 + 75 min. Retour arrière B |
| 9 | Andy pose, Claude lit | **Contrôles après l'échange.** Andy change la cible de la sonde continue : la variable `WATCH_TARGET` du dépôt passe de `https://v3.my-makeup.fr` à `https://my-makeup.fr`, les secrets d'accès protégé sont retirés ([`../tests/sonde-continue.md`](../tests/sonde-continue.md)) ; `bun run probes` ; `bun run cutover:check` contre `https://my-makeup.fr` ; les en-têtes de `/` ; les redirections | Certificats de `my-makeup.fr` et de `www` valides 21 jours au moins (R06) ; sondes : 0 rouge ; contrôle d'hôte : 0 en échec, code 0 (les adresses en `//` en écart connu) ; `X-Robots-Tag` absent de `https://my-makeup.fr/` et présent sur `https://v3.my-makeup.fr/` ; `http://my-makeup.fr` et `https://www.my-makeup.fr` répondent 301 ou 308 en 1 saut, 2 sur 2 ; sonde continue : le passage lancé à la main (« Run workflow ») lit `my-makeup.fr` et finit vert, 3 lectures sur 3 (santé avec version, accueil, un profil) | 10 min | Certificat invalide, 5xx, ou un profil cassé : retour arrière B. Une redirection en 302 ou une adresse isolée : on corrige en avant (étiquette `permanent=true`, ou le défaut nommé), sans retour arrière |
| 10 | Andy, Claude lit | **Les essais de session.** (a) connexion de ton compte hérité, par le formulaire ; (b) inscription d'un compte de test, puis clic sur le lien reçu par email ; (c) un message de test par le formulaire de contact ; (d) connexion Google d'un compte Google existant | (a) connecté, et ton compte n'a plus de hash hérité (E73, lu dans l'admin) ; (b) l'email arrive en 5 minutes au plus, l'adresse devient confirmée, puis tu supprimes le compte de test dans l'admin ; (c) le message est reçu par l'équipe et visible dans l'admin ; (d) le même compte, sans doublon : 4 essais sur 4 | 15 min | (a) ou (c) échoue encore après 30 minutes : retour arrière B. (b) échoue : vérifier l'envoi (Resend) ; `AUTH_VERIFY=off` seulement si l'envoi est en panne et avec ton accord |
| 11 | Andy, Claude lit | **La mesure.** Tu ouvres `https://my-makeup.fr` dans un navigateur ordinaire (ni automatisé, ni avec la mesure désactivée), sur une page de profil | Claude : 1 page vue de test lue dans Umami, dont l'étiquette de version est celle de `/api/health` ; 1 annotation de la rupture de série écrite dans le registre des mesures (`mesures/annotations.jsonl` du dépôt des plans) | 7 min | Aucune visite lue après 15 minutes : `/u/script.js` doit répondre 200 (déjà lu à l'étape 9) ; on corrige en avant, pas de retour arrière |
| 12 | Andy et Claude | **Les moteurs.** Tu soumets le sitemap dans la Search Console et dans Bing ; Claude lance `bun run indexnow:all` avec la clé (publique par construction, [`../seo/indexnow.md`](../seo/indexnow.md)) | 2 soumissions faites sur 2 ; IndexNow : toutes les adresses du sitemap envoyées, réponses 200 ou 202 | 10 min | Rien ne déclenche de retour arrière : on recommence |

Total jusqu'à l'échange fait (étape 8) : 5 + 5 + 10 + 6 + 6 + 6 + 10 + 10 = 58 minutes. Le total du jour : 100 minutes, dont 42 après l'échange.

### Le détail des gestes d'échange (étapes 7 et 8)

Le réglage d'accès protégé de Coolify vaut pour **tous** les domaines d'une application. Il se règle donc **avant** le déploiement : coupé après, il laisserait `my-makeup.fr` derrière un mot de passe jusqu'au déploiement suivant.

1. **Étape 7**, dans cet ordre : accès protégé coupé sur la v3, puis `noindex_domains`, puis les variables, puis les domaines, puis le déploiement. `noindex_domains` ne garde que `https://v3.my-makeup.fr` : jamais `my-makeup.fr`.
2. **Pendant l'étape 7**, tant que l'ancien front garde `my-makeup.fr`, Traefik a deux routes pour le même hôte et en prend une : les deux sites servent alors la lecture, et l'ancien est gelé. C'est voulu et dure quelques minutes.
3. **Étape 8** : l'ancien front quitte `my-makeup.fr` et `www`. Il n'est pas arrêté : il reste en ligne sur `ancien.my-makeup.fr`, protégé, pour le retour arrière.
4. **Note les deux instants (UTC)** au journal, dès l'étape 8 : la fin du second passage (étape 4) et la première réponse de la v3 sur `my-makeup.fr`. L'export du retour arrière part du premier (`?since=`, voir [`RETOUR-ARRIERE.md`](RETOUR-ARRIERE.md)) : plus tôt vaut mieux que trop tard.
5. **Ne touche ni à l'ancien site ni à `main`** : le front de `For-Hives/my-makeup` sur `main` reste tel quel, et l'ancienne API ne reçoit que le gel.

## Le retour arrière, sur une page

Il reste possible **jusqu'à J+1 18:00**. Après cette heure, on corrige en avant. L'ancien front, l'ancienne API et la base de Strapi ne sont ni arrêtés ni supprimés : c'est ce qui le rend possible.

**A. Avant l'échange (arrêt aux étapes 1 à 7).** Aucun visiteur n'a rien vu changer.

1. Sur l'application de l'API : retire `LEGACY_READ_ONLY` et `MEDIA_SWEEP`, redémarre. Une minute. Contrôle : une inscription à corps vide répond 400 et non 403, et le démarrage n'écrit plus la ligne `[read-only]`.
2. Sur la v3 : retire toutes les `IMPORT_*` d'un coup.
3. Les domaines n'ont pas bougé : rien d'autre à faire. La base de la v3 garde les données importées ; **supprime-la et recrée-la** avant la prochaine tentative (la date de consentement est figée au premier passage réel, et l'import ne supprime rien).

**B. Après l'échange (arrêt aux étapes 8 à 10).**

1. **Exporter d'abord**, tant que la v3 répond : télécharge `/api/cutover/delta?since=…` avec ton compte admin, hors du dépôt, droits `600`. Note les nombres du journal `[bascule]`. Ne jamais arrêter la v3 avant d'avoir exporté ([`RETOUR-ARRIERE.md`](RETOUR-ARRIERE.md)).
2. **v3** : domaines ramenés à `https://v3.my-makeup.fr`, accès protégé remis, `noindex_domains` remis, redéploie. Ou arrête-la, mais `my-makeup.fr` répond 404 jusqu'à l'étape 3.
3. **Ancien front** : domaines `https://my-makeup.fr` et `https://www.my-makeup.fr`, accès protégé coupé, `noindex_domains` vide, redéploie.
4. **API** : retire `LEGACY_READ_ONLY` et `MEDIA_SWEEP`, redémarre (étape A1).
5. **Rejoue à la main**, d'après le fichier, ce qui a été créé dans la v3 entre-temps (comptes, profils, photos, messages) : la marche à suivre est dans [`RETOUR-ARRIERE.md`](RETOUR-ARRIERE.md).
6. **Contrôle** : l'accueil, un profil, la connexion du compte de test, la page de contact.

Durée : 10 à 20 minutes pour le trafic (estimée), plus la reprise des données. Les comptes créés dans la v3 n'ont pas de mot de passe dans le fichier : ces personnes passent par « Mot de passe oublié ».

## Après le jour J

Le retour arrière ferme à J+1 18:00. Les étapes 14 à 17 commencent **après cette heure**, et seulement si tu as décidé de garder la v3 (ticket 194).

| N° | Qui | Geste | Contrôle chiffré | Durée | On s'arrête si |
|---|---|---|---|---|---|
| 13 | Andy | **La décision.** Tu lis le rapport de J+1 et tu dis : on garde la v3, ou on revient en arrière (retour arrière B, avant 18:00) | Le rapport donne les nombres de la veille : 100 % des adresses conformes, 0 réponse 5xx sur la journée, nombre de comptes, de profils et de messages créés depuis l'échange | 30 min | Tu ne décides pas avant J+1 18:00 : la v3 reste, le retour arrière est clos |
| 14 | Andy | **L'ancien front suit sa branche d'héritage.** `legacy-v1` doit être au dernier commit de `main` (sinon avance-la : seuls les changements permis par [`GEL.md`](GEL.md) y sont arrivés). Dans Coolify, sur l'ancien front : branche `legacy-v1` et **déploiement automatique coupé** ; ne redéploie pas | Claude : la branche de l'application lue dans Coolify est `legacy-v1` et le déploiement automatique est coupé, soit 2 vérifications sur 2 ; `legacy-v1` et `main` portent le même commit | 10 min | Une des deux vérifications échoue : on ne fusionne pas |
| 15 | Andy | **La protection de `main`**, posée juste avant la fusion et pas plus tôt (sinon elle bloque les pull requests de l'ancien site) : `ci-ok` et `CodeQL` requis, administrateurs compris, avec l'exception qui laisse la publication pousser `.release/version.json` ([`../publication.md`](../publication.md)) | Claude lit la protection : 2 contrôles requis (`ci-ok`, `CodeQL`), administrateurs compris, et l'exception de la publication présente : 3 sur 3 | 10 min | Un des trois manque : pas de fusion |
| 16 | Andy | **La fusion de `v3` dans `main`.** Sur le dépôt `For-Hives/my-makeup` | `ci-ok` vert sur `main` ; 0 déploiement de l'ancien front après la fusion (la liste des déploiements de Coolify n'a pas bougé) | 15 min | Un déploiement de l'ancien front démarre : annule-le aussitôt (il reconstruirait l'ancien site avec le code de la v3) |
| 17 | Andy | **La prod suit `main`.** Dans Coolify, l'application de la v3 passe sur la branche `main`, avec le Watch Path `/.release/version.json` et le déploiement automatique rétabli ([`../publication.md`](../publication.md)) | Claude : la première publication est verte et écrit `.release/version.json` ; 1 déploiement de la v3, au numéro publié ; `bun run renovate:validate` : 0 erreur | 20 min | La publication est rouge ou aucun déploiement ne part : on repasse la v3 sur `v3`, déploiement à la main |

Plus tard, hors de ce document : retirer `STRAPI_SOURCE_URI` de Coolify et supprimer le rôle `lecture_strapi` à J+30 (tickets 201 et 202).

## Ce que ce document ne fait pas

- Il ne donne ni date ni heure : elles s'écrivent au journal des décisions (ticket 191).
- Il ne contient aucune valeur de variable, aucun mot de passe, aucune adresse de profil.
- Il ne remplace pas [`RETOUR-ARRIERE.md`](RETOUR-ARRIERE.md), qui dit quoi rejouer dans l'ancien site, ni [`IMPORT.md`](IMPORT.md), qui dit ce que l'import garantit.
