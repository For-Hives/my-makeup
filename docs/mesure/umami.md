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

## L'opposition d'une visiteuse

La politique de confidentialité (`/politique-de-confidentialite`) porte un bouton, « Ne plus mesurer mes visites » (`src/components/analytics/OppositionMesure.tsx`). Un clic pose la clé `umami.disabled` dans le `localStorage` du navigateur : le filtre de l'en-tête et le traceur d'Umami la lisent, et plus rien ne part vers le faux Umami ni vers l'instance. Le bouton devient « Réactiver la mesure d'audience » ; un second clic retire la clé. Le choix vaut pour ce navigateur, jusqu'à ce qu'on le retire. La clé et les deux gestes sont dans `src/lib/analytics/opposition.ts`. Un stockage bloqué (fenêtre privée, données coupées) ne casse rien et ne compte pas pour une opposition.

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

## Le clic sur un contact d'un profil public (`contact_click`)

Chaque lien de la section « Réseaux sociaux & contacts » d'un profil public (téléphone, email, Instagram, Facebook, LinkedIn, YouTube, site) émet un `contact_click` avec le `pid` du profil et le `channel`, une fois par clic (le clic du milieu aussi). C'est le principal signal de demande. Le code est `src/lib/analytics/contact-click.ts` (la règle et l'envoi) et `src/components/profil/LienDeContactMesure.tsx` (le lien).

Il ne part pas :

- quand la visiteuse est la propriétaire du profil. La page publique est partagée et en cache : elle ne sait pas qui la lit. Le navigateur demande donc à `GET /api/espace/mon-pid` le `pid` du profil de la session (jamais mis en cache, `null` sans cookie, sans accès à la base dans ce cas) et le compare à celui de la page. Le clic attend cette réponse si elle n'est pas encore venue ; si elle échoue, le clic est compté ;
- quand elle vient de son espace (le référent est une page `/auth/...` du site) ;
- quand l'adresse porte `utm_campaign=relance` (lien d'un email de relance) ;
- depuis l'aperçu de sa propre page (`/auth/apercu-profil`), qui ne compte aucun clic (`mesure={false}`).

Un profil sans contact public n'a ni section ni lien, donc aucun événement. Le `pid` d'un profil est l'identifiant de l'ancien site s'il en a un, sinon `v3-<id>` (`src/lib/profil/pid.ts`). Tests : U84 dans `tests/unit/mesure-clic-contact.test.tsx`, E52 dans `tests/e2e/mesure-clic-contact.spec.ts`.

## La recherche, les appels à l'action et les pages d'erreur (ticket 145)

| Événement | Quand | Propriétés |
|---|---|---|
| `search_submit` | La page de résultats d'une recherche s'affiche | `has_city` (une ville a été saisie), `results` (`0`, `1-5`, `6-20`, `21+`), `from` (`formulaire` si le formulaire vient d'être envoyé, `lien` sinon) |
| `search_result_click` | Clic sur la carte d'un résultat | `rank` (place dans toute la liste, toutes pages comprises, à partir de 1), `pid` |
| `cta_click` | Clic sur un appel à l'action | `where` : `cta_recherche` et `cta_inscription` (bloc de fin de page), `nav_recherche` (bouton de la barre, écran large), `nav_recherche_mobile` (le même bouton, menu déplié sous 1024 px) |
| `not_found` | Une page 404 s'affiche | `kind` : `profil`, `talent`, `blog` d'après le premier segment de l'adresse, `autre` sinon |
| `app_error` | Une page d'erreur s'affiche | `scope` (`site`, `espace`, `global`), `code` (`chunk_load` si un script n'a pas pu charger, `render` sinon) |

**Aucun texte saisi ne part.** La page de résultats ne donne au navigateur que deux faits (une ville, une tranche) et une empreinte courte des mots, qui sert à ne pas recompter la même recherche ; l'empreinte n'est jamais envoyée. Le message d'une erreur n'est jamais lu.

**Aucun doublon.** Le navigateur retient, pour l'onglet (`sessionStorage`, clé `mm-mesure-dernier`), la dernière vue comptée. Une 404 ou une page d'erreur rechargée n'est pas recomptée ; une recherche revue (page suivante, retour) non plus, sauf si le formulaire vient d'être envoyé (`src/lib/analytics/doublon.ts`). Un stockage bloqué compte chaque vue.

**Le traceur sur les pages qui l'ont perdu.** Le script de l'en-tête ne s'exécute pas quand le navigateur dessine lui-même la page après un échec du serveur : la 404 d'une adresse que rien ne sert (`src/app/global-not-found.tsx`), celle d'un profil, d'un talent ou d'un article inconnu, et toute page d'erreur. Ces pages ajoutent donc le traceur elles-mêmes avant d'émettre (`src/lib/analytics/chargeur.ts`), s'il n'est pas déjà là. La page d'erreur globale (`global-error.tsx`) fait de même.

Le `pid` d'une carte (`CarteDeProfil.pid`) est lu à part, par les identifiants que la lecture publique a donnés (`lireLesPid`) : l'ancien identifiant n'est pas un champ que le public lit.

Tests : `tests/unit/mesure-recherche-erreurs.test.ts`, et `tests/e2e/mesure-recherche-erreurs.spec.ts` contre le faux Umami.
