# Suivi des tickets : GitHub

Les tickets de My Makeup vivent dans les issues GitHub du dépôt `For-Hives/my-makeup`. Utilise la CLI `gh` pour toutes les opérations. Depuis le 23/10/2026, tout nouveau travail y est suivi. Les anciens tickets numérotés (001 à 312) sont dans le dépôt privé des plans : un numéro cité dans le code ou dans un guide renvoie à eux, pas à une issue.

## Conventions

- **Créer une issue** : `gh issue create --title "..." --body-file fichier.md --label needs-triage`. Un titre court, un corps au format de `to-tickets` (section « Ce que ça livre », « Critères d'acceptation », « Bloqué par »).
- **Lire une issue** : `gh issue view <numéro> --comments`.
- **Lister** : `gh issue list --state open --json number,title,labels --jq '.[] | {number, title, labels: [.labels[].name]}'`, avec `--label` pour filtrer.
- **Commenter** : `gh issue comment <numéro> --body "..."`.
- **Étiqueter** : `gh issue edit <numéro> --add-label "..."` ou `--remove-label "..."`.
- **Fermer** : `gh issue close <numéro> --comment "..."`.
- **Bloquants** : une section « Bloqué par » liste les issues bloquantes par leur numéro (`#123`). Une issue est libre quand tous ses bloquants sont fermés.

## Les PR ne sont pas une surface de demande

**PRs as a request surface : non.** Seules les issues passent par le tri.

## Ce qui ne doit JAMAIS figurer dans une issue

Ce dépôt est **public**. Une issue est publique dès sa création, et son historique de modifications aussi. Ni dans le titre, ni dans le corps, ni dans un commentaire :

- un secret : mot de passe, jeton, clé d'API, valeur de variable d'environnement ;
- un identifiant d'application, de base ou de service de l'hébergement, une adresse IP, un nom d'hôte interne ;
- une adresse email, un numéro de téléphone ;
- le nom ou le prénom d'une maquilleuse ou d'une cliente (dis « une maquilleuse » ; « le profil n° N » est toléré) ;
- le détail exploitable d'une faille non corrigée (signale-la en privé).

Les tickets qui touchent aux secrets ou à l'infrastructure restent dans le dépôt privé des plans. Relis le corps de chaque issue avant de la publier.

## Quand une skill dit « publier dans le tracker »

Crée une issue GitHub.

## Quand une skill dit « lire le ticket concerné »

Lance `gh issue view <numéro> --comments`.
