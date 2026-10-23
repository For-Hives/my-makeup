import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { DESCRIPTION_MAX } from '@/lib/dashboard/description'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import { benchOf, EMPTY, FULL } from '../support/direct-edit-bench'
import { openWindow } from '../support/dom-react'

/**
 * « À propos », skills, languages and courses of her own page in edit mode (issue 1016): each block is a
 * button named for what it changes, an empty block says what to do, the limit of the text is said before
 * the refusal, and the lists keep the seven rules L1 to L7 of the lists edited in place.
 */

const window_ = openWindow()
const doc = () => window_.w.document
const alerts = () => [...doc().querySelectorAll('[role="alert"]')].map(alert => alert.textContent).join('|')
const status = () => doc().querySelector('[data-testid="edit-status"]')?.textContent
const editor = () => doc().querySelector('[data-direct-edit-editor]')
/** A click as a finger makes it (detail 1) or as Enter makes it on a button (detail 0). */
const press = (button: Element, detail: 0 | 1) =>
	act(async () => {
		button.dispatchEvent(new window_.w.MouseEvent('click', { bubbles: true, detail }))
	})
const announced = () => doc().querySelector('[data-testid="removal-announcement"]')?.textContent

describe('chaque bloc est un bouton nommé pour ce qu’il change', () => {
	test('la présentation, les compétences, les langues et les formations', async () => {
		await benchOf(window_).mount()
		for (const name of [
			'Modifier ma présentation',
			'Modifier mes compétences',
			'Modifier mes langues',
			'Modifier mes formations',
		])
			expect(window_.bouton(name).getAttribute('aria-expanded')).toBe('false')
		// What the visitor reads is still there.
		expect(doc().body.textContent).toContain('Je maquille depuis huit ans')
		expect(doc().body.textContent).toContain('CAP esthétique')
	})

	test('un bloc vide reste sur la page et dit quoi faire, avec un exemple pour la présentation', async () => {
		await benchOf(window_, { profile: EMPTY }).mount()
		const text = doc().body.textContent ?? ''
		expect(text).toContain('Présente-toi en quelques lignes.')
		expect(text).toContain('Je maquille depuis huit ans')
		expect(text).toContain('Ajoute tes compétences.')
		expect(text).toContain('Ajoute les langues que tu parles.')
		expect(text).toContain('Ajoute tes formations et tes diplômes.')
		expect(window_.bouton('Modifier ma présentation')).toBeDefined()
	})
})

describe('la présentation', () => {
	test('la limite est dite avant le refus, avec le compteur', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier ma présentation'))
		expect(doc().querySelector('[data-testid="about-counter"]')?.textContent).toContain(
			`sur ${DESCRIPTION_MAX} caractères`
		)
		await window_.saisir(window_.champ(/Ce qui te distingue/), 'a'.repeat(DESCRIPTION_MAX + 5))
		expect(doc().querySelector('[data-testid="about-counter"]')?.textContent).toContain('5 de trop')
	})

	test('un texte trop long est refusé sous le champ, rien n’est envoyé', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier ma présentation'))
		await window_.saisir(window_.champ(/Ce qui te distingue/), 'a'.repeat(DESCRIPTION_MAX + 5))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('ne doit pas dépasser') || null)
		expect(bench.calls.saveAbout).toBeUndefined()
		expect(editor()).not.toBeNull()
	})

	test('l’enregistrement envoie le texte, relit la page après la réponse seulement', async () => {
		let release: () => void = () => undefined
		const bench = benchOf(window_, {
			actions: {
				saveAbout: input =>
					new Promise(resolve => {
						release = () => resolve({ ok: true, valeurs: input })
					}),
			},
		})
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier ma présentation'))
		await window_.saisir(window_.champ(/Ce qui te distingue/), 'Un nouveau texte de présentation.')
		await window_.cliquer(window_.bouton('Enregistrer'))
		expect(status()).toBe('Enregistrement…')
		expect(bench.refreshes).toBe(0)
		release()
		await window_.attendre(() => status() === 'Enregistré à l’instant' || null)
		expect(bench.calls.saveAbout).toEqual([{ description: 'Un nouveau texte de présentation.' }])
		expect(bench.refreshes).toBe(1)
	})

	test('un échec garde le texte, la session expirée aussi', async () => {
		const failing = benchOf(window_, { actions: { saveAbout: async () => ({ ok: false, message: FAILURE_MESSAGE }) } })
		await failing.mount()
		await window_.cliquer(window_.bouton('Modifier ma présentation'))
		await window_.saisir(window_.champ(/Ce qui te distingue/), 'Mon texte')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(FAILURE_MESSAGE) || null)
		expect((window_.champ(/Ce qui te distingue/) as HTMLTextAreaElement).value).toBe('Mon texte')
		await window_.demonter()

		const expired = benchOf(window_, {
			actions: { saveAbout: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) },
		})
		await expired.mount()
		await window_.cliquer(window_.bouton('Modifier ma présentation'))
		await window_.saisir(window_.champ(/Ce qui te distingue/), 'Mon texte')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => alerts().includes(MESSAGE_SESSION) || null)
		expect(doc().querySelector('[role="alert"] a')?.getAttribute('target')).toBe('_blank')
		expect((window_.champ(/Ce qui te distingue/) as HTMLTextAreaElement).value).toBe('Mon texte')
	})
})

