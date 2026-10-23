import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalyticsOptOut } from '@/components/analytics/AnalyticsOptOut'
import { FOOTER_COLUMNS } from '@/components/layout/links'
import { analyticsRefused, OPT_OUT_KEY, refuseAnalytics } from '@/lib/analytics/opt-out'
import { formatSiren, formatSiret, HOST, luhnValid, PUBLISHER } from '@/lib/legal'
import { openWindow } from '../support/dom-react'
import { pageText, textFingerprint } from '../support/page-text'

/**
 * The three legal pages (ticket 112): the text of the live site word for word, one h1, one source for
 * the legal identity, and the button that lets a visitor oppose the audience measure. The same pages
 * in a browser, with the fake Umami: tests/e2e/legal-pages.spec.ts.
 */

const PAGES = [
	{ chemin: '/mentions-legales', module: () => import('@/app/(front)/(site)/mentions-legales/page') },
	{ chemin: '/cgu', module: () => import('@/app/(front)/(site)/cgu/page') },
	{
		chemin: '/politique-de-confidentialite',
		module: () => import('@/app/(front)/(site)/politique-de-confidentialite/page'),
	},
] as const

// The words of the live site, as the hash of their plain text (the text itself is the page's). The one
// wanted differences are in the policy: the paragraph « Formulaire de contact » (ticket 162, register
// `contact-conservation-12-mois`), and the providers, the email confirmation and the delay of the photos
// (ticket 189, register `politique-a-jour-a-la-bascule`), Cloudflare Turnstile on the contact form (ticket 1000, register `contact-verifie-par-turnstile`), the daily photo copy that keeps a removed photo (ticket 278),
// the terms without the quote form that did not exist (ticket 291), then with it again (issue 1003, register `cgu-sans-formulaire-de-devis`),
// the paragraph on the quote requests (issue 1003, register `devis-natifs`),
// the paragraph on the count of the searches by day (issue 1002, register `compteur-recherches-par-jour`),
// the paragraph on the counter of views (ticket 1001, register `espace-vues-de-la-page`),
// and the paragraph on the moderation journal, kept 60 months (issue 1005, register `moderation-motif-et-journal`).
const ONLINE: Record<string, { lignes: number; sha: string }> = JSON.parse(
	readFileSync(path.join(process.cwd(), 'tests/fixtures/legal-pages-text.json'), 'utf8')
)

describe('le texte des trois pages', () => {
	for (const { chemin: filePath, module } of PAGES) {
		test(`${filePath} : texte brut identique à celui du site en ligne, un seul h1`, async () => {
			const { default: Page } = await module()
			const html = renderToStaticMarkup(<Page />)
			const text = pageText(html)

			expect(text.split('\n').length).toBe(ONLINE[filePath]?.lignes as number)
			expect(textFingerprint(text)).toBe(ONLINE[filePath]?.sha as string)
			expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		})

		test(`${filePath} : titre, description et adresse canonique`, async () => {
			const { metadata } = await module()
			const description = String(metadata.description)

			expect(String((metadata.title as { absolute: string }).absolute)).toMatch(/ - My-Makeup$/)
			expect(description.length).toBeGreaterThanOrEqual(70)
			expect(description.length).toBeLessThanOrEqual(155)
			expect(metadata.alternates?.canonical).toBe(`https://my-makeup.fr${filePath}`)
			expect(metadata.robots).toBeUndefined()
		})
	}

	test('les CGU décrivent le formulaire de devis et sa durée de conservation (issue 1003)', async () => {
		const { default: Page } = await PAGES[1].module()
		const text = pageText(renderToStaticMarkup(<Page />))
		expect(text).toContain('« Demander un devis »')
		expect(text).toContain('7. Demandes de devis')
		expect(text).toContain('Les données des demandes sont conservées 6 mois')
		expect(text).toContain('11. Droit applicable')
	})

	test('seule la politique mène au bouton d’opposition', async () => {
		const text = async (module: () => Promise<{ default: () => React.JSX.Element }>) => {
			const { default: Page } = await module()
			return pageText(renderToStaticMarkup(<Page />))
		}

		// The button itself draws nothing on the server: the page shows the sentence that leads to it.
		expect(await text(PAGES[2].module)).toContain('Vous pouvez vous y opposer sur ce navigateur :')
		expect(await text(PAGES[1].module)).not.toContain('opposer')
		expect(await text(PAGES[0].module)).not.toContain('opposer')
	})

	test('le pied de page mène aux trois pages', () => {
		const links = FOOTER_COLUMNS.flatMap(({ liens: links }) => links.map(({ href }) => href))
		for (const { chemin: filePath } of PAGES) expect(links).toContain(filePath)
	})
})

