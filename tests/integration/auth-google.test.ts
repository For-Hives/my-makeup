import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { finishGoogleSignIn, type GoogleOutcome } from '@/lib/auth/google/google-sign-in'
import {
	type ConfigGoogle,
	clearDocuments,
	discover,
	type PendingRequest,
	prepareStart,
	type Query,
	seal,
} from '@/lib/auth/google/oidc'
import { createRateLimit, type RateLimit } from '@/lib/auth/rate-limit'
import { closeSession } from '@/lib/auth/sign-out'
import { createAccount } from '../support/account-factory'
import { type Demande, fakeGoogle } from '../support/fake-google'
import { countMails, emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * The Google sign-in and sign-up (tickets 090 and 091; plan 02 E07), against the fake Google of
 * the bench: the real discovery, the real exchange of the code, a real signed ID token. The route
 * itself, the cookie in a browser and the pages are played by tests/e2e/google-sign-in.spec.ts.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? ''
const SECRET = process.env.PAYLOAD_SECRET ?? ''
const google = fakeGoogle()
const config: ConfigGoogle = {
	emetteur: google.emetteur,
	clientId: google.clientId,
	clientSecret: google.secret,
	redirectUri: `${SITE}/auth/google/callback`,
}

beforeAll(() => clearDocuments())
beforeEach(() => emptySink())
afterAll(async () => {
	await emptyBase()
})

interface Pass {
	issue: GoogleOutcome
	/** The address Google sent the browser back to: it carries the code. */
	retour: URL
}

/** One trip to the fake Google, from the departure to the end of the return. */
async function pass(
	demande: Demande,
	{
		retourSouhaite = '/auth/profil',
		modifier,
		client,
		frein: rateLimit,
		requeter,
	}: {
		retourSouhaite?: string
		client?: string
		frein?: RateLimit
		requeter?: Query
		modifier?: (parametres: URLSearchParams, depart: { cookie: string }) => string | undefined
	} = {}
): Promise<Pass> {
	const payload = await testPayload()
	const start = prepareStart(config, await discover(config.emetteur), { retour: retourSouhaite, secret: SECRET })
	const returned = await google.autoriser(start.adresse, google.choisir(demande))
	const parameters = new URLSearchParams(returned.searchParams)
	const cookie = modifier ? modifier(parameters, start) : start.cookie
	const issue = await finishGoogleSignIn({
		payload,
		config,
		secret: SECRET,
		retour: { code: parameters.get('code'), state: parameters.get('state'), error: parameters.get('error') },
		cookie,
		journal: authLog(payload),
		client,
		frein: rateLimit,
		requeter,
	})
	return { issue, retour: returned }
}

const url = (prefixe: string) => `${prefixe}-${crypto.randomUUID().slice(0, 8)}@example.test`

async function accounts(email: string) {
	const payload = await testPayload()
	return (await payload.find({ collection: 'pros', depth: 0, limit: 10, where: { email: { equals: email } } })).docs
}

async function logLines() {
	const payload = await testPayload()
	return (await payload.find({ collection: 'auth-events', depth: 0, limit: 1000, sort: 'id' })).docs
}

/** Who Payload says is behind this token, the way a page of the space asks. */
async function which(token: string) {
	const payload = await testPayload()
	return (await payload.auth({ headers: new Headers({ Cookie: `payload-token=${token}`, Origin: SITE }) })).user
}

describe('E07 : un compte venu de Google se retrouve par son email vérifié', () => {
	test('l’ancien compte Google est retrouvé : même compte, même profil, aucun doublon, aucun mail', async () => {
		const account = await createAccount('reprise-google')
		const payload = await testPayload()
		const before = await payload.count({ collection: 'pros' })
		const profilesBefore = await payload.find({
			collection: 'profiles',
			depth: 0,
			where: { pro: { equals: account.id } },
		})

		const { issue } = await pass({ email: account.email })

		if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
		expect(issue.nouveau).toBe(false)
		expect(issue.destination).toBe('/auth/profil')
		expect((await which(issue.token))?.id).toBe(Number(account.id))
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(before.totalDocs)
		const profiles = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
		expect(profiles.docs.map(p => p.id)).toEqual(profilesBefore.docs.map(p => p.id))
		expect(await accounts(account.email)).toHaveLength(1)
		expect(await countMails()).toBe(0)
	})

	test('l’email est comparé sans tenir compte de la casse', async () => {
		const account = await createAccount('reprise-google')
		const { issue } = await pass({ email: account.email.toUpperCase() })
		expect(issue.ok).toBe(true)
		expect(await accounts(account.email)).toHaveLength(1)
	})

	test('un ancien compte Google qui a aussi un hash se connecte par Google', async () => {
		const account = await createAccount('reprise-google-avec-hash')
		const { issue } = await pass({ email: account.email })
		expect(issue.ok).toBe(true)
	})

	test('la session est celle du mot de passe : elle se ferme par la déconnexion, le jeton rejoué est refusé', async () => {
		const account = await createAccount('reprise-google')
		const { issue } = await pass({ email: account.email })
		if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
		const payload = await testPayload()
		const headers = new Headers({ Cookie: `payload-token=${issue.token}`, Origin: SITE })
		expect((await which(issue.token))?.id).toBe(Number(account.id))
		const line = await payload.db.findOne<{ id: number; sessions?: unknown[]; lastSignInAt?: string }>({
			collection: 'pros',
			where: { id: { equals: account.id } },
		})
		expect(line?.sessions?.length).toBeGreaterThan(0)
		expect(line?.lastSignInAt).toBeDefined()

		expect(await closeSession({ payload, headers: headers, toutes: false })).toEqual({ ok: true, fermee: true })

		expect(await which(issue.token)).toBeNull()
	})

	test('l’événement « connexion » porte la méthode google, sans rien d’autre', async () => {
		const account = await createAccount('reprise-google')
		const before = (await logLines()).length

		await pass({ email: account.email })

		const fresh = (await logLines()).slice(before)
		expect(fresh.map(({ type, code, method }) => ({ type, code, method }))).toEqual([
			{ type: 'sign-in', code: 'ok', method: 'google' },
		])
		expect(Object.keys(fresh[0] ?? {}).sort()).toEqual(['code', 'date', 'durationMs', 'id', 'method', 'type'])
	})
})

describe('tout ce qui vient de Google est vérifié avant d’être cru', () => {
	test('un retour dont le state n’est pas celui du cookie est refusé, sans compte', async () => {
		const email = url('forge')
		const { issue } = await pass(
			{ email },
			{
				modifier: parametres => {
					parametres.set('state', 'forge')
					return seal(randomRequest(), SECRET)
				},
			}
		)
		expect(issue).toEqual({ ok: false, code: 'google-echec' })
		expect(await accounts(email)).toHaveLength(0)
	})

	test('un state changé dans l’adresse, avec le bon cookie, est refusé', async () => {
		const email = url('state-change')
		const { issue } = await pass(
			{ email },
			{
				modifier: (parametres, depart) => {
					parametres.set('state', 'un-autre-state')
					return depart.cookie
				},
			}
		)
		expect(issue).toEqual({ ok: false, code: 'google-echec' })
		expect(await accounts(email)).toHaveLength(0)
	})

	test('un retour sans le cookie, ou avec un cookie qui n’est pas signé par nous, est refusé', async () => {
		const email = url('sans-cookie')
		for (const cookie of [
			undefined,
			'',
			'abc',
			seal(randomRequest(), 'une-autre-cle-qui-fait-plus-de-32-caracteres'),
		]) {
			const { issue } = await pass({ email }, { modifier: () => cookie })
			expect(issue).toEqual({ ok: false, code: 'google-echec' })
		}
		expect(await accounts(email)).toHaveLength(0)
	})

	test('un cookie dont le délai est passé est refusé', async () => {
		const email = url('expire')
		const { issue } = await pass(
			{ email },
			{
				modifier: (_parametres, depart) => {
					const request = JSON.parse(Buffer.from(depart.cookie.split('.')[0] ?? '', 'base64url').toString('utf8'))
					return seal({ ...request, expire: 1 }, SECRET)
				},
			}
		)
		expect(issue.ok).toBe(false)
		expect(await accounts(email)).toHaveLength(0)
	})

	test('un code que Google ne connaît pas est refusé, sans exception', async () => {
		const email = url('faux-code')
		const { issue } = await pass(
			{ email },
			{
				modifier: (parametres, depart) => {
					parametres.set('code', 'code-forge')
					return depart.cookie
				},
			}
		)
		expect(issue).toEqual({ ok: false, code: 'google-echec' })
		expect(await accounts(email)).toHaveLength(0)
	})

	test('un retour sans code est refusé', async () => {
		const { issue } = await pass(
			{ email: url('sans-code') },
			{
				modifier: (parametres, depart) => {
					parametres.delete('code')
					return depart.cookie
				},
			}
		)
		expect(issue).toEqual({ ok: false, code: 'google-echec' })
	})
})

describe('091 : une personne sans compte s’inscrit avec Google', () => {
	test('nouvelle identité vérifiée : compte confirmé, profil avec son slug, arrivée à l’onboarding, aucun mail', async () => {
		const email = url('nouvelle')

		const { issue } = await pass({ email, prenom: 'Léa', nomDeFamille: 'Fictive' }, { retourSouhaite: '/auth/profil' })

		if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
		expect(issue.nouveau).toBe(true)
		expect(issue.destination).toBe('/auth/init-account')
		const [pro] = await accounts(email)
		expect(pro).toMatchObject({ name: 'Léa Fictive', _verified: true, legacyProvider: 'google' })
		const payload = await testPayload()
		const profiles = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: pro?.id } } })
		expect(profiles.totalDocs).toBe(1)
		expect(profiles.docs[0]?.slug).toMatch(/^lea-fictive(-\d+)?$/)
		expect((await which(issue.token))?.id).toBe(pro?.id)
		expect(await countMails()).toBe(0)
		const lines = (await logLines()).filter(l => l.method === 'google').map(({ type, code }) => `${type}:${code}`)
		expect(lines).toContain('sign-up:ok')
		expect(lines).toContain('sign-in:ok')
	})

	test('second passage : une connexion, aucun doublon, ni compte ni profil, et vers la page demandée', async () => {
		const email = url('second')
		const first = await pass({ email })
		const payload = await testPayload()
		const [pro] = await accounts(email)

		const second = await pass({ email }, { retourSouhaite: '/auth/profil' })

		expect(first.issue.ok && first.issue.nouveau).toBe(true)
		if (!second.issue.ok) throw new Error(`refusé : ${second.issue.code}`)
		expect(second.issue.nouveau).toBe(false)
		expect(second.issue.destination).toBe('/auth/profil')
		expect(await accounts(email)).toHaveLength(1)
		expect((await which(second.issue.token))?.id).toBe(pro?.id)
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: pro?.id } } })).totalDocs
		).toBe(1)
		expect(await countMails()).toBe(0)
	})

	test('deux premiers passages au même moment : un seul compte, un seul profil, deux sessions valables', async () => {
		const email = url('course')
		// Three at once: the first creates, the others find the account and open their own session.
		// Flaky before ticket 235: the sessions of an account were read and written back whole, so two
		// sign-ins of the same account at the same moment collided or erased each other.
		const passages = await Promise.all([pass({ email }), pass({ email }), pass({ email })])
		const tokens = passages.map(({ issue }) => {
			if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
			return issue.token
		})
		const [pro] = await accounts(email)
		expect(await accounts(email)).toHaveLength(1)
		expect(passages.filter(({ issue }) => issue.ok && issue.nouveau)).toHaveLength(1)
		const payload = await testPayload()
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: pro?.id } } })).totalDocs
		).toBe(1)
		// Every token opens the account: none of the sessions was lost.
		expect((await Promise.all(tokens.map(which))).map(user => user?.id)).toEqual(tokens.map(() => pro?.id))
	})

	test('email non vérifié par Google : refus, aucun compte, ni pour une adresse libre ni pour un compte qui existe', async () => {
		const free = url('non-verifie')
		const existing = await createAccount('reprise-google')
		const payload = await testPayload()
		const before = (await payload.count({ collection: 'pros' })).totalDocs

		const a = await pass({ scenario: 'email-non-verifie', email: free })
		const b = await pass({ scenario: 'email-non-verifie', email: existing.email })

		expect(a.issue).toEqual({ ok: false, code: 'google-email-non-verifie' })
		expect(b.issue).toEqual({ ok: false, code: 'google-email-non-verifie' })
		expect(await accounts(free)).toHaveLength(0)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(before)
		expect(await countMails()).toBe(0)
	})
})

