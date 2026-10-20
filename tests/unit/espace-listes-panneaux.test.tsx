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

const fenetre = openWindow()

interface Cas {
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

const CAS: readonly Cas[] = [
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
	const d = fenetre.w.document.querySelector<HTMLElement>('[role="dialog"]')
	if (!d) throw new Error('pas de panneau ouvert')
	return d
}
const actif = (): Element | null => fenetre.w.document.activeElement
const lignesAffichees = (): HTMLElement[] => [...dialogue().querySelectorAll<HTMLElement>('li[data-ligne]')]
const zoneDAnnonce = (): HTMLElement => {
	const zone = dialogue().querySelector<HTMLElement>('[role="status"]')
	if (!zone) throw new Error('pas de zone d’annonce')
	return zone
}

/** The labels of the fields, from the id the editor gives them: `<section>-<champ>`. */
const identifiantDe = (cas: Cas, champ: string): string =>
	`${cas.name === 'expériences' ? 'experiences' : cas.name}-${champ}`
const champParNom = (cas: Cas, champ: string): HTMLInputElement | HTMLTextAreaElement => {
	const element = dialogue().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${identifiantDe(cas, champ)}`)
	if (!element) throw new Error(`pas de champ ${champ}`)
	return element
}

/** A section with options always sends them, empty when the row has none (ticket 132). */
const sansOptions = (cas: Cas): { options?: [] } => (cas.name === 'serviceOffers' ? { options: [] } : {})

async function remplir(cas: Cas, valeurs: Record<string, string>) {
	for (const [champ, valeur] of Object.entries(valeurs)) await fenetre.saisir(champParNom(cas, champ), valeur)
}

async function ajouter(cas: Cas, valeurs: Record<string, string>) {
	await remplir(cas, valeurs)
	await fenetre.cliquer(fenetre.bouton('Ajouter'))
}

/** An activation by the keyboard: Enter goes down, then the button is clicked, with no mouse button before. */
async function activerAuClavier(bouton: HTMLElement, options: { repeat?: boolean } = {}): Promise<boolean> {
	let evenement: Event | undefined
	await act(async () => {
		bouton.focus()
		evenement = new fenetre.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options })
		bouton.dispatchEvent(evenement)
	})
	// jsdom never turns a keydown into a click: it is sent unless the keydown was cancelled, as a browser does.
	if (evenement?.defaultPrevented) return false
	await act(async () => {
		bouton.dispatchEvent(new fenetre.w.MouseEvent('click', { bubbles: true, cancelable: true }))
	})
	return true
}

function fauxEnvoi(reponse?: Awaited<ReturnType<ListUpload>>) {
	const appels: SentList[] = []
	const envoyer: ListUpload = async liste => {
		appels.push(liste)
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
	return { appels, envoyer }
}

/** Two rows that say the same thing, as the server gave them each its own identifier. */
const identiques = (cas: Cas): SavedRow[] => [
	{ id: 'aaa', valeurs: cas.ligne },
	{ id: 'bbb', valeurs: cas.ligne },
]

async function ouvrir(cas: Cas, lignes: readonly SavedRow[], envoyer: ListUpload = fauxEnvoi().envoyer) {
	await fenetre.monter(cas.monter(lignes, envoyer))
	await fenetre.cliquer(fenetre.bouton(cas.ouvrir))
}

for (const cas of CAS) {
	describe(`${cas.name} : le panneau`, () => {
		test('il s’ouvre avec les lignes enregistrées, dans un dialogue nommé', async () => {
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }])
			expect(dialogue().getAttribute('aria-modal')).toBe('true')
			expect(lignesAffichees()).toHaveLength(1)
			expect(lignesAffichees()[0]?.textContent).toContain(Object.values(cas.ligne)[0] as string)
		})

		test('L1 : deux lignes identiques se retirent et se modifient séparément', async () => {
			const { appels, envoyer } = fauxEnvoi()
			await ouvrir(cas, identiques(cas), envoyer)

			// Changing the second leaves the first as it was.
			await fenetre.cliquer(fenetre.bouton(/^Modifier /, lignesAffichees()[1]))
			await remplir(cas, { [Object.keys(cas.autre)[0] as string]: Object.values(cas.autre)[0] as string })
			await fenetre.cliquer(fenetre.bouton('Valider la modification'))
			expect(lignesAffichees()).toHaveLength(2)
			expect(lignesAffichees()[0]?.textContent).toContain(Object.values(cas.ligne)[0] as string)
			expect(lignesAffichees()[1]?.textContent).toContain(Object.values(cas.autre)[0] as string)

			// Removing the first leaves the second, with its own identifier.
			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(lignesAffichees()).toHaveLength(1)
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			await fenetre.attendre(() => appels.length === 1)
			expect(appels[0]?.lignes).toEqual([{ id: 'bbb', valeurs: { ...cas.autre }, ...sansOptions(cas) }])
		})

		test('L2 : la frappe garde le focus, vingt caractères dans chaque champ, juste après un ajout', async () => {
			await ouvrir(cas, [])
			await ajouter(cas, cas.ligne)
			for (const champ of Object.keys(cas.ligne)) {
				const element = champParNom(cas, champ)
				if (element.type === 'date') continue
				element.focus()
				let saisi = ''
				for (let n = 0; n < 20; n++) {
					saisi += 'a'
					await fenetre.saisir(element, saisi)
					expect(actif()).toBe(element)
					expect(champParNom(cas, champ)).toBe(element)
				}
				expect(element.value).toBe('a'.repeat(20))
			}
		})

		test('L3 : retirer la ligne en cours remet le formulaire en « Ajouter » sans perdre la saisie', async () => {
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }])
			await fenetre.cliquer(fenetre.bouton(/^Modifier /, lignesAffichees()[0]))
			expect(fenetre.bouton('Valider la modification')).toBeTruthy()
			const champ = Object.keys(cas.ligne)[0] as string
			await fenetre.saisir(champParNom(cas, champ), 'Saisie en cours')

			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))

			expect(lignesAffichees()).toHaveLength(0)
			expect(fenetre.bouton('Ajouter')).toBeTruthy()
			expect(champParNom(cas, champ).value).toBe('Saisie en cours')
		})

		test('L3 : retirer la ligne chargée et laissée telle quelle vide le formulaire', async () => {
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }])
			await fenetre.cliquer(fenetre.bouton(/^Modifier /, lignesAffichees()[0]))
			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(fenetre.bouton('Ajouter')).toBeTruthy()
			expect(champParNom(cas, Object.keys(cas.ligne)[0] as string).value).toBe('')
		})

		test('L4 : au clavier, le focus reste dans le panneau, sur la ligne qui prend la place puis sur celle du dessus', async () => {
			const trois: SavedRow[] = [
				{ id: 'a', valeurs: cas.ligne },
				{ id: 'b', valeurs: cas.autre },
				{ id: 'c', valeurs: { ...cas.autre, [Object.keys(cas.autre)[0] as string]: 'Troisième' } },
			]
			await ouvrir(cas, trois)

			// The first row leaves: the second takes its place.
			await activerAuClavier(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(actif()).toBe(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(dialogue().contains(actif())).toBe(true)
			// The last row leaves: the one above takes the focus.
			await activerAuClavier(fenetre.bouton(/^Retirer /, lignesAffichees()[1]))
			expect(lignesAffichees()).toHaveLength(1)
			expect(actif()).toBe(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
		})

		test('L4 : la seule ligne retirée au clavier envoie le focus au formulaire d’ajout', async () => {
			await ouvrir(cas, [{ id: 'a', valeurs: cas.ligne }])
			await activerAuClavier(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(lignesAffichees()).toHaveLength(0)
			expect(actif()).toBe(champParNom(cas, Object.keys(cas.ligne)[0] as string))
		})

		test('L4 : après un clic, le focus ne va jamais sur un champ : la ligne suivante, ou le titre du panneau', async () => {
			await ouvrir(cas, identiques(cas))
			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(actif()).toBe(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))

			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(lignesAffichees()).toHaveLength(0)
			expect(actif()?.tagName).toBe('H2')
			expect(dialogue().contains(actif())).toBe(true)
		})

		test('L5 : la zone d’annonce est là et vide à l’ouverture, chaque retrait y est dit, même nom deux fois', async () => {
			await ouvrir(cas, identiques(cas))
			expect(zoneDAnnonce().textContent).toBe('')

			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(zoneDAnnonce().textContent).toBe(cas.retrait)
			const premiere = zoneDAnnonce().firstElementChild

			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			expect(zoneDAnnonce().textContent).toBe(cas.retrait)
			// Said again: a new node, which a screen reader reads again.
			expect(zoneDAnnonce().firstElementChild).not.toBe(premiere)
		})

		test('L6 : une ligne identique à une ligne de la liste est refusée, avec son message', async () => {
			await ouvrir(cas, [])
			await ajouter(cas, cas.ligne)
			expect(lignesAffichees()).toHaveLength(1)

			await ajouter(cas, cas.ligne)
			expect(lignesAffichees()).toHaveLength(1)
			expect(dialogue().querySelector('[role="alert"]:not(:empty)')?.textContent).toBe(cas.doublon)

			// The message goes when she changes the form.
			await fenetre.saisir(champParNom(cas, Object.keys(cas.ligne)[0] as string), 'Autre')
			expect(dialogue().textContent).not.toContain(cas.doublon)
		})

		test('L6 : une ligne ouverte par « Modifier » et validée sans changement est acceptée', async () => {
			await ouvrir(cas, identiques(cas))
			await fenetre.cliquer(fenetre.bouton(/^Modifier /, lignesAffichees()[0]))
			await fenetre.cliquer(fenetre.bouton('Valider la modification'))

			expect(dialogue().textContent).not.toContain(cas.doublon)
			expect(lignesAffichees()).toHaveLength(2)
			expect(fenetre.bouton('Ajouter')).toBeTruthy()
		})

		test('L7 : Entrée maintenue sur un bouton n’agit qu’une fois, sur « Retirer », « Ajouter » et « Enregistrer »', async () => {
			const { appels, envoyer } = fauxEnvoi()
			await ouvrir(cas, identiques(cas), envoyer)

			// Held down, the keydown repeats: it is cancelled, and no click follows.
			const retirer = fenetre.bouton(/^Retirer /, lignesAffichees()[0])
			expect(await activerAuClavier(retirer, { repeat: true })).toBe(false)
			expect(await activerAuClavier(retirer, { repeat: true })).toBe(false)
			expect(lignesAffichees()).toHaveLength(2)
			// The first press acts once.
			expect(await activerAuClavier(retirer, { repeat: false })).toBe(true)
			expect(lignesAffichees()).toHaveLength(1)

			await remplir(cas, cas.autre)
			expect(await activerAuClavier(fenetre.bouton('Ajouter'), { repeat: true })).toBe(false)
			expect(lignesAffichees()).toHaveLength(1)
			expect(await activerAuClavier(fenetre.bouton('Ajouter'), { repeat: false })).toBe(true)
			expect(lignesAffichees()).toHaveLength(2)

			const enregistrer = fenetre.bouton('Enregistrer')
			expect(await activerAuClavier(enregistrer, { repeat: true })).toBe(false)
			expect(appels).toHaveLength(0)
			await activerAuClavier(enregistrer, { repeat: false })
			await fenetre.attendre(() => appels.length === 1)
			expect(appels).toHaveLength(1)
		})

		test('L7 : dans un texte long, Entrée maintenue garde son effet', async () => {
			await ouvrir(cas, [])
			const long = champParNom(cas, 'description')
			let evenement: Event | undefined
			await act(async () => {
				long.focus()
				evenement = new fenetre.w.KeyboardEvent('keydown', {
					key: 'Enter',
					repeat: true,
					bubbles: true,
					cancelable: true,
				})
				long.dispatchEvent(evenement)
			})
			expect(evenement?.defaultPrevented).toBe(false)
		})

		test('une ligne sans ses champs obligatoires n’est pas ajoutée : le message est sous chaque champ', async () => {
			await ouvrir(cas, [])
			await fenetre.cliquer(fenetre.bouton('Ajouter'))
			expect(lignesAffichees()).toHaveLength(0)
			for (const [identifiant, message] of Object.entries(cas.vide)) {
				expect(fenetre.w.document.getElementById(identifiant)?.textContent).toBe(message)
			}
		})

		test('E31 : « Enregistrer » envoie la liste entière, avec les identifiants, puis le panneau se ferme et le dit', async () => {
			const { appels, envoyer } = fauxEnvoi()
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }], envoyer)
			await ajouter(cas, cas.autre)
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			await fenetre.attendre(() => fenetre.w.document.querySelector('[role="dialog"]') === null)

			expect(appels).toEqual([
				{
					lignes: [
						{ id: 'aaa', valeurs: { ...cas.ligne }, ...sansOptions(cas) },
						{ valeurs: { ...cas.autre }, ...sansOptions(cas) },
					],
				},
			])
			expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe(cas.enregistre)
		})

		test('E31 : un échec garde la liste et la saisie, dit pourquoi, et le panneau reste ouvert', async () => {
			const { envoyer } = fauxEnvoi({ ok: false, message: FAILURE_MESSAGE })
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }], envoyer)
			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))

			const alerte = await fenetre.attendre(() => dialogue().querySelector('[role="alert"] p'))
			expect(alerte.textContent).toBe(FAILURE_MESSAGE)
			expect(lignesAffichees()).toHaveLength(0)
			expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe('')
		})

		test('E31 : une fonction d’envoi qui lève donne le message du site', async () => {
			const lever: ListUpload = async () => {
				throw new Error('Failed to fetch')
			}
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }], lever)
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			const alerte = await fenetre.attendre(() => dialogue().querySelector('[role="alert"] p'))
			expect(alerte.textContent).toBe(FAILURE_MESSAGE)
		})

		test('E31 : fermer avec des changements non enregistrés demande confirmation, puis rend les valeurs d’origine', async () => {
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }])
			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			await fenetre.cliquer(fenetre.bouton('Fermer'))
			await fenetre.cliquer(fenetre.bouton('Abandonner mes modifications'))
			expect(fenetre.w.document.querySelector('[role="dialog"]')).toBeNull()

			await fenetre.cliquer(fenetre.bouton(cas.ouvrir))
			expect(lignesAffichees()).toHaveLength(1)
		})

		test('une ligne en cours de saisie n’est pas perdue en silence : « Enregistrer » le dit et n’envoie rien', async () => {
			const { appels, envoyer } = fauxEnvoi()
			await ouvrir(cas, [], envoyer)
			await remplir(cas, { [Object.keys(cas.ligne)[0] as string]: 'Pas encore ajoutée' })
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			expect(dialogue().querySelector('[role="alert"] p')?.textContent).toContain('ligne en cours de saisie')
			expect(appels).toHaveLength(0)
		})

		test('deux clics sur « Enregistrer » avant la réponse : un seul envoi', async () => {
			let repondre: (() => void) | undefined
			const appels: SentList[] = []
			const envoyer: ListUpload = liste => {
				appels.push(liste)
				return new Promise(resolve => {
					repondre = () => resolve({ ok: true, valeurs: { lignes: [] } })
				})
			}
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }], envoyer)
			const bouton = fenetre.bouton('Enregistrer')
			await fenetre.cliquer(bouton)
			await fenetre.cliquer(bouton)
			expect(appels).toHaveLength(1)
			await act(async () => repondre?.())
			await fenetre.attendre(() => fenetre.w.document.querySelector('[role="dialog"]') === null)
			expect(appels).toHaveLength(1)
		})
	})
}

describe('129, U30 : la fin d’une expérience ne précède pas son début', () => {
	const cas = CAS[0] as Cas
	test('une fin avant le début est refusée sous le champ « Fin », rien n’est ajouté', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { ...cas.ligne, startDate: '2022-05-01', endDate: '2021-01-01' })
		expect(lignesAffichees()).toHaveLength(0)
		expect(fenetre.w.document.getElementById('experiences-endDate-erreur')?.textContent).toBe(
			'La fin d’une expérience ne peut pas précéder son début.'
		)
		expect(champParNom(cas, 'endDate').getAttribute('aria-invalid')).toBe('true')
	})

	test('une fin le jour du début est acceptée, et une expérience en cours n’a pas de fin', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { ...cas.ligne, startDate: '2022-05-01', endDate: '2022-05-01' })
		await ajouter(cas, { ...cas.autre, startDate: '2023-01-01', endDate: '' })
		expect(lignesAffichees()).toHaveLength(2)
		expect(lignesAffichees()[1]?.textContent).toContain('aujourd’hui')
	})
})

describe('130, U30 : une date d’obtention à plus d’un an dans le futur est refusée', () => {
	const cas = CAS[1] as Cas
	test('le refus est sous le champ, la ligne n’est pas ajoutée', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { ...cas.ligne, graduatedAt: '2099-01-01' })
		expect(lignesAffichees()).toHaveLength(0)
		expect(fenetre.w.document.getElementById('courses-graduatedAt-erreur')?.textContent).toBe(
			'Une date d’obtention ne peut pas dépasser d’un an la date du jour.'
		)
	})

	test('une date passée, ou sans date, est acceptée', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, cas.ligne)
		await ajouter(cas, { ...cas.autre, graduatedAt: '' })
		expect(lignesAffichees()).toHaveLength(2)
	})
})

describe('131, U29 : le prix, sous le champ, dit le montant retenu', () => {
	const cas = CAS[2] as Cas
	const indice = (): string => fenetre.w.document.getElementById('serviceOffers-price-indice')?.textContent ?? ''

	for (const saisie of ['80', '80 €', 'à partir de 80']) {
		test(`« ${saisie} » donne un montant de 80 €`, async () => {
			await ouvrir(cas, [])
			await fenetre.saisir(champParNom(cas, 'price'), saisie)
			expect(indice()).toBe('Montant retenu pour ton profil : 80 €.')
		})
	}

	test('« sur devis » est gardé tel quel, sans montant, et le dit', async () => {
		await ouvrir(cas, [])
		await fenetre.saisir(champParNom(cas, 'price'), 'sur devis')
		expect(indice()).toContain('Aucun montant retenu')
		await ajouter(cas, { name: 'Maquillage de mariée', price: 'sur devis' })
		expect(lignesAffichees()[0]?.querySelector('span')?.textContent).toBe('Maquillage de mariée - Sur devis')
	})

	test('plusieurs formules se séparent par un point-virgule', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { name: 'Cours', price: '60 € ; sur devis' })
		expect(lignesAffichees()[0]?.textContent).toContain('60')
		expect(lignesAffichees()[0]?.textContent).toContain('Sur devis')
	})

	test('un nom est requis, et un prix de plus de 70 caractères est refusé', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { price: '80' })
		expect(fenetre.w.document.getElementById('serviceOffers-name-erreur')?.textContent).toBe(
			'Le nom de la prestation est requis.'
		)
		await ajouter(cas, { name: 'Cours', price: 'a'.repeat(71) })
		expect(fenetre.w.document.getElementById('serviceOffers-price-erreur')?.textContent).toBe(
			'Ce texte ne doit pas dépasser 70 caractères.'
		)
		expect(lignesAffichees()).toHaveLength(0)
	})
})

describe('132 : les options d’une prestation', () => {
	const cas = CAS[2] as Cas
	const ESSAI = { name: 'Essai', description: '', price: '30' }
	const CILS = { name: 'Cils', description: 'Pose de cils', price: 'sur devis' }
	const mariee = (options: SavedRow[]): SavedRow => ({
		id: 'p1',
		valeurs: { name: 'Maquillage de mariée', description: '', price: 'à partir de 80 €' },
		options,
	})
	const deux = (): SavedRow[] => [
		mariee([
			{ id: 'o1', valeurs: ESSAI },
			{ id: 'o2', valeurs: CILS },
		]),
	]

	const options = (): HTMLElement[] => [...dialogue().querySelectorAll<HTMLElement>('li[data-option]')]
	const champDOption = (rang: number, nom: string): HTMLInputElement | HTMLTextAreaElement => {
		const element = options()[rang]?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${nom}"]`)
		if (!element) throw new Error(`pas de champ ${nom} à l’option ${rang}`)
		return element
	}
	const champDAjout = (nom: string): HTMLInputElement | HTMLTextAreaElement => {
		const element = dialogue().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#options-${nom}`)
		if (!element) throw new Error(`pas de champ d’ajout ${nom}`)
		return element
	}
	const retraitsDOptions = (): HTMLElement[] => [...dialogue().querySelectorAll<HTMLElement>('[data-retirer-option]')]
	const ajouterUneOption = async (valeurs: Record<string, string>) => {
		for (const [nom, valeur] of Object.entries(valeurs)) await fenetre.saisir(champDAjout(nom), valeur)
		await fenetre.cliquer(fenetre.bouton('Ajouter l’option'))
	}
	const modifierLaPrestation = async (rang = 0) =>
		fenetre.cliquer(fenetre.bouton(/^Modifier /, lignesAffichees()[rang]))
	const alerte = (): string => dialogue().querySelector('#options-doublon')?.textContent ?? ''

	async function taperVingtCaracteres(element: HTMLInputElement | HTMLTextAreaElement, retrouver: () => Element) {
		element.focus()
		let saisi = ''
		for (let n = 0; n < 20; n++) {
			saisi += 'a'
			await fenetre.saisir(element, saisi)
			expect(actif()).toBe(element)
			expect(retrouver()).toBe(element)
		}
		expect(element.value).toBe('a'.repeat(20))
	}

	test('la prestation ouverte montre ses options, dans l’ordre, chacune avec ses trois champs', async () => {
		await ouvrir(cas, deux())
		expect(lignesAffichees()[0]?.textContent).toContain('2 options')
		await modifierLaPrestation()
		expect(options()).toHaveLength(2)
		expect(champDOption(0, 'name').value).toBe('Essai')
		expect(champDOption(1, 'name').value).toBe('Cils')
		expect(champDOption(1, 'description').value).toBe('Pose de cils')
		expect(champDOption(1, 'price').value).toBe('sur devis')
	})

	test('L2 : juste après un enregistrement, vingt caractères d’affilée dans chaque champ de chaque option, focus fixe', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(cas, deux(), envoyer)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => fenetre.w.document.querySelector('[role="dialog"]') === null)
		expect(appels).toHaveLength(1)

		// Reopened on what the server gave back, as after a save.
		await fenetre.cliquer(fenetre.bouton(cas.ouvrir))
		await modifierLaPrestation()
		for (const rang of [0, 1]) {
			for (const nom of ['name', 'description', 'price']) {
				await taperVingtCaracteres(champDOption(rang, nom), () => champDOption(rang, nom))
			}
		}
	}, 60_000)

	test('L2 : une option qui vient d’être ajoutée se tape aussi sans perdre le focus', async () => {
		await ouvrir(cas, [mariee([])])
		await modifierLaPrestation()
		await ajouterUneOption(ESSAI)
		for (const nom of ['name', 'description', 'price']) {
			await taperVingtCaracteres(champDOption(0, nom), () => champDOption(0, nom))
		}
		// And the small form that adds one.
		await taperVingtCaracteres(champDAjout('name'), () => champDAjout('name'))
	}, 60_000)

	test('L1 : deux options identiques se retirent séparément, chacune garde son identifiant', async () => {
		const { appels, envoyer } = fauxEnvoi()
		await ouvrir(
			cas,
			[
				mariee([
					{ id: 'o1', valeurs: ESSAI },
					{ id: 'o2', valeurs: ESSAI },
				]),
			],
			envoyer
		)
		await modifierLaPrestation()
		await fenetre.cliquer(retraitsDOptions()[0] as HTMLElement)
		expect(options()).toHaveLength(1)
		await fenetre.cliquer(fenetre.bouton('Valider la modification'))
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => appels.length === 1)
		expect(appels[0]?.lignes[0]?.options).toEqual([{ id: 'o2', valeurs: ESSAI }])
	})

	test('une option ajoutée part sans identifiant, les autres gardent le leur, dans l’ordre, sous la bonne prestation', async () => {
		const { appels, envoyer } = fauxEnvoi()
		const autre: SavedRow = {
			id: 'p2',
			valeurs: { name: 'Maquillage de soirée', description: '', price: '60' },
			options: [{ id: 'o9', valeurs: { name: 'Retouches', description: '', price: '' } }],
		}
		await ouvrir(cas, [mariee([{ id: 'o1', valeurs: ESSAI }]), autre], envoyer)
		await modifierLaPrestation(1)
		await ajouterUneOption(CILS)
		await fenetre.cliquer(fenetre.bouton('Valider la modification'))
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => appels.length === 1)
		expect(appels[0]?.lignes.map(ligne => [ligne.id, ligne.options])).toEqual([
			['p1', [{ id: 'o1', valeurs: ESSAI }]],
			['p2', [{ id: 'o9', valeurs: { name: 'Retouches', description: '', price: '' } }, { valeurs: CILS }]],
		])
	})

	test('L6 : une option identique à une option de la liste est refusée, avec son message', async () => {
		await ouvrir(cas, [mariee([{ id: 'o1', valeurs: ESSAI }])])
		await modifierLaPrestation()
		await ajouterUneOption(ESSAI)
		expect(options()).toHaveLength(1)
		expect(alerte()).toBe('Une option identique est déjà dans la liste.')
		// Typing again takes the message away.
		await fenetre.saisir(champDAjout('name'), 'Essai 2')
		expect(alerte()).toBe('')
	})

	test('L6 : deux options rendues identiques par la saisie refusent la prestation, qui n’est pas validée', async () => {
		await ouvrir(cas, deux())
		await modifierLaPrestation()
		await fenetre.saisir(champDOption(1, 'name'), 'Essai')
		await fenetre.saisir(champDOption(1, 'description'), '')
		await fenetre.saisir(champDOption(1, 'price'), '30')
		await fenetre.cliquer(fenetre.bouton('Valider la modification'))
		expect(alerte()).toBe('Une option identique est déjà dans la liste.')
		expect(fenetre.bouton('Valider la modification')).toBeTruthy()
	})

	test('L7 : Entrée maintenue sur « Ajouter l’option » ajoute une seule option', async () => {
		await ouvrir(cas, [mariee([])])
		await modifierLaPrestation()
		await fenetre.saisir(champDAjout('name'), 'Essai')
		const bouton = fenetre.bouton('Ajouter l’option')
		expect(await activerAuClavier(bouton)).toBe(true)
		expect(options()).toHaveLength(1)
		// The fields are empty again: the repeats do nothing, and would not add a second option anyway.
		await fenetre.saisir(champDAjout('name'), 'Cils')
		expect(await activerAuClavier(bouton, { repeat: true })).toBe(false)
		expect(options()).toHaveLength(1)
	})

	test('L7 : Entrée maintenue dans un champ de l’ajout ajoute une seule option, et ne valide pas la prestation', async () => {
		await ouvrir(cas, [mariee([])])
		await modifierLaPrestation()
		await fenetre.saisir(champDAjout('name'), 'Essai')
		const envoyer = async (repeat: boolean) =>
			act(async () => {
				champDAjout('name').dispatchEvent(
					new fenetre.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, repeat })
				)
			})
		await envoyer(false)
		expect(options()).toHaveLength(1)
		await fenetre.saisir(champDAjout('name'), 'Cils')
		await envoyer(true)
		expect(options()).toHaveLength(1)
		expect(fenetre.bouton('Valider la modification')).toBeTruthy()
	})

	test('L7 : Entrée maintenue sur « Retirer » d’une option ne retire qu’une option', async () => {
		await ouvrir(cas, deux())
		await modifierLaPrestation()
		await activerAuClavier(retraitsDOptions()[0] as HTMLElement)
		expect(options()).toHaveLength(1)
		expect(await activerAuClavier(retraitsDOptions()[0] as HTMLElement, { repeat: true })).toBe(false)
		expect(options()).toHaveLength(1)
	})

	test('L4 : au clavier, le focus reste dans le panneau : l’option qui prend la place, puis celle du dessus, puis le formulaire d’ajout', async () => {
		const trois = [
			mariee([
				{ id: 'a', valeurs: ESSAI },
				{ id: 'b', valeurs: CILS },
				{ id: 'c', valeurs: { name: 'Retouches', description: '', price: '' } },
			]),
		]
		await ouvrir(cas, trois)
		await modifierLaPrestation()
		await activerAuClavier(retraitsDOptions()[0] as HTMLElement)
		expect(actif()).toBe(retraitsDOptions()[0] as HTMLElement)
		await activerAuClavier(retraitsDOptions()[1] as HTMLElement)
		expect(actif()).toBe(retraitsDOptions()[0] as HTMLElement)
		await activerAuClavier(retraitsDOptions()[0] as HTMLElement)
		expect(options()).toHaveLength(0)
		expect(actif()).toBe(champDAjout('name'))
		expect(dialogue().contains(actif())).toBe(true)
	})

	test('L4 : après un clic, le focus ne va jamais sur un champ : l’option suivante, ou le titre des options', async () => {
		await ouvrir(cas, deux())
		await modifierLaPrestation()
		await fenetre.cliquer(retraitsDOptions()[0] as HTMLElement)
		expect(actif()).toBe(retraitsDOptions()[0] as HTMLElement)
		await fenetre.cliquer(retraitsDOptions()[0] as HTMLElement)
		expect(options()).toHaveLength(0)
		expect(actif()?.hasAttribute('data-titre-options')).toBe(true)
		expect(dialogue().contains(actif())).toBe(true)
	})

	test('L5 : chaque retrait d’option est dit, même nom deux fois', async () => {
		await ouvrir(cas, [
			mariee([
				{ id: 'a', valeurs: ESSAI },
				{ id: 'b', valeurs: ESSAI },
			]),
		])
		await modifierLaPrestation()
		expect(zoneDAnnonce().textContent).toBe('')
		await fenetre.cliquer(retraitsDOptions()[0] as HTMLElement)
		const premiere = zoneDAnnonce().querySelector('span')
		expect(zoneDAnnonce().textContent).toBe('Option Essai retirée')
		await fenetre.cliquer(retraitsDOptions()[0] as HTMLElement)
		expect(zoneDAnnonce().textContent).toBe('Option Essai retirée')
		expect(zoneDAnnonce().querySelector('span')).not.toBe(premiere)
	})

	test('une option sans nom n’est pas ajoutée, et une option laissée en cours de saisie n’est pas perdue en silence', async () => {
		await ouvrir(cas, [mariee([])])
		await modifierLaPrestation()
		await ajouterUneOption({ price: '30' })
		expect(options()).toHaveLength(0)
		expect(dialogue().querySelector('#options-name-erreur')?.textContent).toBe('Le nom de l’option est requis.')

		await fenetre.saisir(champDAjout('name'), 'Essai')
		await fenetre.cliquer(fenetre.bouton('Valider la modification'))
		expect(alerte()).toContain('option en cours de saisie')
		expect(fenetre.bouton('Valider la modification')).toBeTruthy()
	})

	test('une option dont on a vidé le nom est signalée sous son champ, et la prestation n’est pas validée', async () => {
		await ouvrir(cas, deux())
		await modifierLaPrestation()
		await fenetre.saisir(champDOption(0, 'name'), '')
		expect(options()[0]?.textContent).toContain('Le nom de l’option est requis.')
		await fenetre.cliquer(fenetre.bouton('Valider la modification'))
		expect(fenetre.bouton('Valider la modification')).toBeTruthy()
		expect(actif()).toBe(champDOption(0, 'name'))
	})

	test('le prix d’une option dit le montant retenu comme celui d’une prestation', async () => {
		await ouvrir(cas, [mariee([])])
		await modifierLaPrestation()
		await fenetre.saisir(champDAjout('price'), '30 €')
		expect(dialogue().textContent).toMatch(/Montant retenu pour ton profil : 30\s€\./)
	})

	test('E31 : un échec garde les options saisies et le panneau ouvert', async () => {
		const { envoyer } = fauxEnvoi({ ok: false, message: FAILURE_MESSAGE })
		await ouvrir(cas, [mariee([])], envoyer)
		await modifierLaPrestation()
		await ajouterUneOption(ESSAI)
		await fenetre.cliquer(fenetre.bouton('Valider la modification'))
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue().querySelector('[role="alert"] p'))
		expect(lignesAffichees()[0]?.textContent).toContain('1 option')
	})
})