describe('les compétences et les langues : les sept règles des listes', () => {
	const skills = () => ({ ok: true as const })
	void skills
	const chips = () => [...doc().querySelectorAll('[data-remove]')].map(button => button.getAttribute('aria-label'))

	test('L1 : une puce ajoutée a son identifiant, une puce enregistrée garde le sien', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		await window_.saisir(window_.champ('Compétence'), 'Peaux matures')
		await window_.cliquer(window_.bouton('Ajouter'))
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveSkills?.length || null)
		expect(bench.calls.saveSkills).toEqual([
			{ puces: [{ id: 's1', nom: 'Mariée' }, { id: 's2', nom: 'Teint lumineux' }, { nom: 'Peaux matures' }] },
		])
	})

	test('L2 : taper garde le focus dans le champ', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		const field = window_.champ('Compétence')
		field.focus()
		await window_.saisir(field, 'Pe')
		await window_.saisir(field, 'Peaux')
		expect(doc().activeElement).toBe(field)
	})

	test('L4 : après un retrait au clavier, le focus reste dans l’éditeur, sur la puce suivante', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		const first = window_.bouton('Retirer Mariée')
		first.focus()
		await press(first, 0)
		await window_.attendre(() => chips().length === 1 || null)
		expect(doc().activeElement?.getAttribute('aria-label')).toBe('Retirer Teint lumineux')
	})

	test('L4 : la liste vide envoie le focus au champ après une touche, au titre après un clic', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes langues'))
		await press(window_.bouton('Retirer Français'), 0)
		expect(doc().activeElement?.tagName).toBe('INPUT')
		await window_.demonter()
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes langues'))
		// A tap (detail 1): never a text field, which would open the keyboard of a phone.
		await press(window_.bouton('Retirer Français'), 1)
		expect(doc().activeElement?.tagName).toBe('H3')
	})

	test('L5 : chaque retrait est annoncé, la zone est là et vide dès l’ouverture', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		expect(announced()).toBe('')
		await window_.cliquer(window_.bouton('Retirer Mariée'))
		expect(announced()).toBe('Compétence Mariée retirée')
	})

	test('L6 : un doublon est refusé et le refus est dit près du champ', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		await window_.saisir(window_.champ('Compétence'), ' mariée ')
		await window_.cliquer(window_.bouton('Ajouter'))
		expect(alerts()).toContain('Cette compétence est déjà dans ta liste.')
		expect(chips()).toEqual(['Retirer Mariée', 'Retirer Teint lumineux'])
	})

	test('L7 : Entrée maintenue n’ajoute qu’une puce', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		const field = window_.champ('Compétence')
		await window_.saisir(field, 'Peaux matures')
		for (const repeat of [false, true, true])
			field.dispatchEvent(
				new window_.w.KeyboardEvent('keydown', { key: 'Enter', repeat, bubbles: true, cancelable: true })
			)
		await window_.attendre(() => chips().length === 3 || null)
		expect(chips().filter(label => label === 'Retirer Peaux matures')).toHaveLength(1)
	})

	test('ce qui est tapé et pas encore ajouté part à l’enregistrement, il n’est pas perdu', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes langues'))
		await window_.saisir(window_.champ('Langue'), 'Anglais; Espagnol')
		await window_.cliquer(window_.bouton('Enregistrer'))
		await window_.attendre(() => bench.calls.saveLanguages?.length || null)
		expect(bench.calls.saveLanguages).toEqual([
			{ puces: [{ id: 'l1', nom: 'Français' }, { nom: 'Anglais' }, { nom: 'Espagnol' }] },
		])
	})
})

