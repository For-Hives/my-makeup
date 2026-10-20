import { afterEach, describe, expect, test } from 'bun:test'
import { createServer, type Server, type Socket } from 'node:net'
import { benchEnvironment, RefusedBench } from '../support/bench'
import { REQUEST_DELAY_MS } from '../support/bench-request'
import { RefusedEnvironment } from '../support/environment-guard'
import {
	benchSink,
	countMails,
	emptySink,
	extractLinks,
	mailLink,
	mailReceived,
	type Sink,
	WAITING_DELAY_MS,
	waitMail,
} from '../support/mailpit'

const BENCH = benchEnvironment({ nom: 'my-makeup-test', decalage: 0 })
const SITE = 'http://localhost:3100'

/** What a test has to close when it ends, whatever happened. */
const toClose: (() => unknown)[] = []
afterEach(async () => {
	await Promise.all(toClose.splice(0).map(fermer => fermer()))
})

/** A catcher that is not the bench: a stand-in on a local port, which answers what the test decides. */
function fakeSink(repondre: (url: URL, requete: Request) => Response): Sink & { demandes: string[] } {
	const requests: string[] = []
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: requete => {
			const url = new URL(requete.url)
			requests.push(`${requete.method} ${url.pathname}`)
			return repondre(url, requete)
		},
	})
	toClose.push(() => server.stop(true))
	return {
		service: 'capteur de mails',
		instance: { nom: 'faux-banc', decalage: 0 },
		api: `http://127.0.0.1:${server.port}`,
		demandes: requests,
	}
}

const sinkTo = (api: string): Sink => ({
	service: 'capteur de mails',
	instance: { nom: 'banc-voisin', decalage: 20 },
	api,
})

const listen = (serveur: Server): Promise<number> =>
	new Promise(resolve =>
		serveur.listen(0, '127.0.0.1', () => {
			const address = serveur.address()
			resolve(address !== null && typeof address !== 'string' ? address.port : 0)
		})
	)

const failure = async (essai: Promise<unknown>): Promise<{ erreur: unknown; dureeMs: number }> => {
	const startedAt = performance.now()
	try {
		await essai
	} catch (error) {
		return { erreur: error, dureeMs: performance.now() - startedAt }
	}
	throw new Error('rien n’a échoué')
}

const refusal = (essai: () => unknown): string => {
	try {
		essai()
	} catch (error) {
		if (error instanceof RefusedBench) return error.message
		throw error
	}
	throw new Error('rien n’a été refusé')
}

describe('Les liens d’un mail', () => {
	test('les liens de la partie HTML, lus comme un navigateur les lit', () => {
		const html = [
			`<p><a href="${SITE}/auth/verification?jeton=abc&amp;retour=profil">Vérifier mon adresse</a></p>`,
			`<a class='bouton' href='${SITE}/auth/reinitialiser?code=1&#38;etape=2'>Changer</a>`,
			`<A HREF=${SITE}/contact>Nous écrire</A>`,
			`<a\n\tstyle="color:#b76e79"\n\thref="${SITE}/cgu?v=1&#x26;lang=fr">Conditions</a>`,
		].join('\n')

		expect(extractLinks(html)).toEqual([
			`${SITE}/auth/verification?jeton=abc&retour=profil`,
			`${SITE}/auth/reinitialiser?code=1&etape=2`,
			`${SITE}/contact`,
			`${SITE}/cgu?v=1&lang=fr`,
		])
	})

	test('seuls les liens web comptent : ni « mailto: », ni ancre, ni adresse relative, ni autre balise', () => {
		const html = [
			'<a href="mailto:contact@example.test">Nous écrire</a>',
			'<a href="tel:+33199000000">Appeler</a>',
			'<a href="#haut">Haut de page</a>',
			'<a href="/auth">Mon espace</a>',
			'<a href="javascript:void(0)">Rien</a>',
			`<abbr href="${SITE}/abbr">abréviation</abbr>`,
			`<link href="${SITE}/style.css">`,
			`<a href="${SITE}/seul">Le seul lien</a>`,
		].join('')

		expect(extractLinks(html)).toEqual([`${SITE}/seul`])
	})

	test('les adresses de la partie texte, sans la ponctuation qui les suit', () => {
		const text = [
			`Ouvre ce lien : ${SITE}/auth/verification?jeton=abc&retour=profil.`,
			`Ou celui-ci (${SITE}/auth/signin), puis « ${SITE}/contact » !`,
			'Sans lien : www.example.test et contact@example.test',
		].join('\n')

		expect(extractLinks('', text)).toEqual([
			`${SITE}/auth/verification?jeton=abc&retour=profil`,
			`${SITE}/auth/signin`,
			`${SITE}/contact`,
		])
	})

	test('chaque lien une fois, ceux de la partie HTML d’abord', () => {
		const html = `<a href="${SITE}/b">B</a> <a href="${SITE}/a?x=1&amp;y=2">A</a> <a href="${SITE}/b">B encore</a>`
		const text = `A : ${SITE}/a?x=1&y=2\nC : ${SITE}/c\nB : ${SITE}/b`

		expect(extractLinks(html, text)).toEqual([`${SITE}/b`, `${SITE}/a?x=1&y=2`, `${SITE}/c`])
	})

	test('un mail sans lien n’en a aucun', () => {
		expect(extractLinks('<p>Bonjour &amp; bienvenue</p>', 'Bonjour & bienvenue')).toEqual([])
		expect(extractLinks('')).toEqual([])
	})

	test('une entité inconnue ou hors limites est laissée telle quelle', () => {
		expect(extractLinks(`<a href="${SITE}/a?x=&inconnue;&#x110000;&#9999999;">A</a>`)).toEqual([
			`${SITE}/a?x=&inconnue;&#x110000;&#9999999;`,
		])
	})
})

