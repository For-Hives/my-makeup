# Qualité

Ce document garde les règles de qualité de la v3 : comment on teste, les sept règles des listes éditées en place, et ce qu'un écran doit tenir à 390 px. Ce sont des critères permanents : ils valent pour chaque ticket, sans être recopiés dans chacun.

- Quand un travail est fini, et à quel rythme lancer les tests : [`AGENTS.md`](../AGENTS.md).
- Commandes, architecture, interdits et pièges : [`CLAUDE.md`](../CLAUDE.md).

Un test garde ce document et les deux guides : `bun --no-env-file test tests/unit/guides-agents.test.ts`. Il échoue si une commande citée n'existe pas, si un lien ne mène nulle part, ou si l'une des sept règles de liste disparaît.

## 1. Pourquoi les suites entières ne tournent qu'une fois

La règle est dans [`AGENTS.md`](../AGENTS.md) : tests ciblés pendant le travail, suites entières une fois à la fin, puis en CI.

Elle vient d'une mesure faite sur le site en ligne le 13/10/2026. Cinq petits correctifs avaient demandé environ 50 lancements de tests en 2 h 46, soit près de 3 000 tests joués pour 30 tests ajoutés : chaque preuve était rejouée par l'auteur, par chaque relecteur et par le correcteur. Le chantier suivant, deux correctifs menés avec la règle actuelle, a pris 34 minutes et 5 lancements.

Le nombre de lancements pèse plus que la durée de chacun. Une suite entière rejouée « pour être sûr » ne trouve rien de plus que la précédente.

## 2. Règles des tests

1. **Un défaut corrigé a son test, vu rouge avant le correctif.** Une seule preuve suffit : le test échoue sur l'ancien code et passe sur le nouveau.
2. **Une garde est prouvée rouge.** Un test qui garde un document, une configuration ou une règle porte son exemple fautif : on lit dans le même fichier ce qu'il refuse.
3. **Une saisie se teste comme elle se fait : caractère par caractère.** Un test qui remplit un champ d'un coup ne voit pas un focus perdu en cours de frappe (règle L2 ci-dessous).
4. **On attend un état, jamais une durée.** `fenetre.attendre` dans un test de composant, les attentes de Playwright dans un essai de bout en bout.
5. **Aucun test oublié en `.only` ou en `.skip`.** Biome les refuse dans `tests/`.
6. **Le code reçoit ses dépendances.** L'envoi d'un email, le stockage et l'horloge sont passés en paramètre, et le test en donne de faux. Aucun module n'est remplacé à la volée (`mock.module`). Un appel HTTP sortant se simule avec MSW.
7. **Une seule règle par sujet, testée en unitaire.** La complétude d'un profil, le slug, la zone, le prix et les URL gelées ont chacun leur fichier dans `src/lib/`. Le reste du code les appelle et ne refait pas le calcul.
8. **Aucune donnée réelle, aucun service réel.** Les fixtures sont fictives : noms inventés, adresses en `@example.test`, téléphones de la plage réservée à la fiction. La garde d'environnement arrête tout lancement qui pourrait toucher autre chose que le banc local ([`README.md`](../README.md), « La garde d'environnement »).
9. **Chaque événement de mesure est testé.** Un événement émis deux fois, ou jamais, fausse les chiffres de la semaine : son test prouve qu'il part une fois.

Tester un composant React sans navigateur : [`docs/tests/composants.md`](tests/composants.md).

## 3. Listes éditées en place : sept règles

Une liste éditée en place est une liste que la maquilleuse modifie ligne par ligne dans son espace : les puces (langues, compétences), les lignes avec un formulaire (expériences, formations, prestations et leurs options), les photos du portfolio.

Ces sept règles viennent des défauts trouvés puis corrigés sur le site en ligne en octobre 2026 (les numéros de PR sont ceux de ce dépôt). Elles valent pour toute liste de la v3. Un ticket qui pose ou change une liste les rejoue toutes, avec un test par règle, dont le titre reprend le numéro (L1 à L7).

