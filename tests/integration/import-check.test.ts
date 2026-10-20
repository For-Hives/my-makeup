import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { BENCH_DECISION_FILE, importCommand, importOnBench } from '../support/import'
import { emptySink } from '../support/mailpit'
import { emptyBase } from '../support/payload-test'
import { benchSource, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'

/**
 * Ticket 067: the check of the parity (`--check`). A dry run that says whether the target is the
 * source, and exits 4 as soon as it is not: an account removed by hand, an email changed by hand, a
 * document the source does not give. The runs of the import itself are in the other import tests.
 */

const source = benchSource()

/** The command of the check, against the bench, with the table of decisions of the bench. */
const check = (...options: string[]) => importCommand(['--check', '--decisions', BENCH_DECISION_FILE, ...options])

/** A write by the owner of the bench database, as a person with access to it would make. */
async function writeInTarget(requete: string): Promise<void> {
	const sql = new SQL({ url: source.maintenance, max: 1 })
	try {
		await sql.unsafe(requete)
	} finally {
		await sql.close()
	}
}

/** How many accounts the target holds. */
async function targetAccounts(): Promise<number> {
	const sql = new SQL({ url: source.maintenance, max: 1 })
	try {
		const [line] = await sql.unsafe('SELECT count(*)::int AS n FROM pros')
		return line.n
	} finally {
		await sql.close()
	}
}

/** How many main photos and photo links the profiles of the target hold, and how many media documents. */
async function targetPhotos(): Promise<{ principales: number; liens: number; medias: number }> {
	const sql = new SQL({ url: source.maintenance, max: 1 })
	try {
		const [line] = await sql.unsafe(
			'SELECT (SELECT count(*)::int FROM profiles WHERE main_picture_id IS NOT NULL) AS principales, (SELECT count(*)::int FROM profiles_rels WHERE media_id IS NOT NULL) AS liens, (SELECT count(*)::int FROM media) AS medias'
		)
		return line
	} finally {
		await sql.close()
	}
}

beforeEach(async () => {
	await emptyBase()
	await emptySink()
	await createSourceStrapi()
})

afterAll(async () => {
	await emptyBase()
	await eraseSourceStrapi()
})

describe('le contrôle de la parité (I39, I40, I43)', () => {
	test('une cible vide n’est pas la source : tout est à créer, et le contrôle n’écrit rien', async () => {
		const { code, sortie: output } = await check()

		expect(code, output).toBe(4)
		expect(output).toContain('Contrôle : la cible n’est PAS la source.')
		expect(output).toMatch(/Comptes : [1-9]\d* créations? à faire/)
		expect(await targetAccounts()).toBe(0)
	}, 60_000)

	test('après un import réel, la cible est la source : code 0, et un second contrôle dit la même chose', async () => {
		await importOnBench()

		for (const _pass of [1, 2]) {
			const { code, sortie: output } = await check()
			expect(code, output).toBe(0)
			expect(output).toContain('Contrôle : la cible est la source (0 création, 0 mise à jour, 0 document en trop).')
		}
	}, 60_000)

	test('un email changé à la main dans la cible fait échouer le contrôle, sans que le rapport le montre', async () => {
		await importOnBench()
		await writeInTarget("UPDATE pros SET email = 'modifie-a-la-main@example.test' WHERE strapi_id = 8")

		const { code, sortie: output } = await check()

		expect(code, output).toBe(4)
		expect(output).toContain('Comptes : 0 création à faire, 1 mise à jour à faire, 0 document en trop')
		expect(output).not.toContain('modifie-a-la-main')
	}, 60_000)

	test('un compte retiré à la main de la cible fait échouer le contrôle', async () => {
		await importOnBench()
		// Account 8 has no profile: removing it leaves nothing else behind.
		await writeInTarget('DELETE FROM pros WHERE strapi_id = 8')

		const { code, sortie: output } = await check()

		expect(code, output).toBe(4)
		expect(output).toContain('Comptes : 1 création à faire, 0 mise à jour à faire, 0 document en trop')
	}, 60_000)

	test('une commande qui demande à la fois d’écrire et de contrôler n’est pas comprise, et n’écrit rien', async () => {
		const { code, sortie: output } = await check('--real')

		expect(code).toBe(2)
		expect(output).toContain('Usage')
		expect(await targetAccounts()).toBe(0)
	}, 60_000)

	test('--without-photos avec --real est refusé sur une cible qui garde des médias : rien n’est retiré', async () => {
		await importOnBench()
		const before = await targetPhotos()
		expect(before.principales).toBeGreaterThan(0)
		expect(before.medias).toBeGreaterThan(0)

		const { code, sortie: output } = await importCommand([
			'--real',
			'--without-photos',
			'--decisions',
			BENCH_DECISION_FILE,
		])

		expect(code, output).toBe(1)
		expect(output).toContain('--without-photos ne va pas avec --real sur une cible')
		expect(await targetPhotos()).toEqual(before)
	}, 60_000)

	test('--without-photos avec --check est refusé, même sur une cible sans média : pas de faux vert', async () => {
		const { code, sortie: output } = await check('--without-photos')

		expect(code, output).toBe(1)
		expect(output).toContain('--without-photos ne va pas avec --check')
		expect(output).not.toContain('la cible est la source')
	}, 60_000)

	test('un compte ajouté à la main, sans identifiant de l’ancien site, fait échouer le contrôle', async () => {
		await importOnBench()
		await writeInTarget("INSERT INTO pros (email) VALUES ('ajoute-a-la-main@example.test')")

		const { code, sortie: output } = await check()

		expect(code, output).toBe(4)
		expect(output).toContain(
			'Comptes : 0 création à faire, 0 mise à jour à faire, 0 document en trop, 1 document sans origine'
		)
		expect(output).not.toContain('ajoute-a-la-main')
	}, 60_000)

	test('un profil ajouté à la main fait échouer le contrôle', async () => {
		await importOnBench()
		await writeInTarget(
			"INSERT INTO profiles (pro_id, slug) SELECT id, 'ajoute-a-la-main' FROM pros WHERE strapi_id = 8"
		)

		const { code, sortie: output } = await check()

		expect(code, output).toBe(4)
		expect(output).toMatch(/Profils : .* 1 document sans origine/)
	}, 60_000)

	test.each([
		['articles', 'Articles'],
		['talents', 'Talents'],
	])(
		'un document de %s ajouté à la main fait échouer le contrôle, et la parité ne se dit pas complète',
		async (table, nom) => {
			await importOnBench()
			await writeInTarget(`INSERT INTO ${table} (slug, title) VALUES ('ajoute-a-la-main', 'x')`)

			const { code, sortie: output } = await check()
			expect(code, output).toBe(4)
			expect(output).toMatch(new RegExp(`${nom} : .* 1 document sans origine`))

			const real = await importCommand(['--real', '--decisions', BENCH_DECISION_FILE])
			const line = real.sortie.split('\n').find(l => l.startsWith(`${nom} : `) && l.includes('égaux'))
			expect(line, real.sortie).toContain('parité incomplète')
			expect(line).not.toContain('parité complète')
		},
		90_000
	)
})
