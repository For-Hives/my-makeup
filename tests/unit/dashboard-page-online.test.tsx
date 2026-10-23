import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Glob } from 'bun'
import { COPIED_TEXT, COPY_FAILURE_TEXT, INSTAGRAM_STEPS, PageOnline } from '@/components/dashboard/PageOnline'
import { publicAddress } from '@/lib/dashboard/public-address'
import { openWindow } from '../support/dom-react'

/**
 * The card « Ta page est en ligne ! » (ticket 306; audit UX n° 12): her address in clear, a button that
 * copies it, a share button only where the browser has a share sheet, and the Instagram how-to.
 * Made-up values only.
 */

const jsdomWindow = openWindow()
const ADDRESS = 'https://my-makeup.fr/profil/lea-fictive'

type Navigator = { clipboard?: unknown; share?: unknown }
const setNavigator = (values: Navigator) => {
	for (const [name, value] of Object.entries(values))
		Object.defineProperty(jsdomWindow.w.navigator, name, { value, configurable: true, writable: true })
}
afterEach(() => {
	for (const name of ['clipboard', 'share']) Reflect.deleteProperty(jsdomWindow.w.navigator, name)
})

describe('l’adresse publique', () => {
	test('c’est l’adresse canonique de la page publique, sans paramètre', () => {
		expect(publicAddress('lea-fictive')).toBe(ADDRESS)
	})
})

describe('la carte « Ta page est en ligne ! »', () => {
	test('elle dit l’adresse exacte en clair et le comment faire pour Instagram', async () => {
		const zone = await jsdomWindow.monter(<PageOnline adresse={ADDRESS} />)
		expect(zone.querySelector('h2')?.textContent).toBe('Ta page est en ligne !')
		expect(zone.querySelector('[data-testid="page-en-ligne-adresse"]')?.textContent).toBe(ADDRESS)
		const how = zone.querySelector('details')
		expect(how?.querySelector('summary')?.textContent).toBe('Ajouter le lien à ma bio Instagram : comment faire')
		expect(how?.querySelectorAll('li')).toHaveLength(INSTAGRAM_STEPS.length)
	})

	test('« Copier le lien » met la bonne adresse dans le presse-papiers et annonce « Lien copié » dans un status', async () => {
		const copied: string[] = []
		setNavigator({ clipboard: { writeText: async (text: string) => void copied.push(text) } })
		const zone = await jsdomWindow.monter(<PageOnline adresse={ADDRESS} />)
		const status = zone.querySelector('[role="status"]')
		expect(status?.textContent).toBe('')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Copier le lien'))
		await jsdomWindow.attendre(() => (status?.textContent ?? '') !== '')
		expect(copied).toEqual([ADDRESS])
		expect(status?.textContent).toBe(COPIED_TEXT)
		expect(COPIED_TEXT).toBe('Lien copié')
	})

	test('un presse-papiers refusé ou absent ne casse rien : elle le dit', async () => {
		setNavigator({
			clipboard: {
				writeText: async () => {
					throw new Error('refusé')
				},
			},
		})
		const zone = await jsdomWindow.monter(<PageOnline adresse={ADDRESS} />)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Copier le lien'))
		await jsdomWindow.attendre(() => zone.querySelector('[role="status"]')?.textContent === COPY_FAILURE_TEXT)
		// No clipboard at all: the same sentence, no exception.
		const second = await jsdomWindow.monter(<PageOnline adresse={ADDRESS} />)
		Reflect.deleteProperty(jsdomWindow.w.navigator, 'clipboard')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Copier le lien', second))
		await jsdomWindow.attendre(() => second.querySelector('[role="status"]')?.textContent === COPY_FAILURE_TEXT)
	})

	test('sans partage natif, pas de bouton « Partager »', async () => {
		const zone = await jsdomWindow.monter(<PageOnline adresse={ADDRESS} />)
		expect([...zone.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Copier le lien'])
	})

	test('avec le partage natif, « Partager » donne l’adresse au téléphone ; l’annulation ne dit rien', async () => {
		const shared: unknown[] = []
		setNavigator({
			share: async (data: unknown) => {
				shared.push(data)
				throw new DOMException('fermé', 'AbortError')
			},
		})
		const zone = await jsdomWindow.monter(<PageOnline adresse={ADDRESS} />)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Partager'))
		expect(shared).toMatchObject([{ url: ADDRESS }])
		expect(zone.querySelector('[role="status"]')?.textContent).toBe('')
	})
})

describe('le mot « indexe » ne se lit plus dans l’espace', () => {
	test('aucun texte de src/ ne dit « indexe », « indexer » ou « indexé »', () => {
		const found: string[] = []
		for (const file of new Glob('src/**/*.{ts,tsx,json}').scanSync('.')) {
			// The reason of a page left out of the public site map is a note of the code, not a text of her space.
			if (file.endsWith('payload-types.ts') || file === 'src/lib/seo/sitemap.ts') continue
			const lines = readFileSync(file, 'utf8').split('\n')
			lines.forEach((line, index) => {
				if (/\bindex(e|er|é|ée|ées|és)\b/i.test(line)) found.push(`${file}:${index + 1}`)
			})
		}
		expect(found).toEqual([])
	})
})
