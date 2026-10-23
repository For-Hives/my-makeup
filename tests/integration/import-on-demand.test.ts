import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type ImportEnv, serverEnv } from '../../src/lib/env'
import {
	type ImportOptions,
	importOnDemand,
	type OnDemandImportEnv,
	readTokens,
	reserveToken,
} from '../../src/migration/on-demand-import'
import { BENCH_CUTOVER_DATE, ROOT } from '../support/bench'
import { BENCH_DECISION_FILE, benchReference } from '../support/import'
import { connect } from '../support/legacy-journeys'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'
import {
	benchSource,
	COMPTES_DE_FIXTURE,
	createSourceStrapi,
	eraseSourceStrapi,
	sourceFingerprint,
} from '../support/source-strapi'

// The bench is shared and a suite under load runs several times slower than alone (ticket 225).
setDefaultTimeout(60_000)

/**
 * Ticket 233: the import the deployed container runs on demand, here on the bench with the fake
 * Strapi source. `lieu: 'site'` stands for the site: the only way to say it, an argument.
 * Every pass gets a token of its own; the same token plays once.
 */

const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? COMPTES_DE_FIXTURE[0]

let number = 0
/** A token no earlier pass of this run used. */
const newToken = (): string => `essai-233-${(++number).toString(36)}-${Date.now().toString(36)}`

/** The environment the module reads: the bench's own, the fake source, and the request. */
function env(importation: Partial<ImportEnv> = {}, surcharge: Partial<OnDemandImportEnv> = {}): OnDemandImportEnv {
	return {
		...serverEnv(),
		sourceStrapi: benchSource().lecture,
		importation: {
			token: newToken(),
			mode: 'dry-run',
			targetInService: false,
			decisions: readFileSync(path.join(ROOT, BENCH_DECISION_FILE), 'utf8'),
			consentDate: BENCH_CUTOVER_DATE,
			...importation,
		},
		...surcharge,
	}
}

/** Every line the module wrote, over all the passes of the file. */
const allLog: string[] = []

async function pass(importation: Partial<ImportEnv> = {}, options: ImportOptions = {}) {
	const lines: string[] = []
	const issue = await importOnDemand(await testPayload(), env(importation), {
		place: 'site',
		reference: benchReference(),
		mediaBase: benchSource().medias,
		log: ligne => {
			lines.push(ligne)
			allLog.push(ligne)
		},
		...options,
	})
	return { issue, rows: lines, log: lines.join('\n') }
}

async function counts() {
	const payload = await testPayload()
	const count = async (collection: 'pros' | 'profiles' | 'articles' | 'talents' | 'media') =>
		(await payload.count({ collection, overrideAccess: true })).totalDocs
	return {
		pros: await count('pros'),
		profils: await count('profiles'),
		articles: await count('articles'),
		talents: await count('talents'),
		media: await count('media'),
	}
}

const EMPTY = { pros: 0, profils: 0, articles: 0, talents: 0, media: 0 }

beforeAll(async () => {
	await emptyBase()
	await emptyStorage()
	await createSourceStrapi()
})

beforeEach(async () => {
	await emptyBase()
})

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('à blanc, il lit et n’écrit rien', () => {
	test('un passage à blanc finit en code 0, annonce ses créations et laisse la cible vide', async () => {
		const fingerprint = (await sourceFingerprint()).empreinte

		const { issue, log } = await pass({ mode: 'dry-run' })

		expect(issue).toEqual({ state: 'termine', code: 0 })
		expect(log).toContain('Import à blanc : rien n’est écrit.')
		expect(log).toContain('Talents : 3 à la source ; 3 créations annoncées')
		expect(log).toMatch(/Passage dry-run fini, code 0\./)
		expect(await counts()).toEqual(EMPTY)
		expect((await sourceFingerprint()).empreinte).toBe(fingerprint)
	})

	test('sans mode, c’est un passage à blanc : l’env le dit déjà, le module n’écrit rien', async () => {
		const { issue } = await pass({ mode: 'dry-run', targetInService: false })

		expect(issue.state).toBe('termine')
		expect(await counts()).toEqual(EMPTY)
	})
})

