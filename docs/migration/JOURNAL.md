# Journal de la migration vers la v3

Ce journal garde les faits de la migration, datés : ce qui a été fait, ce qui a été vérifié, ce qui reste.

Ce que la v3 change par rapport au site actuel est dans [`CHANGEMENTS-VOULUS.md`](CHANGEMENTS-VOULUS.md).

## Règles

- Un titre par jour, au format JJ/MM/AAAA. Le jour le plus récent est en bas.
- Une entrée par étape finie ou par opération : ticket, mesure, import, copie ou vidage d'une base, répétition, bascule.
- Chaque entrée dit ce qui a été vérifié. Ce qui n'a pas été vérifié est écrit aussi.
- On écrit des nombres, des identifiants numériques et des empreintes. Aucune donnée personnelle, aucun secret, aucune adresse de base.
- Les décisions restent dans le journal des décisions, hors de ce dépôt. Ici, on écrit les faits.

## 14/10/2026

- **Ticket 001 fait : les versions de la pile sont vérifiées et figées.**
  - 32 versions exactes, vérifiées par un auteur puis par un relecteur. Chaque brique a sa date de vérification et l'état de ses avis de sécurité.
  - La contrainte de Payload sur Next est vérifiée sur les versions retenues : Next 16.3.8 est dans la plage acceptée par Payload 3.90.2.
  - Neuf écarts au plan technique. Deux sont au registre : Next 16.3.8 au lieu de 16.4.x (`next-16-3`), emails par Resend au lieu de Mailgun (`emails-resend`).
  - Trois versions sont forcées pour fermer des avis de sécurité : nodemailer 10.0.15, undici 7.29.1, dompurify 3.4.17.
  - Reste : deux avis de sécurité restent ouverts, sans correctif possible aujourd'hui, sur des dépendances indirectes : braces (aucune version corrigée) et esbuild sous drizzle-kit (la version corrigée ne peut pas être forcée). Ils sont acceptés par défaut, à confirmer.
- **Ticket 002 fait : le squelette de la v3 démarre en local, sur la branche `v3`.**
  - Une seule application Next.js 16.3.8 et Payload 3.90.2, en TypeScript strict, aux versions du ticket 001. Un seul fichier de verrouillage.
  - Branche `v3` poussée sur GitHub : 4 commits, tête `3102638`. La branche `main` n'a reçu aucun commit.
  - Vérifié sur un clone neuf : installation figée ; Biome et contrôle de types verts ; types de Payload régénérés sans différence ; accueil provisoire en 200 ; `/admin` affiche l'écran de création du premier compte ; base PostgreSQL 18.6 en conteneur, écoutée sur `127.0.0.1` seulement ; `bun run build` passe sans base ni secret.
  - Les trois zones existent : pages publiques, espace maquilleuse sous `/auth`, administration. Le fichier d'exemple d'environnement ne contient aucune valeur.
  - Écart à l'arborescence du plan : les deux zones du site sont sous un groupe parent `(front)`. Il est au registre (`groupe-front`).
  - Restes notés pour les tickets suivants : `next dev` écoute sur toutes les interfaces ; la page 404 par défaut est en anglais ; l'étiquette `v1-legacy-final` et la branche `legacy-v1` ne sont pas créées, elles n'ont de sens qu'au gel du site actuel.
- **Ticket 031 fait : la complétude d'un profil donne les mêmes résultats que le site actuel.**
  - La règle unique est dans le fichier `completude.ts`, sous `src/lib/profil` : entièrement vide, actif, publiable, et ce qui manque.
  - Vérifié : 126 tests, 100 % des lignes couvertes. Mêmes réponses que le site actuel sur 16 cas partagés, et que l'ancienne API sur 15 cas repris. Hors dépôt, l'auteur a comparé 30 109 profils fictifs : 0 écart.
  - Non vérifié : la liste officielle des communes n'a pas été passée dans la règle.
