import { beforeAll, describe, expect, test } from 'bun:test'
import { benchEnvironment, INSTANCE_BY_DEFAULT, RefusedBench, ROOT } from '../support/bench'
import { type ChoiceReady, fakeGoogle, SCENARIOS, type ToolFakeGoogle } from '../support/fake-google'
import {
	CHOICE_COOKIE,
	composeChoice,
	decodeChoice,
	encodeChoice,
	RefusedChoice,
	subOf,
} from '../support/fake-google/identity'
import { createFakeGoogle, type FakeGoogle, PATHS } from '../support/fake-google/provider'

/** The bench as `.env.test` describes it. Nothing is opened: the provider is called as a function. */
const BENCH = benchEnvironment({ nom: INSTANCE_BY_DEFAULT, decalage: 0 })
const ISSUER = BENCH.GOOGLE_OIDC_ISSUER ?? ''
const CLIENT = BENCH.GOOGLE_CLIENT_ID ?? ''
const SECRET = BENCH.GOOGLE_CLIENT_SECRET ?? ''
const RETURN = 'http://localhost:3100/retour-du-faux-google'

/** Added to the clock of the provider: a test moves it forward to see a code expire. */
let advanced = 0
let provider: FakeGoogle
let google: ToolFakeGoogle

beforeAll(async () => {
	provider = await createFakeGoogle({
		emetteur: ISSUER,
		clientId: CLIENT,
		secret: SECRET,
		maintenant: () => Date.now() + advanced,
	})
	google = fakeGoogle(BENCH, { requeter: provider.repondre })
})

/** An authorization request as the application would write it, one parameter replaced or removed at will. */
function request(surcharge: Record<string, string | undefined> = {}): URL {
	const url = new URL(`${ISSUER}${PATHS.autorisation}`)
	const parameters: Record<string, string | undefined> = {
		client_id: CLIENT,
		redirect_uri: RETURN,
		response_type: 'code',
		scope: 'openid email profile',
		state: 'etat-du-test',
		...surcharge,
	}
	for (const [name, value] of Object.entries(parameters)) if (value !== undefined) url.searchParams.set(name, value)
	return url
}

/** The code Google sends the browser back with. */
async function getCode(surcharge: Record<string, string | undefined> = {}, choix?: ChoiceReady): Promise<string> {
	const code = (await google.autoriser(request(surcharge), choix)).searchParams.get('code')
	if (!code) throw new Error('aucun code dans le retour')
	return code
}

