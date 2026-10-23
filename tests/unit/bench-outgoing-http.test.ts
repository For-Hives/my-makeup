import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { request as requeteHttp } from 'node:http'
import { request as requeteHttps } from 'node:https'
import { connect } from 'node:net'
import path from 'node:path'
import { bypass, passthrough } from 'msw'
import { z } from 'zod'
import { BENCH_HOSTS } from '../support/environment-guard'
import {
	collectRefusal,
	delay,
	forgetSimulations,
	HttpResponse,
	http,
	isBenchHost,
	lineRefusal,
	type Refusal,
	refusalMessage,
	requireNoRefusal,
	simulate,
	UnmockedRequest,
} from '../support/outgoing-http'

// The outgoing HTTP bench, tested on services that exist only here. No test of this file reaches
// anything but this machine: an « outside » service is a server of this process, at an address
// the bench does not know.

const ROOT = path.resolve(import.meta.dir, '../..')

/**
 * The example: a client as a ticket will write one. It asks a service for the towns of a name,
 * and says so when the service is down, whatever the way it fails.
 */
const REFERENCE = 'https://referentiel.example.test/communes'
const Cities = z.array(z.object({ nom: z.string(), code: z.string() }))
type Search = { communes: z.infer<typeof Cities> } | { panne: string }

async function findCities(nom: string, delaiMs = 1000): Promise<Search> {
	try {
		const response = await fetch(`${REFERENCE}?nom=${encodeURIComponent(nom)}`, {
			signal: AbortSignal.timeout(delaiMs),
		})
		if (!response.ok) return { panne: `réponse ${response.status}` }
		return { communes: Cities.parse(await response.json()) }
	} catch (error) {
		return { panne: error instanceof Error ? error.name : 'erreur inconnue' }
	}
}

const ANNECY = [{ nom: 'Annecy', code: '74010' }]

/**
 * `undici`, the client Payload downloads a file given as an address with. It is Payload's
 * dependency, not this repository's: asked for by a name the compiler does not follow. Under
 * bun, that name is bun's own module, whatever node_modules holds.
 */
const UNDICI_NAME = 'undici'
const { fetch: fetchUndici } = (await import(UNDICI_NAME)) as { fetch: typeof fetch }

/** What a server of this file answers, so that a test knows it reached the real one. */
const TRUE_RESPONSE = 'réponse du vrai serveur'

/**
 * « Outside »: a real server, on this machine, at 127.0.0.2. Linux routes the whole 127.0.0.0/8
 * block to the machine, but the bench only knows 127.0.0.1: for it, this address is the
 * Internet. Every request that reaches the server is counted, and none may.
 */
let outside: ReturnType<typeof Bun.serve>
/** The bench's side: a real server at 127.0.0.1, which also speaks WebSocket. */
let inside: ReturnType<typeof Bun.serve>
let hitOutside = 0
let hitInside = 0

beforeAll(() => {
	outside = Bun.serve({
		hostname: '127.0.0.2',
		port: 0,
		fetch: () => {
			hitOutside += 1
			return new Response(TRUE_RESPONSE)
		},
	})
	inside = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: (requete, serveur) => {
			hitInside += 1
			return serveur.upgrade(requete, { data: undefined }) ? undefined : new Response(TRUE_RESPONSE)
		},
		websocket: {
			open: prise => {
				prise.send('bonjour du vrai serveur')
			},
			message: () => undefined,
		},
	})
})

afterAll(async () => {
	await Promise.all([outside.stop(true), inside.stop(true)])
})

/** The status and the body a `node:http` or `node:https` request gets. Rejects when the request fails. */
const byNode = (requete: typeof requeteHttp, adresse: string): Promise<string> =>
	new Promise((resolve, reject) => {
		requete(adresse, reponse => {
			let corps = ''
			reponse.setEncoding('utf8')
			reponse.on('data', morceau => {
				corps += morceau
			})
			reponse.on('end', () => resolve(`${reponse.statusCode} ${corps}`))
		})
			.on('error', reject)
			.end()
	})

