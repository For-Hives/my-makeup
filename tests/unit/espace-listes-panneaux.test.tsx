import { describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { act } from 'react'
import type { EnvoiDeLaListe } from '@/components/espace/EditeurDeListe'
import { EditeurDExperiences, EditeurDeFormations, EditeurDePrestations } from '@/components/espace/EditeursDeListes'
import type { LigneEnregistree, ListeEnvoyee } from '@/lib/espace/liste'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The panels of the experiences, the courses and the offers (tickets 129 to 131; docs/qualite.md §3,
 * rules L1 to L7; plan 02 U29, U30, E31). The three share one editor: every rule is played on each
 * section. The send functions are fakes: no network.
 */

const fenetre = ouvrirFenetre()

interface Cas {
	readonly nom: string
	readonly ouvrir: string
	readonly monter: (lignes: readonly LigneEnregistree[], envoyer: EnvoiDeLaListe) => ReactElement
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
		nom: 'expériences',
		ouvrir: 'Modifier mes expériences',
		monter: (lignes, envoyer) => <EditeurDExperiences lignes={lignes} envoyer={envoyer} />,
		ligne: {
			poste: 'Maquilleuse',
			entreprise: 'Studio Fictif',
			ville: 'Lyon',
			debut: '2020-03-01',
			fin: '',
			description: '',
		},
		autre: {
			poste: 'Cheffe maquilleuse',
			entreprise: 'Studio Fictif',
			ville: 'Lyon',
			debut: '2020-03-01',
			fin: '',
			description: '',
		},
		champTexte: 'Poste',
		champLong: 'Description',
		doublon: 'Une expérience identique est déjà dans la liste.',
		retrait: 'Expérience Studio Fictif retirée',
		enregistre: 'Tes expériences sont enregistrées.',
		designation: 'l’expérience',
		vide: {
			'experiences-entreprise-erreur': 'Le nom de l’entreprise est requis.',
			'experiences-poste-erreur': 'Le nom du poste est requis.',
			'experiences-debut-erreur': 'La date de début de l’expérience est requise.',
		},
	},
	{
		nom: 'formations',
		ouvrir: 'Modifier mes formations',
		monter: (lignes, envoyer) => <EditeurDeFormations lignes={lignes} envoyer={envoyer} />,
		ligne: { diplome: 'CAP esthétique', ecole: 'École Fictive', obtenuLe: '2018-06-30', description: '' },
		autre: { diplome: 'BP esthétique', ecole: 'École Fictive', obtenuLe: '2018-06-30', description: '' },
		champTexte: 'Diplôme',
		champLong: 'Description',
		doublon: 'Une formation identique est déjà dans la liste.',
		retrait: 'Formation CAP esthétique retirée',
		enregistre: 'Tes formations sont enregistrées.',
		designation: 'la formation',
		vide: {
			'formations-diplome-erreur': 'Le nom du diplôme est requis.',
			'formations-ecole-erreur': 'Le nom de l’école est requis.',
		},
	},
	{
		nom: 'prestations',
		ouvrir: 'Modifier mes prestations',
		monter: (lignes, envoyer) => <EditeurDePrestations lignes={lignes} envoyer={envoyer} />,
		ligne: { nom: 'Maquillage de mariée', description: '', prix: 'à partir de 80 €' },
		autre: { nom: 'Maquillage de soirée', description: '', prix: 'à partir de 80 €' },
		champTexte: 'Nom de la prestation',
		champLong: 'Description',
		doublon: 'Une prestation identique est déjà dans la liste.',
		retrait: 'Prestation Maquillage de mariée retirée',
		enregistre: 'Tes prestations sont enregistrées.',
		designation: 'la prestation',
		vide: { 'prestations-nom-erreur': 'Le nom de la prestation est requis.' },
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
	`${cas.nom === 'expériences' ? 'experiences' : cas.nom}-${champ}`
const champParNom = (cas: Cas, champ: string): HTMLInputElement | HTMLTextAreaElement => {
	const element = dialogue().querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${identifiantDe(cas, champ)}`)
	if (!element) throw new Error(`pas de champ ${champ}`)
	return element
}

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

function fauxEnvoi(reponse?: Awaited<ReturnType<EnvoiDeLaListe>>) {
	const appels: ListeEnvoyee[] = []
	const envoyer: EnvoiDeLaListe = async liste => {
		appels.push(liste)
		return (
			reponse ?? {
				ok: true,
				valeurs: {
					lignes: liste.lignes.map((ligne, rang) => ({ id: ligne.id ?? `nouvelle-${rang}`, valeurs: ligne.valeurs })),
				},
			}
		)
	}
	return { appels, envoyer }
}

/** Two rows that say the same thing, as the server gave them each its own identifier. */
const identiques = (cas: Cas): LigneEnregistree[] => [
	{ id: 'aaa', valeurs: cas.ligne },
	{ id: 'bbb', valeurs: cas.ligne },
]

async function ouvrir(cas: Cas, lignes: readonly LigneEnregistree[], envoyer: EnvoiDeLaListe = fauxEnvoi().envoyer) {
	await fenetre.monter(cas.monter(lignes, envoyer))
	await fenetre.cliquer(fenetre.bouton(cas.ouvrir))
}

for (const cas of CAS) {
	describe(`${cas.nom} : le panneau`, () => {
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
			expect(appels[0]?.lignes).toEqual([{ id: 'bbb', valeurs: { ...cas.autre } }])
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
			const trois: LigneEnregistree[] = [
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

			expect(appels).toEqual([{ lignes: [{ id: 'aaa', valeurs: { ...cas.ligne } }, { valeurs: { ...cas.autre } }] }])
			expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe(cas.enregistre)
		})

		test('E31 : un échec garde la liste et la saisie, dit pourquoi, et le panneau reste ouvert', async () => {
			const { envoyer } = fauxEnvoi({ ok: false, message: MESSAGE_ECHEC })
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }], envoyer)
			await fenetre.cliquer(fenetre.bouton(/^Retirer /, lignesAffichees()[0]))
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))

			const alerte = await fenetre.attendre(() => dialogue().querySelector('[role="alert"] p'))
			expect(alerte.textContent).toBe(MESSAGE_ECHEC)
			expect(lignesAffichees()).toHaveLength(0)
			expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe('')
		})

		test('E31 : une fonction d’envoi qui lève donne le message du site', async () => {
			const lever: EnvoiDeLaListe = async () => {
				throw new Error('Failed to fetch')
			}
			await ouvrir(cas, [{ id: 'aaa', valeurs: cas.ligne }], lever)
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			const alerte = await fenetre.attendre(() => dialogue().querySelector('[role="alert"] p'))
			expect(alerte.textContent).toBe(MESSAGE_ECHEC)
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
			const appels: ListeEnvoyee[] = []
			const envoyer: EnvoiDeLaListe = liste => {
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
		await ajouter(cas, { ...cas.ligne, debut: '2022-05-01', fin: '2021-01-01' })
		expect(lignesAffichees()).toHaveLength(0)
		expect(fenetre.w.document.getElementById('experiences-fin-erreur')?.textContent).toBe(
			'La fin d’une expérience ne peut pas précéder son début.'
		)
		expect(champParNom(cas, 'fin').getAttribute('aria-invalid')).toBe('true')
	})

	test('une fin le jour du début est acceptée, et une expérience en cours n’a pas de fin', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { ...cas.ligne, debut: '2022-05-01', fin: '2022-05-01' })
		await ajouter(cas, { ...cas.autre, debut: '2023-01-01', fin: '' })
		expect(lignesAffichees()).toHaveLength(2)
		expect(lignesAffichees()[1]?.textContent).toContain('aujourd’hui')
	})
})

describe('130, U30 : une date d’obtention à plus d’un an dans le futur est refusée', () => {
	const cas = CAS[1] as Cas
	test('le refus est sous le champ, la ligne n’est pas ajoutée', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { ...cas.ligne, obtenuLe: '2099-01-01' })
		expect(lignesAffichees()).toHaveLength(0)
		expect(fenetre.w.document.getElementById('formations-obtenuLe-erreur')?.textContent).toBe(
			'Une date d’obtention ne peut pas dépasser d’un an la date du jour.'
		)
	})

	test('une date passée, ou sans date, est acceptée', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, cas.ligne)
		await ajouter(cas, { ...cas.autre, obtenuLe: '' })
		expect(lignesAffichees()).toHaveLength(2)
	})
})

describe('131, U29 : le prix, sous le champ, dit le montant retenu', () => {
	const cas = CAS[2] as Cas
	const indice = (): string => fenetre.w.document.getElementById('prestations-prix-indice')?.textContent ?? ''

	for (const saisie of ['80', '80 €', 'à partir de 80']) {
		test(`« ${saisie} » donne un montant de 80 €`, async () => {
			await ouvrir(cas, [])
			await fenetre.saisir(champParNom(cas, 'prix'), saisie)
			expect(indice()).toBe('Montant retenu pour ton profil : 80 €.')
		})
	}

	test('« sur devis » est gardé tel quel, sans montant, et le dit', async () => {
		await ouvrir(cas, [])
		await fenetre.saisir(champParNom(cas, 'prix'), 'sur devis')
		expect(indice()).toContain('Aucun montant retenu')
		await ajouter(cas, { nom: 'Maquillage de mariée', prix: 'sur devis' })
		expect(lignesAffichees()[0]?.querySelector('span')?.textContent).toBe('Maquillage de mariée - Sur devis')
	})

	test('plusieurs formules se séparent par un point-virgule', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { nom: 'Cours', prix: '60 € ; sur devis' })
		expect(lignesAffichees()[0]?.textContent).toContain('60')
		expect(lignesAffichees()[0]?.textContent).toContain('Sur devis')
	})

	test('un nom est requis, et un prix de plus de 70 caractères est refusé', async () => {
		await ouvrir(cas, [])
		await ajouter(cas, { prix: '80' })
		expect(fenetre.w.document.getElementById('prestations-nom-erreur')?.textContent).toBe(
			'Le nom de la prestation est requis.'
		)
		await ajouter(cas, { nom: 'Cours', prix: 'a'.repeat(71) })
		expect(fenetre.w.document.getElementById('prestations-prix-erreur')?.textContent).toBe(
			'Ce texte ne doit pas dépasser 70 caractères.'
		)
		expect(lignesAffichees()).toHaveLength(0)
	})
})