describe('un compte qui ne vient pas de Google n’est jamais ouvert ni lié', () => {
	test.each([
		['un compte à mot de passe', 'maquilleuse'],
		['un ancien compte Facebook', 'reprise-facebook'],
		['un ancien compte à mot de passe', 'reprise-avec-hash'],
	] as const)('%s : refus, aucune session, le compte est laissé tel quel', async (_nom, type) => {
		const account = await createAccount(type)
		const payload = await testPayload()
		const before = await payload.db.findOne<{ id: number; legacyProvider?: string; sessions?: unknown[] }>({
			collection: 'pros',
			where: { id: { equals: account.id } },
		})

		const { issue } = await pass({ email: account.email })

		expect(issue).toEqual({ ok: false, code: 'email-deja-avec-mot-de-passe' })
		const after = await payload.db.findOne<{ id: number; legacyProvider?: string; sessions?: unknown[] }>({
			collection: 'pros',
			where: { id: { equals: account.id } },
		})
		expect(after?.legacyProvider).toBe(before?.legacyProvider)
		expect(after?.sessions).toEqual(before?.sessions)
		expect(await accounts(account.email)).toHaveLength(1)
	})

	test('un compte Google bloqué est refusé, avec son propre code', async () => {
		const account = await createAccount('reprise-google')
		const payload = await testPayload()
		await payload.update({ collection: 'pros', id: account.id, data: { blocked: true }, overrideAccess: true })

		const { issue } = await pass({ email: account.email })

		expect(issue).toEqual({ ok: false, code: 'compte-bloque' })
		expect(await accounts(account.email)).toHaveLength(1)
	})

	test('un compte à mot de passe bloqué est dit bloqué, et rien n’est lié', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		await payload.update({ collection: 'pros', id: account.id, data: { blocked: true }, overrideAccess: true })

		const { issue } = await pass({ email: account.email })

		expect(issue).toEqual({ ok: false, code: 'compte-bloque' })
		const after = await payload.db.findOne<{ id: number; legacyProvider?: string }>({
			collection: 'pros',
			where: { id: { equals: account.id } },
		})
		expect(after?.legacyProvider).not.toBe('google')
	})
})

