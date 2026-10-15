import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Admins } from '@/collections/Admins'
import { Articles } from '@/collections/Articles'
import { AuthEvenements } from '@/collections/AuthEvenements'
import { Demandes } from '@/collections/Demandes'
import { Media } from '@/collections/Media'
import { Profils } from '@/collections/Profils'
import { Pros } from '@/collections/Pros'
import { Talents } from '@/collections/Talents'
import { Accueil } from '@/components/espace/accueil/Accueil'
import { donneesDEvenement, ORIGINES_DECLAREES } from '@/lib/analytics/events'
import type { Suivre } from '@/lib/analytics/track'
import { schemaDeLIdentiteDAccueilStrict } from '@/lib/espace/onboarding'
import { choisirDesFichiers } from '../outils/choisir-fichiers'
import { ouvrirFenetre } from '../outils/dom-react'

/**
 * Ticket 148: the onboarding sends its steps and the declared origin as events (plan 04 §3.3, events
 * 16 and 17), and stores nothing. `suivre` is given to the component, so the test sees exactly what
 * would leave; the server actions are fakes that keep what they receive.
 */
const fenetre = ouvrirFenetre()

type Envoi = { nom: string; proprietes: unknown }
function espion() {
	const envois: Envoi[] = []
	const suivre = ((nom: string, proprietes: unknown = {}) => {
		envois.push({ nom, proprietes })
		return true
	}) as unknown as Suivre
	return { envois, suivre }
}

const REDUITE = new File(['petit'], 'photo.webp', { type: 'image/webp' })
const ZONE = { codeInsee: '59350', libelle: 'Lille (59)', rayonKm: null, aDomicile: false }

function banc(options: { etape?: 1 | 2 | 3; photoEnCours?: 'terminee' | 2 } = {}) {
	const { envois, suivre } = espion()
	const recu = { identite: [] as unknown[], zone: [] as unknown[], photo: [] as unknown[] }
	return {
		envois,
		recu,
		monter: () =>
			fenetre.monter(
				<Accueil
					etapeInitiale={options.etape ?? 1}
					identite={{ prenom: '', nom: '', nomArtiste: '', specialite: '' }}
					localisation={{ codeInsee: '', libelle: '', rayonKm: null, aDomicile: false }}
					envoyerIdentite={async valeurs => {
						recu.identite.push(valeurs)
						return { ok: true, valeurs }
					}}
					envoyerLocalisation={async saisie => {
						recu.zone.push(saisie)
						return { ok: true, valeurs: { ...ZONE, rayonKm: saisie.rayonKm, aDomicile: saisie.aDomicile } }
					}}
					chercherCommunes={async () => ({ ok: true, communes: [{ codeInsee: '59350', libelle: 'Lille (59)' }] })}
					envoyerPhoto={async saisie => {
						recu.photo.push(saisie)
						return {
							ok: true,
							valeurs: { photoPrincipale: saisie.photoPrincipale, position: options.photoEnCours ?? 'terminee' },
						}
					}}
					preparer={async () => ({ ok: true, fichier: REDUITE, largeur: 800, hauteur: 600, taille: 5 })}
					televerser={async () => ({ ok: true, id: 9 })}
					supprimer={async () => {}}
					naviguer={() => {}}
					suivre={suivre}
				/>
			),
	}
}

const titre = () => fenetre.w.document.getElementById('accueil-titre-etape')?.textContent
const champ = (nom: string) => fenetre.champ(nom) as HTMLInputElement

async function identite(origine?: string) {
	await fenetre.saisir(champ('Prénom'), 'Léa')
	await fenetre.saisir(champ('Nom'), 'Fictive')
	await fenetre.saisir(champ('Spécialité'), 'Mariée')
	if (origine) await fenetre.cliquer(fenetre.w.document.getElementById(`accueil-origine-${origine}`) as HTMLElement)
	await fenetre.cliquer(fenetre.bouton('Suivant'))
	await fenetre.attendre(() => titre() === 'Ta zone')
}

