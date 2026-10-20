import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import {
	type EnvoiDeLaDisponibilite,
	InterrupteurDeDisponibilite,
} from '@/components/dashboard/AvailabilitySwitch'
import { cartesDuProfil, type ProfilDeLEspace } from '@/lib/dashboard/cards'
import { estDisponible, schemaDeLaDisponibilite } from '@/lib/dashboard/availability'
import { MESSAGE_ECHEC } from '@/lib/dashboard/result'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The availability of her space (ticket 124; plan 02 E19-E29): what a card says for each stored
 * value, the strict schema, and the switch (one toggle for a held key, the old state back on a
 * failure). The send function is a fake: no network.
 */

const fenetre = ouvrirFenetre()

const profil = (disponible: boolean | null | undefined) => ({ id: 1, available: disponible }) as ProfilDeLEspace
const ligneDeLaCarte = (disponible: boolean | null | undefined) =>
	cartesDuProfil(profil(disponible))
		.find(carte => carte.section === 'disponibilite')
		?.lignes.map(ligne => ligne.valeur)

describe('la carte dit l’état enregistré', () => {
	test('un profil importé sans valeur est « Disponible »', () => {
		expect(ligneDeLaCarte(null)).toEqual(['Disponible'])
		expect(ligneDeLaCarte(undefined)).toEqual(['Disponible'])
		expect(estDisponible(null)).toBe(true)
		expect(estDisponible(undefined)).toBe(true)
	})

	test('disponible : « Disponible » ; indisponible : le dit, et dit que la recherche l’écarte', () => {
		expect(ligneDeLaCarte(true)).toEqual(['Disponible'])
		expect(ligneDeLaCarte(false)).toEqual([
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
		expect(schemaDeLaDisponibilite.safeParse(saisie).success).toBe(accepte)
	})
})

function monter(disponible: boolean, envoyer: EnvoiDeLaDisponibilite) {
	return fenetre.monter(<InterrupteurDeDisponibilite disponible={disponible} envoyer={envoyer} />)
}
const interrupteur = (): HTMLElement => {
	const noeud = fenetre.w.document.querySelector<HTMLElement>('[role="switch"]')
	if (!noeud) throw new Error('pas d’interrupteur')
	return noeud
}
const coche = () => interrupteur().getAttribute('aria-checked')
const statut = () => fenetre.w.document.querySelector('[role="status"]')?.textContent ?? ''

describe('l’interrupteur', () => {
	test('il porte l’état enregistré, un clic envoie l’inverse et suit ce que le serveur a stocké', async () => {
		const appels: unknown[] = []
		await monter(true, async valeurs => {
			appels.push(valeurs)
			return { ok: true, valeurs }
		})
		expect(coche()).toBe('true')

		await fenetre.cliquer(interrupteur())

		expect(appels).toEqual([{ disponible: false }])
		expect(coche()).toBe('false')
		expect(statut()).toContain('n’apparaît plus dans la recherche')
	})

	test('E19 : le serveur peut stocker autre chose que ce qui était demandé, l’interrupteur suit le serveur', async () => {
		await monter(true, async () => ({ ok: true, valeurs: { disponible: true } }))
		await fenetre.cliquer(interrupteur())
		expect(coche()).toBe('true')
	})

	test('un échec : retour à l’état enregistré et message en français', async () => {
		await monter(true, async () => ({ ok: false, message: MESSAGE_ECHEC }))

		await fenetre.cliquer(interrupteur())

		expect(coche()).toBe('true')
		expect(fenetre.w.document.querySelector('[role="alert"] p')?.textContent).toBe(MESSAGE_ECHEC)
		expect(statut()).toBe('')
	})

	test('une fonction d’envoi qui lève : même retour, message du site', async () => {
		await monter(false, async () => {
			throw new Error('Failed to fetch')
		})

		await fenetre.cliquer(interrupteur())

		expect(coche()).toBe('false')
		expect(fenetre.w.document.querySelector('[role="alert"] p')?.textContent).toBe(MESSAGE_ECHEC)
	})

	test('pendant l’envoi il est verrouillé : deux clics, une seule requête', async () => {
		let appels = 0
		let finir: () => void = () => undefined
		await monter(true, valeurs => {
			appels += 1
			return new Promise(fin => {
				finir = () => fin({ ok: true, valeurs })
			})
		})

		await act(async () => {
			interrupteur().click()
			interrupteur().click()
		})
		expect(appels).toBe(1)
		expect(interrupteur().hasAttribute('disabled')).toBe(true)
		await act(async () => finir())

		expect(coche()).toBe('false')
		expect(interrupteur().hasAttribute('disabled')).toBe(false)
	})

	test('une touche maintenue (répétition) est refusée : une seule bascule', async () => {
		await monter(true, async valeurs => ({ ok: true, valeurs }))
		let evenement: Event | undefined
		await act(async () => {
			evenement = new fenetre.w.KeyboardEvent('keydown', {
				key: 'Enter',
				repeat: true,
				bubbles: true,
				cancelable: true,
			})
			interrupteur().dispatchEvent(evenement)
		})
		expect(evenement?.defaultPrevented).toBe(true)
	})
})