describe('l’annulation et la panne de Google ne cassent rien', () => {
	test('refus : retour à la connexion avec un code, aucun compte', async () => {
		const email = url('refus')
		const { issue, retour: returned } = await pass({ scenario: 'refus', email })
		expect(returned.searchParams.get('error')).toBe('access_denied')
		expect(issue).toEqual({ ok: false, code: 'google-annule' })
		expect(await accounts(email)).toHaveLength(0)
	})

	test('panne à l’échange du code : retour à la connexion avec un code, sans exception', async () => {
		const email = url('panne')
		const { issue } = await pass({ scenario: 'panne', email })
		expect(issue).toEqual({ ok: false, code: 'google-indisponible' })
		expect(await accounts(email)).toHaveLength(0)
	})

	test('chaque refus laisse sa ligne au journal, avec la méthode google', async () => {
		const before = (await logLines()).length
		await pass({ scenario: 'refus', email: url('j1') })
		await pass({ scenario: 'panne', email: url('j2') })
		await pass({ scenario: 'email-non-verifie', email: url('j3') })
		const lines = (await logLines()).slice(before)
		expect(lines.map(({ type, code, method }) => `${type}:${code}:${method}`)).toEqual([
			'sign-in:annule:google',
			'sign-in:service-indisponible:google',
			'sign-in:email-non-verifie:google',
		])
	})
})

