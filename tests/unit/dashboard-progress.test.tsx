import { describe, expect, test } from 'bun:test'
import { OverviewStatus } from '@/components/dashboard/overview/OverviewStatus'
import type { DashboardProfile } from '@/lib/dashboard/dashboard-profile'
import { BLOCK_IDS, CRITERION_BLOCK, editBlockHref } from '@/lib/dashboard/edit-blocks'
import { gaugePercent, overviewStatus, type Progress, pageIsOnline, profileProgress } from '@/lib/dashboard/progress'
import { CRITERIA } from '@/lib/profile/completeness'
import { ANNECY, caseDocument, completenessInV3, SHARED_CASE } from '../support/completeness-cases'
import { openWindow } from '../support/dom-react'

/**
 * The summary of her space (ticket 138 moved to issue 1073; plan 02 U01, U02, U04-U08): the figures
 * and the list come from the single definition of a profile, never from a rule of the page.
 * Made-up values only.
 */

const jsdomWindow = openWindow()

/** The summary of her space, as the page draws it. */
const panel = (progress: Progress, resume?: (valeurs: { disponible: boolean }) => Promise<never>) =>
	jsdomWindow.monter(<OverviewStatus progress={progress} {...(resume ? { resume: resume as never } : {})} />)

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
		for (const gap of empty.manques) expect(BLOCK_IDS).toContain(CRITERION_BLOCK[gap.critere])
	})

	test('les quatre points requis passent avant les autres, puis ceux qui aident Google', () => {
		const ranks = empty.manques.map(m => m.requis)
		expect(ranks.filter(Boolean)).toHaveLength(4)
		expect(ranks.slice(0, 4).every(Boolean)).toBe(true)
		const google = empty.manques.filter(m => m.google).map(m => m.critere)
		expect(google).toEqual(['description', 'offres', 'galerie'])
		expect(empty.manques.slice(4, 7).map(m => m.critere)).toEqual(google)
		expect(empty.manques.filter(m => m.requis && m.google)).toEqual([])
	})
})

describe('U02 : profil complet', () => {
	test('13 sur 13, 100 %, publiable, aucun manque', () => {
		const a = profileProgress(FULL)
		expect(a).toMatchObject({ score: 13, pourcentage: 100, etat: 'publiable', manques: [] })
		expect(a.consequence).toContain('Google peut maintenant te trouver')
	})
})

