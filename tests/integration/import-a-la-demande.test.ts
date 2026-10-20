import { afterAll, beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type ImportEnv, serverEnv } from '../../src/lib/env'
import {
	type EnvDeLImport,
	importALaDemande,
	lireLesJetons,
	type OptionsDeLImport,
	reserverLeJeton,
} from '../../src/migration/on-demand-import'
import { DATE_DE_BASCULE_DU_BANC, RACINE } from '../outils/banc'
import { FICHIER_DES_DECISIONS_DU_BANC, referentielDuBanc } from '../outils/import'
import { seConnecter } from '../outils/parcours-herites'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'
import {
	COMPTES_DE_FIXTURE,
	creerLaSourceStrapi,
	effacerLaSourceStrapi,
	empreinteDeLaSource,
	sourceDuBanc,
} from '../outils/source-strapi'

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
function env(importation: Partial<ImportEnv> = {}, surcharge: Partial<EnvDeLImport> = {}): EnvDeLImport {
	return {
		...serverEnv(),
		sourceStrapi: sourceDuBanc().lecture,
		importation: {
			jeton: nouveauJeton(),
			mode: 'a-blanc',
			cibleEnService: false,
			decisions: readFileSync(path.join(RACINE, FICHIER_DES_DECISIONS_DU_BANC), 'utf8'),
			consentiLe: DATE_DE_BASCULE_DU_BANC,
			...importation,
		},
		...surcharge,
	}
}

/** Every line the module wrote, over all the passes of the file. */
const toutLeJournal: string[] = []

async function passer(importation: Partial<ImportEnv> = {}, options: OptionsDeLImport = {}) {
	const lignes: string[] = []
	const issue = await importALaDemande(await payloadDeTest(), env(importation), {
		lieu: 'site',
		referentiel: referentielDuBanc(),
		baseDesMedias: sourceDuBanc().medias,
		journal: ligne => {
			lignes.push(ligne)
			toutLeJournal.push(ligne)
		},
		...options,
	})
	return { issue, lignes, journal: lignes.join('\n') }
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

		const { issue, journal } = await passer({ mode: 'a-blanc' })

		expect(issue).toEqual({ etat: 'termine', code: 0 })
		expect(journal).toContain('Import à blanc : rien n’est écrit.')
		expect(journal).toContain('Talents : 3 à la source ; 3 créations annoncées')
		expect(journal).toMatch(/Passage a-blanc fini, code 0\./)
		expect(await nombres()).toEqual(VIDE)
		expect((await empreinteDeLaSource()).empreinte).toBe(empreinte)
	})

	test('sans mode, c’est un passage à blanc : l’env le dit déjà, le module n’écrit rien', async () => {
		const { issue } = await passer({ mode: 'a-blanc', cibleEnService: false })

		expect(issue.etat).toBe('termine')
		expect(await nombres()).toEqual(VIDE)
	})
})

describe('réel, puis un jeton nouveau n’écrit plus rien', () => {
	test('le passage réel écrit, prouve sa parité, puis un second jeton ne crée ni ne modifie rien', async () => {
		const premier = await passer({ mode: 'reel' })

		expect(premier.issue).toEqual({ etat: 'termine', code: 0 })
		const apres = await nombres()
		expect(apres.pros).toBeGreaterThan(0)
		expect(apres.profils).toBeGreaterThan(0)
		expect(apres.talents).toBe(3)
		expect(apres.media).toBeGreaterThan(0)
		expect(premier.journal).toContain('Talents : 3 à la source ; 3 créations, 0 mise à jour, 0 inchangé')

		const second = await passer({ mode: 'reel' })

		expect(second.issue).toEqual({ etat: 'termine', code: 0 })
		expect(second.journal).toMatch(/Talents : 3 à la source ; 0 création, 0 mise à jour, 3 inchangé/)
		expect(second.journal).toMatch(/Comptes : 17 à la source ; 0 création, 0 mise à jour, 14 inchangé/)
		expect(await nombres()).toEqual(apres)
	})

	test('le contrôle, avec un jeton nouveau, sort en code 0 : la cible est la source', async () => {
		await passer({ mode: 'reel' })

		const { issue, journal } = await passer({ mode: 'controle' })

		expect(issue).toEqual({ etat: 'termine', code: 0 })
		expect(journal).toContain('la cible est la source')
	})

	test('le contrôle d’une cible vide sort en code 4', async () => {
		const { issue, journal } = await passer({ mode: 'controle' })

		expect(issue).toEqual({ etat: 'termine', code: 4 })
		expect(journal).not.toContain('la cible est la source')
	})
})