describe('l’identité légale vient d’une seule source', () => {
	test('les numéros sont valides et s’impriment à la française', () => {
		expect(luhnValid(PUBLISHER.siren)).toBe(true)
		expect(luhnValid(PUBLISHER.siret)).toBe(true)
		expect(PUBLISHER.siret.startsWith(PUBLISHER.siren)).toBe(true)
		expect(formatSiren(PUBLISHER.siren)).toMatch(/^\d{3} \d{3} \d{3}$/)
		expect(formatSiret(PUBLISHER.siret)).toMatch(/^\d{3} \d{3} \d{3} \d{5}$/)
		expect(formatSiret(PUBLISHER.siret).replaceAll(' ', '')).toBe(PUBLISHER.siret)
		expect(luhnValid('12a')).toBe(false)
	})

	test('les pages les écrivent depuis cette source : ni numéro ni adresse dans leur code', () => {
		const sources = readdirSync(path.join(process.cwd(), 'src/app/(front)/(site)'), {
			recursive: true,
			withFileTypes: true,
		})
			.filter(entree => entree.isFile() && /\.tsx?$/.test(entree.name))
			.map(entree => readFileSync(path.join(entree.parentPath, entree.name), 'utf8'))
		const values = [
			PUBLISHER.siren,
			PUBLISHER.siret,
			PUBLISHER.adresse,
			PUBLISHER.telephone,
			HOST.adresse,
			HOST.telephone,
		]
		for (const source of sources) for (const value of values) expect(source).not.toContain(value)
	})

	test('la page des mentions écrit l’éditeur et l’hébergeur tels que la source les donne', async () => {
		const { default: Page } = await PAGES[0].module()
		const text = pageText(renderToStaticMarkup(<Page />))

		for (const line of [
			`SIREN : ${formatSiren(PUBLISHER.siren)}`,
			`SIRET : ${formatSiret(PUBLISHER.siret)}`,
			`Adresse : ${PUBLISHER.adresse}`,
			`Email : ${PUBLISHER.email}`,
			`Téléphone : ${PUBLISHER.telephone}`,
			HOST.adresse,
			`Téléphone : ${HOST.telephone}`,
		])
			expect(text).toContain(line)
		expect(text).toContain(`édité par ${PUBLISHER.nom}, ${PUBLISHER.forme}.`)
	})
})

describe('l’opposition à la mesure', () => {
	const jsdomWindow = openWindow({ noms: ['localStorage'] })

	test('un clic coupe la mesure sur ce navigateur, un second la rétablit', async () => {
		jsdomWindow.w.localStorage.clear()
		const zone = await jsdomWindow.monter(<AnalyticsOptOut />)
		const state = () => zone.querySelector('[role="status"]')?.textContent

		expect(state()).toBe("La mesure d'audience est active sur ce navigateur.")
		expect(jsdomWindow.w.localStorage.getItem(OPT_OUT_KEY)).toBeNull()

		await jsdomWindow.cliquer(jsdomWindow.bouton('Ne plus mesurer mes visites'))
		expect(jsdomWindow.w.localStorage.getItem(OPT_OUT_KEY)).not.toBeNull()
		expect(state()).toBe("La mesure d'audience est désactivée sur ce navigateur.")

		await jsdomWindow.cliquer(jsdomWindow.bouton("Réactiver la mesure d'audience"))
		expect(jsdomWindow.w.localStorage.getItem(OPT_OUT_KEY)).toBeNull()
		expect(state()).toBe("La mesure d'audience est active sur ce navigateur.")
	})

	test('une opposition déjà posée se lit à l’ouverture de la page', async () => {
		jsdomWindow.w.localStorage.setItem(OPT_OUT_KEY, '1')
		const zone = await jsdomWindow.monter(<AnalyticsOptOut />)
		await jsdomWindow.attendre(() => zone.querySelector('button'))

		expect(zone.querySelector('[role="status"]')?.textContent).toBe(
			"La mesure d'audience est désactivée sur ce navigateur."
		)
		expect(jsdomWindow.bouton("Réactiver la mesure d'audience")).toBeTruthy()
		jsdomWindow.w.localStorage.clear()
	})
})

describe('la clé d’opposition', () => {
	const memory = () => {
		const values = new Map<string, string>()
		return {
			getItem: (cle: string) => values.get(cle) ?? null,
			setItem: (cle: string, valeur: string) => void values.set(cle, valeur),
			removeItem: (cle: string) => void values.delete(cle),
		}
	}

	test('c’est la clé qu’Umami lit lui-même, et le filtre de la page la lit aussi', () => {
		expect(OPT_OUT_KEY).toBe('umami.disabled')
		const filter = readFileSync(path.join(process.cwd(), 'src/lib/analytics/umami.ts'), 'utf8')
		expect(filter).toContain(`getItem('${OPT_OUT_KEY}')`)
	})

	test('poser puis retirer la clé change l’état, et l’état se relit dans le stockage', () => {
		const storage = memory()
		expect(analyticsRefused(storage)).toBe(false)
		expect(refuseAnalytics(storage, true)).toBe(true)
		expect(analyticsRefused(storage)).toBe(true)
		expect(refuseAnalytics(storage, false)).toBe(false)
	})

	test('un stockage absent ou qui refuse ne casse rien et ne compte pas pour une opposition', () => {
		const broken = {
			getItem: () => {
				throw new Error('bloqué')
			},
			setItem: () => {
				throw new Error('bloqué')
			},
			removeItem: () => {
				throw new Error('bloqué')
			},
		}
		expect(analyticsRefused(undefined)).toBe(false)
		expect(analyticsRefused(broken)).toBe(false)
		expect(refuseAnalytics(broken, true)).toBe(false)
		expect(refuseAnalytics(undefined, true)).toBe(false)
	})
})
