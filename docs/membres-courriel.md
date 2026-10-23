# Le courriel aux membres après la bascule (issue 998)

Un seul courriel aux maquilleuses : ce qui a changé avec le nouveau site, ce qu'elles doivent faire si leur compte venait de Facebook, et ce qu'il manque à **leur** profil pour être publié. Décision d'Andy du 23/10/2026 sur l'issue 998 : le texte et la liste sont prêts, **rien n'est envoyé**. C'est Andy qui lance l'envoi, plus tard, lui-même.

Le code : `src/lib/emails/members-announcement.ts` (le texte), `src/lib/members-mail/` (la liste, les verrous, le journal d'envoi, le passage), `scripts/members/` (la commande). Tests : `tests/unit/members-mail.test.ts`, `tests/integration/members-mail.test.ts`.

## Le texte

Objet : « Le nouveau My Makeup est en ligne ». Rien de personnel dans l'objet, aucun nom dans le corps, tutoiement. Le corps dit : le nouveau site depuis le 22 octobre ; l'espace qui est le profil, modifiable directement ; la connexion (adresse et mot de passe, ou Google, liens du courrier valables 24 heures) ; la connexion Facebook qui n'existe plus (« Mot de passe oublié » ou Google) ; ce qu'il manque au profil ; les devis par le site « dans un second temps », sans date ; un bouton « Ouvrir mon espace ».

La liste de ce qu'il manque est celle de la règle unique du profil publiable (`publishableConditions`, `src/lib/profile/completeness.ts`), lue par `unmetConditions` (`src/lib/reminders/rules.ts`) et dite avec les mots de `CONDITION_TEXTS`, les mêmes que ceux des relances. Rien n'est recalculé. Un profil qui remplit déjà les six conditions reçoit « Bonne nouvelle : ton profil a tout ce qu'il faut pour être publié » et pas de liste. Le courriel d'une personne ne contient ni le numéro, ni le jeton, ni rien d'une autre.

## Qui le reçoit

Un compte **confirmé**, **non bloqué**, **qui ne s'est pas désinscrit**, qui n'est **pas un compte interne** de l'équipe, et qui n'est **pas déjà dans le journal d'envoi**. Un profil masqué par l'équipe n'est pas lu. Le rapport compte les exclus par raison, dans cet ordre, chaque compte une seule fois : `unconfirmed`, `blocked`, `unsubscribed`, `internal`, `alreadyHandled`.

- **Le consentement.** Il n'y a pas de case « courriels de service » dans les comptes. La base légale est l'intérêt légitime, déjà écrite dans la politique de confidentialité (« Nous pouvons aussi vous écrire au sujet de votre page et du service (nouveautés, conseils, rappels) ; chaque email permet de se désinscrire »). La politique couvre donc ce courriel : **elle n'est pas modifiée** et `tests/fixtures/legal-pages-text.json` non plus. Le seul refus qui existe est la désinscription des relances (issue 1006, `reminder-states.unsubscribedAt`) : elle est respectée.
- **À regarder avant d'envoyer : les comptes non confirmés.** L'import de l'ancien site marque comme non confirmé un compte que l'ancien site n'avait pas confirmé (`scripts/migration/import/accounts.ts`). Ils sont exclus, c'est la règle demandée, et ce sont peut-être justement des comptes Facebook ou jamais ouverts. Le nombre sort dans le rapport (`excluded.unconfirmed`) : Andy décide s'il veut les atteindre autrement.
- **La désinscription** est le lien des relances (`/api/reminders/unsubscribe?token=…`, un clic, sans connexion, jeton signé sans adresse). Une personne qui l'ouvre ne reçoit plus ni rappels ni courriels d'information. La phrase de la page de confirmation le dit (changée avec cette issue : « plus de rappels ni de courriels d'information »).

## La commande

```sh
bun run members:mail [--report <fichier>] [--send-log <fichier>] [--send --limit <n>] [--bench-sample]
                     [--remote-target --expected-database <nom>]
```

**Sans option, c'est une liste à blanc.** Rien ne part. La commande lit les profils et les comptes, écrit un rapport JSON (`.members-mail/report.json`, ou `--report`) et dit les nombres. Le rapport contient : le mode, les profils lus, les masqués, les destinataires, les exclus par raison, les profils déjà complets, combien de destinataires manquent de chaque condition, et les **numéros de profil** des destinataires. Jamais un nom, une adresse, un texte ni un lien : ni dans le rapport, ni dans les lignes affichées, ni dans le journal d'envoi.

**Envoyer exige les quatre verrous ensemble :**

1. `--send` ;
2. `MEMBERS_MAIL_SEND=on` dans l'environnement (exactement `on`) ;
3. un plafond de la passe, `--limit <n>` (50 par défaut, 500 au plus) ;
4. un journal d'envoi, `--send-log <fichier>`.

`--send` avec un verrou manquant est refusé (code 1), la raison est dite, rien ne part et rien n'est lu. La variable ou le journal sans `--send` ne changent rien : c'est une liste. Le test `tests/unit/members-mail.test.ts` joue chaque combinaison et compte les appels à la porte d'envoi (zéro).

**Le journal d'envoi** est un fichier, hors de la base : une ligne `{"profile":12,"status":"attempt","at":"…"}`, puis `sent` ou `failed`. Il ne porte que des numéros de profil et des dates.

- La ligne `attempt` est écrite et synchronisée sur le disque **avant** que le courriel parte. Un plantage entre les deux laisse un `attempt` sans suite : ce compte est sauté ensuite, car on ne sait pas si le courriel est parti. Manquer un courriel se répare à la main, écrire deux fois à la même personne non.
- Un numéro présent dans le journal est sauté à la passe suivante, **quel que soit son état**, y compris `failed` : aucune reprise automatique. Pour retenter un échec, regarde la cause, puis retire sa ligne à la main.
- Une seule passe à la fois : le fichier `<journal>.lock` est créé de façon exclusive. Si une passe s'arrête brutalement, il reste ; regarde le journal, puis supprime le `.lock`.
- **Garde-le sur un disque qui survit.** Un journal perdu, c'est le prochain lot qui réécrit à tout le monde. Mets-le hors du dossier du dépôt, sauvegardé (par exemple le dossier personnel d'Andy), et copie-le avant tout changement de poste.

**Où la commande tourne.** L'image déployée ne contient ni `bun` ni `scripts/` : comme `admin:create`, la commande se lance depuis le poste d'Andy, sur une ouverture **temporaire** de la base de production (README, « Créer un compte admin »), avec `--remote-target --expected-database <nom de la base>` (le nom que `current_database()` doit donner : une adresse mal copiée est refusée avant de lire). Les variables se posent sur la ligne de commande, jamais dans un fichier : `DATABASE_URI`, le **même** `PAYLOAD_SECRET` que la production (sinon les liens de désinscription ne valent rien), `NEXT_PUBLIC_SITE_URL=https://my-makeup.fr`, et pour envoyer le relais (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`). Refermer l'ouverture de la base aussitôt après. La liste à blanc n'a besoin d'aucun relais.

## Lancer, dans l'ordre

1. **La liste à blanc**, sans `--send` : lis le rapport. Les nombres ont-ils l'ordre de grandeur attendu ? Combien de comptes non confirmés ?
2. **Un exemple sur le banc** : `bun run bench:members-mail --bench-sample` écrit un courriel d'exemple (un profil fictif qui manque d'une photo et d'une prestation, un lien fictif) dans la sonde de courrier du banc. Il refuse hors du banc. Ouvre la sonde (Mailpit du banc) pour le relire.
3. **Un petit lot de départ**, pour vérifier à l'œil que le courriel arrive bien : `MEMBERS_MAIL_SEND=on bun run members:mail --send --limit 5 --send-log <journal> …`. Regarde la boîte d'une adresse à Andy parmi les destinataires, ou fais d'abord une passe avec `--limit 1`.
4. **Les lots suivants**, avec le même `--send-log` et `--limit 50` : la commande saute ceux qui sont déjà dans le journal et prend les suivants par numéro de profil. Une pause de 0,6 seconde sépare deux courriels. Relis `remaining` dans le rapport, jusqu'à zéro.

**Arrêter.** `Ctrl+C` coupe la commande (le courriel en cours est dans le journal : `attempt`, au pire sans suite). Pour l'arrêter proprement entre deux courriels depuis un autre terminal : crée le fichier `<journal>.stop` (`touch <journal>.stop`) ; la passe finit le courriel en cours, s'arrête avant le suivant (`stopped: true`), puis supprime le `.stop` à la main avant de reprendre.

**Lire le journal.** `grep -c '"sent"' <journal>` compte les envoyés, `grep '"failed"' <journal>` donne les numéros en échec, `grep -c '"attempt"'` moins `sent` et `failed` donne les `attempt` sans suite (courriels dont on ne sait pas s'ils sont partis). Un numéro de profil se retrouve dans l'administration ; le journal ne dit rien d'autre.

## Ce qui n'est pas fait, exprès

- Aucun envoi, aucune liste réelle : les nombres de la production n'ont pas été lus pour ce ticket.
- Pas de planification, pas de tâche quotidienne : un geste d'Andy.
- Pas de migration ni de collection : le journal est un fichier.
