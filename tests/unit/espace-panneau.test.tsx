import { describe, expect, test } from 'bun:test'
import { act } from 'react'
import { EditeurDIdentite, type EnvoiDeLIdentite } from '@/components/espace/EditeurDIdentite'
import type { ValeursDeLIdentite } from '@/lib/espace/identite'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import type { Stockage } from '@/lib/espace/saisie-gardee'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * The panel of the identity (tickets 119 and 120; plan 02 E30, E31, E68): bounds, a failure that
 * keeps the old value, the confirmation on closing, a single save for a double click or a held
 * Enter, and the keyboard inside the dialog. The send function is a fake: no network.
 */

const fenetre = ouvrirFenetre()

const VALEURS: ValeursDeLIdentite = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Teint' }

/** A send function that records its calls and answers like the server stores. */
function faussementEnvoi(reponse?: Awaited<ReturnType<EnvoiDeLIdentite>>) {
	const appels: ValeursDeLIdentite[] = []
	const envoyer: EnvoiDeLIdentite = async valeurs => {
		appels.push(valeurs)
		return reponse ?? { ok: true, valeurs }
	}
	return { appels, envoyer }
}

async function ouvrir(envoyer: EnvoiDeLIdentite) {
	const zone = await fenetre.monter(
		<EditeurDIdentite valeurs={VALEURS} envoyer={envoyer} proprietaire="7" stockage={() => null} />
	)
	await fenetre.cliquer(fenetre.bouton('Modifier mon identité'))
	return zone
}

async function touche(cible: Element, key: string, options: { repeat?: boolean; shiftKey?: boolean } = {}) {
	let evenement: Event | undefined
	await act(async () => {
		evenement = new fenetre.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
		cible.dispatchEvent(evenement)
	})
	return evenement?.defaultPrevented ?? false
}

const dialogue = (): HTMLElement | null => fenetre.w.document.querySelector('[role="dialog"]')
const statut = (): string => fenetre.w.document.querySelector('[role="status"]')?.textContent ?? ''

describe('le panneau s’ouvre, avec les valeurs enregistrées', () => {
	test('un clic ouvre un dialogue nommé, le focus est dans le premier champ', async () => {
		const { envoyer } = faussementEnvoi()
		await ouvrir(envoyer)

		const d = dialogue()
		expect(d?.getAttribute('aria-modal')).toBe('true')
		const titre = fenetre.w.document.getElementById(d?.getAttribute('aria-labelledby') ?? '')
		expect(titre?.textContent).toBe('Modifier mon identité')
		expect(fenetre.champ('Prénom')).toBe(fenetre.w.document.activeElement as never)
		expect((fenetre.champ('Prénom') as HTMLInputElement).value).toBe('Léa')
		expect((fenetre.champ('Spécialité') as HTMLInputElement).value).toBe('Teint')
	})
})

describe('E30 : hors bornes, un message sous le champ et aucune requête', () => {
	test('un nom trop court et un prénom vide', async () => {
		const { appels, envoyer } = faussementEnvoi()
		await ouvrir(envoyer)

		await fenetre.saisir(fenetre.champ('Prénom'), '')
		await fenetre.saisir(fenetre.champ('Nom'), 'A')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.getElementById('identite-nom-erreur'))
		expect(alerte.textContent).toBe('Ton nom doit contenir au moins 2 caractères.')
		expect(fenetre.w.document.getElementById('identite-prenom-erreur')?.textContent).toBe('Indique ton prénom.')
		expect(fenetre.champ('Nom').getAttribute('aria-invalid')).toBe('true')
		expect(fenetre.champ('Nom').getAttribute('aria-describedby')).toBe('identite-nom-erreur')
		expect(appels).toHaveLength(0)
		expect(dialogue()).not.toBeNull()
	})
})

describe('un enregistrement réussi', () => {
	test('envoie les valeurs rognées, ferme le panneau, annonce le résultat et rend le focus', async () => {
		const { appels, envoyer } = faussementEnvoi()
		await ouvrir(envoyer)

		await fenetre.saisir(fenetre.champ('Prénom'), '  Inès  ')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)

		expect(appels).toEqual([{ ...VALEURS, prenom: 'Inès' }])
		expect(statut()).toBe('Ton identité est enregistrée.')
		expect(fenetre.w.document.activeElement).toBe(fenetre.bouton('Modifier mon identité'))
	})
})