async function zone() {
	const saisie = fenetre.w.document.querySelector('input[role="combobox"]') as HTMLInputElement
	await fenetre.saisir(saisie, 'Lill')
	await fenetre.cliquer(
		await fenetre.attendre(() => fenetre.w.document.querySelector('[role="option"]'), { max: 3000 })
	)
	await fenetre.cliquer(fenetre.bouton('Suivant'))
	await fenetre.attendre(() => titre() === 'Ta photo principale')
}

async function photo() {
	await choisirDesFichiers(fenetre, fenetre.champ(/photo/i) as HTMLInputElement, [REDUITE])
	await fenetre.attendre(() => !(fenetre.bouton('Terminer') as HTMLButtonElement).disabled)
	await fenetre.cliquer(fenetre.bouton('Terminer'))
}

describe('une émission par étape franchie, valeurs fermées', () => {
	test('identité, zone, photo puis terminé, chacune une fois, dans l’ordre', async () => {
		const b = banc()
		await b.monter()
		expect(b.envois).toEqual([])
		await identite()
		expect(b.envois).toEqual([{ nom: 'onboarding_step', proprietes: { step: 'identite' } }])
		await zone()
		await photo()
		await fenetre.attendre(() => b.envois.length === 4)
		expect(b.envois).toEqual([
			{ nom: 'onboarding_step', proprietes: { step: 'identite' } },
			{ nom: 'onboarding_step', proprietes: { step: 'zone' } },
			{ nom: 'onboarding_step', proprietes: { step: 'photo' } },
			{ nom: 'onboarding_step', proprietes: { step: 'termine' } },
		])
	})

	test('un échec du serveur n’émet rien', async () => {
		const { envois, suivre } = espion()
		await fenetre.monter(
			<Accueil
				etapeInitiale={1}
				identite={{ prenom: '', nom: '', nomArtiste: '', specialite: '' }}
				localisation={{ codeInsee: '', libelle: '', rayonKm: null, aDomicile: false }}
				envoyerIdentite={async () => ({ ok: false, message: 'Échec.' })}
				envoyerLocalisation={async () => ({ ok: false, message: 'Échec.' })}
				chercherCommunes={async () => ({ ok: true, communes: [] })}
				envoyerPhoto={async () => ({ ok: false, message: 'Échec.' })}
				suivre={suivre}
			/>
		)
		await fenetre.saisir(champ('Prénom'), 'Léa')
		await fenetre.saisir(champ('Nom'), 'Fictive')
		await fenetre.saisir(champ('Spécialité'), 'Mariée')
		await fenetre.cliquer(fenetre.w.document.getElementById('accueil-origine-ia') as HTMLElement)
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() =>
			(fenetre.w.document.querySelector('[role="alert"]')?.textContent ?? '').includes('Échec')
		)
		expect(titre()).toBe('Ton identité')
		expect(envois).toEqual([])
	})

	test('revenir à une étape faite et la repasser ne la recompte pas', async () => {
		const b = banc()
		await b.monter()
		await identite()
		await fenetre.cliquer(fenetre.bouton('Précédent'))
		await fenetre.attendre(() => titre() === 'Ton identité')
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => titre() === 'Ta zone')
		expect(b.envois.filter(e => e.nom === 'onboarding_step')).toHaveLength(1)
	})

	test('une photo enregistrée alors qu’il manque encore une étape : « photo », pas « termine »', async () => {
		const b = banc({ etape: 3, photoEnCours: 2 })
		await b.monter()
		await photo()
		await fenetre.attendre(() => b.envois.length >= 1)
		expect(b.envois).toEqual([{ nom: 'onboarding_step', proprietes: { step: 'photo' } }])
	})

	test('chaque étape et chaque origine passent le catalogue ; une valeur hors liste fait tomber l’événement', () => {
		for (const step of ['identite', 'zone', 'photo', 'termine'])
			expect(donneesDEvenement('onboarding_step', { step })).toEqual({ step })
		expect(donneesDEvenement('onboarding_step', { step: 'prenom' })).toBeNull()
		expect(donneesDEvenement('onboarding_step', { step: 'identite', pid: 3 })).toBeNull()
	})
})

