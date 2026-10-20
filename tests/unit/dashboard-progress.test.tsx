import { describe, expect, test } from 'bun:test'
import { ProfileProgress } from '@/components/dashboard/ProfileProgress'
import type { DashboardProfile } from '@/lib/dashboard/cards'
import { SECTIONS } from '@/lib/dashboard/cards'
import { profileProgress } from '@/lib/dashboard/progress'
import { CRITERIA } from '@/lib/profile/completeness'
import { ANNECY, caseDocument, completenessInV3, SHARED_CASE } from '../support/completeness-cases'
import { openWindow } from '../support/dom-react'

/**
 * The progress block at the top of her space (ticket 138; plan 02 U01, U02, U04-U08): the figures
 * and the list come from the single definition of a profile, never from a rule of the page.
 * Made-up values only.
 */

const jsdomWindow = openWindow()

const DESCRIPTION = 'Maquilleuse fictive. '.repeat(12)

/** A profile with the 13 criteria, as the page reads it. */
const FULL: DashboardProfile = {
	id: 1,
	firstName: 'Léa',
	lastName: 'Fictive',
	artistName: 'Studio Fictif',
	specialty: 'Mariage',
	description: DESCRIPTION,
	city: ANNECY,
	mainPicture: 5,
	gallery: [6],
	skills: [{ name: 'Teint' }],
	courses: [{ diploma: 'Diplôme fictif' }],
	experiences: [{ jobTitle: 'Poste fictif' }],
	languages: [{ name: 'Français' }],
	serviceOffers: [{ name: 'Mariée', priceFrom: 120 }],
	networks: { instagram: 'studio.fictif' },
}

const without = (...cles: (keyof DashboardProfile)[]): DashboardProfile => {
	const copy: Record<string, unknown> = { ...FULL }
	for (const key of cles) delete copy[key]
	return copy as DashboardProfile
}

describe('U01 : profil vide', () => {
	const empty = profileProgress({ id: 2 })

	test('0 sur 13, 0 %, les 13 manques dans l’ordre d’affichage', () => {
		expect(empty.score).toBe(0)
		expect(empty.sur).toBe(13)
		expect(empty.pourcentage).toBe(0)
		expect(empty.manques.map(m => m.critere).sort()).toEqual([...CRITERIA].sort())
		expect(empty.manques).toHaveLength(13)
	})

	test('état vide, avec ce qu’il change : pas listé dans la recherche', () => {
		expect(empty.etat).toBe('vide')
		expect(empty.consequence).toContain('n’est pas listé dans la recherche')
	})

	test('chaque manque mène à une carte qui existe', () => {
		for (const gap of empty.manques) expect(SECTIONS).toContain(gap.section)
	})

	test('les six points requis passent avant les autres', () => {
		const ranks = empty.manques.map(m => m.requis)
		expect(ranks.filter(Boolean)).toHaveLength(6)
		expect(ranks.slice(0, 6).every(Boolean)).toBe(true)
	})
})

describe('U02 : profil complet', () => {
	test('13 sur 13, 100 %, publiable, aucun manque', () => {
		const a = profileProgress(FULL)
		expect(a).toMatchObject({ score: 13, pourcentage: 100, etat: 'publiable', manques: [] })
		expect(a.consequence).toContain('Google peut l’indexer')
	})
})