describe('Le lien d’un mail vers une page', () => {
	const mail = {
		sujet: 'Réinitialise ton mot de passe',
		liens: [`${SITE}/auth/reinitialiser?code=jeton-temoin`, `${SITE}/contact`, `${SITE}/auth/reinitialiser/aide`],
	}

	test('par son chemin exact, ou par un motif', () => {
		expect(mailLink(mail, '/auth/reinitialiser')).toBe(`${SITE}/auth/reinitialiser?code=jeton-temoin`)
		expect(mailLink(mail, '/contact')).toBe(`${SITE}/contact`)
		expect(mailLink(mail, /\/aide$/)).toBe(`${SITE}/auth/reinitialiser/aide`)
	})

	test('aucun lien vers cette page : l’erreur liste les liens du mail, sans leurs paramètres', () => {
		expect(() => mailLink(mail, '/auth/verification')).toThrow(
			`Aucun lien vers « /auth/verification » dans le mail « Réinitialise ton mot de passe ». Ses liens, sans leurs paramètres : ${SITE}/auth/reinitialiser, ${SITE}/contact, ${SITE}/auth/reinitialiser/aide.`
		)
		expect(() => mailLink(mail, /verification/)).toThrow(
			`Aucun lien qui corresponde à /verification/ dans le mail « Réinitialise ton mot de passe ». Ses liens, sans leurs paramètres : ${SITE}/auth/reinitialiser, `
		)
		// A token read in a mail is never copied into a message.
		expect(() => mailLink(mail, /verification/)).not.toThrow(/jeton-temoin/)
	})

	test('un mail sans lien le dit', () => {
		expect(() => mailLink({ sujet: 'Bienvenue', liens: [] }, '/auth')).toThrow(
			'Aucun lien vers « /auth » dans le mail « Bienvenue ». Il ne contient aucun lien.'
		)
	})
})

