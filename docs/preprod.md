# La préprod de la v3

La préprod est la v3 en ligne, fermée au public : `https://preprod.my-makeup.fr`. Coolify la construit avec le `Dockerfile` du dépôt et la redéploie à chaque poussée sur `v3`. Elle est derrière un accès protégé (HTTP Basic), porte la consigne `noindex` et n'envoie aucun mail. Sa base est à elle, non publique, et jetable jusqu'à la fin du schéma provisoire (ticket 049) : elle ne reçoit que des données fictives.

Ce document dit ce que fait la préprod quand elle démarre (ticket 027), comment la remettre à zéro, et comment la CI la contrôle.

## Ce qu'elle fait au démarrage

La première requête qui arrive après un démarrage (le contrôle de santé de l'image, une visite) démarre Payload, qui joue les migrations de `src/migrations/`. Ensuite, sur la préprod seulement :

1. **Remise à zéro**, si `PREPROD_REMISE_A_ZERO` porte un jeton nouveau (voir plus bas).
2. **Base déjà remplie ?** Si l'une des collections qu'écrit l'import (`pros`, `profils`, `talents`) contient un document, rien d'autre ne se passe : la base est gardée telle quelle. Un compte admin seul ne compte pas.
3. **Base vide** : l'application pose la fausse base Strapi du banc de test ([`tests/source-strapi.md`](tests/source-strapi.md)) à côté de sa base, sur le même serveur PostgreSQL : une base `strapi_source_preprod`, lue par un rôle en lecture seule, `lecture_strapi_preprod`, dont le mot de passe est tiré au démarrage et n'existe qu'en mémoire. Puis elle lance l'import réel de cette source ([`migration/IMPORT.md`](migration/IMPORT.md)), avec la table de décision du banc.
4. Le profil fictif 21 est alors en ligne : `https://preprod.my-makeup.fr/profil/zoe-lefevre`, son nom en titre.

Ce qui est garanti :

- **Jamais ailleurs que sur la préprod.** La préprod est un build de production servi depuis `https://preprod.my-makeup.fr` (`NEXT_PUBLIC_SITE_URL`). Sur le site, sur un poste, dans les tests ou pendant `next build`, rien ne se passe ; la tâche appelée hors de la préprod refuse avant de rien lire (test ciblé : `tests/unit/preprod.test.ts`).
- **Aucune donnée réelle.** La source posée est celle du banc, entièrement fictive : noms inventés, adresses en `@example.test`, téléphones de la plage réservée à la fiction. L'adresse d'une vraie base Strapi (`STRAPI_SOURCE_URI`) n'est jamais lue. La source ne porte pas de photos : la préprod n'a pas encore de stockage (ticket 043), et les fichiers de la source nomment un hôte qui n'existe pas (`medias.source-fictive.example.test`).
- **L'application sert toujours.** Une erreur du démarrage est écrite dans le journal par son type et son code, jamais par son texte, et le site continue de répondre. Le contrôle de la CI trouve alors la page du profil fictif absente.
- **Un processus qui migre ne fait rien** : `payload migrate`, ou la commande de l'import, qui posent `PAYLOAD_MIGRATING`.

Le code : `src/preprod/au-demarrage.ts` (le crochet `onInit` de Payload, dans `src/payload.config.ts`) et `src/preprod/tranche.ts` (la tâche). L'import est celui de `scripts/migration/import/`, lancé dans le processus de l'application avec le client PostgreSQL de Payload (`source-pg.ts`) : l'image n'a pas bun. La fausse source se crée par les mêmes instructions que sur le banc (`tests/outils/source-strapi/creation.ts`). Ces fichiers et la table de décision du banc sont les seuls de `scripts/` et de `tests/` que `.dockerignore` laisse entrer dans le build.

## Le journal de démarrage

Chaque ligne commence par `[preprod]`. Elles se lisent dans l'onglet « Logs » de l'application dans Coolify, ou par son API (`GET /api/v1/applications/<uuid>/logs`). Elles ne portent que des nombres et des identifiants de l'ancienne base : ni nom, ni email, ni hash. Sur une base vide :

```text
[preprod] Base vide (pros 0, profils 0, talents 0) : la fausse source Strapi est posée, puis importée.
[preprod] Fausse source Strapi posée à côté de la base : 16 tables, … lignes, toutes fictives.
[preprod] Import réel.
[preprod] Comptes : 17 à la source ; 14 créations, 0 mise à jour, 0 inchangé, 0 refusé
[preprod] Profils : 27 à la source ; 13 créations, 0 mise à jour, 0 inchangé, 0 refusé
[preprod] Talents : 3 à la source ; 3 créations, 0 mise à jour, 0 inchangé, 0 refusé
[preprod] …
[preprod] Import de démarrage fini, code 0 : fini, parité complète.
```

Aux démarrages suivants, une seule ligne : `Base déjà remplie (pros 14, profils 13, talents 3) : pas d’import au démarrage.`

Le code de l'import a le sens de la commande ([`migration/IMPORT.md`](migration/IMPORT.md), « Codes de sortie ») : 5 veut dire « documents refusés, en attente d'une décision », jamais un succès.

## Remettre la préprod à zéro

La remise à zéro efface **toute** la base de la préprod (les comptes admin compris) et sa fausse source, rejoue les migrations sur une base vide, puis repose et réimporte la source. Elle sert à repartir de rien : après un changement de migration qui ne s'applique pas sur l'ancienne base (la migration `init` du ticket 049), ou après un import interrompu.

1. Dans Coolify, sur l'application de préprod, poser la variable `PREPROD_REMISE_A_ZERO` avec un jeton nouveau : 8 à 64 caractères, minuscules, chiffres et tirets, par exemple la date, `2026-10-15-matin`. Variable d'exécution seulement : jamais « Build Variable ».
2. Redéployer (ou redémarrer) l'application.
3. Lire le journal : `Remise à zéro « 2026-10-15-matin » faite : … migrations rejouées sur une base vide.`, puis l'import.

Gardes :

- **Une fois par jeton.** Le jeton est écrit sur le schéma de la base une fois la remise faite. Un redémarrage avec le même jeton n'efface rien (`Remise à zéro « … » déjà faite : rien n’est effacé.`). La variable peut donc rester posée ; un jeton nouveau refait une remise.
- **Refusée hors de la préprod.** Posée sur le site, sur un poste ou dans un build qui n'est pas celui de la préprod, la variable arrête l'application au démarrage, avant toute connexion (README, « Variables d'environnement »). Un jeton mal formé aussi.
- Sans migration à rejouer, la remise est refusée avant d'effacer quoi que ce soit.
- Le premier compte admin est à recréer après une remise (à la première visite de `/admin`).

## Le contrôle de la CI

`.github/workflows/preprod.yml` tourne à chaque poussée sur `v3`, et à la main (« Run workflow »). Il attend que la préprod serve le commit poussé (la `version` de `/api/health`, 20 minutes au plus), puis lit la page du profil fictif : 200, et « Zoé Lefèvre » dans le seul `h1` du HTML du serveur. Ce n'est pas un check requis : rouge, il dit que la préprod est en retard ou cassée, sans bloquer aucune fusion.

Il lit deux secrets du dépôt, à poser par Andy dans GitHub (Settings › Secrets and variables › Actions) : `PREPROD_BASIC_AUTH_USER` et `PREPROD_BASIC_AUTH_PASSWORD`, l'accès protégé de la préprod. Sans eux, le contrôle échoue et le dit. Il n'installe aucune dépendance : aucun code tiers ne tourne à côté des secrets, et le script ne les affiche jamais.

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

## Les tests

- `tests/unit/preprod.test.ts` : où est la préprod, la variable de remise refusée ailleurs, la tâche qui refuse hors de la préprod sans rien toucher, le crochet branché dans la configuration de Payload, la source posée à côté de la base et entièrement fictive.
- `tests/integration/preprod-demarrage.test.ts` : sur le banc, le démarrage sur une base vide (source posée, import, page du profil fictif), le second démarrage qui n'écrit rien, la remise à zéro une fois par jeton et le schéma qu'elle reconstruit, et le lecteur `pg` de la source, qui lit comme celui de bun.
