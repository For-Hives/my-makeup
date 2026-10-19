import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { fermerLaSession } from '@/lib/auth/deconnexion'
import { creerFrein, type Frein } from '@/lib/auth/frein'
import { type IssueDeGoogle, terminerLaConnexionGoogle } from '@/lib/auth/google/connexion-google'
import {
	type ConfigGoogle,
	type DemandeEnCours,
	decouvrir,
	oublierLesDocuments,
	preparerLeDepart,
	type Requeter,
	sceller,
} from '@/lib/auth/google/oidc'
import { journalDe } from '@/lib/auth/journal'
import { creerCompte } from '../outils/fabrique-comptes'
import { type Demande, fauxGoogle } from '../outils/faux-google'
import { compterLesMails, viderLeCapteur } from '../outils/mailpit'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The Google sign-in and sign-up (tickets 090 and 091; plan 02 E07), against the fake Google of
 * the bench: the real discovery, the real exchange of the code, a real signed ID token. The route
 * itself, the cookie in a browser and the pages are played by tests/e2e/connexion-google.spec.ts.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? ''
const SECRET = process.env.PAYLOAD_SECRET ?? ''
const google = fauxGoogle()
const config: ConfigGoogle = {
	emetteur: google.emetteur,
	clientId: google.clientId,
	clientSecret: google.secret,
	redirectUri: `${SITE}/auth/google/callback`,
}

beforeAll(() => oublierLesDocuments())
beforeEach(() => viderLeCapteur())
afterAll(async () => {
	await viderLaBase()
})

interface Passage {
	issue: IssueDeGoogle
	/** The address Google sent the browser back to: it carries the code. */
	retour: URL
}

/** One trip to the fake Google, from the departure to the end of the return. */
async function passer(
	demande: Demande,
	{
		retourSouhaite = '/auth/profil',
		modifier,
		client,
		frein,
		requeter,
	}: {
		retourSouhaite?: string
		client?: string
		frein?: Frein
		requeter?: Requeter
		modifier?: (parametres: URLSearchParams, depart: { cookie: string }) => string | undefined
	} = {}
): Promise<Passage> {
	const payload = await payloadDeTest()
	const depart = preparerLeDepart(config, await decouvrir(config.emetteur), { retour: retourSouhaite, secret: SECRET })
	const retour = await google.autoriser(depart.adresse, google.choisir(demande))
	const parametres = new URLSearchParams(retour.searchParams)
	const cookie = modifier ? modifier(parametres, depart) : depart.cookie
	const issue = await terminerLaConnexionGoogle({
		payload,
		config,
		secret: SECRET,
		retour: { code: parametres.get('code'), state: parametres.get('state'), error: parametres.get('error') },
		cookie,
		journal: journalDe(payload),
		client,
		frein,
		requeter,
	})
	return { issue, retour }
}

const adresse = (prefixe: string) => `${prefixe}-${crypto.randomUUID().slice(0, 8)}@example.test`

async function comptes(email: string) {
	const payload = await payloadDeTest()
	return (await payload.find({ collection: 'pros', depth: 0, limit: 10, where: { email: { equals: email } } })).docs
}

async function lignesDuJournal() {
	const payload = await payloadDeTest()
	return (await payload.find({ collection: 'auth-events', depth: 0, limit: 1000, sort: 'id' })).docs
}

/** Who Payload says is behind this token, the way a page of the space asks. */
async function qui(token: string) {
	const payload = await payloadDeTest()
	return (await payload.auth({ headers: new Headers({ Cookie: `payload-token=${token}`, Origin: SITE }) })).user
}