describe('rien de ce que Google envoie n’est écrit', () => {
	const outputs: unknown[][] = []
	const spies = [] as ReturnType<typeof spyOn>[]
	beforeEach(() => {
		outputs.length = 0
		for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
			spies.push(spyOn(console, level).mockImplementation((...args: unknown[]) => void outputs.push(args)))
	})
	afterEach(() => {
		for (const spy of spies.splice(0)) spy.mockRestore()
	})

	test('ni le code, ni le state, ni le jeton, ni l’adresse ne sont dans les journaux, la console ou les résultats', async () => {
		const email = url('discret')
		const succeeded = await pass({ email })
		const refuse = await pass({ scenario: 'panne', email: url('discret-panne') })

		const secrets = [succeeded.retour, refuse.retour].flatMap(url =>
			['code', 'state'].map(nom => url.searchParams.get(nom) ?? '')
		)
		expect(secrets.every(secret => secret.length > 10)).toBe(true)
		const surface = JSON.stringify([
			outputs,
			(await logLines()).map(({ type, code, method, durationMs }) => ({ type, code, method, durationMs })),
			{ ...refuse.issue },
			{ ...succeeded.issue, token: undefined },
		])
		for (const secret of secrets) expect(surface).not.toContain(secret)
		expect(surface).not.toContain(email)
		expect(surface).not.toMatch(/id_token|access_token/)
		expect(surface).not.toContain(google.secret)
	})
})

