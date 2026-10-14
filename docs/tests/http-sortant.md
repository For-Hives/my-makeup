# Simuler un service extérieur : aucun test n'appelle Internet

Pendant `bun test`, aucune requête HTTP ne quitte le poste. Un service extérieur (un référentiel de communes, un fournisseur appelé par son API) se simule en une déclaration, dans le test. Une requête vers un hôte que rien ne déclare est refusée, et le test échoue avec un message qui nomme l'hôte.

Les services du banc de test, eux, répondent pour de vrai : voir « Ce qui passe ».

Cela vaut pour tous les tests lancés par `bun test` : les tests unitaires, les tests d'intégration et les garde-fous de la CI.

## Simuler un service

```ts
import { expect, test } from 'bun:test'
import { HttpResponse, http, simuler } from '../outils/http-sortant'

const REFERENTIEL = 'https://referentiel.example.test/communes'

test('le service répond 200, puis tombe en panne (500)', async () => {
	simuler(http.get(REFERENTIEL, () => HttpResponse.json([{ nom: 'Annecy', code: '74010' }])))

	expect(await chercherCommunes('Annecy')).toEqual({ communes: [{ nom: 'Annecy', code: '74010' }] })

	// La dernière déclaration l'emporte : le même service, maintenant en panne.
	simuler(http.get(REFERENTIEL, () => new HttpResponse(null, { status: 500 })))

	expect(await chercherCommunes('Annecy')).toEqual({ panne: 'réponse 500' })
})
```

`chercherCommunes` est le code testé : il appelle le service par `fetch`, sans rien savoir du test.

`tests/unit/banc-http-sortant.test.ts` montre chaque geste sur un petit client écrit dans le fichier. Lancer ce fichier seul, depuis la racine du dépôt :

```sh
bun --no-env-file test tests/unit/banc-http-sortant.test.ts
```

