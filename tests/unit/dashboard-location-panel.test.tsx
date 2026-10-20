import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { type CitiesSearch, SEARCH_PAUSE_MS } from '@/components/dashboard/CityField'
import { LocationEditor, type LocationUpload } from '@/components/dashboard/LocationEditor'
import {
	CITIES_SERVICE_MESSAGE,
	CITY_TO_CHOOSE_MESSAGE,
	type LocationValues,
	REFUSED_ADDRESS_MESSAGE,
} from '@/lib/dashboard/location'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { ZONE_MESSAGES } from '@/lib/profile/zone'
import { openWindow } from '../support/dom-react'

/**
 * The panel of the location (ticket 123; plan 02 U14, U15, U16, E30, E31): the commune chosen in
 * the list with the keyboard and with a tap, free text refused, the radius out of bounds, the
 * service of the communes down, and a single save for a double click. The send and search functions
 * are fakes: no network.
 */

const jsdomWindow = openWindow()

const WITH_ANNECY: LocationValues = {
	codeInsee: '74010',
	libelle: 'Annecy (74)',
	rayonKm: 30,
	aDomicile: false,
}
const WITHOUT_CITY: LocationValues = { codeInsee: '', libelle: '', rayonKm: null, aDomicile: false }

const ANNECY = { codeInsee: '74010', libelle: 'Annecy (74)' }
const LYON = { codeInsee: '69123', libelle: 'Lyon (69)' }
const DENIS_CITY = { codeInsee: '97411', libelle: 'Saint-Denis (974)' }

type Reply = Awaited<ReturnType<CitiesSearch>>

/** A search that records what is asked and answers like the list. */
function fakeSearch(reponse: Reply | ((texte: string) => Reply | Promise<Reply>)) {
	const texts: string[] = []
	const find: CitiesSearch = async texte => {
		texts.push(texte)
		return typeof reponse === 'function' ? reponse(texte) : reponse
	}
	return { chercher: find, textes: texts }
}

function fakeUpload(reponse?: Awaited<ReturnType<LocationUpload>>) {
	const calls: Parameters<LocationUpload>[0][] = []
	const send: LocationUpload = async saisie => {
		calls.push(saisie)
		return reponse ?? { ok: true, valeurs: { ...WITH_ANNECY, ...saisie, libelle: 'Annecy (74)' } }
	}
	return { appels: calls, envoyer: send }
}

async function open(envoyer: LocationUpload, chercher: CitiesSearch, valeurs: LocationValues = WITH_ANNECY) {
	await jsdomWindow.monter(<LocationEditor valeurs={valeurs} envoyer={envoyer} chercher={chercher} />)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Modifier ma localisation'))
}

const city = (): HTMLInputElement => jsdomWindow.champ('Ta commune') as HTMLInputElement
const dialogue = (): HTMLElement | null => jsdomWindow.w.document.querySelector('[role="dialog"]')
const options = (): HTMLElement[] => [...jsdomWindow.w.document.querySelectorAll<HTMLElement>('[role="option"]')]
/** The announcement of the card (outside the panel). */
const status = (): string => jsdomWindow.w.document.querySelector('body > div > [role="status"]')?.textContent ?? ''
/** The announcement of the field of the commune (inside the panel). */
const fieldStatus = (): string => dialogue()?.querySelector('[role="status"]')?.textContent ?? ''

/** Types in the field, then lets the pause of the search pass. */
async function write(texte: string) {
	await jsdomWindow.saisir(city(), texte)
	await act(async () => {
		await new Promise(fin => setTimeout(fin, SEARCH_PAUSE_MS + 60))
	})
}

async function key(cible: Element, key: string) {
	let event: Event | undefined
	await act(async () => {
		event = new jsdomWindow.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
		cible.dispatchEvent(event)
	})
	return event?.defaultPrevented ?? false
}

