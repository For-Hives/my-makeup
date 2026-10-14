import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { commandeDImport, FICHIER_DES_DECISIONS_DU_BANC, importerSurLeBanc } from '../outils/import'
import { viderLeCapteur } from '../outils/mailpit'
import { viderLaBase } from '../outils/payload-test'
import { creerLaSourceStrapi, effacerLaSourceStrapi, sourceDuBanc } from '../outils/source-strapi'

/**
 * Ticket 067: the check of the parity (`--controle`). A dry run that says whether the target is the
 * source, and exits 4 as soon as it is not: an account removed by hand, an email changed by hand, a
 * document the source does not give. The runs of the import itself are in the other import tests.
 */

const source = sourceDuBanc()

/** The command of the check, against the bench, with the table of decisions of the bench. */
const controler = (...options: string[]) =>
	commandeDImport(['--controle', '--decisions', FICHIER_DES_DECISIONS_DU_BANC, ...options])

/** A write by the owner of the bench database, as a person with access to it would make. */
async function ecrireDansLaCible(requete: string): Promise<void> {
	const sql = new SQL({ url: source.maintenance, max: 1 })
	try {
		await sql.unsafe(requete)
	} finally {
		await sql.close()
	}
}

/** How many accounts the target holds. */
async function comptesDeLaCible(): Promise<number> {
	const sql = new SQL({ url: source.maintenance, max: 1 })
	try {
		const [ligne] = await sql.unsafe('SELECT count(*)::int AS n FROM pros')
		return ligne.n
	} finally {
		await sql.close()
	}
}

/** How many main photos and photo links the profiles of the target hold, and how many media documents. */
async function photosDeLaCible(): Promise<{ principales: number; liens: number; medias: number }> {
	const sql = new SQL({ url: source.maintenance, max: 1 })
	try {
		const [ligne] = await sql.unsafe(
			'SELECT (SELECT count(*)::int FROM profils WHERE photo_principale_id IS NOT NULL) AS principales, (SELECT count(*)::int FROM profils_rels WHERE media_id IS NOT NULL) AS liens, (SELECT count(*)::int FROM media) AS medias'
		)
		return ligne
	} finally {
		await sql.close()
	}
}

beforeEach(async () => {
	await viderLaBase()
	await viderLeCapteur()
	await creerLaSourceStrapi()
})

afterAll(async () => {
	await viderLaBase()
	await effacerLaSourceStrapi()
})