describe('U04-U06 : actif mais pas publiable, les manques exacts', () => {
	const ACTIVE: DashboardProfile = { id: 3, specialty: 'Mariage', city: ANNECY, mainPicture: 5 }

	test('actif seul : l’offre, la description et le contact manquent, rien d’autre de requis', () => {
		const a = profileProgress(ACTIVE)
		expect(a.etat).toBe('incomplet')
		expect(a.manques.filter(m => m.requis).map(m => m.critere)).toEqual(['description', 'offres', 'reseaux'])
	})

	test('U04 : une offre sans prix en chiffres reste un manque, et le dit', () => {
		const a = profileProgress({ ...FULL, serviceOffers: [{ name: 'Sur devis', priceText: 'Sur devis' }] })
		expect(a.etat).toBe('incomplet')
		expect(a.manques).toHaveLength(1)
		expect(a.manques[0]).toMatchObject({ critere: 'offres', requis: true, section: 'prestations' })
		expect(a.manques[0]?.texte).toContain('prix en chiffres')
	})

	test('U05 : 199 caractères manquent, 200 suffisent, avec le compte dans le message', () => {
		const short = profileProgress({ ...FULL, description: ` ${'a'.repeat(199)} ` })
		expect(short.etat).toBe('incomplet')
		expect(short.manques[0]).toMatchObject({ critere: 'description', requis: true })
		expect(short.manques[0]?.texte).toContain('199 aujourd’hui')
		expect(profileProgress({ ...FULL, description: 'a'.repeat(200) }).etat).toBe('publiable')
	})

	test('U06 : sans canal de contact, un manque requis qui mène aux réseaux', () => {
		const a = profileProgress(without('networks'))
		expect(a.manques).toHaveLength(1)
		expect(a.manques[0]).toMatchObject({ critere: 'reseaux', requis: true, section: 'reseaux' })
	})

	test('le téléphone compte seulement affiché sur le profil', () => {
		const cache = profileProgress({ ...without('networks'), contactDetails: { phone: '0102030405' } })
		expect(cache.etat).toBe('incomplet')
		const shows = profileProgress({
			...without('networks'),
			contactDetails: { phone: '0102030405' },
			publicContact: true,
		})
		expect(shows.etat).toBe('publiable')
	})

	test('sans photo, spécialité ou commune : le profil n’est pas actif, chaque manque est requis', () => {
		for (const [removal, criterion] of [
			['mainPicture', 'photo'],
			['specialty', 'specialite'],
			['city', 'ville'],
		] as const) {
			const a = profileProgress(without(removal))
			expect(a.etat).toBe('incomplet')
			expect(a.manques.map(m => [m.critere, m.requis])).toEqual([[criterion, true]])
		}
	})

	test('ce qui n’empêche pas d’être publiable passe après, sans être requis', () => {
		const a = profileProgress(without('languages', 'gallery'))
		expect(a.etat).toBe('publiable')
		expect(a.manques.map(m => [m.critere, m.requis])).toEqual([
			['langues', false],
			['galerie', false],
		])
		expect(a.pourcentage).toBe(85)
	})
})

describe('U07 : un compte interne n’est jamais publiable', () => {
	test('complet, mais spécialité « CEO/CTO My Makeup » : état interne, pas publiable', () => {
		const a = profileProgress({ ...FULL, specialty: 'CEO/CTO My Makeup' })
		expect(a.etat).toBe('interne')
		expect(a.consequence).toContain('jamais publiable')
	})
})

describe('disponibilité', () => {
	test('un profil publiable marqué indisponible le dit : il n’est pas dans la recherche', () => {
		expect(profileProgress({ ...FULL, available: false }).consequence).toContain('pas disponible')
		expect(profileProgress({ ...FULL, available: true }).consequence).not.toContain('pas disponible')
		expect(profileProgress({ id: 2, available: false }).consequence).not.toContain('pas disponible')
	})
})

describe('U08 : aucun calcul propre à la page, les cas partagés avec l’ancien site', () => {
	test('score, état publiable et vide égaux à la définition unique, pour chaque cas', async () => {
		for (const testCase of SHARED_CASE) {
			let photo = 100
			const document = (await caseDocument(testCase.profil, () => photo++)) as DashboardProfile
			const a = profileProgress({ ...document, id: 1 })
			const expected = completenessInV3(testCase.profil)
			expect([testCase.nom, a.score]).toEqual([testCase.nom, expected.score])
			expect([testCase.nom, a.etat === 'publiable']).toEqual([testCase.nom, expected.publiable])
			expect([testCase.nom, a.etat === 'vide']).toEqual([testCase.nom, expected.entierementVide && !expected.interne])
			expect([testCase.nom, a.etat === 'interne']).toEqual([testCase.nom, expected.interne])
		}
	})
})

describe('le bloc affiché', () => {
	test('score, pourcentage, barre de progression et liens vers les cartes', async () => {
		const zone = await jsdomWindow.monter(<ProfileProgress avancement={profileProgress({ id: 2 })} />)
		expect(zone.textContent).toContain('0 sur 13 (0 %)')
		expect(zone.textContent).toContain('Ton profil est vide')
		expect(zone.textContent).not.toContain('null')
		const bar = zone.querySelector('[role="progressbar"]')
		expect(bar?.getAttribute('aria-valuenow')).toBe('0')
		expect(bar?.getAttribute('aria-valuemax')).toBe('13')
		const links = [...zone.querySelectorAll('a')].map(a => a.getAttribute('href'))
		expect(links).toHaveLength(13)
		expect(links).toContain('#carte-photo')
		expect(links).toContain('#carte-prestations')
		expect(zone.querySelectorAll('h2')).toHaveLength(1)
	})

	test('un profil publiable : pas de liste de manques', async () => {
		const zone = await jsdomWindow.monter(<ProfileProgress avancement={profileProgress(FULL)} />)
		expect(zone.textContent).toContain('13 sur 13 (100 %)')
		expect(zone.querySelectorAll('a')).toHaveLength(0)
		expect(zone.querySelector('[data-etat="publiable"]')).not.toBeNull()
	})
})
