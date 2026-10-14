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
  - Écarts au plan technique : Next 16.3.8 au lieu de 16.4.x, emails par Resend au lieu de Mailgun. Les deux sont au registre (`next-16-3`, `emails-resend`).
  - Trois versions sont forcées pour fermer des avis de sécurité : nodemailer 10.0.15, undici 7.29.1, dompurify 3.4.17.
  - Reste : deux avis de sécurité n'ont pas de version corrigée à ce jour, sur des dépendances indirectes (braces, et esbuild sous drizzle-kit). Ils sont acceptés par défaut, à confirmer.
- **Ticket 002 fait : le squelette de la v3 démarre en local, sur la branche `v3`.**
  - Une seule application Next.js 16.3.8 et Payload 3.90.2, en TypeScript strict, aux versions du ticket 001. Un seul fichier de verrouillage.
  - Branche `v3` poussée sur GitHub : 4 commits, tête `3102638`. La branche `main` n'a reçu aucun commit.
  - Vérifié sur un clone neuf : installation figée ; Biome et contrôle de types verts ; types de Payload régénérés sans différence ; accueil provisoire en 200 ; `/admin` affiche l'écran de création du premier compte ; base PostgreSQL 18.6 en conteneur, écoutée sur `127.0.0.1` seulement ; `bun run build` passe sans base ni secret.
  - Les trois zones existent : pages publiques, espace maquilleuse sous `/auth`, administration. Le fichier d'exemple d'environnement ne contient aucune valeur.
  - Écart à l'arborescence du plan : les deux zones du site sont sous un groupe parent `(front)`. Il est au registre (`groupe-front`).
  - Restes notés pour les tickets suivants : `next dev` écoute sur toutes les interfaces ; la page 404 par défaut est en anglais ; l'étiquette `v1-legacy-final` et la branche `legacy-v1` ne sont pas créées, elles n'ont de sens qu'au gel du site actuel.
