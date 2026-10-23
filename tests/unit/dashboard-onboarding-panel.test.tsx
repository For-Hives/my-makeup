import { describe, expect, test } from 'bun:test'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import { openWindow } from '../support/dom-react'
import { doneUntil, onboardingBench, REDUCED } from '../support/onboarding-bench'
import { pickFiles } from '../support/pick-files'

/**
 * The onboarding (ticket 140; plan 02 E02, RG-07; issue 1009): five steps, the next one opens only when
 * the server said it stored the step, a failure stays on the step with the typing, and the end page is
 * asked for only when no step is left. The server actions and the browser work are fakes.
 */

const jsdomWindow = openWindow()
const bench = (options: Parameters<typeof onboardingBench>[1] = {}) => onboardingBench(jsdomWindow, options)

const pageText = () => jsdomWindow.w.document.body.textContent ?? ''
const stepTitle = () => jsdomWindow.w.document.getElementById('accueil-titre-etape')?.textContent
const alerts = () => [...jsdomWindow.w.document.querySelectorAll('[role="alert"]')].map(a => a.textContent).join('|')
const field = (nom: string | RegExp) => jsdomWindow.champ(nom) as HTMLInputElement
const END = '/auth/init-account?etape=fin'

async function fillIdentity() {
	await jsdomWindow.saisir(field('Prénom'), 'Léa')
	await jsdomWindow.saisir(field('Nom'), 'Fictive')
	await jsdomWindow.cliquer(field('Mariage'))
}

async function pickCity() {
	const input = jsdomWindow.w.document.querySelector('input[role="combobox"]') as HTMLInputElement
	await jsdomWindow.saisir(input, 'Lill')
	const proposal = await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="option"]'), {
		max: 3000,
	})
	await jsdomWindow.cliquer(proposal)
}

const pickPhoto = async () => {
	await pickFiles(jsdomWindow, jsdomWindow.champ(/photo/i) as HTMLInputElement, [REDUCED])
	await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Suivant') as HTMLButtonElement).disabled)
}

async function next(title: string) {
	await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
	await jsdomWindow.attendre(() => stepTitle() === title)
}

describe('le parcours : une étape à la fois, chacune enregistrée avant la suivante', () => {
	test('les cinq étapes passent ; la page de fin n’est demandée qu’après la réponse du serveur à la dernière', async () => {
		const b = bench()
		await b.monter()
		expect(stepTitle()).toBe('Ta spécialité')
		expect(jsdomWindow.w.document.querySelector('[data-testid="etape-courante"]')?.textContent).toBe(
			'Étape 1 sur 5 · Toi'
		)

		await fillIdentity()
		await next('Ta zone')
		expect(b.journal.identity).toEqual([
			{ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialtyBullets: 'wedding', specialtyOther: '' },
		])

		await pickCity()
		await next('Ta photo principale')
		expect(b.journal.place).toEqual([{ kind: 'city', codeInsee: '59350', rayonKm: null, aDomicile: false }])

		await pickPhoto()
		await next('Comment te joindre')
		expect(b.journal.photo).toEqual([{ photoPrincipale: 9 }])

		await jsdomWindow.saisir(field('Instagram'), '@studio.fictif')
		await next('Ta prestation phare')
		expect(b.journal.networks).toEqual([
			{
				instagram: 'https://www.instagram.com/studio.fictif',
				facebook: '',
				youtube: '',
				linkedin: '',
				siteWeb: '',
			},
		])
		expect(b.journal.navigations).toEqual([])

		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Mariée'))
		await jsdomWindow.saisir(field('Prix'), '150')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.services).toEqual([
			{ lignes: [{ valeurs: { name: 'Maquillage de la mariée', description: '', price: '150' } }] },
		])
		expect(b.journal.navigations).toEqual([END])
		// The page is read again after each step but the last, which goes to the end page.
		expect(b.journal.refreshes).toBe(4)
	})

	test('la reprise : le serveur dit étape 4, la page s’ouvre sur le contact', async () => {
		const b = bench({ position: 4, done: doneUntil(3) })
		await b.monter()
		expect(stepTitle()).toBe('Comment te joindre')
		const current = jsdomWindow.w.document.querySelector('[aria-current="step"]')
		expect(current?.textContent).toContain('Contact')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Précédent'))
		expect(stepTitle()).toBe('Ta photo principale')
	})

	test('une étape que le profil a déjà est sautée : l’étape 2 faite par l’import, l’identité mène à la photo', async () => {
		const b = bench({ done: { 1: false, 2: true, 3: false, 4: false, 5: false } })
		await b.monter()
		await fillIdentity()
		await next('Ta photo principale')
		expect(b.journal.place).toEqual([])
	})

	test('les étapes 4 et 5 déjà faites : la dernière étape à faire mène droit à la page de fin', async () => {
		const b = bench({
			position: 3,
			done: { 1: true, 2: true, 3: false, 4: true, 5: true },
		})
		await b.monter()
		await pickPhoto()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.navigations).toEqual([END])
		expect(b.journal.refreshes).toBe(0)
	})

	test('les noms viennent de l’inscription : l’étape ne demande que la spécialité, et renvoie les noms enregistrés', async () => {
		const b = bench({
			profile: {
				askNames: false,
				identity: { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialtyBullets: '', specialtyOther: '' },
			},
		})
		await b.monter()
		expect(() => field('Prénom')).toThrow()
		await jsdomWindow.cliquer(field('Mariage'))
		await next('Ta zone')
		expect(b.journal.identity).toEqual([
			{ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialtyBullets: 'wedding', specialtyOther: '' },
		])
	})

	test('chaque nouvelle étape reçoit le focus sur son titre', async () => {
		const b = bench()
		await b.monter()
		await fillIdentity()
		await next('Ta zone')
		expect(jsdomWindow.w.document.activeElement?.id).toBe('accueil-titre-etape')
	})

	test('seules les étapes 4 et 5 ont un « Plus tard » ; la première n’a pas de « Précédent »', async () => {
		const buttons = () => [...jsdomWindow.w.document.querySelectorAll('button')].map(b => b.textContent)
		const first = bench()
		await first.monter()
		expect(buttons()).not.toContain('Précédent')
		expect(buttons()).not.toContain('Plus tard')
		const photo = bench({ position: 3, done: doneUntil(2) })
		await photo.monter()
		expect(buttons()).toContain('Précédent')
		expect(buttons()).not.toContain('Plus tard')
		const contact = bench({ position: 4, done: doneUntil(3) })
		await contact.monter()
		expect(buttons()).toContain('Précédent')
		expect(buttons()).toContain('Plus tard')
	})
})

