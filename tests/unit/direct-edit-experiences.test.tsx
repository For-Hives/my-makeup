import { describe, expect, test } from 'bun:test'
import { benchOf, EMPTY } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Her experiences, edited in place on her own page (issue 1022): the last list of her old space that had no block.
 * The seven rules L1 to L7 of the lists edited in place hold here as for the courses (tests/unit/direct-edit-about.test.tsx).
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const announced = () => doc().querySelector('[data-testid="removal-announcement"]')?.textContent
const rows = () => [...doc().querySelectorAll('[data-row]')].map(row => row.textContent)

type Sent = { lignes: { id?: string; valeurs: Record<string, string> }[] }

describe('le bloc des expériences', () => {
	test('un bouton nommé pour ce qu’il change, et le texte de la visiteuse reste', async () => {
		await benchOf(window_).mount()
		expect(window_.bouton('Modifier mes expériences').getAttribute('aria-expanded')).toBe('false')
		expect(doc().body.textContent).toContain('Studio Fictif')
	})

	test('vide, il reste sur la page et dit quoi faire', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		expect(doc().body.textContent).toContain('Ajoute tes expériences.')
		expect(window_.bouton('Modifier mes expériences')).toBeDefined()
	})

	test('une ligne ajoutée est enregistrée avec la liste par un seul bouton', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		await window_.cliquer(window_.bouton('Ajouter une expérience'))
		await window_.saisir(window_.champ('Poste'), 'Maquilleuse cinéma')
		await window_.saisir(window_.champ('Entreprise'), 'Production Fictive')
		await window_.saisir(window_.champ('Début'), '2022-01-10')
		await window_.cliquer(window_.bouton('Enregistrer cette expérience'))
		await window_.attendre(() => bench.calls.saveExperiences?.length || null)
		const sent = bench.calls.saveExperiences?.[0] as Sent
		expect(sent.lignes.map(row => row.id)).toEqual(['x1', undefined])
		expect(sent.lignes[1]?.valeurs.jobTitle).toBe('Maquilleuse cinéma')
		expect(bench.refreshes).toBe(1)
	})

	test('U30 : une fin avant le début est refusée sous le champ, rien n’est envoyé', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		await window_.cliquer(window_.bouton('Ajouter une expérience'))
		await window_.saisir(window_.champ('Poste'), 'Maquilleuse cinéma')
		await window_.saisir(window_.champ('Entreprise'), 'Production Fictive')
		await window_.saisir(window_.champ('Début'), '2022-01-10')
		await window_.saisir(window_.champ('Fin'), '2021-01-10')
		await window_.cliquer(window_.bouton('Enregistrer cette expérience'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('ne peut pas précéder son début') || null)
		expect(bench.calls.saveExperiences).toBeUndefined()
	})

	test('le nom obligatoire manquant est dit sous le champ, rien n’est envoyé', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		await window_.cliquer(window_.bouton('Ajouter une expérience'))
		await window_.saisir(window_.champ('Poste'), 'Maquilleuse')
		await window_.cliquer(window_.bouton('Enregistrer cette expérience'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Le nom de l’entreprise est requis.') || null)
		expect(bench.calls.saveExperiences).toBeUndefined()
	})

	test('L1 et L2 : taper garde le focus dans le champ', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		await window_.cliquer(window_.bouton('Ajouter une expérience'))
		const field = window_.champ('Poste')
		field.focus()
		await window_.saisir(field, 'Maq')
		await window_.saisir(field, 'Maquilleuse')
		expect(doc().activeElement).toBe(field)
	})

	test('L3 : retirer la ligne en cours de modification garde ce qui était saisi', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		await window_.cliquer(window_.bouton('Modifier l’expérience Studio Fictif'))
		await window_.saisir(window_.champ('Poste'), 'Cheffe de poste')
		await window_.cliquer(window_.bouton('Retirer l’expérience Studio Fictif'))
		expect(rows()).toEqual([])
		expect((window_.champ('Poste') as HTMLInputElement).value).toBe('Cheffe de poste')
		await window_.cliquer(window_.bouton('Enregistrer cette expérience'))
		await window_.attendre(() => bench.calls.saveExperiences?.length || null)
		const sent = bench.calls.saveExperiences?.[0] as Sent
		expect(sent.lignes).toHaveLength(1)
		expect(sent.lignes[0]?.id).toBeUndefined()
	})

	test('L4 et L5 : un retrait est annoncé, le focus reste dans l’éditeur', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		expect(announced()).toBe('')
		await window_.cliquer(window_.bouton('Retirer l’expérience Studio Fictif'))
		expect(announced()).toBe('Expérience Studio Fictif retirée')
		expect(doc().activeElement?.tagName).toBe('H3')
	})

	test('L6 : une ligne identique à une ligne de la liste est refusée, validée sans changement elle est acceptée', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		await window_.cliquer(window_.bouton('Ajouter une expérience'))
		await window_.saisir(window_.champ('Poste'), 'Maquilleuse mariage')
		await window_.saisir(window_.champ('Entreprise'), 'Studio Fictif')
		await window_.saisir(window_.champ('Ville'), 'Annecy')
		await window_.saisir(window_.champ('Début'), '2019-09-01')
		await window_.cliquer(window_.bouton('Enregistrer cette expérience'))
		await window_.attendre(() => alerts().includes('Une expérience identique est déjà dans la liste.') || null)
		expect(bench.calls.saveExperiences).toBeUndefined()
		await window_.cliquer(window_.bouton('Ne pas ajouter'))

		await window_.cliquer(window_.bouton('Modifier l’expérience Studio Fictif'))
		await window_.cliquer(window_.bouton('Enregistrer cette expérience'))
		await window_.attendre(() => bench.calls.saveExperiences?.length || null)
	})

	test('L7 : Entrée maintenue sur « Retirer » ne retire qu’une ligne', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes expériences'))
		const remove = window_.bouton('Retirer l’expérience Studio Fictif')
		const held = new window_.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
		remove.dispatchEvent(held)
		expect(held.defaultPrevented).toBe(true)
	})
})
