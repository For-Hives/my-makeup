import { describe, expect, test } from 'bun:test'
import type { DashboardProfile } from '@/lib/dashboard/dashboard-profile'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { benchOf, EMPTY, FULL } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Zone and travels on her own page in edit mode (issue 1019): the sentence of her travels is a block, it
 * edits the same zone as the header (one field, the radius, « à domicile »), a zone to review is told by
 * the placeholder, and a failure keeps what she typed.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const status = () => doc().querySelector('[data-testid="edit-status"]')?.textContent
const TO_REVIEW = {
	id: 3,
	firstName: 'Zoé',
	lastName: 'Revue',
	zoneReview: {
		reason: 'shared-postal-code',
		postalCode: '62390',
		candidates: [{ inseeCode: '62030', name: 'Auxi-le-Château', department: '62' }],
	},
} as unknown as DashboardProfile

describe('le bloc des déplacements', () => {
	test('est un bouton nommé pour ce qu’il change, et la phrase de la visiteuse y est', async () => {
		await benchOf(window_).mount()
		expect(window_.bouton('Modifier mes déplacements').getAttribute('aria-expanded')).toBe('false')
		expect(doc().body.textContent).toContain('Se déplace à domicile, jusqu’à 30 km d’Annecy')
	})

	test('sans déplacement, il reste sur la page et dit quoi faire', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		expect(doc().body.textContent).toContain('Dis si tu te déplaces.')
		expect(doc().body.textContent).toContain('jamais ton adresse')
	})

	test('une zone à revoir est dite par le texte d’invitation, pas par un bandeau sur la page', async () => {
		await benchOf(window_, { profile: TO_REVIEW }).mount()
		expect(doc().body.textContent).toContain('Ta zone est à revoir.')
		expect(doc().querySelector('[data-testid="zone-review-banner"]')).toBeNull()
		expect(doc().querySelectorAll('[data-direct-edit-empty]').length).toBeGreaterThan(0)
	})
})

describe('l’édition', () => {
	test('le rayon se règle sur place et part avec la commune enregistrée, sans adresse', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes déplacements'))
		expect(doc().querySelector('[data-direct-edit-editor]')?.textContent).toContain('Tu modifies : Mes déplacements')
		await window_.saisir(window_.champ(/Rayon d’action/), '50')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.savePlace?.length || null)
		expect(bench.calls.savePlace).toEqual([{ kind: 'city', codeInsee: '74010', rayonKm: 50, aDomicile: true }])
		await window_.attendre(() => status() === 'Enregistré à l’instant' || null)
		expect(bench.refreshes).toBe(1)
	})

	test('« à domicile » se décoche sur place', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes déplacements'))
		await window_.cliquer(window_.champ('Je me déplace à domicile'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.savePlace?.length || null)
		expect((bench.calls.savePlace?.[0] as { aDomicile: boolean }).aDomicile).toBe(false)
	})

	test('un rayon refusé par le navigateur est dit sous le champ, rien n’est envoyé', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes déplacements'))
		await window_.saisir(window_.champ(/Rayon d’action/), '5000')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => doc().querySelector('[aria-invalid="true"]') || null)
		expect(bench.calls.savePlace).toBeUndefined()
	})

	test('un échec garde la saisie et le dit en français', async () => {
		const bench = benchOf(window_, { actions: { savePlace: async () => ({ ok: false, message: FAILURE_MESSAGE }) } })
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes déplacements'))
		await window_.saisir(window_.champ(/Rayon d’action/), '45')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect((window_.champ(/Rayon d’action/) as HTMLInputElement).value).toBe('45')
		expect(bench.refreshes).toBe(0)
	})

	test('le lien « Je travaille à l’étranger » reste proposé dans l’éditeur', async () => {
		await benchOf(window_, { profile: FULL }).mount()
		await window_.cliquer(window_.bouton('Modifier mes déplacements'))
		expect(doc().body.textContent).toContain('Je travaille à l’étranger')
	})
})
