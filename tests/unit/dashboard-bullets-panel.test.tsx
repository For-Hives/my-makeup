import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { BulletsEditor, type BulletsUpload } from '@/components/dashboard/BulletsEditor'
import { type Bullet, type BulletsKind, LANGUAGES, SKILLS } from '@/lib/dashboard/bullets'
import { FAILURE_MESSAGE } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'

/**
 * The panels of the languages and of the skills (tickets 127 and 128; plan 02 E30, E31) and the
 * seven rules of the lists edited in place (docs/qualite.md §3, L1 to L7). The send functions are
 * fakes: no network. Both lists run the same tests: they are the same editor.
 */

const jsdomWindow = openWindow()

const UPLOAD_SUCCEEDED: BulletsUpload = async saisie => ({
	ok: true,
	valeurs: { puces: saisie.puces.map((puce, rang) => ({ id: puce.id ?? `serveur-${rang}`, nom: puce.nom })) },
})

const dialogue = (): HTMLElement | null => jsdomWindow.w.document.querySelector('[role="dialog"]')
const active = (): Element | null => jsdomWindow.w.document.activeElement
const announcement = (): string =>
	jsdomWindow.w.document.querySelector('[data-testid="annonce-de-retrait"]')?.textContent ?? ''
const names = (): string[] =>
	[...(dialogue()?.querySelectorAll<HTMLElement>('[data-retirer]') ?? [])].map(b => b.getAttribute('aria-label') ?? '')
const title = (): HTMLElement => dialogue()?.querySelector('h2') as HTMLElement
const refusal = (): string => jsdomWindow.w.document.getElementById('puces-refus')?.textContent ?? ''

/** A key on an element, as the browser sends it: with the repeat of a key held down if asked. */
async function key(cible: Element, key: string, repeat = false) {
	const event = new jsdomWindow.w.KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true })
	await act(async () => {
		cible.dispatchEvent(event)
	})
	return event
}

