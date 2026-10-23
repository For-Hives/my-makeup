import { describe, expect, test } from 'bun:test'
import type { IdentityUpload } from '@/components/dashboard/IdentityEditor'
import type { LocationUpload } from '@/components/dashboard/LocationEditor'
import { Onboarding } from '@/components/dashboard/onboarding/Onboarding'
import type { OnboardingPhotoUpload } from '@/components/dashboard/onboarding/PhotoStep'
import type { IdentityValues } from '@/lib/dashboard/identity'
import type { LocationValues } from '@/lib/dashboard/location'
import { FAILURE_MESSAGE, MESSAGE_SESSION } from '@/lib/dashboard/result'
import type { OnboardingPhotoValues } from '@/lib/dashboard/save-onboarding'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

/**
 * The onboarding (ticket 140; plan 02 E02, RG-07): the next step opens only when the server said it
 * stored the step, a failure stays on the step with the typing, and she arrives in her space only when
 * the server reports the three steps done. The server actions and the browser work are fakes.
 */

const jsdomWindow = openWindow()

const EMPTY_IDENTITY: IdentityValues = { prenom: '', nom: '', nomArtiste: '', specialite: '' }
const EMPTY_ZONE: LocationValues = {
	kind: 'city',
	codeInsee: '',
	libelle: '',
	countries: [],
	town: '',
	rayonKm: null,
	aDomicile: false,
}
const ZONE_MADE: LocationValues = { ...EMPTY_ZONE, codeInsee: '59350', libelle: 'Lille (59)' }
const REDUCED = new File(['petit'], 'photo.webp', { type: 'image/webp' })

interface Options {
	etape?: 1 | 2 | 3
	identite?: IdentityValues
	localisation?: LocationValues
	envoyerIdentite?: IdentityUpload
	envoyerLocalisation?: LocationUpload
	envoyerPhoto?: OnboardingPhotoUpload
}

function bench(options: Options = {}) {
	const log = {
		identite: [] as unknown[],
		localisation: [] as unknown[],
		photo: [] as unknown[],
		televerses: 0,
		supprimes: [] as unknown[],
		navigations: [] as string[],
	}
	const sendIdentity: IdentityUpload =
		options.envoyerIdentite ??
		(async valeurs => {
			log.identite.push(valeurs)
			return { ok: true, valeurs }
		})
	const sendLocation: LocationUpload =
		options.envoyerLocalisation ??
		(async saisie => {
			log.localisation.push(saisie)
			return { ok: true, valeurs: { ...ZONE_MADE, rayonKm: saisie.rayonKm, aDomicile: saisie.aDomicile } }
		})
	const sendPhoto: OnboardingPhotoUpload =
		options.envoyerPhoto ??
		(async saisie => {
			log.photo.push(saisie)
			return { ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale, position: 'terminee' } }
		})
	return {
		journal: log,
		monter: () =>
			jsdomWindow.monter(
				<Onboarding
					etapeInitiale={options.etape ?? 1}
					identite={options.identite ?? EMPTY_IDENTITY}
					localisation={options.localisation ?? EMPTY_ZONE}
					envoyerIdentite={sendIdentity}
					envoyerLocalisation={sendLocation}
					chercherCommunes={async () => ({
						ok: true,
						communes: [{ codeInsee: '59350', libelle: 'Lille (59)', nom: 'Lille' }],
					})}
					envoyerPhoto={sendPhoto}
					preparer={async () => ({ ok: true, fichier: REDUCED, largeur: 800, hauteur: 600, taille: 5 })}
					televerser={async () => {
						log.televerses++
						return { ok: true, id: 9 }
					}}
					supprimer={async id => {
						log.supprimes.push(id)
					}}
					naviguer={url => {
						log.navigations.push(url)
					}}
				/>
			),
	}
}

const pageText = () => jsdomWindow.w.document.body.textContent ?? ''
const stepTitle = () => jsdomWindow.w.document.getElementById('accueil-titre-etape')?.textContent
const alerts = () => [...jsdomWindow.w.document.querySelectorAll('[role="alert"]')].map(a => a.textContent).join('|')
const field = (nom: string) => jsdomWindow.champ(nom) as HTMLInputElement

async function fillIdentity() {
	await jsdomWindow.saisir(field('Prénom'), 'Léa')
	await jsdomWindow.saisir(field('Nom'), 'Fictive')
	await jsdomWindow.saisir(field('Spécialité'), 'Mariée')
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
	await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Terminer') as HTMLButtonElement).disabled)
}

describe('le parcours : une étape à la fois, chacune enregistrée avant la suivante', () => {
	test('les trois étapes passent, l’arrivée dans l’espace ne vient qu’après la réponse du serveur à la photo', async () => {
		const b = bench()
		await b.monter()
		expect(stepTitle()).toBe('Ton identité')
		expect(b.journal.navigations).toEqual([])

		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => stepTitle() === 'Ta zone')
		expect(b.journal.identite).toEqual([{ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }])

		await pickCity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => stepTitle() === 'Ta photo principale')
		expect(b.journal.localisation).toEqual([{ kind: 'city', codeInsee: '59350', rayonKm: null, aDomicile: false }])
		expect(b.journal.navigations).toEqual([])

		await pickPhoto()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.photo).toEqual([{ photoPrincipale: 9 }])
		expect(b.journal.navigations).toEqual(['/auth/profil'])
	})

	test('la reprise : le serveur dit étape 2, la page s’ouvre sur la zone avec l’identité déjà enregistrée', async () => {
		const b = bench({ etape: 2, identite: { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' } })
		await b.monter()
		expect(stepTitle()).toBe('Ta zone')
		const current = jsdomWindow.w.document.querySelector('[aria-current="step"]')
		expect(current?.textContent).toContain('Zone')
		// « Précédent » rouvre l'identité avec ses valeurs.
		await jsdomWindow.cliquer(jsdomWindow.bouton('Précédent'))
		expect(stepTitle()).toBe('Ton identité')
		expect(field('Prénom').value).toBe('Léa')
	})

	test('chaque nouvelle étape reçoit le focus sur son titre', async () => {
		const b = bench()
		await b.monter()
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => stepTitle() === 'Ta zone')
		expect(jsdomWindow.w.document.activeElement?.id).toBe('accueil-titre-etape')
	})
})

