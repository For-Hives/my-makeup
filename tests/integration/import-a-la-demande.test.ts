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
import { DATE_DE_BASCULE_DU_BANC, RACINE } from '../support/bench'
import { FICHIER_DES_DECISIONS_DU_BANC, referentielDuBanc } from '../support/import'
import { seConnecter } from '../support/legacy-journeys'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { viderLeStockage } from '../support/s3'
import {
	COMPTES_DE_FIXTURE,
	creerLaSourceStrapi,
	effacerLaSourceStrapi,
	empreinteDeLaSource,
	sourceDuBanc,
} from '../support/source-strapi'

// The bench is shared and a suite under load runs several times slower than alone (ticket 225).
setDefaultTimeout(60_000)

/**
 * Ticket 233: the import the deployed container runs on demand, here on the bench with the fake
 * Strapi source. `lieu: 'site'` stands for the site: the only way to say it, an argument.
 * Every pass gets a token of its own; the same token plays once.
 */

const LOCAL = COMPTES_DE_FIXTURE.find(({ provider }) => provider === 'local') ?? COMPTES_DE_FIXTURE[0]

let numero = 0
/** A token no earlier pass of this run used. */
const nouveauJeton = (): string => `essai-233-${(++numero).toString(36)}-${Date.now().toString(36)}`

/** The environment the module reads: the bench's own, the fake source, and the request. */
function env(importation: Partial<ImportEnv> = {}, surcharge: Partial<OnDemandImportEnv> = {}): OnDemandImportEnv {
	return {
		...serverEnv(),
		sourceStrapi: sourceDuBanc().lecture,
		importation: {
			token: nouveauJeton(),
			mode: 'dry-run',
			targetInService: false,
			decisions: readFileSync(path.join(RACINE, FICHIER_DES_DECISIONS_DU_BANC), 'utf8'),
			consentDate: DATE_DE_BASCULE_DU_BANC,
			...importation,
		},
		...surcharge,
	}
}

/** Every line the module wrote, over all the passes of the file. */
const toutLeJournal: string[] = []

async function passer(importation: Partial<ImportEnv> = {}, options: ImportOptions = {}) {
	const lignes: string[] = []
	const issue = await importOnDemand(await payloadDeTest(), env(importation), {
		place: 'site',
		reference: referentielDuBanc(),
		mediaBase: sourceDuBanc().medias,
		log: ligne => {
			lignes.push(ligne)
			toutLeJournal.push(ligne)
		},
		...options,
	})
	return { issue, rows: lignes, log: lignes.join('\n') }
}

async function nombres() {
	const payload = await payloadDeTest()
	const compter = async (collection: 'pros' | 'profiles' | 'articles' | 'talents' | 'media') =>
		(await payload.count({ collection, overrideAccess: true })).totalDocs
	return {
		pros: await compter('pros'),
		profils: await compter('profiles'),
		articles: await compter('articles'),
		talents: await compter('talents'),
		media: await compter('media'),
	}
}

const VIDE = { pros: 0, profils: 0, articles: 0, talents: 0, media: 0 }

beforeAll(async () => {
	await viderLaBase()
	await viderLeStockage()
	await creerLaSourceStrapi()
})

beforeEach(async () => {
	await viderLaBase()
})

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('à blanc, il lit et n’écrit rien', () => {
	test('un passage à blanc finit en code 0, annonce ses créations et laisse la cible vide', async () => {
		const empreinte = (await empreinteDeLaSource()).empreinte

		const { issue, log: journal } = await passer({ mode: 'dry-run' })

		expect(issue).toEqual({ state: 'termine', code: 0 })
		expect(journal).toContain('Import à blanc : rien n’est écrit.')
		expect(journal).toContain('Talents : 3 à la source ; 3 créations annoncées')
		expect(journal).toMatch(/Passage dry-run fini, code 0\./)
		expect(await nombres()).toEqual(VIDE)
		expect((await empreinteDeLaSource()).empreinte).toBe(empreinte)
	})

	test('sans mode, c’est un passage à blanc : l’env le dit déjà, le module n’écrit rien', async () => {
		const { issue } = await passer({ mode: 'dry-run', targetInService: false })

		expect(issue.state).toBe('termine')
		expect(await nombres()).toEqual(VIDE)
	})
})

