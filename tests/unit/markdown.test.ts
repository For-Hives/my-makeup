import { describe, expect, test } from 'bun:test'
import { markdownToHtml } from '@/lib/markdown'

/**
 * The markdown of the newsroom, turned into HTML (ticket 106): a script slid into a text does not come
 * out, the titles are lowered, and nothing says « null ».
 */

describe('markdownEnHtml : le markdown assaini', () => {
	test('un titre « # » devient un h2 : la page garde un seul h1', async () => {
		const html = await markdownToHtml('# Un titre\n\n## Une partie\n\n### Un détail\n\nDu texte.')
		expect(html).not.toContain('<h1')
		expect(html).toContain('<h2>Un titre</h2>')
		expect(html).toContain('<h2>Une partie</h2>')
		expect(html).toContain('<h3>Un détail</h3>')
	})

	test('un h1 écrit en HTML dans le texte ne passe pas non plus', async () => {
		const html = await markdownToHtml('<h1>Titre en dur</h1>\n\nDu texte.')
		expect(html).not.toContain('<h1')
	})

	test('un script glissé dans le texte ne sort pas', async () => {
		const html = await markdownToHtml('Avant\n\n<script>alert(1)</script>\n\nAprès <script>alert(2)</script> fin')
		expect(html).not.toMatch(/<script/i)
		expect(html).toContain('Avant')
		expect(html).toContain('Après')
	})

	test('un gestionnaire d’événement, un cadre et un objet ne sortent pas', async () => {
		const html = await markdownToHtml(
			'<img src="https://photos.example.test/a.webp" onerror="alert(1)">\n\n<iframe src="https://example.test"></iframe>\n\n<object data="x"></object>\n\n<a href="https://example.test" onclick="alert(1)">lien</a>'
		)
		expect(html).not.toMatch(/onerror|onclick|<iframe|<object/i)
	})

	test('un lien « javascript: » ou « data: » perd son adresse', async () => {
		const html = await markdownToHtml(
			'[a](javascript:alert(1)) [b](JaVaScRiPt:alert(2)) [c](data:text/html;base64,PHNjcmlwdD4=) ![d](javascript:alert(3))'
		)
		expect(html).not.toMatch(/javascript:/i)
		expect(html).not.toMatch(/data:text/i)
	})

	test('un lien normal et une image restent ; l’image se charge à la demande', async () => {
		const html = await markdownToHtml(
			'[Le site](https://example.test/page) et ![Un visage](https://photos.example.test/a.webp)'
		)
		expect(html).toContain('<a href="https://example.test/page">Le site</a>')
		expect(html).toContain('src="https://photos.example.test/a.webp"')
		expect(html).toContain('alt="Un visage"')
		expect(html).toContain('loading="lazy"')
	})

	test('un identifiant écrit à la main est préfixé : il ne prend pas la place d’un élément de la page', async () => {
		const html = await markdownToHtml('<h2 id="__next">Titre</h2>')
		expect(html).not.toContain('id="__next"')
	})

	test('le gras, les listes et les citations sont gardés', async () => {
		const html = await markdownToHtml('**gras**\n\n- un\n- deux\n\n> cité')
		expect(html).toContain('<strong>gras</strong>')
		expect(html).toContain('<li>deux</li>')
		expect(html).toContain('<blockquote>')
	})

	test('rien, null, undefined ou un nombre : une chaîne vide, jamais « null »', async () => {
		for (const vide of [undefined, null, '', '   \n ', 12, {}]) expect(await markdownToHtml(vide)).toBe('')
	})
})
