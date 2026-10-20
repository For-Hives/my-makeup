import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { AvailabilitySwitch, type AvailabilityUpload } from '@/components/dashboard/AvailabilitySwitch'
import { availabilitySchema, isAvailable } from '@/lib/dashboard/availability'
import { type DashboardProfile, profileCards } from '@/lib/dashboard/cards'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'

/**
 * The availability of her space (ticket 124; plan 02 E19-E29): what a card says for each stored
 * value, the strict schema, and the switch (one toggle for a held key, the old state back on a
 * failure). The send function is a fake: no network.
 */

const jsdomWindow = openWindow()

const profile = (disponible: boolean | null | undefined) => ({ id: 1, available: disponible }) as DashboardProfile
const cardLine = (disponible: boolean | null | undefined) =>
	profileCards(profile(disponible))
		.find(carte => carte.section === 'disponibilite')
		?.lignes.map(ligne => ligne.valeur)

describe('la carte dit l’état enregistré', () => {
	test('un profil importé sans valeur est « Disponible »', () => {
		expect(cardLine(null)).toEqual(['Disponible'])
		expect(cardLine(undefined)).toEqual(['Disponible'])
		expect(isAvailable(null)).toBe(true)
		expect(isAvailable(undefined)).toBe(true)
	})

	test('disponible : « Disponible » ; indisponible : le dit, et dit que la recherche l’écarte', () => {
		expect(cardLine(true)).toEqual(['Disponible'])
		expect(cardLine(false)).toEqual([
			'Pas disponible en ce moment',
			'Ton profil n’apparaît plus dans les résultats de recherche.',
		])
	})
})

describe('U32 : le schéma du serveur est strict', () => {
	test.each([
		[{ disponible: true }, true],
		[{ disponible: false }, true],
		[{ disponible: 'false' }, false],
		[{ disponible: 0 }, false],
		[{}, false],
		[{ disponible: true, statut: 'publie' }, false],
		[{ disponible: true, id: 3 }, false],
	])('%j accepté : %p', (saisie, accepte) => {
		expect(availabilitySchema.safeParse(saisie).success).toBe(accepte)
	})
})

function mount(disponible: boolean, envoyer: AvailabilityUpload) {
	return jsdomWindow.monter(<AvailabilitySwitch disponible={disponible} envoyer={envoyer} />)
}
const toggle = (): HTMLElement => {
	const node = jsdomWindow.w.document.querySelector<HTMLElement>('[role="switch"]')
	if (!node) throw new Error('pas d’interrupteur')
	return node
}
const checked = () => toggle().getAttribute('aria-checked')
const status = () => jsdomWindow.w.document.querySelector('[role="status"]')?.textContent ?? ''

describe('l’interrupteur', () => {
	test('il porte l’état enregistré, un clic envoie l’inverse et suit ce que le serveur a stocké', async () => {
		const calls: unknown[] = []
		await mount(true, async valeurs => {
			calls.push(valeurs)
			return { ok: true, valeurs }
		})
		expect(checked()).toBe('true')

		await jsdomWindow.cliquer(toggle())

		expect(calls).toEqual([{ disponible: false }])
		expect(checked()).toBe('false')
		expect(status()).toContain('n’apparaît plus dans la recherche')
	})

	test('E19 : le serveur peut stocker autre chose que ce qui était demandé, l’interrupteur suit le serveur', async () => {
		await mount(true, async () => ({ ok: true, valeurs: { disponible: true } }))
		await jsdomWindow.cliquer(toggle())
		expect(checked()).toBe('true')
	})

	test('un échec : retour à l’état enregistré et message en français', async () => {
		await mount(true, async () => ({ ok: false, message: FAILURE_MESSAGE }))

		await jsdomWindow.cliquer(toggle())

		expect(checked()).toBe('true')
		expect(jsdomWindow.w.document.querySelector('[role="alert"] p')?.textContent).toBe(FAILURE_MESSAGE)
		expect(status()).toBe('')
	})

	test('une fonction d’envoi qui lève : même retour, message du site', async () => {
		await mount(false, async () => {
			throw new Error('Failed to fetch')
		})

		await jsdomWindow.cliquer(toggle())

		expect(checked()).toBe('false')
		expect(jsdomWindow.w.document.querySelector('[role="alert"] p')?.textContent).toBe(FAILURE_MESSAGE)
	})

	test('pendant l’envoi il est verrouillé : deux clics, une seule requête', async () => {
		let calls = 0
		let finish: () => void = () => undefined
		await mount(true, valeurs => {
			calls += 1
			return new Promise(fin => {
				finish = () => fin({ ok: true, valeurs })
			})
		})

		await act(async () => {
			toggle().click()
			toggle().click()
		})
		expect(calls).toBe(1)
		expect(toggle().hasAttribute('disabled')).toBe(true)
		await act(async () => finish())

		expect(checked()).toBe('false')
		expect(toggle().hasAttribute('disabled')).toBe(false)
	})

	test('une touche maintenue (répétition) est refusée : une seule bascule', async () => {
		await mount(true, async valeurs => ({ ok: true, valeurs }))
		let event: Event | undefined
		await act(async () => {
			event = new jsdomWindow.w.KeyboardEvent('keydown', {
				key: 'Enter',
				repeat: true,
				bubbles: true,
				cancelable: true,
			})
			toggle().dispatchEvent(event)
		})
		expect(event?.defaultPrevented).toBe(true)
	})
})
