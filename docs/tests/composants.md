# Tester un composant React sans navigateur

Un composant React se teste seul, dans la suite unitaire. `bun test` le rend dans une fausse fenêtre (jsdom), clique, saisit, puis lit ce que la page affiche. Aucun navigateur, aucun serveur, aucun réseau : le fichier d'exemple, lancé seul, passe en moins d'une seconde.

Ce banc vérifie ce qu'un composant affiche et ce qu'il fait d'un clic ou d'une saisie. Ce qui dépend d'un vrai navigateur (mise en page, navigation entre deux pages, session) se vérifie dans les essais de bout en bout.

## Écrire un test

Le fichier se range dans `tests/unit/`, en `*.test.tsx`.

```tsx
import { expect, test } from 'bun:test'
import { Compteur } from '@/components/Compteur'
import { openWindow } from '../outils/dom-react'

const fenetre = openWindow()

test('un clic ajoute un', async () => {
	const zone = await fenetre.monter(<Compteur />)

	await fenetre.cliquer(fenetre.bouton('Ajouter'))

	expect(zone.querySelector('p')?.textContent).toBe('1 clic')
})
```

`openWindow()` s'appelle en haut du fichier, ou en haut d'un `describe`. La fenêtre s'ouvre avant le premier test, ce qu'un test a rendu est retiré après lui, et la fenêtre est rendue après le dernier test.

`tests/unit/banc-composants.test.tsx` montre chaque geste sur de petits composants : un compteur, un champ, une liste, une case à cocher, un formulaire `react-hook-form`, un chargement.

Lancer un seul fichier, depuis la racine du dépôt :

```sh
bun --no-env-file test tests/unit/banc-composants.test.tsx
```

## Les gestes

| Geste | Effet |
|---|---|
| `await fenetre.monter(<Composant />)` | Rend le composant dans la page et renvoie le nœud qui le contient |
| `await fenetre.cliquer(element)` | Clique comme une personne : bouton enfoncé, focus, bouton relâché, clic |
| `await fenetre.saisir(champ, 'Léa')` | Donne le focus au champ, puis saisit la valeur. Dans une liste, choisit l'option de cette valeur |
| `fenetre.bouton('Enregistrer')` | Le bouton de ce nom : son `aria-label`, sinon son texte |
| `fenetre.champ('Prénom')` | Le champ de cette étiquette : son `<label>`, sinon son `aria-label` |
| `await fenetre.attendre(() => zone.querySelector('[role="alert"]'))` | Attend que la fonction renvoie quelque chose, et le renvoie. Échoue après une seconde (`{ max: 2000 }` pour deux) |
| `await fenetre.demonter()` | Retire ce qui a été rendu. Fait après chaque test : à appeler seulement pour tester un démontage |
| `fenetre.w` | La fenêtre jsdom : `fenetre.w.document`, `fenetre.w.KeyboardEvent`… |

`bouton` et `champ` prennent un texte exact ou une expression régulière. Ils trouvent un élément et un seul : sinon l'erreur liste les boutons ou les champs de la page. Un second argument limite la recherche à un nœud : `fenetre.bouton('Supprimer', ligne)`.

Une case à cocher ou un bouton radio se cliquent. `saisir` est réservé aux champs de texte et aux listes.

## Ce que le test voit de la fenêtre

Pendant les tests du fichier, ces noms sont ceux de la fenêtre, comme dans un navigateur :

`window`, `document`, `navigator`, `Node`, `Element`, `HTMLElement`, `EventTarget`, `Event`, `CustomEvent`, `FormData`, `Blob`, `File`, `FileList`.

- Un autre nom se demande à l'ouverture : `openWindow({ noms: ['localStorage'] })`.
- `fetch`, `URL`, `AbortController` et les minuteurs restent ceux de bun.
- En dehors de ces tests, il n'y a pas de `window`. Un fichier de test qui n'ouvre pas de fenêtre n'en a jamais : le code du serveur se teste comme sur le serveur.

## Règles

- **Un seul `openWindow()` par fichier**, ou un par `describe`. Un second pendant que le premier est ouvert est refusé.
- **Les gestes s'appellent dans un test**, pas au chargement du fichier : la fenêtre n'existe pas encore.
- **Aucun réseau.** `XMLHttpRequest` et `WebSocket` sont coupés dans la fenêtre. Un composant qui enregistre reçoit sa fonction d'envoi en propriété, et le test lui en passe une fausse.
- **Aucun fichier d'environnement.** `bun run test:unit` passe `--no-env-file`. Pour un seul fichier, l'écrire soi-même : `bun test` seul lit le `.env`.
- **Un nettoyage qui touche la page va dans un `afterEach`.** Un `afterAll` écrit après `openWindow()` passe une fois la fenêtre rendue.
- **Les tests se lancent depuis la racine du dépôt** : c'est là que `bunfig.toml` charge le préchargement.

## Le préchargement

bun joue tous les fichiers de test d'un lancement dans un seul processus, et un module n'y est chargé qu'une fois. Deux bibliothèques regardent, à ce moment-là, s'il y a un navigateur, et gardent la réponse jusqu'à la fin :

| Bibliothèque | Chargée sans fenêtre |
|---|---|
| `react-dom/client` | React n'écoute plus l'événement `input` : `onChange` ne part plus, aucun test ne peut saisir |
| `react-hook-form` | Chaque champ passe pour détaché de la page, et `reset()` ne remet plus le formulaire natif à zéro |

Le fichier qui les charge en premier dépend de l'ordre du lancement : la panne changerait de place d'une machine à l'autre.

`tests/support/preload-react-dom.ts` les charge donc avant tout fichier de test (`bunfig.toml`, section `[test]`), dans une fenêtre rendue aussitôt.

- Une bibliothèque qui lit `window` ou `document` à son chargement s'ajoute à la liste `MODULES_PROBE_DOM` de ce fichier, avec son test dans `tests/unit/banc-composants.test.tsx`.
- Le message « le préchargement doit passer avant… » veut dire que `bun test` n'a pas lu `bunfig.toml` : il a été lancé ailleurs qu'à la racine du dépôt.
- Chaque lancement de `bun test` paie ce préchargement, même pour une fonction pure : environ une demi-seconde, presque entièrement le chargement de jsdom. Mesuré le 14/10/2026 sur le poste de développement : un test de fonction pure passe de 10 ms à 480 ms.

## Limites de jsdom

- Pas de mise en page : les tailles et les positions valent zéro, rien n'est visible ou caché par le CSS.
- Pas de `matchMedia`, d'`IntersectionObserver` ni de `ResizeObserver`.
- Pas de navigation : un clic sur un lien ne change pas de page.
- jsdom ne livre pas ses types. `tests/support/jsdom.d.ts` déclare les trois membres dont le banc se sert.

## Dépendance

jsdom 30.1.2 est la seule dépendance ajoutée, en développement seulement. Elle demande undici 8, alors que le dépôt force undici 7.29.1 pour Payload. Le banc n'en souffre pas : sous bun, `undici` est le module intégré de bun, pas ce paquet, et le réseau de la fenêtre est coupé. Sous Node, avec undici 7.29.1, `XMLHttpRequest` de jsdom ne répond pas : jsdom ne se lance que par `bun test`.
