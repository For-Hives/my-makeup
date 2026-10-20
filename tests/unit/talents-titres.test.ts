import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { champsDifferents, planifier } from '../../scripts/migration/import/moteur'
import { ADAPTATEUR_TALENTS, type LigneTalent, talentAttendu } from '../../scripts/migration/import/talents'
import { validerTitreDeLaPage } from '../../src/collections/Talents'
import { TALENT_PAGE_TITLES } from '../../src/content/talent-titles'
import { MAX_TITLE, pageTitle, TALENT_MIN_TITLE } from '../../src/lib/seo/text'
import { estUnSlug } from '../../src/lib/slug'
import { defautsDuTitreDeTalent } from '../outils/parite-urls'

/** Ticket 108: the 14 titles of the talent tabs, written by the project, and how the import fills them in. */

const entrees = Object.entries(TALENT_PAGE_TITLES)
const racine = path.resolve(import.meta.dir, '../..')

describe('les 14 titres d’onglet des pages talent', () => {
	test('il y en a 14, un par adresse conservée, et chaque adresse a la forme d’un slug', () => {
		expect(entrees).toHaveLength(14)
		const inventaire = readFileSync(path.join(racine, 'docs/migration/urls-inventaire.json'), 'utf8')
		for (const [slug] of entrees) {
			expect(estUnSlug(slug), slug).toBe(true)
			expect(inventaire, slug).toContain(`/talent/${slug}`)
		}
	})

	test('chacun fait de 50 à 60 caractères, ils sont tous distincts et acceptés par le champ de l’administration', () => {
		const titres = entrees.map(([, titre]) => titre)
		expect(new Set(titres).size).toBe(14)
		for (const titre of titres) {
			expect(titre.length, titre).toBeGreaterThanOrEqual(TALENT_MIN_TITLE)
			expect(titre.length, titre).toBeLessThanOrEqual(MAX_TITLE)
			expect(titre).toBe(titre.trim())
			expect(
				validerTitreDeLaPage(titre, {
					required: false,
					siblingData: { seo_title: 'Court' },
					req: { payload: { config: {} }, t: (cle: string) => cle },
				} as never),
				titre
			).toBe(true)
		}
	})

	test('aucun ne reprend le titre court de l’ancien site, et l’onglet rendu passe le contrôle de I45', () => {
		for (const [slug, titre] of entrees) {
			const court = slug.replace('maquillage-', 'Maquillage ')
			expect(titre).not.toBe(court)
			// The tab is the title as it is (no brand added after 50 characters), the h1 is another text.
			const onglet = pageTitle(titre)
			expect(onglet).toBe(titre)
			expect(defautsDuTitreDeTalent(`<title>${onglet}</title><h1>${court}</h1>`), slug).toEqual([])
		}
	})
})

describe('l’import des titres d’onglet', () => {
	const ligne = (id: number, slug: string): LigneTalent => ({
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
		const connu = talentAttendu(ligne(1, 'maquillage-mariee'))
		expect(connu.valeurs.pageTitle).toBe(TALENT_PAGE_TITLES['maquillage-mariee'])
		expect(connu.ecarts).toEqual([{ champ: 'pageTitle', reference: 'titre-page-talent' }])
		const inconnu = talentAttendu(ligne(2, 'effets-speciaux'))
		expect(inconnu.valeurs).not.toHaveProperty('pageTitle')
		expect(inconnu.ecarts).toEqual([])
	})

	test('le titre n’est écrit que s’il manque : jamais par-dessus un titre saisi dans l’administration', () => {
		const attendu = talentAttendu(ligne(1, 'maquillage-mariee'))
		const valeurs = { ...attendu.valeurs }
		const existant = (titreDeLaPage: unknown) => ({ id: 7, valeurs: { ...valeurs, pageTitle: titreDeLaPage } })
		expect(champsDifferents(ADAPTATEUR_TALENTS, attendu, existant(null))).toEqual(['pageTitle'])
		expect(champsDifferents(ADAPTATEUR_TALENTS, attendu, existant(''))).toEqual(['pageTitle'])
		expect(
			champsDifferents(ADAPTATEUR_TALENTS, attendu, existant('Un titre saisi par la rédaction, de bonne longueur'))
		).toEqual([])
		expect(champsDifferents(ADAPTATEUR_TALENTS, attendu, existant(valeurs.pageTitle))).toEqual([])
		// A talent with no title to give leaves an empty one alone.
		const sans = talentAttendu(ligne(2, 'effets-speciaux'))
		expect(
			champsDifferents(ADAPTATEUR_TALENTS, sans, { id: 8, valeurs: { ...sans.valeurs, pageTitle: null } })
		).toEqual([])
		expect(planifier(ADAPTATEUR_TALENTS, [attendu], [existant('Saisi')]).actions[0]?.genre).toBe('inchange')
	})
})