1. **L1. Un identifiant par ligne.** Chaque ligne reçoit à sa création un identifiant qui lui est propre et qui ne change plus. Il ne vient jamais de son contenu.
   - Test : deux lignes de même contenu ; retirer ou modifier l'une laisse l'autre intacte.
   - Origine : deux lignes identiques partageaient leur identifiant, « Retirer » supprimait les deux et « Modifier » écrasait les deux (corrigé le 13/10/2026, PR #966 et #968).
2. **L2. La frappe garde le focus.** Saisir dans un champ d'une ligne ne déplace jamais le focus, y compris juste après un enregistrement. La clé d'affichage d'une ligne ne dépend pas de ce qu'on y saisit.
   - Test : juste après un enregistrement, saisir 20 caractères un par un dans chaque champ ; le champ garde le focus et reçoit les 20 caractères.
   - Origine : après un enregistrement, les champs d'une option perdaient le focus à chaque caractère, et aucun test ne le voyait (en ligne du 10/10 au 13/10/2026, corrigé par la PR #964).
3. **L3. Retirer la ligne en cours de modification ne perd rien.** Le formulaire repasse en « Ajouter » et garde ce qui était saisi.
   - Test : ouvrir une ligne par « Modifier », changer un champ, retirer cette ligne ; le formulaire est en ajout et le champ a gardé sa valeur.
   - Origine : la modification en cours était perdue (corrigé le 13/10/2026, PR #966 et #968).
4. **L4. Après un retrait, le focus reste dans le panneau.** Il va sur la ligne qui prend la place de la ligne retirée, ou sur celle du dessus. Quand la liste devient vide, il va sur le formulaire d'ajout. Une exception : après un clic ou un tap, il ne va jamais sur un champ de saisie, qui ouvrirait le clavier du téléphone ; il va alors sur le titre du panneau.
   - Test : après chaque retrait, au clavier puis au clic, l'élément qui a le focus est dans le panneau ; un cas pour la dernière ligne, un cas pour la seule ligne.
   - Origine : le focus tombait hors du panneau, à une tabulation de « Sauvegarder » (corrigé le 13/10/2026, PR #964, #968 et #972).
5. **L5. Chaque retrait est annoncé.** Une zone `role="status"`, présente et vide dès l'ouverture du panneau, reçoit une phrase qui nomme ce qui part. Deux retraits de même nom sont annoncés deux fois.
   - Test : la zone existe avant le premier retrait ; après un retrait, elle nomme la ligne retirée ; après le retrait d'une seconde ligne de même nom, l'annonce est renouvelée.
   - Origine : un retrait n'était pas dit aux lecteurs d'écran (corrigé le 13/10/2026, PR #969).
6. **L6. Un doublon est refusé, et le refus est dit.** Une ligne identique à une ligne de la liste n'est pas ajoutée, et un message visible le dit près du formulaire. Une ligne ouverte par « Modifier » et validée sans changement est acceptée.
   - Test : ajouter deux fois la même ligne ; la liste garde une ligne et le message s'affiche. Valider une ligne sans la changer ; aucun message, le formulaire repasse en ajout.
   - Origine : le bouton ne faisait rien, sans un mot (corrigé le 13/10/2026, PR #969 et #970).
7. **L7. Entrée maintenue n'agit qu'une fois.** Sur un bouton, la touche Entrée tenue enfoncée donne un seul ajout, un seul retrait, un seul enregistrement. Dans un champ de texte long, elle garde son effet : des retours à la ligne.
   - Test : envoyer au bouton un appui sur Entrée, puis ses répétitions (`repeat: true`) ; une seule action a eu lieu.
   - Origine : Entrée maintenue retirait les lignes l'une après l'autre, puis validait le formulaire (corrigé le 13/10/2026, PR #969).

Ce que ces tests ne prouvent pas : le rendu d'un vrai lecteur d'écran et le clavier d'un vrai téléphone. Les deux se vérifient à la main, à la recette.

## 4. Un écran se regarde à 390 px

390 px est la largeur de téléphone de référence de la v3. Tout changement d'un écran se termine par une capture à cette largeur, regardée avant de dire « fini » :

```sh
bunx playwright screenshot --viewport-size=390,844 --full-page http://127.0.0.1:3000/ /tmp/capture-390.png
```

L'adresse est celle de la page changée, sur le serveur local (`bun run dev`). La capture s'écrit hors du dépôt.

Ce qu'on y cherche :

- aucun débordement horizontal, aucun texte coupé ;
- un seul titre principal ;
- l'action principale de la page visible et atteignable au doigt ;
- ni « undefined », ni « null », ni image cassée.

## 5. Biome et TypeScript

La configuration de Biome est celle du dépôt de référence, PortefolioAndy. Elle monte de version en même temps dans les deux dépôts. Les écarts sont voulus :

| Sujet | Dépôt de référence | Ici | Pourquoi |
|---|---|---|---|
| Fichiers vus par Biome | Les sources et les « stories » | Les sources, `tests/` et `scripts/` | Pas de « stories » ici ; les tests sont tenus aux mêmes règles, et un `.only` ou un `.skip` oublié est une erreur |
| Node | 25 | 24 (`.nvmrc`) | Version maintenue jusqu'au 30/04/2028 |
| Essais de bout en bout | `*.spec.js` | `*.spec.ts` | TypeScript partout |
| `tsconfig.json` | `strict` | `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch` | Code neuf : aucun coût de reprise |

Une règle que la configuration ne dit pas : `dangerouslySetInnerHTML` n'est accepté que pour du markdown converti et assaini côté serveur, et pour des données structurées sérialisées par le code. Jamais pour un texte saisi tel quel.