describe('E07 : un compte venu de Google se retrouve par son email vérifié', () => {
	test('l’ancien compte Google est retrouvé : même compte, même profil, aucun doublon, aucun mail', async () => {
		const compte = await creerCompte('reprise-google')
		const payload = await payloadDeTest()
		const avant = await payload.count({ collection: 'pros' })
		const profilsAvant = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })

		const { issue } = await passer({ email: compte.email })

		if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
		expect(issue.nouveau).toBe(false)
		expect(issue.destination).toBe('/auth/profil')
		expect((await qui(issue.token))?.id).toBe(Number(compte.id))
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(avant.totalDocs)
		const profils = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
		expect(profils.docs.map(p => p.id)).toEqual(profilsAvant.docs.map(p => p.id))
		expect(await comptes(compte.email)).toHaveLength(1)
		expect(await compterLesMails()).toBe(0)
	})

	test('l’email est comparé sans tenir compte de la casse', async () => {
		const compte = await creerCompte('reprise-google')
		const { issue } = await passer({ email: compte.email.toUpperCase() })
		expect(issue.ok).toBe(true)
		expect(await comptes(compte.email)).toHaveLength(1)
	})

	test('un ancien compte Google qui a aussi un hash se connecte par Google', async () => {
		const compte = await creerCompte('reprise-google-avec-hash')
		const { issue } = await passer({ email: compte.email })
		expect(issue.ok).toBe(true)
	})

	test('la session est celle du mot de passe : elle se ferme par la déconnexion, le jeton rejoué est refusé', async () => {
		const compte = await creerCompte('reprise-google')
		const { issue } = await passer({ email: compte.email })
		if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
		const payload = await payloadDeTest()
		const entetes = new Headers({ Cookie: `payload-token=${issue.token}`, Origin: SITE })
		expect((await qui(issue.token))?.id).toBe(Number(compte.id))
		const ligne = await payload.db.findOne<{ id: number; sessions?: unknown[]; lastSignInAt?: string }>({
			collection: 'pros',
			where: { id: { equals: compte.id } },
		})
		expect(ligne?.sessions?.length).toBeGreaterThan(0)
		expect(ligne?.lastSignInAt).toBeDefined()

		expect(await fermerLaSession({ payload, headers: entetes, toutes: false })).toEqual({ ok: true, fermee: true })

		expect(await qui(issue.token)).toBeNull()
	})

	test('l’événement « connexion » porte la méthode google, sans rien d’autre', async () => {
		const compte = await creerCompte('reprise-google')
		const avant = (await lignesDuJournal()).length

		await passer({ email: compte.email })

		const nouvelles = (await lignesDuJournal()).slice(avant)
		expect(nouvelles.map(({ type, code, method }) => ({ type, code, method }))).toEqual([
			{ type: 'sign-in', code: 'ok', method: 'google' },
		])
		expect(Object.keys(nouvelles[0] ?? {}).sort()).toEqual(['code', 'date', 'durationMs', 'id', 'method', 'type'])
	})
})

