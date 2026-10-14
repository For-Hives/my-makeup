import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { adresseDuJeu, COMPTES_DU_JEU, poserLesComptesDuJeu, TYPES_DU_JEU } from '../fixtures/comptes'
import { BancRefuse, environnementDuBanc, RACINE, type Variables } from '../outils/banc'
import {
	adresseDeTest,
	creerCompte,
	creerCompteFixe,
	type DeclarationDeCompte,
	MOT_DE_PASSE_HERITE_DE_FIXTURE,
	motDePasseAleatoire,
	SEL_BCRYPT_DE_FIXTURE,
	strapiIdDeTest,
	TYPES_DE_COMPTE,
} from '../outils/fabrique-comptes'
import { origineDuSite } from '../outils/session'
import { HASH_BCRYPT_COMPLET } from '../outils/source-strapi/inventaire'

/** The types of account the old site brings. */
const TYPES_REPRIS = ['reprise-avec-hash', 'reprise-google', 'reprise-google-avec-hash', 'reprise-facebook'] as const

const BANC = environnementDuBanc({ nom: 'my-makeup-test', decalage: 0 })
const BASE_DU_BANC = BANC.DATABASE_URI ?? ''
const BASE_DE_DEVELOPPEMENT = 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev'

/**
 * A Payload that only remembers what was asked of it, connected to the given database: no
 * connection is opened, and every call that would write is recorded.
 */
function fauxPayload(connexion: string) {
	const ecritures: string[] = []
	const noter = (operation: string) => () => {
		ecritures.push(operation)
		return Promise.reject(new Error(`${operation} ne devait pas être appelé`))
	}
	const payload = {
		config: { csrf: ['http://localhost:3100'], cookiePrefix: 'payload' },
		create: noter('create'),
		db: { poolOptions: { connectionString: connexion } },
		login: noter('login'),
	} as unknown as Payload
	return { ecritures, payload }
}

const refus = async (essai: () => Promise<unknown>): Promise<string> => {
	try {
		await essai()
	} catch (erreur) {
		if (erreur instanceof BancRefuse) return erreur.message
		throw erreur
	}
	throw new Error('rien n’a été refusé')
}