describe('U04-U06 : actif mais pas publiable, les manques exacts', () => {
	const ACTIVE: DashboardProfile = { id: 3, specialty: 'Mariage', city: ANNECY, mainPicture: 5 }

	test('actif seul : seul le contact manque pour être publiable ; la description et le prix ne sont plus requis', () => {
		const a = profileProgress(ACTIVE)
		expect(a.etat).toBe('incomplet')
		expect(a.manques.filter(m => m.requis).map(m => m.critere)).toEqual(['reseaux'])
		expect(a.manques.filter(m => m.google).map(m => m.critere)).toEqual(['description', 'offres', 'galerie'])
	})

	test('sans prix ni description, avec un contact : publié, mais pas encore trouvé par Google, et le dit', () => {
		const a = profileProgress({ ...ACTIVE, networks: { instagram: 'studio.fictif' } })
		expect(a.etat).toBe('publiable')
		expect(a.indexable).toBe(false)
		expect(a.manques.filter(m => m.requis)).toEqual([])
		expect(a.consequence).toContain('Google')
		expect(a.consequence).toContain('100 caractères')
		expect(a.consequence).not.toContain('Google peut maintenant te trouver')
		const state = overviewStatus(a)
		expect(state.code).toBe('visible')
		expect(state.text).toContain('Pour que Google la trouve aussi')
		expect(gaugePercent(a)).toBeLessThan(100)
	})

	test('U04 : une offre sans prix en chiffres n’empêche plus la publication ; sans photo de galerie, Google la demande', () => {
		const devis = { ...FULL, gallery: [], serviceOffers: [{ name: 'Sur devis', priceText: 'Sur devis' }] }
		const a = profileProgress(devis)
		expect(a.etat).toBe('publiable')
		expect(a.indexable).toBe(false)
		expect(a.manques.map(m => [m.critere, m.requis, m.google])).toEqual([
			['offres', false, true],
			['galerie', false, true],
		])
		expect(a.manques[0]?.texte).toContain('prix en chiffres')
		expect(a.manques[0]?.texte).toContain('photos')
		// avec une photo de galerie, la prestation sur devis suffit pour Google
		const withGallery = profileProgress({ ...devis, gallery: [6] })
		expect(withGallery.indexable).toBe(true)
		expect(withGallery.manques).toEqual([])
	})

	test('U05 : 99 caractères ne suffisent pas pour Google, 100 suffisent, avec le compte dans le message', () => {
		const short = profileProgress({ ...FULL, description: ` ${'a'.repeat(99)} ` })
		expect(short.etat).toBe('publiable')
		expect(short.indexable).toBe(false)
		expect(short.manques[0]).toMatchObject({ critere: 'description', requis: false, google: true })
		expect(short.manques[0]?.texte).toContain('99 aujourd’hui')
		const enough = profileProgress({ ...FULL, description: 'a'.repeat(100) })
		expect(enough).toMatchObject({ etat: 'publiable', indexable: true, manques: [] })
	})

	test('U06 : sans canal de contact, un manque requis qui mène aux réseaux', () => {
		const a = profileProgress(without('networks'))
		expect(a.manques).toHaveLength(1)
		expect(a.manques[0]).toMatchObject({ critere: 'reseaux', requis: true, google: false })
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
		expect(a.manques.map(m => [m.critere, m.requis, m.google])).toEqual([
			['langues', false, false],
			['galerie', false, false],
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
		expect(profileProgress({ ...FULL, available: false }).consequence).toContain('Tu es en pause')
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

describe('le panneau affiché', () => {
	test('pourcentage, barre de progression et liens vers les blocs', async () => {
		const zone = await panel(profileProgress({ id: 2 }))
		expect(zone.querySelector('[data-testid="avancement-score"]')?.textContent).toBe('Ton profil est rempli à 0 %')
		expect(zone.textContent).not.toContain('null')
		const bar = zone.querySelector('[role="progressbar"]')
		expect(bar?.getAttribute('aria-valuenow')).toBe('0')
		expect(bar?.getAttribute('aria-valuemax')).toBe('100')
		const links = [...zone.querySelectorAll('li[data-critere] a')].map(a => a.getAttribute('href'))
		expect(links).toHaveLength(13)
		expect(links).toContain(editBlockHref('photo'))
		expect(links).toContain(editBlockHref('services'))
		expect(zone.querySelectorAll('h2')).toHaveLength(1)
	})

	test('un profil publiable : pas de liste de manques', async () => {
		const zone = await panel(profileProgress(FULL))
		expect(zone.querySelectorAll('a')).toHaveLength(0)
		expect(zone.querySelector('[data-etat="publiable"]')).not.toBeNull()
		expect(zone.querySelector('[data-testid="brouillon-pastille"]')).toBeNull()
	})
})

describe('306 : la jauge compte d’abord les quatre indispensables, les bonus à part', () => {
	test('profil vide : 0/4 et 0/9 ; profil complet : 4/4 et 9/9, la page est en ligne', () => {
		const empty = profileProgress({ id: 2 })
		expect([empty.essentials, empty.bonus]).toEqual([
			{ done: 0, total: 4 },
			{ done: 0, total: 9 },
		])
		const full = profileProgress(FULL)
		expect([full.essentials, full.bonus]).toEqual([
			{ done: 4, total: 4 },
			{ done: 9, total: 9 },
		])
		expect(pageIsOnline(full)).toBe(true)
		expect(pageIsOnline(empty)).toBe(false)
	})

	test('trois indispensables : 3/4, le manque est dit, pas de page en ligne', async () => {
		const progress = profileProgress(without('networks'))
		expect(progress.essentials).toEqual({ done: 3, total: 4 })
		expect(pageIsOnline(progress)).toBe(false)
		const zone = await panel(progress)
		expect(
			[...zone.querySelectorAll('li[data-critere] a')].map(link => link.closest('li')?.getAttribute('data-critere'))
		).toEqual(['reseaux'])
	})

	test('les bonus ne comptent pas dans les quatre, et les quatre ne comptent pas dans les bonus', () => {
		const onlyBonus = profileProgress({ id: 3, languages: [{ name: 'Français' }], gallery: [6] })
		expect([onlyBonus.essentials.done, onlyBonus.bonus.done]).toEqual([0, 2])
		const noBonus = profileProgress({ ...FULL, languages: [], gallery: [], skills: [], courses: [], experiences: [] })
		expect([noBonus.essentials.done, noBonus.bonus.done]).toEqual([4, 4])
	})

	test('une description de 99 caractères remplit un critère et ne retire aucun indispensable ; la jauge ne dit pas 100 %', () => {
		const progress = profileProgress({ ...FULL, description: 'a'.repeat(99) })
		expect(progress.essentials.done).toBe(4)
		expect(progress.score).toBe(13)
		expect(progress.pourcentage).toBe(100)
		expect(gaugePercent(progress)).toBe(99)
		expect(gaugePercent(profileProgress(FULL))).toBe(100)
	})

	test('masquée par l’équipe : jamais « ta page est prête », la carte verte ne s’affiche pas', () => {
		const hidden = profileProgress({ ...FULL, status: 'hidden' })
		expect(pageIsOnline(hidden)).toBe(false)
		const internal = profileProgress({ ...FULL, specialty: 'CEO/CTO My Makeup' })
		expect(pageIsOnline(internal)).toBe(false)
	})

	test('les états en mots : plus de « indexe », « Google peut maintenant te trouver »', () => {
		const said = [FULL, { id: 2 }, without('networks'), { ...FULL, specialty: 'CEO/CTO My Makeup' }].map(
			p => profileProgress(p).consequence
		)
		expect(said.join(' ')).not.toMatch(/index/)
		expect(said[0]).toContain('Google peut maintenant te trouver')
	})
})

describe('291 : un profil listé sans moyen de contact passe après les autres', () => {
	const NO_CONTACT: DashboardProfile = { ...FULL, networks: {} }

	test('listé et sans canal : le message le dit', () => {
		expect(profileProgress(NO_CONTACT).rankedLast).toBe(true)
		expect(profileProgress(FULL).rankedLast).toBe(false)
	})

	test('un profil vide ou indisponible n’est pas dans la recherche : pas de message', () => {
		expect(profileProgress({ id: 2 }).rankedLast).toBe(false)
		expect(profileProgress({ ...NO_CONTACT, available: false }).rankedLast).toBe(false)
	})

	test('un téléphone enregistré mais fermé ne compte pas ; montré, il compte', () => {
		const closed = { ...NO_CONTACT, contactDetails: { phone: '06 00 00 00 01' }, publicContact: false }
		expect(profileProgress(closed).rankedLast).toBe(true)
		expect(profileProgress({ ...closed, publicContact: true }).rankedLast).toBe(false)
	})

	test('le panneau dit la phrase et mène au bloc des coordonnées', async () => {
		const zone = await panel(profileProgress(NO_CONTACT))
		const notice = zone.querySelector('[data-testid="avancement-sans-contact"]')
		expect(notice?.textContent).toContain('Sans moyen de contact, ton profil passe après les autres dans la recherche.')
		expect(notice?.querySelector('a')?.getAttribute('href')).toBe(editBlockHref('contacts'))
	})

	test('avec un contact, le panneau ne dit rien', async () => {
		const zone = await panel(profileProgress(FULL))
		expect(zone.querySelector('[data-testid="avancement-sans-contact"]')).toBeNull()
	})
})

describe('292 : l’espace dit la vérité à une maquilleuse masquée ou en pause', () => {
	const REASON = 'Photos sans rapport avec le maquillage.'
	const HIDDEN: DashboardProfile = { ...FULL, status: 'hidden', reason: REASON }
	const PAUSED: DashboardProfile = { ...FULL, available: false }
	const FORBIDDEN = /publiable|apparaît dans la recherche|indexe|indexer/

	test('masquée avec motif : le texte porte le motif et aucune promesse de publication', () => {
		const progress = profileProgress(HIDDEN)
		expect(progress.etat).toBe('masque')
		expect(progress.reason).toBe(REASON)
		const said = `${progress.titre} ${progress.consequence}`
		expect(said).toContain('Ta page est masquée par l’équipe My Makeup : elle n’est plus visible.')
		expect(said).toContain(`Motif : ${REASON}`)
		expect(said).not.toMatch(FORBIDDEN)
	})

	test('suspendue (issue 1005) : le mot « suspendue » et le motif, le même effet', () => {
		const progress = profileProgress({ ...HIDDEN, moderationAction: 'suspend' })
		expect(progress.etat).toBe('masque')
		expect(progress.titre).toBe('Ta page est suspendue par l’équipe My Makeup : elle n’est plus visible.')
		expect(progress.consequence).toContain(`Motif : ${REASON}`)
		expect(profileProgress({ ...HIDDEN, moderationAction: 'hide' }).titre).toContain('masquée')
	})

	test('masquée sans motif : pas de ligne « Motif » vide', () => {
		for (const reason of [undefined, null, '', '   ']) {
			const progress = profileProgress({ ...FULL, status: 'hidden', reason })
			expect(progress.reason).toBeNull()
			expect(progress.consequence).not.toContain('Motif')
		}
	})

	test('masquée, même vide ou indisponible : le masquage prime', () => {
		expect(profileProgress({ id: 2, status: 'hidden' }).etat).toBe('masque')
		expect(profileProgress({ ...HIDDEN, available: false }).etat).toBe('masque')
		expect(profileProgress({ ...HIDDEN, networks: {} }).rankedLast).toBe(false)
	})

	test('en pause : une seule phrase, sans contradiction', () => {
		const progress = profileProgress(PAUSED)
		expect(progress.enPause).toBe(true)
		expect(progress.consequence).toBe(
			'Tu es en pause : ta page reste en ligne, mais tu n’apparais pas dans la recherche.'
		)
		const incomplete = profileProgress({ ...PAUSED, networks: {} })
		expect(incomplete.etat).toBe('incomplet')
		expect(incomplete.consequence).toBe(progress.consequence)
	})

	test('publiée et disponible : le texte ne change pas', () => {
		const progress = profileProgress({ ...FULL, status: 'published', reason: null })
		expect(progress.etat).toBe('publiable')
		expect(progress.consequence).toBe('Ton profil apparaît dans la recherche et Google peut maintenant te trouver.')
		expect(progress.enPause).toBe(false)
		expect(progress.reason).toBeNull()
	})

	test('un profil vide en pause garde sa phrase : il n’est pas listé de toute façon', () => {
		const progress = profileProgress({ id: 2, available: false })
		expect(progress.enPause).toBe(false)
		expect(progress.etat).toBe('vide')
	})

	test('le panneau masqué : motif, adresse pour en parler, jauge grisée, pas de liste « publiable »', async () => {
		const zone = await panel(profileProgress(HIDDEN))
		expect(zone.querySelector('[data-etat="masque"]')).not.toBeNull()
		expect(zone.textContent).toContain(REASON)
		expect(zone.textContent).not.toMatch(FORBIDDEN)
		expect(zone.querySelector('a[href^="mailto:"]')).not.toBeNull()
		expect(zone.querySelector('[role="progressbar"]')?.getAttribute('data-grise')).toBe('true')
		expect(zone.querySelector('[data-testid="avancement-sans-contact"]')).toBeNull()
		expect(zone.querySelector('button')).toBeNull()
	})

	test('« Reprendre les demandes » remet la disponibilité et annonce le résultat', async () => {
		const sent: unknown[] = []
		const resume = async (valeurs: { disponible: boolean }) => {
			sent.push(valeurs)
			return { ok: true as const, valeurs }
		}
		const zone = await panel(profileProgress(PAUSED), resume as never)
		const status = zone.querySelector('[role="status"]')
		expect(status?.textContent).toBe('')
		await jsdomWindow.cliquer(jsdomWindow.bouton('Reprendre les demandes'))
		await jsdomWindow.attendre(() => (status?.textContent ?? '') !== '')
		expect(sent).toEqual([{ disponible: true }])
		expect(status?.textContent).toContain('Tu as repris les demandes')
	})

	test('« Reprendre les demandes » : l’échec est dit et le bouton reste', async () => {
		const fail = async () => ({ ok: false as const, message: 'Enregistrement impossible.' })
		const zone = await panel(profileProgress(PAUSED), fail as never)
		await jsdomWindow.cliquer(jsdomWindow.bouton('Reprendre les demandes'))
		await jsdomWindow.attendre(() => zone.textContent?.includes('Enregistrement impossible.') === true)
		expect(jsdomWindow.bouton('Reprendre les demandes')).not.toBeNull()
	})

	test('pas de bouton quand la maquilleuse est disponible', async () => {
		const zone = await panel(profileProgress(FULL), (async (v: { disponible: boolean }) => ({
			ok: true,
			valeurs: v,
		})) as never)
		expect(zone.querySelector('button')).toBeNull()
	})
})