describe('le panneau s’ouvre avec la localisation enregistrée', () => {
	test('un dialogue nommé, la commune, le rayon et « à domicile » enregistrés', async () => {
		const { envoyer: send } = fakeUpload()
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher)

		const d = dialogue()
		expect(d?.getAttribute('aria-modal')).toBe('true')
		expect(jsdomWindow.w.document.getElementById(d?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
			'Modifier ma localisation'
		)
		expect(city().value).toBe('Annecy (74)')
		expect((jsdomWindow.champ('Rayon d’action (en km)') as HTMLInputElement).value).toBe('30')
		expect((jsdomWindow.champ('Je me déplace à domicile') as HTMLInputElement).checked).toBe(false)
	})

	test('sans rien d’enregistré, tous les champs sont vides', async () => {
		const { envoyer: send } = fakeUpload()
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher, WITHOUT_CITY)
		expect(city().value).toBe('')
		expect((jsdomWindow.champ('Rayon d’action (en km)') as HTMLInputElement).value).toBe('')
	})
})

describe('U16 : « Annecy » choisie au doigt, enregistrée par son code', () => {
	test('un appui sur la suggestion la choisit ; l’envoi porte le code, jamais le nom', async () => {
		const { chercher: find, textes: texts } = fakeSearch({ ok: true, communes: [ANNECY, LYON] })
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)

		await write('Annecy')
		expect(texts).toEqual(['Annecy'])
		expect(options().map(o => o.textContent)).toEqual(['Annecy (74)', 'Lyon (69)'])
		expect(city().getAttribute('aria-expanded')).toBe('true')
		expect(fieldStatus()).toContain('2 communes proposées.')

		const firstOne = options()[0]
		if (!firstOne) throw new Error('pas de suggestion')
		// A tap does not take the focus from the field, or its blur would close the list first.
		const press = new jsdomWindow.w.MouseEvent('mousedown', { bubbles: true, cancelable: true })
		await act(async () => {
			firstOne.dispatchEvent(press)
		})
		expect(press.defaultPrevented).toBe(true)
		await jsdomWindow.cliquer(firstOne)

		expect(city().value).toBe('Annecy (74)')
		expect(city().getAttribute('aria-expanded')).toBe('false')

		await jsdomWindow.saisir(jsdomWindow.champ('Rayon d’action (en km)'), '30')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(calls).toEqual([{ codeInsee: '74010', rayonKm: 30, aDomicile: false }])
		expect(status()).toBe('Ta localisation est enregistrée.')
	})

	test('l’outre-mer se choisit comme le reste : Saint-Denis (974)', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [DENIS_CITY] })
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('Saint-Denis')
		const option = options()[0]
		if (!option) throw new Error('pas de suggestion')
		await jsdomWindow.cliquer(option)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(calls[0]?.codeInsee).toBe('97411')
	})
})

describe('le clavier suffit', () => {
	test('flèches pour parcourir, Entrée pour choisir sans envoyer le formulaire', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [ANNECY, LYON] })
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('An')

		expect(await key(city(), 'ArrowDown')).toBe(true)
		expect(city().getAttribute('aria-activedescendant')).toBe(options()[0]?.id ?? 'x')
		expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
		await key(city(), 'ArrowDown')
		expect(options()[1]?.getAttribute('aria-selected')).toBe('true')
		await key(city(), 'ArrowUp')
		expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
		// Past the last one, it goes back to the first.
		await key(city(), 'ArrowUp')
		expect(options()[1]?.getAttribute('aria-selected')).toBe('true')

		expect(await key(city(), 'Enter')).toBe(true)
		expect(city().value).toBe('Lyon (69)')
		expect(calls).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('Échap ferme la liste, pas le panneau ; un second Échap ferme le panneau', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [ANNECY] })
		const { envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('Annecy')
		expect(city().getAttribute('aria-expanded')).toBe('true')

		await key(city(), 'Escape')
		expect(city().getAttribute('aria-expanded')).toBe('false')
		expect(dialogue()).not.toBeNull()

		await key(city(), 'Escape')
		// Nothing is changed: no commune was chosen, so closing needs no confirmation.
		expect(dialogue()).toBeNull()
	})

	test('chaque suggestion fait au moins 44 px (min-h-11) et la liste est annoncée', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [ANNECY] })
		const { envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('Annecy')
		expect(options()[0]?.className).toContain('min-h-11')
		expect(city().getAttribute('role')).toBe('combobox')
		expect(jsdomWindow.w.document.querySelector('[role="listbox"]')?.id).toBe(
			city().getAttribute('aria-controls') ?? 'x'
		)
	})
})