/** Every way to ask for an address that ends in bun's native client without going through MSW. */
const WITHOUT_MSW: [string, (adresse: string) => Promise<string>][] = [
	['Bun.fetch', async adresse => `${(await Bun.fetch(adresse)).status}`],
	['undici', async adresse => `${(await fetchUndici(adresse)).status}`],
	['node:http', adresse => byNode(requeteHttp, adresse)],
]

/** What the first message of a WebSocket is, or `erreur` when the connection fails. */
const firstMessage = (adresse: string): Promise<string> =>
	new Promise(resolve => {
		const taken = new WebSocket(adresse)
		taken.onmessage = message => {
			resolve(String(message.data))
			taken.close()
		}
		taken.onerror = () => resolve('erreur')
	})

/** The error a request was refused with. Fails when the request went through. */
async function refusalOf(requete: Promise<unknown>): Promise<Error> {
	const issue = await requete.then(
		reponse => ({ reponse }),
		(erreur: unknown) => ({ erreur })
	)
	if ('erreur' in issue && issue.erreur instanceof Error) return issue.erreur
	throw new Error('la requête n’a pas été refusée')
}

describe('Un service extérieur se simule en une déclaration', () => {
	test('exemple : le service répond 200, puis tombe en panne (500)', async () => {
		simulate(http.get(REFERENCE, () => HttpResponse.json(ANNECY)))

		expect(await findCities('Annecy')).toEqual({ communes: ANNECY })

		// The last declaration wins: the same service, now down.
		simulate(http.get(REFERENCE, () => new HttpResponse(null, { status: 500 })))

		expect(await findCities('Annecy')).toEqual({ panne: 'réponse 500' })
	})

	test('une suite de réponses se déclare d’avance : 200 une seule fois, puis 500', async () => {
		simulate(
			http.get(REFERENCE, () => HttpResponse.json(ANNECY), { once: true }),
			http.get(REFERENCE, () => new HttpResponse(null, { status: 500 }))
		)

		expect(await findCities('Annecy')).toEqual({ communes: ANNECY })
		expect(await findCities('Annecy')).toEqual({ panne: 'réponse 500' })
		expect(await findCities('Annecy')).toEqual({ panne: 'réponse 500' })
	})

	test('la déclaration lit la requête reçue : adresse, en-têtes, corps', async () => {
		const receivedList: { nom: string | null; jeton: string | null; corps: unknown }[] = []
		simulate(
			http.post('https://envoi.example.test/messages', async ({ request }) => {
				receivedList.push({
					nom: new URL(request.url).searchParams.get('nom'),
					jeton: request.headers.get('authorization'),
					corps: await request.json(),
				})
				return HttpResponse.json({ id: 'message-1' }, { status: 201 })
			})
		)

		const response = await fetch('https://envoi.example.test/messages?nom=accueil', {
			method: 'POST',
			headers: { authorization: 'Bearer jeton-factice', 'content-type': 'application/json' },
			body: JSON.stringify({ a: 'lea@example.test' }),
		})

		expect(response.status).toBe(201)
		expect(receivedList).toEqual([{ nom: 'accueil', jeton: 'Bearer jeton-factice', corps: { a: 'lea@example.test' } }])
	})

	test('un réseau coupé et un service muet se simulent aussi', async () => {
		simulate(http.get(REFERENCE, () => HttpResponse.error()))

		expect(await findCities('Annecy')).toEqual({ panne: 'TypeError' })

		simulate(
			http.get(REFERENCE, async () => {
				await delay('infinite')
				return HttpResponse.json(ANNECY)
			})
		)

		// The client gives up by itself, after the 50 ms it is given here.
		expect(await findCities('Annecy', 50)).toEqual({ panne: 'TimeoutError' })
	})

	test('une déclaration ne vaut que pour son test : une fois oubliée, le service n’est plus simulé', async () => {
		simulate(http.get(REFERENCE, () => HttpResponse.json(ANNECY)))
		// What the preload does after each test.
		forgetSimulations()

		expect(await findCities('Annecy')).toEqual({ panne: 'RequeteNonSimulee' })
		expect(collectRefusal().map(({ hote: host }) => host)).toEqual(['referentiel.example.test'])
	})
})

