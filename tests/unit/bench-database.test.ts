import { describe, expect, test } from 'bun:test'
import { benchEnvironment, RefusedBench } from '../support/bench'
import { requireBench, requireBenchSignIn } from '../support/payload-test'

const BENCH = benchEnvironment({ nom: 'my-makeup-test', decalage: 0 })
const BENCH_BASE = BENCH.DATABASE_URI ?? ''
const DEVELOPMENT_BASE = 'postgres://mymakeup:local-dev-only@127.0.0.1:5442/mymakeup_dev'

/** What the tools read of Payload: the connection it was built with. Nothing is opened. */
const branchOn = (connexion: string) => ({ db: { poolOptions: { connectionString: connexion } } })

const refusal = (essai: () => unknown): string => {
	try {
		essai()
	} catch (error) {
		if (error instanceof RefusedBench) return error.message
		throw error
	}
	throw new Error('rien n’a été refusé')
}

describe('Le Payload des tests et la remise à zéro ne travaillent que sur la base du banc', () => {
	test('la base du banc est reconnue : c’est celle de .env.test', () => {
		expect(requireBench(BENCH)).toBe(BENCH_BASE)
		expect(() => requireBenchSignIn(branchOn(BENCH_BASE), BENCH)).not.toThrow()
	})

	test('sans base réglée, tout s’arrête avec la commande à lancer', () => {
		expect(refusal(() => requireBench({}))).toBe(
			'Aucun banc de test n’est réglé (DATABASE_URI manque) : rien n’est écrit. Démarre le banc par « bun run bench:up », puis lance les tests par « bun run test:integration ».'
		)
	})

	test.each([
		['la base de développement du poste', DEVELOPMENT_BASE],
		[
			'une base distante, même nommée en _test',
			'postgres://banc:mot-de-passe-factice@db.example.test:5432/mymakeup_test',
		],
		['une autre base du même serveur', BENCH_BASE.replace('mymakeup_test', 'autre_test')],
		['le banc d’une autre instance', BENCH_BASE.replace(':5443/', ':5463/')],
	])('refuse %s, sans recopier l’adresse', (_cas, base) => {
		const message = refusal(() => requireBench({ ...BENCH, DATABASE_URI: base }))

		expect(message).toStartWith('DATABASE_URI ne désigne pas la base du banc de test : rien n’est écrit.')
		expect(message).not.toContain('postgres://')
		expect(message).not.toContain('mot-de-passe-factice')
		expect(message).not.toContain('local-dev-only')
	})

	test('un Payload branché ailleurs que l’environnement ne le dit est refusé', () => {
		expect(refusal(() => requireBenchSignIn(branchOn(DEVELOPMENT_BASE), BENCH))).toBe(
			'Payload n’est pas branché sur la base du banc de test : rien n’est écrit.'
		)
		expect(() => requireBenchSignIn({ db: {} }, BENCH)).toThrow(RefusedBench)
	})

	test('le banc d’une instance décalée n’est reconnu que sous les variables de cette instance', () => {
		const neighbor = benchEnvironment({ nom: 'voisin', decalage: 20 })
		const instance = { BENCH_INSTANCE: 'voisin', BENCH_OFFSET: '20' }

		expect(requireBench({ ...neighbor, ...instance })).toBe(neighbor.DATABASE_URI ?? '')
		expect(() => requireBench(neighbor)).toThrow(RefusedBench)
		expect(refusal(() => requireBench(instance))).toContain(
			'« BENCH_INSTANCE=voisin BENCH_OFFSET=20 bun run bench:up »'
		)
	})
})