function randomRequest(): PendingRequest {
	return {
		state: 'autre',
		nonce: 'autre',
		verifier: 'autre',
		retour: '/auth/profil',
		expire: Math.floor(Date.now() / 1000) + 600,
	}
}

describe('ticket 223, constat 9 : ce que Google dit par lui-même, et sa découverte en panne', () => {
	/** A return that carries `error` and no code, with the cookie of the real departure. */
	const withError = (erreur: string) => ({
		modifier: (parametres: URLSearchParams, depart: { cookie: string }) => {
			parametres.delete('code')
			parametres.set('error', erreur)
			return depart.cookie
		},
	})

	test.each([
		['server_error', 'google-indisponible', 'service-indisponible'],
		['temporarily_unavailable', 'google-indisponible', 'service-indisponible'],
		['access_denied', 'google-annule', 'annule'],
		['invalid_request', 'google-echec', 'retour-invalide'],
		['unauthorized_client', 'google-echec', 'retour-invalide'],
		['invalid_scope', 'google-echec', 'retour-invalide'],
		['une-valeur-que-personne-ne-connait', 'google-echec', 'retour-invalide'],
	] as const)('error=%s : le code %s, la ligne %s, aucun compte', async (erreur, codeUrl, codeJournal) => {
		const before = (await logLines()).length
		const email = url('erreur-google')

		const { issue } = await pass({ email }, withError(erreur))

		expect(issue).toEqual({ ok: false, code: codeUrl })
		expect(await accounts(email)).toHaveLength(0)
		const lines = (await logLines()).slice(before)
		expect(lines.map(({ type, code, method }) => `${type}:${code}:${method}`)).toEqual([
			`sign-in:${codeJournal}:google`,
		])
		// What Google said is not written anywhere.
		expect(JSON.stringify(lines)).not.toContain(erreur)
	})

	test('la découverte en panne au retour : google-indisponible, une ligne service-indisponible, aucun compte', async () => {
		const before = (await logLines()).length
		const email = url('decouverte-retour')
		const payload = await testPayload()
		const start = prepareStart(config, await discover(config.emetteur), {
			retour: '/auth/profil',
			secret: SECRET,
		})
		const returned = await google.autoriser(start.adresse, google.choisir({ email }))
		clearDocuments()

		const issue = await finishGoogleSignIn({
			payload,
			config,
			secret: SECRET,
			retour: {
				code: returned.searchParams.get('code'),
				state: returned.searchParams.get('state'),
				error: null,
			},
			cookie: start.cookie,
			journal: authLog(payload),
			requeter: async () => {
				throw new Error('réseau coupé')
			},
		})

		expect(issue).toEqual({ ok: false, code: 'google-indisponible' })
		expect(await accounts(email)).toHaveLength(0)
		expect((await logLines()).slice(before).map(({ code }) => code)).toEqual(['service-indisponible'])
	})

	test('le départ, la découverte en panne : retour à la connexion avec google-indisponible, sans cookie ni exception', async () => {
		const { GET } = await import('@/app/(front)/(dashboard)/auth/google/route')
		const before = process.env.GOOGLE_OIDC_ISSUER
		// A local port where nothing listens: the discovery document cannot be read.
		process.env.GOOGLE_OIDC_ISSUER = 'http://127.0.0.1:9'
		clearDocuments()
		try {
			const response = await GET(new Request(`${SITE}/auth/google?callbackUrl=%2Fauth%2Fprofil`))
			expect(response.status).toBe(307)
			expect(response.headers.get('location')).toBe(`${SITE}/auth/signin?error=google-indisponible`)
			expect(response.headers.get('set-cookie')).toBeNull()
		} finally {
			if (before === undefined) delete process.env.GOOGLE_OIDC_ISSUER
			else process.env.GOOGLE_OIDC_ISSUER = before
			clearDocuments()
		}
	})
})

