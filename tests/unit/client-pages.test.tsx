import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import PageDemande, { metadata as metaDemande } from '../../src/app/(front)/(site)/demande-envoyee/page'
import PageCentraliser, {
	metadata as metaCentraliser,
} from '../../src/app/(front)/(site)/particulier/centraliser-ses-recherches/page'
import PageExplorer, {
	metadata as metaExplorer,
} from '../../src/app/(front)/(site)/particulier/explorer-les-profils/page'
import PageTrouver, {
	metadata as metaTrouver,
} from '../../src/app/(front)/(site)/particulier/trouver-une-maquilleuse/page'
import PagePourquoi, {
	metadata as metaPourquoi,
} from '../../src/app/(front)/(site)/pourquoi-utiliser-my-makeup-en-tant-que-particulier/page'
import PageSolutions, {
	metadata as metaSolutions,
} from '../../src/app/(front)/(site)/solutions/pour-les-particuliers/page'

/**
 * The five fixed pages for the people looking for a makeup artist and the thank-you page (ticket 109;
 * plan 02 I45 on the bench: tests/e2e/pages-particuliers.spec.ts). No database, no server.
 */

const PAGES = [
	{ chemin: '/particulier/trouver-une-maquilleuse', Page: PageTrouver, metadata: metaTrouver },
	{ chemin: '/particulier/centraliser-ses-recherches', Page: PageCentraliser, metadata: metaCentraliser },
	{ chemin: '/particulier/explorer-les-profils', Page: PageExplorer, metadata: metaExplorer },
	{ chemin: '/solutions/pour-les-particuliers', Page: PageSolutions, metadata: metaSolutions },
	{ chemin: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier', Page: PagePourquoi, metadata: metaPourquoi },
] as const

/** The promises CONF-01 took away (plan 01 §1.9): none may come back. */
const REMOVED_PROMISES = /milliers|paiement sécurisé|avis vérifiés|vérifiées|réservation/i

const html = (element: React.ReactElement): string => renderToStaticMarkup(element)

for (const { chemin: filePath, Page, metadata } of PAGES)
	describe(filePath, () => {
		const rendered = html(<Page />)

		test('un seul h1, et les titres suivants sont des h2 puis des h3', () => {
			expect(rendered.match(/<h1[\s>]/g)).toHaveLength(1)
			expect(rendered).toMatch(/<h2[\s>]/)
		})

		test('aucune promesse retirée par CONF-01 ne revient', () => {
			expect(rendered).not.toMatch(REMOVED_PROMISES)
		})

		test('aucun texte « undefined » ou « null » dans la page', () => {
			expect(rendered).not.toMatch(/>\s*(undefined|null)\s*</)
		})

		test('l’adresse canonique est la sienne et la page est indexable', () => {
			expect(metadata.alternates?.canonical).toBe(`https://my-makeup.fr${filePath}`)
			expect(metadata.robots).toBeUndefined()
		})
	})

describe('la page « demande envoyée »', () => {
	const rendered = html(<PageDemande />)

	test('elle est en noindex, sans adresse canonique', () => {
		expect(metaDemande.robots).toEqual({ index: false, follow: true })
		expect(metaDemande.alternates).toBeUndefined()
	})

	test('un seul h1 et un lien vers la recherche', () => {
		expect(rendered.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(rendered).toContain('Votre demande est transmise')
		expect(rendered).toContain('href="/search"')
	})

	test('elle ne porte pas le bloc de recherche de l’en-tête', () => {
		expect(rendered).not.toContain('role="search"')
	})
})

describe('les guides', () => {
	test('les étapes de chaque guide sont des h3 sous le h2 de l’article', () => {
		const rendered = html(<PageTrouver />)
		const h2 = rendered.indexOf('<h2')
		const h3 = rendered.indexOf('<h3')
		expect(h2).toBeGreaterThan(-1)
		expect(h3).toBeGreaterThan(h2)
	})

	test('« Trouver une maquilleuse » dit que My-Makeup n’affiche pas d’avis (CONF-01)', () => {
		expect(html(<PageTrouver />)).toContain('My-Makeup n&#x27;affiche pas d&#x27;avis clients pour le moment')
	})

	test('« pour les particuliers » dit que My-Makeup ne gère ni les rendez-vous ni les règlements (CONF-01)', () => {
		expect(html(<PageSolutions />)).toContain('ne gère ni les rendez-vous ni les règlements')
	})
})
