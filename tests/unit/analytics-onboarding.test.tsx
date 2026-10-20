import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { Admins } from '@/collections/Admins'
import { Articles } from '@/collections/Articles'
import { AuthEvents } from '@/collections/AuthEvents'
import { ContactRequests } from '@/collections/ContactRequests'
import { Media } from '@/collections/Media'
import { Profiles } from '@/collections/Profiles'
import { Pros } from '@/collections/Pros'
import { Talents } from '@/collections/Talents'
import { Onboarding } from '@/components/dashboard/onboarding/Onboarding'
import { DECLARED_ORIGINS, eventData } from '@/lib/analytics/events'
import type { Track } from '@/lib/analytics/track'
import { strictOnboardingIdentitySchema } from '@/lib/dashboard/onboarding'
import { openWindow } from '../support/dom-react'
import { pickFiles } from '../support/pick-files'

/**
 * Ticket 148: the onboarding sends its steps and the declared origin as events (plan 04 §3.3, events
 * 16 and 17), and stores nothing. `suivre` is given to the component, so the test sees exactly what
 * would leave; the server actions are fakes that keep what they receive.
 */
const jsdomWindow = openWindow()

type Upload = { nom: string; proprietes: unknown }
function spy() {
	const uploads: Upload[] = []
	const follow = ((nom: string, proprietes: unknown = {}) => {
		uploads.push({ nom, proprietes })
		return true
	}) as unknown as Track
	return { envois: uploads, suivre: follow }
}

const REDUCED = new File(['petit'], 'photo.webp', { type: 'image/webp' })
const ZONE = { codeInsee: '59350', libelle: 'Lille (59)', rayonKm: null, aDomicile: false }

function bench(options: { etape?: 1 | 2 | 3; photoEnCours?: 'terminee' | 2 } = {}) {
	const { envois: uploads, suivre: follow } = spy()
	const received = { identite: [] as unknown[], zone: [] as unknown[], photo: [] as unknown[] }
	return {
		envois: uploads,
		recu: received,
		monter: () =>
			jsdomWindow.monter(
				<Onboarding
					etapeInitiale={options.etape ?? 1}
					identite={{ prenom: '', nom: '', nomArtiste: '', specialite: '' }}
					localisation={{ codeInsee: '', libelle: '', rayonKm: null, aDomicile: false }}
					envoyerIdentite={async valeurs => {
						received.identite.push(valeurs)
						return { ok: true, valeurs }
					}}
					envoyerLocalisation={async saisie => {
						received.zone.push(saisie)
						return { ok: true, valeurs: { ...ZONE, rayonKm: saisie.rayonKm, aDomicile: saisie.aDomicile } }
					}}
					chercherCommunes={async () => ({ ok: true, communes: [{ codeInsee: '59350', libelle: 'Lille (59)' }] })}
					envoyerPhoto={async saisie => {
						received.photo.push(saisie)
						return {
							ok: true,
							valeurs: { photoPrincipale: saisie.photoPrincipale, position: options.photoEnCours ?? 'terminee' },
						}
					}}
					preparer={async () => ({ ok: true, fichier: REDUCED, largeur: 800, hauteur: 600, taille: 5 })}
					televerser={async () => ({ ok: true, id: 9 })}
					supprimer={async () => {}}
					naviguer={() => {}}
					suivre={follow}
				/>
			),
	}
}

const title = () => jsdomWindow.w.document.getElementById('accueil-titre-etape')?.textContent
const field = (nom: string) => jsdomWindow.champ(nom) as HTMLInputElement

async function identity(origine?: string) {
	await jsdomWindow.saisir(field('Prénom'), 'Léa')
	await jsdomWindow.saisir(field('Nom'), 'Fictive')
	await jsdomWindow.saisir(field('Spécialité'), 'Mariée')
	if (origine)
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById(`accueil-origine-${origine}`) as HTMLElement)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
	await jsdomWindow.attendre(() => title() === 'Ta zone')
}

async function zone() {
	const input = jsdomWindow.w.document.querySelector('input[role="combobox"]') as HTMLInputElement
	await jsdomWindow.saisir(input, 'Lill')
	await jsdomWindow.cliquer(
		await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="option"]'), { max: 3000 })
	)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
	await jsdomWindow.attendre(() => title() === 'Ta photo principale')
}

async function photo() {
	await pickFiles(jsdomWindow, jsdomWindow.champ(/photo/i) as HTMLInputElement, [REDUCED])
	await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Terminer') as HTMLButtonElement).disabled)
	await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
}

