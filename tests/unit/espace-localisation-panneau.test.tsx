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
import { MESSAGES_DE_LA_ZONE } from '@/lib/profil/zone'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The panel of the location (ticket 123; plan 02 U14, U15, U16, E30, E31): the commune chosen in
 * the list with the keyboard and with a tap, free text refused, the radius out of bounds, the
 * service of the communes down, and a single save for a double click. The send and search functions
 * are fakes: no network.
 */

const fenetre = ouvrirFenetre()

const AVEC_ANNECY: LocationValues = {
	codeInsee: '74010',
	libelle: 'Annecy (74)',
	rayonKm: 30,
	aDomicile: false,
}
const SANS_COMMUNE: LocationValues = { codeInsee: '', libelle: '', rayonKm: null, aDomicile: false }

const ANNECY = { codeInsee: '74010', libelle: 'Annecy (74)' }
const LYON = { codeInsee: '69123', libelle: 'Lyon (69)' }
const SAINT_DENIS = { codeInsee: '97411', libelle: 'Saint-Denis (974)' }

type Reponse = Awaited<ReturnType<CitiesSearch>>

/** A search that records what is asked and answers like the list. */
function fausseRecherche(reponse: Reponse | ((texte: string) => Reponse | Promise<Reponse>)) {
	const textes: string[] = []
	const chercher: CitiesSearch = async texte => {
		textes.push(texte)
		return typeof reponse === 'function' ? reponse(texte) : reponse
	}
	return { chercher, textes }
}

function fauxEnvoi(reponse?: Awaited<ReturnType<LocationUpload>>) {
	const appels: Parameters<LocationUpload>[0][] = []
	const envoyer: LocationUpload = async saisie => {
		appels.push(saisie)
		return reponse ?? { ok: true, valeurs: { ...AVEC_ANNECY, ...saisie, libelle: 'Annecy (74)' } }
	}
	return { appels, envoyer }
}

async function ouvrir(envoyer: LocationUpload, chercher: CitiesSearch, valeurs: LocationValues = AVEC_ANNECY) {
	await fenetre.monter(<LocationEditor valeurs={valeurs} envoyer={envoyer} chercher={chercher} />)
	await fenetre.cliquer(fenetre.bouton('Modifier ma localisation'))
}

const commune = (): HTMLInputElement => fenetre.champ('Ta commune') as HTMLInputElement
const dialogue = (): HTMLElement | null => fenetre.w.document.querySelector('[role="dialog"]')
const options = (): HTMLElement[] => [...fenetre.w.document.querySelectorAll<HTMLElement>('[role="option"]')]
/** The announcement of the card (outside the panel). */
const statut = (): string => fenetre.w.document.querySelector('body > div > [role="status"]')?.textContent ?? ''
/** The announcement of the field of the commune (inside the panel). */
const statutDuChamp = (): string => dialogue()?.querySelector('[role="status"]')?.textContent ?? ''

/** Types in the field, then lets the pause of the search pass. */
async function ecrire(texte: string) {
	await fenetre.saisir(commune(), texte)
	await act(async () => {
		await new Promise(fin => setTimeout(fin, SEARCH_PAUSE_MS + 60))
	})
}

async function touche(cible: Element, key: string) {
	let evenement: Event | undefined
	await act(async () => {
		evenement = new fenetre.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
		cible.dispatchEvent(evenement)
	})
	return evenement?.defaultPrevented ?? false
}

describe('le panneau s’ouvre avec la localisation enregistrée', () => {
	test('un dialogue nommé, la commune, le rayon et « à domicile » enregistrés', async () => {
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)

		const d = dialogue()
		expect(d?.getAttribute('aria-modal')).toBe('true')
		expect(fenetre.w.document.getElementById(d?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
			'Modifier ma localisation'
		)
		expect(commune().value).toBe('Annecy (74)')
		expect((fenetre.champ('Rayon d’action (en km)') as HTMLInputElement).value).toBe('30')
		expect((fenetre.champ('Je me déplace à domicile') as HTMLInputElement).checked).toBe(false)
	})

	test('sans rien d’enregistré, tous les champs sont vides', async () => {
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher, SANS_COMMUNE)
		expect(commune().value).toBe('')
		expect((fenetre.champ('Rayon d’action (en km)') as HTMLInputElement).value).toBe('')
	})
})

