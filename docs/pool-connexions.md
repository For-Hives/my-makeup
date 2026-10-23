# Le pool de connexions à la base

Ticket 268 (suite du 222). Ce que le pool fait, pourquoi la CI du 21/10/2026 a échoué avec « timeout exceeded when trying to connect », ce que l'on a mesuré, et comment on le règle.

## Ce que le pool fait

Payload ouvre un pool `pg` par processus (`src/lib/pool-base.ts`, lu par `src/payload.config.ts`). Une requête qui a besoin de la base prend une connexion libre, la garde le temps de son travail, puis la rend. Quand les connexions sont toutes prises, la requête suivante attend. `pg` attend par défaut pour toujours : si les connexions ne reviennent jamais, l'application cesse de répondre. Le ticket 222 a donc fixé un délai (5 secondes par défaut) : passé ce délai, la requête échoue avec « timeout exceeded when trying to connect » (un 500, ou un 503 pour `/api/health`) et le pool sert les suivantes dès qu'une connexion revient. Une erreur franche, jamais un blocage.

## Les réglages

| Variable | Défaut | Bornes | Rôle |
|---|---|---|---|
| `DATABASE_POOL_MAX` | 10 | 1 à 50 | Connexions ouvertes au plus par processus |
| `DATABASE_POOL_TIMEOUT_MS` | 5000 | 1000 à 30000 | Attente la plus longue d'une connexion libre |

Une valeur hors bornes arrête le démarrage, et le message nomme la variable sans montrer la valeur (`src/lib/env.ts`). `0` est refusé pour le délai : `pg` le lit comme « attendre pour toujours », le blocage que le délai existe pour éviter.

**Défaut de 10 connexions, et la marge.** C'est le défaut de `pg`. Un conteneur de production en ouvre 10 au plus ; PostgreSQL en accorde 100 (`max_connections`), dont 3 réservées à l'administration. Il reste donc plus de 85 connexions pour l'import, les scripts d'administration et le chevauchement de deux conteneurs pendant un déploiement. Un `next build` n'ouvre aucune connexion. Si un jour plusieurs conteneurs partagent la base, la somme de leurs `DATABASE_POOL_MAX` doit rester sous 90.

## La cause de l'échec de la CI (run 39607132030, lot `e2e (2/4)`, commit 4a5176a8)

L'erreur sortait d'une route de l'API de Payload (`beginTransaction`, dans `/api/pros`), pendant `E41 : 45 résultats en trois pages` : la fabrique de profils créait alors **cinq comptes à la fois** par l'API de l'application, pendant que l'autre travailleur de Playwright parcourait les 86 adresses de `host-check` (I45). Le serveur a 5 connexions, et deux travailleurs en demandaient davantage.

Réponses aux trois questions du ticket, mesurées sur le banc (instance `mm-268`, `pg_stat_activity` échantillonné toutes les 25 ms) :

1. **Plusieurs processus se partagent-ils les 5 connexions ?** Non. `next start` n'a qu'un processus serveur qui porte le pool : `ss` montre 5 connexions de ce seul processus. Les autres connexions de `pg_stat_activity` ne sont pas celles du serveur (les essais et le banc ouvrent les leurs) : elles ne comptent pas dans les 5, mais comptent dans les 100 de PostgreSQL (pic de 12 à 14 connexions pour le lot, très loin de 100).
2. **Une requête garde-t-elle une connexion pendant qu'elle en demande une seconde ?** Pas dans ce cas : le patch de Payload du ticket 222 a fermé cette classe. Mais une création de compte **garde sa connexion pendant tout le hachage du mot de passe** : la transaction est ouverte avant le calcul. Sous charge, l'échantillon montre des connexions « idle in transaction » : 4 actives et 4 en transaction ouverte avec 5 connexions, 9 et 9 avec 10. Ces transactions n'attendent pas la base (la requête SQL est finie), elles attendent le calcul du hachage, qui passe par les 4 fils de travail par défaut de Node et par le processeur : c'est notre lecture de la mesure, pas une trace du hachage lui-même. Plus le processeur est occupé (un exécuteur de CI à 4 cœurs qui fait aussi tourner deux navigateurs et le serveur), plus la connexion est gardée longtemps.
3. **Une page fait-elle trop de requêtes en série ?** Non. La page d'un profil, la recherche et `/api/health` rendent 0 erreur à 30 requêtes simultanées, la plus lente en 383 ms ; le pic est de 5 connexions, atteint par les seules écritures.