describe('une émission par étape franchie, valeurs fermées', () => {
	test('identité, zone, photo puis terminé, chacune une fois, dans l’ordre', async () => {
		const b = bench()
		await b.monter()
		expect(b.envois).toEqual([])
		await identity()
		expect(b.envois).toEqual([{ nom: 'onboarding_step', proprietes: { step: 'identite' } }])
		await zone()
		await photo()
		await jsdomWindow.attendre(() => b.envois.length === 4)
		expect(b.envois).toEqual([
			{ nom: 'onboarding_step', proprietes: { step: 'identite' } },
			{ nom: 'onboarding_step', proprietes: { step: 'zone' } },
			{ nom: 'onboarding_step', proprietes: { step: 'photo' } },
			{ nom: 'onboarding_step', proprietes: { step: 'termine' } },
		])
	})

	test('un échec du serveur n’émet rien', async () => {
		const { envois: uploads, suivre: follow } = spy()
		await jsdomWindow.monter(
			<Onboarding
				etapeInitiale={1}
				identite={{ prenom: '', nom: '', nomArtiste: '', specialite: '' }}
				localisation={{ codeInsee: '', libelle: '', rayonKm: null, aDomicile: false }}
				envoyerIdentite={async () => ({ ok: false, message: 'Échec.' })}
				envoyerLocalisation={async () => ({ ok: false, message: 'Échec.' })}
				chercherCommunes={async () => ({ ok: true, communes: [] })}
				envoyerPhoto={async () => ({ ok: false, message: 'Échec.' })}
				suivre={follow}
			/>
		)
		await jsdomWindow.saisir(field('Prénom'), 'Léa')
		await jsdomWindow.saisir(field('Nom'), 'Fictive')
		await jsdomWindow.saisir(field('Spécialité'), 'Mariée')
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById('accueil-origine-ia') as HTMLElement)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() =>
			(jsdomWindow.w.document.querySelector('[role="alert"]')?.textContent ?? '').includes('Échec')
		)
		expect(title()).toBe('Ton identité')
		expect(uploads).toEqual([])
	})

	test('revenir à une étape faite et la repasser ne la recompte pas', async () => {
		const b = bench()
		await b.monter()
		await identity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Précédent'))
		await jsdomWindow.attendre(() => title() === 'Ton identité')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => title() === 'Ta zone')
		expect(b.envois.filter(e => e.nom === 'onboarding_step')).toHaveLength(1)
	})

	test('une photo enregistrée alors qu’il manque encore une étape : « photo », pas « termine »', async () => {
		const b = bench({ etape: 3, photoEnCours: 2 })
		await b.monter()
		await photo()
		await jsdomWindow.attendre(() => b.envois.length >= 1)
		expect(b.envois).toEqual([{ nom: 'onboarding_step', proprietes: { step: 'photo' } }])
	})

	test('chaque étape et chaque origine passent le catalogue ; une valeur hors liste fait tomber l’événement', () => {
		for (const step of ['identite', 'zone', 'photo', 'termine'])
			expect(eventData('onboarding_step', { step })).toEqual({ step })
		expect(eventData('onboarding_step', { step: 'prenom' })).toBeNull()
		expect(eventData('onboarding_step', { step: 'identite', pid: 3 })).toBeNull()
	})
})

describe('l’origine déclarée part une fois, seulement si elle est choisie', () => {
	test('choisie : un onboarding_source avec la valeur, une fois, après l’enregistrement de l’identité', async () => {
		const b = bench()
		await b.monter()
		await identity('ia')
		expect(b.envois).toEqual([
			{ nom: 'onboarding_step', proprietes: { step: 'identite' } },
			{ nom: 'onboarding_source', proprietes: { source: 'ia' } },
		])
		// Back to the identity and forward again: the answer is not counted twice.
		await jsdomWindow.cliquer(jsdomWindow.bouton('Précédent'))
		await jsdomWindow.attendre(() => title() === 'Ton identité')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() => title() === 'Ta zone')
		expect(b.envois.filter(e => e.nom === 'onboarding_source')).toHaveLength(1)
	})

	test('chacune des six réponses passe le catalogue', () => {
		for (const source of DECLARED_ORIGINS) expect(eventData('onboarding_source', { source })).toEqual({ source })
		expect(eventData('onboarding_source', { source: 'tiktok' })).toBeNull()
	})

	test('non choisie : aucun onboarding_source', async () => {
		const b = bench()
		await b.monter()
		await identity()
		expect(b.envois.map(e => e.nom)).toEqual(['onboarding_step'])
	})

	test('choisie puis effacée : aucun onboarding_source', async () => {
		const b = bench()
		await b.monter()
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById('accueil-origine-google') as HTMLElement)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Effacer ma réponse'))
		await identity()
		expect(b.envois.map(e => e.nom)).toEqual(['onboarding_step'])
	})
})

describe('la réponse n’est stockée nulle part', () => {
	test('l’action qui enregistre l’identité ne reçoit que les quatre champs de l’identité', async () => {
		const b = bench()
		await b.monter()
		await identity('instagram')
		expect(b.recu.identite).toEqual([{ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }])
		await zone()
		await photo()
		await jsdomWindow.attendre(() => b.recu.photo.length === 1)
		expect(JSON.stringify(b.recu)).not.toContain('instagram')
		expect(JSON.stringify(b.recu)).not.toMatch(/origine|source/i)
	})

	test('le schéma strict du serveur refuse un champ d’origine', () => {
		const base = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialite: 'Mariée' }
		expect(strictOnboardingIdentitySchema.safeParse(base).success).toBe(true)
		expect(strictOnboardingIdentitySchema.safeParse({ ...base, origine: 'ia' }).success).toBe(false)
	})

	test('aucun champ d’aucune collection n’est fait pour la recevoir', () => {
		const names: string[] = []
		const walk = (champs: readonly unknown[] | undefined): void => {
			for (const field of champs ?? []) {
				const c = field as {
					name?: string
					fields?: unknown[]
					tabs?: { fields?: unknown[] }[]
					blocks?: { fields?: unknown[] }[]
				}
				if (c.name) names.push(c.name)
				walk(c.fields)
				for (const t of c.tabs ?? []) walk(t.fields)
				for (const block of c.blocks ?? []) walk(block.fields)
			}
		}
		const collections = [Admins, Articles, AuthEvents, ContactRequests, Media, Profiles, Pros, Talents]
		for (const collection of collections) walk(collection.fields as unknown[])
		expect(names.length).toBeGreaterThan(50)
		expect(names.filter(nom => /origine|\bconnu\b|onboarding|acquisition|how.?heard/i.test(nom))).toEqual([])
		// The generated types are the schema of the database: same words nowhere.
		const types = readFileSync(new URL('../../src/payload-types.ts', import.meta.url), 'utf8')
		expect(types).not.toMatch(/origine|\bconnu\b|onboarding/i)
	})
})