describe('l’origine déclarée part une fois, seulement si elle est choisie', () => {
	test('choisie : un onboarding_source avec la valeur, une fois, après l’enregistrement de l’identité', async () => {
		const b = banc()
		await b.monter()
		await identite('ia')
		expect(b.envois).toEqual([
			{ nom: 'onboarding_step', proprietes: { step: 'identite' } },
			{ nom: 'onboarding_source', proprietes: { source: 'ia' } },
		])
		// Back to the identity and forward again: the answer is not counted twice.
		await fenetre.cliquer(fenetre.bouton('Précédent'))
		await fenetre.attendre(() => titre() === 'Ton identité')
		await fenetre.cliquer(fenetre.bouton('Suivant'))
		await fenetre.attendre(() => titre() === 'Ta zone')
		expect(b.envois.filter(e => e.nom === 'onboarding_source')).toHaveLength(1)
	})

	test('chacune des six réponses passe le catalogue', () => {
		for (const source of ORIGINES_DECLAREES)
			expect(donneesDEvenement('onboarding_source', { source })).toEqual({ source })
		expect(donneesDEvenement('onboarding_source', { source: 'tiktok' })).toBeNull()
	})

	test('non choisie : aucun onboarding_source', async () => {
		const b = banc()
		await b.monter()
		await identite()
		expect(b.envois.map(e => e.nom)).toEqual(['onboarding_step'])
	})

	test('choisie puis effacée : aucun onboarding_source', async () => {
		const b = banc()
		await b.monter()
		await fenetre.cliquer(fenetre.w.document.getElementById('accueil-origine-google') as HTMLElement)
		await fenetre.cliquer(fenetre.bouton('Effacer ma réponse'))
		await identite()
		expect(b.envois.map(e => e.nom)).toEqual(['onboarding_step'])
	})
})

describe('la réponse n’est stockée nulle part', () => {
	test('l’action qui enregistre l’identité ne reçoit que les quatre champs de l’identité', async () => {
		const b = banc()
		await b.monter()
		await identite('instagram')
		expect(b.recu.identite).toEqual([{ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }])
		await zone()
		await photo()
		await fenetre.attendre(() => b.recu.photo.length === 1)
		expect(JSON.stringify(b.recu)).not.toContain('instagram')
		expect(JSON.stringify(b.recu)).not.toMatch(/origine|source/i)
	})

	test('le schéma strict du serveur refuse un champ d’origine', () => {
		const base = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }
		expect(schemaDeLIdentiteDAccueilStrict.safeParse(base).success).toBe(true)
		expect(schemaDeLIdentiteDAccueilStrict.safeParse({ ...base, origine: 'ia' }).success).toBe(false)
	})

	test('aucun champ d’aucune collection n’est fait pour la recevoir', () => {
		const noms: string[] = []
		const parcourir = (champs: readonly unknown[] | undefined): void => {
			for (const champ of champs ?? []) {
				const c = champ as {
					name?: string
					fields?: unknown[]
					tabs?: { fields?: unknown[] }[]
					blocks?: { fields?: unknown[] }[]
				}
				if (c.name) noms.push(c.name)
				parcourir(c.fields)
				for (const t of c.tabs ?? []) parcourir(t.fields)
				for (const bloc of c.blocks ?? []) parcourir(bloc.fields)
			}
		}
		const collections = [Admins, Articles, AuthEvenements, Demandes, Media, Profils, Pros, Talents]
		for (const collection of collections) parcourir(collection.fields as unknown[])
		expect(noms.length).toBeGreaterThan(50)
		expect(noms.filter(nom => /origine|\bconnu\b|onboarding|acquisition|how.?heard/i.test(nom))).toEqual([])
		// The generated types are the schema of the database: same words nowhere.
		const types = readFileSync(new URL('../../src/payload-types.ts', import.meta.url), 'utf8')
		expect(types).not.toMatch(/origine|\bconnu\b|onboarding/i)
	})
})
