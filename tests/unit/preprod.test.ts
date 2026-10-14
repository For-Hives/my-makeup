import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import type { Payload, SanitizedConfig } from 'payload'
import { EnvError, PREPROD_ORIGIN, parseServerEnv, type RawEnv, serverEnv } from '@/lib/env'
import { auDemarrage } from '@/preprod/au-demarrage'
import {
	adressesDeLaSource,
	demarrerLaPreprod,
	MEDIAS_DE_LA_SOURCE_FICTIVE,
	PreprodRefusee,
	SOURCE_DE_LA_PREPROD,
} from '@/preprod/tranche'
import { DEPLOYED_ORIGINS } from '../../src/lib/env'
import { definitionDeLaSource } from '../outils/source-strapi/donnees'

/**
 * Ticket 027: what the pre-production does when it starts, and nowhere else. The task itself runs
 * on the bench (tests/integration/preprod-demarrage.test.ts); here, without any database: where it
 * runs, what it refuses, and the data it poses.
 */

// Made-up values only. The remote address ends in `.test`, a name that never resolves.
const REMOTE_URI = 'postgres://payload:mot-de-passe-factice@base.exemple.test:5432/mymakeup_preprod?sslmode=disable'
const SECRET = 'k'.repeat(64)
const JETON = 'essai-remise-027'

const preprod: RawEnv = {
	DATABASE_URI: REMOTE_URI,
	NEXT_PUBLIC_SITE_URL: PREPROD_ORIGIN,
	NODE_ENV: 'production',
	PAYLOAD_SECRET: SECRET,
}
const site: RawEnv = { ...preprod, NEXT_PUBLIC_SITE_URL: 'https://my-makeup.fr' }
const poste: RawEnv = {
	...preprod,
	DATABASE_URI: 'postgres://banc:banc@127.0.0.1:5442/mymakeup_dev',
	NODE_ENV: 'development',
}

/** The variables to fix, as the start of the server lists them, or nothing. */
function refus(env: RawEnv): string[] {
	try {
		parseServerEnv(env)
		return []
	} catch (erreur) {
		if (!(erreur instanceof EnvError)) throw erreur
		return erreur.variables
	}
}

/**
 * A Payload that nobody may touch: any reading of it is recorded, and fails. `permis` are the
 * properties that may be read: the plugin that bounds the requests reads the collections before
 * the hook of this ticket (src/lib/requete-bornee.ts).
 */
function payloadIntouchable(permis: Readonly<Record<string, unknown>> = {}): { payload: Payload; touches: string[] } {
	const touches: string[] = []
	const payload = new Proxy(
		{},
		{
			get(_cible, nom) {
				if (typeof nom === 'string' && Object.hasOwn(permis, nom)) return permis[nom]
				touches.push(String(nom))
				throw new Error('Payload a été touché.')
			},
		}
	) as Payload
	return { payload, touches }
}

let espion: ReturnType<typeof spyOn<Console, 'log'>> | undefined

/** The lines the start writes to the log, captured instead of printed. */
function capterLeJournal(): string[] {
	const lignes: string[] = []
	espion = spyOn(console, 'log').mockImplementation((...valeurs: unknown[]) => {
		lignes.push(valeurs.map(String).join(' '))
	})
	return lignes
}

afterEach(() => {
	espion?.mockRestore()
	espion = undefined
})

describe('the environment says where the pre-production is, and nowhere else', () => {
	test('its address is one of the two deployed ones', () => {
		expect(DEPLOYED_ORIGINS).toContain(PREPROD_ORIGIN)
	})

	test('a production build served from its address is the pre-production; the token of a reset is read', () => {
		expect(parseServerEnv(preprod).preprod).toEqual({})
		expect(parseServerEnv({ ...preprod, PREPROD_REMISE_A_ZERO: ` ${JETON} ` }).preprod).toEqual({ remiseAZero: JETON })
	})

	test('the site, `next dev` and a build while Next builds never are', () => {
		expect(parseServerEnv(site).preprod).toBeUndefined()
		expect(parseServerEnv(poste).preprod).toBeUndefined()
		expect(parseServerEnv({ ...preprod, NODE_ENV: 'development' }).preprod).toBeUndefined()
		expect(
			serverEnv({ ...preprod, NEXT_PHASE: 'phase-production-build', PREPROD_REMISE_A_ZERO: JETON }).preprod
		).toBeUndefined()
	})

	test('PREPROD_REMISE_A_ZERO is refused anywhere else than on the pre-production, the site first: the server does not start', () => {
		expect(refus({ ...site, PREPROD_REMISE_A_ZERO: JETON })).toEqual(['PREPROD_REMISE_A_ZERO'])
		expect(refus({ ...poste, PREPROD_REMISE_A_ZERO: JETON })).toEqual(['PREPROD_REMISE_A_ZERO'])
		expect(refus({ ...preprod, NODE_ENV: 'development', PREPROD_REMISE_A_ZERO: JETON })).toEqual([
			'PREPROD_REMISE_A_ZERO',
		])
	})

	test('a token it cannot read is refused, and the message never shows it', () => {
		for (const jeton of ['court', 'Majuscules-2026', 'jeton avec espaces', "2026-10-15';drop", `a${'b'.repeat(64)}`]) {
			expect(refus({ ...preprod, PREPROD_REMISE_A_ZERO: jeton }), jeton).toEqual(['PREPROD_REMISE_A_ZERO'])
		}
		let message = ''
		try {
			parseServerEnv({ ...site, PREPROD_REMISE_A_ZERO: JETON })
		} catch (erreur) {
			message = String((erreur as Error).message)
		}
		expect(message).toContain(
			'PREPROD_REMISE_A_ZERO : refusée, car elle efface toute la base et ce n’est pas la préprod.'
		)
		expect(message).not.toContain(JETON)
	})
})

