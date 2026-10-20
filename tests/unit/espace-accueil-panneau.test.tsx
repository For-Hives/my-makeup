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

const fenetre = openWindow()

const VIDE_IDENTITE: IdentityValues = { prenom: '', nom: '', nomArtiste: '', specialite: '' }
const VIDE_ZONE: LocationValues = { codeInsee: '', libelle: '', rayonKm: null, aDomicile: false }
const ZONE_FAITE: LocationValues = {
	codeInsee: '59350',
	libelle: 'Lille (59)',
	rayonKm: null,
	aDomicile: false,
}
const REDUITE = new File(['petit'], 'photo.webp', { type: 'image/webp' })

interface Options {
	etape?: 1 | 2 | 3
	identite?: IdentityValues
	localisation?: LocationValues
	envoyerIdentite?: IdentityUpload
	envoyerLocalisation?: LocationUpload
	envoyerPhoto?: OnboardingPhotoUpload
}

function banc(options: Options = {}) {
	const journal = {
		identite: [] as unknown[],
		localisation: [] as unknown[],
		photo: [] as unknown[],
		televerses: 0,
		supprimes: [] as unknown[],
		navigations: [] as string[],
	}
	const envoyerIdentite: IdentityUpload =
		options.envoyerIdentite ??
		(async valeurs => {
			journal.identite.push(valeurs)
			return { ok: true, valeurs }
		})
	const envoyerLocalisation: LocationUpload =
		options.envoyerLocalisation ??
		(async saisie => {
			journal.localisation.push(saisie)
			return { ok: true, valeurs: { ...ZONE_FAITE, rayonKm: saisie.rayonKm, aDomicile: saisie.aDomicile } }
		})
	const envoyerPhoto: OnboardingPhotoUpload =
		options.envoyerPhoto ??
		(async saisie => {
			journal.photo.push(saisie)
			return { ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale, position: 'terminee' } }
		})
	return {
		journal,
		monter: () =>
			fenetre.monter(
				<Onboarding
					etapeInitiale={options.etape ?? 1}
					identite={options.identite ?? VIDE_IDENTITE}
					localisation={options.localisation ?? VIDE_ZONE}
					envoyerIdentite={envoyerIdentite}
					envoyerLocalisation={envoyerLocalisation}
					chercherCommunes={async () => ({ ok: true, communes: [{ codeInsee: '59350', libelle: 'Lille (59)' }] })}
					envoyerPhoto={envoyerPhoto}
					preparer={async () => ({ ok: true, fichier: REDUITE, largeur: 800, hauteur: 600, taille: 5 })}
					televerser={async () => {
						journal.televerses++
						return { ok: true, id: 9 }
					}}
					supprimer={async id => {
						journal.supprimes.push(id)
					}}
					naviguer={url => {
						journal.navigations.push(url)
					}}
				/>
			),
	}
}

const texteDePage = () => fenetre.w.document.body.textContent ?? ''
const titreDEtape = () => fenetre.w.document.getElementById('accueil-titre-etape')?.textContent
const alertes = () => [...fenetre.w.document.querySelectorAll('[role="alert"]')].map(a => a.textContent).join('|')
const champ = (nom: string) => fenetre.champ(nom) as HTMLInputElement

async function remplirIdentite() {
	await fenetre.saisir(champ('Prénom'), 'Léa')
	await fenetre.saisir(champ('Nom'), 'Fictive')
	await fenetre.saisir(champ('Spécialité'), 'Mariée')
}

async function choisirLaCommune() {
	const saisie = fenetre.w.document.querySelector('input[role="combobox"]') as HTMLInputElement
	await fenetre.saisir(saisie, 'Lill')
	const proposition = await fenetre.attendre(() => fenetre.w.document.querySelector('[role="option"]'), { max: 3000 })
	await fenetre.cliquer(proposition)
}

const choisirLaPhoto = async () => {
	await pickFiles(fenetre, fenetre.champ(/photo/i) as HTMLInputElement, [REDUITE])
	await fenetre.attendre(() => !(fenetre.bouton('Terminer') as HTMLButtonElement).disabled)
}