describe('E31 : un échec du serveur', () => {
	test('le panneau reste ouvert avec la saisie, le message est en français', async () => {
		const { envoyer } = faussementEnvoi({ ok: false, message: MESSAGE_ECHEC })
		await ouvrir(envoyer)

		await fenetre.saisir(fenetre.champ('Prénom'), 'Inès')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(MESSAGE_ECHEC)
		expect((fenetre.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
		expect(statut()).toBe('')
		expect(dialogue()).not.toBeNull()
	})

	test('le message d’un champ s’affiche sous ce champ', async () => {
		const { envoyer } = faussementEnvoi({
			ok: false,
			message: 'Un champ n’est pas valide.',
			champs: { specialite: 'Ce champ est trop long.' },
		})
		await ouvrir(envoyer)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const erreur = await fenetre.attendre(() => fenetre.w.document.getElementById('identite-specialite-erreur'))
		expect(erreur.textContent).toBe('Ce champ est trop long.')
	})

	test('une fonction d’envoi qui lève donne le message du site, pas le sien', async () => {
		const envoyer: EnvoiDeLIdentite = async () => {
			throw new Error('Failed to fetch')
		}
		await ouvrir(envoyer)
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))
		expect(alerte.textContent).toBe(MESSAGE_ECHEC)
	})

	test('fermer sans rien changer ferme tout de suite ; avec une saisie, la confirmation passe d’abord', async () => {
		const { appels, envoyer } = faussementEnvoi()
		await ouvrir(envoyer)
		await fenetre.cliquer(fenetre.bouton('Fermer'))
		expect(dialogue()).toBeNull()

		await fenetre.cliquer(fenetre.bouton('Modifier mon identité'))
		await fenetre.saisir(fenetre.champ('Nom'), 'Autre')
		await fenetre.cliquer(fenetre.bouton('Fermer'))
		expect(dialogue()).not.toBeNull()
		expect(fenetre.w.document.querySelector('[role="alert"]')?.textContent).toContain('non enregistrées')
		expect(fenetre.w.document.activeElement).toBe(fenetre.bouton('Continuer à modifier'))

		await fenetre.cliquer(fenetre.bouton('Continuer à modifier'))
		expect((fenetre.champ('Nom') as HTMLInputElement).value).toBe('Autre')

		await fenetre.cliquer(fenetre.bouton('Fermer'))
		await fenetre.cliquer(fenetre.bouton('Abandonner mes modifications'))
		expect(dialogue()).toBeNull()
		expect(appels).toHaveLength(0)

		// Opened again, the panel starts from the stored values, not from what was abandoned.
		await fenetre.cliquer(fenetre.bouton('Modifier mon identité'))
		expect((fenetre.champ('Nom') as HTMLInputElement).value).toBe('Fictive')
	})
})

describe('un double clic, une touche Entrée maintenue : un seul enregistrement', () => {
	test('deux clics avant la réponse', async () => {
		let repondre: (() => void) | undefined
		const appels: ValeursDeLIdentite[] = []
		const envoyer: EnvoiDeLIdentite = valeurs => {
			appels.push(valeurs)
			return new Promise(resolve => {
				repondre = () => resolve({ ok: true, valeurs })
			})
		}
		await ouvrir(envoyer)
		await fenetre.saisir(fenetre.champ('Prénom'), 'Inès')

		const bouton = fenetre.bouton('Enregistrer')
		await fenetre.cliquer(bouton)
		await fenetre.cliquer(bouton)
		await act(async () => {
			bouton.closest('form')?.requestSubmit()
		})
		expect(appels).toHaveLength(1)
		expect((bouton as HTMLButtonElement).disabled).toBe(true)

		await act(async () => repondre?.())
		await fenetre.attendre(() => dialogue() === null)
		expect(appels).toHaveLength(1)
	})

	test('les répétitions d’Entrée sont ignorées dans le champ, sur « Modifier », et rien ne rouvre le panneau', async () => {
		const { appels, envoyer } = faussementEnvoi()
		await ouvrir(envoyer)
		await fenetre.saisir(fenetre.champ('Prénom'), 'Inès')

		const champ = fenetre.champ('Prénom')
		expect(await touche(champ, 'Enter', { repeat: true })).toBe(true)
		expect(appels).toHaveLength(0)

		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => dialogue() === null)
		const modifier = fenetre.bouton('Modifier mon identité')
		expect(fenetre.w.document.activeElement).toBe(modifier)
		// The key is still held: its repeats reach the button that has the focus again.
		expect(await touche(modifier, 'Enter', { repeat: true })).toBe(true)
		expect(await touche(modifier, 'Enter', { repeat: false })).toBe(false)
		expect(appels).toHaveLength(1)
	})
})