- **Ticket 032 fait : la lecture et l'affichage d'un prix sont une seule règle.**
  - `src/lib/prix.ts` lit un prix saisi en texte, l'affiche, et donne le prix minimal d'un profil. Un montant compte entre 5 et 10 000.
  - Vérifié : 23 tests, 100 % des lignes couvertes. 88 textes fictifs donnent le même montant que le code du site actuel.
  - La lecture est un port exact, limites comprises : c'est le premier nombre du texte qui est lu.
- **Ticket 033 fait : le document des URL gelées dit ce que devient chaque famille d'adresses.**
  - Trois fichiers vont ensemble : la table `src/lib/urls-gelees.ts` (39 familles), l'inventaire figé `docs/migration/urls-inventaire.json`, et le document [`URLS.md`](URLS.md), écrit depuis les deux autres.
  - Inventaire relancé le 14/10/2026 à 00:07 UTC : 207 adresses, contre 206 le 09/10/2026. 313 lectures anonymes du site en ligne, à 2 par seconde au plus, aucune écriture.
  - Vérifié : 64 tests ; aucun doublon, aucune chaîne de redirections ; aucun chemin de profil réel dans le dépôt. Les 13 adresses en 404 non voulue du 09/10/2026 sont classées une à une et gardent leur 404.
  - Non vérifié : ce que répondent http, www et le sous-domaine de l'ancienne API, qui dépendent de l'hébergement.
- **Ticket 038 fait : un composant React se teste seul, sans navigateur.**
  - `tests/outils/dom-react.ts` rend un composant dans une fenêtre jsdom. Le guide est `docs/tests/composants.md`. 15 tests.
  - Une dépendance de développement s'ajoute : jsdom 30.1.2, en version exacte.
  - Mesuré sur un poste : un test de fonction pure passe de 10 ms à 480 ms par lancement. Non mesuré en CI.
  - Tête de `v3` après ces quatre tickets : `f193e36`, 228 tests verts.
- **Ticket 003 fait : aucun test ne peut toucher une base, un site, un envoi de mail ou un stockage de prod.**
  - La garde `tests/outils/garde-environnement.ts` est chargée avant tout fichier de test. Elle arrête tout si la base n'est pas locale et nommée en `_test`, ou si une adresse, un domaine d'envoi ou un stockage de prod est visé.
  - Vérifié : 50 tests (U85, U86, U87, et les trois environnements). À l'intégration, avec un fichier `.env` de remplissage, un lancement nu était arrêté avant le premier test.
- **Ticket 009 fait : Payload est durci, et l'application refuse de démarrer sans ses variables.**
  - `src/lib/env.ts` vérifie les variables au démarrage. GraphQL répond 404. Le schéma n'est poussé que dans une base de ce poste. Les origines de confiance sont le site, la préprod et le poste local.
  - Vérifié : 68 tests. Sur le build de production, sans variable : arrêt avec le code 1, et un message qui nomme les variables sans aucune valeur.
- **Ticket 008 fait : la route de santé répond 200 quand la base répond, 503 sinon.**
  - Vérifié : 15 tests. Sur le build de production, sans base : 503 `{"ok":false}`, sans cache ni indexation.
  - Non vérifié à cette date : aucun test automatique ne passe par la vraie route.
- **Ticket 016 fait : le slug d'un profil et l'affichage de sa zone sont calculés comme sur le site actuel.**
  - `src/lib/slug.ts` et `src/lib/format-zone.ts` sont portés avec les mêmes noms de fonctions et les mêmes résultats.
  - Vérifié : 20 tests (U09 à U14). Mêmes slugs que le site actuel sur 50 profils fictifs ; le jeu de référence est figé sur le commit `3585098` de `main`.
- **Ticket 017 fait : ce journal et le registre des changements voulus existent.**
  - Le registre a 14 lignes en 4 tableaux. 11 tests gardent la forme des deux documents et l'absence de donnée personnelle.
