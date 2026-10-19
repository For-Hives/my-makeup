import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { EditeurDePuces, type EnvoiDesPuces } from '@/components/dashboard/EditeurDePuces'
import { COMPETENCES, LANGUES, type Puce, type SorteDePuces } from '@/lib/dashboard/puces'
import { MESSAGE_ECHEC } from '@/lib/dashboard/resultat'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The panels of the languages and of the skills (tickets 127 and 128; plan 02 E30, E31) and the
 * seven rules of the lists edited in place (docs/qualite.md §3, L1 to L7). The send functions are
 * fakes: no network. Both lists run the same tests: they are the same editor.
 */

const fenetre = ouvrirFenetre()

const ENVOI_REUSSI: EnvoiDesPuces = async saisie => ({
	ok: true,
	valeurs: { puces: saisie.puces.map((puce, rang) => ({ id: puce.id ?? `serveur-${rang}`, nom: puce.nom })) },
})

const dialogue = (): HTMLElement | null => fenetre.w.document.querySelector('[role="dialog"]')
const actif = (): Element | null => fenetre.w.document.activeElement
const annonce = (): string => fenetre.w.document.querySelector('[data-testid="annonce-de-retrait"]')?.textContent ?? ''
const noms = (): string[] =>
	[...(dialogue()?.querySelectorAll<HTMLElement>('[data-retirer]') ?? [])].map(b => b.getAttribute('aria-label') ?? '')
const titre = (): HTMLElement => dialogue()?.querySelector('h2') as HTMLElement
const refus = (): string => fenetre.w.document.getElementById('puces-refus')?.textContent ?? ''

/** A key on an element, as the browser sends it: with the repeat of a key held down if asked. */
async function touche(cible: Element, key: string, repeat = false) {
	const evenement = new fenetre.w.KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true })
	await act(async () => {
		cible.dispatchEvent(evenement)
	})
	return evenement
}