describe('réel, puis un jeton nouveau n’écrit plus rien', () => {
	test('le passage réel écrit, prouve sa parité, puis un second jeton ne crée ni ne modifie rien', async () => {
		const premier = await passer({ mode: 'real' })

		expect(premier.issue).toEqual({ state: 'termine', code: 0 })
		const apres = await nombres()
		expect(apres.pros).toBeGreaterThan(0)
		expect(apres.profils).toBeGreaterThan(0)
		expect(apres.talents).toBe(3)
		expect(apres.media).toBeGreaterThan(0)
		expect(premier.log).toContain('Talents : 3 à la source ; 3 créations, 0 mise à jour, 0 inchangé')

		const second = await passer({ mode: 'real' })

		expect(second.issue).toEqual({ state: 'termine', code: 0 })
		expect(second.log).toMatch(/Talents : 3 à la source ; 0 création, 0 mise à jour, 3 inchangé/)
		expect(second.log).toMatch(/Comptes : 17 à la source ; 0 création, 0 mise à jour, 14 inchangé/)
		expect(await nombres()).toEqual(apres)
	})

	test('le contrôle, avec un jeton nouveau, sort en code 0 : la cible est la source', async () => {
		await passer({ mode: 'real' })

		const { issue, log: journal } = await passer({ mode: 'check' })

		expect(issue).toEqual({ state: 'termine', code: 0 })
		expect(journal).toContain('la cible est la source')
	})

	test('le contrôle d’une cible vide sort en code 4', async () => {
		const { issue, log: journal } = await passer({ mode: 'check' })

		expect(issue).toEqual({ state: 'termine', code: 4 })
		expect(journal).not.toContain('la cible est la source')
	})
})

describe('un même jeton ne rejoue rien', () => {
	test('le jeton est gardé en base, avec tous ceux d’avant', async () => {
		const un = nouveauJeton()
		const deux = nouveauJeton()
		await passer({ token: un, mode: 'dry-run' })
		await passer({ token: deux, mode: 'dry-run' })

		const { rows } = await (await payloadDeTest()).db.pool.query<{ marque: string }>(
			"SELECT obj_description(to_regnamespace('public'), 'pg_namespace') AS marque"
		)

		expect(readTokens(rows[0]?.marque)).toEqual(expect.arrayContaining([un, deux]))
	})

	test('rejoué avec le même jeton, même sur une cible vidée, le passage ne lit rien et n’écrit rien', async () => {
		const jeton = nouveauJeton()
		expect((await passer({ token: jeton, mode: 'real' })).issue.state).toBe('termine')
		await viderLaBase()
		expect(await nombres()).toEqual(VIDE)

		let ouverte = false
		const { issue, log: journal } = await passer(
			{ token: jeton, mode: 'real' },
			{
				openSource: () => {
					ouverte = true
					throw new Error('ne devait pas s’ouvrir')
				},
			}
		)

		expect(issue).toEqual({ state: 'deja-joue', token: jeton })
		expect(journal).toContain('a déjà été joué')
		expect(ouverte).toBe(false)
		expect(await nombres()).toEqual(VIDE)
	})

	test('cinq démarrages en même temps avec le même jeton : un seul le réserve', async () => {
		const payload = await payloadDeTest()
		const jeton = nouveauJeton()

		const reponses = await Promise.all(Array.from({ length: 5 }, () => reserveToken(payload.db.pool, jeton)))

		expect(reponses.filter(Boolean)).toHaveLength(1)
	})

	test('un passage arrêté a utilisé son jeton : le suivant en demande un nouveau', async () => {
		const jeton = nouveauJeton()
		const arret = await passer(
			{ token: jeton },
			{
				openSource: () => {
					throw new Error('la source est tombée')
				},
			}
		)
		expect(arret.issue.state).toBe('refuse')

		expect((await passer({ token: jeton })).issue).toEqual({ state: 'deja-joue', token: jeton })
		expect((await passer({ token: nouveauJeton() })).issue).toEqual({ state: 'termine', code: 0 })
	})
})