/** A real click or tap: a count of 1, unlike the Enter or Space that clicks a button with a count of 0. */
async function touch(cible: Element) {
	await act(async () => {
		cible.dispatchEvent(new jsdomWindow.w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
	})
}

async function add(nom: string) {
	const field = jsdomWindow.champ(/^(Langue|Compétence)$/)
	await jsdomWindow.saisir(field, nom)
	await key(field, 'Enter')
}

async function open(sorte: BulletsKind, puces: Bullet[], envoyer: BulletsUpload = UPLOAD_SUCCEEDED) {
	await jsdomWindow.monter(<BulletsEditor liste={sorte.champ} puces={puces} envoyer={envoyer} />)
	await jsdomWindow.cliquer(jsdomWindow.bouton(sorte.bouton))
}

const remove = (nom: string) => jsdomWindow.bouton(`Retirer ${nom}`)

const LISTS = [
	{
		sorte: LANGUAGES,
		ticket: 127,
		deja: 'Cette langue est déjà dans ta liste.',
		requis: 'Écris une langue avant de l’ajouter.',
	},
	{
		sorte: SKILLS,
		ticket: 128,
		deja: 'Cette compétence est déjà dans ta liste.',
		requis: 'Écris une compétence avant de l’ajouter.',
	},
]

for (const { sorte: kind, ticket, deja: already } of LISTS) {
	describe(`${ticket} : le panneau de ${kind.libelle.toLowerCase()}s`, () => {
		test('il s’ouvre sur la liste enregistrée, une puce à retirer par nom', async () => {
			await open(kind, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
			])
			expect(dialogue()?.getAttribute('aria-modal')).toBe('true')
			expect(names()).toEqual(['Retirer Anglais', 'Retirer Espagnol'])
		})

		test('une liste vide le dit', async () => {
			await open(kind, [])
			expect(dialogue()?.textContent).toContain(kind.vide)
		})

		test('Entrée ajoute la puce en fin de liste et vide le champ ; le focus reste dans le champ', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await add('  Italien ')
			expect(names()).toEqual(['Retirer Anglais', 'Retirer Italien'])
			expect((jsdomWindow.champ(kind.libelle) as HTMLInputElement).value).toBe('')
			expect(active()).toBe(jsdomWindow.champ(kind.libelle))
		})

		test('le bouton « Ajouter » ajoute aussi, et rend le focus au champ', async () => {
			await open(kind, [])
			await jsdomWindow.saisir(jsdomWindow.champ(kind.libelle), 'Italien')
			await jsdomWindow.cliquer(jsdomWindow.bouton('Ajouter'))
			expect(names()).toEqual(['Retirer Italien'])
			expect(active()).toBe(jsdomWindow.champ(kind.libelle))
		})

		test('un « ; » ajoute ce qui le précède, et ce qui suit reste dans le champ', async () => {
			await open(kind, [])
			await jsdomWindow.saisir(jsdomWindow.champ(kind.libelle), 'Italien; Russe; Ja')
			expect(names()).toEqual(['Retirer Italien', 'Retirer Russe'])
			expect((jsdomWindow.champ(kind.libelle) as HTMLInputElement).value).toBe(' Ja')
		})

		test('L1 : deux puces de même nom : en retirer une laisse l’autre, qui part avec son propre identifiant ; une puce ajoutée part sans', async () => {
			const uploads: Parameters<BulletsUpload>[0][] = []
			await open(
				kind,
				[
					{ id: 'a', nom: 'Anglais' },
					{ id: 'b', nom: 'Anglais' },
				],
				async saisie => {
					uploads.push(saisie)
					return { ok: true, valeurs: { puces: [] } }
				}
			)
			await jsdomWindow.cliquer(jsdomWindow.w.document.querySelectorAll('[data-retirer]')[0] as Element)
			await add('Russe')
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			expect(uploads).toEqual([{ puces: [{ id: 'b', nom: 'Anglais' }, { nom: 'Russe' }] }])
		})

		test('L1 : deux puces ajoutées de suite ont chacune la leur, le retrait de l’une laisse l’autre', async () => {
			await open(kind, [])
			await add('Russe')
			await add('Thaï')
			await touch(remove('Russe'))
			expect(names()).toEqual(['Retirer Thaï'])
		})

		test('L2 : 20 caractères saisis un par un gardent le focus dans le champ, avant et après un échec d’enregistrement', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }], async () => ({ ok: false, message: FAILURE_MESSAGE }))
			const field = () => jsdomWindow.champ(kind.libelle) as HTMLInputElement
			const type = async () => {
				const word = 'abcdefghijklmnopqrst'
				for (let n = 1; n <= word.length; n++) {
					await jsdomWindow.saisir(field(), word.slice(0, n))
					expect(active()).toBe(field())
					expect(field().value).toBe(word.slice(0, n))
				}
			}
			await type()
			await jsdomWindow.saisir(field(), '')
			// Just after a save that came back (here refused): the field is the same node and has the focus.
			const before = field()
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="alert"] p'))
			await jsdomWindow.saisir(field(), '')
			await type()
			expect(field()).toBe(before)
		})

		test('L3 : il n’y a pas de ligne ouverte à modifier ; retirer une puce garde ce qui est dans le champ', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await jsdomWindow.saisir(jsdomWindow.champ(kind.libelle), 'Ita')
			await touch(remove('Anglais'))
			expect((jsdomWindow.champ(kind.libelle) as HTMLInputElement).value).toBe('Ita')
		})

		test('L4 : au clavier, le focus va sur la puce qui prend la place, puis sur celle du dessus', async () => {
			await open(kind, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
				{ id: 'c', nom: 'Russe' },
			])
			await jsdomWindow.cliquer(remove('Espagnol'))
			expect(active()?.getAttribute('aria-label')).toBe('Retirer Russe')
			await jsdomWindow.cliquer(remove('Russe'))
			expect(active()?.getAttribute('aria-label')).toBe('Retirer Anglais')
			expect(dialogue()?.contains(active())).toBe(true)
		})

		test('L4 : la seule puce, retirée au clavier, rend le focus au champ d’ajout', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await jsdomWindow.cliquer(remove('Anglais'))
			expect(active()).toBe(jsdomWindow.champ(kind.libelle))
		})

		test('L4 : au doigt ou à la souris, la dernière puce rend le focus au titre du panneau, jamais à un champ', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await touch(remove('Anglais'))
			expect(active()).toBe(title())
			expect(active()?.tagName).toBe('H2')
		})

		test('L4 : au doigt, une puce qui reste prend le focus', async () => {
			await open(kind, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Russe' },
			])
			await touch(remove('Russe'))
			expect(active()?.getAttribute('aria-label')).toBe('Retirer Anglais')
		})

		test('L5 : la zone d’annonce existe et est vide dès l’ouverture, puis nomme la puce retirée', async () => {
			await open(kind, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
			])
			const zone = jsdomWindow.w.document.querySelector('[data-testid="annonce-de-retrait"]')
			expect(zone?.getAttribute('role')).toBe('status')
			expect(announcement()).toBe('')
			await jsdomWindow.cliquer(remove('Espagnol'))
			expect(announcement()).toBe(kind.retiree('Espagnol'))
		})

		test('L5 : le retrait d’une seconde puce de même nom renouvelle l’annonce', async () => {
			await open(kind, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Anglais' },
			])
			await jsdomWindow.cliquer(jsdomWindow.w.document.querySelectorAll('[data-retirer]')[0] as Element)
			const first = jsdomWindow.w.document.querySelector('[data-testid="annonce-de-retrait"] span')
			expect(first?.textContent).toBe(kind.retiree('Anglais'))
			await jsdomWindow.cliquer(jsdomWindow.w.document.querySelectorAll('[data-retirer]')[0] as Element)
			const second = jsdomWindow.w.document.querySelector('[data-testid="annonce-de-retrait"] span')
			expect(second?.textContent).toBe(kind.retiree('Anglais'))
			expect(second).not.toBe(first)
		})

		test('L6 : un doublon n’est pas ajouté, le refus est dit près du champ et le nom y reste', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await add(' anglais')
			expect(names()).toEqual(['Retirer Anglais'])
			expect(refusal()).toBe(already)
			const field = jsdomWindow.champ(kind.libelle) as HTMLInputElement
			expect(field.getAttribute('aria-invalid')).toBe('true')
			expect(field.getAttribute('aria-describedby')).toBe('puces-refus')
			expect(field.value).toBe(' anglais')
			expect(jsdomWindow.w.document.getElementById('puces-refus')?.closest('[role="alert"]')).not.toBeNull()
		})

		test('L6 : le refus disparaît quand elle retape, et le nom est accepté une fois la puce retirée', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await add('Anglais')
			expect(refusal()).toBe(already)
			await jsdomWindow.cliquer(remove('Anglais'))
			expect(refusal()).toBe('')
			await key(jsdomWindow.champ(kind.libelle), 'Enter')
			expect(names()).toEqual(['Retirer Anglais'])
		})

		test('L6 : deux fois le même nom d’affilée garde une puce et dit le refus', async () => {
			await open(kind, [])
			await add('Russe')
			await add('Russe')
			expect(names()).toEqual(['Retirer Russe'])
			expect(refusal()).toBe(already)
		})

		test('L7 : Entrée maintenue dans le champ n’ajoute qu’une puce', async () => {
			await open(kind, [])
			const field = jsdomWindow.champ(kind.libelle)
			await jsdomWindow.saisir(field, 'Russe')
			await key(field, 'Enter')
			await jsdomWindow.saisir(field, 'Thaï')
			const repeats = await key(field, 'Enter', true)
			expect(repeats.defaultPrevented).toBe(true)
			expect(names()).toEqual(['Retirer Russe'])
		})

		test('L7 : Entrée maintenue sur une puce ne retire que celle-là', async () => {
			await open(kind, [
				{ id: 'a', nom: 'Anglais' },
				{ id: 'b', nom: 'Espagnol' },
				{ id: 'c', nom: 'Russe' },
			])
			const button = remove('Anglais')
			button.focus()
			// The first Enter clicks (detail 0), its repeats are stopped before they click again.
			await jsdomWindow.cliquer(button)
			const repeats = await key(active() as Element, 'Enter', true)
			expect(repeats.defaultPrevented).toBe(true)
			expect(names()).toEqual(['Retirer Espagnol', 'Retirer Russe'])
		})

		test('L7 : Entrée maintenue sur « Ajouter » ne l’actionne pas', async () => {
			await open(kind, [])
			const repeats = await key(jsdomWindow.bouton('Ajouter'), 'Enter', true)
			expect(repeats.defaultPrevented).toBe(true)
		})

		test('Entrée dans le champ n’envoie jamais le formulaire', async () => {
			const uploads: unknown[] = []
			await open(kind, [], async saisie => {
				uploads.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await add('Russe')
			expect(uploads).toHaveLength(0)
		})

		test('E30 : un nom de plus de 70 caractères est refusé, rien n’est envoyé', async () => {
			const uploads: unknown[] = []
			await open(kind, [], async saisie => {
				uploads.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await add('x'.repeat(71))
			expect(names()).toEqual([])
			expect(refusal()).toBe(kind.tropLong)
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			expect(uploads).toHaveLength(0)
			expect(refusal()).toBe(kind.tropLong)
			await jsdomWindow.saisir(jsdomWindow.champ(kind.libelle), 'x'.repeat(70))
			await key(jsdomWindow.champ(kind.libelle), 'Enter')
			expect(names()).toHaveLength(1)
		})

		test('E30 : un nom vide est refusé avec un message', async () => {
			await open(kind, [])
			await key(jsdomWindow.champ(kind.libelle), 'Enter')
			expect(refusal()).toBe(kind.requis)
			expect(names()).toEqual([])
		})

		test('enregistrer envoie la liste dans l’ordre, annonce le résultat hors du panneau et le ferme', async () => {
			const uploads: Parameters<BulletsUpload>[0][] = []
			await open(kind, [{ id: 'a', nom: 'Anglais' }], async saisie => {
				uploads.push(saisie)
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
			await add('Russe')
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			await jsdomWindow.attendre(() => dialogue() === null)
			expect(uploads).toEqual([{ puces: [{ id: 'a', nom: 'Anglais' }, { nom: 'Russe' }] }])
			expect(jsdomWindow.w.document.querySelector('[role="status"]')?.textContent).toBe(kind.enregistre)
			// Opened again, the panel holds what the server stored, with its identifiers.
			await jsdomWindow.cliquer(jsdomWindow.bouton(kind.bouton))
			expect(names()).toEqual(['Retirer Anglais', 'Retirer Russe'])
		})

		test('un nom resté dans le champ est ajouté à l’enregistrement, pas perdu', async () => {
			const uploads: Parameters<BulletsUpload>[0][] = []
			await open(kind, [], async saisie => {
				uploads.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await jsdomWindow.saisir(jsdomWindow.champ(kind.libelle), 'Russe')
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			expect(uploads).toEqual([{ puces: [{ nom: 'Russe' }] }])
		})

		test('une liste vidée s’enregistre', async () => {
			const uploads: Parameters<BulletsUpload>[0][] = []
			await open(kind, [{ id: 'a', nom: 'Anglais' }], async saisie => {
				uploads.push(saisie)
				return { ok: true, valeurs: { puces: [] } }
			})
			await jsdomWindow.cliquer(remove('Anglais'))
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			expect(uploads).toEqual([{ puces: [] }])
		})

		test('E31 : un échec du serveur garde la liste modifiée, dit pourquoi, et le panneau reste ouvert', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }], async () => ({ ok: false, message: FAILURE_MESSAGE }))
			await add('Russe')
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			const alert = await jsdomWindow.attendre(() =>
				jsdomWindow.w.document.querySelector('[role="alert"] p.bg-red-50, [role="alert"] .bg-red-50')
			)
			expect(alert.textContent).toBe(FAILURE_MESSAGE)
			expect(names()).toEqual(['Retirer Anglais', 'Retirer Russe'])
			expect(dialogue()).not.toBeNull()
			expect(jsdomWindow.w.document.querySelector('[role="status"]')?.textContent).toBe('')
		})

		test('E31 : une fonction d’envoi qui lève donne le message du site', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }], async () => {
				throw new Error('Failed to fetch')
			})
			await add('Russe')
			await jsdomWindow.cliquer(jsdomWindow.bouton('Enregistrer'))
			const alert = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('.bg-red-50'))
			expect(alert.textContent).toBe(FAILURE_MESSAGE)
		})

		test('fermer avec une modification non enregistrée demande confirmation', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await jsdomWindow.cliquer(remove('Anglais'))
			await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
			expect(dialogue()?.textContent).toContain('Tu as des modifications non enregistrées')
			await jsdomWindow.cliquer(jsdomWindow.bouton('Abandonner mes modifications'))
			expect(dialogue()).toBeNull()
		})

		test('fermer sans rien changer ferme tout de suite', async () => {
			await open(kind, [{ id: 'a', nom: 'Anglais' }])
			await jsdomWindow.cliquer(jsdomWindow.bouton('Fermer'))
			expect(dialogue()).toBeNull()
		})
	})
}