describe('ticket 223, constat 3 : le retour est freiné par adresse et ses lignes de refus sont bornées', () => {
	/** A return with a state that is not ours, from this address: the flood of a script. */
	const returnInvalid = (client: string, frein: RateLimit) =>
		pass(
			{ email: url('flood') },
			{
				client,
				frein,
				modifier: parametres => {
					parametres.set('state', 'forge')
					return undefined
				},
			}
		)

	test('passé la limite, le retour est refusé (trop-de-tentatives) ; les lignes du journal restent bornées', async () => {
		const rateLimit = createRateLimit({ nom: `retour-essai-${crypto.randomUUID()}`, limite: 5, fenetreMs: 60_000 })
		const client = `192.0.2.${100 + Math.floor(Math.random() * 100)}`
		const before = (await logLines()).length

		const codes: string[] = []
		for (let i = 0; i < 12; i++) {
			const { issue } = await returnInvalid(client, rateLimit)
			codes.push(issue.ok ? 'ok' : issue.code)
		}

		expect(codes).toEqual([...Array(5).fill('google-echec'), ...Array(7).fill('trop-de-tentatives')])
		const lines = (await logLines()).slice(before)
		const byCode = (code: string) => lines.filter(ligne => ligne.code === code).length
		// 3 an hour per address and outcome, like the refusals of the sign-up (ticket 084).
		expect(byCode('retour-invalide')).toBe(3)
		expect(byCode('trop-de-tentatives')).toBe(3)
		expect(lines).toHaveLength(6)
		// The address is a key in memory: it is written nowhere.
		expect(JSON.stringify(lines)).not.toContain(client)
	})

	test('une autre adresse n’est pas freinée, et un retour qui ouvre une session rend sa place', async () => {
		const rateLimit = createRateLimit({ nom: `retour-essai-${crypto.randomUUID()}`, limite: 2, fenetreMs: 60_000 })
		const client = `192.0.2.${100 + Math.floor(Math.random() * 100)}`
		const other = `198.51.100.${1 + Math.floor(Math.random() * 200)}`

		expect((await returnInvalid(client, rateLimit)).issue).toEqual({ ok: false, code: 'google-echec' })
		// A success on the same address: the place it takes is given back.
		expect((await pass({ email: url('succes') }, { client, frein: rateLimit })).issue.ok).toBe(true)
		expect((await returnInvalid(client, rateLimit)).issue).toEqual({ ok: false, code: 'google-echec' })
		expect((await returnInvalid(client, rateLimit)).issue).toEqual({ ok: false, code: 'trop-de-tentatives' })
		expect((await returnInvalid(other, rateLimit)).issue).toEqual({ ok: false, code: 'google-echec' })
	})
})
