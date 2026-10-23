import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SQL } from 'bun'
import { currentBench, eraseSchema } from '../../scripts/bench'
import { BENCH_DATABASE_USER, inContainer } from '../../scripts/migration/rehearsal/engine'
import { migrations } from '../../src/migrations'
import { BENCH_CUTOVER_DATE, ROOT } from '../support/bench'
import { runMigrations } from '../support/bench-schema'
import { BENCH_DECISION_FILE, BENCH_REFERENCE_FILE } from '../support/import'
import { emptyBase, testPayload } from '../support/payload-test'
import { benchSource, createSourceStrapi, eraseSourceStrapi } from '../support/source-strapi'

/**
 * Ticket 180: the full rehearsal in one command, on a backup made from the fake source. The
 * backup is a `pg_dump` custom-format file, as the nightly one is; it is restored offline into the
 * source slot of the bench, imported twice, judged, and destroyed. Every value here is fictional.
 */

const bench = currentBench()
const source = benchSource()

let directory = ''
let dump = ''

/** The rehearsal as a person runs it, against this bench, which stays up (it is the test bench). */
async function rehearse(...options: string[]): Promise<{ code: number; output: string }> {
	const child = Bun.spawn(
		[process.execPath, '--no-env-file', 'scripts/migration/rehearsal.ts', '--keep-bench', ...options],
		{ cwd: ROOT, env: { ...process.env }, stdout: 'pipe', stderr: 'pipe' }
	)
	const [code, output, errors] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	return { code, output: output + errors }
}

const common = (out: string, decisions = BENCH_DECISION_FILE) => [
	'--dump',
	dump,
	'--decisions',
	decisions,
	'--cities',
	BENCH_REFERENCE_FILE,
	'--consent-date',
	BENCH_CUTOVER_DATE,
	'--out',
	out,
]

/** What the server still holds of the source slot: its database, then its role. */
async function slotLeft(): Promise<{ bases: number; roles: number }> {
	const sql = new SQL({ url: source.maintenance, max: 1 })
	try {
		const bases = await sql.unsafe('SELECT 1 FROM pg_database WHERE datname = $1', [source.base])
		const roles = await sql.unsafe('SELECT 1 FROM pg_roles WHERE rolname = $1', [source.role])
		return { bases: bases.length, roles: roles.length }
	} finally {
		await sql.close()
	}
}

beforeAll(async () => {
	directory = mkdtempSync(path.join(tmpdir(), 'repetition-'))
	dump = path.join(directory, 'nuit.dump')
	await createSourceStrapi()
	// The backup, taken from the fake source by the pg_dump of the bench container.
	const { command, env } = await inContainer(bench.instance, bench.services, [
		'pg_dump',
		'--format=custom',
		'--username',
		BENCH_DATABASE_USER,
		source.base,
	])
	const child = Bun.spawn(command, {
		cwd: ROOT,
		env: { ...process.env, ...env },
		stdout: Bun.file(dump),
		stderr: 'pipe',
	})
	expect(await child.exited).toBe(0)
}, 60_000)

afterAll(async () => {
	// The rehearsal rebuilds then destroys the target, which is this bench's own database: put the
	// schema of the migrations back, empty, for the files that follow.
	await eraseSchema(bench)
	await runMigrations(await testPayload(), migrations, 'test')
	await emptyBase()
	await eraseSourceStrapi()
	rmSync(directory, { recursive: true, force: true })
})

describe('la répétition complète en une commande (ticket 180)', () => {
	test('de la sauvegarde au rapport : parité, second passage à zéro, rapport sans donnée personnelle, copie détruite', async () => {
		const out = path.join(directory, 'complete')
		const before = await Bun.file(dump).arrayBuffer()
		const { code, output } = await rehearse(...common(out))

		expect(output).toContain('Total ')
		expect(code).toBe(0)
		const report = JSON.parse(readFileSync(path.join(out, 'rapport.json'), 'utf8'))
		expect(report.criteria.map((c: { id: string }) => c.id).sort()).toEqual([
			'destroyed',
			'parity',
			'personal-data',
			'second-pass',
			'source',
			'spam',
			'time',
		])
		for (const criterion of report.criteria) expect(criterion).toMatchObject({ met: true })
		// A duration for each step, and a total under the two hours.
		expect(report.steps.map((s: { name: string }) => s.name)).toEqual([
			'Empreinte de la sauvegarde',
			'Banc de test',
			'Cible vide, par les migrations',
			'Restauration hors réseau',
			'Instantané de la copie',
			'Import, premier passage',
			'Import, second passage',
			'Parité',
			'Destruction de la copie',
		])
		expect(report.totalSeconds).toBeLessThan(7200)
		// Second pass: nothing created, nothing updated, in every collection.
		for (const collection of Object.values(report.passes.second) as { created: number; updated: number }[])
			expect(collection).toMatchObject({ created: 0, updated: 0 })
		expect(report.snapshot.up_users).toBeGreaterThan(0)
		expect(report.snapshot.pg_largeobject_metadata).toBe(0)

		// No email, no hash in any file the run left; the backup is the same bytes; the copy is gone.
		for (const file of readdirSync(out).filter(name => name !== 'pg-restore.log')) {
			const text = readFileSync(path.join(out, file), 'utf8')
			expect(text).not.toContain('@')
			expect(text).not.toMatch(/\$2[abxy]\$/)
		}
		expect(Buffer.from(await Bun.file(dump).arrayBuffer()).equals(Buffer.from(before))).toBe(true)
		expect(await slotLeft()).toEqual({ bases: 0, roles: 0 })
		const target = new SQL({ url: source.maintenance, max: 1 })
		try {
			expect((await target.unsafe("SELECT 1 FROM pg_tables WHERE schemaname = 'public'")).length).toBe(0)
		} finally {
			await target.close()
		}
	}, 180_000)

	test('sans table de décision, le passage s’arrête (code 3) et la copie est détruite tout de même', async () => {
		const empty = path.join(directory, 'sans-decision.json')
		writeFileSync(empty, '{}')
		const out = path.join(directory, 'arret')
		const { code } = await rehearse(...common(out, empty))

		expect(code).toBe(3)
		const report = JSON.parse(readFileSync(path.join(out, 'rapport.json'), 'utf8'))
		expect(report.failure).toContain('code 3')
		expect(report.criteria.find((c: { id: string }) => c.id === 'destroyed')).toMatchObject({ met: true })
		expect(await slotLeft()).toEqual({ bases: 0, roles: 0 })
	}, 180_000)

	test('sans le fichier des communes, rien n’est répété et rien n’est créé', async () => {
		const out = path.join(directory, 'refus')
		const options = common(out)
		options[options.indexOf('--cities') + 1] = path.join(directory, 'absent.json')
		const { code, output } = await rehearse(...options)

		expect(code).toBe(1)
		expect(output).toContain('--cities')
		expect(existsSync(path.join(out, 'rapport.json'))).toBe(false)
		expect(await slotLeft()).toEqual({ bases: 0, roles: 0 })
	}, 60_000)

	test('une sauvegarde absente est refusée avant toute chose', async () => {
		const { code, output } = await rehearse(
			...common(path.join(directory, 'rien')).map(a => (a === dump ? 'absente.dump' : a))
		)

		expect(code).toBe(1)
		expect(output).toContain('--dump')
	}, 60_000)
})
