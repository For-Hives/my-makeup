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
import { DECLARED_ORIGINS, eventData } from '@/lib/analytics/events'
import type { Track } from '@/lib/analytics/track'
import { strictOnboardingIdentitySchema } from '@/lib/dashboard/onboarding'
import { openWindow } from '../support/dom-react'
import { doneUntil, onboardingBench, REDUCED } from '../support/onboarding-bench'
import { pickFiles } from '../support/pick-files'

/**
 * Ticket 148, issue 1009: the onboarding sends its steps and the declared origin as events (plan 04
 * §3.3, events 16 and 17), and stores nothing. `suivre` is given to the component, so the test sees
 * exactly what would leave; the server actions are fakes that keep what they receive.
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

function bench(options: Parameters<typeof onboardingBench>[1] = {}) {
	const { envois: sent, suivre: follow } = spy()
	const made = onboardingBench(jsdomWindow, { ...options, suivre: follow })
	return { envois: sent, recu: made.journal, monter: made.monter }
}

const title = () => jsdomWindow.w.document.getElementById('accueil-titre-etape')?.textContent
const field = (nom: string | RegExp) => jsdomWindow.champ(nom) as HTMLInputElement
const step = (value: string) => ({ nom: 'onboarding_step', proprietes: { step: value } })

async function next(titleOfNext: string) {
	await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
	await jsdomWindow.attendre(() => title() === titleOfNext)
}

async function fillIdentity(origine?: string) {
	await jsdomWindow.saisir(field('Prénom'), 'Léa')
	await jsdomWindow.saisir(field('Nom'), 'Fictive')
	await jsdomWindow.cliquer(field('Mariage'))
	if (origine)
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById(`accueil-origine-${origine}`) as HTMLElement)
}

async function identity(origine?: string) {
	await fillIdentity(origine)
	await next('Ta zone')
}

async function zone() {
	const input = jsdomWindow.w.document.querySelector('input[role="combobox"]') as HTMLInputElement
	await jsdomWindow.saisir(input, 'Lill')
	await jsdomWindow.cliquer(
		await jsdomWindow.attendre(() => jsdomWindow.w.document.querySelector('[role="option"]'), { max: 3000 })
	)
	await next('Ta photo principale')
}

async function photo() {
	await pickFiles(jsdomWindow, jsdomWindow.champ(/photo/i) as HTMLInputElement, [REDUCED])
	await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Suivant') as HTMLButtonElement).disabled)
	await next('Comment te joindre')
}

async function contact() {
	await jsdomWindow.saisir(field('Instagram'), '@studio.fictif')
	await next('Ta prestation phare')
}

describe('une émission par étape franchie, valeurs fermées', () => {
	test('les cinq étapes, chacune une fois, dans l’ordre, « termine » quand la troisième est enregistrée', async () => {
		const b = bench()
		await b.monter()
		expect(b.envois).toEqual([])
		await identity()
		expect(b.envois).toEqual([step('identite')])
		await zone()
		await photo()
		expect(b.envois).toEqual([step('identite'), step('zone'), step('photo'), step('termine')])
		await contact()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Modèle Essai'))
		await jsdomWindow.saisir(field('Prix'), '60')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Terminer'))
		await jsdomWindow.attendre(() => b.envois.length === 6)
		expect(b.envois).toEqual([
			step('identite'),
			step('zone'),
			step('photo'),
			step('termine'),
			step('contact'),
			step('prestation'),
		])
	})

	test('un échec du serveur n’émet rien', async () => {
		const { envois: uploads, suivre: follow } = spy()
		await onboardingBench(jsdomWindow, {
			suivre: follow,
			actions: { saveIdentity: async () => ({ ok: false, message: 'Échec.' }) },
		}).monter()
		await jsdomWindow.saisir(field('Prénom'), 'Léa')
		await jsdomWindow.saisir(field('Nom'), 'Fictive')
		await jsdomWindow.cliquer(field('Mariage'))
		await jsdomWindow.cliquer(jsdomWindow.w.document.getElementById('accueil-origine-ia') as HTMLElement)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Suivant'))
		await jsdomWindow.attendre(() =>
			(jsdomWindow.w.document.querySelector('[role="alert"]')?.textContent ?? '').includes('Échec')
		)
		expect(title()).toBe('Ta spécialité')
		expect(uploads).toEqual([])
	})

	test('revenir à une étape faite et la repasser ne la recompte pas', async () => {
		const b = bench()
		await b.monter()
		await identity()
		await jsdomWindow.cliquer(jsdomWindow.bouton('Précédent'))
		await jsdomWindow.attendre(() => title() === 'Ta spécialité')
		// The page would read the stored names again; the bench's props stay empty, so she types them again.
		await fillIdentity()
		await next('Ta zone')
		expect(b.envois.filter(e => e.nom === 'onboarding_step')).toHaveLength(1)
	})

	test('une étape que le profil avait déjà faite n’est pas recomptée quand elle est enregistrée à nouveau', async () => {
		const b = bench({ position: 3, done: doneUntil(3) })
		await b.monter()
		await pickFiles(jsdomWindow, jsdomWindow.champ(/photo/i) as HTMLInputElement, [REDUCED])
		await jsdomWindow.attendre(() => !(jsdomWindow.bouton('Suivant') as HTMLButtonElement).disabled)
		await next('Comment te joindre')
		expect(b.envois).toEqual([])
	})

	test('la dernière des trois premières étapes enregistrée : « photo » puis « termine » ; une étape 4 seule ne dit pas « termine »', async () => {
		const b = bench({ position: 3, done: doneUntil(2) })
		await b.monter()
		await photo()
		expect(b.envois).toEqual([step('photo'), step('termine')])
	})

	test('une étape 4 enregistrée sur un profil déjà actif : « contact », pas « termine »', async () => {
		const c = bench({ position: 4, done: doneUntil(3) })
		await c.monter()
		await contact()
		expect(c.envois).toEqual([step('contact')])
	})

	test('une photo enregistrée alors qu’il manque encore une étape essentielle : « photo », pas « termine »', async () => {
		const b = bench({ position: 3, done: { 1: false, 2: true, 3: false, 4: false, 5: false } })
		await b.monter()
		await photo()
		expect(b.envois).toEqual([step('photo')])
	})

	test('chaque étape et chaque origine passent le catalogue ; une valeur hors liste fait tomber l’événement', () => {
		for (const value of ['identite', 'zone', 'photo', 'contact', 'prestation', 'termine'])
			expect(eventData('onboarding_step', { step: value })).toEqual({ step: value })
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
		await jsdomWindow.attendre(() => title() === 'Ta spécialité')
		await fillIdentity('ia')
		await next('Ta zone')
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
		expect(b.recu.identity).toEqual([
			{ prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialtyBullets: 'wedding', specialtyOther: '' },
		])
		await zone()
		await photo()
		await jsdomWindow.attendre(() => b.recu.photo.length === 1)
		expect(JSON.stringify(b.recu)).not.toContain('"instagram')
		expect(JSON.stringify(b.recu)).not.toMatch(/origine|source/i)
	})

	test('le schéma strict du serveur refuse un champ d’origine', () => {
		const base = { prenom: 'Léa', nom: 'Fictive', nomArtiste: '', specialtyBullets: 'wedding', specialtyOther: '' }
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