describe('le parcours : une étape à la fois, chacune enregistrée avant la suivante', () => {
	test('les trois étapes passent, l’arrivée dans l’espace ne vient qu’après la réponse du serveur à la photo', async () => {
		const b = banc()
		await b.monter()
		expect(titreDEtape()).toBe('Ton identité')
		expect(b.journal.navigations).toEqual([])

		await remplirIdentite()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => titreDEtape() === 'Ta zone')
		expect(b.journal.identite).toEqual([{ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }])

		await choisirLaCommune()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => titreDEtape() === 'Ta photo principale')
		expect(b.journal.localisation).toEqual([{ codeInsee: '59350', rayonKm: null, aDomicile: false }])
		expect(b.journal.navigations).toEqual([])

		await choisirLaPhoto()
		await fenetre.cliquer(fenetre.bouton('Terminer'))
		await fenetre.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.photo).toEqual([{ photoPrincipale: 9 }])
		expect(b.journal.navigations).toEqual(['/auth/profil'])
	})

	test('la reprise : le serveur dit étape 2, la page s’ouvre sur la zone avec l’identité déjà enregistrée', async () => {
		const b = banc({ etape: 2, identite: { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' } })
		await b.monter()
		expect(titreDEtape()).toBe('Ta zone')
		const courante = fenetre.w.document.querySelector('[aria-current="step"]')
		expect(courante?.textContent).toContain('Zone')
		// « Précédent » rouvre l'identité avec ses valeurs.
		await fenetre.cliquer(fenetre.bouton('Précédent'))
		expect(titreDEtape()).toBe('Ton identité')
		expect(champ('Prénom').value).toBe('Léa')
	})

	test('chaque nouvelle étape reçoit le focus sur son titre', async () => {
		const b = banc()
		await b.monter()
		await remplirIdentite()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => titreDEtape() === 'Ta zone')
		expect(fenetre.w.document.activeElement?.id).toBe('accueil-titre-etape')
	})
})

