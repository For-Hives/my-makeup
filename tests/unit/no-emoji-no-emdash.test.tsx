import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Collaboration } from '@/components/home/Collaboration'
import { Presentation } from '@/components/home/Presentation'
import { Project } from '@/components/home/Project'
import { Footer } from '@/components/layout/Footer'
import { profileTitle } from '@/lib/seo/profile'
import { pageText } from '../support/page-text'

/**
 * The text of the public site has no emoji and no dash used as a sentence dash (issue 1135, owner feedback of
 * 26/10/2026: « trop IA slop »). The guard reads what a visitor reads: the rendered text of the public pages (through
 * `pageText`, the helper of the legal and content page tests), their titles and descriptions, the footer, the home
 * sections, the profile title, and the text fixtures. Code comments and the content kept in the database (articles,
 * profiles) are not read here.
 *
 * Allowlist (kept short on purpose):
 * - `©`, `®` and `™` are in Unicode's Extended_Pictographic set but are legal marks, not pictures;
 * - an en dash with no space around it is a compound name (« UE–États-Unis », the name of a data transfer framework in
 *   the privacy policy), not a sentence dash. Only a spaced en dash (« mot – mot ») is refused.
 * Regional indicators (the flags of a zone abroad on a profile) are not Extended_Pictographic: they are information,
 * not decoration, and no page read here shows them.
 */

const PICTOGRAPH = /\p{Extended_Pictographic}/u
const MARKS = /[©®™]/gu
const EM_DASH = /—/u
const HALF_EM_SENTENCE_DASH = /\s–\s/u

/** What is wrong with a text, as a short list (empty when it is clean). */
function problems(text: string): string[] {
	const found: string[] = []
	const withoutMarks = text.replace(MARKS, '')
	const emoji = withoutMarks.match(new RegExp(PICTOGRAPH, 'gu'))
	if (emoji) found.push(`emoji: ${[...new Set(emoji)].join(' ')}`)
	if (EM_DASH.test(text)) found.push('em dash (U+2014)')
	if (HALF_EM_SENTENCE_DASH.test(text)) found.push('en dash used as a sentence dash (U+2013)')
	return found
}

/** The visible text of a page, then its metadata (title and description), as one list of lines to check. */
async function pageLines(folder: string): Promise<string[]> {
	const mod = await import(`../../src/app/(front)/(site)/${folder}/page`)
	const lines = pageText(renderToStaticMarkup(<mod.default />)).split('\n')
	const meta = mod.metadata as { title?: unknown; description?: unknown } | undefined
	const title = meta?.title
	const titles =
		typeof title === 'string' ? [title] : title ? [String((title as { absolute?: string }).absolute ?? '')] : []
	return [...lines, ...titles, String(meta?.description ?? '')]
}

const FOLDERS = [
	'a-propos',
	'maquilleuse/partenariats',
	'particulier/trouver-une-maquilleuse',
	'particulier/centraliser-ses-recherches',
	'particulier/explorer-les-profils',
	'pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
	'pourquoi-utiliser-my-makeup-en-tant-que-particulier',
	'solutions/pour-les-maquilleuses',
	'solutions/pour-les-particuliers',
	'demande-envoyee',
	'mentions-legales',
	'cgu',
	'politique-de-confidentialite',
]

describe('le guard : ni emoji ni tiret cadratin dans les textes visibles', () => {
	test('le détecteur reconnaît ce qu’il doit refuser et laisse passer ce qu’il doit laisser', () => {
		expect(problems('Notre histoire 📜')).toHaveLength(1)
		expect(problems('Recherche par ville 🏙️')).toHaveLength(1)
		expect(problems('Un mot — un autre')).toEqual(['em dash (U+2014)'])
		expect(problems('Un mot – un autre')).toHaveLength(1)
		expect(problems('© 2026 My-Makeup, cadre UE–États-Unis, 10–20 km, ✓, →, Notre histoire')).toEqual([])
	})

	for (const folder of FOLDERS) {
		test(`/${folder} : le texte rendu, le titre et la description sont propres`, async () => {
			const lines = await pageLines(folder)
			const bad = lines.map(line => ({ line, found: problems(line) })).filter(({ found }) => found.length > 0)
			expect(bad).toEqual([])
		})
	}

	test('le pied de page et les sections de l’accueil sont propres', () => {
		for (const [name, html] of [
			['Footer', renderToStaticMarkup(<Footer />)],
			['Collaboration', renderToStaticMarkup(<Collaboration />)],
			['Presentation', renderToStaticMarkup(<Presentation />)],
			['Project', renderToStaticMarkup(<Project />)],
		] as const)
			expect({ name, found: problems(pageText(html)) }).toEqual({ name, found: [] })
	})

	test('le titre d’un profil sépare le nom et le détail par une virgule', () => {
		const title = profileTitle({ nom: 'Léa Martin', specialite: 'Maquillage mariage', lieu: 'Annecy' })
		expect(title).toBe('Léa Martin, Maquillage mariage à Annecy | My-Makeup')
		expect(problems(title)).toEqual([])
	})

	test('les fixtures de texte des pages de contenu sont propres', () => {
		const fixture = JSON.parse(
			readFileSync(path.join(process.cwd(), 'tests/fixtures/content-pages-text.json'), 'utf8')
		) as Record<string, string[]>
		const bad = Object.entries(fixture).flatMap(([url, lines]) =>
			lines.filter(line => problems(line).length > 0).map(line => `${url} : ${line}`)
		)
		expect(bad).toEqual([])
	})

	test('les fichiers de textes des pages de contenu n’ont ni emoji ni tiret cadratin', () => {
		for (const file of ['src/components/static-pages/artist-texts.ts', 'src/content/static-pages/client-guides.tsx']) {
			const text = readFileSync(path.join(process.cwd(), file), 'utf8')
			expect({ file, found: problems(text) }).toEqual({ file, found: [] })
		}
	})
})
