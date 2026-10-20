import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { differentFields, planActions } from '../../scripts/migration/import/engine'
import { expectedTalent, TALENTS_ADAPTER, type TalentRow } from '../../scripts/migration/import/talents'
import { validatePageTitle } from '../../src/collections/Talents'
import { TALENT_PAGE_TITLES } from '../../src/content/talent-titles'
import { MAX_TITLE, pageTitle, TALENT_MIN_TITLE } from '../../src/lib/seo/text'
import { isSlug } from '../../src/lib/slug'
import { talentTitleDefaults } from '../support/url-parity'

/** Ticket 108: the 14 titles of the talent tabs, written by the project, and how the import fills them in. */

const entries = Object.entries(TALENT_PAGE_TITLES)
const root = path.resolve(import.meta.dir, '../..')

describe('les 14 titres d’onglet des pages talent', () => {
	test('il y en a 14, un par adresse conservée, et chaque adresse a la forme d’un slug', () => {
		expect(entries).toHaveLength(14)
		const inventory = readFileSync(path.join(root, 'docs/migration/urls-inventaire.json'), 'utf8')
		for (const [slug] of entries) {
			expect(isSlug(slug), slug).toBe(true)
			expect(inventory, slug).toContain(`/talent/${slug}`)
		}
	})

	test('chacun fait de 50 à 60 caractères, ils sont tous distincts et acceptés par le champ de l’administration', () => {
		const titles = entries.map(([, title]) => title)
		expect(new Set(titles).size).toBe(14)
		for (const title of titles) {
			expect(title.length, title).toBeGreaterThanOrEqual(TALENT_MIN_TITLE)
			expect(title.length, title).toBeLessThanOrEqual(MAX_TITLE)
			expect(title).toBe(title.trim())
			expect(
				validatePageTitle(title, {
					required: false,
					siblingData: { seo_title: 'Court' },
					req: { payload: { config: {} }, t: (cle: string) => cle },
				} as never),
				title
			).toBe(true)
		}
	})

	test('aucun ne reprend le titre court de l’ancien site, et l’onglet rendu passe le contrôle de I45', () => {
		for (const [slug, title] of entries) {
			const short = slug.replace('maquillage-', 'Maquillage ')
			expect(title).not.toBe(short)
			// The tab is the title as it is (no brand added after 50 characters), the h1 is another text.
			const tab = pageTitle(title)
			expect(tab).toBe(title)
			expect(talentTitleDefaults(`<title>${tab}</title><h1>${short}</h1>`), slug).toEqual([])
		}
	})
})

describe('l’import des titres d’onglet', () => {
	const line = (id: number, slug: string): TalentRow => ({
		id,
		title: 'Talent',
		seo_title: null,
		description: null,
		seo_description: null,
		content: null,
		slug,
		created_at: '2023-04-01T09:00:00.000Z',
		updated_at: '2024-05-02T10:00:00.000Z',
		published_at: '2023-04-01T09:00:00.000Z',
	})

	test('un talent des 14 reçoit son titre et l’écart est annoncé ; un autre talent n’en reçoit pas', () => {
		const known = expectedTalent(line(1, 'maquillage-mariee'))
		expect(known.values.pageTitle).toBe(TALENT_PAGE_TITLES['maquillage-mariee'])
		expect(known.gaps).toEqual([{ field: 'pageTitle', reference: 'titre-page-talent' }])
		const unknown = expectedTalent(line(2, 'effets-speciaux'))
		expect(unknown.values).not.toHaveProperty('pageTitle')
		expect(unknown.gaps).toEqual([])
	})

	test('le titre n’est écrit que s’il manque : jamais par-dessus un titre saisi dans l’administration', () => {
		const expected = expectedTalent(line(1, 'maquillage-mariee'))
		const values = { ...expected.values }
		const existing = (titreDeLaPage: unknown) => ({ id: 7, values: { ...values, pageTitle: titreDeLaPage } })
		expect(differentFields(TALENTS_ADAPTER, expected, existing(null))).toEqual(['pageTitle'])
		expect(differentFields(TALENTS_ADAPTER, expected, existing(''))).toEqual(['pageTitle'])
		expect(
			differentFields(TALENTS_ADAPTER, expected, existing('Un titre saisi par la rédaction, de bonne longueur'))
		).toEqual([])
		expect(differentFields(TALENTS_ADAPTER, expected, existing(values.pageTitle))).toEqual([])
		// A talent with no title to give leaves an empty one alone.
		const without = expectedTalent(line(2, 'effets-speciaux'))
		expect(
			differentFields(TALENTS_ADAPTER, without, { id: 8, values: { ...without.values, pageTitle: null } })
		).toEqual([])
		expect(planActions(TALENTS_ADAPTER, [expected], [existing('Saisi')]).actions[0]?.kind).toBe('inchange')
	})
})
