import { describe, expect, test } from 'bun:test'
import { MEDIAN_MINIMUM, medianPrice, OFFER_MODELS, offerMedians, offerModelOf } from '@/lib/price-median'

/**
 * The market hint of the onboarding (issue 1009): the median of the amounts of the published offers
 * of one model, only from a sample large enough that it names nobody.
 */

describe('la médiane des prix', () => {
	test('en dessous du seuil, aucune aide : une médiane de quelques profils désignerait quelqu’un', () => {
		expect(MEDIAN_MINIMUM).toBe(5)
		expect(medianPrice([])).toBeNull()
		expect(medianPrice([100, 120, 140, 160])).toBeNull()
	})

	test('au seuil, la valeur du milieu', () => {
		expect(medianPrice([160, 100, 140, 120, 200])).toBe(140)
	})

	test('un nombre pair de prix : la moyenne des deux du milieu, arrondie à l’euro', () => {
		expect(medianPrice([100, 120, 141, 160, 181, 300])).toBe(151)
	})

	test('un montant qui n’en est pas un est ignoré, et ne compte pas dans l’échantillon', () => {
		expect(medianPrice([100, 120, 140, 160, Number.NaN, -3])).toBeNull()
		expect(medianPrice([100, 120, 140, 160, 200, Number.NaN])).toBe(140)
	})
})

describe('les modèles de prestation', () => {
	test('trois modèles, ceux de l’édition directe, avec leur nom de prestation', () => {
		expect(OFFER_MODELS.map(({ label, name }) => [label, name])).toEqual([
			['Mariée', 'Maquillage de la mariée'],
			['Soirée', 'Maquillage de soirée'],
			['Essai', 'Essai maquillage'],
		])
	})

	test('le nom d’une prestation dit son modèle, sans accent ni casse', () => {
		expect(offerModelOf('Maquillage de la mariée')?.label).toBe('Mariée')
		expect(offerModelOf('MARIAGE – maquillage complet')?.label).toBe('Mariée')
		expect(offerModelOf('Maquillage soirée')?.label).toBe('Soirée')
		expect(offerModelOf('Essai maquillage mariée')?.label).toBe('Essai')
		expect(offerModelOf('Cours d’auto-maquillage')).toBeNull()
		expect(offerModelOf(null)).toBeNull()
	})

	test('les médianes par modèle : seulement celles qui passent le seuil', () => {
		const offers = [
			...[100, 120, 140, 160, 200].map(amount => ({ name: 'Maquillage de la mariée', amount })),
			...[50, 60].map(amount => ({ name: 'Maquillage de soirée', amount })),
			{ name: 'Cours', amount: 90 },
			{ name: 'Essai maquillage', amount: null },
		]
		expect(offerMedians(offers)).toEqual({ Mariée: 140, Soirée: null, Essai: null })
	})
})