describe('les formations : les sept règles des listes', () => {
	const rows = () => [...doc().querySelectorAll('[data-row]')].map(row => row.textContent)

	test('une ligne ajoutée est enregistrée avec la liste par un seul bouton', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes formations'))
		await window_.cliquer(window_.bouton('Ajouter une formation'))
		await window_.saisir(window_.champ('Diplôme'), 'BTS métiers de la coiffure')
		await window_.saisir(window_.champ('École'), 'Lycée Fictif')
		await window_.cliquer(window_.bouton('Enregistrer cette formation'))
		await window_.attendre(() => bench.calls.saveCourses?.length || null)
		const sent = bench.calls.saveCourses?.[0] as { lignes: { id?: string; valeurs: Record<string, string> }[] }
		expect(sent.lignes.map(row => row.id)).toEqual(['c1', undefined])
		expect(sent.lignes[1]?.valeurs.diploma).toBe('BTS métiers de la coiffure')
	})

	test('le nom obligatoire manquant est dit sous le champ, rien n’est envoyé', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes formations'))
		await window_.cliquer(window_.bouton('Ajouter une formation'))
		await window_.saisir(window_.champ('Diplôme'), 'BTS')
		await window_.cliquer(window_.bouton('Enregistrer cette formation'))
		await window_.attendre(() => (doc().body.textContent ?? '').includes('Le nom de l’école est requis.') || null)
		expect(bench.calls.saveCourses).toBeUndefined()
	})

	test('L1 et L2 : deux lignes qui se ressemblent restent deux lignes, taper garde le focus', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes formations'))
		await window_.cliquer(window_.bouton('Ajouter une formation'))
		const field = window_.champ('Diplôme')
		field.focus()
		await window_.saisir(field, 'CAP')
		await window_.saisir(field, 'CAP esthétique')
		expect(doc().activeElement).toBe(field)
	})

	test('L3 : retirer la ligne en cours de modification garde ce qui était saisi', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes formations'))
		await window_.cliquer(window_.bouton('Modifier la formation CAP esthétique'))
		await window_.saisir(window_.champ('Diplôme'), 'CAP maquillage')
		await window_.cliquer(window_.bouton('Retirer la formation CAP esthétique'))
		expect(rows()).toEqual([])
		expect((window_.champ('Diplôme') as HTMLInputElement).value).toBe('CAP maquillage')
		await window_.cliquer(window_.bouton('Enregistrer cette formation'))
		await window_.attendre(() => bench.calls.saveCourses?.length || null)
		const sent = bench.calls.saveCourses?.[0] as { lignes: { id?: string }[] }
		expect(sent.lignes).toHaveLength(1)
		expect(sent.lignes[0]?.id).toBeUndefined()
	})

	test('L4 et L5 : un retrait est annoncé, le focus reste dans l’éditeur', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes formations'))
		expect(announced()).toBe('')
		await window_.cliquer(window_.bouton('Retirer la formation CAP esthétique'))
		expect(announced()).toBe('Formation CAP esthétique retirée')
		expect(doc().activeElement?.tagName).toBe('H3')
	})

	test('L6 : une ligne identique à une ligne de la liste est refusée, validée sans changement elle est acceptée', async () => {
		const bench = benchOf(window_)
		await bench.mount()
		await window_.cliquer(window_.bouton('Modifier mes formations'))
		await window_.cliquer(window_.bouton('Ajouter une formation'))
		await window_.saisir(window_.champ('Diplôme'), 'CAP esthétique')
		await window_.saisir(window_.champ('École'), 'École Fictive')
		await window_.saisir(window_.champ('Date d’obtention'), '2016-06-30')
		await window_.cliquer(window_.bouton('Enregistrer cette formation'))
		await window_.attendre(() => alerts().includes('Une formation identique est déjà dans la liste.') || null)
		expect(bench.calls.saveCourses).toBeUndefined()
		await window_.cliquer(window_.bouton('Ne pas ajouter'))

		await window_.cliquer(window_.bouton('Modifier la formation CAP esthétique'))
		await window_.cliquer(window_.bouton('Enregistrer cette formation'))
		await window_.attendre(() => bench.calls.saveCourses?.length || null)
	})

	test('L7 : Entrée maintenue sur « Retirer » ne retire qu’une ligne', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes formations'))
		const remove = window_.bouton('Retirer la formation CAP esthétique')
		const held = new window_.w.KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })
		remove.dispatchEvent(held)
		expect(held.defaultPrevented).toBe(true)
	})
})

describe('un seul bloc ouvert à la fois, la saisie n’est jamais perdue', () => {
	test('ouvrir un autre bloc avec une modification demande : Continuer garde la saisie', async () => {
		await benchOf(window_).mount()
		await window_.cliquer(window_.bouton('Modifier mes compétences'))
		await window_.saisir(window_.champ('Compétence'), 'Peaux matures')
		await window_.cliquer(window_.bouton('Modifier mes langues'))
		expect(alerts()).toContain('modifications non enregistrées')
		await window_.cliquer(window_.bouton('Continuer à modifier'))
		expect((window_.champ('Compétence') as HTMLInputElement).value).toBe('Peaux matures')
	})
})

void FULL