describe('U16 : « Annecy » choisie au doigt, enregistrée par son code', () => {
	test('un appui sur la suggestion la choisit ; l’envoi porte le code, jamais le nom', async () => {
		const { chercher, textes } = fausseRecherche({ ok: true, communes: [ANNECY, LYON] })
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)

		await ecrire('Annecy')
		expect(textes).toEqual(['Annecy'])
		expect(options().map(o => o.textContent)).toEqual(['Annecy (74)', 'Lyon (69)'])
		expect(commune().getAttribute('aria-expanded')).toBe('true')
		expect(statutDuChamp()).toContain('2 communes proposées.')

		const premiere = options()[0]
		if (!premiere) throw new Error('pas de suggestion')
		// A tap does not take the focus from the field, or its blur would close the list first.
		const appui = new fenetre.w.MouseEvent('mousedown', { bubbles: true, cancelable: true })
		await act(async () => {
			premiere.dispatchEvent(appui)
		})
		expect(appui.defaultPrevented).toBe(true)
		await fenetre.cliquer(premiere)

		expect(commune().value).toBe('Annecy (74)')
		expect(commune().getAttribute('aria-expanded')).toBe('false')

		await fenetre.saisir(fenetre.champ('Rayon d’action (en km)'), '30')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(appels).toEqual([{ codeInsee: '74010', rayonKm: 30, aDomicile: false }])
		expect(statut()).toBe('Ta localisation est enregistrée.')
	})

	test('l’outre-mer se choisit comme le reste : Saint-Denis (974)', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [SAINT_DENIS] })
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('Saint-Denis')
		const option = options()[0]
		if (!option) throw new Error('pas de suggestion')
		await fenetre.cliquer(option)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)
		expect(appels[0]?.codeInsee).toBe('97411')
	})
})

describe('le clavier suffit', () => {
	test('flèches pour parcourir, Entrée pour choisir sans envoyer le formulaire', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [ANNECY, LYON] })
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('An')

		expect(await touche(commune(), 'ArrowDown')).toBe(true)
		expect(commune().getAttribute('aria-activedescendant')).toBe(options()[0]?.id ?? 'x')
		expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
		await touche(commune(), 'ArrowDown')
		expect(options()[1]?.getAttribute('aria-selected')).toBe('true')
		await touche(commune(), 'ArrowUp')
		expect(options()[0]?.getAttribute('aria-selected')).toBe('true')
		// Past the last one, it goes back to the first.
		await touche(commune(), 'ArrowUp')
		expect(options()[1]?.getAttribute('aria-selected')).toBe('true')

		expect(await touche(commune(), 'Enter')).toBe(true)
		expect(commune().value).toBe('Lyon (69)')
		expect(appels).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('Échap ferme la liste, pas le panneau ; un second Échap ferme le panneau', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [ANNECY] })
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('Annecy')
		expect(commune().getAttribute('aria-expanded')).toBe('true')

		await touche(commune(), 'Escape')
		expect(commune().getAttribute('aria-expanded')).toBe('false')
		expect(dialogue()).not.toBeNull()

		await touche(commune(), 'Escape')
		// Nothing is changed: no commune was chosen, so closing needs no confirmation.
		expect(dialogue()).toBeNull()
	})

	test('chaque suggestion fait au moins 44 px (min-h-11) et la liste est annoncée', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [ANNECY] })
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('Annecy')
		expect(options()[0]?.className).toContain('min-h-11')
		expect(commune().getAttribute('role')).toBe('combobox')
		expect(fenetre.w.document.querySelector('[role="listbox"]')?.id).toBe(
			commune().getAttribute('aria-controls') ?? 'x'
		)
	})
})

