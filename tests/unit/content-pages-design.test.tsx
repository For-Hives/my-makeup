import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { pageText } from '../support/page-text'

/**
 * The design pass on the public content pages (issue 1102). Two promises: the words did not move (every line of the
 * pages as they were before the pass, kept in tests/fixtures/content-pages-text.json, is still there, in order), and
 * the pages are laid out as components (a numbered list of steps, no `prose` class that nothing defines, the
 * art-direction faces on the page, reveal on the blocks, one h1).
 */

const BEFORE: Record<string, string[]> = JSON.parse(
	readFileSync(path.join(process.cwd(), 'tests/fixtures/content-pages-text.json'), 'utf8')
)

const FOLDERS: Record<string, string> = {
	'/a-propos': 'a-propos',
	'/maquilleuse/partenariats': 'maquilleuse/partenariats',
	'/particulier/trouver-une-maquilleuse': 'particulier/trouver-une-maquilleuse',
	'/particulier/centraliser-ses-recherches': 'particulier/centraliser-ses-recherches',
	'/particulier/explorer-les-profils': 'particulier/explorer-les-profils',
	'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse': 'pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
	'/pourquoi-utiliser-my-makeup-en-tant-que-particulier': 'pourquoi-utiliser-my-makeup-en-tant-que-particulier',
	'/solutions/pour-les-maquilleuses': 'solutions/pour-les-maquilleuses',
	'/solutions/pour-les-particuliers': 'solutions/pour-les-particuliers',
	'/demande-envoyee': 'demande-envoyee',
}

const GUIDES = [
	'/particulier/trouver-une-maquilleuse',
	'/particulier/centraliser-ses-recherches',
	'/particulier/explorer-les-profils',
	'/solutions/pour-les-particuliers',
]
const ARTICLES = ['/a-propos', '/maquilleuse/partenariats', '/solutions/pour-les-maquilleuses']
const BENEFITS = [
	'/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
	'/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
]

async function render(url: string): Promise<string> {
	const mod = await import(`../../src/app/(front)/(site)/${FOLDERS[url]}/page`)
	return renderToStaticMarkup(<mod.default />)
}

describe('les mots n’ont pas bougé', () => {
	for (const [url, lines] of Object.entries(BEFORE)) {
		test(`${url} : chaque ligne d’avant est encore là, dans l’ordre`, async () => {
			const after = pageText(await render(url)).split('\n')
			let from = 0
			const missing: string[] = []
			for (const line of lines) {
				const at = after.indexOf(line, from)
				if (at === -1) missing.push(line)
				else from = at + 1
			}
			expect(missing).toEqual([])
		})
	}
})

describe('la mise en forme', () => {
	for (const url of Object.keys(FOLDERS)) {
		test(`${url} : un seul h1, les polices de la direction artistique, aucune classe prose`, async () => {
			const html = await render(url)
			expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
			expect(html).toContain('content-page')
			expect(html).not.toMatch(/class="[^"]*\bprose\b/)
		})
	}

	for (const url of GUIDES) {
		test(`${url} : les étapes sont une liste numérotée, chacune avec son numéro et son apparition`, async () => {
			const html = await render(url)
			expect(html).toMatch(/<ol[^>]*>/)
			const steps = html.match(/<li[^>]*data-step="\d+"/g) ?? []
			expect(steps.length).toBeGreaterThanOrEqual(3)
			expect(html).toMatch(/<li[^>]*class="[^"]*\breveal\b/)
			expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>/)
		})
	}

	for (const url of ARTICLES) {
		test(`${url} : les parties sont des sections à titre h3, chacune avec son apparition, l’emoji est décoratif`, async () => {
			const html = await render(url)
			expect(html).toMatch(/<h3[^>]*>[^<]*<span[^>]*aria-hidden="true"[^>]*>[^<]+<\/span><\/h3>/)
			expect((html.match(/<section[^>]*class="[^"]*\breveal\b/g) ?? []).length).toBeGreaterThanOrEqual(4)
			expect(html).toMatch(/<h2[^>]*>[^<]+<\/h2>/)
		})
	}

	for (const url of BENEFITS) {
		test(`${url} : les avantages sont une seule liste de cartes, sans coche verte`, async () => {
			const html = await render(url)
			expect(html).toContain('data-benefits')
			expect(html).not.toMatch(/text-green-/)
			expect((html.match(/<li[^>]*data-benefit/g) ?? []).length).toBeGreaterThanOrEqual(6)
		})
	}
})