describe('« Plus tard » : les étapes 4 et 5 ne bloquent rien', () => {
	test('l’étape 4 remise à plus tard ouvre la 5 sans rien enregistrer ; l’étape 5, la page de fin', async () => {
		const b = bench({ position: 4, done: doneUntil(3) })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Plus tard'))
		expect(stepTitle()).toBe('Ta prestation phare')
		expect(b.journal.networks).toEqual([])
		expect(b.journal.contacts).toEqual([])
		await jsdomWindow.cliquer(jsdomWindow.bouton('Plus tard'))
		expect(b.journal.navigations).toEqual([END])
		expect(b.journal.services).toEqual([])
	})
})

describe('RG-07 : un serveur lent ne produit pas de fausse arrivée', () => {
	test('pendant l’attente de la dernière étape : « Enregistrement… », pas de page de fin ; après la réponse, la page de fin', async () => {
		let open: () => void = () => {}
		const waiting = new Promise<void>(resolve => {
			open = resolve
		})
		const b = bench({
			position: 5,
			done: doneUntil(4),
			actions: {
				saveServices: async list => {
					await waiting
					return { ok: true, valeurs: { lignes: list.lignes.map(row => ({ id: 'n', valeurs: row.valeurs })) } }
				},
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Essai'))
		await jsdomWindow.saisir(field('Prix'), '60')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))

		expect(pageText()).toContain('Enregistrement…')
		expect(b.journal.navigations).toEqual([])
		expect((jsdomWindow.bouton('Enregistrement…') as HTMLButtonElement).disabled).toBe(true)

		open()
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.navigations).toEqual([END])
	})

	test('le serveur dit « non » à la photo : on reste, message, le fichier envoyé est supprimé, le choix reste', async () => {
		const b = bench({
			position: 3,
			done: doneUntil(2),
			actions: { savePhoto: async () => ({ ok: false, message: FAILURE_MESSAGE }) },
		})
		await b.monter()
		await pickPhoto()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(b.journal.navigations).toEqual([])
		expect(stepTitle()).toBe('Ta photo principale')
		expect(b.journal.removed).toEqual([9])
		expect(jsdomWindow.w.document.querySelector('img[alt="Aperçu de la photo choisie"]')).not.toBeNull()
	})

	test('la réponse se perd : on reste sur l’étape', async () => {
		const b = bench({
			position: 5,
			done: doneUntil(4),
			actions: {
				saveServices: async () => {
					throw new Error('Failed to fetch')
				},
			},
		})
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Soirée'))
		await jsdomWindow.saisir(field('Prix'), '90')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(b.journal.navigations).toEqual([])
		expect(field('Prix').value).toBe('90')
	})
})