describe('Le client ne lit et ne vide que le capteur du banc de son instance', () => {
	test('le capteur du banc est reconnu : c’est celui de .env.test', () => {
		expect(benchSink(BENCH)).toEqual({
			service: 'capteur de mails',
			instance: { nom: 'my-makeup-test', decalage: 0 },
			api: 'http://127.0.0.1:8025',
		})
	})

	test('sans capteur réglé, tout s’arrête avec la commande à lancer', () => {
		expect(refusal(() => benchSink({}))).toBe(
			'Aucun banc de test n’est réglé (MAILPIT_URL manque) : le capteur de mails n’est ni lu ni vidé. Démarre le banc par « bun run bench:up », puis lance les tests par « bun run test:integration ».'
		)
		expect(refusal(() => benchSink({ ...BENCH, SMTP_PORT: '' }))).toStartWith(
			'Aucun banc de test n’est réglé (SMTP_PORT manque)'
		)
	})

	test.each([
		['le capteur d’une autre instance', { MAILPIT_URL: 'http://127.0.0.1:8045' }, 'MAILPIT_URL'],
		['un capteur distant', { MAILPIT_URL: 'https://mailpit.example.test' }, 'MAILPIT_URL'],
		// The application would then send somewhere else than where the client reads.
		['un relais qui n’est pas celui du capteur', { SMTP_HOST: 'smtp.example.test' }, 'SMTP_HOST'],
		['le port SMTP d’une autre instance', { SMTP_PORT: '1045' }, 'SMTP_PORT'],
	])('refuse %s, sans recopier l’adresse', (_cas, variables, nom) => {
		const message = refusal(() => benchSink({ ...BENCH, ...variables }))

		expect(message).toStartWith(`${nom} ne désigne pas le capteur de mails du banc de test : il n’est ni lu ni vidé.`)
		for (const value of Object.values(variables)) expect(message).not.toContain(value)
	})

	test('le capteur d’une instance décalée n’est reconnu que sous les variables de cette instance', () => {
		const neighbor = benchEnvironment({ nom: 'voisin', decalage: 20 })
		const instance = { BENCH_INSTANCE: 'voisin', BENCH_OFFSET: '20' }

		expect(benchSink({ ...neighbor, ...instance }).api).toBe('http://127.0.0.1:8045')
		expect(() => benchSink(neighbor)).toThrow(RefusedBench)
		expect(refusal(() => benchSink(instance))).toContain('« BENCH_INSTANCE=voisin BENCH_OFFSET=20 bun run bench:up »')
	})

	test('un capteur qui n’est pas sur ce poste est refusé avant toute requête, même donné à la main', async () => {
		const distant = sinkTo('https://mailpit.example.test')

		for (const attempt of [
			() => emptySink({ capteur: distant }),
			() => countMails({ capteur: distant }),
			() => mailReceived('lea@example.test', { capteur: distant }),
			() => waitMail({ pour: 'lea@example.test' }, { capteur: distant }),
		]) {
			const { erreur: error } = await failure(attempt())

			expect(error).toBeInstanceOf(RefusedEnvironment)
			expect((error as Error).message).toStartWith('MAILPIT_URL refusée (hôte « mailpit.example.test »)')
		}
	})
})

describe('Capteur arrêté ou muet : une erreur lisible en moins de 5 secondes', () => {
	const MESSAGE = (hote: string) =>
		`Le banc de test « banc-voisin » ne répond pas : capteur de mails (${hote}).\nDémarre-le d’abord : BENCH_INSTANCE=banc-voisin BENCH_OFFSET=20 bun run bench:up`

	test('arrêté : la connexion est refusée, l’erreur nomme le service, son adresse et la commande', async () => {
		const server = createServer()
		const port = await listen(server)
		await new Promise(resolve => server.close(resolve))

		const { erreur: error, dureeMs: durationMs } = await failure(
			waitMail({ pour: 'lea@example.test' }, { capteur: sinkTo(`http://127.0.0.1:${port}`) })
		)

		expect(error).toBeInstanceOf(RefusedBench)
		expect((error as Error).message).toBe(MESSAGE(`127.0.0.1:${port}`))
		// Not after the wait for a mail: the first look at the mailbox is what fails.
		expect(durationMs).toBeLessThan(1000)
	})

	test('muet : il accepte la connexion et ne dit rien, la demande est abandonnée à son délai', async () => {
		const takenList: Socket[] = []
		const server = createServer(prise => takenList.push(prise))
		const port = await listen(server)
		toClose.push(() => {
			for (const taken of takenList) taken.destroy()
			server.close()
		})

		const { erreur: error, dureeMs: durationMs } = await failure(
			waitMail({ pour: 'lea@example.test' }, { capteur: sinkTo(`http://127.0.0.1:${port}`) })
		)

		expect(error).toBeInstanceOf(RefusedBench)
		expect((error as Error).message).toBe(MESSAGE(`127.0.0.1:${port}`))
		expect(durationMs).toBeGreaterThanOrEqual(REQUEST_DELAY_MS - 100)
		expect(durationMs).toBeLessThan(5000)
	}, 5000)

	test('l’attente d’un mail et une demande sans réponse tiennent ensemble en moins de 5 secondes', () => {
		expect(WAITING_DELAY_MS + REQUEST_DELAY_MS).toBeLessThan(5000)
	})
})