describe('RG-07 : un serveur lent ne produit pas de fausse arrivée', () => {
	test('pendant l’attente de la photo : « Enregistrement… », aucune arrivée ; après la réponse, l’arrivée dans l’espace', async () => {
		let ouvrir: (v: OnboardingPhotoValues) => void = () => {}
		const attente = new Promise<OnboardingPhotoValues>(resolve => {
			ouvrir = resolve
		})
		const b = banc({
			etape: 3,
			envoyerPhoto: async () => ({ ok: true, valeurs: await attente }),
		})
		await b.monter()
		await choisirLaPhoto()
		await fenetre.cliquer(fenetre.bouton('Terminer'))

		expect(texteDePage()).toContain('Enregistrement…')
		expect(b.journal.navigations).toEqual([])
		expect((fenetre.bouton('Enregistrement…') as HTMLButtonElement).disabled).toBe(true)

		ouvrir({ photoPrincipale: 9, position: 'terminee' })
		await fenetre.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.navigations).toEqual(['/auth/profil'])
	})

	test('le serveur dit « non » à la photo : pas d’arrivée, message, le fichier envoyé est supprimé, le choix reste', async () => {
		const b = banc({ etape: 3, envoyerPhoto: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await choisirLaPhoto()
		await fenetre.cliquer(fenetre.bouton('Terminer'))
		await fenetre.attendre(() => alertes().includes(FAILURE_MESSAGE))
		expect(b.journal.navigations).toEqual([])
		expect(titreDEtape()).toBe('Ta photo principale')
		expect(b.journal.supprimes).toEqual([9])
		expect(fenetre.w.document.querySelector('img[alt="Aperçu de la photo choisie"]')).not.toBeNull()
	})

	test('la réponse se perd : pas d’arrivée', async () => {
		const b = banc({
			etape: 3,
			envoyerPhoto: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await b.monter()
		await choisirLaPhoto()
		await fenetre.cliquer(fenetre.bouton('Terminer'))
		await fenetre.attendre(() => alertes().includes('peut-être enregistrées'))
		expect(b.journal.navigations).toEqual([])
	})

	test('la photo est enregistrée mais le serveur voit une étape manquante : la page est relue, pas d’arrivée dans l’espace', async () => {
		const b = banc({
			etape: 3,
			envoyerPhoto: async saisie => ({ ok: true, valeurs: { photoPrincipale: saisie.photoPrincipale, position: 2 } }),
		})
		await b.monter()
		await choisirLaPhoto()
		await fenetre.cliquer(fenetre.bouton('Terminer'))
		await fenetre.attendre(() => b.journal.navigations.length === 1)
		expect(b.journal.navigations).toEqual(['/auth/init-account'])
	})
})

describe('un échec reste sur l’étape et garde la saisie', () => {
	test('identité refusée : on reste à l’étape 1, les champs gardent leur texte, le message est dit', async () => {
		const b = banc({ envoyerIdentite: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await remplirIdentite()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => alertes().includes(FAILURE_MESSAGE))
		expect(titreDEtape()).toBe('Ton identité')
		expect(champ('Prénom').value).toBe('Léa')
		expect(champ('Spécialité').value).toBe('Mariée')
	})

	test('l’appel qui lève compte comme un échec', async () => {
		const b = banc({
			envoyerIdentite: async () => {
				throw new Error('Failed to fetch')
			},
		})
		await b.monter()
		await remplirIdentite()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => alertes().includes(FAILURE_MESSAGE))
		expect(titreDEtape()).toBe('Ton identité')
	})

	test('session expirée : on reste, la saisie est gardée, le lien pour se reconnecter est proposé', async () => {
		const b = banc({ envoyerIdentite: async () => ({ ok: false, message: MESSAGE_SESSION, session: 'expiree' }) })
		await b.monter()
		await remplirIdentite()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => alertes().includes(MESSAGE_SESSION))
		expect(titreDEtape()).toBe('Ton identité')
		expect(champ('Prénom').value).toBe('Léa')
		expect(fenetre.w.document.querySelector('[role="alert"] a')?.getAttribute('href')).toContain('session-expiree')
	})

	test('zone refusée : on reste à l’étape 2 avec la commune choisie', async () => {
		const b = banc({ etape: 2, envoyerLocalisation: async () => ({ ok: false, message: FAILURE_MESSAGE }) })
		await b.monter()
		await choisirLaCommune()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => alertes().includes(FAILURE_MESSAGE))
		expect(titreDEtape()).toBe('Ta zone')
		expect((fenetre.w.document.querySelector('input[role="combobox"]') as HTMLInputElement).value).toContain('Lille')
	})

	test('sans commune choisie dans la liste, rien n’est envoyé et le champ le dit', async () => {
		const b = banc({ etape: 2 })
		await b.monter()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => texteDePage().includes('Choisis ta commune'))
		expect(b.journal.localisation).toEqual([])
	})

	test('une identité sans spécialité n’est pas envoyée, le message est sous le champ', async () => {
		const b = banc()
		await b.monter()
		await fenetre.saisir(champ('Prénom'), 'Léa')
		await fenetre.saisir(champ('Nom'), 'Fictive')
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => texteDePage().includes('Indique ta spécialité.'))
		expect(b.journal.identite).toEqual([])
	})

	test('double clic pendant l’envoi : une seule requête', async () => {
		let ouvrir: () => void = () => {}
		const porte = new Promise<void>(resolve => {
			ouvrir = resolve
		})
		let appels = 0
		const b = banc({
			envoyerIdentite: async valeurs => {
				appels++
				await porte
				return { ok: true, valeurs }
			},
		})
		await b.monter()
		await remplirIdentite()
		const bouton = fenetre.bouton('Suivant')
		await fenetre.cliquer(bouton)
		await fenetre.cliquer(bouton)
		ouvrir()
		await fenetre.attendre(() => titreDEtape() === 'Ta zone')
		expect(appels).toBe(1)
		expect(b.journal.identite.length).toBe(0)
	})
})

describe('« Comment as-tu connu My Makeup ? » : facultative, jamais envoyée', () => {
	test('choisir une réponse ne change pas ce que l’identité envoie ; elle s’efface', async () => {
		const b = banc()
		await b.monter()
		await fenetre.cliquer(fenetre.w.document.getElementById('accueil-origine-ia') as HTMLElement)
		expect((fenetre.w.document.getElementById('accueil-origine-ia') as HTMLInputElement).checked).toBe(true)
		await remplirIdentite()
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => titreDEtape() === 'Ta zone')
		expect(Object.keys(b.journal.identite[0] as object).sort()).toEqual(['nom', 'nomArtiste', 'prenom', 'specialite'])
		expect(JSON.stringify(b.journal)).not.toContain('"ia"')
	})

	test('« Effacer ma réponse » la retire', async () => {
		const b = banc()
		await b.monter()
		await fenetre.cliquer(fenetre.w.document.getElementById('accueil-origine-ecole') as HTMLElement)
		await fenetre.cliquer(fenetre.bouton('Effacer ma réponse'))
		expect((fenetre.w.document.getElementById('accueil-origine-ecole') as HTMLInputElement).checked).toBe(false)
	})
})