Cause : une rafale de créations de comptes (10 en même temps pour 5 connexions) qui gardent chacune leur connexion le temps d'un hachage, sur un exécuteur dont le processeur est saturé, jusqu'à ce que l'attente d'une connexion dépasse 5 secondes. Ce n'est ni une fuite de connexions, ni une page trop bavarde. La fabrique ne crée plus que deux comptes à la fois depuis le ticket 176 (`tests/support/profile-factory.ts`).

**Ce que l'on n'a pas pu reproduire.** Le même lot (`--shard=2/4 --workers=2`, sous `taskset` limité à 4 cœurs, `CI=1`) a rendu 152 réussis, 0 échec, 0 « timeout exceeded », avec l'ancienne taille de 5 : le pic de transactions ouvertes à la fois était de 3. Le défaut est une course rare, qui demande un exécuteur plus lent que ce poste. Le critère « CI verte deux fois de suite » se juge sur GitHub, après la fusion.

## Les mesures

Outil : `bun run perf:pool-load` (`scripts/perf/pool-load.ts`), sur le banc seulement, application lancée (`bun run bench:full`, puis `bun run bench:session admin` pour `--writes`).

```sh
BENCH_INSTANCE=mm-268 BENCH_OFFSET=368 bun run perf:pool-load --requests 30 --rounds 5
BENCH_INSTANCE=mm-268 BENCH_OFFSET=368 bun run perf:pool-load --requests 30 --rounds 3 --writes 20
BENCH_INSTANCE=mm-268 BENCH_OFFSET=368 bun run perf:pool-load --requests 30 --rounds 1 --lock --lock-seconds 12
```

Mesuré le 21/10/2026 (banc sur ce poste, 8 cœurs) :

| Essai | Réglage | Résultat |
|---|---|---|
| 30 requêtes à la fois (profil, recherche, santé), 5 vagues | 5 connexions | 150 sur 150 en 200, la plus lente 383 ms |
| 30 lectures et 20 créations de comptes à la fois, 3 vagues | 5 connexions | 0 erreur, la plus lente 1,7 s, pic de 5 connexions |
| La même chose | 10 connexions (défaut) | 0 erreur, la plus lente 2,0 s, pic de 10 connexions |
| Processeur limité à 2 cœurs (`taskset`), 30 lectures et 20 créations, 3 passes de 3 vagues | 5 connexions | 1 erreur sur 450 requêtes (une santé en 503), la plus lente 3,4 s |
| La même chose | 10 connexions | 0 erreur, la plus lente 3,3 s |
| Processeur limité à 2 cœurs, 40 créations, 3 passes | 5 connexions | 0 erreur, la plus lente 5,6 s |
| La même chose | 10 connexions | 2 erreurs sur 630 requêtes (deux santés en 503), la plus lente 5,5 s |
| Une session extérieure verrouille la table `profiles` 12 s, 30 requêtes à la fois | 10 connexions | Les requêtes qui ne trouvent pas de connexion échouent en 5,1 s (500), la santé répond 503 en 2,1 s au plus, aucune requête sans réponse, et `/api/health` répond 200 en 3 ms quand le verrou est levé |

Ce que ça dit :

- **Pour un trafic normal**, lectures courtes et quelques écritures, 5 connexions suffisaient déjà. 10 donnent une marge sans rien coûter à PostgreSQL.
- **Pour une rafale d'écritures sur un processeur saturé**, la taille du pool ne change pas le résultat : le goulot est le processeur qui hache. Les rares erreurs tombent aussi bien avec 5 qu'avec 10, et la tête de la file attend alors plus de 5 secondes dans les deux cas. Régler `DATABASE_POOL_MAX` plus haut n'est donc pas un remède à cette rafale, seulement une marge de lecture. Le remède de ce défaut est de limiter la rafale elle-même (la fabrique, ticket 176), pas d'allonger le pool ni le délai.
- **Quand tout est pris** (le verrou), l'erreur est franche et rapide, jamais un blocage : c'est le travail du délai.

Le test automatique de l'attente (toutes les connexions prises : la requête de trop échoue dans le délai, puis l'application répond) est `tests/integration/pool-delay.test.ts` ; les réglages de l'environnement sont jouées par `tests/unit/env.test.ts` et `tests/unit/pool-base.test.ts`.