describe('le contrôle de la parité (I39, I40, I43)', () => {
	test('une cible vide n’est pas la source : tout est à créer, et le contrôle n’écrit rien', async () => {
		const { code, sortie } = await controler()

		expect(code, sortie).toBe(4)
		expect(sortie).toContain('Contrôle : la cible n’est PAS la source.')
		expect(sortie).toMatch(/Comptes : [1-9]\d* créations? à faire/)
		expect(await comptesDeLaCible()).toBe(0)
	}, 60_000)

	test('après un import réel, la cible est la source : code 0, et un second contrôle dit la même chose', async () => {
		await importerSurLeBanc()

		for (const _passage of [1, 2]) {
			const { code, sortie } = await controler()
			expect(code, sortie).toBe(0)
			expect(sortie).toContain('Contrôle : la cible est la source (0 création, 0 mise à jour, 0 document en trop).')
		}
	}, 60_000)

	test('un email changé à la main dans la cible fait échouer le contrôle, sans que le rapport le montre', async () => {
		await importerSurLeBanc()
		await ecrireDansLaCible("UPDATE pros SET email = 'modifie-a-la-main@example.test' WHERE strapi_id = 8")

		const { code, sortie } = await controler()

		expect(code, sortie).toBe(4)
		expect(sortie).toContain('Comptes : 0 création à faire, 1 mise à jour à faire, 0 document en trop')
		expect(sortie).not.toContain('modifie-a-la-main')
	}, 60_000)

	test('un compte retiré à la main de la cible fait échouer le contrôle', async () => {
		await importerSurLeBanc()
		// Account 8 has no profile: removing it leaves nothing else behind.
		await ecrireDansLaCible('DELETE FROM pros WHERE strapi_id = 8')

		const { code, sortie } = await controler()

		expect(code, sortie).toBe(4)
		expect(sortie).toContain('Comptes : 1 création à faire, 0 mise à jour à faire, 0 document en trop')
	}, 60_000)

	test('une commande qui demande à la fois d’écrire et de contrôler n’est pas comprise, et n’écrit rien', async () => {
		const { code, sortie } = await controler('--reel')

		expect(code).toBe(2)
		expect(sortie).toContain('Usage')
		expect(await comptesDeLaCible()).toBe(0)
	}, 60_000)

	test('--sans-photos avec --reel est refusé sur une cible qui garde des médias : rien n’est retiré', async () => {
		await importerSurLeBanc()
		const avant = await photosDeLaCible()
		expect(avant.principales).toBeGreaterThan(0)
		expect(avant.medias).toBeGreaterThan(0)

		const { code, sortie } = await commandeDImport([
			'--reel',
			'--sans-photos',
			'--decisions',
			FICHIER_DES_DECISIONS_DU_BANC,
		])

		expect(code, sortie).toBe(1)
		expect(sortie).toContain('--sans-photos ne va pas avec --reel ni avec --controle')
		expect(await photosDeLaCible()).toEqual(avant)
	}, 60_000)

	test('--sans-photos avec --controle est refusé sur une cible qui garde des médias, au lieu d’un faux écart', async () => {
		await importerSurLeBanc()

		const { code, sortie } = await controler('--sans-photos')

		expect(code, sortie).toBe(1)
		expect(sortie).toContain('--sans-photos ne va pas avec --reel ni avec --controle')
	}, 60_000)

	test('un compte ajouté à la main, sans identifiant de l’ancien site, fait échouer le contrôle', async () => {
		await importerSurLeBanc()
		await ecrireDansLaCible("INSERT INTO pros (email) VALUES ('ajoute-a-la-main@example.test')")

		const { code, sortie } = await controler()

		expect(code, sortie).toBe(4)
		expect(sortie).toContain(
			'Comptes : 0 création à faire, 0 mise à jour à faire, 0 document en trop, 1 document sans origine'
		)
		expect(sortie).not.toContain('ajoute-a-la-main')
	}, 60_000)

	test('un profil ajouté à la main fait échouer le contrôle', async () => {
		await importerSurLeBanc()
		await ecrireDansLaCible(
			"INSERT INTO profils (pro_id, slug) SELECT id, 'ajoute-a-la-main' FROM pros WHERE strapi_id = 8"
		)

		const { code, sortie } = await controler()

		expect(code, sortie).toBe(4)
		expect(sortie).toMatch(/Profils : .* 1 document sans origine/)
	}, 60_000)

	test.each([
		['articles', 'Articles'],
		['talents', 'Talents'],
	])('un document de %s ajouté à la main fait échouer le contrôle, et la parité ne se dit pas complète', async (table, nom) => {
		await importerSurLeBanc()
		await ecrireDansLaCible(`INSERT INTO ${table} (slug, title) VALUES ('ajoute-a-la-main', 'x')`)

		const { code, sortie } = await controler()
		expect(code, sortie).toBe(4)
		expect(sortie).toMatch(new RegExp(`${nom} : .* 1 document sans origine`))

		const reel = await commandeDImport(['--reel', '--decisions', FICHIER_DES_DECISIONS_DU_BANC])
		const ligne = reel.sortie.split('\n').find(l => l.startsWith(`${nom} : `) && l.includes('égaux'))
		expect(ligne, reel.sortie).toContain('parité incomplète')
		expect(ligne).not.toContain('parité complète')
	}, 90_000)
})
