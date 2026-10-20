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
const BANC = benchEnvironment({ nom: INSTANCE_BY_DEFAULT, decalage: 0 })
const EMETTEUR = BANC.GOOGLE_OIDC_ISSUER ?? ''
const CLIENT = BANC.GOOGLE_CLIENT_ID ?? ''
const SECRET = BANC.GOOGLE_CLIENT_SECRET ?? ''
const RETOUR = 'http://localhost:3100/retour-du-faux-google'

/** Added to the clock of the provider: a test moves it forward to see a code expire. */
let avance = 0
let fournisseur: FakeGoogle
let google: ToolFakeGoogle

beforeAll(async () => {
	fournisseur = await createFakeGoogle({
		emetteur: EMETTEUR,
		clientId: CLIENT,
		secret: SECRET,
		maintenant: () => Date.now() + avance,
	})
	google = fakeGoogle(BANC, { requeter: fournisseur.repondre })
})

/** An authorization request as the application would write it, one parameter replaced or removed at will. */
function demande(surcharge: Record<string, string | undefined> = {}): URL {
	const url = new URL(`${EMETTEUR}${PATHS.autorisation}`)
	const parametres: Record<string, string | undefined> = {
		client_id: CLIENT,
		redirect_uri: RETOUR,
		response_type: 'code',
		scope: 'openid email profile',
		state: 'etat-du-test',
		...surcharge,
	}
	for (const [nom, valeur] of Object.entries(parametres)) if (valeur !== undefined) url.searchParams.set(nom, valeur)
	return url
}

/** The code Google sends the browser back with. */
async function obtenirCode(surcharge: Record<string, string | undefined> = {}, choix?: ChoiceReady): Promise<string> {
	const code = (await google.autoriser(demande(surcharge), choix)).searchParams.get('code')
	if (!code) throw new Error('aucun code dans le retour')
	return code
}

