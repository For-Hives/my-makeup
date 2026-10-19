import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BandeauDApercu } from '@/components/dashboard/BandeauDApercu'
import { CHEMIN_DE_L_APERCU, CHEMIN_DE_L_ESPACE, etatDeLApercu } from '@/lib/dashboard/apercu'

/**
 * The preview of her own page (ticket 139; plan 02 RG-06): the banner says where her profile stands,
 * from the three rules of the public reading, and leads back to her space. The page itself is checked
 * on the bench (tests/integration/espace-apercu.test.ts, tests/e2e/espace-apercu.spec.ts).
 */

const COMPLET = { status: 'published', available: true, fullyEmpty: false, publishable: true } as const

describe('139 : l’état que dit le bandeau', () => {
	test('profil complet, publié, available : « ta page telle que les visiteuses la voient »', () => {
		expect(etatDeLApercu(COMPLET).code).toBe('complet')
	})

	test('un profil dont la disponibilité n’a jamais été donnée compte comme disponible', () => {
		expect(etatDeLApercu({ ...COMPLET, available: null }).code).toBe('complet')
	})

	test('masqué par l’équipe : le dit, avant tout le reste', () => {
		expect(etatDeLApercu({ ...COMPLET, status: 'hidden', fullyEmpty: true, available: false }).code).toBe('masque')
	})

	test('entièrement vide : pas listé', () => {
		expect(etatDeLApercu({ status: 'draft', available: true, fullyEmpty: true, publishable: false }).code).toBe('vide')
	})

	test('indisponible : écarté de la recherche', () => {
		expect(etatDeLApercu({ ...COMPLET, available: false }).code).toBe('indisponible')
	})

	test('rempli mais pas publishable : visible, pas référencé', () => {
		expect(etatDeLApercu({ ...COMPLET, publishable: false }).code).toBe('non-publiable')
	})
})

describe('139 : le bandeau', () => {
	test('dit l’état, ne contient ni « null » ni « undefined », et mène à l’espace', () => {
		for (const profil of [
			COMPLET,
			{ ...COMPLET, status: 'hidden' },
			{ ...COMPLET, fullyEmpty: true },
			{ ...COMPLET, available: false },
			{ ...COMPLET, publishable: false },
		]) {
			const etat = etatDeLApercu(profil)
			const html = renderToStaticMarkup(<BandeauDApercu etat={etat} />)
			expect(html).toContain(`data-etat="${etat.code}"`)
			expect(html).toContain(etat.titre)
			expect(html).toContain(`href="${CHEMIN_DE_L_ESPACE}"`)
			expect(html).toContain('Modifier mon profil')
			expect(html).not.toMatch(/\b(?:undefined|null)\b/)
		}
	})

	test('l’aperçu est une page de l’espace : privée et sans cache comme lui', async () => {
		const { isPrivatePage: estPagePrivee } = await import('@/lib/auth/closed-dashboard')
		expect(CHEMIN_DE_L_APERCU.startsWith('/auth/')).toBe(true)
		expect(estPagePrivee(CHEMIN_DE_L_APERCU)).toBe(true)
	})
})
