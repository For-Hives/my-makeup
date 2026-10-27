import { describe, expect, test } from 'bun:test'
import { backTarget } from '@/lib/dashboard/back-target'

/** The destination of the back arrow of her space (27/10/2026): one rule, never a loop. */
describe('backTarget : où mène la flèche « Retour » de l’espace', () => {
	test('l’aperçu de sa page et son édition mènent à l’espace', () => {
		expect(backTarget('/auth/apercu-profil')).toBe('/auth/profil')
		expect(backTarget('/auth/apercu-profil/')).toBe('/auth/profil')
	})

	test('l’espace lui-même n’a pas de flèche : elle mènerait à lui-même', () => {
		expect(backTarget('/auth/profil')).toBeNull()
	})

	test('la connexion, l’inscription, les pages de confirmation et le site public n’en ont pas (pas de boucle)', () => {
		for (const page of [
			'/auth/signin',
			'/auth/signup',
			'/auth/verification-wall',
			'/auth/verification-complete',
			'/auth/mot-de-passe-oublie',
			'/auth/reinitialiser',
			'/auth/error',
			'/auth',
			'/',
			'/profil/ana',
		])
			expect(backTarget(page)).toBeNull()
	})

	test('une adresse qui ressemble seulement à celle de l’aperçu n’en a pas', () => {
		expect(backTarget('/auth/apercu-profilx')).toBeNull()
	})

	test('la destination n’est jamais une page qui a elle-même une flèche, ni la connexion', () => {
		const target = backTarget('/auth/apercu-profil')
		expect(target).not.toBeNull()
		expect(backTarget(target ?? '')).toBeNull()
		expect(target).not.toContain('signin')
	})
})
