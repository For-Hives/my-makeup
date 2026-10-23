import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { benchOf, EMPTY } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * Prestations et tarifs on her own page in edit mode (issue 1017): lines « Maquillage de la mariée · dès
 * 150 € », one button that adds the row and saves the list, three models, the help on the price, the
 * options behind « Ajouter une option », and the seven rules L1 to L7 of the lists edited in place.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const rows = () => [...doc().querySelectorAll('[data-row]')].map(row => row.textContent?.replace(/\s+/g, ' ').trim())
const announced = () => doc().querySelector('[data-testid="removal-announcement"]')?.textContent
const press = (button: Element, detail: 0 | 1) =>
	act(async () => {
		button.dispatchEvent(new window_.w.MouseEvent('click', { bubbles: true, detail }))
	})
const open = async (bench = benchOf(window_)) => {
	await bench.mount()
	await window_.cliquer(window_.bouton('Modifier mes prestations'))
	return bench
}
const addForm = async (bench: ReturnType<typeof benchOf>) => {
	await open(bench)
	await window_.cliquer(window_.bouton('Ajouter une prestation'))
}
type Sent = {
	lignes: {
		id?: string
		valeurs: Record<string, string>
		options?: { id?: string; valeurs: Record<string, string> }[]
	}[]
}

describe('la liste', () => {
	test('chaque prestation est une ligne « nom · prix », avec ses options comptées', async () => {
		await open()
		expect(rows()).toEqual(['Maquillage de la mariée · dès 150 € · 1 option Modifier Retirer'])
	})

	test('un bloc vide reste sur la page et dit quoi faire', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		expect(doc().body.textContent).toContain('Ajoute tes prestations et tes tarifs.')
		expect(window_.bouton('Modifier mes prestations')).toBeDefined()
	})
})

