import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type ProfilesSummary, placeDemoProfiles } from '@/demo-data/loading'
import { listProfiles, readProfileUrlTarget, readPublicProfile } from '@/services/public/profiles'
import { emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage } from '../support/s3'

/**
 * The public reading of the profiles on the fictional set of the bench (ticket 071; plan 02 U20):
 * the empty, the unavailable and the hidden are out of the list; the contact details leave only
 * when their owner published them; a hidden profile gives nothing.
 */

let summary: ProfilesSummary

beforeAll(async () => {
	summary = await placeDemoProfiles(await testPayload())
}, 120_000)

afterAll(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

const slugOf = (cle: string): string => {
	const pose = summary.profils.find(profil => profil.cle === cle)
	if (!pose) throw new Error(`le profil type « ${cle} » manque au bilan`)
	return pose.slug
}

describe('La liste : le vide, l’indisponible et le masqué sont absents', () => {
	test('les profils listés du jeu, et eux seuls', async () => {
		const payload = await testPayload()

		const { cartes: cards, totalDocs } = await listProfiles(payload, { limite: 100 })

		const slugs = cards.map(({ slug }) => slug)
		expect(totalDocs).toBe(cards.length)
		for (const key of ['vide', 'indisponible', 'masquee']) expect(slugs, key).not.toContain(slugOf(key))
		// Availability never set counts as available (U20); a profile that cannot be published is still listed.
		for (const key of ['reference', 'disponibilite-inconnue', 'publiable-non-indexable', 'sans-contact-public'])
			expect(slugs, key).toContain(slugOf(key))
	})

	test('une carte ne porte jamais de coordonnées, même quand la maquilleuse les publie', async () => {
		const payload = await testPayload()

		const { cartes: cards } = await listProfiles(payload, { limite: 100 })

		// The address of a photo is made of random characters: it is checked apart, the rest has no digit pair to hide.
		const text = JSON.stringify(cards.map(({ photo: _photo, ...reste }) => reste))
		expect(text).not.toContain('@')
		expect(text).not.toMatch(/0[1-9][ .]?\d{2}/)
		// `flags` exists only on a card of a country zone (ticket 264), `offerNames` and `startingPrice` only on a card
		// with offers (ticket 303): decoration and public figures, never a contact detail.
		for (const card of cards)
			expect(
				Object.keys(card)
					.filter(key => !['flags', 'offerNames', 'startingPrice'].includes(key))
					.sort()
			).toEqual(['lieu', 'nom', 'photo', 'pid', 'slug', 'specialite', 'superMaquilleuse'])
	})

	test('la pagination est stable : deux pages de cinq se suivent sans se recouper', async () => {
		const payload = await testPayload()

		const [a, two] = [
			await listProfiles(payload, { page: 1, limite: 5 }),
			await listProfiles(payload, { page: 2, limite: 5 }),
		]

		expect(a.cartes).toHaveLength(5)
		expect(a.hasNextPage).toBe(true)
		const seen = new Set(a.cartes.map(({ slug }) => slug))
		expect(two.cartes.every(({ slug }) => !seen.has(slug))).toBe(true)
	})
})

describe('La lecture par slug', () => {
	test('les coordonnées sortent seulement quand la maquilleuse les publie', async () => {
		const payload = await testPayload()

		const published = await readPublicProfile(payload, slugOf('reference'))
		const closed = await readPublicProfile(payload, slugOf('sans-contact-public'))

		expect(published?.coordonnees?.telephone).toBeTruthy()
		expect(published?.coordonnees?.email).toContain('@')
		expect(closed).not.toBeNull()
		expect(closed?.coordonnees).toBeNull()
		expect(JSON.stringify(closed)).not.toContain('louise-girard.example.test')
		expect(JSON.stringify(closed)).not.toContain('06 39 98 10 08')
	})

	test('indexable seulement quand le profil est publiable', async () => {
		const payload = await testPayload()

		expect((await readPublicProfile(payload, slugOf('reference')))?.indexable).toBe(true)
		const unpublishable = await readPublicProfile(payload, slugOf('publiable-non-indexable'))
		expect(unpublishable).not.toBeNull()
		expect(unpublishable?.indexable).toBe(false)
	})

	test('masqué : rien', async () => {
		const payload = await testPayload()

		expect(await readPublicProfile(payload, slugOf('masquee'))).toBeNull()
	})
})

describe('La lecture du profil pour sa page (tickets 101 et 102)', () => {
	test('le profil de référence : zone, photo, listes dans l’ordre et canaux publiés', async () => {
		const payload = await testPayload()

		const profile = await readPublicProfile(payload, slugOf('reference'))

		expect(profile).toMatchObject({
			nom: 'Inès Morel',
			nomArtiste: 'Inès Morel Maquillage',
			zone: 'Annecy et 30 km autour',
			lieu: 'Annecy',
			seDeplace: true,
			disponible: true,
		})
		expect(profile?.photo?.url).toMatch(/^https?:\/\//)
		expect(profile?.prestations.map(({ nom }) => nom)).toEqual([
			'Maquillage de la mariée',
			'Essai maquillage',
			'Maquillage des invitées',
		])
		expect(profile?.prestations[0]?.options.map(({ nom }) => nom)).toEqual(['Retouches jusqu’au dîner'])
		expect(profile?.prestations[0]?.prix).toEqual(['À partir de 180 €'])
		expect(profile?.competences).toEqual(['Maquillage longue tenue', 'Peaux sensibles', 'Coiffure de mariée'])
		expect(profile?.langues).toEqual(['Français', 'Anglais', 'Italien'])
		expect(profile?.formations.map(({ obtenu }) => obtenu)).toEqual(['juin 2014', 'novembre 2015'])
		expect(profile?.experiences.map(({ periode }) => periode)).toEqual([
			'septembre 2015 - août 2018',
			'septembre 2018 - aujourd’hui',
		])
		expect(profile?.liens.map(({ canal }) => canal)).toEqual(['instagram', 'email', 'phone', 'website'])
	})

	test('sans contact public : les réseaux seuls, jamais le téléphone ni l’email', async () => {
		const payload = await testPayload()

		const profile = await readPublicProfile(payload, slugOf('sans-contact-public'))

		expect(profile?.liens).toEqual([])
		expect(JSON.stringify(profile)).not.toMatch(/06 39 98|example\.test/)
	})

	test('un profil vide (brouillon) est lu mais pas indexable, une disponibilité jamais posée compte comme disponible', async () => {
		const payload = await testPayload()

		const empty = await readPublicProfile(payload, slugOf('vide'))
		const unknown = await readPublicProfile(payload, slugOf('disponibilite-inconnue'))

		// A draft answers its page in noindex (ticket 104).
		expect(empty?.indexable).toBe(false)
		expect(unknown?.disponible).toBe(true)
		expect((await readPublicProfile(payload, slugOf('indisponible')))?.disponible).toBe(false)
	})
})

describe('L’adresse d’un profil (ticket 104)', () => {
	test('le slug donne le profil, publié ou non ; le masqué et l’inconnu ne donnent rien', async () => {
		const payload = await testPayload()

		expect((await readProfileUrlTarget(payload, slugOf('reference'))).type).toBe('profil')
		expect((await readProfileUrlTarget(payload, slugOf('vide'))).type).toBe('profil')
		expect(await readProfileUrlTarget(payload, slugOf('masquee'))).toEqual({ type: 'inconnue' })
		expect(await readProfileUrlTarget(payload, 'audit-inexistant-zz9')).toEqual({ type: 'inconnue' })
		expect(await readProfileUrlTarget(payload, 'a\u0000b')).toEqual({ type: 'inconnue' })
	})

	test('l’ancien nom d’utilisateur et une variante du slug mènent au slug, jamais à un masqué', async () => {
		const payload = await testPayload()
		const slug = slugOf('ancien-nom-accentue')

		expect(await readProfileUrlTarget(payload, 'zoé lefèvre')).toEqual({ type: 'redirection', slug })
		expect(await readProfileUrlTarget(payload, slug.toUpperCase())).toEqual({ type: 'redirection', slug })
		expect(await readProfileUrlTarget(payload, slugOf('masquee').toUpperCase())).toEqual({ type: 'inconnue' })
	})
})