describe('un texte libre n’est jamais une commune', () => {
	test('du texte tapé sans choix : message sous le champ, aucune requête', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [ANNECY] })
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('Annecy')

		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const erreur = await fenetre.attendre(() =>
			fenetre.w.document.getElementById(/* id read below */ commune().getAttribute('aria-describedby') ?? '')
		)
		expect(erreur.textContent).toBe(CITY_TO_CHOOSE_MESSAGE)
		expect(commune().getAttribute('aria-invalid')).toBe('true')
		expect(appels).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('retaper après un choix reprend la commune : plus de commune choisie, rien n’est envoyé', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [ANNECY] })
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, AVEC_ANNECY)

		await fenetre.saisir(commune(), 'Annec')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		await fenetre.attendre(() => commune().getAttribute('aria-invalid'))
		expect(appels).toHaveLength(0)
	})

	test('une adresse tapée : le message le dit, la liste reste fermée', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [], motif: 'adresse' })
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('12 rue des Lilas')
		expect(fenetre.w.document.body.textContent).toContain(REFUSED_ADDRESS_MESSAGE)
		expect(options()).toHaveLength(0)
		expect(commune().getAttribute('aria-expanded')).toBe('false')
	})

	test('aucune commune ne correspond : le dit, sans liste', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [] })
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('Zzzzz')
		expect(statutDuChamp()).toContain('Aucune commune ne correspond.')
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
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)

		await fenetre.saisir(fenetre.champ('Rayon d’action (en km)'), saisie)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const erreur = await fenetre.attendre(() => fenetre.w.document.querySelector('[id$="-rayon-erreur"]'))
		expect(erreur.textContent).toBe(MESSAGES_DE_LA_ZONE.rayon)
		expect(fenetre.champ('Rayon d’action (en km)').getAttribute('aria-invalid')).toBe('true')
		expect(appels).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})

	test('0 et 200 passent ; vide s’envoie comme « pas de rayon »', async () => {
		for (const [saisie, attendu] of [
			['0', 0],
			['200', 200],
			['', null],
		] as const) {
			const { appels, envoyer } = fauxEnvoi()
			await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)
			await fenetre.saisir(fenetre.champ('Rayon d’action (en km)'), saisie)
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			await fenetre.attendre(() => dialogue() === null)
			expect(appels).toEqual([{ codeInsee: '74010', rayonKm: attendu, aDomicile: false }])
			await fenetre.demonter()
		}
	})

	test('« à domicile » se coche et s’envoie', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)
		await fenetre.cliquer(fenetre.champ('Je me déplace à domicile'))
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)
		expect(appels).toEqual([{ codeInsee: '74010', rayonKm: 30, aDomicile: true }])
	})
})