describe('E68 : le clavier dans le dialogue', () => {
	test('Tab et Maj+Tab tournent dans le panneau', async () => {
		const { envoyer } = faussementEnvoi()
		await ouvrir(envoyer)
		const d = dialogue() as HTMLElement
		const elements = [...d.querySelectorAll<HTMLElement>('button, input')]
		const premier = elements[0]
		const dernier = elements[elements.length - 1]
		if (!premier || !dernier) throw new Error('pas d’éléments')

		dernier.focus()
		expect(await touche(dernier, 'Tab')).toBe(true)
		expect(fenetre.w.document.activeElement).toBe(premier)

		expect(await touche(premier, 'Tab', { shiftKey: true })).toBe(true)
		expect(fenetre.w.document.activeElement).toBe(dernier)
	})

	test('Échap ferme le panneau et rend le focus au bouton qui l’a ouvert', async () => {
		const { envoyer } = faussementEnvoi()
		await ouvrir(envoyer)

		await touche(fenetre.champ('Prénom'), 'Escape')

		expect(dialogue()).toBeNull()
		expect(fenetre.w.document.activeElement).toBe(fenetre.bouton('Modifier mon identité'))
	})

	test('Échap avec une saisie demande la confirmation, un second Échap revient à la saisie', async () => {
		const { envoyer } = faussementEnvoi()
		await ouvrir(envoyer)
		await fenetre.saisir(fenetre.champ('Nom'), 'Autre')

		await touche(fenetre.champ('Nom'), 'Escape')
		expect(dialogue()).not.toBeNull()
		expect(fenetre.w.document.querySelector('[role="alert"]')?.textContent).toContain('non enregistrées')

		await touche(fenetre.bouton('Continuer à modifier'), 'Escape')
		expect(fenetre.w.document.querySelector('[role="alert"]')?.textContent ?? '').not.toContain('non enregistrées')
		expect(dialogue()).not.toBeNull()
	})
})