/** The exchange of a code, as the application sends it: one field replaced or removed at will. */
function echanger(champs: Record<string, string | undefined>, enTetes: Record<string, string> = {}): Promise<Response> {
	const formulaire = new URLSearchParams()
	const complets: Record<string, string | undefined> = {
		grant_type: 'authorization_code',
		redirect_uri: RETOUR,
		client_id: CLIENT,
		client_secret: SECRET,
		...champs,
	}
	for (const [nom, valeur] of Object.entries(complets)) if (valeur !== undefined) formulaire.set(nom, valeur)
	return fournisseur.repondre(
		new Request(`${EMETTEUR}${PATHS.jeton}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...enTetes },
			body: formulaire.toString(),
		})
	)
}

const erreurDe = async (reponse: Response): Promise<{ status: number; error: unknown }> => ({
	status: reponse.status,
	error: ((await reponse.json()) as { error?: unknown }).error,
})

const chargeDe = (jeton: string): Record<string, unknown> =>
	JSON.parse(Buffer.from(jeton.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>

describe('Le faux Google : un aller-retour complet, comme avec Google', () => {
	test('il se présente comme Google : mêmes chemins, même document de découverte, sous son adresse locale', async () => {
		const reponse = await fournisseur.repondre(new Request(`${EMETTEUR}${PATHS.decouverte}`))

		expect(reponse.status).toBe(200)
		expect(await reponse.json()).toMatchObject({
			issuer: EMETTEUR,
			authorization_endpoint: `${EMETTEUR}/o/oauth2/v2/auth`,
			token_endpoint: `${EMETTEUR}/token`,
			userinfo_endpoint: `${EMETTEUR}/v1/userinfo`,
			jwks_uri: `${EMETTEUR}/oauth2/v3/certs`,
			id_token_signing_alg_values_supported: ['RS256'],
			code_challenge_methods_supported: ['plain', 'S256'],
		})
	})

	test('email vérifié : code, jetons, jeton d’identité signé, profil, le tout en moins de 5 secondes', async () => {
		const choix = google.choisir({ email: 'lea.martin@example.test', prenom: 'Léa', nomDeFamille: 'Martin' })

		const resultat = await google.allerRetour(choix)

		if (resultat.issue !== 'connecte') throw new Error(`issue inattendue : ${resultat.issue}`)
		expect(resultat.revendications).toMatchObject({
			iss: EMETTEUR,
			aud: CLIENT,
			azp: CLIENT,
			sub: subOf('lea.martin@example.test'),
			email: 'lea.martin@example.test',
			email_verified: true,
			name: 'Léa Martin',
			given_name: 'Léa',
			family_name: 'Martin',
		})
		expect(resultat.revendications.exp - resultat.revendications.iat).toBe(3600)
		expect(resultat.profil).toEqual({
			sub: subOf('lea.martin@example.test'),
			email: 'lea.martin@example.test',
			email_verified: true,
			name: 'Léa Martin',
			given_name: 'Léa',
			family_name: 'Martin',
		})
		// What Google adds to its own answer comes back too, and the state as it was sent.
		expect(resultat.retour.searchParams.get('authuser')).toBe('0')
		expect(resultat.dureeMs).toBeLessThan(5000)
	})

	test('email non vérifié : la connexion aboutit, et Google dit que l’adresse n’a jamais été confirmée', async () => {
		const resultat = await google.allerRetour(google.choisir({ scenario: 'email-non-verifie' }))

		if (resultat.issue !== 'connecte') throw new Error(`issue inattendue : ${resultat.issue}`)
		expect(resultat.revendications.email_verified).toBe(false)
		expect(resultat.profil.email_verified).toBe(false)
		expect(resultat.revendications.email).toBe('camille.google@example.test')
	})

	test('refus : le navigateur revient avec access_denied et l’état, sans aucun code', async () => {
		const resultat = await google.allerRetour(google.choisir({ scenario: 'refus' }))

		expect(resultat.issue).toBe('refus')
		expect(resultat.retour.searchParams.get('error')).toBe('access_denied')
		expect(resultat.retour.searchParams.has('code')).toBe(false)
		expect(resultat.retour.searchParams.get('state')).toBeTruthy()
	})

	test('panne : le code revient, puis son échange répond 503 avec une page, pas du JSON, à chaque essai', async () => {
		const resultat = await google.allerRetour(google.choisir({ scenario: 'panne' }))
		expect(resultat).toMatchObject({ issue: 'panne', statut: 503 })

		const code = await obtenirCode({}, google.choisir({ scenario: 'panne' }))
		for (const _essai of [1, 2]) {
			const reponse = await echanger({ code })
			expect(reponse.status).toBe(503)
			expect(reponse.headers.get('content-type')).toStartWith('text/html')
			expect(await reponse.text()).toContain('503 Service Unavailable')
		}
		// Even a client the provider does not know sees the outage, not a refusal.
		expect((await echanger({ code, client_secret: 'secret-factice-mais-faux' })).status).toBe(503)
	})

	test('les quatre scénarios existent, et aucun autre', () => {
		expect([...SCENARIOS]).toEqual(['email-verifie', 'email-non-verifie', 'refus', 'panne'])
		for (const scenario of SCENARIOS) expect(google.choisir({ scenario }).choix.scenario).toBe(scenario)
	})

	test('sans choix, une personne fictive à l’adresse vérifiée se connecte : toujours la même', async () => {
		const sansCookie = await fournisseur.repondre(new Request(demande()))
		const code = new URL(sansCookie.headers.get('location') ?? '').searchParams.get('code') ?? ''
		const jetons = (await (await echanger({ code })).json()) as { id_token: string }

		expect(chargeDe(jetons.id_token)).toMatchObject({
			sub: subOf('camille.google@example.test'),
			email: 'camille.google@example.test',
			email_verified: true,
			name: 'Camille Banc-de-Test',
		})
		expect(google.choisir().choix).toEqual(composeChoice())
	})

	test('second passage : la même adresse est le même compte Google, quelle que soit sa casse', async () => {
		const premier = await google.allerRetour(google.choisir({ email: 'zoe@example.test' }))
		const second = await google.allerRetour(google.choisir({ email: 'Zoe@Example.TEST' }))

		if (premier.issue !== 'connecte' || second.issue !== 'connecte') throw new Error('connexion attendue')
		expect(second.revendications.sub).toBe(premier.revendications.sub)
		expect(second.revendications.email).toBe('Zoe@Example.TEST')
		expect(subOf('zoe@example.test')).toMatch(/^1\d{20}$/)
		expect(subOf('lea@example.test')).not.toBe(subOf('zoe@example.test'))
	})

	test('deux connexions en même temps ne se mélangent pas : chacune rend l’identité de son test', async () => {
		const adresses = ['a', 'b', 'c', 'd', 'e'].map(nom => `${nom}@example.test`)

		const resultats = await Promise.all(adresses.map(email => google.allerRetour(google.choisir({ email }))))

		expect(resultats.map(resultat => resultat.issue === 'connecte' && resultat.revendications.email)).toEqual(adresses)
	})

	test('Google ne dit que ce qu’on lui demande : sans la portée email, aucune adresse', async () => {
		const code = await obtenirCode({ scope: 'openid profile' })
		const jetons = (await (await echanger({ code })).json()) as { id_token: string; scope: string }

		expect(jetons.scope).toBe('openid profile')
		expect(chargeDe(jetons.id_token)).not.toHaveProperty('email')
		expect(chargeDe(jetons.id_token)).toHaveProperty('name')
	})

	test('une photo n’est rendue que si le test en donne une', async () => {
		const sans = await google.allerRetour()
		const avec = await google.allerRetour(google.choisir({ photo: 'https://photos.example.test/camille.png' }))

		if (sans.issue !== 'connecte' || avec.issue !== 'connecte') throw new Error('connexion attendue')
		expect(sans.profil.picture).toBeUndefined()
		expect(avec.profil.picture).toBe('https://photos.example.test/camille.png')
	})
})

describe('Le faux Google refuse ce que Google refuse', () => {
	test('un client inconnu : une page d’erreur du fournisseur, aucun retour vers le site', async () => {
		const reponse = await fournisseur.repondre(new Request(demande({ client_id: 'client-factice-inconnu' })))

		expect(reponse.status).toBe(401)
		expect(reponse.headers.has('location')).toBe(false)
		expect(await reponse.text()).toContain('Erreur 401 : invalid_client')
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
		const reponse = await fournisseur.repondre(new Request(demande({ redirect_uri: adresse })))

		expect(reponse.status).toBe(400)
		expect(reponse.headers.has('location')).toBe(false)
		const texte = await reponse.text()
		expect(texte).toContain('Erreur 400 : redirect_uri_mismatch')
		// Nothing of the request is echoed in the page.
		if (adresse) expect(texte).not.toContain(adresse)
	})

	test.each([
		['un autre type de réponse que « code »', { response_type: 'token' }, 'unsupported_response_type'],
		['une portée sans openid', { scope: 'email profile' }, 'invalid_scope'],
		['une méthode de défi inconnue', { code_challenge: 'defi', code_challenge_method: 'S512' }, 'invalid_request'],
	])('une demande mal formée revient au site avec son erreur et son état : %s', async (_cas, surcharge, erreur) => {
		const retour = await google.autoriser(demande(surcharge))

		expect(retour.searchParams.get('error')).toBe(erreur)
		expect(retour.searchParams.get('state')).toBe('etat-du-test')
		expect(retour.searchParams.has('code')).toBe(false)
	})

	test('un secret faux, ou pas de secret : invalid_client, et le code reste bon pour le vrai client', async () => {
		const code = await obtenirCode()

		expect(await erreurDe(await echanger({ code, client_secret: 'secret-factice-mais-faux' }))).toEqual({
			status: 401,
			error: 'invalid_client',
		})
		expect(await erreurDe(await echanger({ code, client_secret: undefined }))).toEqual({
			status: 401,
			error: 'invalid_client',
		})
		expect((await echanger({ code })).status).toBe(200)
	})

	test('le client peut se présenter dans l’en-tête Authorization', async () => {
		const basique = (secret: string) => ({ Authorization: `Basic ${btoa(`${CLIENT}:${secret}`)}` })
		const sansCorps = { client_id: undefined, client_secret: undefined }

		expect((await echanger({ code: await obtenirCode(), ...sansCorps }, basique(SECRET))).status).toBe(200)
		expect(
			(await echanger({ code: await obtenirCode(), ...sansCorps }, basique('secret-factice-mais-faux'))).status
		).toBe(401)
		expect((await echanger({ code: await obtenirCode(), ...sansCorps }, { Authorization: 'Basic %%%' })).status).toBe(
			401
		)
	})

	test('un code ne s’échange qu’une fois', async () => {
		const code = await obtenirCode()

		expect((await echanger({ code })).status).toBe(200)
		expect(await erreurDe(await echanger({ code }))).toEqual({ status: 400, error: 'invalid_grant' })
		expect(await erreurDe(await echanger({ code: 'code-jamais-donne' }))).toEqual({
			status: 400,
			error: 'invalid_grant',
		})
		expect(await erreurDe(await echanger({}))).toEqual({ status: 400, error: 'invalid_grant' })
	})

	test('un code expire au bout d’une minute', async () => {
		const [juste, tard] = [await obtenirCode(), await obtenirCode()]
		try {
			avance = 59_000
			expect((await echanger({ code: juste })).status).toBe(200)
			avance = 61_000
			expect(await erreurDe(await echanger({ code: tard }))).toEqual({ status: 400, error: 'invalid_grant' })
		} finally {
			avance = 0
		}
	})

	test('l’échange doit redonner la même adresse de retour que la demande', async () => {
		const reponse = await echanger({ code: await obtenirCode(), redirect_uri: 'http://localhost:3100/autre-retour' })

		expect(await erreurDe(reponse)).toEqual({ status: 400, error: 'redirect_uri_mismatch' })
	})

	test('avec un défi PKCE, l’échange exige la preuve qui lui correspond', async () => {
		const preuve = 'preuve-du-test-preuve-du-test-preuve-du-test-0123'
		const defi = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(preuve))).toString(
			'base64url'
		)
		const pkce = { code_challenge: defi, code_challenge_method: 'S256' }

		expect((await echanger({ code: await obtenirCode(pkce), code_verifier: preuve })).status).toBe(200)
		expect(
			await erreurDe(await echanger({ code: await obtenirCode(pkce), code_verifier: 'une-autre-preuve' }))
		).toEqual({
			status: 400,
			error: 'invalid_grant',
		})
		expect(await erreurDe(await echanger({ code: await obtenirCode(pkce) }))).toEqual({
			status: 400,
			error: 'invalid_grant',
		})
	})

	test('un autre type d’échange que le code d’autorisation est refusé', async () => {
		const reponse = await echanger({ code: await obtenirCode(), grant_type: 'refresh_token' })

		expect(await erreurDe(reponse)).toEqual({ status: 400, error: 'unsupported_grant_type' })
	})

	test('le profil ne se lit qu’avec un jeton d’accès que le fournisseur a donné', async () => {
		const profil = (enTetes: Record<string, string>) =>
			fournisseur.repondre(new Request(`${EMETTEUR}${PATHS.profil}`, { headers: enTetes }))

		const sansJeton: Record<string, string>[] = [
			{},
			{ Authorization: 'Bearer jeton-jamais-donne' },
			{ Authorization: 'Basic abc' },
		]
		for (const enTetes of sansJeton) {
			const reponse = await profil(enTetes)
			expect(reponse.status).toBe(401)
			expect(reponse.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
		}
	})

	test('un jeton d’identité retouché ne passe pas la vérification de l’outil : la signature est réelle', async () => {
		// The answer of the token endpoint, with one claim changed after the provider signed it.
		const retoucher = async (requete: Request): Promise<Response> => {
			const reponse = await fournisseur.repondre(requete)
			if (new URL(requete.url).pathname !== PATHS.jeton) return reponse
			const jetons = (await reponse.json()) as { id_token: string }
			const [entete = '', charge = '', signature = ''] = jetons.id_token.split('.')
			const fausse = Buffer.from(
				JSON.stringify({ ...chargeDe(`.${charge}.`), email: 'une-autre@example.test' })
			).toString('base64url')
			return Response.json({ ...jetons, id_token: `${entete}.${fausse}.${signature}` })
		}

		const trompe = fakeGoogle(BANC, { requeter: retoucher })

		await expect(trompe.allerRetour()).rejects.toThrow('Jeton d’identité : signature fausse.')
	})

	test('une adresse inconnue répond 404, une méthode inattendue 405, sans rien d’autre', async () => {
		const appeler = (chemin: string, methode: string) =>
			fournisseur.repondre(new Request(`${EMETTEUR}${chemin}`, { method: methode }))

		expect((await appeler('/oauth2/v4/token', 'POST')).status).toBe(404)
		expect((await appeler(PATHS.jeton, 'GET')).status).toBe(405)
		expect((await appeler(PATHS.autorisation, 'POST')).status).toBe(405)
		expect((await appeler(PATHS.cles, 'DELETE')).status).toBe(405)
	})

	test('rien de ce qu’il répond ne se garde en cache', async () => {
		const reponses = await Promise.all([
			fournisseur.repondre(new Request(`${EMETTEUR}${PATHS.decouverte}`)),
			fournisseur.repondre(new Request(`${EMETTEUR}${PATHS.cles}`)),
			fournisseur.repondre(new Request(demande())),
			echanger({ code: await obtenirCode() }),
		])

		for (const reponse of reponses) expect(reponse.headers.get('cache-control')).toBe('no-store')
	})
})

describe('Un test choisit l’identité renvoyée', () => {
	test('le choix voyage dans un cookie du fournisseur : un en-tête pour un client HTTP, un cookie pour un navigateur', () => {
		const pret = google.choisir({ scenario: 'email-non-verifie', email: 'lea@example.test', sub: 'compte-42' })

		expect(pret.choix).toEqual({
			scenario: 'email-non-verifie',
			identite: {
				sub: 'compte-42',
				email: 'lea@example.test',
				nom: 'Camille Banc-de-Test',
				prenom: 'Camille',
				nomDeFamille: 'Banc-de-Test',
			},
		})
		expect(pret.enTetes).toEqual({ Cookie: `${CHOICE_COOKIE}=${encodeChoice(pret.choix)}` })
		expect(pret.cookies).toEqual([
			{
				name: CHOICE_COOKIE,
				value: encodeChoice(pret.choix),
				url: EMETTEUR,
				expires: expect.any(Number),
				httpOnly: true,
				secure: false,
				sameSite: 'Lax',
			},
		])
		expect(decodeChoice(pret.cookies[0]?.value ?? '')).toEqual(pret.choix)
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
		} catch (erreur) {
			if (!(erreur instanceof RefusedChoice)) throw erreur
			message = erreur.message
		}

		expect(message).toStartWith('Identité refusée')
		for (const valeur of Object.values(identite)) if (valeur.trim() !== '') expect(message).not.toContain(valeur)
	})

	test('un scénario inconnu est refusé, et les quatre sont nommés', () => {
		expect(() => composeChoice({ scenario: 'succes' as never })).toThrow(
			'Scénario inconnu. Les quatre scénarios : email-verifie, email-non-verifie, refus, panne.'
		)
	})

	test('le fournisseur refait le contrôle : un cookie retouché donne une page d’erreur, jamais une identité', async () => {
		const vraieAdresse = Buffer.from(
			JSON.stringify({ ...composeChoice(), identite: { ...composeChoice().identite, email: 'quelquun@gmail.com' } })
		).toString('base64url')

		for (const valeur of [vraieAdresse, 'pas-un-choix', Buffer.from('{"scenario":"refus"}').toString('base64url')]) {
			const reponse = await fournisseur.repondre(
				new Request(demande(), { headers: { Cookie: `autre=1; ${CHOICE_COOKIE}=${valeur}` } })
			)
			const texte = await reponse.text()

			expect(reponse.status).toBe(400)
			expect(reponse.headers.has('location')).toBe(false)
			expect(texte).toContain('Erreur 400 : choix_refuse')
			expect(texte).not.toContain('gmail.com')
		}
	})
})

describe('Aucun secret Google réel, aucun appel à Google', () => {
	const refus = (essai: () => unknown): string => {
		try {
			essai()
		} catch (erreur) {
			if (erreur instanceof RefusedBench) return erreur.message
			throw erreur
		}
		throw new Error('rien n’a été refusé')
	}

	/** Records what would be sent: nothing may be. */
	const espion = () => {
		const envois: string[] = []
		const requeter = (requete: Request) => {
			envois.push(requete.url)
			return Promise.resolve(new Response(null, { status: 599 }))
		}
		return { envois, requeter }
	}

	test('le client et le secret du banc disent qu’ils sont factices', () => {
		expect(CLIENT).toContain('factice')
		expect(SECRET).toContain('factice')
	})

	test.each([
		['un identifiant client sans le mot « factice »', { clientId: 'client-du-banc', secret: SECRET }],
		['un secret sans le mot « factice »', { clientId: CLIENT, secret: 'secret-du-banc-de-test' }],
	])('le fournisseur refuse de démarrer avec %s', async (_cas, identifiants) => {
		await expect(createFakeGoogle({ emetteur: EMETTEUR, ...identifiants })).rejects.toThrow(
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
		expect(refus(() => fakeGoogle({}))).toBe(
			'Aucun faux Google n’est réglé (GOOGLE_OIDC_ISSUER manque). Démarre le banc par « bun run bench:up », puis lance les tests par « bun run test:integration ».'
		)
	})

	test.each([
		['Google lui-même', 'https://accounts.google.com'],
		['un fournisseur distant', 'https://connexion.exemple.test'],
		['une adresse privée', 'http://192.168.1.20:7080'],
		['une adresse locale avec un chemin', 'http://127.0.0.1:7080/oidc'],
	])('l’outil refuse un fournisseur qui n’est pas sur ce poste, et n’envoie rien : %s', (_cas, emetteur) => {
		const { envois, requeter } = espion()

		expect(refus(() => fakeGoogle({ ...BANC, GOOGLE_OIDC_ISSUER: emetteur }, { requeter }))).toContain(
			'ne désigne pas le faux Google du banc, sur ce poste : rien n’est envoyé.'
		)
		expect(envois).toEqual([])
	})

	test.each([
		['GOOGLE_CLIENT_ID', 'client-du-banc'],
		['GOOGLE_CLIENT_SECRET', 'un-secret-qui-ne-dit-rien'],
		['GOOGLE_CLIENT_SECRET', ''],
	])('l’outil refuse des identifiants qui pourraient être réels, sans les recopier : %s', (nom, valeur) => {
		const message = refus(() => fakeGoogle({ ...BANC, [nom]: valeur }))

		expect(message).toContain('jamais un vrai secret Google dans un test')
		if (valeur) expect(message).not.toContain(valeur)
	})

	test('l’outil ne joue le navigateur que devant le faux Google : une adresse de Google n’est jamais appelée', async () => {
		const { envois, requeter } = espion()
		const outil = fakeGoogle(BANC, { requeter })
		const versGoogle = `https://accounts.google.com/o/oauth2/v2/auth${demande().search}`

		await expect(outil.autoriser(versGoogle)).rejects.toThrow(RefusedBench)
		await expect(outil.autoriser(demande().href.replace('127.0.0.1', 'localhost'))).rejects.toThrow(
			'Cette adresse n’est pas celle du faux Google du banc : rien n’est envoyé.'
		)
		expect(envois).toEqual([])
	})
})

