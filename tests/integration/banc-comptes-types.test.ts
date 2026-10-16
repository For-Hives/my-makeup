import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { AuthenticationError, UnverifiedEmail } from 'payload'
import { z } from 'zod'
import { adresseDuJeu, COMPTES_DU_JEU, poserLesComptesDuJeu, TYPES_DU_JEU } from '../fixtures/comptes'
import {
	type CompteFixe,
	creerCompte,
	type FournisseurHerite,
	MOT_DE_PASSE_HERITE_DE_FIXTURE,
	TYPES_DE_COMPTE,
	type TypeDeCompte,
} from '../outils/fabrique-comptes'
import { compterLesLignes, payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { HASH_BCRYPT_COMPLET } from '../outils/source-strapi/inventaire'

// The bench is shared by every checkout of the machine, and a suite under load runs several times slower than alone:
// the default 5 s is passed by the heaviest tests of this file (ticket 225). The delay bounds a call that hangs, it
// is not a duration the test promises. A test that times out leaves its queries running into the next file.
setDefaultTimeout(30_000)

/**
 * Every type of account of the site, made by the factory, and the fixed set of the bench that
 * holds one of each (ticket 050). Written from what each type must be, not from the declarations
 * of the factory: a type added to the factory without its line in `ATTENDU` does not compile.
 */

/** How the account gets its session: by its password, without one (as by Google), or never. */
type Acces = 'mot-de-passe' | 'sans-mot-de-passe' | 'aucun'

interface Attendu {
	collection: 'admins' | 'pros'
	acces: Acces
	/** For a makeup artist: what the database holds besides her address and her password. */
	pro?: {
		verifie: boolean
		bloque: boolean
		fournisseur: FournisseurHerite | null
		hashHerite: boolean
		profils: 0 | 1
	}
}

const maquilleuse = (pro: Partial<NonNullable<Attendu['pro']>> = {}): NonNullable<Attendu['pro']> => ({
	verifie: true,
	bloque: false,
	fournisseur: null,
	hashHerite: false,
	profils: 1,
	...pro,
})

const ATTENDU: Record<TypeDeCompte, Attendu> = {
	admin: { collection: 'admins', acces: 'mot-de-passe' },
	redaction: { collection: 'admins', acces: 'mot-de-passe' },
	maquilleuse: { collection: 'pros', acces: 'mot-de-passe', pro: maquilleuse() },
	'maquilleuse-non-verifiee': { collection: 'pros', acces: 'aucun', pro: maquilleuse({ verifie: false }) },
	'maquilleuse-sans-profil': { collection: 'pros', acces: 'mot-de-passe', pro: maquilleuse({ profils: 0 }) },
	'maquilleuse-bloquee': { collection: 'pros', acces: 'aucun', pro: maquilleuse({ bloque: true }) },
	'reprise-avec-hash': {
		collection: 'pros',
		acces: 'aucun',
		pro: maquilleuse({ fournisseur: 'local', hashHerite: true }),
	},
	'reprise-google': { collection: 'pros', acces: 'sans-mot-de-passe', pro: maquilleuse({ fournisseur: 'google' }) },
	'reprise-google-avec-hash': {
		collection: 'pros',
		acces: 'sans-mot-de-passe',
		pro: maquilleuse({ fournisseur: 'google', hashHerite: true }),
	},
	'reprise-facebook': { collection: 'pros', acces: 'aucun', pro: maquilleuse({ fournisseur: 'facebook' }) },
}

const TYPES = Object.keys(TYPES_DE_COMPTE) as TypeDeCompte[]

const MonCompte = z.object({ user: z.object({ id: z.number(), email: z.string() }).nullable() })

/** The row of an account as the database holds it, the fields no API lets out included. */
interface Ligne {
	id: number
	email: string
	nom?: string | null
	hash?: string | null
	salt?: string | null
	sessions?: { id: string }[] | null
	_verified?: boolean | null
	bloque?: boolean | null
	legacyProvider?: string | null
	legacyBcrypt?: string | null
	strapiId?: number | null
}

async function ligneDu(compte: CompteFixe): Promise<Ligne> {
	const payload = await payloadDeTest()
	const ligne = await payload.db.findOne<Ligne>({ collection: compte.collection, where: { id: { equals: compte.id } } })
	if (!ligne) throw new Error(`le compte ${compte.type} n’est pas en base`)
	return ligne
}

/** What a makeup artist holds, read in the database, in the shape of `Attendu['pro']`. */
async function etatDeLaMaquilleuse(compte: CompteFixe) {
	const payload = await payloadDeTest()
	const ligne = await ligneDu(compte)
	const { totalDocs } = await payload.count({ collection: 'profils', where: { pro: { equals: compte.id } } })
	return {
		verifie: ligne._verified === true,
		bloque: ligne.bloque === true,
		fournisseur: (ligne.legacyProvider ?? null) as FournisseurHerite | null,
		hashHerite: typeof ligne.legacyBcrypt === 'string',
		profils: totalDocs,
	}
}

/** The error Payload's own login throws for this address and password, or `null` when it lets the account in. */
async function refusDeConnexion(compte: CompteFixe, motDePasse: string): Promise<unknown> {
	const payload = await payloadDeTest()
	try {
		await payload.login({ collection: compte.collection, data: { email: compte.email, password: motDePasse } })
		return null
	} catch (erreur) {
		return erreur
	}
}

beforeAll(async () => {
	// Payload starts before the clock of the first test does.
	await payloadDeTest()
})

afterEach(viderLaBase)

describe('La fabrique crée chaque type de compte du site', () => {
	test('toutes les variantes créées puis vidées en moins de 5 secondes', async () => {
		const debut = performance.now()

		const comptes = await Promise.all(TYPES.map(type => creerCompte(type)))
		await viderLaBase()

		expect(performance.now() - debut).toBeLessThan(5_000)
		expect(comptes.map(({ type }) => type)).toEqual(TYPES)
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(0)
	})

	test.each(
		TYPES
	)('« %s » : sa session ouvre son compte, ou il n’en a pas et aucun mot de passe connu ne l’ouvre', async type => {
		const attendu = ATTENDU[type]
		// The password this test knows: the factory gives it to every account that logs in by password.
		const connu = `connu-${crypto.randomUUID()}`

		const compte = await creerCompte(type, { motDePasse: () => connu })
		const ligne = await ligneDu(compte)

		expect(compte.collection).toBe(attendu.collection)
		expect(compte.email).toMatch(new RegExp(`^${type}-[0-9a-f-]{36}@example\\.test$`))
		if (attendu.acces === 'aucun') {
			expect(compte.session).toBeNull()
			expect(ligne.sessions ?? []).toEqual([])
		} else {
			// A real session: the route « mon compte » of the application answers with this account.
			const { statut, corps } = await appelerRest('GET', `/api/${attendu.collection}/me`, {
				enTetes: compte.session?.enTetes ?? {},
			})
			expect({ statut, user: MonCompte.parse(corps).user }).toEqual({
				statut: 200,
				user: { id: Number(compte.id), email: compte.email },
			})
			expect(ligne.sessions?.length).toBe(1)
		}
		// Every account has a password in Payload: the import gives one too, drawn at random.
		expect(typeof ligne.hash === 'string' && typeof ligne.salt === 'string').toBe(true)

		if (attendu.pro) expect(await etatDeLaMaquilleuse(compte)).toEqual(attendu.pro)
		if (attendu.pro?.fournisseur) {
			// No password anybody knows opens it through Payload: neither the one this test chose,
			// nor the one of the old site, which only the site's legacy path reads (ticket 087).
			expect(await refusDeConnexion(compte, connu)).toBeInstanceOf(AuthenticationError)
			expect(await refusDeConnexion(compte, MOT_DE_PASSE_HERITE_DE_FIXTURE)).toBeInstanceOf(AuthenticationError)
			expect(ligne.strapiId).toBeGreaterThanOrEqual(1_000_000)
		} else expect(ligne.strapiId ?? null).toBeNull()
		if (type === 'maquilleuse-non-verifiee')
			// The right password, an address not confirmed: Payload says so, and opens nothing.
			expect(await refusDeConnexion(compte, connu)).toBeInstanceOf(UnverifiedEmail)
	})

	test('le hash hérité vient du mot de passe fictif de fixture ; pgcrypto ne reste pas dans la base', async () => {
		const [locale, google, sansHash] = await Promise.all([
			creerCompte('reprise-avec-hash'),
			creerCompte('reprise-google-avec-hash'),
			creerCompte('reprise-google'),
		])
		const [hashLocal, hashGoogle] = [(await ligneDu(locale)).legacyBcrypt, (await ligneDu(google)).legacyBcrypt]

		for (const hash of [hashLocal, hashGoogle]) {
			expect(HASH_BCRYPT_COMPLET.test(hash ?? '')).toBe(true)
			// The format of every hash of the old site.
			expect(hash?.startsWith('$2a$10$')).toBe(true)
			expect(await Bun.password.verify(MOT_DE_PASSE_HERITE_DE_FIXTURE, hash ?? '')).toBe(true)
			expect(await Bun.password.verify(`${MOT_DE_PASSE_HERITE_DE_FIXTURE}-faux`, hash ?? '')).toBe(false)
		}
		// The same fixture hash, every time: a fixed salt and a fixed password.
		expect(hashGoogle).toBe(hashLocal)
		expect((await ligneDu(sansHash)).legacyBcrypt ?? null).toBeNull()
		// The hash was worked out in a transaction that was rolled back: nothing of pgcrypto is left.
		const payload = await payloadDeTest()
		const { rows } = await payload.db.pool.query<{ extensions: number; schemas: number }>(
			`SELECT (SELECT count(*)::int FROM pg_extension WHERE extname = 'pgcrypto') AS extensions,
			        (SELECT count(*)::int FROM pg_namespace WHERE nspname = 'fabrique_bcrypt') AS schemas`
		)
		expect(rows[0]).toEqual({ extensions: 0, schemas: 0 })
	})
})

describe('Le jeu du banc : un compte fixe de chaque type', () => {
	test('un exemplaire de chaque type, en @example.test, à l’état de son type', async () => {
		const bilan = await poserLesComptesDuJeu()

		expect(bilan.crees).toEqual(TYPES)
		expect(bilan.presents).toEqual([])
		expect(TYPES_DU_JEU).toEqual(TYPES)
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(2)
		expect((await payload.count({ collection: 'pros' })).totalDocs).toBe(TYPES.length - 2)
		for (const compte of bilan.comptes) {
			const attendu = ATTENDU[compte.type]
			expect({ type: compte.type, collection: compte.collection, email: compte.email }).toEqual({
				type: compte.type,
				collection: attendu.collection,
				email: adresseDuJeu(compte.type),
			})
			expect(compte.email).toEndWith('@example.test')
			const ligne = await ligneDu(compte)
			// No session: the set only places the accounts.
			expect(ligne.sessions ?? []).toEqual([])
			if (!attendu.pro) continue
			expect({ type: compte.type, etat: await etatDeLaMaquilleuse(compte) }).toEqual({
				type: compte.type,
				etat: attendu.pro,
			})
			const { nom, strapiId } = COMPTES_DU_JEU[compte.type]
			expect({ nom: ligne.nom, strapiId: ligne.strapiId ?? undefined }).toEqual({ nom, strapiId })
		}
	})

	test('rejouer le jeu ne crée aucun doublon et ne touche à rien ; sur une base vide, il redonne les mêmes comptes', async () => {
		const premier = await poserLesComptesDuJeu()
		const lignes = await compterLesLignes()
		const hashes = await Promise.all(premier.comptes.map(async compte => (await ligneDu(compte)).legacyBcrypt ?? null))

		const second = await poserLesComptesDuJeu()

		expect(second.crees).toEqual([])
		expect(second.presents).toEqual(TYPES)
		expect(second.comptes).toEqual(premier.comptes)
		expect(await compterLesLignes()).toEqual(lignes)

		await viderLaBase()
		const apresRemiseAZero = await poserLesComptesDuJeu()

		expect(apresRemiseAZero.crees).toEqual(TYPES)
		expect(apresRemiseAZero.comptes).toEqual(premier.comptes)
		expect(
			await Promise.all(apresRemiseAZero.comptes.map(async compte => (await ligneDu(compte)).legacyBcrypt ?? null))
		).toEqual(hashes)
	})
})
