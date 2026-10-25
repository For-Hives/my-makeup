import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/** Coherence pass (25/10/2026): the text pages and the profile wear the art direction kit, not the old shells. */
const read = (file: string) => readFileSync(file, 'utf8')

describe('plan du site et classement dans le kit', () => {
	test.each([
		'src/components/site-map/SiteMapBody.tsx',
		'src/components/ranking/RankingExplainer.tsx',
	])('%s : titres en Bodoni, ni gras sans empattement ni gris hors jeton', file => {
		const source = read(file)
		expect(source).toContain('font-display')
		expect(source).toContain('PageHead')
		expect(source).not.toContain('font-bold')
		expect(source).not.toContain('text-gray-')
		expect(source).not.toContain('blocks/Hero')
	})

	test('la page du classement est enveloppée par ArtPage', () => {
		expect(read('src/app/(front)/(site)/classement/page.tsx')).toContain('<ArtPage>')
	})
})

describe('pages légales et pied d’article', () => {
	test('la coquille légale passe par ArtPage et PageHead, plus par le Hero ni ContentPage', () => {
		const source = read('src/components/legal/LegalPage.tsx')
		expect(source).toContain('<ArtPage>')
		expect(source).toContain('<PageHead')
		expect(source).not.toContain('ContentPage')
		expect(source).not.toContain('blocks/Hero')
	})

	test('le pied d’un article montre des cartes en arche (ProfileGrid), plus l’ancien bloc', () => {
		const source = read('src/app/(front)/(site)/blog/[slug]/page.tsx')
		expect(source).toContain('<ProfileGrid')
		expect(source).not.toContain('blocks/ProfileBlock')
	})
})

describe('page publique d’un profil', () => {
	test('elle est enveloppée de .profile-art sur fond papier ; le HTML gelé de ProfileView n’est pas touché', () => {
		const page = read('src/app/(front)/(site)/profil/[slug]/page.tsx')
		expect(page).toContain('profile-art')
		expect(page).toContain('bg-art-paper')
		const css = read('src/app/(front)/globals.css')
		expect(css).not.toContain('.profile-art :is(h1, h2)')
		expect(css).toContain('.profile-art section.reveal')
	})
})