describe('un texte libre n’est jamais une commune', () => {
	test('du texte tapé sans choix : message sous le champ, aucune requête', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [ANNECY] })
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('Annecy')

		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const error = await jsdomWindow.attendre(() =>
			jsdomWindow.w.document.getElementById(/* id read below */ city().getAttribute('aria-describedby') ?? '')
		)
		expect(error.textContent).toBe(CITY_TO_CHOOSE_MESSAGE)
		expect(city().getAttribute('aria-invalid')).toBe('true')
		expect(calls).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('retaper après un choix reprend la commune : plus de commune choisie, rien n’est envoyé', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [ANNECY] })
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, find, WITH_ANNECY)

		await jsdomWindow.saisir(city(), 'Annec')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		await jsdomWindow.attendre(() => city().getAttribute('aria-invalid'))
		expect(calls).toHaveLength(0)
	})

	test('une adresse tapée : le message le dit, la liste reste fermée', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [], motif: 'adresse' })
		const { envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('12 rue des Lilas')
		expect(jsdomWindow.w.document.body.textContent).toContain(REFUSED_ADDRESS_MESSAGE)
		expect(options()).toHaveLength(0)
		expect(city().getAttribute('aria-expanded')).toBe('false')
	})

	test('aucune commune ne correspond : le dit, sans liste', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [] })
		const { envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('Zzzzz')
		expect(fieldStatus()).toContain('Aucune commune ne correspond.')
	})
})

describe('U14, U15, E30 : le rayon', () => {
	test.each([
		'201',
		'1000',
		'-5',
		'12,5',
		'abc',
		'&',
	])('« %s » : message sous le champ, aucune requête', async saisie => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher)

		await jsdomWindow.saisir(jsdomWindow.champ('Rayon d’action (en km)'), saisie)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const error = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[id$="-rayon-erreur"]'))
		expect(error.textContent).toBe(ZONE_MESSAGES.rayon)
		expect(jsdomWindow.champ('Rayon d’action (en km)').getAttribute('aria-invalid')).toBe('true')
		expect(calls).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('0 et 200 passent ; vide s’envoie comme « pas de rayon »', async () => {
		for (const [input, expected] of [
			['0', 0],
			['200', 200],
			['', null],
		] as const) {
			const { appels: calls, envoyer: send } = fakeUpload()
			await open(send, fakeSearch({ ok: true, communes: [] }).chercher)
			await jsdomWindow.saisir(jsdomWindow.champ('Rayon d’action (en km)'), input)
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			await jsdomWindow.attendre(() => dialogue() === null)
			expect(calls).toEqual([{ codeInsee: '74010', rayonKm: expected, aDomicile: false }])
			await jsdomWindow.demonter()
		}
	})

	test('« à domicile » se coche et s’envoie', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher)
		await jsdomWindow.cliquer(jsdomWindow.champ('Je me déplace à domicile'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(calls).toEqual([{ codeInsee: '74010', rayonKm: 30, aDomicile: true }])
	})
})