describe('ajouter une prestation', () => {
	test('trois modèles préremplissent le nom en un appui, sans rien choisir de plus', async () => {
		await addForm(benchOf(window_))
		const models = [...doc().querySelectorAll('button')].filter(
			button => button.closest('fieldset') && /^Modèle /.test(button.getAttribute('aria-label') ?? '')
		)
		expect(models).toHaveLength(3)
		await window_.cliquer(window_.bouton('Modèle Mariée'))
		expect((window_.champ('Nom de la prestation') as HTMLInputElement).value).toBe('Maquillage de la mariée')
	})

	test('le nom propose des suggestions, le prix dit ses exemples et le montant retenu', async () => {
		await addForm(benchOf(window_))
		expect(doc().querySelector('datalist option')).not.toBeNull()
		expect(doc().body.textContent).toContain('Exemples : 150, à partir de 150, sur devis')
		await window_.saisir(window_.champ('Prix'), 'à partir de 150')
		expect(doc().body.textContent).toContain('Montant retenu pour ton profil : 150 €')
		await window_.saisir(window_.champ('Prix'), 'sur devis')
		expect(doc().body.textContent).toContain('Aucun montant retenu')
	})

	test('la description est repliée, les options sont derrière « Ajouter une option (ex. essai, retouches) »', async () => {
		await addForm(benchOf(window_))
		const details = doc().querySelector('fieldset details') as HTMLDetailsElement
		expect(details.open).toBe(false)
		expect(details.textContent).toContain('Ajouter une description')
		expect(doc().querySelectorAll('fieldset fieldset')).toHaveLength(0)
		await window_.cliquer(window_.bouton('Ajouter une option (ex. essai, retouches)'))
		expect(doc().querySelectorAll('fieldset fieldset')).toHaveLength(1)
	})

	test('un seul bouton, « Enregistrer cette prestation », ajoute la ligne et enregistre la liste', async () => {
		const bench = benchOf(window_)
		await addForm(bench)
		expect(() => window_.bouton('Enregistrer', doc().body)).toThrow()
		await window_.saisir(window_.champ('Nom de la prestation'), 'Maquillage de soirée')
		await window_.saisir(window_.champ('Prix'), '65')
		await window_.cliquer(window_.bouton('Ajouter une option (ex. essai, retouches)'))
		await window_.saisir(window_.champ('Nom'), 'Retouches')
		await window_.cliquer(window_.bouton('Enregistrer cette prestation'))
		await window_.attendre(() => bench.calls.saveServices?.length || null)
		const sent = bench.calls.saveServices?.[0] as Sent
		expect(sent.lignes.map(row => row.id)).toEqual(['o1', undefined])
		expect(sent.lignes[0]?.options?.map(option => option.id)).toEqual(['p1'])
		expect(sent.lignes[1]?.valeurs).toEqual({ name: 'Maquillage de soirée', description: '', price: '65' })
		expect(sent.lignes[1]?.options?.[0]?.valeurs.name).toBe('Retouches')
		expect(bench.refreshes).toBe(1)
	})

	test('le prix libre part tel qu’il est tapé', async () => {
		const bench = benchOf(window_)
		await addForm(bench)
		await window_.saisir(window_.champ('Nom de la prestation'), 'Cours')
		await window_.saisir(window_.champ('Prix'), 'sur devis')
		await window_.cliquer(window_.bouton('Enregistrer cette prestation'))
		await window_.attendre(() => bench.calls.saveServices?.length || null)
		expect((bench.calls.saveServices?.[0] as Sent).lignes[1]?.valeurs.price).toBe('sur devis')
	})

	test('le nom manquant est dit sous le champ, rien n’est envoyé', async () => {
		const bench = benchOf(window_)
		await addForm(bench)
		await window_.saisir(window_.champ('Prix'), '65')
		await window_.cliquer(window_.bouton('Enregistrer cette prestation'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Le nom de la prestation est requis.') || null)
		expect(bench.calls.saveServices).toBeUndefined()
	})

	test('une option sans nom est refusée avec son message', async () => {
		const bench = benchOf(window_)
		await addForm(bench)
		await window_.saisir(window_.champ('Nom de la prestation'), 'Soirée')
		await window_.cliquer(window_.bouton('Ajouter une option (ex. essai, retouches)'))
		await window_.saisir(window_.champ('Prix de l’option'), '20')
		await window_.cliquer(window_.bouton('Enregistrer cette prestation'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Le nom de l’option est requis.') || null)
		expect(bench.calls.saveServices).toBeUndefined()
	})

	test('un échec garde la ligne et la saisie, puis un second essai ne l’ajoute pas deux fois', async () => {
		let attempt = 0
		const bench = benchOf(window_, {
			actions: {
				saveServices: async input =>
					++attempt === 1 ? { ok: false, message: FAILURE_MESSAGE } : { ok: true, valeurs: input },
			},
		})
		await addForm(bench)
		await window_.saisir(window_.champ('Nom de la prestation'), 'Soirée')
		await window_.cliquer(window_.bouton('Enregistrer cette prestation'))
		await window_.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect(rows()).toHaveLength(2)
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveServices?.length === 2 || null)
		expect((bench.calls.saveServices?.[1] as Sent).lignes).toHaveLength(2)
	})
})

describe('les sept règles des listes', () => {
	test('L1 et L2 : une clé par ligne, taper garde le focus', async () => {
		await addForm(benchOf(window_))
		const field = window_.champ('Nom de la prestation')
		field.focus()
		await window_.saisir(field, 'So')
		await window_.saisir(field, 'Soirée')
		expect(doc().activeElement).toBe(field)
	})

	test('L3 : retirer la ligne en cours de modification garde ce qui était saisi', async () => {
		const bench = benchOf(window_)
		await open(bench)
		await window_.cliquer(window_.bouton('Modifier la prestation Maquillage de la mariée'))
		await window_.saisir(window_.champ('Nom de la prestation'), 'Maquillage mariée plus')
		await window_.cliquer(window_.bouton('Retirer la prestation Maquillage de la mariée'))
		expect(rows()).toEqual([])
		expect((window_.champ('Nom de la prestation') as HTMLInputElement).value).toBe('Maquillage mariée plus')
	})

	test('L4 : après un retrait, le focus reste dans l’éditeur (bouton d’ajout au clavier, titre au toucher)', async () => {
		await open()
		await press(window_.bouton('Retirer la prestation Maquillage de la mariée'), 0)
		expect(doc().activeElement?.getAttribute('data-add-row')).not.toBeNull()
		await window_.demonter()
		await open()
		await press(window_.bouton('Retirer la prestation Maquillage de la mariée'), 1)
		expect(doc().activeElement?.tagName).toBe('H3')
	})

	test('L5 : le retrait est annoncé, la zone est là et vide à l’ouverture', async () => {
		await open()
		expect(announced()).toBe('')
		await window_.cliquer(window_.bouton('Retirer la prestation Maquillage de la mariée'))
		expect(announced()).toBe('Prestation Maquillage de la mariée retirée')
	})

	test('L6 : une prestation identique est refusée et dite, validée sans changement elle est acceptée', async () => {
		const bench = benchOf(window_)
		await open(bench)
		await window_.cliquer(window_.bouton('Ajouter une prestation'))
		await window_.saisir(window_.champ('Nom de la prestation'), 'Maquillage de la mariée')
		await window_.saisir(window_.champ('Prix'), 'à partir de 150')
		await window_.cliquer(window_.bouton('Ajouter une option (ex. essai, retouches)'))
		await window_.saisir(window_.champ('Nom'), 'Essai')
		await window_.saisir(window_.champ('Prix de l’option'), '60')
		await window_.cliquer(window_.bouton('Enregistrer cette prestation'))
		await window_.attendre(() => alerts().includes('Une prestation identique est déjà dans la liste.') || null)
		expect(bench.calls.saveServices).toBeUndefined()
		await window_.cliquer(window_.bouton('Ne pas ajouter'))
		await window_.cliquer(window_.bouton('Modifier la prestation Maquillage de la mariée'))
		await window_.cliquer(window_.bouton('Enregistrer cette prestation'))
		await window_.attendre(() => bench.calls.saveServices?.length || null)
	})

	test('L7 : Entrée maintenue sur un bouton n’agit qu’une fois', async () => {
		await open()
		const remove = window_.bouton('Retirer la prestation Maquillage de la mariée')
		const held = new window_.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
		remove.dispatchEvent(held)
		expect(held.defaultPrevented).toBe(true)
	})
})