describe('the task refuses to run in production, before it touches anything', () => {
	test('called without the pre-production, it throws PreprodRefusee and never reads Payload', async () => {
		const { payload, touches } = payloadIntouchable()
		const journal: string[] = []

		const essai = demarrerLaPreprod(payload, {
			preprod: parseServerEnv(site).preprod,
			databaseUri: REMOTE_URI,
			journal: ligne => journal.push(ligne),
		})

		await expect(essai).rejects.toBeInstanceOf(PreprodRefusee)
		expect(touches).toEqual([])
		expect(journal).toEqual([])
	})

	test('the hook of Payload does nothing on the site, nor in a process that migrates', async () => {
		const journal = capterLeJournal()
		const { payload, touches } = payloadIntouchable()

		await auDemarrage(payload, parseServerEnv(site), false)
		await auDemarrage(payload, parseServerEnv(poste), false)
		await auDemarrage(payload, parseServerEnv(preprod), true)

		expect(touches).toEqual([])
		expect(journal).toEqual([])
	})

	test('on the pre-production, a failure is written by its type and code, never its text, and the site keeps serving', async () => {
		const journal = capterLeJournal()
		const echec = Object.assign(new Error('duplicate key (email)=(zoe.lefevre@example.test)'), { code: '57P01' })
		const payload = {
			db: { tableNameMap: new Map(), pool: { query: () => Promise.reject(echec) } },
		} as unknown as Payload

		await auDemarrage(payload, parseServerEnv(preprod), false)

		expect(journal).toEqual([
			'[preprod] Démarrage de la préprod interrompu. L’import s’est arrêté sur une erreur inattendue (Error, code 57P01). Son texte n’est pas affiché : il peut porter des valeurs de la base. Ce qui était écrit avant reste écrit ; un nouveau passage reprend à partir de là.',
		])
	})
})

describe('the configuration of Payload runs the hook with its own environment', () => {
	const VARIABLES = ['DATABASE_URI', 'NEXT_PHASE', 'NEXT_PUBLIC_SITE_URL', 'NODE_ENV', 'PAYLOAD_SECRET'] as const
	let chargements = 0

	/** The real src/payload.config.ts, evaluated again under exactly this environment. Nothing connects. */
	async function configurationSous(env: RawEnv): Promise<SanitizedConfig> {
		const avant = VARIABLES.map(nom => [nom, process.env[nom]] as const)
		const poser = (nom: string, valeur: string | undefined) => {
			if (valeur === undefined) Reflect.deleteProperty(process.env, nom)
			else Reflect.set(process.env, nom, valeur)
		}
		for (const nom of VARIABLES) poser(nom, env[nom])
		try {
			const charge = (await import(`../../src/payload.config.ts?preprod=${++chargements}`)) as {
				default: Promise<SanitizedConfig>
			}
			return await charge.default
		} finally {
			for (const [nom, valeur] of avant) poser(nom, valeur)
		}
	}

	test('on the site: nothing is touched', async () => {
		const journal = capterLeJournal()
		const { payload, touches } = payloadIntouchable({ collections: {} })
		const configuration = await configurationSous(site)

		await configuration.onInit?.(payload)

		expect(touches).toEqual([])
		expect(journal).toEqual([])
	})

	test('on the pre-production: the start runs, and a failure stays in the log', async () => {
		const journal = capterLeJournal()
		const { payload, touches } = payloadIntouchable({ collections: {} })
		const configuration = await configurationSous(preprod)

		await configuration.onInit?.(payload)

		expect(touches).toContain('db')
		expect(journal).toEqual([expect.stringMatching(/^\[preprod\] Démarrage de la préprod interrompu\. /)])
	})
})

describe('the fake source, next to the database of the pre-production', () => {
	test('a database of its own on the same server, read by a role of its own', () => {
		const { administration, lecture } = adressesDeLaSource(REMOTE_URI, SOURCE_DE_LA_PREPROD, 'abc123def456')

		expect(administration).toBe(
			'postgres://payload:mot-de-passe-factice@base.exemple.test:5432/strapi_source_preprod?sslmode=disable'
		)
		expect(lecture).toBe(
			'postgres://lecture_strapi_preprod:abc123def456@base.exemple.test:5432/strapi_source_preprod?sslmode=disable'
		)
	})

	test('never the database of Payload itself', () => {
		const memeBase = 'postgres://payload:factice@base.exemple.test:5432/strapi_source_preprod'

		expect(() => adressesDeLaSource(memeBase, SOURCE_DE_LA_PREPROD, 'abc123def456')).toThrow(PreprodRefusee)
	})

	test('no real data: every address, phone and file of the source it poses is fictional', () => {
		const { lignes } = definitionDeLaSource(MEDIAS_DE_LA_SOURCE_FICTIVE)
		const emails = [
			...lignes.up_users.map(compte => String(compte.email)),
			...lignes.components_makeupartists_networks.map(reseau => reseau.email).filter(email => email !== null),
		]
		const telephones = lignes.components_makeupartists_networks.map(reseau => reseau.phone).filter(tel => tel !== null)
		const fichiers = lignes.files.map(fichier => String(fichier.url))

		expect(emails.length).toBeGreaterThan(0)
		for (const email of emails) expect(String(email).trim().toLowerCase()).toEndWith('@example.test')
		expect(telephones.length).toBeGreaterThan(0)
		for (const telephone of telephones) expect(String(telephone)).toStartWith('06 39 98')
		for (const fichier of fichiers) expect(fichier).toStartWith(`${MEDIAS_DE_LA_SOURCE_FICTIVE}/`)
		expect(new URL(MEDIAS_DE_LA_SOURCE_FICTIVE).hostname).toEndWith('.example.test')
	})
})