describe('Hors du banc, la fabrique s’arrête avant toute écriture', () => {
	test('sans base réglée, elle s’arrête avant même de charger Payload, et dit quoi lancer', async () => {
		let charge = false
		const charger = () => {
			charge = true
			return Promise.resolve(fauxPayload(BASE_DU_BANC).payload)
		}

		const message = await refus(() => creerCompte('admin', { payload: charger, variables: {} }))

		expect(message).toContain('Aucun banc de test n’est réglé (DATABASE_URI manque) : rien n’est écrit.')
		expect(message).toContain('« bun run test:integration »')
		expect(charge).toBe(false)
	})

	test.each([
		['la base de développement du poste', BASE_DE_DEVELOPPEMENT],
		[
			'une base distante, même nommée en _test',
			'postgres://banc:mot-de-passe-factice@db.example.test:5432/mymakeup_test',
		],
		['le banc d’une autre instance', BASE_DU_BANC.replace(':5443/', ':5463/')],
	])('quand l’environnement désigne %s, rien n’est écrit', async (_cas, base) => {
		const { ecritures, payload } = fauxPayload(base)
		const variables: Variables = { ...BANC, DATABASE_URI: base }

		const message = await refus(() => creerCompte('admin', { payload: () => Promise.resolve(payload), variables }))

		expect(message).toStartWith('DATABASE_URI ne désigne pas la base du banc de test : rien n’est écrit.')
		expect(message).not.toContain('postgres://')
		expect(ecritures).toEqual([])
	})

	test('quand Payload est branché ailleurs que l’environnement ne le dit, rien n’est écrit non plus', async () => {
		const { ecritures, payload } = fauxPayload(BASE_DE_DEVELOPPEMENT)

		const message = await refus(() =>
			creerCompte('admin', { payload: () => Promise.resolve(payload), variables: BANC })
		)

		expect(message).toBe('Payload n’est pas branché sur la base du banc de test : rien n’est écrit.')
		expect(ecritures).toEqual([])
	})

	test('sur le banc, la fabrique passe ces contrôles et commence par créer le compte', async () => {
		// The witness of the tests above: with the same fake Payload connected to the bench, the
		// factory goes on to its first write, which this fake one refuses.
		const { ecritures, payload } = fauxPayload(BASE_DU_BANC)

		await expect(creerCompte('admin', { payload: () => Promise.resolve(payload), variables: BANC })).rejects.toThrow(
			'create ne devait pas être appelé'
		)
		expect(ecritures).toEqual(['create'])
	})

	test('le jeu du banc et ses comptes fixes s’arrêtent de même hors du banc, avant de charger Payload', async () => {
		let charge = false
		const charger = () => {
			charge = true
			return Promise.resolve(fauxPayload(BASE_DU_BANC).payload)
		}

		const pourLeJeu = await refus(() => poserLesComptesDuJeu({ payload: charger, variables: {} }))
		const pourUnCompte = await refus(() =>
			creerCompteFixe('admin', { email: adresseDuJeu('admin') }, { payload: charger, variables: {} })
		)

		for (const message of [pourLeJeu, pourUnCompte])
			expect(message).toContain('Aucun banc de test n’est réglé (DATABASE_URI manque) : rien n’est écrit.')
		expect(charge).toBe(false)
	})

	test('sur le banc, une adresse qui n’est pas en @example.test est refusée avant toute écriture', async () => {
		const { ecritures, payload } = fauxPayload(BASE_DU_BANC)

		await expect(
			creerCompteFixe(
				'admin',
				{ email: 'admin@exemple.fr' },
				{ payload: () => Promise.resolve(payload), variables: BANC }
			)
		).rejects.toThrow('Un compte de test a une adresse en @example.test, et nulle part ailleurs.')
		expect(ecritures).toEqual([])
	})
})

describe('Le jeu du banc : un compte fixe de chaque type', () => {
	test('chaque type de la fabrique y a son compte, dans le même ordre', () => {
		expect(TYPES_DU_JEU).toEqual(Object.keys(TYPES_DE_COMPTE) as typeof TYPES_DU_JEU)
	})

	test('des adresses fixes en @example.test, une par type', () => {
		const adresses = TYPES_DU_JEU.map(adresseDuJeu)

		for (const adresse of adresses) expect(adresse).toMatch(/^jeu-[a-z-]+@example\.test$/)
		expect(new Set(adresses).size).toBe(TYPES_DU_JEU.length)
		expect(adresseDuJeu('reprise-google')).toBe('jeu-reprise-google@example.test')
	})

	test('les comptes repris, et eux seuls, ont un identifiant fixe de l’ancien site, sous ceux de la fabrique', () => {
		const repris = TYPES_DU_JEU.filter(
			type => TYPES_DE_COMPTE[type].collection === 'pros' && 'reprise' in TYPES_DE_COMPTE[type]
		)
		const identifiants = TYPES_DU_JEU.flatMap(type => {
			const { strapiId } = COMPTES_DU_JEU[type]
			return strapiId === undefined ? [] : [{ type, strapiId }]
		})

		expect(identifiants.map(({ type }) => type)).toEqual(repris)
		expect(repris).toEqual([...TYPES_REPRIS])
		for (const { strapiId } of identifiants) {
			expect(strapiId).toBeGreaterThanOrEqual(900_000)
			expect(strapiId).toBeLessThan(1_000_000)
		}
		expect(new Set(identifiants.map(({ strapiId }) => strapiId)).size).toBe(identifiants.length)
	})

	test('chaque maquilleuse du jeu a un nom fixe, différent des autres ; les comptes admin n’en ont pas', () => {
		const noms = TYPES_DU_JEU.map(type => ({ type, nom: COMPTES_DU_JEU[type].nom }))
		const maquilleuses = noms.filter(({ type }) => TYPES_DE_COMPTE[type].collection === 'pros')

		for (const { nom } of maquilleuses) expect(nom).toEndWith(' du jeu')
		expect(new Set(maquilleuses.map(({ nom }) => nom)).size).toBe(maquilleuses.length)
		expect(noms.filter(({ type }) => TYPES_DE_COMPTE[type].collection === 'admins')).toEqual([
			{ type: 'admin', nom: undefined },
			{ type: 'redaction', nom: undefined },
		])
	})
})