describe('RG-07 : un serveur lent ne produit pas de fausse arrivée', () => {
	test('pendant l’attente de la photo : « Enregistrement… », aucune arrivée ; après la réponse, l’arrivée dans l’espace', async () => {
		let open: (v: OnboardingPhotoValues) => void = () => {}
		const waiting = new Promise<OnboardingPhotoValues>(resolve => {
			open = resolve
		})
		const b = bench({
			etape: 3,
			envoyerPhoto: async () => ({ ok: true, valeurs: await waiting }),
		})
		await b.monter()
		await pickPhoto()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))

		expect(pageText()).toContain('Enregistrement…')
		expect(b.journal.navigations).toEqual([])
		expect((jsdomWindow.bouton('Enregistrement…') as HTMLButtonElement).disabled).toBe(true)

		open({ photoPrincipale: 9, position: 'terminee' })
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.navigations).toEqual(['/auth/profil'])
	})

	test('le serveur dit « non » à la photo : pas d’arrivée, message, le fichier envoyé est supprimé, le choix reste', async () => {
		const b = bench({ etape: 3, envoyerPhoto: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await pickPhoto()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(b.journal.navigations).toEqual([])
		expect(stepTitle()).toBe('Ta photo principale')
		expect(b.journal.supprimes).toEqual([9])
		expect(jsdomWindow.w.document.querySelector('img[alt="Aperçu de la photo choisie"]')).not.toBeNull()
	})

	test('la réponse se perd : pas d’arrivée', async () => {
		const b = bench({
			etape: 3,
			envoyerPhoto: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await b.monter()
		await pickPhoto()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => alerts().includes('peut-être enregistrées'))
		expect(b.journal.navigations).toEqual([])
	})

	test('la photo est enregistrée mais le serveur voit une étape manquante : la page est relue, pas d’arrivée dans l’espace', async () => {
		const b = bench({
			etape: 3,
			envoyerPhoto: async saisie => ({ ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale, position: 2 } }),
		})
		await b.monter()
		await pickPhoto()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.navigations).toEqual(['/auth/init-account'])
	})
})

describe('un échec reste sur l’étape et garde la saisie', () => {
	test('identité refusée : on reste à l’étape 1, les champs gardent leur texte, le message est dit', async () => {
		const b = bench({ envoyerIdentite: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(stepTitle()).toBe('Ton identité')
		expect(field('Prénom').value).toBe('Léa')
		expect(field('Spécialité').value).toBe('Mariée')
	})

	test('l’appel qui lève compte comme un échec', async () => {
		const b = bench({
			envoyerIdentite: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await b.monter()
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(FAILURE_MESSAGE))
		expect(stepTitle()).toBe('Ton identité')
	})

	test('session expirée : on reste, la saisie est gardée, le lien pour se reconnecter est proposé', async () => {
		const b = bench({ envoyerIdentite: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) })
		await b.monter()
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => alerts().includes(MESSAGE_SESSION))
		expect(stepTitle()).toBe('Ton identité')
		expect(field('Prénom').value).toBe('Léa')
		expect(jsdomWindow.w.document.querySelector('[role="alert"] a')?.getAttribute('href')).toContain('session-expiree')
	})

	test('zone refusée : on reste à l’étape 2 avec la commune choisie', async () => {
		const b = bench({ etape: 2, envoyerLocalisation: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
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
		const b = bench({ etape: 2 })
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => pageText().includes('Choisis ta commune'))
		expect(b.journal.localisation).toEqual([])
	})

	test('une identité sans spécialité n’est pas envoyée, le message est sous le champ', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.saisir(field('Prénom'), 'Léa')
		await jsdomWindow.saisir(field('Nom'), 'Fictive')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => pageText().includes('Indique ta spécialité.'))
		expect(b.journal.identite).toEqual([])
	})

	test('double clic pendant l’envoi : une seule requête', async () => {
		let open: () => void = () => {}
		const door = new Promise<void>(resolve => {
			open = resolve
		})
		let calls = 0
		const b = bench({
			envoyerIdentite: async valeurs => {
				calls++
				await door
				return { ok: true, valeurs }
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
		expect(b.journal.identite.length).toBe(0)
	})
})

describe('« Comment as-tu connu My Makeup ? » : facultative, jamais envoyée', () => {
	test('choisir une réponse ne change pas ce que l’identité envoie ; elle s’efface', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById('accueil-origine-ia') as HTMLElement)
		expect((jsdomWindow.w.document.getElementById('accueil-origine-ia') as HTMLInputElement).checked).toBe(true)
		await fillIdentity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => stepTitle() === 'Ta zone')
		expect(Object.keys(b.journal.identite[0] as object).sort()).toEqual(['nom', 'nomArtiste', 'prenom', 'specialite'])
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
