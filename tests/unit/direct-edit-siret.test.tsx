import { describe, expect, test } from 'bun:test'
import { stateSentence } from '@/components/direct-edit/blocks/SiretBlock'
import type { ActivityView } from '@/lib/dashboard/activity'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { benchOf, EMPTY } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Her SIRET on her own page in edit mode (issue 1004): a private card, optional, with where the check stands. It
 * is absent from the page a visitor sees, says that nothing is shown and that leaving it empty costs nothing, takes
 * spaces, and refuses a typo in the browser. Made-up numbers only.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const NONE: ActivityView = { siret: null, state: 'none', checkedOn: null }
const view = (state: ActivityView['state'], checkedOn: string | null = null): ActivityView => ({
	siret: '000 000 001 00016',
	state,
	checkedOn,
})
const open = async (activity: ActivityView, actions = {}) => {
	const bench = benchOf(window_, { profile: EMPTY, activity, actions })
	await bench.mount()
	await window_.cliquer(window_.bouton('Modifier mon SIRET'))
	return bench
}
const typeIn = (text: string) => window_.saisir(window_.champ('Numéro SIRET (14 chiffres)'), text)

describe('la carte', () => {
	test('sans SIRET : une invitation facultative, qui dit que lui seule le voit', async () => {
		await benchOf(window_, { profile: EMPTY, activity: NONE }).mount()
		const text = doc().body.textContent ?? ''
		expect(text).toContain('Ajoute ton SIRET (facultatif).')
		expect(text).toContain('Tu es la seule à le voir.')
	})

	test('sans l’état de l’espace, la page n’a aucune carte de SIRET', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		expect(doc().body.textContent).not.toContain('SIRET')
	})

	test.each([
		['pending', 'Le contrôle a lieu dans la journée'],
		['active', 'Le badge « Activité vérifiée » s’affiche sur ta page. Dernier contrôle : le 20 octobre 2026.'],
		['ceased', 'cette activité est cessée'],
		['not-found', 'introuvable dans l’annuaire public'],
	] as const)('état %s : le dit, avec le numéro formaté', async (state, sentence) => {
		await benchOf(window_, { profile: EMPTY, activity: view(state, '20 octobre 2026') }).mount()
		const text = doc().body.textContent ?? ''
		expect(text).toContain('000 000 001 00016')
		expect(text).toContain(sentence)
		expect(stateSentence(view(state, '20 octobre 2026'))).toContain(sentence)
	})
})

describe('l’édition', () => {
	test('le formulaire dit à quoi sert le numéro, qu’il n’est jamais affiché, et que le laisser vide ne coûte rien', async () => {
		await open(NONE)
		const text = doc().body.textContent ?? ''
		expect(text).toContain('Facultatif.')
		expect(text).toContain('Il n’est jamais affiché ni transmis aux clientes.')
		expect(text).toContain('Sans SIRET, tu n’es ni moins bien classée ni moins bien placée dans la recherche.')
		expect(doc().querySelector('a[href="/classement#activite-verifiee"]')).not.toBeNull()
	})

	test('une faute de frappe est refusée dans le navigateur, rien n’est envoyé', async () => {
		const bench = await open(NONE)
		await typeIn('12345678901234')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => doc().querySelector('#direct-siret-error') || null)
		expect(doc().querySelector('#direct-siret-error')?.textContent).toContain('faute de frappe')
		expect(bench.calls.saveSiret).toBeUndefined()
	})

	test('un SIRET de 13 chiffres est refusé en français', async () => {
		const bench = await open(NONE)
		await typeIn('1234567890123')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => doc().querySelector('#direct-siret-error') || null)
		expect(doc().querySelector('#direct-siret-error')?.textContent).toContain('14 chiffres')
		expect(bench.calls.saveSiret).toBeUndefined()
	})

	test('avec des espaces : accepté, envoyé tel qu’il est tapé (le serveur les retire), page relue', async () => {
		const bench = await open(NONE)
		await typeIn('000 000 001 00016')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveSiret?.length || null)
		expect(bench.calls.saveSiret).toEqual([{ siret: '000 000 001 00016' }])
		expect(bench.refreshes).toBe(1)
	})

	test('vider le champ s’enregistre : le SIRET et le badge s’en vont', async () => {
		const bench = await open(view('active', '20 octobre 2026'))
		await typeIn('')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveSiret?.length || null)
		expect(bench.calls.saveSiret).toEqual([{ siret: '' }])
	})

	test('un échec du serveur est dit, la saisie reste', async () => {
		await open(NONE, { saveSiret: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await typeIn('000000001 00016')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => doc().querySelector('[role="alert"]') || null)
		expect(doc().querySelector('[role="alert"]')?.textContent).toContain(FAILURE_MESSAGE)
		expect((window_.champ('Numéro SIRET (14 chiffres)') as HTMLInputElement).value).toBe('000000001 00016')
	})
})
