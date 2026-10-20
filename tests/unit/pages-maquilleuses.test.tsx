import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AboutPage, { metadata as metaAPropos } from '../../src/app/(front)/(site)/a-propos/page'
import PartnershipsPage, {
	metadata as metaPartenariats,
} from '../../src/app/(front)/(site)/maquilleuse/partenariats/page'
import WhyJoinPage, {
	metadata as metaPourquoi,
} from '../../src/app/(front)/(site)/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse/page'
import PageSolutions, {
	metadata as metaSolutions,
} from '../../src/app/(front)/(site)/solutions/pour-les-maquilleuses/page'
import { empreinteDesTitres, type TitresDeLAncienSite } from '../support/url-parity'

/** The four fixed pages for makeup artists and « À propos » (ticket 110), without a database. Their run in a browser: tests/e2e/pages-maquilleuses.spec.ts. */

const anciens: TitresDeLAncienSite = JSON.parse(
	readFileSync(new URL('../fixtures/parite-urls-h1.json', import.meta.url), 'utf8')
)

const PAGES: { adresse: string; page: () => ReactElement; metadata: Metadata }[] = [
	{ adresse: '/a-propos', page: AboutPage, metadata: metaAPropos },
	{ adresse: '/maquilleuse/partenariats', page: PartnershipsPage, metadata: metaPartenariats },
	{
		adresse: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
		page: WhyJoinPage,
		metadata: metaPourquoi,
	},
	{ adresse: '/solutions/pour-les-maquilleuses', page: PageSolutions, metadata: metaSolutions },
]

describe.each(PAGES)('Page $adresse', ({ adresse, page, metadata }) => {
	const html = renderToStaticMarkup(page())

	test('un seul h1, rendu par le serveur', () => {
		expect(empreinteDesTitres(html).n).toBe(1)
	})

	test('titre de 60 caractères au plus, description de 70 à 155, canonique absolue sans barre finale, indexable', () => {
		const titre = String((metadata.title as { absolute: string }).absolute)
		expect(titre.length).toBeLessThanOrEqual(60)
		const description = String(metadata.description)
		expect(description.length).toBeGreaterThanOrEqual(70)
		expect(description.length).toBeLessThanOrEqual(155)
		expect(metadata.alternates?.canonical).toBe(`https://my-makeup.fr${adresse}`)
		expect(metadata.robots).toBeUndefined()
	})

	test('aucune promesse retirée par CONF-01', () => {
		expect(html).not.toMatch(/milliers|paiement sécurisé|avis vérifiés|r[ée]servation|vérifiées/i)
	})

	test('un lien vers l’inscription et le bloc de fin de page', () => {
		expect(html).toContain('href="/auth/signin"')
		expect(html).toContain('href="/auth/signup"')
		expect(html).toContain('href="/search"')
	})
})

describe('Le h1 de l’ancien site', () => {
	test('« Pourquoi rejoindre » garde mot pour mot son h1 d’avant (même empreinte)', () => {
		const adresse = '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse'
		const html = renderToStaticMarkup(WhyJoinPage())
		expect(anciens[adresse]?.n).toBe(1)
		expect(empreinteDesTitres(html).sha).toBe(anciens[adresse]?.sha ?? null)
	})

	test('les trois autres avaient deux h1 : le premier, celui de l’en-tête, est gardé ; le texte passe sous un h2', () => {
		for (const { adresse, page } of PAGES.filter(({ adresse }) => !adresse.startsWith('/pourquoi'))) {
			expect(anciens[adresse]?.n).toBe(2)
			const html = renderToStaticMarkup(page())
			expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>/)
		}
	})
})