describe('un échec reste sur l’étape et garde la saisie', () => {
	test('identité refusée : on reste à l’étape 1, les champs gardent leur texte, le message est dit', async () => {
		const b = bench({ actions: { saveIdentity: async () => ({ ok: false, message: FAILURE_MESSAGE }) } })
		await b.monter()
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(stepTitle()).toBe('Ta spécialité')
		expect(field('Prénom').value).toBe('Léa')
		expect(field('Mariage').checked).toBe(true)
	})

	test('l’appel qui lève compte comme un échec', async () => {
		const b = bench({
			actions: {
				saveIdentity: async () => {
					throw new Error('Failed to fetch')
				},
			},
		})
		await b.monter()
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(stepTitle()).toBe('Ta spécialité')
	})

	test('session expirée : on reste, la saisie est gardée, le lien pour se reconnecter est proposé', async () => {
		const b = bench({
			actions: { saveIdentity: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) },
		})
		await b.monter()
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGE_SESSION))
		expect(stepTitle()).toBe('Ta spécialité')
		expect(field('Prénom').value).toBe('Léa')
		expect(jsdomWindow.w.document.querySelector('[role="alert"] a')?.getAttribute('href')).toContain('session-expiree')
	})

	test('zone refusée : on reste à l’étape 2 avec la commune choisie', async () => {
		const b = bench({
			position: 2,
			done: doneUntil(1),
			actions: { savePlace: async () => ({ ok: false, message: FAILURE_MESSAGE }) },
		})
		await b.monter()
		await pickCity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(stepTitle()).toBe('Ta zone')
		expect((jsdomWindow.w.document.querySelector('input[role="combobox"]') as HTMLInputElement).value).toContain(
			'Lille'
		)
	})

	test('sans commune choisie dans la liste, rien n’est envoyé et le champ le dit', async () => {
		const b = bench({ position: 2, done: doneUntil(1) })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => pageText().includes('Choisis ta commune'))
		expect(b.journal.place).toEqual([])
	})

	test('une identité sans spécialité n’est pas envoyée, le message est sous le champ', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.saisir(field('Prénom'), 'Léa')
		await jsdomWindow.saisir(field('Nom'), 'Fictive')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => pageText().includes('Indique ta spécialité.'))
		expect(b.journal.identity).toEqual([])
	})

	test('double clic pendant l’envoi : une seule requête', async () => {
		let open: () => void = () => {}
		const door = new Promise<void>(resolve => {
			open = resolve
		})
		let calls = 0
		const b = bench({
			actions: {
				saveIdentity: async values => {
					calls++
					await door
					return { ok: true, valeurs: values }
				},
			},
		})
		await b.monter()
		await fillIdentity()
		const button = jsdomWindow.bouton('Suivant')
		await jsdomWindow.cliquer(button)
		await jsdomWindow.cliquer(button)
		open()
		await jsdomWindow.attendre(() => stepTitle() === 'Ta zone')
		expect(calls).toBe(1)
	})
})

describe('l’étape « te joindre » : ce qui est enregistré reste', () => {
	test('Instagram seul : les autres réseaux importés sont renvoyés tels quels, les coordonnées ne sont pas envoyées', async () => {
		const b = bench({
			position: 4,
			done: { 1: true, 2: true, 3: true, 4: false, 5: true },
			profile: {
				networks: {
					instagram: '',
					facebook: 'https://www.facebook.com/studio.fictif',
					youtube: '',
					linkedin: '',
					siteWeb: '',
				},
			},
		})
		await b.monter()
		await jsdomWindow.saisir(field('Instagram'), '@studio.fictif')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.networks).toEqual([
			{
				instagram: 'https://www.instagram.com/studio.fictif',
				facebook: 'https://www.facebook.com/studio.fictif',
				youtube: '',
				linkedin: '',
				siteWeb: '',
			},
		])
		expect(b.journal.contacts).toEqual([])
	})

	test('un téléphone avec la case cochée : les coordonnées partent avec le choix, les réseaux non', async () => {
		const b = bench({ position: 4, done: doneUntil(3) })
		await b.monter()
		await jsdomWindow.saisir(field('Téléphone'), '06 12 34 56 78')
		expect(field(/Afficher mon téléphone/).checked).toBe(false)
		await jsdomWindow.cliquer(field(/Afficher mon téléphone/))
		await next('Ta prestation phare')
		expect(b.journal.contacts).toEqual([{ telephone: '06 12 34 56 78', email: '', contactPublic: true }])
		expect(b.journal.networks).toEqual([])
	})

	test('rien de tapé : rien n’est envoyé et l’étape dit quoi faire', async () => {
		const b = bench({ position: 4, done: doneUntil(3) })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes('Plus tard'))
		expect(b.journal.networks).toEqual([])
		expect(b.journal.contacts).toEqual([])
		expect(stepTitle()).toBe('Comment te joindre')
	})

	test('un lien d’un autre site dans Instagram : le message est sous le champ, rien n’est envoyé', async () => {
		const b = bench({ position: 4, done: doneUntil(3) })
		await b.monter()
		await jsdomWindow.saisir(field('Instagram'), 'https://www.facebook.com/studio.fictif')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => pageText().includes('n’est pas celle'))
		expect(b.journal.networks).toEqual([])
	})
})