describe('une cible que la v3 utilise déjà est refusée sans l’option', () => {
	test('après une connexion réussie, le passage réel est refusé ; avec IMPORT_TARGET_IN_SERVICE il passe', async () => {
		await passer({ mode: 'real' })
		expect(await seConnecter(LOCAL?.email ?? '', LOCAL?.motDePasse ?? '')).toMatchObject({ ok: true })
		const avant = await nombres()

		for (const mode of ['dry-run', 'real'] as const) {
			const refus = await passer({ mode })
			expect(refus.issue.state, mode).toBe('refuse')
			expect(refus.log).toContain('déjà utilisée par la v3')
			expect(refus.log).toContain('--target-in-service')
		}
		expect(await nombres()).toEqual(avant)

		const permis = await passer({ mode: 'real', targetInService: true })

		expect(permis.issue).toEqual({ state: 'termine', code: 0 })
		expect(await nombres()).toEqual(avant)
	})
})

describe('les refus du lieu, de la source et du stockage', () => {
	test('hors du site, il n’écrit rien et ne réserve pas le jeton', async () => {
		const jeton = nouveauJeton()

		const { issue, log: journal } = await passer({ token: jeton, mode: 'real' }, { place: 'autre' })

		expect(issue.state).toBe('refuse')
		expect(journal).toContain('ne tourne que sur le site')
		expect(await nombres()).toEqual(VIDE)
		expect((await passer({ token: jeton, mode: 'dry-run' })).issue.state).toBe('termine')
	})

	test('sans lieu donné, le processus de test n’est pas le site', async () => {
		const lignes: string[] = []
		const issue = await importOnDemand(await payloadDeTest(), env({ mode: 'real' }), { log: l => lignes.push(l) })

		expect(issue.state).toBe('refuse')
		expect(await nombres()).toEqual(VIDE)
	})

	test('la base de Payload comme source est refusée avant toute lecture', async () => {
		const payload = await payloadDeTest()
		const lignes: string[] = []

		const issue = await importOnDemand(
			payload,
			{ ...env({ mode: 'real' }), sourceStrapi: serverEnv().databaseUri },
			{
				place: 'site',
				log: l => lignes.push(l),
			}
		)

		expect(issue.state).toBe('refuse')
		expect(lignes.join('\n')).toContain('désigne la base de Payload')
		expect(await nombres()).toEqual(VIDE)
	})

	test('sans stockage des photos, le passage est refusé : aucune photo ne serait adoptée', async () => {
		const lignes: string[] = []

		const issue = await importOnDemand(await payloadDeTest(), env({ mode: 'real' }, { storage: undefined }), {
			place: 'site',
			log: l => lignes.push(l),
		})

		expect(issue.state).toBe('refuse')
		expect(lignes.join('\n')).toContain('stockage des photos')
		expect(await nombres()).toEqual(VIDE)
	})

	test('une table de décision illisible refuse le passage sans écrire le jeton', async () => {
		const jeton = nouveauJeton()

		const mauvais = await passer({ token: jeton, mode: 'real', decisions: '{"sharedEmails": 3}' })
		expect(mauvais.issue.state).toBe('refuse')

		expect((await passer({ token: jeton, mode: 'dry-run' })).issue.state).toBe('termine')
	})
})

describe('le journal ne porte que des nombres', () => {
	test('aucune ligne, sur tous les passages du fichier, ne contient un @ ni un hash bcrypt', () => {
		expect(toutLeJournal.length).toBeGreaterThan(50)
		for (const ligne of toutLeJournal) {
			expect(ligne).not.toContain('@')
			expect(ligne).not.toContain('$2a$')
		}
	})

	test('une source qui tombe avec une adresse et un mot de passe dans son erreur laisse un journal propre', async () => {
		const injoignable = 'postgres://lecture_strapi:mot-de-passe-factice@hote-inconnu.example.test:5432/strapi'
		const lignes: string[] = []

		const issue = await importOnDemand(
			await payloadDeTest(),
			env({ token: nouveauJeton(), mode: 'dry-run' }, { sourceStrapi: injoignable }),
			{
				place: 'site',
				reference: referentielDuBanc(),
				mediaBase: sourceDuBanc().medias,
				log: l => lignes.push(l),
			}
		)

		const journal = lignes.join('\n')
		expect(issue.state).toBe('refuse')
		expect(journal).toContain('Passage refusé ou arrêté')
		for (const interdit of ['@', 'mot-de-passe-factice', 'hote-inconnu', 'lecture_strapi'])
			expect(journal).not.toContain(interdit)
		expect(await nombres()).toEqual(VIDE)
	})
})
