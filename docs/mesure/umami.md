# La mesure d'audience : Umami par le chemin `/u`, et le catalogue d'événements

La mesure du site passe par Umami, servi par le site lui-même. Une visiteuse dont le navigateur filtre le domaine de l'instance est quand même comptée, et déplacer l'instance ne change qu'une variable.

## Le chemin `/u`

| Adresse | Réponse |
|---|---|
| `GET /u/script.js` | Le traceur de l'instance, relayé |
| `POST /u/api/send` | Une mesure, relayée vers l'instance. Un `GET` répond 405 |
| tout autre chemin sous `/u` (`/u`, `/u/login`, `/u/api/autre`, `/U/script.js`…) | 404. Le tableau de bord, la connexion et le reste de l'API de l'instance ne sont jamais servis |

Le code : `src/app/u/` (trois fichiers de route) et `src/lib/analytics/relais.ts`.

**Ce que l'instance reçoit** : seulement l'agent, le type de contenu, les langues acceptées, le jeton `x-umami-cache` que son traceur rend après un envoi, et l'adresse de la visiteuse, une fois, dans `True-Client-IP` (la dernière entrée de `X-Forwarded-For`, celle que le proxy a écrite). Ni cookie, ni autorisation, ni Referer, ni adresse ou lieu écrits par le navigateur. Ce qui revient perd son `Set-Cookie`. Une redirection de l'instance n'est pas suivie.

**Coupure** : une instance muette est abandonnée après 10 secondes (504), une panne répond 502. La page n'attend jamais : le traceur est ajouté en asynchrone.

**Hors du site, rien ne part vers la vraie instance.** Le relais ne parle à une instance qui n'est pas de ce poste que si la requête vient de `my-makeup.fr` ou `www.my-makeup.fr` ; ailleurs, le script est un script vide et une mesure est reçue puis jetée. Côté navigateur, `data-domains` fait la même chose. Côté environnement, l'application refuse de démarrer avec l'instance du site sur la préprod, ou avec une instance de ce poste sur une adresse déployée.

## Le réglage

| Variable | Rôle |
|---|---|
| `UMAMI_ORIGIN` | L'instance. Absente : l'instance actuelle sur le site, rien ailleurs (`/u` répond 404). Une valeur illisible arrête l'application au démarrage |
| `NEXT_PUBLIC_UMAMI_DOMAINS` | Les hôtes que le traceur compte. Lue à la construction des pages |

L'identifiant du site Umami est public et ne change pas : il est dans le HTML de chaque page, et reste le même quand l'instance déménage avec son historique. L'étiquette (`data-tag`) est la version du build, celle de `/api/health`.

## Le script de l'en-tête

`src/lib/analytics/umami.ts` fabrique le script en ligne de chaque page (`src/app/(front)/layout.tsx`, jamais l'administration). Il définit le filtre `mmAvantEnvoi`, une salle d'attente pour les événements suivis avant le traceur, puis ajoute le traceur en asynchrone.

Le filtre n'envoie rien depuis un navigateur automatisé (`navigator.webdriver`, un agent `HeadlessChrome`), depuis une page encadrée, ni depuis un navigateur qui a posé `umami.disabled`. Aucun autre filtre de robots n'existe : ceux qui se déclarent restent comptés, ainsi que nos propres visites (décisions du 13/10). L'adresse envoyée ne garde que les paramètres `utm_*`, le référent perd son paramètre et son ancre.

Le script est écrit en chaîne, sans syntaxe postérieure à ES2019 : un `?.` laissé dans un script en ligne a déjà coûté les visites de Safari avant 13.4. Un test lit le texte.

## Le catalogue d'événements

`src/lib/analytics/events.ts` est la table fermée des événements (le plan 04 §3.3, sans `devis_click` ni `demande_envoyee`) et `track()` (`src/lib/analytics/track.ts`) est le seul chemin d'une page vers Umami :

```ts
import { track } from '@/lib/analytics/track'

track('contact_click', { pid: 12, channel: 'phone' })
track('profile_publiable') // un événement sans propriété n'en prend pas
```

- Un nom inconnu, une propriété en trop ou manquante, une valeur hors de sa liste : le code ne compile pas. À l'exécution, l'événement tombe tout entier.
- Rien n'est émis en développement ni dans les tests, ni sans Umami, ni depuis un navigateur automatisé. Rien ne lève. Pendant que le traceur charge, l'événement attend dans la salle d'attente.
- Aucune donnée personnelle : des listes fermées, des booléens, des entiers, l'identifiant d'un profil (`pid` : l'identifiant de l'ancien site, ou `v3-<id>` pour un profil créé depuis), un chemin sans paramètre. Un texte qui ressemble à un email ou à un téléphone fait tomber l'événement.
- Ajouter un événement : une ligne dans `CATALOGUE`, une ligne dans `EXEMPLES` de `tests/unit/mesure-evenements.test.ts`, et sa ligne dans le plan de mesure. Renommer une valeur coupe sa série dans Umami.
- Aucun appel direct à Umami hors de `src/lib/analytics/` : un test statique le garde.

Les Web Vitals (`web-vitals`, un événement par mesure : `CLS`, `FCP`, `INP`, `LCP`, `TTFB`) partent de chaque page chargée, sans échantillon, depuis `src/components/analytics/WebVitals.tsx`. Le nom garde son tiret : la série existe déjà dans le rapport du lundi.