describe('l’étape « prestation phare » : une prestation, un prix, rien d’effacé', () => {
	test('un modèle remplit le nom et met le curseur sur le prix', async () => {
		const b = bench({ position: 5, done: doneUntil(4) })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Soirée'))
		expect(field('Nom de la prestation').value).toBe('Maquillage de soirée')
		expect(jsdomWindow.w.document.activeElement?.id).toBe('accueil-prestation-prix')
	})

	test('sans montant lu, rien n’est envoyé et le prix le dit ; « sur devis » n’est pas un montant', async () => {
		const b = bench({ position: 5, done: doneUntil(4) })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Essai'))
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => pageText().includes('Indique un montant'))
		await jsdomWindow.saisir(field('Prix'), 'sur devis')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		expect(b.journal.services).toEqual([])
		expect(pageText()).toContain('Indique un montant')
	})

	test('sans nom, rien n’est envoyé et le nom le dit', async () => {
		const b = bench({ position: 5, done: doneUntil(4) })
		await b.monter()
		await jsdomWindow.saisir(field('Prix'), '80')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => pageText().includes('Le nom de la prestation est requis.'))
		expect(b.journal.services).toEqual([])
	})

	test('les prestations qu’elle a déjà restent dans la liste envoyée, avec leur identifiant', async () => {
		const old = { id: 'a1', valeurs: { name: 'Cours d’auto-maquillage', description: '', price: '' } }
		const b = bench({ position: 5, done: doneUntil(4), profile: { offers: [old] } })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Mariée'))
		await jsdomWindow.saisir(field('Prix'), 'à partir de 150')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.services).toEqual([
			{
				lignes: [
					{ id: 'a1', valeurs: old.valeurs },
					{ valeurs: { name: 'Maquillage de la mariée', description: '', price: 'à partir de 150' } },
				],
			},
		])
	})

	test('le repère de prix : la médiane du modèle choisi, seulement quand le serveur en donne une', async () => {
		const b = bench({
			position: 5,
			done: doneUntil(4),
			profile: { medians: { Mariée: 140, Soirée: null, Essai: null } },
		})
		await b.monter()
		expect(jsdomWindow.w.document.querySelector('[data-testid="repere-prix"]')).toBeNull()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Mariée'))
		expect(jsdomWindow.w.document.querySelector('[data-testid="repere-prix"]')?.textContent).toContain('140')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Soirée'))
		expect(jsdomWindow.w.document.querySelector('[data-testid="repere-prix"]')).toBeNull()
	})
})

describe('« Comment as-tu connu My Makeup ? » : facultative, jamais envoyée', () => {
	test('choisir une réponse ne change pas ce que l’identité envoie ; elle s’efface', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById('accueil-origine-ia') as HTMLElement)
		expect((jsdomWindow.w.document.getElementById('accueil-origine-ia') as HTMLInputElement).checked).toBe(true)
		await fillIdentity()
		await next('Ta zone')
		expect(Object.keys(b.journal.identity[0] as object).sort()).toEqual([
			'nom',
			'nomArtiste',
			'prenom',
			'specialtyBullets',
			'specialtyOther',
		])
		expect(JSON.stringify(b.journal)).not.toContain('"ia"')
	})

	test('« Effacer ma réponse » la retire', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById('accueil-origine-ecole') as HTMLElement)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Effacer ma réponse'))
		expect((jsdomWindow.w.document.getElementById('accueil-origine-ecole') as HTMLInputElement).checked).toBe(false)
	})
})
