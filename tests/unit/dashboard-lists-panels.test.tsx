import { describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { act } from 'react'
import type { ListUpload } from '@/components/dashboard/ListEditor'
import { CoursesEditor, ExperiencesEditor, ServiceOffersEditor } from '@/components/dashboard/ListsEditors'
import type { SavedRow, SentList } from '@/lib/dashboard/list'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'

/**
 * The panels of the experiences, the courses and the offers (tickets 129 to 131; docs/qualite.md §3,
 * rules L1 to L7; plan 02 U29, U30, E31). The three share one editor: every rule is played on each
 * section. The send functions are fakes: no network.
 */

const jsdomWindow = openWindow()

interface Case {
	readonly name: string
	readonly ouvrir: string
	readonly monter: (lignes: readonly SavedRow[], envoyer: ListUpload) => ReactElement
	/** The texts of a row, by field. */
	readonly ligne: Record<string, string>
	/** The same row, changed. */
	readonly autre: Record<string, string>
	/** The label of a text field of the form, and of a long one. */
	readonly champTexte: string
	readonly champLong: string
	readonly doublon: string
	readonly retrait: string
	readonly enregistre: string
	readonly designation: string
	/** The labels of the fields a new row requires, with what is missing in the message. */
	readonly vide: Record<string, string>
}

const CASE: readonly Case[] = [
	{
		name: 'expériences',
		ouvrir: 'Modifier mes expériences',
		monter: (lignes, envoyer) => <ExperiencesEditor lignes={lignes} envoyer={envoyer} />,
		ligne: {
			jobTitle: 'Maquilleuse',
			company: 'Studio Fictif',
			city: 'Lyon',
			startDate: '2020-03-01',
			endDate: '',
			description: '',
		},
		autre: {
			jobTitle: 'Cheffe maquilleuse',
			company: 'Studio Fictif',
			city: 'Lyon',
			startDate: '2020-03-01',
			endDate: '',
			description: '',
		},
		champTexte: 'Poste',
		champLong: 'Description',
		doublon: 'Une expérience identique est déjà dans la liste.',
		retrait: 'Expérience Studio Fictif retirée',
		enregistre: 'Tes expériences sont enregistrées.',
		designation: 'l’expérience',
		vide: {
			'experiences-company-erreur': 'Le nom de l’entreprise est requis.',
			'experiences-jobTitle-erreur': 'Le nom du poste est requis.',
			'experiences-startDate-erreur': 'La date de début de l’expérience est requise.',
		},
	},
	{
		name: 'courses',
		ouvrir: 'Modifier mes formations',
		monter: (lignes, envoyer) => <CoursesEditor lignes={lignes} envoyer={envoyer} />,
		ligne: { diploma: 'CAP esthétique', school: 'École Fictive', graduatedAt: '2018-06-30', description: '' },
		autre: { diploma: 'BP esthétique', school: 'École Fictive', graduatedAt: '2018-06-30', description: '' },
		champTexte: 'Diplôme',
		champLong: 'Description',
		doublon: 'Une formation identique est déjà dans la liste.',
		retrait: 'Formation CAP esthétique retirée',
		enregistre: 'Tes formations sont enregistrées.',
		designation: 'la formation',
		vide: {
			'courses-diploma-erreur': 'Le nom du diplôme est requis.',
			'courses-school-erreur': 'Le nom de l’école est requis.',
		},
	},
	{
		name: 'serviceOffers',
		ouvrir: 'Modifier mes prestations',
		monter: (lignes, envoyer) => <ServiceOffersEditor lignes={lignes} envoyer={envoyer} />,
		ligne: { name: 'Maquillage de mariée', description: '', price: 'à partir de 80 €' },
		autre: { name: 'Maquillage de soirée', description: '', price: 'à partir de 80 €' },
		champTexte: 'Nom de la prestation',
		champLong: 'Description',
		doublon: 'Une prestation identique est déjà dans la liste.',
		retrait: 'Prestation Maquillage de mariée retirée',
		enregistre: 'Tes prestations sont enregistrées.',
		designation: 'la prestation',
		vide: { 'serviceOffers-name-erreur': 'Le nom de la prestation est requis.' },
	},
]

const dialogue = (): HTMLElement => {
	const d = jsdomWindow.w.document.querySelector<HTMLElement>('[role="dialog"]')
	if (!d) throw new Error('pas de panneau ouvert')
	return d
}
const active = (): Element | null => jsdomWindow.w.document.activeElement
const shownLines = (): HTMLElement[] => [...dialogue().querySelectorAll<HTMLElement>('li[data-ligne]')]
const announcementZone = (): HTMLElement => {
	const zone = dialogue().querySelector<HTMLElement>('[role="status"]')
	if (!zone) throw new Error('pas de zone d’annonce')
	return zone
}

/** The labels of the fields, from the id the editor gives them: `<section>-<champ>`. */
const identifierOf = (cas: Case, champ: string): string =>
	`${cas.name === 'expériences' ? 'experiences' : cas.name}-${champ}`
const fieldByName = (cas: Case, champ: string): HTMLInputElement | HTMLTextAreaElement => {
	const element = dialogue().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${identifierOf(cas, champ)}`)
	if (!element) throw new Error(`pas de champ ${champ}`)
	return element
}

/** A section with options always sends them, empty when the row has none (ticket 132). */
const withoutOptions = (cas: Case): { options?: [] } => (cas.name === 'serviceOffers' ? { options: [] } : {})

async function fill(cas: Case, valeurs: Record<string, string>) {
	for (const [field, value] of Object.entries(valeurs)) await jsdomWindow.saisir(fieldByName(cas, field), value)
}

async function add(cas: Case, valeurs: Record<string, string>) {
	await fill(cas, valeurs)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Ajouter'))
}

/** An activation by the keyboard: Enter goes down, then the button is clicked, with no mouse button before. */
async function enableKeyboard(bouton: HTMLElement, options: { repeat?: boolean } = {}): Promise<boolean> {
	let event: Event | undefined
	await act(async () => {
		bouton.focus()
		event = new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options })
		bouton.dispatchEvent(event)
	})
	// jsdom never turns a keydown into a click: it is sent unless the keydown was cancelled, as a browser does.
	if (event?.defaultPrevented) return false
	await act(async () => {
		bouton.dispatchEvent(new jsdomWindow.w.MouseEvent('click', { bubbles: true, cancelable: true }))
	})
	return true
}

function fakeUpload(reponse?: Awaited<ReturnType<ListUpload>>) {
	const calls: SentList[] = []
	const send: ListUpload = async liste => {
		calls.push(liste)
		return (
			reponse ?? {
				ok: true,
				valeurs: {
					lignes: liste.lignes.map((ligne, rang) => ({
						id: ligne.id ?? `nouvelle-${rang}`,
						valeurs: ligne.valeurs,
						...(ligne.options === undefined
							? {}
							: {
									options: ligne.options.map((option, place) => ({
										id: option.id ?? `option-${rang}-${place}`,
										valeurs: option.valeurs,
									})),
								}),
					})),
				},
			}
		)
	}
	return { appels: calls, envoyer: send }
}

/** Two rows that say the same thing, as the server gave them each its own identifier. */
const identical = (cas: Case): SavedRow[] => [
	{ id: 'aaa', valeurs: cas.ligne },
	{ id: 'bbb', valeurs: cas.ligne },
]

async function open(cas: Case, lignes: readonly SavedRow[], envoyer: ListUpload = fakeUpload().envoyer) {
	await jsdomWindow.monter(cas.monter(lignes, envoyer))
	await jsdomWindow.cliquer(jsdomWindow.bouton(cas.ouvrir))
}

for (const testCase of CASE) {
	describe(`${testCase.name} : le panneau`, () => {
		test('il s’ouvre avec les lignes enregistrées, dans un dialogue nommé', async () => {
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }])
			expect(dialogue().getAttribute('aria-modal')).toBe('true')
			expect(shownLines()).toHaveLength(1)
			expect(shownLines()[0]?.textContent).toContain(Object.values(testCase.ligne)[0] as string)
		})

		test('L1 : deux lignes identiques se retirent et se modifient séparément', async () => {
			const { appels: calls, envoyer: send } = fakeUpload()
			await open(testCase, identical(testCase), send)

			// Changing the second leaves the first as it was.
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Modifier /, shownLines()[1]))
			await fill(testCase, { [Object.keys(testCase.autre)[0] as string]: Object.values(testCase.autre)[0] as string })
			await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))
			expect(shownLines()).toHaveLength(2)
			expect(shownLines()[0]?.textContent).toContain(Object.values(testCase.ligne)[0] as string)
			expect(shownLines()[1]?.textContent).toContain(Object.values(testCase.autre)[0] as string)

			// Removing the first leaves the second, with its own identifier.
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(shownLines()).toHaveLength(1)
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			await jsdomWindow.attendre(() => calls.length === 1)
			expect(calls[0]?.lignes).toEqual([{ id: 'bbb', valeurs: { ...testCase.autre }, ...withoutOptions(testCase) }])
		})

		test('L2 : la frappe garde le focus, vingt caractères dans chaque champ, juste après un ajout', async () => {
			await open(testCase, [])
			await add(testCase, testCase.ligne)
			for (const field of Object.keys(testCase.ligne)) {
				const element = fieldByName(testCase, field)
				if (element.type === 'date') continue
				element.focus()
				let typed = ''
				for (let n = 0; n < 20; n++) {
					typed += 'a'
					await jsdomWindow.saisir(element, typed)
					expect(active()).toBe(element)
					expect(fieldByName(testCase, field)).toBe(element)
				}
				expect(element.value).toBe('a'.repeat(20))
			}
		})

		test('L3 : retirer la ligne en cours remet le formulaire en « Ajouter » sans perdre la saisie', async () => {
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }])
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Modifier /, shownLines()[0]))
			expect(jsdomWindow.bouton('Valider la modification')).toBeTruthy()
			const field = Object.keys(testCase.ligne)[0] as string
			await jsdomWindow.saisir(fieldByName(testCase, field), 'Saisie en cours')

			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))

			expect(shownLines()).toHaveLength(0)
			expect(jsdomWindow.bouton('Ajouter')).toBeTruthy()
			expect(fieldByName(testCase, field).value).toBe('Saisie en cours')
		})

		test('L3 : retirer la ligne chargée et laissée telle quelle vide le formulaire', async () => {
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }])
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Modifier /, shownLines()[0]))
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(jsdomWindow.bouton('Ajouter')).toBeTruthy()
			expect(fieldByName(testCase, Object.keys(testCase.ligne)[0] as string).value).toBe('')
		})

		test('L4 : au clavier, le focus reste dans le panneau, sur la ligne qui prend la place puis sur celle du dessus', async () => {
			const three: SavedRow[] = [
				{ id: 'a', valeurs: testCase.ligne },
				{ id: 'b', valeurs: testCase.autre },
				{ id: 'c', valeurs: { ...testCase.autre, [Object.keys(testCase.autre)[0] as string]: 'Troisième' } },
			]
			await open(testCase, three)

			// The first row leaves: the second takes its place.
			await enableKeyboard(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(active()).toBe(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(dialogue().contains(active())).toBe(true)
			// The last row leaves: the one above takes the focus.
			await enableKeyboard(jsdomWindow.bouton(/^Retirer /, shownLines()[1]))
			expect(shownLines()).toHaveLength(1)
			expect(active()).toBe(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
		})

		test('L4 : la seule ligne retirée au clavier envoie le focus au formulaire d’ajout', async () => {
			await open(testCase, [{ id: 'a', valeurs: testCase.ligne }])
			await enableKeyboard(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(shownLines()).toHaveLength(0)
			expect(active()).toBe(fieldByName(testCase, Object.keys(testCase.ligne)[0] as string))
		})

		test('L4 : après un clic, le focus ne va jamais sur un champ : la ligne suivante, ou le titre du panneau', async () => {
			await open(testCase, identical(testCase))
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(active()).toBe(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))

			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(shownLines()).toHaveLength(0)
			expect(active()?.tagName).toBe('H2')
			expect(dialogue().contains(active())).toBe(true)
		})

		test('L5 : la zone d’annonce est là et vide à l’ouverture, chaque retrait y est dit, même nom deux fois', async () => {
			await open(testCase, identical(testCase))
			expect(announcementZone().textContent).toBe('')

			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(announcementZone().textContent).toBe(testCase.retrait)
			const firstOne = announcementZone().firstElementChild

			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			expect(announcementZone().textContent).toBe(testCase.retrait)
			// Said again: a new node, which a screen reader reads again.
			expect(announcementZone().firstElementChild).not.toBe(firstOne)
		})

		test('L6 : une ligne identique à une ligne de la liste est refusée, avec son message', async () => {
			await open(testCase, [])
			await add(testCase, testCase.ligne)
			expect(shownLines()).toHaveLength(1)

			await add(testCase, testCase.ligne)
			expect(shownLines()).toHaveLength(1)
			expect(dialogue().querySelector('[role="alert"]:not(:empty)')?.textContent).toBe(testCase.doublon)

			// The message goes when she changes the form.
			await jsdomWindow.saisir(fieldByName(testCase, Object.keys(testCase.ligne)[0] as string), 'Autre')
			expect(dialogue().textContent).not.toContain(testCase.doublon)
		})

		test('L6 : une ligne ouverte par « Modifier » et validée sans changement est acceptée', async () => {
			await open(testCase, identical(testCase))
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Modifier /, shownLines()[0]))
			await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))

			expect(dialogue().textContent).not.toContain(testCase.doublon)
			expect(shownLines()).toHaveLength(2)
			expect(jsdomWindow.bouton('Ajouter')).toBeTruthy()
		})

		test('L7 : Entrée maintenue sur un bouton n’agit qu’une fois, sur « Retirer », « Ajouter » et « Enregistrer »', async () => {
			const { appels: calls, envoyer: send } = fakeUpload()
			await open(testCase, identical(testCase), send)

			// Held down, the keydown repeats: it is cancelled, and no click follows.
			const remove = jsdomWindow.bouton(/^Retirer /, shownLines()[0])
			expect(await enableKeyboard(remove, { repeat: true })).toBe(false)
			expect(await enableKeyboard(remove, { repeat: true })).toBe(false)
			expect(shownLines()).toHaveLength(2)
			// The first press acts once.
			expect(await enableKeyboard(remove, { repeat: false })).toBe(true)
			expect(shownLines()).toHaveLength(1)

			await fill(testCase, testCase.autre)
			expect(await enableKeyboard(jsdomWindow.bouton('Ajouter'), { repeat: true })).toBe(false)
			expect(shownLines()).toHaveLength(1)
			expect(await enableKeyboard(jsdomWindow.bouton('Ajouter'), { repeat: false })).toBe(true)
			expect(shownLines()).toHaveLength(2)

			const save = jsdomWindow.bouton('Enregistrer')
			expect(await enableKeyboard(save, { repeat: true })).toBe(false)
			expect(calls).toHaveLength(0)
			await enableKeyboard(save, { repeat: false })
			await jsdomWindow.attendre(() => calls.length === 1)
			expect(calls).toHaveLength(1)
		})

		test('L7 : dans un texte long, Entrée maintenue garde son effet', async () => {
			await open(testCase, [])
			const long = fieldByName(testCase, 'description')
			let event: Event | undefined
			await act(async () => {
				long.focus()
				event = new jsdomWindow.w.KeyboardEvent('keydown', {
					key: 'Enter',
					repeat: true,
					bubbles: true,
					cancelable: true,
				})
				long.dispatchEvent(event)
			})
			expect(event?.defaultPrevented).toBe(false)
		})

		test('une ligne sans ses champs obligatoires n’est pas ajoutée : le message est sous chaque champ', async () => {
			await open(testCase, [])
			await jsdomWindow.cliquer(jsdomWindow.bouton('Ajouter'))
			expect(shownLines()).toHaveLength(0)
			for (const [identifier, message] of Object.entries(testCase.vide)) {
				expect(jsdomWindow.w.document.getElementById(identifier)?.textContent).toBe(message)
			}
		})

		test('E31 : « Enregistrer » envoie la liste entière, avec les identifiants, puis le panneau se ferme et le dit', async () => {
			const { appels: calls, envoyer: send } = fakeUpload()
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }], send)
			await add(testCase, testCase.autre)
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="dialog"]') === null)

			expect(calls).toEqual([
				{
					lignes: [
						{ id: 'aaa', valeurs: { ...testCase.ligne }, ...withoutOptions(testCase) },
						{ valeurs: { ...testCase.autre }, ...withoutOptions(testCase) },
					],
				},
			])
			expect(jsdomWindow.w.document.querySelector('[role="status"]')?.textContent).toBe(testCase.enregistre)
		})

		test('E31 : un échec garde la liste et la saisie, dit pourquoi, et le panneau reste ouvert', async () => {
			const { envoyer: send } = fakeUpload({ ok: false, message: FAILURE_MESSAGE })
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }], send)
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))

			const alert = await jsdomWindow.attendre(() => dialogue().querySelector('[role="alert"] p'))
			expect(alert.textContent).toBe(FAILURE_MESSAGE)
			expect(shownLines()).toHaveLength(0)
			expect(jsdomWindow.w.document.querySelector('[role="status"]')?.textContent).toBe('')
		})

		test('E31 : une fonction d’envoi qui lève donne le message du site', async () => {
			const raise: ListUpload = async () => {
				throw new Error('Failed to fetch')
			}
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }], raise)
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			const alert = await jsdomWindow.attendre(() => dialogue().querySelector('[role="alert"] p'))
			expect(alert.textContent).toBe(FAILURE_MESSAGE)
		})

		test('E31 : fermer avec des changements non enregistrés demande confirmation, puis rend les valeurs d’origine', async () => {
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }])
			await jsdomWindow.cliquer(jsdomWindow.bouton(/^Retirer /, shownLines()[0]))
			await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
			await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))
			expect(jsdomWindow.w.document.querySelector('[role="dialog"]')).toBeNull()

			await jsdomWindow.cliquer(jsdomWindow.bouton(testCase.ouvrir))
			expect(shownLines()).toHaveLength(1)
		})

		test('une ligne en cours de saisie n’est pas perdue en silence : « Enregistrer » le dit et n’envoie rien', async () => {
			const { appels: calls, envoyer: send } = fakeUpload()
			await open(testCase, [], send)
			await fill(testCase, { [Object.keys(testCase.ligne)[0] as string]: 'Pas encore ajoutée' })
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			expect(dialogue().querySelector('[role="alert"] p')?.textContent).toContain('ligne en cours de saisie')
			expect(calls).toHaveLength(0)
		})

		test('deux clics sur « Enregistrer » avant la réponse : un seul envoi', async () => {
			let respond: (() => void) | undefined
			const calls: SentList[] = []
			const send: ListUpload = liste => {
				calls.push(liste)
				return new Promise(resolve => {
					respond = () => resolve({ ok: true, valeurs: { lignes: [] } })
				})
			}
			await open(testCase, [{ id: 'aaa', valeurs: testCase.ligne }], send)
			const button = jsdomWindow.bouton('Enregistrer')
			await jsdomWindow.cliquer(button)
			await jsdomWindow.cliquer(button)
			expect(calls).toHaveLength(1)
			await act(async () => respond?.())
			await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="dialog"]') === null)
			expect(calls).toHaveLength(1)
		})
	})
}

describe('129, U30 : la fin d’une expérience ne précède pas son début', () => {
	const testCase = CASE[0] as Case
	test('une fin avant le début est refusée sous le champ « Fin », rien n’est ajouté', async () => {
		await open(testCase, [])
		await add(testCase, { ...testCase.ligne, startDate: '2022-05-01', endDate: '2021-01-01' })
		expect(shownLines()).toHaveLength(0)
		expect(jsdomWindow.w.document.getElementById('experiences-endDate-erreur')?.textContent).toBe(
			'La fin d’une expérience ne peut pas précéder son début.'
		)
		expect(fieldByName(testCase, 'endDate').getAttribute('aria-invalid')).toBe('true')
	})

	test('une fin le jour du début est acceptée, et une expérience en cours n’a pas de fin', async () => {
		await open(testCase, [])
		await add(testCase, { ...testCase.ligne, startDate: '2022-05-01', endDate: '2022-05-01' })
		await add(testCase, { ...testCase.autre, startDate: '2023-01-01', endDate: '' })
		expect(shownLines()).toHaveLength(2)
		expect(shownLines()[1]?.textContent).toContain('aujourd’hui')
	})
})

describe('130, U30 : une date d’obtention à plus d’un an dans le futur est refusée', () => {
	const testCase = CASE[1] as Case
	test('le refus est sous le champ, la ligne n’est pas ajoutée', async () => {
		await open(testCase, [])
		await add(testCase, { ...testCase.ligne, graduatedAt: '2099-01-01' })
		expect(shownLines()).toHaveLength(0)
		expect(jsdomWindow.w.document.getElementById('courses-graduatedAt-erreur')?.textContent).toBe(
			'Une date d’obtention ne peut pas dépasser d’un an la date du jour.'
		)
	})

	test('une date passée, ou sans date, est acceptée', async () => {
		await open(testCase, [])
		await add(testCase, testCase.ligne)
		await add(testCase, { ...testCase.autre, graduatedAt: '' })
		expect(shownLines()).toHaveLength(2)
	})
})

describe('131, U29 : le prix, sous le champ, dit le montant retenu', () => {
	const testCase = CASE[2] as Case
	const hint = (): string => jsdomWindow.w.document.getElementById('serviceOffers-price-indice')?.textContent ?? ''

	for (const input of ['80', '80 €', 'à partir de 80']) {
		test(`« ${input} » donne un montant de 80 €`, async () => {
			await open(testCase, [])
			await jsdomWindow.saisir(fieldByName(testCase, 'price'), input)
			expect(hint()).toBe('Montant retenu pour ton profil : 80 €.')
		})
	}

	test('« sur devis » est gardé tel quel, sans montant, et le dit', async () => {
		await open(testCase, [])
		await jsdomWindow.saisir(fieldByName(testCase, 'price'), 'sur devis')
		expect(hint()).toContain('Aucun montant retenu')
		await add(testCase, { name: 'Maquillage de mariée', price: 'sur devis' })
		expect(shownLines()[0]?.querySelector('span')?.textContent).toBe('Maquillage de mariée - Sur devis')
	})

	test('plusieurs formules se séparent par un point-virgule', async () => {
		await open(testCase, [])
		await add(testCase, { name: 'Cours', price: '60 € ; sur devis' })
		expect(shownLines()[0]?.textContent).toContain('60')
		expect(shownLines()[0]?.textContent).toContain('Sur devis')
	})

	test('un nom est requis, et un prix de plus de 70 caractères est refusé', async () => {
		await open(testCase, [])
		await add(testCase, { price: '80' })
		expect(jsdomWindow.w.document.getElementById('serviceOffers-name-erreur')?.textContent).toBe(
			'Le nom de la prestation est requis.'
		)
		await add(testCase, { name: 'Cours', price: 'a'.repeat(71) })
		expect(jsdomWindow.w.document.getElementById('serviceOffers-price-erreur')?.textContent).toBe(
			'Ce texte ne doit pas dépasser 70 caractères.'
		)
		expect(shownLines()).toHaveLength(0)
	})
})

describe('132 : les options d’une prestation', () => {
	const testCase = CASE[2] as Case
	const TEST = { name: 'Essai', description: '', price: '30' }
	const LASHES = { name: 'Cils', description: 'Pose de cils', price: 'sur devis' }
	const bride = (options: SavedRow[]): SavedRow => ({
		id: 'p1',
		valeurs: { name: 'Maquillage de mariée', description: '', price: 'à partir de 80 €' },
		options,
	})
	const two = (): SavedRow[] => [
		bride([
			{ id: 'o1', valeurs: TEST },
			{ id: 'o2', valeurs: LASHES },
		]),
	]

	const options = (): HTMLElement[] => [...dialogue().querySelectorAll<HTMLElement>('li[data-option]')]
	const optionField = (rang: number, nom: string): HTMLInputElement | HTMLTextAreaElement => {
		const element = options()[rang]?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${nom}"]`)
		if (!element) throw new Error(`pas de champ ${nom} à l’option ${rang}`)
		return element
	}
	const additionField = (nom: string): HTMLInputElement | HTMLTextAreaElement => {
		const element = dialogue().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#options-${nom}`)
		if (!element) throw new Error(`pas de champ d’ajout ${nom}`)
		return element
	}
	const optionsRemovals = (): HTMLElement[] => [...dialogue().querySelectorAll<HTMLElement>('[data-retirer-option]')]
	const addOption = async (valeurs: Record<string, string>) => {
		for (const [name, value] of Object.entries(valeurs)) await jsdomWindow.saisir(additionField(name), value)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Ajouter l’option'))
	}
	const updateServiceOffer = async (rang = 0) =>
		jsdomWindow.cliquer(jsdomWindow.bouton(/^Modifier /, shownLines()[rang]))
	const alert = (): string => dialogue().querySelector('#options-doublon')?.textContent ?? ''

	async function typeTwentyCharacters(element: HTMLInputElement | HTMLTextAreaElement, retrouver: () => Element) {
		element.focus()
		let typed = ''
		for (let n = 0; n < 20; n++) {
			typed += 'a'
			await jsdomWindow.saisir(element, typed)
			expect(active()).toBe(element)
			expect(retrouver()).toBe(element)
		}
		expect(element.value).toBe('a'.repeat(20))
	}

	test('la prestation ouverte montre ses options, dans l’ordre, chacune avec ses trois champs', async () => {
		await open(testCase, two())
		expect(shownLines()[0]?.textContent).toContain('2 options')
		await updateServiceOffer()
		expect(options()).toHaveLength(2)
		expect(optionField(0, 'name').value).toBe('Essai')
		expect(optionField(1, 'name').value).toBe('Cils')
		expect(optionField(1, 'description').value).toBe('Pose de cils')
		expect(optionField(1, 'price').value).toBe('sur devis')
	})

	test('L2 : juste après un enregistrement, vingt caractères d’affilée dans chaque champ de chaque option, focus fixe', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(testCase, two(), send)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="dialog"]') === null)
		expect(calls).toHaveLength(1)

		// Reopened on what the server gave back, as after a save.
		await jsdomWindow.cliquer(jsdomWindow.bouton(testCase.ouvrir))
		await updateServiceOffer()
		for (const rank of [0, 1]) {
			for (const name of ['name', 'description', 'price']) {
				await typeTwentyCharacters(optionField(rank, name), () => optionField(rank, name))
			}
		}
	}, 60_000)

	test('L2 : une option qui vient d’être ajoutée se tape aussi sans perdre le focus', async () => {
		await open(testCase, [bride([])])
		await updateServiceOffer()
		await addOption(TEST)
		for (const name of ['name', 'description', 'price']) {
			await typeTwentyCharacters(optionField(0, name), () => optionField(0, name))
		}
		// And the small form that adds one.
		await typeTwentyCharacters(additionField('name'), () => additionField('name'))
	}, 60_000)

	test('L1 : deux options identiques se retirent séparément, chacune garde son identifiant', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		await open(
			testCase,
			[
				bride([
					{ id: 'o1', valeurs: TEST },
					{ id: 'o2', valeurs: TEST },
				]),
			],
			send
		)
		await updateServiceOffer()
		await jsdomWindow.cliquer(optionsRemovals()[0] as HTMLElement)
		expect(options()).toHaveLength(1)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => calls.length === 1)
		expect(calls[0]?.lignes[0]?.options).toEqual([{ id: 'o2', valeurs: TEST }])
	})

	test('une option ajoutée part sans identifiant, les autres gardent le leur, dans l’ordre, sous la bonne prestation', async () => {
		const { appels: calls, envoyer: send } = fakeUpload()
		const other: SavedRow = {
			id: 'p2',
			valeurs: { name: 'Maquillage de soirée', description: '', price: '60' },
			options: [{ id: 'o9', valeurs: { name: 'Retouches', description: '', price: '' } }],
		}
		await open(testCase, [bride([{ id: 'o1', valeurs: TEST }]), other], send)
		await updateServiceOffer(1)
		await addOption(LASHES)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => calls.length === 1)
		expect(calls[0]?.lignes.map(ligne => [ligne.id, ligne.options])).toEqual([
			['p1', [{ id: 'o1', valeurs: TEST }]],
			['p2', [{ id: 'o9', valeurs: { name: 'Retouches', description: '', price: '' } }, { valeurs: LASHES }]],
		])
	})

	test('L6 : une option identique à une option de la liste est refusée, avec son message', async () => {
		await open(testCase, [bride([{ id: 'o1', valeurs: TEST }])])
		await updateServiceOffer()
		await addOption(TEST)
		expect(options()).toHaveLength(1)
		expect(alert()).toBe('Une option identique est déjà dans la liste.')
		// Typing again takes the message away.
		await jsdomWindow.saisir(additionField('name'), 'Essai 2')
		expect(alert()).toBe('')
	})

	test('L6 : deux options rendues identiques par la saisie refusent la prestation, qui n’est pas validée', async () => {
		await open(testCase, two())
		await updateServiceOffer()
		await jsdomWindow.saisir(optionField(1, 'name'), 'Essai')
		await jsdomWindow.saisir(optionField(1, 'description'), '')
		await jsdomWindow.saisir(optionField(1, 'price'), '30')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))
		expect(alert()).toBe('Une option identique est déjà dans la liste.')
		expect(jsdomWindow.bouton('Valider la modification')).toBeTruthy()
	})

	test('L7 : Entrée maintenue sur « Ajouter l’option » ajoute une seule option', async () => {
		await open(testCase, [bride([])])
		await updateServiceOffer()
		await jsdomWindow.saisir(additionField('name'), 'Essai')
		const button = jsdomWindow.bouton('Ajouter l’option')
		expect(await enableKeyboard(button)).toBe(true)
		expect(options()).toHaveLength(1)
		// The fields are empty again: the repeats do nothing, and would not add a second option anyway.
		await jsdomWindow.saisir(additionField('name'), 'Cils')
		expect(await enableKeyboard(button, { repeat: true })).toBe(false)
		expect(options()).toHaveLength(1)
	})

	test('L7 : Entrée maintenue dans un champ de l’ajout ajoute une seule option, et ne valide pas la prestation', async () => {
		await open(testCase, [bride([])])
		await updateServiceOffer()
		await jsdomWindow.saisir(additionField('name'), 'Essai')
		const send = async (repeat: boolean) =>
			act(async () => {
				additionField('name').dispatchEvent(
					new jsdomWindow.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, repeat })
				)
			})
		await send(false)
		expect(options()).toHaveLength(1)
		await jsdomWindow.saisir(additionField('name'), 'Cils')
		await send(true)
		expect(options()).toHaveLength(1)
		expect(jsdomWindow.bouton('Valider la modification')).toBeTruthy()
	})

	test('L7 : Entrée maintenue sur « Retirer » d’une option ne retire qu’une option', async () => {
		await open(testCase, two())
		await updateServiceOffer()
		await enableKeyboard(optionsRemovals()[0] as HTMLElement)
		expect(options()).toHaveLength(1)
		expect(await enableKeyboard(optionsRemovals()[0] as HTMLElement, { repeat: true })).toBe(false)
		expect(options()).toHaveLength(1)
	})

	test('L4 : au clavier, le focus reste dans le panneau : l’option qui prend la place, puis celle du dessus, puis le formulaire d’ajout', async () => {
		const three = [
			bride([
				{ id: 'a', valeurs: TEST },
				{ id: 'b', valeurs: LASHES },
				{ id: 'c', valeurs: { name: 'Retouches', description: '', price: '' } },
			]),
		]
		await open(testCase, three)
		await updateServiceOffer()
		await enableKeyboard(optionsRemovals()[0] as HTMLElement)
		expect(active()).toBe(optionsRemovals()[0] as HTMLElement)
		await enableKeyboard(optionsRemovals()[1] as HTMLElement)
		expect(active()).toBe(optionsRemovals()[0] as HTMLElement)
		await enableKeyboard(optionsRemovals()[0] as HTMLElement)
		expect(options()).toHaveLength(0)
		expect(active()).toBe(additionField('name'))
		expect(dialogue().contains(active())).toBe(true)
	})

	test('L4 : après un clic, le focus ne va jamais sur un champ : l’option suivante, ou le titre des options', async () => {
		await open(testCase, two())
		await updateServiceOffer()
		await jsdomWindow.cliquer(optionsRemovals()[0] as HTMLElement)
		expect(active()).toBe(optionsRemovals()[0] as HTMLElement)
		await jsdomWindow.cliquer(optionsRemovals()[0] as HTMLElement)
		expect(options()).toHaveLength(0)
		expect(active()?.hasAttribute('data-titre-options')).toBe(true)
		expect(dialogue().contains(active())).toBe(true)
	})

	test('L5 : chaque retrait d’option est dit, même nom deux fois', async () => {
		await open(testCase, [
			bride([
				{ id: 'a', valeurs: TEST },
				{ id: 'b', valeurs: TEST },
			]),
		])
		await updateServiceOffer()
		expect(announcementZone().textContent).toBe('')
		await jsdomWindow.cliquer(optionsRemovals()[0] as HTMLElement)
		const firstOne = announcementZone().querySelector('span')
		expect(announcementZone().textContent).toBe('Option Essai retirée')
		await jsdomWindow.cliquer(optionsRemovals()[0] as HTMLElement)
		expect(announcementZone().textContent).toBe('Option Essai retirée')
		expect(announcementZone().querySelector('span')).not.toBe(firstOne)
	})

	test('une option sans nom n’est pas ajoutée, et une option laissée en cours de saisie n’est pas perdue en silence', async () => {
		await open(testCase, [bride([])])
		await updateServiceOffer()
		await addOption({ price: '30' })
		expect(options()).toHaveLength(0)
		expect(dialogue().querySelector('#options-name-erreur')?.textContent).toBe('Le nom de l’option est requis.')

		await jsdomWindow.saisir(additionField('name'), 'Essai')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))
		expect(alert()).toContain('option en cours de saisie')
		expect(jsdomWindow.bouton('Valider la modification')).toBeTruthy()
	})

	test('une option dont on a vidé le nom est signalée sous son champ, et la prestation n’est pas validée', async () => {
		await open(testCase, two())
		await updateServiceOffer()
		await jsdomWindow.saisir(optionField(0, 'name'), '')
		expect(options()[0]?.textContent).toContain('Le nom de l’option est requis.')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))
		expect(jsdomWindow.bouton('Valider la modification')).toBeTruthy()
		expect(active()).toBe(optionField(0, 'name'))
	})

	test('le prix d’une option dit le montant retenu comme celui d’une prestation', async () => {
		await open(testCase, [bride([])])
		await updateServiceOffer()
		await jsdomWindow.saisir(additionField('price'), '30 €')
		expect(dialogue().textContent).toMatch(/Montant retenu pour ton profil : 30\s€\./)
	})

	test('E31 : un échec garde les options saisies et le panneau ouvert', async () => {
		const { envoyer: send } = fakeUpload({ ok: false, message: FAILURE_MESSAGE })
		await open(testCase, [bride([])], send)
		await updateServiceOffer()
		await addOption(TEST)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Valider la modification'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
		await jsdomWindow.attendre(() => dialogue().querySelector('[role="alert"] p'))
		expect(shownLines()[0]?.textContent).toContain('1 option')
	})
})