/** The exchange of a code, as the application sends it: one field replaced or removed at will. */
function exchange(champs: Record<string, string | undefined>, enTetes: Record<string, string> = {}): Promise<Response> {
	const form = new URLSearchParams()
	const full: Record<string, string | undefined> = {
		grant_type: 'authorization_code',
		redirect_uri: RETURN,
		client_id: CLIENT,
		client_secret: SECRET,
		...champs,
	}
	for (const [name, value] of Object.entries(full)) if (value !== undefined) form.set(name, value)
	return provider.repondre(
		new Request(`${ISSUER}${PATHS.jeton}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...enTetes },
			body: form.toString(),
		})
	)
}

const errorOf = async (reponse: Response): Promise<{ status: number; error: unknown }> => ({
	status: reponse.status,
	error: ((await reponse.json()) as { error?: unknown }).error,
})

const loadOf = (jeton: string): Record<string, unknown> =>
	JSON.parse(Buffer.from(jeton.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>

describe('Le faux Google : un aller-retour complet, comme avec Google', () => {
	test('il se présente comme Google : mêmes chemins, même document de découverte, sous son adresse locale', async () => {
		const response = await provider.repondre(new Request(`${ISSUER}${PATHS.decouverte}`))

		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			issuer: ISSUER,
			authorization_endpoint: `${ISSUER}/o/oauth2/v2/auth`,
			token_endpoint: `${ISSUER}/token`,
			userinfo_endpoint: `${ISSUER}/v1/userinfo`,
			jwks_uri: `${ISSUER}/oauth2/v3/certs`,
			id_token_signing_alg_values_supported: ['RS256'],
			code_challenge_methods_supported: ['plain', 'S256'],
		})
	})

	test('email vérifié : code, jetons, jeton d’identité signé, profil, le tout en moins de 5 secondes', async () => {
		const choice = google.choisir({ email: 'lea.martin@example.test', prenom: 'Léa', nomDeFamille: 'Martin' })

		const result = await google.allerRetour(choice)

		if (result.issue !== 'connecte') throw new Error(`issue inattendue : ${result.issue}`)
		expect(result.revendications).toMatchObject({
			iss: ISSUER,
			aud: CLIENT,
			azp: CLIENT,
			sub: subOf('lea.martin@example.test'),
			email: 'lea.martin@example.test',
			email_verified: true,
			name: 'Léa Martin',
			given_name: 'Léa',
			family_name: 'Martin',
		})
		expect(result.revendications.exp - result.revendications.iat).toBe(3600)
		expect(result.profil).toEqual({
			sub: subOf('lea.martin@example.test'),
			email: 'lea.martin@example.test',
			email_verified: true,
			name: 'Léa Martin',
			given_name: 'Léa',
			family_name: 'Martin',
		})
		// What Google adds to its own answer comes back too, and the state as it was sent.
		expect(result.retour.searchParams.get('authuser')).toBe('0')
		expect(result.dureeMs).toBeLessThan(5000)
	})

	test('email non vérifié : la connexion aboutit, et Google dit que l’adresse n’a jamais été confirmée', async () => {
		const result = await google.allerRetour(google.choisir({ scenario: 'email-non-verifie' }))

		if (result.issue !== 'connecte') throw new Error(`issue inattendue : ${result.issue}`)
		expect(result.revendications.email_verified).toBe(false)
		expect(result.profil.email_verified).toBe(false)
		expect(result.revendications.email).toBe('camille.google@example.test')
	})

	test('refus : le navigateur revient avec access_denied et l’état, sans aucun code', async () => {
		const result = await google.allerRetour(google.choisir({ scenario: 'refus' }))

		expect(result.issue).toBe('refus')
		expect(result.retour.searchParams.get('error')).toBe('access_denied')
		expect(result.retour.searchParams.has('code')).toBe(false)
		expect(result.retour.searchParams.get('state')).toBeTruthy()
	})

	test('panne : le code revient, puis son échange répond 503 avec une page, pas du JSON, à chaque essai', async () => {
		const result = await google.allerRetour(google.choisir({ scenario: 'panne' }))
		expect(result).toMatchObject({ issue: 'panne', statut: 503 })

		const code = await getCode({}, google.choisir({ scenario: 'panne' }))
		for (const _test of [1, 2]) {
			const response = await exchange({ code })
			expect(response.status).toBe(503)
			expect(response.headers.get('content-type')).toStartWith('text/html')
			expect(await response.text()).toContain('503 Service Unavailable')
		}
		// Even a client the provider does not know sees the outage, not a refusal.
		expect((await exchange({ code, client_secret: 'secret-factice-mais-faux' })).status).toBe(503)
	})

	test('les quatre scénarios existent, et aucun autre', () => {
		expect([...SCENARIOS]).toEqual(['email-verifie', 'email-non-verifie', 'refus', 'panne'])
		for (const scenario of SCENARIOS) expect(google.choisir({ scenario }).choix.scenario).toBe(scenario)
	})

	test('sans choix, une personne fictive à l’adresse vérifiée se connecte : toujours la même', async () => {
		const withoutCookie = await provider.repondre(new Request(request()))
		const code = new URL(withoutCookie.headers.get('location') ?? '').searchParams.get('code') ?? ''
		const tokens = (await (await exchange({ code })).json()) as { id_token: string }

		expect(loadOf(tokens.id_token)).toMatchObject({
			sub: subOf('camille.google@example.test'),
			email: 'camille.google@example.test',
			email_verified: true,
			name: 'Camille Banc-de-Test',
		})
		expect(google.choisir().choix).toEqual(composeChoice())
	})

	test('second passage : la même adresse est le même compte Google, quelle que soit sa casse', async () => {
		const first = await google.allerRetour(google.choisir({ email: 'zoe@example.test' }))
		const second = await google.allerRetour(google.choisir({ email: 'Zoe@Example.TEST' }))

		if (first.issue !== 'connecte' || second.issue !== 'connecte') throw new Error('connexion attendue')
		expect(second.revendications.sub).toBe(first.revendications.sub)
		expect(second.revendications.email).toBe('Zoe@Example.TEST')
		expect(subOf('zoe@example.test')).toMatch(/^1\d{20}$/)
		expect(subOf('lea@example.test')).not.toBe(subOf('zoe@example.test'))
	})

	test('deux connexions en même temps ne se mélangent pas : chacune rend l’identité de son test', async () => {
		const urls = ['a', 'b', 'c', 'd', 'e'].map(nom => `${nom}@example.test`)

		const results = await Promise.all(urls.map(email => google.allerRetour(google.choisir({ email }))))

		expect(results.map(resultat => resultat.issue === 'connecte' && resultat.revendications.email)).toEqual(urls)
	})

	test('Google ne dit que ce qu’on lui demande : sans la portée email, aucune adresse', async () => {
		const code = await getCode({ scope: 'openid profile' })
		const tokens = (await (await exchange({ code })).json()) as { id_token: string; scope: string }

		expect(tokens.scope).toBe('openid profile')
		expect(loadOf(tokens.id_token)).not.toHaveProperty('email')
		expect(loadOf(tokens.id_token)).toHaveProperty('name')
	})

	test('une photo n’est rendue que si le test en donne une', async () => {
		const without = await google.allerRetour()
		const withValue = await google.allerRetour(google.choisir({ photo: 'https://photos.example.test/camille.png' }))

		if (without.issue !== 'connecte' || withValue.issue !== 'connecte') throw new Error('connexion attendue')
		expect(without.profil.picture).toBeUndefined()
		expect(withValue.profil.picture).toBe('https://photos.example.test/camille.png')
	})
})

describe('Le faux Google refuse ce que Google refuse', () => {
	test('un client inconnu : une page d’erreur du fournisseur, aucun retour vers le site', async () => {
		const response = await provider.repondre(new Request(request({ client_id: 'client-factice-inconnu' })))

		expect(response.status).toBe(401)
		expect(response.headers.has('location')).toBe(false)
		expect(await response.text()).toContain('Erreur 401 : invalid_client')
	})

	test.each([
		['le site en ligne', 'https://my-makeup.fr/api/retour'],
		['un hôte distant', 'https://exemple.test/retour'],
		['un hôte qui commence comme un hôte local', 'http://localhost.exemple.test/retour'],
		['une adresse privée', 'http://192.168.1.20:3100/retour'],
		['autre chose qu’une adresse web', 'javascript:alert(1)'],
		['une adresse avec un fragment', 'http://localhost:3100/retour#fragment'],
		['aucune adresse', undefined],
	])('il ne renvoie un navigateur que vers ce poste : %s', async (_cas, adresse) => {
		const response = await provider.repondre(new Request(request({ redirect_uri: adresse })))

		expect(response.status).toBe(400)
		expect(response.headers.has('location')).toBe(false)
		const text = await response.text()
		expect(text).toContain('Erreur 400 : redirect_uri_mismatch')
		// Nothing of the request is echoed in the page.
		if (adresse) expect(text).not.toContain(adresse)
	})

	test.each([
		['un autre type de réponse que « code »', { response_type: 'token' }, 'unsupported_response_type'],
		['une portée sans openid', { scope: 'email profile' }, 'invalid_scope'],
		['une méthode de défi inconnue', { code_challenge: 'defi', code_challenge_method: 'S512' }, 'invalid_request'],
	])('une demande mal formée revient au site avec son erreur et son état : %s', async (_cas, surcharge, erreur) => {
		const returnUrl = await google.autoriser(request(surcharge))

		expect(returnUrl.searchParams.get('error')).toBe(erreur)
		expect(returnUrl.searchParams.get('state')).toBe('etat-du-test')
		expect(returnUrl.searchParams.has('code')).toBe(false)
	})

	test('un secret faux, ou pas de secret : invalid_client, et le code reste bon pour le vrai client', async () => {
		const code = await getCode()

		expect(await errorOf(await exchange({ code, client_secret: 'secret-factice-mais-faux' }))).toEqual({
			status: 401,
			error: 'invalid_client',
		})
		expect(await errorOf(await exchange({ code, client_secret: undefined }))).toEqual({
			status: 401,
			error: 'invalid_client',
		})
		expect((await exchange({ code })).status).toBe(200)
	})

	test('le client peut se présenter dans l’en-tête Authorization', async () => {
		const basic = (secret: string) => ({ Authorization: `Basic ${btoa(`${CLIENT}:${secret}`)}` })
		const withoutBody = { client_id: undefined, client_secret: undefined }

		expect((await exchange({ code: await getCode(), ...withoutBody }, basic(SECRET))).status).toBe(200)
		expect((await exchange({ code: await getCode(), ...withoutBody }, basic('secret-factice-mais-faux'))).status).toBe(
			401
		)
		expect((await exchange({ code: await getCode(), ...withoutBody }, { Authorization: 'Basic %%%' })).status).toBe(401)
	})

	test('un code ne s’échange qu’une fois', async () => {
		const code = await getCode()

		expect((await exchange({ code })).status).toBe(200)
		expect(await errorOf(await exchange({ code }))).toEqual({ status: 400, error: 'invalid_grant' })
		expect(await errorOf(await exchange({ code: 'code-jamais-donne' }))).toEqual({
			status: 400,
			error: 'invalid_grant',
		})
		expect(await errorOf(await exchange({}))).toEqual({ status: 400, error: 'invalid_grant' })
	})

	test('un code expire au bout d’une minute', async () => {
		const [exact, late] = [await getCode(), await getCode()]
		try {
			advanced = 59_000
			expect((await exchange({ code: exact })).status).toBe(200)
			advanced = 61_000
			expect(await errorOf(await exchange({ code: late }))).toEqual({ status: 400, error: 'invalid_grant' })
		} finally {
			advanced = 0
		}
	})

	test('l’échange doit redonner la même adresse de retour que la demande', async () => {
		const response = await exchange({ code: await getCode(), redirect_uri: 'http://localhost:3100/autre-retour' })

		expect(await errorOf(response)).toEqual({ status: 400, error: 'redirect_uri_mismatch' })
	})

	test('avec un défi PKCE, l’échange exige la preuve qui lui correspond', async () => {
		const proof = 'preuve-du-test-preuve-du-test-preuve-du-test-0123'
		const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof))).toString(
			'base64url'
		)
		const pkce = { code_challenge: challenge, code_challenge_method: 'S256' }

		expect((await exchange({ code: await getCode(pkce), code_verifier: proof })).status).toBe(200)
		expect(await errorOf(await exchange({ code: await getCode(pkce), code_verifier: 'une-autre-preuve' }))).toEqual({
			status: 400,
			error: 'invalid_grant',
		})
		expect(await errorOf(await exchange({ code: await getCode(pkce) }))).toEqual({
			status: 400,
			error: 'invalid_grant',
		})
	})

	test('un autre type d’échange que le code d’autorisation est refusé', async () => {
		const response = await exchange({ code: await getCode(), grant_type: 'refresh_token' })

		expect(await errorOf(response)).toEqual({ status: 400, error: 'unsupported_grant_type' })
	})

	test('le profil ne se lit qu’avec un jeton d’accès que le fournisseur a donné', async () => {
		const profile = (enTetes: Record<string, string>) =>
			provider.repondre(new Request(`${ISSUER}${PATHS.profil}`, { headers: enTetes }))

		const withoutToken: Record<string, string>[] = [
			{},
			{ Authorization: 'Bearer jeton-jamais-donne' },
			{ Authorization: 'Basic abc' },
		]
		for (const headerList of withoutToken) {
			const response = await profile(headerList)
			expect(response.status).toBe(401)
			expect(response.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
		}
	})

	test('un jeton d’identité retouché ne passe pas la vérification de l’outil : la signature est réelle', async () => {
		// The answer of the token endpoint, with one claim changed after the provider signed it.
		const touch = async (requete: Request): Promise<Response> => {
			const response = await provider.repondre(requete)
			if (new URL(requete.url).pathname !== PATHS.jeton) return response
			const tokens = (await response.json()) as { id_token: string }
			const [header = '', charge = '', signature = ''] = tokens.id_token.split('.')
			const fake = Buffer.from(JSON.stringify({ ...loadOf(`.${charge}.`), email: 'une-autre@example.test' })).toString(
				'base64url'
			)
			return Response.json({ ...tokens, id_token: `${header}.${fake}.${signature}` })
		}

		const wrong = fakeGoogle(BENCH, { requeter: touch })

		await expect(wrong.allerRetour()).rejects.toThrow('Jeton d’identité : signature fausse.')
	})

	test('une adresse inconnue répond 404, une méthode inattendue 405, sans rien d’autre', async () => {
		const call = (chemin: string, methode: string) =>
			provider.repondre(new Request(`${ISSUER}${chemin}`, { method: methode }))

		expect((await call('/oauth2/v4/token', 'POST')).status).toBe(404)
		expect((await call(PATHS.jeton, 'GET')).status).toBe(405)
		expect((await call(PATHS.autorisation, 'POST')).status).toBe(405)
		expect((await call(PATHS.cles, 'DELETE')).status).toBe(405)
	})

	test('rien de ce qu’il répond ne se garde en cache', async () => {
		const responses = await Promise.all([
			provider.repondre(new Request(`${ISSUER}${PATHS.decouverte}`)),
			provider.repondre(new Request(`${ISSUER}${PATHS.cles}`)),
			provider.repondre(new Request(request())),
			exchange({ code: await getCode() }),
		])

		for (const response of responses) expect(response.headers.get('cache-control')).toBe('no-store')
	})
})

describe('Un test choisit l’identité renvoyée', () => {
	test('le choix voyage dans un cookie du fournisseur : un en-tête pour un client HTTP, un cookie pour un navigateur', () => {
		const ready = google.choisir({ scenario: 'email-non-verifie', email: 'lea@example.test', sub: 'compte-42' })

		expect(ready.choix).toEqual({
			scenario: 'email-non-verifie',
			identite: {
				sub: 'compte-42',
				email: 'lea@example.test',
				nom: 'Camille Banc-de-Test',
				prenom: 'Camille',
				nomDeFamille: 'Banc-de-Test',
			},
		})
		expect(ready.enTetes).toEqual({ Cookie: `${CHOICE_COOKIE}=${encodeChoice(ready.choix)}` })
		expect(ready.cookies).toEqual([
			{
				name: CHOICE_COOKIE,
				value: encodeChoice(ready.choix),
				url: ISSUER,
				expires: expect.any(Number),
				httpOnly: true,
				secure: false,
				sameSite: 'Lax',
			},
		])
		expect(decodeChoice(ready.cookies[0]?.value ?? '')).toEqual(ready.choix)
	})

	test.each([
		['une adresse sous un vrai domaine', { email: 'quelquun@gmail.com' }],
		['une adresse sous le domaine du site', { email: 'contact@my-makeup.fr' }],
		['un domaine qui finit presque en .test', { email: 'lea@example.contest' }],
		['une adresse sans domaine', { email: 'adresse-sans-domaine' }],
		['une photo servie par un vrai domaine', { photo: 'https://lh3.googleusercontent.com/a/photo' }],
		['un nom vide', { nom: ' ' }],
		['un identifiant avec un espace', { sub: 'compte 42' }],
	])('une identité qui n’est pas fictive est refusée, sans que sa valeur soit recopiée : %s', (_cas, identite) => {
		let message = ''
		try {
			google.choisir(identite)
		} catch (error) {
			if (!(error instanceof RefusedChoice)) throw error
			message = error.message
		}

		expect(message).toStartWith('Identité refusée')
		for (const value of Object.values(identite)) if (value.trim() !== '') expect(message).not.toContain(value)
	})

	test('un scénario inconnu est refusé, et les quatre sont nommés', () => {
		expect(() => composeChoice({ scenario: 'succes' as never })).toThrow(
			'Scénario inconnu. Les quatre scénarios : email-verifie, email-non-verifie, refus, panne.'
		)
	})

	test('le fournisseur refait le contrôle : un cookie retouché donne une page d’erreur, jamais une identité', async () => {
		const trueUrl = Buffer.from(
			JSON.stringify({ ...composeChoice(), identite: { ...composeChoice().identite, email: 'quelquun@gmail.com' } })
		).toString('base64url')

		for (const value of [trueUrl, 'pas-un-choix', Buffer.from('{"scenario":"refus"}').toString('base64url')]) {
			const response = await provider.repondre(
				new Request(request(), { headers: { Cookie: `autre=1; ${CHOICE_COOKIE}=${value}` } })
			)
			const text = await response.text()

			expect(response.status).toBe(400)
			expect(response.headers.has('location')).toBe(false)
			expect(text).toContain('Erreur 400 : choix_refuse')
			expect(text).not.toContain('gmail.com')
		}
	})
})

describe('Aucun secret Google réel, aucun appel à Google', () => {
	const refusal = (essai: () => unknown): string => {
		try {
			essai()
		} catch (error) {
			if (error instanceof RefusedBench) return error.message
			throw error
		}
		throw new Error('rien n’a été refusé')
	}

	/** Records what would be sent: nothing may be. */
	const spy = () => {
		const uploads: string[] = []
		const query = (requete: Request) => {
			uploads.push(requete.url)
			return Promise.resolve(new Response(null, { status: 599 }))
		}
		return { envois: uploads, requeter: query }
	}

	test('le client et le secret du banc disent qu’ils sont factices', () => {
		expect(CLIENT).toContain('factice')
		expect(SECRET).toContain('factice')
	})

	test.each([
		['un identifiant client sans le mot « factice »', { clientId: 'client-du-banc', secret: SECRET }],
		['un secret sans le mot « factice »', { clientId: CLIENT, secret: 'secret-du-banc-de-test' }],
	])('le fournisseur refuse de démarrer avec %s', async (_cas, identifiants) => {
		await expect(createFakeGoogle({ emetteur: ISSUER, ...identifiants })).rejects.toThrow(
			'doivent porter le mot « factice ». Jamais un vrai secret Google ici.'
		)
	})

	test.each([
		'https://accounts.google.com',
		'https://127.0.0.1:7080',
		'http://192.168.1.20:7080',
		'http://fake-google.exemple.test',
		'http://127.0.0.1:7080/',
		'pas une adresse',
	])('le fournisseur ne se présente que sous une adresse http de ce poste : %s', async emetteur => {
		await expect(createFakeGoogle({ emetteur, clientId: CLIENT, secret: SECRET })).rejects.toThrow(
			'son adresse doit être une adresse http de ce poste'
		)
	})

	test('sans faux Google réglé, l’outil s’arrête et dit quoi lancer', () => {
		expect(refusal(() => fakeGoogle({}))).toBe(
			'Aucun faux Google n’est réglé (GOOGLE_OIDC_ISSUER manque). Démarre le banc par « bun run bench:up », puis lance les tests par « bun run test:integration ».'
		)
	})

	test.each([
		['Google lui-même', 'https://accounts.google.com'],
		['un fournisseur distant', 'https://connexion.exemple.test'],
		['une adresse privée', 'http://192.168.1.20:7080'],
		['une adresse locale avec un chemin', 'http://127.0.0.1:7080/oidc'],
	])('l’outil refuse un fournisseur qui n’est pas sur ce poste, et n’envoie rien : %s', (_cas, emetteur) => {
		const { envois: uploads, requeter: query } = spy()

		expect(refusal(() => fakeGoogle({ ...BENCH, GOOGLE_OIDC_ISSUER: emetteur }, { requeter: query }))).toContain(
			'ne désigne pas le faux Google du banc, sur ce poste : rien n’est envoyé.'
		)
		expect(uploads).toEqual([])
	})

	test.each([
		['GOOGLE_CLIENT_ID', 'client-du-banc'],
		['GOOGLE_CLIENT_SECRET', 'un-secret-qui-ne-dit-rien'],
		['GOOGLE_CLIENT_SECRET', ''],
	])('l’outil refuse des identifiants qui pourraient être réels, sans les recopier : %s', (nom, valeur) => {
		const message = refusal(() => fakeGoogle({ ...BENCH, [nom]: valeur }))

		expect(message).toContain('jamais un vrai secret Google dans un test')
		if (valeur) expect(message).not.toContain(valeur)
	})

	test('l’outil ne joue le navigateur que devant le faux Google : une adresse de Google n’est jamais appelée', async () => {
		const { envois: uploads, requeter: query } = spy()
		const tool = fakeGoogle(BENCH, { requeter: query })
		const toGoogle = `https://accounts.google.com/o/oauth2/v2/auth${request().search}`

		await expect(tool.autoriser(toGoogle)).rejects.toThrow(RefusedBench)
		await expect(tool.autoriser(request().href.replace('127.0.0.1', 'localhost'))).rejects.toThrow(
			'Cette adresse n’est pas celle du faux Google du banc : rien n’est envoyé.'
		)
		expect(uploads).toEqual([])
	})
})