describe('121 (E32) : la session expire pendant la saisie', () => {
	const EXPIREE: Awaited<ReturnType<EnvoiDeLIdentite>> = {
		ok: false,
		message: 'Ta session a expiré : ta modification n’a pas été enregistrée. Reconnecte-toi, puis recommence.',
		session: 'expiree',
	}

	function faussementStockage(): Stockage & { contenu: Map<string, string> } {
		const contenu = new Map<string, string>()
		return {
			contenu,
			getItem: cle => contenu.get(cle) ?? null,
			setItem: (cle, valeur) => void contenu.set(cle, valeur),
			removeItem: cle => void contenu.delete(cle),
		}
	}

	async function monter(envoyer: EnvoiDeLIdentite, stockage: Stockage | null, naviguer: (url: string) => void) {
		await fenetre.monter(
			<EditeurDIdentite
				valeurs={VALEURS}
				envoyer={envoyer}
				proprietaire="7"
				stockage={() => stockage}
				naviguer={naviguer}
			/>
		)
	}

	test('le message, rien d’enregistré, la saisie gardée, un seul renvoi vers la connexion', async () => {
		const stockage = faussementStockage()
		const vers: string[] = []
		const { appels, envoyer } = faussementEnvoi(EXPIREE)
		await monter(envoyer, stockage, url => vers.push(url))
		await fenetre.cliquer(fenetre.bouton('Modifier mon identité'))

		await fenetre.saisir(fenetre.champ('Prénom'), 'Inès')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => vers.length > 0 || null)

		expect(vers).toEqual(['/auth/signin?callbackUrl=%2Fauth%2Fprofil&error=session-expiree'])
		expect(appels).toHaveLength(1)
		const gardee = JSON.parse([...stockage.contenu.values()][0] ?? 'null')
		expect(gardee.valeurs).toEqual({ ...VALEURS, prenom: 'Inès' })
		expect(gardee.redirigeLe).toBeNumber()
		// Still locked while the page leaves: a second click sends nothing.
		await fenetre.cliquer(fenetre.bouton(/Enregistrement/))
		expect(appels).toHaveLength(1)
	})

	test('de retour : le même panneau s’ouvre avec la saisie, un message, puis un enregistrement réussi efface tout', async () => {
		const stockage = faussementStockage()
		stockage.setItem(
			'mm:saisie:identite:7',
			JSON.stringify({ valeurs: { ...VALEURS, prenom: 'Inès' }, le: Date.now(), redirigeLe: Date.now() - 20_000 })
		)
		const { appels, envoyer } = faussementEnvoi()
		await monter(envoyer, stockage, () => {})

		await fenetre.attendre(() => dialogue())
		expect((fenetre.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
		expect(dialogue()?.textContent).toContain('on a retrouvé ce que tu avais saisi')

		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		await fenetre.attendre(() => (dialogue() === null ? true : null))
		expect(appels).toEqual([{ ...VALEURS, prenom: 'Inès' }])
		expect(stockage.contenu.size).toBe(0)
	})

	test('de retour, une deuxième expiration aussitôt : pas de nouveau renvoi, le message reste dans le panneau, la saisie aussi', async () => {
		const stockage = faussementStockage()
		stockage.setItem(
			'mm:saisie:identite:7',
			JSON.stringify({ valeurs: { ...VALEURS, prenom: 'Inès' }, le: Date.now(), redirigeLe: Date.now() - 20_000 })
		)
		const vers: string[] = []
		const { envoyer } = faussementEnvoi(EXPIREE)
		await monter(envoyer, stockage, url => vers.push(url))
		await fenetre.attendre(() => dialogue())

		await fenetre.cliquer(fenetre.bouton('Enregistrer'))
		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] p'))

		expect(vers).toEqual([])
		expect(alerte.textContent).toContain('Ta session a expiré')
		expect(alerte.querySelector('a')?.getAttribute('href')).toBe(
			'/auth/signin?callbackUrl=%2Fauth%2Fprofil&error=session-expiree'
		)
		expect((fenetre.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
		expect(stockage.contenu.size).toBe(1)
	})

	test('abandonner efface la saisie gardée', async () => {
		const stockage = faussementStockage()
		stockage.setItem(
			'mm:saisie:identite:7',
			JSON.stringify({ valeurs: { ...VALEURS, prenom: 'Inès' }, le: Date.now(), redirigeLe: null })
		)
		const { envoyer } = faussementEnvoi()
		await monter(envoyer, stockage, () => {})
		await fenetre.attendre(() => dialogue())

		await fenetre.cliquer(fenetre.bouton('Fermer'))
		await fenetre.cliquer(fenetre.bouton('Abandonner mes modifications'))

		expect(dialogue()).toBeNull()
		expect(stockage.contenu.size).toBe(0)
	})

	test('la saisie d’un autre compte, ou identique aux valeurs enregistrées, n’ouvre rien', async () => {
		const stockage = faussementStockage()
		stockage.setItem(
			'mm:saisie:identite:8',
			JSON.stringify({ valeurs: { ...VALEURS, prenom: 'Autre' }, le: Date.now(), redirigeLe: null })
		)
		stockage.setItem('mm:saisie:identite:7', JSON.stringify({ valeurs: VALEURS, le: Date.now(), redirigeLe: null }))
		const { envoyer } = faussementEnvoi()
		await monter(envoyer, stockage, () => {})

		expect(dialogue()).toBeNull()
		expect([...stockage.contenu.keys()]).toEqual(['mm:saisie:identite:8'])
	})

	test('un navigateur sans stockage : pas de renvoi qui perdrait la saisie, le message et le lien en nouvel onglet', async () => {
		const vers: string[] = []
		const { envoyer } = faussementEnvoi(EXPIREE)
		await monter(envoyer, null, url => vers.push(url))
		await fenetre.cliquer(fenetre.bouton('Modifier mon identité'))
		await fenetre.saisir(fenetre.champ('Prénom'), 'Inès')
		await fenetre.cliquer(fenetre.bouton('Enregistrer'))

		const alerte = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="alert"] a'))
		expect(vers).toEqual([])
		expect(alerte.getAttribute('target')).toBe('_blank')
		expect((fenetre.champ('Prénom') as HTMLInputElement).value).toBe('Inès')
	})
})
