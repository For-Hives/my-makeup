/**
 * `bun run rehearsal`: the full rehearsal of the migration on this machine, in one command
 * (docs/migration/IMPORT.md, « La répétition complète », ticket 180).
 *
 *   bun run rehearsal --dump <backup.dump> --decisions <decisions.json> --cities <cities.json> --consent-date <date>
 *
 * From the backup of the night to a timed report: the backup is hashed, a bench of its own is
 * started, the sixteen tables the import reads are restored offline into the source slot of the
 * bench under a read-only role, the snapshot of the copy is taken, the import runs for real, then a
 * second time, the parity is judged against the snapshot, and the copy is destroyed. The command
 * reaches no network but the referential of the communes, and only with `--cities-online`.
 *
 * Exit codes: 0 every criterion met; 1 refused or failed (the copy is destroyed all the same);
 * 2 command line not understood; 3 the import stopped on cases only a decision settles; 4 the run
 * finished and a criterion is not met (the report says which).
 *
 * What it prints and writes holds numbers, durations, identifiers of the old base and
 * fingerprints only: no name, no email, no hash. It scans its own files for an `@` and a bcrypt
 * hash before it lets them stand.
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SQL } from 'bun'
import { RefusedBench, ROOT } from '../../tests/support/bench'
import { benchSource, type SourceStrapi } from '../../tests/support/source-strapi'
import { eraseBase, grantReadOnly, prepareBase, type Run } from '../../tests/support/source-strapi/creation'
import { identifier, TABLE_NAMES, TABLES } from '../../tests/support/source-strapi/schema'
import { currentBench, eraseSchema, requireRunningBench } from '../bench'
import { SPAM_PROFILES } from './import/profiles'
import type { Report } from './import/report'
import { type Query, type TablesFingerprint, tablesFingerprint } from './import/source'
import { BENCH_DATABASE_USER, inContainer } from './rehearsal/engine'
import {
	type Criterion,
	findPersonalData,
	formatDuration,
	judgeRun,
	pgRestoreArguments,
	REHEARSAL_INSTANCE,
	REHEARSAL_OFFSET,
	type RehearsalOptions,
	readRehearsalArguments,
	remainingMs,
	type Step,
	snapshotRows,
	totalMs,
	USAGE,
} from './rehearsal/logic'

/** A step that failed, with the exit code the command ends on. */
class StepFailed extends Error {
	constructor(
		message: string,
		readonly code: 1 | 3 = 1
	) {
		super(message)
	}
}

/** The variables that must not reach a child process: it works on the bench and on nothing else. */
const NOT_FOR_CHILDREN = /^(DATABASE_URI|STRAPI_SOURCE_URI|S3_|R2_|SMTP_|PAYLOAD_|GOOGLE_|IMPORT_|COOLIFY|CLOUDFLARE)/

function childEnvironment(extra: Record<string, string> = {}): Record<string, string> {
	const env: Record<string, string> = {}
	for (const [name, value] of Object.entries(process.env))
		if (value !== undefined && !NOT_FOR_CHILDREN.test(name)) env[name] = value
	return { ...env, ...extra }
}

const runWith =
	(sql: Pick<SQL, 'unsafe'>): Run =>
	async (text, parameters) =>
		parameters === undefined ? [...(await sql.unsafe(text))] : [...(await sql.unsafe(text, [...parameters]))]

async function withSql<T>(url: string, work: (sql: SQL) => Promise<T>): Promise<T> {
	const sql = new SQL({ url, max: 1 })
	try {
		return await work(sql)
	} finally {
		await sql.close()
	}
}

async function sha256File(file: string): Promise<string> {
	const hash = createHash('sha256')
	for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
	return hash.digest('hex')
}

/** The child processes alive, so a signal stops them before the copy is destroyed. */
const children = new Set<ReturnType<typeof Bun.spawn>>()

interface Finished {
	code: number
	stdout: string
	stderr: string
}