describe('tout ce qui vient de Google est vérifié avant d’être cru', () => {
	test('un retour dont le state n’est pas celui du cookie est refusé, sans compte', async () => {
		const email = adresse('forge')
		const { issue } = await passer(
			{ email },
			{
				modifier: parametres => {
					parametres.set('state', 'forge')
					return sceller(demandeAuHasard(), SECRET)
				},
			}
		)
		expect(issue).toEqual({ ok: false, code: 'google-echec' })
		expect(await comptes(email)).toHaveLength(0)
	})

	test('un state changé dans l’adresse, avec le bon cookie, est refusé', async () => {
		const email = adresse('state-change')
		const { issue } = await passer(
			{ email },
			{
				modifier: (parametres, depart) => {
					parametres.set('state', 'un-autre-state')
					return depart.cookie
				},
			}
		)
		expect(issue).toEqual({ ok: false, code: 'google-echec' })
		expect(await comptes(email)).toHaveLength(0)
	})

	test('un retour sans le cookie, ou avec un cookie qui n’est pas signé par nous, est refusé', async () => {
		const email = adresse('sans-cookie')
		for (const cookie of [
			undefined,
			'',
			'abc',
			sceller(demandeAuHasard(), 'une-autre-cle-qui-fait-plus-de-32-caracteres'),
		]) {
			const { issue } = await passer({ email }, { modifier: () => cookie })
			expect(issue).toEqual({ ok: false, code: 'google-echec' })
		}
		expect(await comptes(email)).toHaveLength(0)
	})

	test('un cookie dont le délai est passé est refusé', async () => {
		const email = adresse('expire')
		const { issue } = await passer(
			{ email },
			{
				modifier: (_parametres, depart) => {
					const demande = JSON.parse(Buffer.from(depart.cookie.split('.')[0] ?? '', 'base64url').toString('utf8'))
					return sceller({ ...demande, expire: 1 }, SECRET)
				},
			}
		)
		expect(issue.ok).toBe(false)
		expect(await comptes(email)).toHaveLength(0)
	})

	test('un code que Google ne connaît pas est refusé, sans exception', async () => {
		const email = adresse('faux-code')
		const { issue } = await passer(
			{ email },
			{
				modifier: (parametres, depart) => {
					parametres.set('code', 'code-forge')
					return depart.cookie
				},
			}
		)
		expect(issue).toEqual({ ok: false, code: 'google-echec' })
		expect(await comptes(email)).toHaveLength(0)
	})

	test('un retour sans code est refusé', async () => {
		const { issue } = await passer(
			{ email: adresse('sans-code') },
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
		const email = adresse('nouvelle')

		const { issue } = await passer(
			{ email, prenom: 'Léa', nomDeFamille: 'Fictive' },
			{ retourSouhaite: '/auth/profil' }
		)

		if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
		expect(issue.nouveau).toBe(true)
		expect(issue.destination).toBe('/auth/init-account')
		const [pro] = await comptes(email)
		expect(pro).toMatchObject({ name: 'Léa Fictive', _verified: true, legacyProvider: 'google' })
		const payload = await payloadDeTest()
		const profils = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: pro?.id } } })
		expect(profils.totalDocs).toBe(1)
		expect(profils.docs[0]?.slug).toMatch(/^lea-fictive(-\d+)?$/)
		expect((await qui(issue.token))?.id).toBe(pro?.id)
		expect(await compterLesMails()).toBe(0)
		const lignes = (await lignesDuJournal())
			.filter(l => l.method === 'google')
			.map(({ type, code }) => `${type}:${code}`)
		expect(lignes).toContain('sign-up:ok')
		expect(lignes).toContain('sign-in:ok')
	})

	test('second passage : une connexion, aucun doublon, ni compte ni profil, et vers la page demandée', async () => {
		const email = adresse('second')
		const premier = await passer({ email })
		const payload = await payloadDeTest()
		const [pro] = await comptes(email)

		const second = await passer({ email }, { retourSouhaite: '/auth/profil' })

		expect(premier.issue.ok && premier.issue.nouveau).toBe(true)
		if (!second.issue.ok) throw new Error(`refusé : ${second.issue.code}`)
		expect(second.issue.nouveau).toBe(false)
		expect(second.issue.destination).toBe('/auth/profil')
		expect(await comptes(email)).toHaveLength(1)
		expect((await qui(second.issue.token))?.id).toBe(pro?.id)
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: pro?.id } } })).totalDocs
		).toBe(1)
		expect(await compterLesMails()).toBe(0)
	})

	test('deux premiers passages au même moment : un seul compte, un seul profil, deux sessions valables', async () => {
		const email = adresse('course')
		// Three at once: the first creates, the others find the account and open their own session.
		// Flaky before ticket 235: the sessions of an account were read and written back whole, so two
		// sign-ins of the same account at the same moment collided or erased each other.
		const passages = await Promise.all([passer({ email }), passer({ email }), passer({ email })])
		const jetons = passages.map(({ issue }) => {
			if (!issue.ok) throw new Error(`refusé : ${issue.code}`)
			return issue.token
		})
		const [pro] = await comptes(email)
		expect(await comptes(email)).toHaveLength(1)
		expect(passages.filter(({ issue }) => issue.ok && issue.nouveau)).toHaveLength(1)
		const payload = await payloadDeTest()
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: pro?.id } } })).totalDocs
		).toBe(1)
		// Every token opens the account: none of the sessions was lost.
		expect((await Promise.all(jetons.map(qui))).map(user => user?.id)).toEqual(jetons.map(() => pro?.id))
	})

	test('email non vérifié par Google : refus, aucun compte, ni pour une adresse libre ni pour un compte qui existe', async () => {
		const libre = adresse('non-verifie')
		const existant = await creerCompte('reprise-google')
		const payload = await payloadDeTest()
		const avant = (await payload.count({ collection: 'pros' })).totalDocs

		const a = await passer({ scenario: 'email-non-verifie', email: libre })
		const b = await passer({ scenario: 'email-non-verifie', email: existant.email })

		expect(a.issue).toEqual({ ok: false, code: 'google-email-non-verifie' })
		expect(b.issue).toEqual({ ok: false, code: 'google-email-non-verifie' })
		expect(await comptes(libre)).toHaveLength(0)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(avant)
		expect(await compterLesMails()).toBe(0)
	})
})

