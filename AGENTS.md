# Travailler dans ce dépôt : la méthode et « fini »

Ce guide vaut pour tout agent, et pour toute personne, qui change ce dépôt. Il dit à quel rythme lancer les tests et quand un travail est fini.

Avant le premier changement, lis [`CLAUDE.md`](CLAUDE.md) : les commandes, l'architecture, les interdits et les pièges.

## Méthode : tests ciblés pendant le travail, suites entières une fois à la fin

1. **Pendant le travail, lance seulement le fichier de tests que tu touches** : `bun --no-env-file test tests/unit/<fichier>`. Le test s'écrit avec le changement, pas après.
2. **Un correctif commence par son test rouge.** Écris le test, vois-le échouer une fois sur le code actuel, puis corrige.
3. **À la fin, lance le passage complet une seule fois**, dans cet ordre :
   1. `bun run check` : Biome, qui écrit ses corrections ;
   2. `bun run typecheck` ;
   3. `bun run test` ;
   4. `bun run test:ci-guard` : les garde-fous que la CI lance sur chaque PR ;
   5. `bun run test:integration`, banc démarré (`bun run bench:up`), si ton changement touche ce que le banc couvre : la base, les comptes, les mails, le stockage, la connexion Google ;
   6. `bun run test:e2e`, banc démarré, si ton changement touche ce qu'on voit dans un navigateur : une page, un écran, un parcours ;
   7. `bun run build`, si tu as changé du code ou de la configuration.

   Si une étape est rouge : corrige avec le test ciblé, puis relance le passage une fois.
4. **La seconde passe complète est celle de la CI, sur la PR.** Tu ne la fais pas à sa place.
5. **Relire, c'est lire le diff.** Un relecteur lance deux essais ciblés au plus, jamais la suite entière. Il y a un seul tour de relecture ; un second seulement pour un défaut bloquant ou majeur.

La mesure qui a fixé cette règle : [`docs/qualite.md`](docs/qualite.md), §1.

## « Fini »

Un travail est fini quand chaque ligne qui le concerne est vraie et que tu peux le montrer.

Toujours :

- [ ] **Chaque critère du ticket a sa preuve** : un test, ou un contrôle que tu as fait et que tu décris. Un critère que tu n'as pas vérifié reste décoché, et tu le dis.
- [ ] **Les tests ciblés du changement sont verts** : chaque comportement ajouté ou corrigé a le sien.
- [ ] **Le passage complet de la fin est vert**, lancé une fois (« Méthode », point 3).
- [ ] **Ce qui est nouveau est écrit là où on le cherche** : une commande, une variable d'environnement ou un dossier a sa ligne dans le [`README.md`](README.md) ou dans ces guides.
- [ ] **Rien de ce que tu as démarré ne tourne encore** : serveur, conteneur, base.

Selon ce que le changement touche :

| Le changement touche | Il est fini quand |
|---|---|
| Un écran : une page, un panneau, un composant visible | Une **capture à 390 px** de large est prise et regardée ([`docs/qualite.md`](docs/qualite.md), §4). |
| Ce qu'une visiteuse ou une maquilleuse peut remarquer par rapport au site en ligne | Il a sa **note de version** : une phrase en français qui dit ce que la personne peut faire ou ce qui s'améliore pour elle, sans nom de fichier ni jargon. Une page reprise à l'identique n'en demande pas. |
| Un comportement voulu différent du site en ligne | Il a sa **ligne au registre**, dans le même commit : [`docs/migration/CHANGEMENTS-VOULUS.md`](docs/migration/CHANGEMENTS-VOULUS.md). Tout écart sans ligne est un défaut. |
| Une règle d'accès : qui lit, crée, modifie ou supprime quoi | Elle a son **test dans la matrice d'accès**, pour chaque rôle (anonyme, maquilleuse propriétaire, autre maquilleuse, compte sans profil, rédaction, admin), par l'API REST et par l'API locale avec les règles actives : toute règle d'accès ajoute ses lignes à `tests/integration/payload-acces.test.ts`, dans le même commit ([`docs/tests/banc.md`](docs/tests/banc.md), « La matrice d'accès »). |
| Une liste éditée en place | Les sept règles L1 à L7 ont chacune leur test ([`docs/qualite.md`](docs/qualite.md), §3). |
| Une collection ou un champ | Les règles « Schéma » de [`CLAUDE.md`](CLAUDE.md) sont tenues. |
| Une adresse publique | Les règles « URL » de [`CLAUDE.md`](CLAUDE.md) sont tenues. |

La note de version s'ajoute par `bun run notes:add <type> "<phrase>"`, dans le même commit que le changement. Elle attend dans `src/content/changelog.json` jusqu'à la publication suivante, qui la range sous son numéro. Le type, la règle de la phrase et la publication : [`docs/publication.md`](docs/publication.md).

## Compte rendu

Quand tu rends ton travail, dis quatre choses : ce que tu as vérifié et comment, ce que tu n'as pas vérifié, les décisions que tu as prises seul, et ce que tu as vu sans y toucher parce que c'est le travail d'un autre ticket.