describe('réel, puis un jeton nouveau n’écrit plus rien', () => {
	test('le passage réel écrit, prouve sa parité, puis un second jeton ne crée ni ne modifie rien', async () => {
		const first = await pass({ mode: 'real' })

		expect(first.issue).toEqual({ state: 'termine', code: 0 })
		const after = await counts()
		expect(after.pros).toBeGreaterThan(0)
		expect(after.profils).toBeGreaterThan(0)
		expect(after.talents).toBe(3)
		expect(after.media).toBeGreaterThan(0)
		expect(first.log).toContain('Talents : 3 à la source ; 3 créations, 0 mise à jour, 0 inchangé')
		// Ticket 261: the zones, and each reason to review with its number and its identifiers.
		expect(first.log).toContain(
			'  - zones reconnues, communes et pays : 9 sur 11 villes renseignées (81,8 %, cible 90 %) ; communes seules : 9 ; zones de pays : 0 (aucun)'
		)
		expect(first.log).toContain(
			'  - villes à revoir, par raison : code postal partagé 0 ; plusieurs communes de même nom 1 (28) ; commune introuvable 0 ; pas une commune 1 (26)'
		)

		const second = await pass({ mode: 'real' })

		expect(second.issue).toEqual({ state: 'termine', code: 0 })
		expect(second.log).toMatch(/Talents : 3 à la source ; 0 création, 0 mise à jour, 3 inchangé/)
		expect(second.log).toMatch(/Comptes : 17 à la source ; 0 création, 0 mise à jour, 14 inchangé/)
		expect(await counts()).toEqual(after)
	})

	test('le contrôle, avec un jeton nouveau, sort en code 0 : la cible est la source', async () => {
		await pass({ mode: 'real' })

		const { issue, log } = await pass({ mode: 'check' })

		expect(issue).toEqual({ state: 'termine', code: 0 })
		expect(log).toContain('la cible est la source')
	})

	test('le contrôle d’une cible vide sort en code 4', async () => {
		const { issue, log } = await pass({ mode: 'check' })

		expect(issue).toEqual({ state: 'termine', code: 4 })
		expect(log).not.toContain('la cible est la source')
	})
})

describe('un même jeton ne rejoue rien', () => {
	test('le jeton est gardé en base, avec tous ceux d’avant', async () => {
		const a = newToken()
		const two = newToken()
		await pass({ token: a, mode: 'dry-run' })
		await pass({ token: two, mode: 'dry-run' })

		const { rows } = await (await testPayload()).db.pool.query<{ marque: string }>(
			"SELECT obj_description(to_regnamespace('public'), 'pg_namespace') AS marque"
		)

		expect(readTokens(rows[0]?.marque)).toEqual(expect.arrayContaining([a, two]))
	})

	test('rejoué avec le même jeton, même sur une cible vidée, le passage ne lit rien et n’écrit rien', async () => {
		const token = newToken()
		expect((await pass({ token: token, mode: 'real' })).issue.state).toBe('termine')
		await emptyBase()
		expect(await counts()).toEqual(EMPTY)

		let open = false
		const { issue, log } = await pass(
			{ token: token, mode: 'real' },
			{
				openSource: () => {
					open = true
					throw new Error('ne devait pas s’ouvrir')
				},
			}
		)

		expect(issue).toEqual({ state: 'deja-joue', token: token })
		expect(log).toContain('a déjà été joué')
		expect(open).toBe(false)
		expect(await counts()).toEqual(EMPTY)
	})

	test('cinq démarrages en même temps avec le même jeton : un seul le réserve', async () => {
		const payload = await testPayload()
		const token = newToken()

		const responses = await Promise.all(Array.from({ length: 5 }, () => reserveToken(payload.db.pool, token)))

		expect(responses.filter(Boolean)).toHaveLength(1)
	})

	test('un passage arrêté a utilisé son jeton : le suivant en demande un nouveau', async () => {
		const token = newToken()
		const stop = await pass(
			{ token: token },
			{
				openSource: () => {
					throw new Error('la source est tombée')
				},
			}
		)
		expect(stop.issue.state).toBe('refuse')

		expect((await pass({ token: token })).issue).toEqual({ state: 'deja-joue', token: token })
		expect((await pass({ token: newToken() })).issue).toEqual({ state: 'termine', code: 0 })
	})
})