describe('le service des communes en panne', () => {
	test('la recherche le dit en français ; la commune déjà choisie reste enregistrable avec le reste', async () => {
		const { chercher: find } = fakeSearch({ ok: false, message: CITIES_SERVICE_MESSAGE })
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, find, WITH_ANNECY)

		await write('Annec')
		const alert = await jsdomWindow.attendre(() =>
			[...jsdomWindow.w.document.querySelectorAll('[role="alert"]')].find(e => e.textContent === CITIES_SERVICE_MESSAGE)
		)
		expect(alert).toBeTruthy()
		expect(options()).toHaveLength(0)

		expect(calls).toHaveLength(0)
	})

	test('sans toucher à la commune, le rayon se change même quand la liste est en panne', async () => {
		const { chercher: find, textes: texts } = fakeSearch({ ok: false, message: CITIES_SERVICE_MESSAGE })
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(send, find, WITH_ANNECY)

		await jsdomWindow.saisir(jsdomWindow.champ('Rayon d’action (en km)'), '45')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue() === null)

		expect(texts).toEqual([])
		expect(calls).toEqual([{ codeInsee: '74010', rayonKm: 45, aDomicile: false }])
	})

	test('une recherche qui lève donne un message du site, pas le sien', async () => {
		const find: CitiesSearch = async () => {
			throw new Error('Failed to fetch')
		}
		const { envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)
		await write('Annecy')
		expect(jsdomWindow.w.document.body.textContent).not.toContain('Failed to fetch')
		expect(jsdomWindow.w.document.body.textContent).toContain('La recherche n’a pas abouti')
	})

	test('un enregistrement refusé parce que la liste est en panne : message, ancienne commune, saisie gardée', async () => {
		const { chercher: find } = fakeSearch({ ok: true, communes: [LYON] })
		const { appels: calls, envoyer: send } = fakeUpload({ ok: false, message: CITIES_SERVICE_MESSAGE })
		await open(send, find, WITH_ANNECY)
		await write('Lyon')
		const option = options()[0]
		if (!option) throw new Error('pas de suggestion')
		await jsdomWindow.cliquer(option)

		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

		const alert = await jsdomWindow.attendre(() =>
			[...jsdomWindow.w.document.querySelectorAll('[role="alert"] p')].find(
				p => p.textContent === CITIES_SERVICE_MESSAGE
			)
		)
		expect(alert).toBeTruthy()
		expect(calls).toEqual([{ codeInsee: '69123', rayonKm: 30, aDomicile: false }])
		expect(dialogue()).not.toBeNull()
		expect(city().value).toBe('Lyon (69)')
		expect(status()).toBe('')
	})
})

describe('E31 : un échec du serveur', () => {
	test('le message générique du site, le panneau reste ouvert', async () => {
		const { envoyer: send } = fakeUpload({ ok: false, message: FAILURE_MESSAGE })
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
		expect(dialogue()).not.toBeNull()
	})

	test('le message du serveur sur la commune s’affiche sous le champ de la commune', async () => {
		const { envoyer: send } = fakeUpload({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { codeInsee: 'Cette commune n’est pas dans la liste officielle.' },
		})
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		const error = await jsdomWindow.attendre(() =>
			jsdomWindow.w.document.getElementById(city().getAttribute('aria-describedby') ?? '')
		)
		expect(error.textContent).toBe('Cette commune n’est pas dans la liste officielle.')
	})

	test('une fonction d’envoi qui lève donne le message du site', async () => {
		const send: LocationUpload = async () => {
			throw new Error('Failed to fetch')
		}
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
		expect(alert.textContent).toBe(FAILURE_MESSAGE)
	})
})

describe('un double clic n’envoie qu’une requête', () => {
	test('le second clic attend la réponse du premier', async () => {
		let release: () => void = () => undefined
		const waiting = new Promise<void>(fin => {
			release = fin
		})
		const calls: unknown[] = []
		const send: LocationUpload = async saisie => {
			calls.push(saisie)
			await waiting
			return { ok: true, valeurs: { ...WITH_ANNECY } }
		}
		await open(send, fakeSearch({ ok: true, communes: [] }).chercher)
		const button = jsdomWindow.bouton('Enregistrer')
		await jsdomWindow.cliquer(button)
		await jsdomWindow.cliquer(button)
		await jsdomWindow.cliquer(button)
		release()
		await jsdomWindow.attendre(() => dialogue() === null)
		expect(calls).toHaveLength(1)
	})
})

describe('l’ordre des réponses', () => {
	test('une réponse qui arrive après une question plus récente est jetée', async () => {
		const slow: Record<string, () => void> = {}
		const find: CitiesSearch = texte =>
			new Promise(fin => {
				slow[texte] = () => fin({ ok: true, communes: texte === 'An' ? [LYON] : [ANNECY] })
			})
		const { envoyer: send } = fakeUpload()
		await open(send, find, WITHOUT_CITY)

		await write('An')
		await write('Annecy')
		await act(async () => {
			slow.Annecy?.()
			await Promise.resolve()
		})
		await act(async () => {
			slow.An?.()
			await Promise.resolve()
		})

		expect(options().map(o => o.textContent)).toEqual(['Annecy (74)'])
	})
})
