import { describe, expect, test } from 'bun:test'
import { activityView } from '@/lib/dashboard/activity'
import { DASHBOARD_SIRET_MESSAGES, siretErrors, strictSiretSchema } from '@/lib/dashboard/siret'

/** The SIRET field of her space (issue 1004): optional, spaces allowed, the key checked, one key only. */

const ok = (siret: string) => strictSiretSchema.safeParse({ siret }).success

describe('le champ SIRET de l’espace', () => {
	test('vide, avec ou sans espaces autour : accepté (il est facultatif, vider le supprime)', () => {
		expect([ok(''), ok('   ')]).toEqual([true, true])
	})

	test('14 chiffres de clé juste, avec ou sans espaces, points ou tirets : accepté', () => {
		expect([ok('00000000100016'), ok('000 000 001 00016'), ok(' 000.000.001-00016 ')]).toEqual([true, true, true])
	})

	test('une faute de frappe, une lettre, 13 ou 15 chiffres : refusé, avec le bon message sous le champ', () => {
		const message = (siret: string) => {
			const parsed = strictSiretSchema.safeParse({ siret })
			return parsed.success ? null : siretErrors(parsed.error).siret
		}
		expect(message('00000000100017')).toBe(DASHBOARD_SIRET_MESSAGES.key)
		for (const wrong of ['0000000010001', '000000001000160', '0000000010001A'])
			expect(message(wrong)).toBe(DASHBOARD_SIRET_MESSAGES.shape)
	})

	test('une autre clé que « siret » refuse la requête entière', () => {
		expect(strictSiretSchema.safeParse({ siret: '', verified: true }).success).toBe(false)
		expect(strictSiretSchema.safeParse({ siret: '', outcome: 'active' }).success).toBe(false)
		expect(strictSiretSchema.safeParse({ siret: 12 }).success).toBe(false)
	})
})

describe('l’état du contrôle dit à la maquilleuse', () => {
	const row = (outcome: 'pending' | 'active' | 'ceased' | 'not-found', checkedAt: string | null = null) => ({
		id: 1,
		profile: 1,
		outcome,
		checkedAt,
		attemptedAt: null,
	})

	test('sans SIRET : rien, quelle que soit la ligne', () => {
		expect(activityView(null, null)).toEqual({ siret: null, state: 'none', checkedOn: null })
		expect(activityView('', row('active'))).toMatchObject({ state: 'none' })
	})

	test('avec un SIRET : le numéro formaté, et l’état de la ligne ; sans ligne, « à contrôler »', () => {
		expect(activityView('00000000100016', null)).toEqual({
			siret: '000 000 001 00016',
			state: 'pending',
			checkedOn: null,
		})
		expect(activityView('00000000100016', row('active', '2026-10-20T09:00:00.000Z'))).toEqual({
			siret: '000 000 001 00016',
			state: 'active',
			checkedOn: '20 octobre 2026',
		})
	})
})