describe('Aucun hash réel dans le dépôt', () => {
	test('aucun fichier versionné ne contient un hash bcrypt complet : le hash de fixture se calcule sur le banc', async () => {
		const listage = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: RACINE })
		expect(listage.exitCode).toBe(0)
		const fichiers = listage.stdout.toString().split('\0').filter(Boolean)
		// Anywhere in a line, not only a whole value: the pattern of the inventory, without its anchors.
		const motif = new RegExp(HASH_BCRYPT_COMPLET.source.replace(/^\^/, '').replace(/\$$/, ''))
		const porteurs: string[] = []

		for (const fichier of fichiers) {
			const contenu = Bun.file(`${RACINE}/${fichier}`)
			// A file removed from the working tree but not from the index yet holds nothing.
			if (!(await contenu.exists())) continue
			const octets = new Uint8Array(await contenu.arrayBuffer())
			// A picture or a font is not text: it cannot hold a hash written by hand.
			if (octets.includes(0)) continue
			if (motif.test(new TextDecoder().decode(octets))) porteurs.push(fichier)
		}

		expect(fichiers.length).toBeGreaterThan(100)
		expect(porteurs).toEqual([])
	})
})

describe('Ce que la fabrique tire au sort', () => {
	test('chaque type de compte vit dans une collection de comptes', () => {
		expect(Object.keys(TYPES_DE_COMPTE)).toEqual([
			'admin',
			'redaction',
			'maquilleuse',
			'maquilleuse-non-verifiee',
			'maquilleuse-sans-profil',
			'maquilleuse-bloquee',
			'reprise-avec-hash',
			'reprise-google',
			'reprise-google-avec-hash',
			'reprise-facebook',
		])
		expect(TYPES_DE_COMPTE.admin.collection).toBe('admins')
		expect(TYPES_DE_COMPTE.redaction.collection).toBe('admins')
		expect(TYPES_DE_COMPTE.maquilleuse.collection).toBe('pros')
		expect(TYPES_DE_COMPTE['maquilleuse-non-verifiee'].collection).toBe('pros')
		expect(TYPES_DE_COMPTE['maquilleuse-sans-profil'].collection).toBe('pros')
		for (const type of TYPES_REPRIS) expect(TYPES_DE_COMPTE[type].collection).toBe('pros')
		expect(TYPES_DE_COMPTE['maquilleuse-bloquee'].collection).toBe('pros')
	})

	test('une maquilleuse bloquée : confirmée, bloquée, sans session, avec le mot de passe tiré', () => {
		const bloquee: DeclarationDeCompte<'pros'> = TYPES_DE_COMPTE['maquilleuse-bloquee']
		expect(bloquee.donnees()).toMatchObject({ _verified: true, bloque: true })
		expect(bloquee.connexion).toBe(false)
		expect(bloquee.reprise).toBeUndefined()
	})

	test('les comptes de l’ancien site : leur fournisseur, leur hash, et comment chacun se connecte', () => {
		const portraits = TYPES_REPRIS.map(type => {
			const declaration: DeclarationDeCompte<'pros'> = TYPES_DE_COMPTE[type]
			return {
				type,
				...declaration.reprise,
				connexion: declaration.connexion,
				verifie: declaration.donnees()._verified,
			}
		})

		expect(portraits).toEqual([
			{ type: 'reprise-avec-hash', fournisseur: 'local', hashHerite: true, connexion: false, verifie: true },
			{
				type: 'reprise-google',
				fournisseur: 'google',
				hashHerite: false,
				connexion: 'sans-mot-de-passe',
				verifie: true,
			},
			{
				type: 'reprise-google-avec-hash',
				fournisseur: 'google',
				hashHerite: true,
				connexion: 'sans-mot-de-passe',
				verifie: true,
			},
			{ type: 'reprise-facebook', fournisseur: 'facebook', hashHerite: false, connexion: false, verifie: true },
		])
	})

	test('le hash de fixture : un sel fixe au format de l’ancien site, et un mot de passe fictif', () => {
		// Version 2a, cost 10, then 22 characters of the alphabet of bcrypt: a salt, never a hash.
		expect(SEL_BCRYPT_DE_FIXTURE).toMatch(/^\$2a\$10\$[./A-Za-z0-9]{22}$/)
		expect(MOT_DE_PASSE_HERITE_DE_FIXTURE).toStartWith('fixture-')
	})

	test('un identifiant de l’ancien site pour un compte de test, loin de ceux de la fausse source et du jeu', () => {
		const tirages = Array.from({ length: 50 }, strapiIdDeTest)

		for (const tirage of tirages) {
			expect(Number.isInteger(tirage)).toBe(true)
			expect(tirage).toBeGreaterThanOrEqual(1_000_000)
		}
		expect(new Set(tirages).size).toBe(50)
	})

	test('une maquilleuse sans profil : sa création le dit à Payload, et elle se connecte', () => {
		expect(TYPES_DE_COMPTE['maquilleuse-sans-profil'].contexte).toEqual({ profilAutomatique: false })
		expect(TYPES_DE_COMPTE['maquilleuse-sans-profil'].donnees()).toMatchObject({ _verified: true })
		expect('connexion' in TYPES_DE_COMPTE['maquilleuse-sans-profil']).toBe(false)
	})

	test('une maquilleuse confirmée, et une autre qui ne l’est pas et n’a donc pas de session', () => {
		expect(TYPES_DE_COMPTE.maquilleuse.donnees()).toMatchObject({ _verified: true })
		expect(TYPES_DE_COMPTE['maquilleuse-non-verifiee'].donnees()).toMatchObject({ _verified: false })
		expect(TYPES_DE_COMPTE['maquilleuse-non-verifiee'].connexion).toBe(false)
		expect('connexion' in TYPES_DE_COMPTE.maquilleuse).toBe(false)
		// Two accounts made side by side never share a display name.
		expect(TYPES_DE_COMPTE.maquilleuse.donnees().nom).not.toBe(TYPES_DE_COMPTE.maquilleuse.donnees().nom)
	})

	test('les deux rôles de l’administration : admin et redaction', () => {
		expect(TYPES_DE_COMPTE.admin.donnees()).toEqual({ role: 'admin' })
		expect(TYPES_DE_COMPTE.redaction.donnees()).toEqual({ role: 'redaction' })
	})

	test('une adresse en @example.test, jamais deux fois la même', () => {
		const adresses = Array.from({ length: 50 }, () => adresseDeTest('admin'))

		for (const adresse of adresses) expect(adresse).toMatch(/^admin-[0-9a-f-]{36}@example\.test$/)
		expect(new Set(adresses).size).toBe(50)
	})

	test('un mot de passe de 32 caractères, jamais deux fois le même', () => {
		const tirages = Array.from({ length: 50 }, motDePasseAleatoire)

		for (const tirage of tirages) expect(tirage).toMatch(/^[\w-]{32}$/)
		expect(new Set(tirages).size).toBe(50)
	})
})

describe('L’origine d’une session', () => {
	const { payload } = fauxPayload(BASE_DU_BANC)

	test('c’est l’adresse du site sur le banc, quand la configuration lui fait confiance', () => {
		expect(origineDuSite(payload, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3100' })).toBe('http://localhost:3100')
	})

	test('une origine que la configuration ignorerait est refusée, plutôt que de rendre une session sans effet', () => {
		expect(() => origineDuSite(payload, { NEXT_PUBLIC_SITE_URL: 'http://localhost:3999' })).toThrow(BancRefuse)
		expect(() => origineDuSite(payload, {})).toThrow(BancRefuse)
	})
})