describe('Un hôte non déclaré : la requête est refusée, et le test échoue', () => {
	test('fetch est refusé sur-le-champ, par un message qui nomme l’hôte, et rien ne part', async () => {
		const url = `http://127.0.0.2:${outside.port}/communes`

		const error = await refusalOf(fetch(`${url}?jeton=secret-factice`))

		expect(error).toBeInstanceOf(UnmockedRequest)
		expect(error.message.split('\n')).toEqual([
			`Requête sortante non simulée : GET ${url} (hôte « 127.0.0.2 »).`,
			'Aucun test n’appelle Internet : simule ce service dans le test, par simuler(http.get(adresse, () => HttpResponse.json(…))).',
			'Guide : docs/tests/http-sortant.md',
		])
		// The query string may carry a token: it is never repeated.
		expect(error.message).not.toContain('secret-factice')
		expect(collectRefusal()).toEqual([{ methode: 'GET', hote: '127.0.0.2', adresse: url, vuePar: 'simulation' }])
		expect(hitOutside).toBe(0)
	})

	test('une image ou une feuille de style n’est pas une exception', async () => {
		// MSW's own « error » strategy lets these out without a word.
		const error = await refusalOf(fetch(`http://127.0.0.2:${outside.port}/photo.png`))

		expect(error).toBeInstanceOf(UnmockedRequest)
		expect(collectRefusal().map(({ hote: host }) => host)).toEqual(['127.0.0.2'])
		expect(hitOutside).toBe(0)
	})

	test.each(WITHOUT_MSW)('%s échappe à MSW et finit dans le filet, qui note l’hôte', async (_sortie, demander) => {
		const url = `http://127.0.0.2:${outside.port}/etat`

		await refusalOf(demander(`${url}?jeton=secret-factice`))

		expect(collectRefusal()).toEqual([{ methode: 'GET', hote: '127.0.0.2', adresse: url, vuePar: 'filet' }])
		expect(hitOutside).toBe(0)
	})

	test('en https, le filet ne voit que l’hôte : la connexion chiffrée n’est jamais ouverte', async () => {
		await refusalOf(byNode(requeteHttps, 'https://paiement.example.test/factures?jeton=secret-factice'))

		expect(collectRefusal()).toEqual([
			{ methode: 'CONNECT', hote: 'paiement.example.test', adresse: 'https://paiement.example.test', vuePar: 'filet' },
		])
	})

	test('sous bun, seul fetch se simule : une déclaration ne répond ni à Bun.fetch, ni à undici, ni à node:http', async () => {
		const url = `http://127.0.0.2:${outside.port}/etat`
		simulate(http.get(url, () => HttpResponse.text('réponse simulée')))

		expect(await (await fetch(url)).text()).toBe('réponse simulée')
		for (const [, makeRequest] of WITHOUT_MSW) await refusalOf(makeRequest(url))

		expect(collectRefusal().map(({ vuePar }) => vuePar)).toEqual(['filet', 'filet', 'filet'])
		expect(hitOutside).toBe(0)
	})

	test('ni passthrough() ni bypass() n’ouvrent une sortie : le filet les arrête', async () => {
		const url = `http://127.0.0.2:${outside.port}/etat`
		simulate(http.get(url, () => passthrough()))

		await refusalOf(fetch(url))
		await refusalOf(fetch(bypass(url)))

		expect(collectRefusal().map(({ hote: host, vuePar }) => `${host} ${vuePar}`)).toEqual([
			'127.0.0.2 filet',
			'127.0.0.2 filet',
		])
		expect(hitOutside).toBe(0)
	})

	test('un WebSocket vers un hôte non déclaré est refusé', async () => {
		expect(await firstMessage(`ws://127.0.0.2:${outside.port}/direct`)).toBe('erreur')

		expect(collectRefusal()).toEqual([
			{ methode: 'GET', hote: '127.0.0.2', adresse: `ws://127.0.0.2:${outside.port}/direct`, vuePar: 'simulation' },
		])
		expect(hitOutside).toBe(0)
	})

	test('le serveur du dehors est bien joignable : un socket brut, que le banc ne couvre pas, l’atteint', async () => {
		// The control of the tests above: « nothing reached the outside server » means something
		// only if the server can be reached. A raw socket is the one way out this bench leaves open.
		const response = await new Promise<string>((resolve, reject) => {
			const taken = connect(outside.port ?? 0, '127.0.0.2', () => {
				taken.write('GET /controle HTTP/1.1\r\nHost: 127.0.0.2\r\nConnection: close\r\n\r\n')
			})
			let received = ''
			taken.setEncoding('utf8')
			taken.on('data', morceau => {
				received += morceau
			})
			taken.on('end', () => resolve(received))
			taken.on('error', reject)
		})

		expect(response).toContain(TRUE_RESPONSE)
		expect(hitOutside).toBe(1)
		expect(collectRefusal()).toEqual([])
		hitOutside = 0
	})

	test('dans un lancement de bun test, le test échoue même si le code avale l’erreur, et le message nomme l’hôte', async () => {
		// The witness file, in a child `bun test` that reads the bunfig.toml of the repository: the
		// preload is loaded the way every run loads it.
		const child = Bun.spawn([process.execPath, '--no-env-file', 'test', './tests/fixtures/outgoing-http-sentinel.ts'], {
			cwd: ROOT,
			env: { PATH: process.env.PATH ?? '' },
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, output, errors] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		])
		const text = output + errors
		const verdicts = [...text.matchAll(/^\((pass|fail)\) (.+?) \[/gm)].map(([, verdict, name]) => `${verdict} ${name}`)

		expect(verdicts).toEqual([
			'pass TEMOIN service déclaré',
			'fail TEMOIN service déclaré par le test d’avant seulement',
			'fail TEMOIN hôte non déclaré, erreur avalée',
			'fail TEMOIN hôte non déclaré, appelé sans fetch',
			// A request made after the last test, in an `afterAll`: the run fails too.
			'fail (unnamed)',
		])
		expect(code).toBe(1)
		expect(text).toContain(
			'Requête sortante non simulée pendant ce test, ou juste avant lui : GET https://non-declare.example.test/etat (hôte « non-declare.example.test »).'
		)
		expect(text).toContain('CONNECT https://par-node.example.test (hôte « par-node.example.test »).')
		expect(text).toContain(
			'Requête sortante non simulée après le dernier test : GET https://hors-test.example.test/etat (hôte « hors-test.example.test »).'
		)
		expect(text).not.toContain('secret-du-temoin')
	})

	test('le verdict ne dit rien sans refus, et nomme chaque hôte sinon', () => {
		const refusal: Refusal[] = [
			{ methode: 'GET', hote: 'a.example.test', adresse: 'https://a.example.test/x', vuePar: 'simulation' },
			{ methode: 'CONNECT', hote: 'b.example.test', adresse: 'https://b.example.test', vuePar: 'filet' },
		]

		expect(() => requireNoRefusal(' pendant ce test')).not.toThrow()
		expect(refusalMessage(refusal, ' pendant ce test').split('\n')).toEqual([
			'2 requêtes sortantes non simulées pendant ce test : GET https://a.example.test/x (hôte « a.example.test ») ; CONNECT https://b.example.test (hôte « b.example.test »).',
			'Aucun test n’appelle Internet : simule ce service dans le test, par simuler(http.get(adresse, () => HttpResponse.json(…))).',
			'Sous bun, seul fetch se simule : une requête faite par node:http, undici ou Bun.fetch, ou qu’une déclaration laisse passer, finit dans le filet.',
			'Guide : docs/tests/http-sortant.md',
		])
		expect(new UnmockedRequest(refusal).refus).toEqual(refusal)
	})

	test.each([
		[
			'GET http://service.example.test/a/b?jeton=secret HTTP/1.1',
			{ methode: 'GET', hote: 'service.example.test', adresse: 'http://service.example.test/a/b' },
		],
		[
			'POST http://Service.Example.test:8080/ HTTP/1.1',
			{ methode: 'POST', hote: 'service.example.test', adresse: 'http://service.example.test:8080/' },
		],
		[
			'CONNECT service.example.test:443 HTTP/1.1',
			{ methode: 'CONNECT', hote: 'service.example.test', adresse: 'https://service.example.test' },
		],
		[
			'CONNECT service.example.test:8443 HTTP/1.1',
			{ methode: 'CONNECT', hote: 'service.example.test', adresse: 'https://service.example.test:8443' },
		],
		[
			'CONNECT [2001:db8::1]:443 HTTP/1.1',
			{ methode: 'CONNECT', hote: '2001:db8::1', adresse: 'https://[2001:db8::1]' },
		],
		['GET /chemin HTTP/1.1', { methode: 'GET', hote: '(illisible)', adresse: '(illisible)' }],
		['', { methode: '?', hote: '(illisible)', adresse: '(illisible)' }],
	])('le filet lit la première ligne d’une requête : %s', (ligne, attendu) => {
		expect(lineRefusal(ligne)).toEqual({ ...attendu, vuePar: 'filet' })
	})
})