describe('un compte qui ne vient pas de Google n’est jamais ouvert ni lié', () => {
	test.each([
		['un compte à mot de passe', 'maquilleuse'],
		['un ancien compte Facebook', 'reprise-facebook'],
		['un ancien compte à mot de passe', 'reprise-avec-hash'],
	] as const)('%s : refus, aucune session, le compte est laissé tel quel', async (_nom, type) => {
		const compte = await creerCompte(type)
		const payload = await payloadDeTest()
		const avant = await payload.db.findOne<{ id: number; legacyProvider?: string; sessions?: unknown[] }>({
			collection: 'pros',
			where: { id: { equals: compte.id } },
		})

		const { issue } = await passer({ email: compte.email })

		expect(issue).toEqual({ ok: false, code: 'email-deja-avec-mot-de-passe' })
		const apres = await payload.db.findOne<{ id: number; legacyProvider?: string; sessions?: unknown[] }>({
			collection: 'pros',
			where: { id: { equals: compte.id } },
		})
		expect(apres?.legacyProvider).toBe(avant?.legacyProvider)
		expect(apres?.sessions).toEqual(avant?.sessions)
		expect(await comptes(compte.email)).toHaveLength(1)
	})

	test('un compte Google bloqué est refusé, avec son propre code', async () => {
		const compte = await creerCompte('reprise-google')
		const payload = await payloadDeTest()
		await payload.update({ collection: 'pros', id: compte.id, data: { blocked: true }, overrideAccess: true })

		const { issue } = await passer({ email: compte.email })

		expect(issue).toEqual({ ok: false, code: 'compte-bloque' })
		expect(await comptes(compte.email)).toHaveLength(1)
	})

	test('un compte à mot de passe bloqué est dit bloqué, et rien n’est lié', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		await payload.update({ collection: 'pros', id: compte.id, data: { blocked: true }, overrideAccess: true })

		const { issue } = await passer({ email: compte.email })

		expect(issue).toEqual({ ok: false, code: 'compte-bloque' })
		const apres = await payload.db.findOne<{ id: number; legacyProvider?: string }>({
			collection: 'pros',
			where: { id: { equals: compte.id } },
		})
		expect(apres?.legacyProvider).not.toBe('google')
	})
})

