import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { request as requeteHttp } from 'node:http'
import { request as requeteHttps } from 'node:https'
import { connect } from 'node:net'
import path from 'node:path'
import { bypass, passthrough } from 'msw'
import { z } from 'zod'
import { HOTES_DU_BANC } from '../support/environment-guard'
import {
	delay,
	estHoteDuBanc,
	exigerAucunRefus,
	HttpResponse,
	http,
	messageDesRefus,
	oublierLesSimulations,
	type Refus,
	RequeteNonSimulee,
	refusDeLigne,
	releverLesRefus,
	simuler,
} from '../support/outgoing-http'

// The outgoing HTTP bench, tested on services that exist only here. No test of this file reaches
// anything but this machine: an « outside » service is a server of this process, at an address
// the bench does not know.

const RACINE = path.resolve(import.meta.dir, '../..')

/**
 * The example: a client as a ticket will write one. It asks a service for the towns of a name,
 * and says so when the service is down, whatever the way it fails.
 */
const REFERENTIEL = 'https://referentiel.example.test/communes'
const Communes = z.array(z.object({ nom: z.string(), code: z.string() }))
type Recherche = { communes: z.infer<typeof Communes> } | { panne: string }

async function chercherCommunes(nom: string, delaiMs = 1000): Promise<Recherche> {
	try {
		const reponse = await fetch(`${REFERENTIEL}?nom=${encodeURIComponent(nom)}`, {
			signal: AbortSignal.timeout(delaiMs),
		})
		if (!reponse.ok) return { panne: `réponse ${reponse.status}` }
		return { communes: Communes.parse(await reponse.json()) }
	} catch (erreur) {
		return { panne: erreur instanceof Error ? erreur.name : 'erreur inconnue' }
	}
}

const ANNECY = [{ nom: 'Annecy', code: '74010' }]

/**
 * `undici`, the client Payload downloads a file given as an address with. It is Payload's
 * dependency, not this repository's: asked for by a name the compiler does not follow. Under
 * bun, that name is bun's own module, whatever node_modules holds.
 */
const NOM_D_UNDICI = 'undici'
const { fetch: fetchUndici } = (await import(NOM_D_UNDICI)) as { fetch: typeof fetch }

/** What a server of this file answers, so that a test knows it reached the real one. */
const VRAIE_REPONSE = 'réponse du vrai serveur'

/**
 * « Outside »: a real server, on this machine, at 127.0.0.2. Linux routes the whole 127.0.0.0/8
 * block to the machine, but the bench only knows 127.0.0.1: for it, this address is the
 * Internet. Every request that reaches the server is counted, and none may.
 */
let dehors: ReturnType<typeof Bun.serve>
/** The bench's side: a real server at 127.0.0.1, which also speaks WebSocket. */
let dedans: ReturnType<typeof Bun.serve>
let atteintesDehors = 0
let atteintesDedans = 0