describe('Le serveur que lance le conteneur du banc', () => {
	const SERVER = 'tests/support/fake-google/server.ts'
	const identifiers = { GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: SECRET }

	/** Starts the entry point of the container on a free port of this machine, with these variables only. */
	function launch(variables: Record<string, string>) {
		return Bun.spawn([process.execPath, '--no-env-file', SERVER], {
			cwd: ROOT,
			env: { ...variables, FAKE_GOOGLE_PORT: '0', PATH: process.env.PATH ?? '' },
			stdout: 'pipe',
			stderr: 'pipe',
		})
	}

	test('il démarre, annonce son adresse, et un aller-retour par HTTP y prend moins de 5 secondes', async () => {
		const child = launch(identifiers)
		try {
			const reader = child.stdout.getReader()
			const announcement = new TextDecoder().decode((await reader.read()).value)
			reader.releaseLock()
			const issuer = /^Faux Google prêt : (http:\/\/127\.0\.0\.1:\d+)\n$/.exec(announcement)?.[1]
			if (!issuer) throw new Error(`annonce inattendue : ${announcement}`)

			const result = await fakeGoogle({ ...BENCH, GOOGLE_OIDC_ISSUER: issuer }).allerRetour()

			if (result.issue !== 'connecte') throw new Error(`issue inattendue : ${result.issue}`)
			expect(result.revendications.iss).toBe(issuer)
			expect(result.dureeMs).toBeLessThan(5000)
		} finally {
			child.kill()
			await child.exited
		}
	})

	test.each([
		['sans secret', { GOOGLE_CLIENT_ID: CLIENT }, 'Faux Google : GOOGLE_CLIENT_SECRET manque.'],
		[
			'avec un secret qui ne dit pas qu’il est factice',
			{ GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'secret-temoin-du-test' },
			'Faux Google : l’identifiant client et son secret doivent porter le mot « factice ».',
		],
		[
			'sous l’adresse de Google',
			{ ...identifiers, GOOGLE_OIDC_ISSUER: 'https://accounts.google.com' },
			'Faux Google : son adresse doit être une adresse http de ce poste',
		],
	])('il refuse de démarrer %s, et ne recopie aucune valeur', async (_cas, variables, message) => {
		const child = launch(variables)
		const [code, output, errors] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		])

		expect(errors).toContain(message)
		expect(output).toBe('')
		expect(errors).not.toContain('secret-temoin-du-test')
		expect(code).toBe(2)
	})
})