describe('un même jeton ne rejoue rien', () => {
	test('le jeton est gardé en base, avec tous ceux d’avant', async () => {
		const un = nouveauJeton()
		const deux = nouveauJeton()
		await passer({ jeton: un, mode: 'a-blanc' })
		await passer({ jeton: deux, mode: 'a-blanc' })

		const { rows } = await (await payloadDeTest()).db.pool.query<{ marque: string }>(
			"SELECT obj_description(to_regnamespace('public'), 'pg_namespace') AS marque"
		)

		expect(lireLesJetons(rows[0]?.marque)).toEqual(expect.arrayContaining([un, deux]))
	})

	test('rejoué avec le même jeton, même sur une cible vidée, le passage ne lit rien et n’écrit rien', async () => {
		const jeton = nouveauJeton()
		expect((await passer({ jeton, mode: 'reel' })).issue.etat).toBe('termine')
		await viderLaBase()
		expect(await nombres()).toEqual(VIDE)

		let ouverte = false
		const { issue, journal } = await passer(
			{ jeton, mode: 'reel' },
			{
				ouvrirLaSource: () => {
					ouverte = true
					throw new Error('ne devait pas s’ouvrir')
				},
			}
		)

		expect(issue).toEqual({ etat: 'deja-joue', jeton })
		expect(journal).toContain('a déjà été joué')
		expect(ouverte).toBe(false)
		expect(await nombres()).toEqual(VIDE)
	})

	test('cinq démarrages en même temps avec le même jeton : un seul le réserve', async () => {
		const payload = await payloadDeTest()
		const jeton = nouveauJeton()

		const reponses = await Promise.all(Array.from({ length: 5 }, () => reserverLeJeton(payload.db.pool, jeton)))

		expect(reponses.filter(Boolean)).toHaveLength(1)
	})

	test('un passage arrêté a utilisé son jeton : le suivant en demande un nouveau', async () => {
		const jeton = nouveauJeton()
		const arret = await passer(
			{ jeton },
			{
				ouvrirLaSource: () => {
					throw new Error('la source est tombée')
				},
			}
		)
		expect(arret.issue.etat).toBe('refuse')

		expect((await passer({ jeton })).issue).toEqual({ etat: 'deja-joue', jeton })
		expect((await passer({ jeton: nouveauJeton() })).issue).toEqual({ etat: 'termine', code: 0 })
	})
})

describe('une cible que la v3 utilise déjà est refusée sans l’option', () => {
	test('après une connexion réussie, le passage réel est refusé ; avec IMPORT_CIBLE_EN_SERVICE il passe', async () => {
		await passer({ mode: 'reel' })
		expect(await seConnecter(LOCAL?.email ?? '', LOCAL?.motDePasse ?? '')).toMatchObject({ ok: true })
		const avant = await nombres()

		for (const mode of ['a-blanc', 'reel'] as const) {
			const refus = await passer({ mode })
			expect(refus.issue.etat, mode).toBe('refuse')
			expect(refus.journal).toContain('déjà utilisée par la v3')
			expect(refus.journal).toContain('--cible-en-service')
		}
		expect(await nombres()).toEqual(avant)

		const permis = await passer({ mode: 'reel', cibleEnService: true })

		expect(permis.issue).toEqual({ etat: 'termine', code: 0 })
		expect(await nombres()).toEqual(avant)
	})
})

describe('les refus du lieu, de la source et du stockage', () => {
	test('hors du site, il n’écrit rien et ne réserve pas le jeton', async () => {
		const jeton = nouveauJeton()

		const { issue, journal } = await passer({ jeton, mode: 'reel' }, { lieu: 'autre' })

		expect(issue.etat).toBe('refuse')
		expect(journal).toContain('ne tourne que sur le site')
		expect(await nombres()).toEqual(VIDE)
		expect((await passer({ jeton, mode: 'a-blanc' })).issue.etat).toBe('termine')
	})

	test('sans lieu donné, le processus de test n’est pas le site', async () => {
		const lignes: string[] = []
		const issue = await importALaDemande(await payloadDeTest(), env({ mode: 'reel' }), { journal: l => lignes.push(l) })

		expect(issue.etat).toBe('refuse')
		expect(await nombres()).toEqual(VIDE)
	})

	test('la base de Payload comme source est refusée avant toute lecture', async () => {
		const payload = await payloadDeTest()
		const lignes: string[] = []

		const issue = await importALaDemande(
			payload,
			{ ...env({ mode: 'reel' }), sourceStrapi: serverEnv().databaseUri },
			{
				lieu: 'site',
				journal: l => lignes.push(l),
			}
		)

		expect(issue.etat).toBe('refuse')
		expect(lignes.join('\n')).toContain('désigne la base de Payload')
		expect(await nombres()).toEqual(VIDE)
	})

	test('sans stockage des photos, le passage est refusé : aucune photo ne serait adoptée', async () => {
		const lignes: string[] = []

		const issue = await importALaDemande(await payloadDeTest(), env({ mode: 'reel' }, { storage: undefined }), {
			lieu: 'site',
			journal: l => lignes.push(l),
		})

		expect(issue.etat).toBe('refuse')
		expect(lignes.join('\n')).toContain('stockage des photos')
		expect(await nombres()).toEqual(VIDE)
	})

	test('une table de décision illisible refuse le passage sans écrire le jeton', async () => {
		const jeton = nouveauJeton()

		const mauvais = await passer({ jeton, mode: 'reel', decisions: '{"emailsPartages": 3}' })
		expect(mauvais.issue.etat).toBe('refuse')

		expect((await passer({ jeton, mode: 'a-blanc' })).issue.etat).toBe('termine')
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

		const issue = await importALaDemande(
			await payloadDeTest(),
			env({ jeton: nouveauJeton(), mode: 'a-blanc' }, { sourceStrapi: injoignable }),
			{
				lieu: 'site',
				referentiel: referentielDuBanc(),
				baseDesMedias: sourceDuBanc().medias,
				journal: l => lignes.push(l),
			}
		)

		const journal = lignes.join('\n')
		expect(issue.etat).toBe('refuse')
		expect(journal).toContain('Passage refusé ou arrêté')
		for (const interdit of ['@', 'mot-de-passe-factice', 'hote-inconnu', 'lecture_strapi'])
			expect(journal).not.toContain(interdit)
		expect(await nombres()).toEqual(VIDE)
	})
})