describe('Le banc lui-même n’est pas intercepté', () => {
	test('une requête vers ce poste atteint le vrai service, par fetch comme par les autres sorties', async () => {
		const url = `http://127.0.0.1:${inside.port}/etat`
		hitInside = 0

		expect(await (await fetch(url)).text()).toBe(TRUE_RESPONSE)
		expect(await (await fetch(`http://localhost:${inside.port}/etat`)).text()).toBe(TRUE_RESPONSE)
		expect(await (await Bun.fetch(url)).text()).toBe(TRUE_RESPONSE)
		expect(await (await fetchUndici(url)).text()).toBe(TRUE_RESPONSE)
		expect(await byNode(requeteHttp, url)).toBe(`200 ${TRUE_RESPONSE}`)
		expect(await firstMessage(`ws://127.0.0.1:${inside.port}/direct`)).toBe('bonjour du vrai serveur')

		expect(hitInside).toBe(6)
		expect(collectRefusal()).toEqual([])
	})

	test('une adresse de ce poste se simule quand un test la déclare', async () => {
		const url = `http://127.0.0.1:${inside.port}/etat`
		hitInside = 0
		simulate(http.get(url, () => new HttpResponse(null, { status: 503 })))

		expect((await fetch(url)).status).toBe(503)
		expect(hitInside).toBe(0)
	})

	test('les hôtes du banc sont ceux de la garde d’environnement, et eux seuls', () => {
		// Not the whole list: a service added to the bench is added to the guard, and passes here at once.
		expect([...BENCH_HOSTS]).toEqual(expect.arrayContaining(['localhost', '127.0.0.1', '::1', 'mailpit', 's3mock']))
		for (const host of [...BENCH_HOSTS, '[::1]', 'LOCALHOST']) expect(isBenchHost(host), host).toBe(true)
		for (const host of [
			'127.0.0.2',
			'localhost.example.test',
			'mailpit.example.test',
			'my-makeup.fr',
			'v3.my-makeup.fr',
			'api.resend.com',
		])
			expect(isBenchHost(host), host).toBe(false)
	})

	test('le filet est en place pour tout le lancement, et laisse les hôtes du banc de côté', () => {
		const net = process.env.HTTP_PROXY ?? ''

		expect(net).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
		for (const name of ['HTTPS_PROXY', 'http_proxy', 'https_proxy']) expect(process.env[name], name).toBe(net)
		for (const name of ['NO_PROXY', 'no_proxy'])
			expect(process.env[name]?.split(','), name).toEqual([...BENCH_HOSTS, '[::1]'])
	})
})