- **Ticket 015 fait : le schéma gelé fait correspondre chaque champ de Strapi à son champ dans Payload.**
  - [`SCHEMA.md`](SCHEMA.md) : 71 attributs (4 types de contenu, 7 composants), 68 repris et 3 abandonnés, chacun avec sa raison.
  - Vérifié : 41 tests relisent le document ; un 42e ne tourne qu'avec le code de l'ancienne API sur le poste.
  - Tête de `v3` après ces six tickets : `618b1ec`, 433 tests verts, build de production vert.
- **Ticket 004 fait : une commande monte le banc de test en conteneurs.**
  - `bun run banc:up` démarre PostgreSQL 18.6 en mémoire, un capteur de mails (Mailpit 1.31.4) et un stockage d'objets à l'API S3 (S3Mock 5.2.3). `bun run banc:down` supprime tout. Chaque image est figée par son étiquette et son empreinte. `.env.test` est versionné : toutes ses valeurs sont factices.
  - Vérifié par l'auteur : banc prêt en 4,5 secondes, images déjà téléchargées ; deux bancs côte à côte sur le même poste, sans se gêner ; après l'arrêt, ni conteneur, ni volume, ni réseau. Revérifié à l'intégration, sur un banc à part : prêt en 4,1 secondes.
  - Écart au plan de tests : le stockage est S3Mock, la solution de repli du plan, et non MinIO, dont l'image ne se télécharge plus. S3Mock ne vérifie ni les signatures ni les droits d'accès.
  - Non vérifié : la cohabitation avec la base de développement démarrée pour de vrai. Seuls les numéros de ports sont contrôlés.
  - Ce qui change : sur un poste de développement, un `bun test` nu n'est plus arrêté par la garde. Il tourne sous l'environnement du banc.
- **Ticket 005 fait : un test d'intégration écrit dans la base du banc par Payload, puis la remet à zéro.**
  - `bun run test:integration` lance les tests de `tests/integration/` sur le banc ; avec un chemin, un seul fichier. Sans le banc, il s'arrête avant le premier test et dit quoi démarrer.
  - Vérifié : le test coquille passe en 2,2 secondes. Après la remise à zéro, 0 document dans chaque collection et 0 ligne dans chaque table ; seule la table de suivi des migrations est gardée, exprès.
  - À savoir : chaque lancement efface puis reconstruit le schéma de la base du banc.
- **Ticket 006 fait : la fabrique crée un compte de test et rend une session prête, sans mot de passe saisi.**
  - Vérifié : la route « mon compte » de l'application répond 200 avec le compte créé ; deux appels simultanés donnent deux comptes distincts, effacés à la remise à zéro ; hors du banc, la fabrique s'arrête avant toute écriture ; le mot de passe n'apparaît dans aucun journal.
  - Non vérifié : la session dans un vrai navigateur (ticket 013), et ces outils lancés sous Node.
  - À l'intégration, sur un banc à part : 14 tests d'intégration verts, en 5,2 secondes.
- **Ticket 010 fait : l'image Docker se construit sans secret ni base, et dit si elle est saine.**
  - Le `Dockerfile` construit le serveur autonome de Next sur Node 24, sous un utilisateur sans droits. Une première migration est versionnée, provisoire : `20261014_010035_socle_provisoire`.
  - Vérifié par `bun run image:controle`, par l'auteur puis à l'intégration sur le commit `99c264e` : aucune variable d'exécution dans l'historique ni la configuration de l'image ; santé 200 avec la version `99c264e`, conteneur « healthy » ; migration jouée au premier démarrage, aucune au second ; base arrêtée, 503 en 1 817 ms, puis « unhealthy » ; une image de 1200 px revient en 640 px, en webp.
  - Non vérifié : l'image n'a tourné que derrière Podman, jamais avec un démon Docker.
