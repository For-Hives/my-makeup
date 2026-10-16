import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Ticket 157: the probes run every Monday at 07:00 (.github/workflows/sondes.yml) and a falsified
 * probe fails the run. The workflow is read as a file; the failure is played by the real command
 * against a site on this machine that answers wrongly. Nothing leaves this machine.
 */

const RACINE = path.resolve(import.meta.dir, '../..')
const FICHIER = '.github/workflows/sondes.yml'
const texte = readFileSync(path.join(RACINE, FICHIER), 'utf8')
const workflow = Bun.YAML.parse(texte) as {
	on: { schedule: { cron: string; timezone?: string }[]; workflow_dispatch: unknown }
	permissions: Record<string, string>
	jobs: Record<string, { steps: { run?: string; uses?: string }[] }>
}
/** The workflow without its comments, to look for what it does and not for what it says. */
const sansCommentaires = texte
	.split('\n')
	.filter(ligne => !ligne.trimStart().startsWith('#'))
	.join('\n')

describe('the workflow of the Monday probes', () => {
	test('it runs every Monday at 07:00, Paris time, and can be started by hand', () => {
		expect(workflow.on.schedule).toEqual([{ cron: '0 7 * * 1', timezone: 'Europe/Paris' }])
		expect(workflow.on.workflow_dispatch).toBeDefined()
	})

	test('it reads nothing secret, writes nothing, and takes no input that could change the target', () => {
		expect(sansCommentaires).not.toMatch(/secrets\./)
		expect(sansCommentaires).not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs)/)
		expect(sansCommentaires).not.toMatch(/SONDES_|STATS_TOKEN/)
		expect(workflow.permissions).toEqual({ contents: 'read' })
	})

	test('a red probe fails the run: no step tolerates a failure and the exit code survives the summary', () => {
		expect(sansCommentaires).not.toMatch(/continue-on-error|\|\|\s*(true|:)|set \+e/)
		expect(sansCommentaires).toMatch(/^\s+shell: bash$/m)
		const lancement = Object.values(workflow.jobs)
			.flatMap(({ steps }) => steps)
			.find(({ run }) => run?.includes('bun run sondes'))
		expect(lancement?.run).toContain('tee -a "$GITHUB_STEP_SUMMARY"')
	})

	test('its report goes to the summary of the run', () => {
		expect(sansCommentaires).toContain('>> "$GITHUB_STEP_SUMMARY"')
	})
})

describe('a probe falsified on purpose fails the command the workflow runs', () => {
	test('a site that answers wrongly: red probes, exit code 1', async () => {
		const faux = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('panne', { status: 500 }) })
		try {
			const processus = Bun.spawn(['bun', '--no-env-file', 'tests/sondes/sondes.ts'], {
				cwd: RACINE,
				env: { PATH: process.env.PATH ?? '', SONDES_CIBLE: `http://127.0.0.1:${faux.port}` },
				stdout: 'pipe',
				stderr: 'pipe',
			})
			const [sortie, code] = await Promise.all([new Response(processus.stdout).text(), processus.exited])
			expect(code).toBe(1)
			expect(sortie).toMatch(/R03 ROUGE/)
			expect(sortie).toContain('Au moins une sonde est rouge')
		} finally {
			await faux.stop(true)
		}
	}, 60_000)
})