`http`, `HttpResponse` et `delay` sont ceux de MSW 2, que `tests/outils/http-sortant.ts` redonne : tout ce que dit [la documentation de MSW](https://mswjs.io/docs/http) sur une déclaration s'applique. Seul `simuler` est propre à ce dépôt.

## Les gestes

| Besoin | Déclaration |
|---|---|
| Une réponse | `simuler(http.get(adresse, () => HttpResponse.json(donnees)))` |
| Une panne du service | `simuler(http.get(adresse, () => new HttpResponse(null, { status: 500 })))` |
| Un réseau coupé | `simuler(http.get(adresse, () => HttpResponse.error()))` : `fetch` échoue, sans réponse |
| Un service muet | `simuler(http.get(adresse, async () => { await delay('infinite'); return HttpResponse.json(donnees) }))` : c'est au code testé d'abandonner |
| Une suite de réponses, déclarée d'avance | `simuler(http.get(adresse, premiere, { once: true }), http.get(adresse, suivantes))` |
| Lire ce que le code a envoyé | `http.post(adresse, async ({ request }) => { recu = await request.json(); return HttpResponse.json(reponse) })` |

L'adresse d'une déclaration s'écrit sans ses paramètres (`?nom=…`) : ils se lisent dans la requête, par `new URL(request.url).searchParams`.

## Règles

- **Le code appelle un service extérieur par `fetch`.** Sous bun, c'est la seule sortie que MSW simule. Vers un hôte extérieur, une requête faite par `node:http`, `node:https`, `undici` ou `Bun.fetch` est toujours refusée : voir « Comment c'est fait ».
- **Une déclaration vaut pour le test en cours.** Elle est oubliée après lui. Pour simuler un service dans tous les tests d'un fichier, la déclaration va dans un `beforeEach`. Posée dans un `beforeAll` ou au chargement du fichier, elle ne sert qu'au premier test.
- **La dernière déclaration l'emporte.** Dans un même appel à `simuler`, c'est la première donnée qui l'emporte.
- **On ne remplace ni `fetch` ni un module** (`mock.module`) : la simulation répond à la vraie requête du code.
- **Rien de réel dans une réponse simulée** : des noms inventés, des adresses en `@example.test`.
- **Les tests se lancent depuis la racine du dépôt** : c'est là que `bunfig.toml` charge `tests/outils/precharge-http-sortant.ts`, qui démarre tout. Lancé ailleurs, `simuler` s'arrête et le dit.

## Quand rien n'est déclaré

La requête est refusée à deux moments.

**Sur-le-champ.** `fetch` échoue avec l'erreur `RequeteNonSimulee`, et rien ne part :

```
Requête sortante non simulée : GET https://referentiel.example.test/communes (hôte « referentiel.example.test »).
Aucun test n’appelle Internet : simule ce service dans le test, par simuler(http.get(adresse, () => HttpResponse.json(…))).
Guide : docs/tests/http-sortant.md
```

**Après le test.** Un code qui attrape l'erreur et continue (« le service est en panne, tant pis ») ne sauve pas le test. Après chaque test, le banc regarde si une requête a été refusée : le test échoue alors avec le même message, même si toutes ses vérifications sont vraies.

- Une requête faite au chargement d'un fichier ou dans un `beforeAll` fait échouer le premier test qui suit.
- Une requête faite après le dernier test (dans un `afterAll`, ou par une promesse que personne n'attend) fait échouer le lancement.
- Le message ne recopie jamais les paramètres de l'adresse : ils peuvent porter un jeton.
- `releverLesRefus()` lit les refus notés et les oublie. Il est réservé aux tests de ce banc, qui font refuser une requête exprès : ailleurs, il cacherait un appel à Internet.

## Ce qui passe : le banc

Une requête vers un hôte du banc n'est pas interceptée : elle atteint le vrai service.

| Hôte | Ce qu'il désigne |
|---|---|
| `localhost`, `127.0.0.1`, `::1` | Ce poste : le capteur de mails, le stockage d'objets, le faux Google, l'application lancée contre le banc, un serveur ouvert par un test |
| `postgres`, `mailpit`, `s3mock`, `faux-google` | Les services de `compose.test.yml`, sous leur nom dans le réseau de la pile |

- La liste est celle de la garde d'environnement : `HOTES_DU_BANC`, dans `tests/outils/garde-environnement.ts`. Un service ajouté au banc s'y ajoute, et nulle part ailleurs.
- Tout autre hôte est « extérieur », la préprod et `127.0.0.2` compris.
- Une adresse du banc se simule quand même si un test la déclare : c'est ainsi qu'on teste une panne du capteur de mails sans l'arrêter.

## Comment c'est fait

Deux couches, démarrées une fois par lancement, avant tout fichier de test.

**1. La simulation.** MSW prend la place du `fetch` global. Il répond à la place du service déclaré. Sans déclaration, il laisse passer un hôte du banc et refuse tout autre.

**2. Le filet.** Sous bun, MSW ne voit que le `fetch` global (vérifié le 14/10/2026, bun 1.3.14 et MSW 2.15.0). Les autres sorties finissent toutes dans le client HTTP de bun, qui obéit aux variables de proxy. Le banc les règle sur un serveur ouvert dans le processus du test : il lit où allait la requête, la note et raccroche.

| Sortie | Se simule | Vers un hôte extérieur |
|---|---|---|
| `fetch` | Oui | Refusée par la simulation |
| `Bun.fetch`, `undici`, `node:http`, `node:https` | Non | Refusée par le filet |
| Une déclaration qui laisse passer (`passthrough()`, `bypass()` de MSW) | — | Refusée par le filet |
| `WebSocket` | Non | Refusée par la simulation |

- En https, le filet ne connaît que l'hôte : le message dit `CONNECT https://hôte`, sans méthode ni chemin, parce que la connexion chiffrée n'est jamais ouverte.
- Le filet règle six variables pour le processus du test : `HTTP_PROXY`, `HTTPS_PROXY` et `NO_PROXY`, en majuscules et en minuscules. `NO_PROXY` porte les hôtes du banc.
- Chaque lancement de `bun test` paie ce démarrage : environ 80 ms (mesuré le 14/10/2026 sur le poste de développement : un test de fonction pure passe de 0,47 s à 0,55 s).

## Limites

- **Les sockets bruts ne sont pas couverts** (`node:net`, `node:tls`, `Bun.connect`), donc ni le SMTP ni PostgreSQL. C'est la garde d'environnement qui les retient : elle refuse un relais de mails ou une base qui n'est pas du banc ([`README.md`](../../README.md), « La garde d'environnement »).
- **Un processus enfant n'est pas couvert.** bun ne range pas ces six variables, réglées en cours de lancement, parmi les clés de `process.env` : un enfant qui reçoit une copie de l'environnement (`env: { ...process.env }`) ne les a pas, et sort librement. Un `bun test` enfant, lui, démarre son propre banc.
- **Un `Bun.fetch` qui nomme lui-même son proxy** (option `proxy`) passe à côté du filet.
- **Vers le banc, `AbortSignal.timeout` n'arrête pas un `fetch`** : MSW laisse passer la requête, et un service qui accepte la connexion sans rien répondre la garde ouverte au-delà du délai (constaté le 14/10/2026, bun 1.3.14 et MSW 2.15.0). Un délai s'écrit avec un `AbortController` et un minuteur, comme dans `tests/outils/banc-requete.ts`. Une requête simulée, elle, s'arrête bien à son délai.
- **Aucun WebSocket ne se simule pour l'instant** : vers un hôte extérieur, il est refusé.
- **Les essais de bout en bout et les sondes** ne tournent pas sous `bun test` : ce banc ne les concerne pas.
- **Le témoin des tests de ce banc est un serveur ouvert sur `127.0.0.2`**, une adresse de ce poste que le banc ne connaît pas. Linux la donne d'office ; `tests/unit/banc-http-sortant.test.ts` ne tourne donc que sous Linux, comme la CI.

## Dépendance

Aucune dépendance ajoutée : MSW 2.15.0 était déjà dans `package.json`, en développement seulement.