describe('une cible que la v3 utilise déjà est refusée sans l’option', () => {
	test('après une connexion réussie, le passage réel est refusé ; avec IMPORT_TARGET_IN_SERVICE il passe', async () => {
		await pass({ mode: 'real' })
		expect(await connect(LOCAL?.email ?? '', LOCAL?.motDePasse ?? '')).toMatchObject({ ok: true })
		const before = await counts()

		for (const mode of ['dry-run', 'real'] as const) {
			const refusal = await pass({ mode })
			expect(refusal.issue.state, mode).toBe('refuse')
			expect(refusal.log).toContain('déjà utilisée par la v3')
			expect(refusal.log).toContain('--target-in-service')
		}
		expect(await counts()).toEqual(before)

		const allowed = await pass({ mode: 'real', targetInService: true })

		expect(allowed.issue).toEqual({ state: 'termine', code: 0 })
		expect(await counts()).toEqual(before)
	})
})

describe('les refus du lieu, de la source et du stockage', () => {
	test('hors du site, il n’écrit rien et ne réserve pas le jeton', async () => {
		const token = newToken()

		const { issue, log } = await pass({ token: token, mode: 'real' }, { place: 'autre' })

		expect(issue.state).toBe('refuse')
		expect(log).toContain('ne tourne que sur le site')
		expect(await counts()).toEqual(EMPTY)
		expect((await pass({ token: token, mode: 'dry-run' })).issue.state).toBe('termine')
	})

	test('sans lieu donné, le processus de test n’est pas le site', async () => {
		const lines: string[] = []
		const issue = await importOnDemand(await testPayload(), env({ mode: 'real' }), { log: l => lines.push(l) })

		expect(issue.state).toBe('refuse')
		expect(await counts()).toEqual(EMPTY)
	})

	test('la base de Payload comme source est refusée avant toute lecture', async () => {
		const payload = await testPayload()
		const lines: string[] = []

		const issue = await importOnDemand(
			payload,
			{ ...env({ mode: 'real' }), sourceStrapi: serverEnv().databaseUri },
			{
				place: 'site',
				log: l => lines.push(l),
			}
		)

		expect(issue.state).toBe('refuse')
		expect(lines.join('\n')).toContain('désigne la base de Payload')
		expect(await counts()).toEqual(EMPTY)
	})

	test('sans stockage des photos, le passage est refusé : aucune photo ne serait adoptée', async () => {
		const lines: string[] = []

		const issue = await importOnDemand(await testPayload(), env({ mode: 'real' }, { storage: undefined }), {
			place: 'site',
			log: l => lines.push(l),
		})

		expect(issue.state).toBe('refuse')
		expect(lines.join('\n')).toContain('stockage des photos')
		expect(await counts()).toEqual(EMPTY)
	})

	test('une table de décision illisible refuse le passage sans écrire le jeton', async () => {
		const token = newToken()

		const wrong = await pass({ token: token, mode: 'real', decisions: '{"sharedEmails": 3}' })
		expect(wrong.issue.state).toBe('refuse')

		expect((await pass({ token: token, mode: 'dry-run' })).issue.state).toBe('termine')
	})
})

describe('le journal ne porte que des nombres', () => {
	test('les lignes des zones ne portent ni texte saisi ni nom de commune : des nombres, des raisons et des identifiants', () => {
		const zoneLines = allLog.filter(line => line.includes('zones reconnues') || line.includes('villes à revoir'))

		expect(zoneLines.length).toBeGreaterThan(0)
		for (const line of zoneLines) expect(line).not.toMatch(/Pinceaux|Toulouse|Saint-Julien|Annecy|France|Nantes|Lyon/)
	})

	test('aucune ligne, sur tous les passages du fichier, ne contient un @ ni un hash bcrypt', () => {
		expect(allLog.length).toBeGreaterThan(50)
		for (const line of allLog) {
			expect(line).not.toContain('@')
			expect(line).not.toContain('$2a$')
		}
	})

	test('une source qui tombe avec une adresse et un mot de passe dans son erreur laisse un journal propre', async () => {
		const unreachable = 'postgres://lecture_strapi:mot-de-passe-factice@hote-inconnu.example.test:5432/strapi'
		const lines: string[] = []

		const issue = await importOnDemand(
			await testPayload(),
			env({ token: newToken(), mode: 'dry-run' }, { sourceStrapi: unreachable }),
			{
				place: 'site',
				reference: benchReference(),
				mediaBase: benchSource().medias,
				log: l => lines.push(l),
			}
		)

		const log = lines.join('\n')
		expect(issue.state).toBe('refuse')
		expect(log).toContain('Passage refusé ou arrêté')
		for (const forbidden of ['@', 'mot-de-passe-factice', 'hote-inconnu', 'lecture_strapi'])
			expect(log).not.toContain(forbidden)
		expect(await counts()).toEqual(EMPTY)
	})
})
