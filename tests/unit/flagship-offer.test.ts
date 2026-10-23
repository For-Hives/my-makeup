import { describe, expect, test } from 'bun:test'
import { FLAGSHIP_MESSAGES, flagshipErrors, flagshipRows } from '@/lib/dashboard/flagship-offer'
import type { SavedRow } from '@/lib/dashboard/list'

/**
 * The flagship offer of the onboarding (issue 1009): one name, one price. It joins the offers she
 * already has without erasing one, and without a duplicate. Made-up offers only.
 */

const OLD: SavedRow = {
	id: 'a1',
	valeurs: { name: 'Cours d’auto-maquillage', description: 'Deux heures', price: '' },
	options: [{ id: 'o1', valeurs: { name: 'Fiche', description: '', price: '10' } }],
}

describe('les erreurs : un nom, un montant', () => {
	test('un nom et un montant lu : rien à dire', () => {
		expect(flagshipErrors({ name: 'Maquillage de la mariée', price: 'à partir de 150 €' })).toEqual({})
	})

	test('sans nom, le message du nom ; sans montant, celui du prix', () => {
		expect(flagshipErrors({ name: '  ', price: '150' })).toEqual({ name: FLAGSHIP_MESSAGES.name })
		expect(flagshipErrors({ name: 'Essai', price: '' })).toEqual({ price: FLAGSHIP_MESSAGES.price })
	})

	test('« sur devis » n’est pas un montant : l’étape ne le prend pas, la page ne serait pas publiable', () => {
		expect(flagshipErrors({ name: 'Essai', price: 'sur devis' })).toEqual({ price: FLAGSHIP_MESSAGES.price })
	})

	test('un montant hors des bornes du site est refusé comme tel', () => {
		expect(flagshipErrors({ name: 'Essai', price: '2' }).price).toBe(FLAGSHIP_MESSAGES.price)
		expect(flagshipErrors({ name: 'Essai', price: '99999' }).price).toBe(FLAGSHIP_MESSAGES.price)
	})
})

describe('la liste envoyée : l’existant d’abord, rien d’effacé', () => {
	test('sans prestation, une ligne', () => {
		expect(flagshipRows([], { name: ' Essai maquillage ', price: '80' })).toEqual([
			{ valeurs: { name: 'Essai maquillage', description: '', price: '80' } },
		])
	})

	test('les prestations qu’elle a déjà restent, avec leur identifiant, sans toucher à leurs options', () => {
		const rows = flagshipRows([OLD], { name: 'Maquillage de soirée', price: '90' })
		expect(rows).toEqual([
			{ id: 'a1', valeurs: OLD.valeurs },
			{ valeurs: { name: 'Maquillage de soirée', description: '', price: '90' } },
		])
		// No `options` key: the server keeps the stored ones.
		expect('options' in (rows[0] ?? {})).toBe(false)
	})

	test('une prestation de même nom (casse, accents) reçoit le prix au lieu d’un doublon, sa description reste', () => {
		const stored: SavedRow = {
			id: 'b2',
			valeurs: { name: 'Maquillage de la mariée', description: 'Tenue longue', price: '' },
		}
		expect(flagshipRows([OLD, stored], { name: 'MAQUILLAGE DE LA MARIEE', price: '150' })).toEqual([
			{ id: 'a1', valeurs: OLD.valeurs },
			{ id: 'b2', valeurs: { name: 'Maquillage de la mariée', description: 'Tenue longue', price: '150' } },
		])
	})
})