- **Ticket 012, pas fini : la CI et ses garde-fous sont dans le dépôt.**
  - `.github/workflows/ci.yml` lance `qualite`, `unit` et `build`, puis `ci-ok`, le seul check à exiger. 194 tests de garde-fous (`bun run test:ci-garde`) : chacun est joué sur le dépôt, puis sur un exemple fautif.
  - Vérifié sur un poste seulement : le script de `ci-ok` est rouge dès qu'un job a échoué, a été annulé ou a été sauté.
  - Reste, à constater sur GitHub : la durée d'une CI verte, qui doit rester sous 15 minutes ; CodeQL sur les pull requests vers `v3`, qui attend la protection de la branche (ticket 028).
- **Ticket 029, pas fait : le canari de la CI est prêt, il n'est pas joué.**
  - `bun run ci:canari` écrit les trois fautes ; la marche à suivre est dans [`docs/qualite.md`](../qualite.md), §10. Seule une répétition locale a eu lieu. Le canari se joue dès que `v3` est protégée.
- **Ticket 030 fait : les guides du dépôt disent comment travailler et quand c'est fini.**
  - `CLAUDE.md`, `AGENTS.md` et [`docs/qualite.md`](../qualite.md) : les règles des tests, les sept règles L1 à L7 des listes éditées en place, l'écran regardé à 390 px. 25 tests gardent les commandes citées, les liens et les règles.
  - À la fusion, `docs/qualite.md` réunit les règles du travail (§1 à §5) et la CI (§6 à §10).
  - À confirmer : aucune source n'énumère les sept règles de liste. Elles sont reconstituées depuis les correctifs du 13/10/2026 sur le site en ligne (PR #964 à #972).
- **Ticket 034 fait : chaque page part avec les en-têtes de sécurité.**
  - Cinq en-têtes, et plus d'en-tête `X-Powered-By`. La politique de contenu est en mode rapport : elle signale, elle ne bloque rien. L'optimiseur d'images n'accepte que l'hôte des photos, réglé par `R2_PUBLIC_URL`, facultative. Le registre a sa ligne `en-tetes-securite`.
  - Vérifié : 48 tests. Sur un build de production en local, les cinq en-têtes sur 10 adresses, et 0 violation de la politique sur 4 pages dans un navigateur sans écran. Une lecture du site en ligne, celle des en-têtes de l'accueil, pour la case « Avant » du registre.
  - Trois précisions du relecteur, non corrigées : les redirections 308 par lesquelles Next normalise une adresse partent sans ces en-têtes ; des en-têtes `x-nextjs-*` nomment encore Next ; rien n'interdit encore d'afficher le site dans un cadre, puisque la politique est en mode rapport.
- **Ticket 220 fait : les constats mineurs de la relecture du socle sont traités.**
  - 29 constats, vérifiés un par un : 24 des relecteurs, 5 de l'intégrateur. Entre autres : la garde des tests refuse une adresse de base qui porte un paramètre `host` ou `hostaddr` ; la route de santé lit ses variables de version par `src/lib/env.ts` ; cinq phrases du schéma gelé sont corrigées, chacune avec son test ; la colonne « Pages touchées » du registre ne nomme plus que les pages qui changent.
  - Sept constats sont reportés aux tickets qui les portent, comme le proposaient les relecteurs. L'adresse provisoire de la prod avant la bascule reste refusée dans `NEXT_PUBLIC_SITE_URL` jusqu'au ticket 185.
  - Le constat 20 est appliqué ici même : l'entrée du ticket 001 dit maintenant neuf écarts, et précise les deux avis de sécurité.
- **Intégration des tickets 004, 005, 006, 010, 012, 029, 030, 034 et 220 dans `v3`.**
  - Cinq fusions, dans cet ordre : `cee5112`, `5f09a63`, `aca0a78`, `46fb26c`, `b2e5814`. Puis `99c264e`, qui accorde les guides avec le banc de test et la CI réunis.
  - Vérifié sur `99c264e` : installation figée sans changement ; Biome et contrôle de types verts ; 610 tests unitaires verts et 1 sauté ; 194 garde-fous de la CI verts ; 14 tests d'intégration verts ; build de production vert, sans base ni secret ; image construite puis contrôlée.
  - Non vérifié à cette date : aucun workflow n'a encore tourné sur GitHub.