describe('le service des communes en panne', () => {
	test('la recherche le dit en français ; la commune déjà choisie reste enregistrable avec le reste', async () => {
		const { chercher } = fausseRecherche({ ok: false, message: CITIES_SERVICE_MESSAGE })
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, AVEC_ANNECY)

		await ecrire('Annec')
		const alerte = await fenetre.attendre(() =>
			[...fenetre.w.document.querySelectorAll('[role="alert"]')].find(e => e.textContent === CITIES_SERVICE_MESSAGE)
		)
		expect(alerte).toBeTruthy()
		expect(options()).toHaveLength(0)

		expect(appels).toHaveLength(0)
	})

	test('sans toucher à la commune, le rayon se change même quand la liste est en panne', async () => {
		const { chercher, textes } = fausseRecherche({ ok: false, message: CITIES_SERVICE_MESSAGE })
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, AVEC_ANNECY)

		await fenetre.saisir(fenetre.champ('Rayon d’action (en km)'), '45')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(textes).toEqual([])
		expect(appels).toEqual([{ codeInsee: '74010', rayonKm: 45, aDomicile: false }])
	})

	test('une recherche qui lève donne un message du site, pas le sien', async () => {
		const chercher: CitiesSearch = async () => {
			throw new Error('Failed to fetch')
		}
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)
		await ecrire('Annecy')
		expect(fenetre.w.document.body.textContent).not.toContain('Failed to fetch')
		expect(fenetre.w.document.body.textContent).toContain('La recherche n’a pas abouti')
	})

	test('un enregistrement refusé parce que la liste est en panne : message, ancienne commune, saisie gardée', async () => {
		const { chercher } = fausseRecherche({ ok: true, communes: [LYON] })
		const { appels, envoyer } = fauxEnvoi({ ok: false, message: CITIES_SERVICE_MESSAGE })
		await ouvrir(envoyer, chercher, AVEC_ANNECY)
		await ecrire('Lyon')
		const option = options()[0]
		if (!option) throw new Error('pas de suggestion')
		await fenetre.cliquer(option)

		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() =>
			[...fenetre.w.document.querySelectorAll('[role="alert"] p')].find(p => p.textContent === CITIES_SERVICE_MESSAGE)
		)
		expect(alerte).toBeTruthy()
		expect(appels).toEqual([{ codeInsee: '69123', rayonKm: 30, aDomicile: false }])
		expect(dialogue()).not.toBeNull()
		expect(commune().value).toBe('Lyon (69)')
		expect(statut()).toBe('')
	})
})

describe('E31 : un échec du serveur', () => {
	test('le message générique du site, le panneau reste ouvert', async () => {
		const { envoyer } = fauxEnvoi({ ok: false, message: FAILURE_MESSAGE })
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(FAILURE_MESSAGE)
		expect(dialogue()).not.toBeNull()
	})

	test('le message du serveur sur la commune s’affiche sous le champ de la commune', async () => {
		const { envoyer } = fauxEnvoi({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { codeInsee: 'Cette commune n’est pas dans la liste officielle.' },
		})
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		const erreur = await fenetre.attendre(() =>
			fenetre.w.document.getElementById(commune().getAttribute('aria-describedby') ?? '')
		)
		expect(erreur.textContent).toBe('Cette commune n’est pas dans la liste officielle.')
	})

	test('une fonction d’envoi qui lève donne le message du site', async () => {
		const envoyer: LocationUpload = async () => {
			throw new Error('Failed to fetch')
		}
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(FAILURE_MESSAGE)
	})
})

describe('un double clic n’envoie qu’une requête', () => {
	test('le second clic attend la réponse du premier', async () => {
		let liberer: () => void = () => undefined
		const attente = new Promise<void>(fin => {
			liberer = fin
		})
		const appels: unknown[] = []
		const envoyer: LocationUpload = async saisie => {
			appels.push(saisie)
			await attente
			return { ok: true, valeurs: { ...AVEC_ANNECY } }
		}
		await ouvrir(envoyer, fausseRecherche({ ok: true, communes: [] }).chercher)
		const bouton = fenetre.bouton('Enregistrer')
		await fenetre.cliquer(bouton)
		await fenetre.cliquer(bouton)
		await fenetre.cliquer(bouton)
		liberer()
		await fenetre.attendre(() => dialogue() === null)
		expect(appels).toHaveLength(1)
	})
})

describe('l’ordre des réponses', () => {
	test('une réponse qui arrive après une question plus récente est jetée', async () => {
		const lentes: Record<string, () => void> = {}
		const chercher: CitiesSearch = texte =>
			new Promise(fin => {
				lentes[texte] = () => fin({ ok: true, communes: texte === 'An' ? [LYON] : [ANNECY] })
			})
		const { envoyer } = fauxEnvoi()
		await ouvrir(envoyer, chercher, SANS_COMMUNE)

		await ecrire('An')
		await ecrire('Annecy')
		await act(async () => {
			lentes.Annecy?.()
			await Promise.resolve()
		})
		await act(async () => {
			lentes.An?.()
			await Promise.resolve()
		})

		expect(options().map(o => o.textContent)).toEqual(['Annecy (74)'])
	})
})