/** A real click or tap: a count of 1, unlike the Enter or Space that clicks a button with a count of 0. */
async function toucher(cible: Element) {
	await act(async () => {
		cible.dispatchEvent(new fenetre.w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
	})
}

async function ajouter(nom: string) {
	const champ = fenetre.champ(/^(Langue|Compétence)$/)
	await fenetre.saisir(champ, nom)
	await touche(champ, 'Enter')
}

async function ouvrir(sorte: SorteDePuces, puces: Puce[], envoyer: EnvoiDesPuces = ENVOI_REUSSI) {
	await fenetre.monter(<EditeurDePuces liste={sorte.champ} puces={puces} envoyer={envoyer} />)
	await fenetre.cliquer(fenetre.bouton(sorte.bouton))
}

const retirer = (nom: string) => fenetre.bouton(`Retirer ${nom}`)

const LISTES = [
	{
		sorte: LANGUES,
		ticket: 127,
		deja: 'Cette langue est déjà dans ta liste.',
		requis: 'Écris une langue avant de l’ajouter.',
	},
	{
		sorte: COMPETENCES,
		ticket: 128,
		deja: 'Cette compétence est déjà dans ta liste.',
		requis: 'Écris une compétence avant de l’ajouter.',
	},
]

for (const { sorte, ticket, deja } of LISTES) {
	describe(`${ticket} : le panneau de ${sorte.libelle.toLowerCase()}s`, () => {
		test('il s’ouvre sur la liste enregistrée, une puce à retirer par nom', async () => {
			await ouvrir(sorte, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
			])
			expect(dialogue()?.getAttribute('aria-modal')).toBe('true')
			expect(noms()).toEqual(['Retirer Anglais', 'Retirer Espagnol'])
		})

		test('une liste vide le dit', async () => {
			await ouvrir(sorte, [])
			expect(dialogue()?.textContent).toContain(sorte.vide)
		})

		test('Entrée ajoute la puce en fin de liste et vide le champ ; le focus reste dans le champ', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await ajouter('  Italien ')
			expect(noms()).toEqual(['Retirer Anglais', 'Retirer Italien'])
			expect((fenetre.champ(sorte.libelle) as HTMLInputElement).value).toBe('')
			expect(actif()).toBe(fenetre.champ(sorte.libelle))
		})

		test('le bouton « Ajouter » ajoute aussi, et rend le focus au champ', async () => {
			await ouvrir(sorte, [])
			await fenetre.saisir(fenetre.champ(sorte.libelle), 'Italien')
			await fenetre.cliquer(fenetre.bouton('Ajouter'))
			expect(noms()).toEqual(['Retirer Italien'])
			expect(actif()).toBe(fenetre.champ(sorte.libelle))
		})

		test('un « ; » ajoute ce qui le précède, et ce qui suit reste dans le champ', async () => {
			await ouvrir(sorte, [])
			await fenetre.saisir(fenetre.champ(sorte.libelle), 'Italien; Russe; Ja')
			expect(noms()).toEqual(['Retirer Italien', 'Retirer Russe'])
			expect((fenetre.champ(sorte.libelle) as HTMLInputElement).value).toBe(' Ja')
		})

		test('L1 : deux puces de même nom : en retirer une laisse l’autre, qui part avec son propre identifiant ; une puce ajoutée part sans', async () => {
			const envois: Parameters<EnvoiDesPuces>[0][] = []
			await ouvrir(
				sorte,
				[
					{ id: 'a', nom: 'Anglais' },
					{ id: 'b', nom: 'Anglais' },
				],
				async saisie => {
					envois.push(saisie)
					return { ok: true, valeurs: { puces: [] } }
				}
			)
			await fenetre.cliquer(fenetre.w.document.querySelectorAll('[data-retirer]')[0] as Element)
			await ajouter('Russe')
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			expect(envois).toEqual([{ puces: [{ id: 'b', nom: 'Anglais' }, { nom: 'Russe' }] }])
		})

		test('L1 : deux puces ajoutées de suite ont chacune la leur, le retrait de l’une laisse l’autre', async () => {
			await ouvrir(sorte, [])
			await ajouter('Russe')
			await ajouter('Thaï')
			await toucher(retirer('Russe'))
			expect(noms()).toEqual(['Retirer Thaï'])
		})

		test('L2 : 20 caractères saisis un par un gardent le focus dans le champ, avant et après un échec d’enregistrement', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }], async () => ({ ok: false, message: MESSAGE_ECHEC }))
			const champ = () => fenetre.champ(sorte.libelle) as HTMLInputElement
			const taper = async () => {
				const mot = 'abcdefghijklmnopqrst'
				for (let n = 1; n <= mot.length; n++) {
					await fenetre.saisir(champ(), mot.slice(0, n))
					expect(actif()).toBe(champ())
					expect(champ().value).toBe(mot.slice(0, n))
				}
			}
			await taper()
			await fenetre.saisir(champ(), '')
			// Just after a save that came back (here refused): the field is the same node and has the focus.
			const avant = champ()
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
			await fenetre.saisir(champ(), '')
			await taper()
			expect(champ()).toBe(avant)
		})

		test('L3 : il n’y a pas de ligne ouverte à modifier ; retirer une puce garde ce qui est dans le champ', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await fenetre.saisir(fenetre.champ(sorte.libelle), 'Ita')
			await toucher(retirer('Anglais'))
			expect((fenetre.champ(sorte.libelle) as HTMLInputElement).value).toBe('Ita')
		})

		test('L4 : au clavier, le focus va sur la puce qui prend la place, puis sur celle du dessus', async () => {
			await ouvrir(sorte, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
				{ id: 'c', nom: 'Russe' },
			])
			await fenetre.cliquer(retirer('Espagnol'))
			expect(actif()?.getAttribute('aria-label')).toBe('Retirer Russe')
			await fenetre.cliquer(retirer('Russe'))
			expect(actif()?.getAttribute('aria-label')).toBe('Retirer Anglais')
			expect(dialogue()?.contains(actif())).toBe(true)
		})

		test('L4 : la seule puce, retirée au clavier, rend le focus au champ d’ajout', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await fenetre.cliquer(retirer('Anglais'))
			expect(actif()).toBe(fenetre.champ(sorte.libelle))
		})

		test('L4 : au doigt ou à la souris, la dernière puce rend le focus au titre du panneau, jamais à un champ', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await toucher(retirer('Anglais'))
			expect(actif()).toBe(titre())
			expect(actif()?.tagName).toBe('H2')
		})

		test('L4 : au doigt, une puce qui reste prend le focus', async () => {
			await ouvrir(sorte, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Russe' },
			])
			await toucher(retirer('Russe'))
			expect(actif()?.getAttribute('aria-label')).toBe('Retirer Anglais')
		})

		test('L5 : la zone d’annonce existe et est vide dès l’ouverture, puis nomme la puce retirée', async () => {
			await ouvrir(sorte, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
			])
			const zone = fenetre.w.document.querySelector('[data-testid="annonce-de-retrait"]')
			expect(zone?.getAttribute('role')).toBe('status')
			expect(annonce()).toBe('')
			await fenetre.cliquer(retirer('Espagnol'))
			expect(annonce()).toBe(sorte.retiree('Espagnol'))
		})

		test('L5 : le retrait d’une seconde puce de même nom renouvelle l’annonce', async () => {
			await ouvrir(sorte, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Anglais' },
			])
			await fenetre.cliquer(fenetre.w.document.querySelectorAll('[data-retirer]')[0] as Element)
			const premier = fenetre.w.document.querySelector('[data-testid="annonce-de-retrait"] span')
			expect(premier?.textContent).toBe(sorte.retiree('Anglais'))
			await fenetre.cliquer(fenetre.w.document.querySelectorAll('[data-retirer]')[0] as Element)
			const second = fenetre.w.document.querySelector('[data-testid="annonce-de-retrait"] span')
			expect(second?.textContent).toBe(sorte.retiree('Anglais'))
			expect(second).not.toBe(premier)
		})

		test('L6 : un doublon n’est pas ajouté, le refus est dit près du champ et le nom y reste', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await ajouter(' anglais')
			expect(noms()).toEqual(['Retirer Anglais'])
			expect(refus()).toBe(deja)
			const champ = fenetre.champ(sorte.libelle) as HTMLInputElement
			expect(champ.getAttribute('aria-invalid')).toBe('true')
			expect(champ.getAttribute('aria-describedby')).toBe('puces-refus')
			expect(champ.value).toBe(' anglais')
			expect(fenetre.w.document.getElementById('puces-refus')?.closest('[role="alert"]')).not.toBeNull()
		})

		test('L6 : le refus disparaît quand elle retape, et le nom est accepté une fois la puce retirée', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await ajouter('Anglais')
			expect(refus()).toBe(deja)
			await fenetre.cliquer(retirer('Anglais'))
			expect(refus()).toBe('')
			await touche(fenetre.champ(sorte.libelle), 'Enter')
			expect(noms()).toEqual(['Retirer Anglais'])
		})

		test('L6 : deux fois le même nom d’affilée garde une puce et dit le refus', async () => {
			await ouvrir(sorte, [])
			await ajouter('Russe')
			await ajouter('Russe')
			expect(noms()).toEqual(['Retirer Russe'])
			expect(refus()).toBe(deja)
		})

		test('L7 : Entrée maintenue dans le champ n’ajoute qu’une puce', async () => {
			await ouvrir(sorte, [])
			const champ = fenetre.champ(sorte.libelle)
			await fenetre.saisir(champ, 'Russe')
			await touche(champ, 'Enter')
			await fenetre.saisir(champ, 'Thaï')
			const repetition = await touche(champ, 'Enter', true)
			expect(repetition.defaultPrevented).toBe(true)
			expect(noms()).toEqual(['Retirer Russe'])
		})

		test('L7 : Entrée maintenue sur une puce ne retire que celle-là', async () => {
			await ouvrir(sorte, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
				{ id: 'c', nom: 'Russe' },
			])
			const bouton = retirer('Anglais')
			bouton.focus()
			// The first Enter clicks (detail 0), its repeats are stopped before they click again.
			await fenetre.cliquer(bouton)
			const repetition = await touche(actif() as Element, 'Enter', true)
			expect(repetition.defaultPrevented).toBe(true)
			expect(noms()).toEqual(['Retirer Espagnol', 'Retirer Russe'])
		})

		test('L7 : Entrée maintenue sur « Ajouter » ne l’actionne pas', async () => {
			await ouvrir(sorte, [])
			const repetition = await touche(fenetre.bouton('Ajouter'), 'Enter', true)
			expect(repetition.defaultPrevented).toBe(true)
		})

		test('Entrée dans le champ n’envoie jamais le formulaire', async () => {
			const envois: unknown[] = []
			await ouvrir(sorte, [], async saisie => {
				envois.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await ajouter('Russe')
			expect(envois).toHaveLength(0)
		})

		test('E30 : un nom de plus de 70 caractères est refusé, rien n’est envoyé', async () => {
			const envois: unknown[] = []
			await ouvrir(sorte, [], async saisie => {
				envois.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await ajouter('x'.repeat(71))
			expect(noms()).toEqual([])
			expect(refus()).toBe(sorte.tropLong)
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			expect(envois).toHaveLength(0)
			expect(refus()).toBe(sorte.tropLong)
			await fenetre.saisir(fenetre.champ(sorte.libelle), 'x'.repeat(70))
			await touche(fenetre.champ(sorte.libelle), 'Enter')
			expect(noms()).toHaveLength(1)
		})

		test('E30 : un nom vide est refusé avec un message', async () => {
			await ouvrir(sorte, [])
			await touche(fenetre.champ(sorte.libelle), 'Enter')
			expect(refus()).toBe(sorte.requis)
			expect(noms()).toEqual([])
		})

		test('enregistrer envoie la liste dans l’ordre, annonce le résultat hors du panneau et le ferme', async () => {
			const envois: Parameters<EnvoiDesPuces>[0][] = []
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }], async saisie => {
				envois.push(saisie)
				return {
					ok: true,
					valeurs: {
						puces: [
							{ id: 'a', nom: 'Anglais' },
							{ id: 'n', nom: 'Russe' },
						],
					},
				}
			})
			await ajouter('Russe')
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			await fenetre.attendre(() => dialogue() === null)
			expect(envois).toEqual([{ puces: [{ id: 'a', nom: 'Anglais' }, { nom: 'Russe' }] }])
			expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe(sorte.enregistre)
			// Opened again, the panel holds what the server stored, with its identifiers.
			await fenetre.cliquer(fenetre.bouton(sorte.bouton))
			expect(noms()).toEqual(['Retirer Anglais', 'Retirer Russe'])
		})

		test('un nom resté dans le champ est ajouté à l’enregistrement, pas perdu', async () => {
			const envois: Parameters<EnvoiDesPuces>[0][] = []
			await ouvrir(sorte, [], async saisie => {
				envois.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await fenetre.saisir(fenetre.champ(sorte.libelle), 'Russe')
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			expect(envois).toEqual([{ puces: [{ nom: 'Russe' }] }])
		})

		test('une liste vidée s’enregistre', async () => {
			const envois: Parameters<EnvoiDesPuces>[0][] = []
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }], async saisie => {
				envois.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await fenetre.cliquer(retirer('Anglais'))
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			expect(envois).toEqual([{ puces: [] }])
		})

		test('E31 : un échec du serveur garde la liste modifiée, dit pourquoi, et le panneau reste ouvert', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }], async () => ({ ok: false, message: MESSAGE_ECHEC }))
			await ajouter('Russe')
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			const alerte = await fenetre.attendre(() =>
				fenetre.w.document.querySelector('[role="alert"] p.bg-red-50, [role="alert"] .bg-red-50')
			)
			expect(alerte.textContent).toBe(MESSAGE_ECHEC)
			expect(noms()).toEqual(['Retirer Anglais', 'Retirer Russe'])
			expect(dialogue()).not.toBeNull()
			expect(fenetre.w.document.querySelector('[role="status"]')?.textContent).toBe('')
		})

		test('E31 : une fonction d’envoi qui lève donne le message du site', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }], async () => {
				throw new Error('Failed to fetch')
			})
			await ajouter('Russe')
			await fenetre.cliquer(fenetre.bouton('Enregistrer'))
			const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('.bg-red-50'))
			expect(alerte.textContent).toBe(MESSAGE_ECHEC)
		})

		test('fermer avec une modification non enregistrée demande confirmation', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await fenetre.cliquer(retirer('Anglais'))
			await fenetre.cliquer(fenetre.bouton('Fermer'))
			expect(dialogue()?.textContent).toContain('Tu as des modifications non enregistrées')
			await fenetre.cliquer(fenetre.bouton('Abandonner mes modifications'))
			expect(dialogue()).toBeNull()
		})

		test('fermer sans rien changer ferme tout de suite', async () => {
			await ouvrir(sorte, [{ id: 'a', nom: 'Anglais' }])
			await fenetre.cliquer(fenetre.bouton('Fermer'))
			expect(dialogue()).toBeNull()
		})
	})
}
