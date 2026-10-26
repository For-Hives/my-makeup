import { describe, expect, test } from 'bun:test'
import {
	DEPLOYMENT_DELAY_MS,
	describeCheck,
	expectedVersion,
	READING_INTERVAL_MS,
	type Reading,
	servedVersion,
	waitForDeployment,
} from '../../scripts/release/deployment-check'

/**
 * The check that follows a publication (docs/publication.md, « Le déploiement vérifié »): it reads the version the
 * production reports until it is the release commit, and is red after twenty minutes. Here the network and the
 * clock are simulated: a list of readings, and a clock that moves forward by each pause.
 */

const COMMIT = 'b52acede0123456789abcdef0123456789abcdef'

/** A run of the check over `readings` (the last one repeats), with a clock that only the pauses move. */
async function run(readings: Reading[], options: { delayMs?: number; intervalMs?: number } = {}) {
	let clock = 0
	let index = 0
	const pauses: number[] = []
	const result = await waitForDeployment({
		commit: COMMIT,
		read: async () => readings[Math.min(index++, readings.length - 1)] ?? {},
		sleep: async ms => {
			pauses.push(ms)
			clock += ms
		},
		now: () => clock,
		...options,
	})
	return { result, reads: index, pauses }
}

describe('la version que la prod dit servir', () => {
	test('le sha court du commit, comme src/lib/version.ts', () => {
		expect(expectedVersion(COMMIT)).toBe('b52aced')
		expect(expectedVersion(COMMIT.toUpperCase())).toBe('b52aced')
	})

	test('lue dans la réponse de /api/health, rien quand elle n’y est pas', () => {
		expect(servedVersion({ ok: true, version: 'b52aced' })).toBe('b52aced')
		expect(servedVersion({ ok: true })).toBeUndefined()
		expect(servedVersion({ ok: true, version: '' })).toBeUndefined()
		expect(servedVersion({ ok: true, version: 42 })).toBeUndefined()
		expect(servedVersion(null)).toBeUndefined()
		expect(servedVersion('b52aced')).toBeUndefined()
	})
})

describe('l’attente du déploiement', () => {
	test('vert dès que la prod sert le commit de la version', async () => {
		const { result, reads } = await run([{ version: 'aaaaaaa' }, { failure: 'HTTP 502' }, { version: 'b52aced' }])

		expect(result).toEqual({ status: 'served', version: 'b52aced', afterMs: 2 * READING_INTERVAL_MS })
		expect(reads).toBe(3)
	})

	test('vert à la première lecture quand elle le sert déjà', async () => {
		const { result, pauses } = await run([{ version: 'b52aced' }])

		expect(result.status).toBe('served')
		expect(pauses).toEqual([])
	})

	test('rouge au bout du délai quand elle sert encore l’ancienne version, et dit laquelle', async () => {
		const { result, reads } = await run([{ version: 'aaaaaaa' }])

		expect(result.status).toBe('not-served')
		if (result.status !== 'not-served') return
		expect(result.lastReading).toEqual({ version: 'aaaaaaa' })
		expect(result.afterMs).toBeLessThanOrEqual(DEPLOYMENT_DELAY_MS)
		expect(reads).toBe(Math.floor(DEPLOYMENT_DELAY_MS / READING_INTERVAL_MS) + 1)
		expect(describeCheck(result, COMMIT)).toContain('elle sert encore aaaaaaa')
	})

	test('rouge aussi quand la prod ne répond plus, avec la raison de la dernière lecture', async () => {
		const { result } = await run([{ failure: 'HTTP 503' }], { delayMs: 60_000, intervalMs: 20_000 })

		expect(result).toEqual({ status: 'not-served', lastReading: { failure: 'HTTP 503' }, afterMs: 60_000 })
		expect(describeCheck(result, COMMIT)).toContain('la dernière lecture a échoué (HTTP 503)')
	})

	test('jamais au-delà du délai, même quand il ne tombe pas sur une lecture', async () => {
		const { result, pauses } = await run([{ version: 'aaaaaaa' }], { delayMs: 50_000, intervalMs: 20_000 })

		expect(pauses).toEqual([20_000, 20_000])
		expect(result.afterMs).toBe(40_000)
	})

	test('refuse un commit qui n’est pas complet', async () => {
		await expect(
			waitForDeployment({ commit: 'b52aced', read: async () => ({}), sleep: async () => {}, now: () => 0 })
		).rejects.toThrow('n’est pas un commit complet')
		await expect(
			waitForDeployment({ commit: '', read: async () => ({}), sleep: async () => {}, now: () => 0 })
		).rejects.toThrow('n’est pas un commit complet')
	})

	test('la phrase verte dit la version et le temps qu’il a fallu', () => {
		expect(describeCheck({ status: 'served', version: 'b52aced', afterMs: 150_000 }, COMMIT)).toBe(
			'La production sert b52aced, le commit de la version publiée, après 3 min.'
		)
	})
})
