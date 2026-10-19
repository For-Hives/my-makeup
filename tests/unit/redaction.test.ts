import { describe, expect, test } from 'bun:test'
import { champSlug, datePremierePublication, validerSlug } from '@/collections/editor'
import { estUnSlug, SLUG_MAX } from '@/lib/slug'

/**
 * The rules of writing of the newsroom (src/collections/editor.ts), without a database: the
 * form of a slug, and the date of the first publication. The integration tests play them through
 * the APIs (tests/integration/talents.test.ts).
 */

/** What Payload hands to a validation: only what the text validation reads. */
const argumentsDeValidation = {
	required: true,
	req: { payload: { config: {} }, t: (cle: string) => cle },
} as never

describe('Un slug de la rédaction a déjà la forme d’une adresse', () => {
	test('minuscules, chiffres, mots séparés par un seul tiret : accepté', () => {
		for (const slug of ['maquillage-mariee', 'maquillage-fx', 'talent-2', 'a'.repeat(SLUG_MAX)])
			expect(estUnSlug(slug), slug).toBe(true)
	})

	test('majuscule, accent, espace, tiret en trop, trop long, vide ou autre chose qu’un texte : refusé', () => {
		for (const slug of [
			'Maquillage-mariee',
			'maquillage-mariée',
			'maquillage mariee',
			'maquillage--mariee',
			'-maquillage',
			'maquillage-',
			'maquillage_mariee',
			'a'.repeat(SLUG_MAX + 1),
			'',
			null,
			42,
		])
			expect(estUnSlug(slug), String(slug)).toBe(false)
	})

	test('la validation refuse sans corriger, et propose la bonne forme', () => {
		expect(validerSlug('maquillage-mariee', argumentsDeValidation)).toBe(true)
		const message = validerSlug('Maquillage Mariée', argumentsDeValidation)
		expect(message).toContain('minuscules')
		expect(message).toContain('« maquillage-mariee »')
		// Nothing usable in it: no proposal, still a refusal.
		expect(validerSlug('💄', argumentsDeValidation)).not.toContain('Par exemple')
		expect(validerSlug('💄', argumentsDeValidation)).not.toBe(true)
	})

	test('un slug manquant est refusé par la règle « requis » de Payload', () => {
		expect(validerSlug(undefined, argumentsDeValidation)).not.toBe(true)
		expect(validerSlug('', argumentsDeValidation)).not.toBe(true)
	})

	test('le champ dit à quelle adresse répond la page', () => {
		expect(champSlug('/talent')).toMatchObject({
			name: 'slug',
			required: true,
			unique: true,
			validate: validerSlug,
			admin: { description: expect.stringContaining('/talent/<adresse>') },
		})
	})
})

describe('La date de la première publication', () => {
	const appel = (data: Record<string, unknown>) =>
		datePremierePublication({ data, operation: 'update' } as never) as Record<string, unknown>

	test('un document publié sans date reçoit la date du moment', () => {
		const avant = Date.now()
		const { publishedAt } = appel({ _status: 'published', publishedAt: null })
		expect(Date.parse(String(publishedAt))).toBeGreaterThanOrEqual(avant)
		expect(Date.parse(String(publishedAt))).toBeLessThanOrEqual(Date.now())
	})

	test('une date déjà là (publication précédente, ou celle de l’import) est gardée', () => {
		const date = '2023-04-01T09:00:00.000Z'
		expect(appel({ _status: 'published', publishedAt: date }).publishedAt).toBe(date)
		expect(appel({ _status: 'draft', publishedAt: date }).publishedAt).toBe(date)
	})

	test('un brouillon n’a pas de date', () => {
		expect(appel({ _status: 'draft' }).publishedAt).toBeUndefined()
	})
})
