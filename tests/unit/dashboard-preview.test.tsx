import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { PreviewBanner } from '@/components/dashboard/PreviewBanner'
import { DASHBOARD_PATH, PREVIEW_PATH, previewState } from '@/lib/dashboard/preview'

/**
 * The preview of her own page (ticket 139; plan 02 RG-06): the banner says where her profile stands,
 * from the three rules of the public reading, and leads back to her space. The page itself is checked
 * on the bench (tests/integration/dashboard-preview.test.ts, tests/e2e/dashboard-preview.spec.ts).
 */

const FULL = { status: 'published', available: true, fullyEmpty: false, publishable: true, indexable: true } as const

describe('139 : l’état que dit le bandeau', () => {
	test('profil complet, publié, available : « ta page telle que les visiteuses la voient »', () => {
		expect(previewState(FULL).code).toBe('complet')
	})

	test('un profil dont la disponibilité n’a jamais été donnée compte comme disponible', () => {
		expect(previewState({ ...FULL, available: null }).code).toBe('complet')
	})

	test('masqué par l’équipe : le dit, avant tout le reste', () => {
		expect(previewState({ ...FULL, status: 'hidden', fullyEmpty: true, available: false }).code).toBe('masque')
	})

	test('entièrement vide : pas listé', () => {
		expect(
			previewState({ status: 'draft', available: true, fullyEmpty: true, publishable: false, indexable: false }).code
		).toBe('vide')
	})

	test('indisponible : écarté de la recherche', () => {
		expect(previewState({ ...FULL, available: false }).code).toBe('indisponible')
	})

	test('rempli mais pas publiable : visible, pas référencé, et il lui manque photo, ville, spécialité ou contact', () => {
		const state = previewState({ ...FULL, publishable: false, indexable: false })
		expect(state.code).toBe('non-publiable')
		expect(state.texte).toContain('un moyen de te contacter')
	})

	test('publiable mais pas indexable : publié, Google demande une description et un prix ou des photos', () => {
		const state = previewState({ ...FULL, indexable: false })
		expect(state.code).toBe('non-indexable')
		expect(state.texte).toContain('100 caractères')
		expect(state.texte).toContain('un prix ou des photos')
		expect(previewState({ ...FULL, indexable: null }).code).toBe('non-indexable')
	})
})

describe('139 : le bandeau', () => {
	test('dit l’état, ne contient ni « null » ni « undefined », et mène à l’espace', () => {
		for (const profile of [
			FULL,
			{ ...FULL, status: 'hidden' },
			{ ...FULL, fullyEmpty: true },
			{ ...FULL, available: false },
			{ ...FULL, publishable: false },
			{ ...FULL, indexable: false },
		]) {
			const state = previewState(profile)
			const html = renderToStaticMarkup(<PreviewBanner etat={state} />)
			expect(html).toContain(`data-etat="${state.code}"`)
			expect(html).toContain(state.titre)
			expect(html).toContain(`href="${DASHBOARD_PATH}"`)
			expect(html).toContain('Modifier mon profil')
			expect(html).not.toMatch(/\b(?:undefined|null)\b/)
		}
	})

	test('l’aperçu est une page de l’espace : privée et sans cache comme lui', async () => {
		const { isPrivatePage: isPagePrivate } = await import('@/lib/auth/closed-dashboard')
		expect(PREVIEW_PATH.startsWith('/auth/')).toBe(true)
		expect(isPagePrivate(PREVIEW_PATH)).toBe(true)
	})
})