describe('l’annulation et la panne de Google ne cassent rien', () => {
	test('refus : retour à la connexion avec un code, aucun compte', async () => {
		const email = adresse('refus')
		const { issue, retour } = await passer({ scenario: 'refus', email })
		expect(retour.searchParams.get('error')).toBe('access_denied')
		expect(issue).toEqual({ ok: false, code: 'google-annule' })
		expect(await comptes(email)).toHaveLength(0)
	})

	test('panne à l’échange du code : retour à la connexion avec un code, sans exception', async () => {
		const email = adresse('panne')
		const { issue } = await passer({ scenario: 'panne', email })
		expect(issue).toEqual({ ok: false, code: 'google-indisponible' })
		expect(await comptes(email)).toHaveLength(0)
	})

	test('chaque refus laisse sa ligne au journal, avec la méthode google', async () => {
		const avant = (await lignesDuJournal()).length
		await passer({ scenario: 'refus', email: adresse('j1') })
		await passer({ scenario: 'panne', email: adresse('j2') })
		await passer({ scenario: 'email-non-verifie', email: adresse('j3') })
		const lignes = (await lignesDuJournal()).slice(avant)
		expect(lignes.map(({ type, code, method }) => `${type}:${code}:${method}`)).toEqual([
			'sign-in:annule:google',
			'sign-in:service-indisponible:google',
			'sign-in:email-non-verifie:google',
		])
	})
})

describe('rien de ce que Google envoie n’est écrit', () => {
	const sorties: unknown[][] = []
	const espions = [] as ReturnType<typeof spyOn>[]
	beforeEach(() => {
		sorties.length = 0
		for (const niveau of ['log', 'info', 'warn', 'error', 'debug'] as const)
			espions.push(spyOn(console, niveau).mockImplementation((...args: unknown[]) => void sorties.push(args)))
	})
	afterEach(() => {
		for (const espion of espions.splice(0)) espion.mockRestore()
	})

	test('ni le code, ni le state, ni le jeton, ni l’adresse ne sont dans les journaux, la console ou les résultats', async () => {
		const email = adresse('discret')
		const reussi = await passer({ email })
		const refuse = await passer({ scenario: 'panne', email: adresse('discret-panne') })

		const secrets = [reussi.retour, refuse.retour].flatMap(url =>
			['code', 'state'].map(nom => url.searchParams.get(nom) ?? '')
		)
		expect(secrets.every(secret => secret.length > 10)).toBe(true)
		const surface = JSON.stringify([
			sorties,
			(await lignesDuJournal()).map(({ type, code, method, durationMs }) => ({ type, code, method, durationMs })),
			{ ...refuse.issue },
			{ ...reussi.issue, token: undefined },
		])
		for (const secret of secrets) expect(surface).not.toContain(secret)
		expect(surface).not.toContain(email)
		expect(surface).not.toMatch(/id_token|access_token/)
		expect(surface).not.toContain(google.secret)
	})
})