/** Runs a command, waits for it within the budget, and keeps its output out of the terminal. */
async function runChild(
	command: string[],
	options: { env: Record<string, string>; timeoutMs: number; log: string; stdin?: Blob }
): Promise<Finished> {
	const child = Bun.spawn(command, {
		cwd: ROOT,
		env: options.env,
		stdout: 'pipe',
		stderr: 'pipe',
		stdin: options.stdin ?? 'ignore',
		timeout: options.timeoutMs,
		killSignal: 'SIGKILL',
	})
	children.add(child)
	try {
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout as ReadableStream).text(),
			new Response(child.stderr as ReadableStream).text(),
			child.exited,
		])
		writeFileSync(options.log, `${stdout}${stderr ? `\n--- stderr ---\n${stderr}` : ''}`, { mode: 0o600 })
		return { code, stdout, stderr }
	} finally {
		children.delete(child)
	}
}

/** The columns a backup older than the code lacks, and that the import can read empty. */
const ADDABLE_COLUMNS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	files: { uploaded_by: 'integer' },
}

/** Restores the tables, adds the known missing column, and locks the source to its read-only role. */
async function restoreCopy(
	bench: ReturnType<typeof currentBench>,
	source: SourceStrapi,
	options: RehearsalOptions,
	log: string
): Promise<string[]> {
	const password = decodeURIComponent(new URL(source.lecture).password)
	await withSql(source.maintenance, sql =>
		prepareBase(runWith(sql), { base: source.base, role: source.role, motDePasse: password })
	)
	const { command, env } = await inContainer(
		bench.instance,
		bench.services,
		pgRestoreArguments({ user: BENCH_DATABASE_USER, database: source.base })
	)
	const restore = await runChild(command, {
		env: childEnvironment(env),
		timeoutMs: 60 * 60_000,
		log,
		stdin: Bun.file(path.resolve(options.dump)),
	})
	// pg_restore may name a value in its errors: they stay in the private log, never in the terminal.
	if (restore.code !== 0)
		throw new StepFailed(
			`pg_restore a échoué (code ${restore.code}) ; son message est dans ${path.relative(ROOT, log)}, il peut citer une valeur : ne le recopie pas.`
		)
	const added: string[] = []
	await withSql(source.administration, async sql => {
		await sql.begin(async transaction => {
			const run = runWith(transaction)
			for (const table of TABLE_NAMES) {
				const present = new Set(
					(
						(await run(
							'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
							['public', table]
						)) as { column_name: string }[]
					).map(row => row.column_name)
				)
				if (present.size === 0)
					throw new StepFailed(`La sauvegarde ne contient pas la table ${table} : rien n’est répété.`)
				for (const column of TABLES[table].filter(c => !present.has(c.nom))) {
					const type = ADDABLE_COLUMNS[table]?.[column.nom]
					if (!type)
						throw new StepFailed(
							`La sauvegarde n’a pas la colonne ${table}.${column.nom}, et la répétition ne sait pas la lire vide : rien n’est répété.`
						)
					await run(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column.nom)} ${type}`)
					added.push(`${table}.${column.nom}`)
				}
			}
			await grantReadOnly(run, source.role)
		})
	})
	return added
}

/** The fingerprint of the copy, read by its read-only role: rows and SHA-256 per table, large objects included. */
async function snapshotOf(source: SourceStrapi): Promise<TablesFingerprint> {
	return withSql(source.lecture, sql => {
		const query: Query = async (text, parameters) =>
			[...(await sql.unsafe(text, parameters ? [...parameters] : []))] as never
		return tablesFingerprint(query)
	})
}

function readReport(file: string): Report {
	return JSON.parse(readFileSync(file, 'utf8')) as Report
}

/** What the target holds of the profiles of the spam list. */
async function spamInTarget(source: SourceStrapi): Promise<number> {
	const ids = SPAM_PROFILES.filter(id => Number.isInteger(id)).join(', ')
	return withSql(source.maintenance, async sql => {
		const [row] = (await sql.unsafe(`SELECT count(*)::int AS n FROM profiles WHERE strapi_id IN (${ids})`)) as {
			n: number
		}[]
		return row?.n ?? -1
	})
}

interface Destruction {
	copyDropped: boolean
	targetEmptied: boolean
	benchStopped: boolean | 'laissé'
	problems: string[]
}

/** Drops the copy and its role, empties the target, stops the bench we started; then asks the server whether any is left. */
async function destroy(
	bench: ReturnType<typeof currentBench>,
	source: SourceStrapi,
	startedBench: boolean,
	options: RehearsalOptions,
	env: Record<string, string>,
	logs: string
): Promise<Destruction> {
	const result: Destruction = { copyDropped: false, targetEmptied: false, benchStopped: 'laissé', problems: [] }
	try {
		await withSql(source.maintenance, sql => eraseBase(runWith(sql), { base: source.base, role: source.role }))
		await eraseSchema(bench)
		const left = await withSql(source.maintenance, async sql => {
			const run = runWith(sql)
			const bases = await run('SELECT 1 FROM pg_database WHERE datname = $1', [source.base])
			const roles = await run('SELECT 1 FROM pg_roles WHERE rolname = $1', [source.role])
			const tables = await withSql(bench.services.base.adresse, other =>
				other.unsafe("SELECT 1 FROM pg_tables WHERE schemaname = 'public'")
			)
			return { copy: bases.length + roles.length, target: tables.length }
		})
		result.copyDropped = left.copy === 0
		result.targetEmptied = left.target === 0
		if (!result.copyDropped) result.problems.push('la copie ou son rôle existe encore')
		if (!result.targetEmptied) result.problems.push('la cible garde des tables')
	} catch (error) {
		result.problems.push(
			`la destruction de la copie a échoué : ${error instanceof Error ? error.constructor.name : 'erreur'}`
		)
	}
	if (startedBench && !options.keepBench) {
		const down = await runChild([process.execPath, '--no-env-file', 'scripts/bench.ts', 'down'], {
			env,
			timeoutMs: 120_000,
			log: path.join(logs, 'bench-down.log'),
		})
		result.benchStopped = down.code === 0
		if (down.code !== 0) result.problems.push('le banc ne s’est pas arrêté')
	}
	return result
}

function writeReport(directory: string, report: Record<string, unknown>, text: string): { problems: string[] } {
	const files = [
		[path.join(directory, 'rapport.json'), `${JSON.stringify(report, null, '\t')}\n`],
		[path.join(directory, 'rapport.md'), text],
	] as const
	const problems: string[] = []
	for (const [file, content] of files) {
		writeFileSync(file, content, { mode: 0o600 })
		const kinds = findPersonalData(content)
		if (kinds.length > 0) {
			rmSync(file)
			problems.push(`${path.basename(file)} portait ${kinds.join(' et ')} : retiré`)
		}
	}
	return { problems }
}

/** Scans the files the import wrote (reports, review list, logs of the bench steps). The log of pg_restore is left out: it is private and may say why it failed. */
function scanImportFiles(directory: string, names: readonly string[]): string[] {
	const problems: string[] = []
	for (const name of names) {
		const file = path.join(directory, name)
		if (!existsSync(file)) continue
		const kinds = findPersonalData(readFileSync(file, 'utf8'))
		if (kinds.length > 0) problems.push(`${name} porte ${kinds.join(' et ')}`)
	}
	return problems
}

function markdown(report: {
	steps: Step[]
	total: number
	budgetMinutes: number
	criteria: Criterion[]
	dump: { bytes: number; sha256: string; unchanged: boolean | null }
	snapshot: Record<string, number>
	passes: Record<string, unknown>
	addedColumns: string[]
	failure: string | null
}): string {
	const labels: Record<Criterion['id'], string> = {
		time: 'De la sauvegarde au rapport, dans le temps permis',
		parity: 'Parité complète contre l’instantané du jour',
		spam: 'Les profils du spam exclus sont absents de la cible',
		'second-pass': 'Second passage : 0 création, 0 mise à jour',
		source: 'La copie n’a pas bougé pendant les passages',
		'personal-data': 'Rapport sans donnée personnelle',
		destroyed: 'Copie détruite',
	}
	return [
		'# Répétition de la migration',
		'',
		report.failure ? `**La répétition s’est arrêtée** : ${report.failure}` : '',
		`Durée totale : ${formatDuration(report.total)} pour ${report.budgetMinutes} min permises.`,
		'',
		'## Durée par étape',
		'',
		'| Étape | Durée |',
		'|---|---|',
		...report.steps.map(step => `| ${step.name} | ${formatDuration(step.ms)} |`),
		'',
		'## Critères',
		'',
		...report.criteria.map(c => `- ${c.met ? '[x]' : '[ ]'} ${labels[c.id]} : ${c.evidence}`),
		'',
		'## Sauvegarde',
		'',
		`${report.dump.bytes} octets, SHA-256 ${report.dump.sha256.slice(0, 16)}…, inchangée à la fin : ${report.dump.unchanged === null ? 'non vérifiée' : report.dump.unchanged ? 'oui' : 'NON'}.`,
		report.addedColumns.length > 0 ? `Colonnes ajoutées vides à la copie : ${report.addedColumns.join(', ')}.` : '',
		'',
		'## Instantané de la copie (lignes par table)',
		'',
		'| Table | Lignes |',
		'|---|---|',
		...Object.entries(report.snapshot).map(([table, rows]) => `| ${table} | ${rows} |`),
		'',
	]
		.filter((line, rank, lines) => line !== '' || lines[rank - 1] !== '')
		.join('\n')
}

async function main(args: string[]): Promise<number> {
	const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
	const options = readRehearsalArguments(args, timestamp)
	if (!options) {
		console.error(USAGE)
		return 2
	}
	process.env.BENCH_INSTANCE ||= REHEARSAL_INSTANCE
	process.env.BENCH_OFFSET ||= REHEARSAL_OFFSET
	const bench = currentBench()
	const variables = {
		...bench.environnement,
		BENCH_INSTANCE: bench.instance.nom,
		BENCH_OFFSET: String(bench.instance.decalage),
	}
	const source = benchSource(variables, bench.environnement)
	const env = childEnvironment({ BENCH_INSTANCE: bench.instance.nom, BENCH_OFFSET: String(bench.instance.decalage) })

	if (!existsSync(options.dump) || !statSync(options.dump).isFile())
		throw new RefusedBench('La sauvegarde donnée par --dump n’existe pas : rien n’est répété.')
	for (const [flag, file] of [['--decisions', options.decisions]] as const)
		if (!existsSync(file)) throw new RefusedBench(`Le fichier donné par ${flag} n’existe pas : rien n’est répété.`)
	if (!options.citiesOnline && !existsSync(options.cities))
		throw new RefusedBench(
			'Le fichier des réponses du référentiel (--cities) n’existe pas : rien n’est répété. Sans lui, la répétition ne sort pas sur Internet ; --cities-online le construit.'
		)
	const out = path.resolve(options.out)
	mkdirSync(out, { recursive: true, mode: 0o700 })
	const logs = out

	const steps: Step[] = []
	const timed = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
		const startedAt = performance.now()
		try {
			return await work()
		} finally {
			steps.push({ name, ms: performance.now() - startedAt })
			console.log(`- ${name} : ${formatDuration(steps[steps.length - 1]?.ms ?? 0)}`)
		}
	}
	const deadline = () => remainingMs(options.maxMinutes, steps)

	let startedBench = false
	let failure: StepFailed | null = null
	let dumpHash = ''
	let dumpUnchanged: boolean | null = null
	let snapshot: TablesFingerprint = {}
	let snapshotAfter: TablesFingerprint = {}
	let addedColumns: string[] = []
	let first: Report | null = null
	let second: Report | null = null
	let spam = -1
	const dumpBytes = statSync(options.dump).size

	let interrupted = false
	const interrupt = () => {
		interrupted = true
		for (const child of children) child.kill('SIGKILL')
	}
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, interrupt)

	const importCommand = (report: string, extra: string[]) => [
		process.execPath,
		'--no-env-file',
		'scripts/migration/bench-import.ts',
		'--real',
		'--without-photos',
		'--report',
		report,
		'--decisions',
		path.resolve(options.decisions),
		'--cities',
		path.resolve(options.cities),
		...(options.citiesOnline ? [] : ['--offline']),
		'--consent-date',
		options.consentDate,
		...extra,
	]
	const importPass = async (name: string, file: string, extra: string[]): Promise<Report> => {
		const done = await runChild(importCommand(path.join(out, file), extra), {
			env,
			timeoutMs: deadline(),
			log: path.join(out, `${file.replace('.json', '')}.log`),
		})
		if (done.code === 3)
			throw new StepFailed(`${name} : l’import s’arrête sur des cas que seule une décision tranche (code 3).`, 3)
		if (done.code !== 0)
			throw new StepFailed(`${name} : l’import sort en code ${done.code} (journal : ${file.replace('.json', '')}.log).`)
		return readReport(path.join(out, file))
	}

	console.log(`Répétition sur le banc « ${bench.instance.nom} » ; rapports dans ${path.relative(ROOT, out) || out}`)
	try {
		await timed('Empreinte de la sauvegarde', async () => {
			dumpHash = await sha256File(options.dump)
		})
		await timed('Banc de test', async () => {
			try {
				await requireRunningBench(bench)
			} catch (error) {
				if (!(error instanceof RefusedBench)) throw error
				const up = await runChild([process.execPath, '--no-env-file', 'scripts/bench.ts', 'up'], {
					env,
					timeoutMs: deadline(),
					log: path.join(logs, 'bench-up.log'),
				})
				if (up.code !== 0) throw new StepFailed('Le banc n’a pas démarré (journal : bench-up.log).')
				startedBench = true
			}
		})
		await timed('Cible vide, par les migrations', async () => {
			const done = await runChild([process.execPath, '--no-env-file', 'scripts/bench.ts', 'prepare'], {
				env,
				timeoutMs: deadline(),
				log: path.join(logs, 'bench-prepare.log'),
			})
			if (done.code !== 0) throw new StepFailed('La cible n’a pas été préparée (journal : bench-prepare.log).')
		})
		await timed('Restauration hors réseau', async () => {
			addedColumns = await restoreCopy(bench, source, options, path.join(logs, 'pg-restore.log'))
		})
		await timed('Instantané de la copie', async () => {
			snapshot = await snapshotOf(source)
		})
		first = await timed('Import, premier passage', () =>
			importPass('Premier passage', 'import-1.json', ['--review', path.join(out, 'villes-a-revoir.json')])
		)
		second = await timed('Import, second passage', () => importPass('Second passage', 'import-2.json', []))
		await timed('Parité', async () => {
			snapshotAfter = await snapshotOf(source)
			spam = await spamInTarget(source)
		})
	} catch (error) {
		// An unexpected error may carry a value (a query does): its stack stays in the private folder, never in the terminal.
		if (!(error instanceof StepFailed) && error instanceof Error)
			writeFileSync(path.join(out, 'erreur.log'), `${error.stack ?? error.message}\n`, { mode: 0o600 })
		failure =
			error instanceof StepFailed
				? error
				: new StepFailed(
						interrupted
							? 'interrompue'
							: `${error instanceof Error ? error.constructor.name : 'erreur'} : ${error instanceof RefusedBench ? error.message : 'voir erreur.log dans le dossier privé'}`
					)
	}

	// Whatever happened: the copy is destroyed, and the server is asked whether any is left.
	let destruction: Destruction = {
		copyDropped: false,
		targetEmptied: false,
		benchStopped: 'laissé',
		problems: ['pas tentée'],
	}
	const destroyStartedAt = performance.now()
	destruction = await destroy(bench, source, startedBench, options, env, logs)
	steps.push({ name: 'Destruction de la copie', ms: performance.now() - destroyStartedAt })
	console.log(`- Destruction de la copie : ${formatDuration(steps[steps.length - 1]?.ms ?? 0)}`)
	try {
		dumpUnchanged = (await sha256File(options.dump)) === dumpHash
	} catch {
		dumpUnchanged = false
	}

	const total = totalMs(steps)
	const criteria: Criterion[] = []
	criteria.push({
		id: 'time',
		met: total <= options.maxMinutes * 60_000,
		evidence: `${formatDuration(total)} pour ${options.maxMinutes} min permises`,
	})
	if (first && second) criteria.push(...judgeRun({ snapshot, snapshotAfter, first, second, spamInTarget: spam }))
	criteria.push({
		id: 'destroyed',
		met: destruction.problems.length === 0 && dumpUnchanged === true,
		evidence: `copie et rôle supprimés : ${destruction.copyDropped ? 'oui' : 'NON'} ; cible vidée : ${destruction.targetEmptied ? 'oui' : 'NON'} ; banc : ${destruction.benchStopped === 'laissé' ? 'laissé allumé' : destruction.benchStopped ? 'arrêté' : 'NON arrêté'} ; sauvegarde inchangée : ${dumpUnchanged ? 'oui' : 'NON'}`,
	})

	const summaries = (report: Report | null) =>
		report
			? Object.fromEntries(
					Object.entries(report.collections).map(([name, c]) => [
						name,
						{
							source: c.source,
							created: c.created,
							updated: c.updated,
							unchanged: c.unchanged,
							refused: c.refused.length,
						},
					])
				)
			: null
	const personal = scanImportFiles(out, [
		'import-1.json',
		'import-2.json',
		'villes-a-revoir.json',
		'import-1.log',
		'import-2.log',
	])
	const content = {
		generatedFor: bench.instance.nom,
		budgetMinutes: options.maxMinutes,
		steps: steps.map(step => ({ name: step.name, seconds: Math.round(step.ms) / 1000 })),
		totalSeconds: Math.round(total) / 1000,
		dump: { bytes: dumpBytes, sha256: dumpHash, unchanged: dumpHash === '' ? null : dumpUnchanged },
		snapshot: snapshotRows(snapshot),
		passes: { first: summaries(first), second: summaries(second) },
		addedColumns,
		criteria,
		failure: failure?.message ?? null,
	}
	const written = writeReport(out, content, markdown({ ...content, steps, total, passes: content.passes }))
	const dataProblems = [...personal, ...written.problems]
	criteria.push({
		id: 'personal-data',
		met: dataProblems.length === 0,
		evidence:
			dataProblems.length === 0
				? 'aucune adresse email ni hash dans le rapport ni dans les rapports de l’import'
				: dataProblems.join(' ; '),
	})
	// The last criterion is added once the files are scanned: the report is written again with it.
	writeReport(out, { ...content, criteria }, markdown({ ...content, criteria, steps, total, passes: content.passes }))

	console.log(
		[
			'',
			...criteria.map(c => `${c.met ? 'OK ' : 'KO '} ${c.id} : ${c.evidence}`),
			failure ? `Arrêt : ${failure.message}` : '',
			`Total ${formatDuration(total)} (permis : ${options.maxMinutes} min).`,
		]
			.filter(Boolean)
			.join('\n')
	)
	if (failure) return failure.code
	return criteria.every(c => c.met) ? 0 : 4
}

try {
	if (import.meta.main) process.exit(await main(process.argv.slice(2)))
} catch (error) {
	if (!(error instanceof RefusedBench)) throw error
	console.error(error.message)
	process.exit(1)
}