describe('Le serveur que lance le conteneur du banc', () => {
	const SERVEUR = 'tests/support/fake-google/server.ts'
	const identifiants = { GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: SECRET }

	/** Starts the entry point of the container on a free port of this machine, with these variables only. */
	function lancer(variables: Record<string, string>) {
		return Bun.spawn([process.execPath, '--no-env-file', SERVEUR], {
			cwd: ROOT,
			env: { ...variables, FAKE_GOOGLE_PORT: '0', PATH: process.env.PATH ?? '' },
			stdout: 'pipe',
			stderr: 'pipe',
		})
	}

	test('il démarre, annonce son adresse, et un aller-retour par HTTP y prend moins de 5 secondes', async () => {
		const enfant = lancer(identifiants)
		try {
			const lecteur = enfant.stdout.getReader()
			const annonce = new TextDecoder().decode((await lecteur.read()).value)
			lecteur.releaseLock()
			const emetteur = /^Faux Google prêt : (http:\/\/127\.0\.0\.1:\d+)\n$/.exec(annonce)?.[1]
			if (!emetteur) throw new Error(`annonce inattendue : ${annonce}`)

			const resultat = await fakeGoogle({ ...BANC, GOOGLE_OIDC_ISSUER: emetteur }).allerRetour()

			if (resultat.issue !== 'connecte') throw new Error(`issue inattendue : ${resultat.issue}`)
			expect(resultat.revendications.iss).toBe(emetteur)
			expect(resultat.dureeMs).toBeLessThan(5000)
		} finally {
			enfant.kill()
			await enfant.exited
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
			{ ...identifiants, GOOGLE_OIDC_ISSUER: 'https://accounts.google.com' },
			'Faux Google : son adresse doit être une adresse http de ce poste',
		],
	])('il refuse de démarrer %s, et ne recopie aucune valeur', async (_cas, variables, message) => {
		const enfant = lancer(variables)
		const [code, sortie, erreurs] = await Promise.all([
			enfant.exited,
			new Response(enfant.stdout).text(),
			new Response(enfant.stderr).text(),
		])

		expect(erreurs).toContain(message)
		expect(sortie).toBe('')
		expect(erreurs).not.toContain('secret-temoin-du-test')
		expect(code).toBe(2)
	})
})