function demandeAuHasard(): DemandeEnCours {
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
	const avecErreur = (erreur: string) => ({
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
		const avant = (await lignesDuJournal()).length
		const email = adresse('erreur-google')

		const { issue } = await passer({ email }, avecErreur(erreur))

		expect(issue).toEqual({ ok: false, code: codeUrl })
		expect(await comptes(email)).toHaveLength(0)
		const lignes = (await lignesDuJournal()).slice(avant)
		expect(lignes.map(({ type, code, method }) => `${type}:${code}:${method}`)).toEqual([
			`sign-in:${codeJournal}:google`,
		])
		// What Google said is not written anywhere.
		expect(JSON.stringify(lignes)).not.toContain(erreur)
	})

	test('la découverte en panne au retour : google-indisponible, une ligne service-indisponible, aucun compte', async () => {
		const avant = (await lignesDuJournal()).length
		const email = adresse('decouverte-retour')
		const payload = await payloadDeTest()
		const depart = preparerLeDepart(config, await decouvrir(config.emetteur), {
			retour: '/auth/profil',
			secret: SECRET,
		})
		const retour = await google.autoriser(depart.adresse, google.choisir({ email }))
		oublierLesDocuments()

		const issue = await terminerLaConnexionGoogle({
			payload,
			config,
			secret: SECRET,
			retour: {
				code: retour.searchParams.get('code'),
				state: retour.searchParams.get('state'),
				error: null,
			},
			cookie: depart.cookie,
			journal: journalDe(payload),
			requeter: async () => {
				throw new Error('réseau coupé')
			},
		})

		expect(issue).toEqual({ ok: false, code: 'google-indisponible' })
		expect(await comptes(email)).toHaveLength(0)
		expect((await lignesDuJournal()).slice(avant).map(({ code }) => code)).toEqual(['service-indisponible'])
	})

	test('le départ, la découverte en panne : retour à la connexion avec google-indisponible, sans cookie ni exception', async () => {
		const { GET } = await import('@/app/(front)/(espace)/auth/google/route')
		const avant = process.env.GOOGLE_OIDC_ISSUER
		// A local port where nothing listens: the discovery document cannot be read.
		process.env.GOOGLE_OIDC_ISSUER = 'http://127.0.0.1:9'
		oublierLesDocuments()
		try {
			const reponse = await GET(new Request(`${SITE}/auth/google?callbackUrl=%2Fauth%2Fprofil`))
			expect(reponse.status).toBe(307)
			expect(reponse.headers.get('location')).toBe(`${SITE}/auth/signin?error=google-indisponible`)
			expect(reponse.headers.get('set-cookie')).toBeNull()
		} finally {
			if (avant === undefined) delete process.env.GOOGLE_OIDC_ISSUER
			else process.env.GOOGLE_OIDC_ISSUER = avant
			oublierLesDocuments()
		}
	})
})

describe('ticket 223, constat 3 : le retour est freiné par adresse et ses lignes de refus sont bornées', () => {
	/** A return with a state that is not ours, from this address: the flood of a script. */
	const retourInvalide = (client: string, frein: Frein) =>
		passer(
			{ email: adresse('flood') },
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
		const frein = creerFrein({ nom: `retour-essai-${crypto.randomUUID()}`, limite: 5, fenetreMs: 60_000 })
		const client = `192.0.2.${100 + Math.floor(Math.random() * 100)}`
		const avant = (await lignesDuJournal()).length

		const codes: string[] = []
		for (let i = 0; i < 12; i++) {
			const { issue } = await retourInvalide(client, frein)
			codes.push(issue.ok ? 'ok' : issue.code)
		}

		expect(codes).toEqual([...Array(5).fill('google-echec'), ...Array(7).fill('trop-de-tentatives')])
		const lignes = (await lignesDuJournal()).slice(avant)
		const parCode = (code: string) => lignes.filter(ligne => ligne.code === code).length
		// 3 an hour per address and outcome, like the refusals of the sign-up (ticket 084).
		expect(parCode('retour-invalide')).toBe(3)
		expect(parCode('trop-de-tentatives')).toBe(3)
		expect(lignes).toHaveLength(6)
		// The address is a key in memory: it is written nowhere.
		expect(JSON.stringify(lignes)).not.toContain(client)
	})

	test('une autre adresse n’est pas freinée, et un retour qui ouvre une session rend sa place', async () => {
		const frein = creerFrein({ nom: `retour-essai-${crypto.randomUUID()}`, limite: 2, fenetreMs: 60_000 })
		const client = `192.0.2.${100 + Math.floor(Math.random() * 100)}`
		const autre = `198.51.100.${1 + Math.floor(Math.random() * 200)}`

		expect((await retourInvalide(client, frein)).issue).toEqual({ ok: false, code: 'google-echec' })
		// A success on the same address: the place it takes is given back.
		expect((await passer({ email: adresse('succes') }, { client, frein })).issue.ok).toBe(true)
		expect((await retourInvalide(client, frein)).issue).toEqual({ ok: false, code: 'google-echec' })
		expect((await retourInvalide(client, frein)).issue).toEqual({ ok: false, code: 'trop-de-tentatives' })
		expect((await retourInvalide(autre, frein)).issue).toEqual({ ok: false, code: 'google-echec' })
	})
})