describe('Ce que le capteur répond', () => {
	const json = (corps: unknown): Response => Response.json(corps)
	const resume = (rang: number, adresse: string) => ({
		ID: `mail-${rang}`,
		To: [{ Name: '', Address: adresse }],
		Cc: null,
		Bcc: null,
		Subject: `Mail ${rang}`,
		// One second apart, the first one being the oldest.
		Created: new Date(Date.UTC(2026, 9, 14, 8, 0, rang)).toISOString(),
	})

	test('une recherche est lue page par page, et seule l’adresse exacte est gardée', async () => {
		const forValue = 'lea@example.test'
		// 230 mails match the search of Mailpit; every tenth one is for a longer address that holds this one.
		const found = Array.from({ length: 230 }, (_mail, rang) =>
			resume(rang, rang % 10 === 0 ? `zoe-${forValue}` : forValue)
		)
		const searches: (string | null)[] = []
		const sink = fakeSink(url => {
			if (url.pathname !== '/api/v1/search') return new Response('', { status: 404 })
			const startedAt = Number(url.searchParams.get('start'))
			const limit = Number(url.searchParams.get('limit'))
			searches.push(url.searchParams.get('query'))
			return json({ messages_count: found.length, messages: found.slice(startedAt, startedAt + limit) })
		})
		const [first, last] = [resume(1, forValue), resume(229, forValue)]
		const read: string[] = []
		const withReading = fakeSink(url => {
			if (url.pathname === '/api/v1/search') return json({ messages_count: 2, messages: [first, last] })
			read.push(url.pathname)
			return json({
				...last,
				From: { Name: 'My Makeup', Address: 'ne-pas-repondre@example.test' },
				ReplyTo: [],
				Date: last.Created,
				Text: 'Bonjour\r\nLéa\r\n',
				HTML: '',
			})
		})

		const { erreur: error } = await failure(
			waitMail({ pour: forValue, sujet: 'Absent' }, { capteur: sink, delaiMs: 0 })
		)

		expect(sink.demandes).toEqual(['GET /api/v1/search', 'GET /api/v1/search', 'GET /api/v1/search'])
		expect([...new Set(searches)]).toEqual([`addressed:"${forValue}"`])
		expect((error as Error).message).toStartWith(
			`Aucun mail pour « ${forValue} » dont le sujet soit « Absent » dans le capteur de mails au bout de 0 s. Cette adresse en a reçu 207, sous un autre sujet : « Mail 229 », « Mail 228 », `
		)
		// The most recent one is the one that is read, whatever the order of the answer.
		expect((await waitMail({ pour: forValue }, { capteur: withReading })).texte).toBe('Bonjour\nLéa')
		expect(read).toEqual(['/api/v1/message/mail-229'])
	})

	test.each([
		['une erreur', () => new Response('panne', { status: 500 }), 'a répondu 500 à la demande « chercher ».'],
		[
			'autre chose que du JSON',
			() => new Response('<html>', { status: 200 }),
			'a répondu autre chose que prévu à la demande « chercher ».',
		],
		[
			'un JSON d’une autre forme',
			() => Response.json({ messages: 'aucun' }),
			'a répondu autre chose que prévu à la demande « chercher ».',
		],
	])('%s : l’erreur dit quel service, de quel banc, à quelle demande', async (_cas, repondre, fin) => {
		const { erreur: error } = await failure(mailReceived('lea@example.test', { capteur: fakeSink(repondre) }))

		expect((error as Error).message).toBe(`Le capteur de mails du banc « faux-banc » ${fin}`)
	})

	test('une remise à zéro que le capteur refuse est une erreur', async () => {
		const sink = fakeSink(() => new Response('', { status: 503 }))

		const { erreur: error } = await failure(emptySink({ capteur: sink }))

		expect(sink.demandes).toEqual(['DELETE /api/v1/messages'])
		expect((error as Error).message).toBe(
			'Le capteur de mails du banc « faux-banc » a répondu 503 à la demande « vider ».'
		)
	})

	test('une adresse qui n’en est pas une n’est pas cherchée', async () => {
		const sink = fakeSink(() => new Response('', { status: 500 }))

		for (const forValue of ['', 'lea', 'lea@example.test" OR "', 'Léa Martin <lea@example.test>'])
			expect((await failure(mailReceived(forValue, { capteur: sink }))).erreur).toEqual(
				new Error('Adresse illisible : une adresse entière est attendue.')
			)
		expect(sink.demandes).toEqual([])
	})
})
