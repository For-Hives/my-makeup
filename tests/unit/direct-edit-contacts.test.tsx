import { describe, expect, test } from 'bun:test'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import { benchOf, EMPTY, FULL } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Coordonnées on her own page in edit mode (issue 1020): the phone and the contact email are edited in
 * place, only with her explicit and dated choice; hidden details are told in the block; the button
 * « Contacter » follows the ways of reaching her that are shown.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const HIDDEN = {
	...(FULL as object),
	networks: {},
	publicContact: false,
	consentedAt: null,
} as unknown as DashboardProfile
const open = async (profile: DashboardProfile = FULL, actions = {}) => {
	const bench = benchOf(window_, { profile, actions })
	await bench.mount()
	await window_.cliquer(window_.bouton('Modifier mes coordonnées'))
	return bench
}

describe('le bloc', () => {
	test('est un bouton nommé pour ce qu’il change, avec le téléphone et l’email que voit la visiteuse', async () => {
		await benchOf(window_).mount()
		expect(window_.bouton('Modifier mes coordonnées').getAttribute('aria-expanded')).toBe('false')
		expect(doc().body.textContent).toContain('06 12 34 56 78')
		expect(doc().body.textContent).toContain('ines@example.test')
	})

	test('vide, il dit quoi faire et que rien ne s’affiche sans le choix de la maquilleuse', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		expect(doc().body.textContent).toContain('Ajoute ton téléphone ou ton email.')
		expect(doc().body.textContent).toContain('Ils ne s’affichent que si tu le choisis.')
	})

	test('des coordonnées enregistrées mais cachées sont dites, rien n’est montré à la visiteuse', async () => {
		await benchOf(window_, { profile: HIDDEN }).mount()
		expect(doc().body.textContent).toContain('Tes coordonnées ne s’affichent pas.')
		expect(doc().body.textContent).not.toContain('06 12 34 56 78')
		expect(doc().body.textContent).not.toContain('ines@example.test')
	})

	test('le bouton « Contacter » suit les moyens de contact montrés', async () => {
		await benchOf(window_, { profile: HIDDEN }).mount()
		expect(doc().body.textContent).not.toContain('Contacter')
		await window_.demonter()
		await benchOf(window_).mount()
		expect(doc().body.textContent).toContain('Contacter')
	})
})

describe('l’édition', () => {
	test('retirer son consentement part avec le téléphone et l’email, et le dit', async () => {
		const bench = await open()
		expect(doc().body.textContent).toContain('Tu as choisi de les montrer le 1 octobre 2026.')
		await window_.cliquer(window_.champ('Afficher mon téléphone et mon email sur ma page'))
		expect(doc().body.textContent).toContain('ils disparaissent de ta page dès l’enregistrement')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveContacts?.length || null)
		expect(bench.calls.saveContacts).toEqual([
			{ telephone: '06 12 34 56 78', email: 'ines@example.test', contactPublic: false },
		])
		expect(bench.refreshes).toBe(1)
	})

	test('la requête ne porte jamais de date de consentement : le serveur la pose', async () => {
		const bench = await open(HIDDEN)
		await window_.cliquer(window_.champ('Afficher mon téléphone et mon email sur ma page'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveContacts?.length || null)
		expect(Object.keys(bench.calls.saveContacts?.[0] as object).sort()).toEqual(['contactPublic', 'email', 'telephone'])
	})

	test('un numéro invalide est dit sous le champ, rien n’est envoyé', async () => {
		const bench = await open()
		await window_.saisir(window_.champ('Téléphone'), 'abc')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Ce numéro n’est pas valide') || null)
		expect(bench.calls.saveContacts).toBeUndefined()
	})

	test('un email invalide est dit sous le champ', async () => {
		const bench = await open()
		await window_.saisir(window_.champ('Email de contact'), 'pas-un-email')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Cet email n’est pas valide') || null)
		expect(bench.calls.saveContacts).toBeUndefined()
	})

	test('un échec garde la saisie, la session expirée aussi', async () => {
		await open(FULL, { saveContacts: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await window_.saisir(window_.champ('Téléphone'), '06 99 88 77 66')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect((window_.champ('Téléphone') as HTMLInputElement).value).toBe('06 99 88 77 66')
		await window_.demonter()
		await open(FULL, { saveContacts: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) })
		await window_.saisir(window_.champ('Téléphone'), '06 99 88 77 66')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(MESSAGE_SESSION) || null)
		expect((window_.champ('Téléphone') as HTMLInputElement).value).toBe('06 99 88 77 66')
	})
})