beforeAll(() => {
	dehors = Bun.serve({
		hostname: '127.0.0.2',
		port: 0,
		fetch: () => {
			atteintesDehors += 1
			return new Response(VRAIE_REPONSE)
		},
	})
	dedans = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: (requete, serveur) => {
			atteintesDedans += 1
			return serveur.upgrade(requete, { data: undefined }) ? undefined : new Response(VRAIE_REPONSE)
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
	await Promise.all([dehors.stop(true), dedans.stop(true)])
})

/** The status and the body a `node:http` or `node:https` request gets. Rejects when the request fails. */
const parNode = (requete: typeof requeteHttp, adresse: string): Promise<string> =>
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
const SANS_MSW: [string, (adresse: string) => Promise<string>][] = [
	['Bun.fetch', async adresse => `${(await Bun.fetch(adresse)).status}`],
	['undici', async adresse => `${(await fetchUndici(adresse)).status}`],
	['node:http', adresse => parNode(requeteHttp, adresse)],
]

/** What the first message of a WebSocket is, or `erreur` when the connection fails. */
const premierMessage = (adresse: string): Promise<string> =>
	new Promise(resolve => {
		const prise = new WebSocket(adresse)
		prise.onmessage = message => {
			resolve(String(message.data))
			prise.close()
		}
		prise.onerror = () => resolve('erreur')
	})

/** The error a request was refused with. Fails when the request went through. */
async function refusDe(requete: Promise<unknown>): Promise<Error> {
	const issue = await requete.then(
		reponse => ({ reponse }),
		(erreur: unknown) => ({ erreur })
	)
	if ('erreur' in issue && issue.erreur instanceof Error) return issue.erreur
	throw new Error('la requête n’a pas été refusée')
}

describe('Un service extérieur se simule en une déclaration', () => {
	test('exemple : le service répond 200, puis tombe en panne (500)', async () => {
		simuler(http.get(REFERENTIEL, () => HttpResponse.json(ANNECY)))

		expect(await chercherCommunes('Annecy')).toEqual({ communes: ANNECY })

		// The last declaration wins: the same service, now down.
		simuler(http.get(REFERENTIEL, () => new HttpResponse(null, { status: 500 })))

		expect(await chercherCommunes('Annecy')).toEqual({ panne: 'réponse 500' })
	})

	test('une suite de réponses se déclare d’avance : 200 une seule fois, puis 500', async () => {
		simuler(
			http.get(REFERENTIEL, () => HttpResponse.json(ANNECY), { once: true }),
			http.get(REFERENTIEL, () => new HttpResponse(null, { status: 500 }))
		)

		expect(await chercherCommunes('Annecy')).toEqual({ communes: ANNECY })
		expect(await chercherCommunes('Annecy')).toEqual({ panne: 'réponse 500' })
		expect(await chercherCommunes('Annecy')).toEqual({ panne: 'réponse 500' })
	})

	test('la déclaration lit la requête reçue : adresse, en-têtes, corps', async () => {
		const recues: { nom: string | null; jeton: string | null; corps: unknown }[] = []
		simuler(
			http.post('https://envoi.example.test/messages', async ({ request }) => {
				recues.push({
					nom: new URL(request.url).searchParams.get('nom'),
					jeton: request.headers.get('authorization'),
					corps: await request.json(),
				})
				return HttpResponse.json({ id: 'message-1' }, { status: 201 })
			})
		)

		const reponse = await fetch('https://envoi.example.test/messages?nom=accueil', {
			method: 'POST',
			headers: { authorization: 'Bearer jeton-factice', 'content-type': 'application/json' },
			body: JSON.stringify({ a: 'lea@example.test' }),
		})

		expect(reponse.status).toBe(201)
		expect(recues).toEqual([{ nom: 'accueil', jeton: 'Bearer jeton-factice', corps: { a: 'lea@example.test' } }])
	})

	test('un réseau coupé et un service muet se simulent aussi', async () => {
		simuler(http.get(REFERENTIEL, () => HttpResponse.error()))

		expect(await chercherCommunes('Annecy')).toEqual({ panne: 'TypeError' })

		simuler(
			http.get(REFERENTIEL, async () => {
				await delay('infinite')
				return HttpResponse.json(ANNECY)
			})
		)

		// The client gives up by itself, after the 50 ms it is given here.
		expect(await chercherCommunes('Annecy', 50)).toEqual({ panne: 'TimeoutError' })
	})

	test('une déclaration ne vaut que pour son test : une fois oubliée, le service n’est plus simulé', async () => {
		simuler(http.get(REFERENTIEL, () => HttpResponse.json(ANNECY)))
		// What the preload does after each test.
		oublierLesSimulations()

		expect(await chercherCommunes('Annecy')).toEqual({ panne: 'RequeteNonSimulee' })
		expect(releverLesRefus().map(({ hote }) => hote)).toEqual(['referentiel.example.test'])
	})
})

describe('Un hôte non déclaré : la requête est refusée, et le test échoue', () => {
	test('fetch est refusé sur-le-champ, par un message qui nomme l’hôte, et rien ne part', async () => {
		const adresse = `http://127.0.0.2:${dehors.port}/communes`

		const erreur = await refusDe(fetch(`${adresse}?jeton=secret-factice`))

		expect(erreur).toBeInstanceOf(RequeteNonSimulee)
		expect(erreur.message.split('\n')).toEqual([
			`Requête sortante non simulée : GET ${adresse} (hôte « 127.0.0.2 »).`,
			'Aucun test n’appelle Internet : simule ce service dans le test, par simuler(http.get(adresse, () => HttpResponse.json(…))).',
			'Guide : docs/tests/http-sortant.md',
		])
		// The query string may carry a token: it is never repeated.
		expect(erreur.message).not.toContain('secret-factice')
		expect(releverLesRefus()).toEqual([{ methode: 'GET', hote: '127.0.0.2', adresse, vuePar: 'simulation' }])
		expect(atteintesDehors).toBe(0)
	})

	test('une image ou une feuille de style n’est pas une exception', async () => {
		// MSW's own « error » strategy lets these out without a word.
		const erreur = await refusDe(fetch(`http://127.0.0.2:${dehors.port}/photo.png`))

		expect(erreur).toBeInstanceOf(RequeteNonSimulee)
		expect(releverLesRefus().map(({ hote }) => hote)).toEqual(['127.0.0.2'])
		expect(atteintesDehors).toBe(0)
	})

	test.each(SANS_MSW)('%s échappe à MSW et finit dans le filet, qui note l’hôte', async (_sortie, demander) => {
		const adresse = `http://127.0.0.2:${dehors.port}/etat`

		await refusDe(demander(`${adresse}?jeton=secret-factice`))

		expect(releverLesRefus()).toEqual([{ methode: 'GET', hote: '127.0.0.2', adresse, vuePar: 'filet' }])
		expect(atteintesDehors).toBe(0)
	})

	test('en https, le filet ne voit que l’hôte : la connexion chiffrée n’est jamais ouverte', async () => {
		await refusDe(parNode(requeteHttps, 'https://paiement.example.test/factures?jeton=secret-factice'))

		expect(releverLesRefus()).toEqual([
			{ methode: 'CONNECT', hote: 'paiement.example.test', adresse: 'https://paiement.example.test', vuePar: 'filet' },
		])
	})

	test('sous bun, seul fetch se simule : une déclaration ne répond ni à Bun.fetch, ni à undici, ni à node:http', async () => {
		const adresse = `http://127.0.0.2:${dehors.port}/etat`
		simuler(http.get(adresse, () => HttpResponse.text('réponse simulée')))

		expect(await (await fetch(adresse)).text()).toBe('réponse simulée')
		for (const [, demander] of SANS_MSW) await refusDe(demander(adresse))

		expect(releverLesRefus().map(({ vuePar }) => vuePar)).toEqual(['filet', 'filet', 'filet'])
		expect(atteintesDehors).toBe(0)
	})

	test('ni passthrough() ni bypass() n’ouvrent une sortie : le filet les arrête', async () => {
		const adresse = `http://127.0.0.2:${dehors.port}/etat`
		simuler(http.get(adresse, () => passthrough()))

		await refusDe(fetch(adresse))
		await refusDe(fetch(bypass(adresse)))

		expect(releverLesRefus().map(({ hote, vuePar }) => `${hote} ${vuePar}`)).toEqual([
			'127.0.0.2 filet',
			'127.0.0.2 filet',
		])
		expect(atteintesDehors).toBe(0)
	})

	test('un WebSocket vers un hôte non déclaré est refusé', async () => {
		expect(await premierMessage(`ws://127.0.0.2:${dehors.port}/direct`)).toBe('erreur')

		expect(releverLesRefus()).toEqual([
			{ methode: 'GET', hote: '127.0.0.2', adresse: `ws://127.0.0.2:${dehors.port}/direct`, vuePar: 'simulation' },
		])
		expect(atteintesDehors).toBe(0)
	})

	test('le serveur du dehors est bien joignable : un socket brut, que le banc ne couvre pas, l’atteint', async () => {
		// The control of the tests above: « nothing reached the outside server » means something
		// only if the server can be reached. A raw socket is the one way out this bench leaves open.
		const reponse = await new Promise<string>((resolve, reject) => {
			const prise = connect(dehors.port ?? 0, '127.0.0.2', () => {
				prise.write('GET /controle HTTP/1.1\r\nHost: 127.0.0.2\r\nConnection: close\r\n\r\n')
			})
			let recu = ''
			prise.setEncoding('utf8')
			prise.on('data', morceau => {
				recu += morceau
			})
			prise.on('end', () => resolve(recu))
			prise.on('error', reject)
		})

		expect(reponse).toContain(VRAIE_REPONSE)
		expect(atteintesDehors).toBe(1)
		expect(releverLesRefus()).toEqual([])
		atteintesDehors = 0
	})

	test('dans un lancement de bun test, le test échoue même si le code avale l’erreur, et le message nomme l’hôte', async () => {
		// The witness file, in a child `bun test` that reads the bunfig.toml of the repository: the
		// preload is loaded the way every run loads it.
		const enfant = Bun.spawn([process.execPath, '--no-env-file', 'test', './tests/fixtures/temoin-http-sortant.ts'], {
			cwd: RACINE,
			env: { PATH: process.env.PATH ?? '' },
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, sortie, erreurs] = await Promise.all([
			enfant.exited,
			new Response(enfant.stdout).text(),
			new Response(enfant.stderr).text(),
		])
		const texte = sortie + erreurs
		const verdicts = [...texte.matchAll(/^\((pass|fail)\) (.+?) \[/gm)].map(([, verdict, nom]) => `${verdict} ${nom}`)

		expect(verdicts).toEqual([
			'pass TEMOIN service déclaré',
			'fail TEMOIN service déclaré par le test d’avant seulement',
			'fail TEMOIN hôte non déclaré, erreur avalée',
			'fail TEMOIN hôte non déclaré, appelé sans fetch',
			// A request made after the last test, in an `afterAll`: the run fails too.
			'fail (unnamed)',
		])
		expect(code).toBe(1)
		expect(texte).toContain(
			'Requête sortante non simulée pendant ce test, ou juste avant lui : GET https://non-declare.example.test/etat (hôte « non-declare.example.test »).'
		)
		expect(texte).toContain('CONNECT https://par-node.example.test (hôte « par-node.example.test »).')
		expect(texte).toContain(
			'Requête sortante non simulée après le dernier test : GET https://hors-test.example.test/etat (hôte « hors-test.example.test »).'
		)
		expect(texte).not.toContain('secret-du-temoin')
	})

	test('le verdict ne dit rien sans refus, et nomme chaque hôte sinon', () => {
		const refus: Refus[] = [
			{ methode: 'GET', hote: 'a.example.test', adresse: 'https://a.example.test/x', vuePar: 'simulation' },
			{ methode: 'CONNECT', hote: 'b.example.test', adresse: 'https://b.example.test', vuePar: 'filet' },
		]

		expect(() => exigerAucunRefus(' pendant ce test')).not.toThrow()
		expect(messageDesRefus(refus, ' pendant ce test').split('\n')).toEqual([
			'2 requêtes sortantes non simulées pendant ce test : GET https://a.example.test/x (hôte « a.example.test ») ; CONNECT https://b.example.test (hôte « b.example.test »).',
			'Aucun test n’appelle Internet : simule ce service dans le test, par simuler(http.get(adresse, () => HttpResponse.json(…))).',
			'Sous bun, seul fetch se simule : une requête faite par node:http, undici ou Bun.fetch, ou qu’une déclaration laisse passer, finit dans le filet.',
			'Guide : docs/tests/http-sortant.md',
		])
		expect(new RequeteNonSimulee(refus).refus).toEqual(refus)
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
		expect(refusDeLigne(ligne)).toEqual({ ...attendu, vuePar: 'filet' })
	})
})

describe('Le banc lui-même n’est pas intercepté', () => {
	test('une requête vers ce poste atteint le vrai service, par fetch comme par les autres sorties', async () => {
		const adresse = `http://127.0.0.1:${dedans.port}/etat`
		atteintesDedans = 0

		expect(await (await fetch(adresse)).text()).toBe(VRAIE_REPONSE)
		expect(await (await fetch(`http://localhost:${dedans.port}/etat`)).text()).toBe(VRAIE_REPONSE)
		expect(await (await Bun.fetch(adresse)).text()).toBe(VRAIE_REPONSE)
		expect(await (await fetchUndici(adresse)).text()).toBe(VRAIE_REPONSE)
		expect(await parNode(requeteHttp, adresse)).toBe(`200 ${VRAIE_REPONSE}`)
		expect(await premierMessage(`ws://127.0.0.1:${dedans.port}/direct`)).toBe('bonjour du vrai serveur')

		expect(atteintesDedans).toBe(6)
		expect(releverLesRefus()).toEqual([])
	})

	test('une adresse de ce poste se simule quand un test la déclare', async () => {
		const adresse = `http://127.0.0.1:${dedans.port}/etat`
		atteintesDedans = 0
		simuler(http.get(adresse, () => new HttpResponse(null, { status: 503 })))

		expect((await fetch(adresse)).status).toBe(503)
		expect(atteintesDedans).toBe(0)
	})

	test('les hôtes du banc sont ceux de la garde d’environnement, et eux seuls', () => {
		// Not the whole list: a service added to the bench is added to the guard, and passes here at once.
		expect([...HOTES_DU_BANC]).toEqual(expect.arrayContaining(['localhost', '127.0.0.1', '::1', 'mailpit', 's3mock']))
		for (const hote of [...HOTES_DU_BANC, '[::1]', 'LOCALHOST']) expect(estHoteDuBanc(hote), hote).toBe(true)
		for (const hote of [
			'127.0.0.2',
			'localhost.example.test',
			'mailpit.example.test',
			'my-makeup.fr',
			'v3.my-makeup.fr',
			'api.resend.com',
		])
			expect(estHoteDuBanc(hote), hote).toBe(false)
	})

	test('le filet est en place pour tout le lancement, et laisse les hôtes du banc de côté', () => {
		const filet = process.env.HTTP_PROXY ?? ''

		expect(filet).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
		for (const nom of ['HTTPS_PROXY', 'http_proxy', 'https_proxy']) expect(process.env[nom], nom).toBe(filet)
		for (const nom of ['NO_PROXY', 'no_proxy'])
			expect(process.env[nom]?.split(','), nom).toEqual([...HOTES_DU_BANC, '[::1]'])
	})
})
