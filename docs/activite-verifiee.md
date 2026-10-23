# Le badge « Activité vérifiée » et le contrôle du SIRET

Issue 1004. Décision d'Andy du 23/10/2026 : **opt-in par SIRET, contrôle automatique sur l'annuaire public**.

## Ce que le badge dit

Qu'un établissement en activité existe, dans l'annuaire public des entreprises, pour le SIRET que la maquilleuse a donné. Rien d'autre : ni la qualité du travail, ni les diplômes, ni les tarifs. Les mots du badge, de son explication et de la phrase « aucun avantage » sont à un seul endroit, `src/lib/activity/badge-text.ts` ; la page `/classement` les lit, et `tests/unit/ranking-transparency.test.tsx` compare la page à la source.

## Le parcours

1. La maquilleuse donne son SIRET dans l'édition directe (`SiretBlock`, une carte privée sous la page, absente pour une visiteuse). Facultatif ; espaces acceptés ; 14 chiffres et clé de Luhn (`src/lib/profile/siret.ts`, exception du SIREN de La Poste). L'action serveur est `saveMySiret`.
2. Un hook de `profiles` (`noteSiretChange`, `resetCheckOnSiretChange`) remet à `pending` la ligne de `activity-checks` quand le numéro change, la supprime quand il est vidé. Un profil supprimé emporte sa ligne.
3. La tâche quotidienne `controle-activite` (`src/lib/tasks/activity-check.ts`) traite au plus 100 profils par jour : d'abord ceux jamais essayés, puis les essais ratés (six heures après le dernier essai), puis les badges à renouveler (le dernier contrôle a plus de 20 heures). Elle demande à l'annuaire (`src/lib/activity/registry.ts`), une demande par seconde au plus, délai de 5 secondes, et écrit la réponse et sa date.
4. Les pages publiques lisent le badge par `badgedProfiles` (une lecture bornée) : la clé `activityVerified` n'existe que si le badge est tenu. Une page sans badge a le HTML d'avant (fichiers de référence de `tests/fixtures/direct-edit/`).

## Les règles de décision

- **Actif** : l'établissement porte exactement ce numéro, son état est `A` et celui de son unité légale aussi. **Cessé** : l'un des deux est fermé (`F` pour l'établissement, `C` pour l'unité légale). **Introuvable** : aucune ligne ne porte ce numéro (une page de résultats qui en contient d'autres compte comme introuvable).
- **Aucun verdict** (donc aucun badge donné ni retiré) : délai dépassé, réseau coupé, code autre que 200, 429, JSON invalide, forme inattendue, état inconnu, deux lignes qui se contredisent. L'essai est daté, le suivant a lieu au moins six heures plus tard. Un 429 ou trois pannes de suite arrêtent la journée.
- **Introuvable et cessé sont définitifs** tant que le SIRET ne change pas : le service n'est plus appelé pour ce numéro. Seul un badge est renouvelé chaque jour. Pour relancer un « introuvable », la maquilleuse remplace le numéro.
- **La tâche n'agit qu'en production** : `activityCheck` de `src/lib/env.ts` est vrai seulement avec `NODE_ENV=production` et `NEXT_PUBLIC_SITE_URL` égal à l'adresse du site. Le banc, un poste de travail, `next dev` et toute autre installation ne l'appellent jamais. Aucune variable à régler.

## Pourquoi une collection à part

`DIRECTORY_SORT` classe par complétude, puis par date de modification (`updatedAt`). Une écriture quotidienne sur le profil renouvellerait cette date et donnerait au badge une place dans le classement. La réponse vit donc dans `activity-checks` (`src/collections/ActivityChecks.ts`), que seul un admin lit et que nul n'écrit par une API. Aucune copie du SIRET n'y est gardée.

## Vie privée

Le SIRET d'un entrepreneur individuel est une donnée personnelle. Il est lu par la propriétaire et les admins (règle de champ de `profiles.siret`, lignes de la matrice d'accès), jamais par le public, l'API publique, un journal ou un événement de mesure (tests : `tests/integration/dashboard-siret.test.tsx`, `profile-public-read.test.ts`). La politique de confidentialité a sa section (finalité, source publique, base légale, conservation, effacement avec le compte).

## Tests

Aucun test n'appelle l'annuaire : `tests/fixtures/business-registry.ts` donne les réponses simulées (actif, cessé, introuvable, plusieurs résultats, JSON invalide, délai dépassé, 429, 500), jouées par `tests/unit/business-registry.test.ts` ; la tâche est jouée avec un faux annuaire dans `tests/integration/activity-check.test.ts`.

## Pages en cache

La tâche tourne hors d'une requête de Next : un rafraîchissement peut être refusé, et la page change alors à l'expiration du cache, une heure au plus (`revalidate = 3600`).
