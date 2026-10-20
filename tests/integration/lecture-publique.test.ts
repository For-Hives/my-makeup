import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type ProfilesSummary, placeDemoProfiles } from '@/demo-data/loading'
import { listProfiles, readProfileUrlTarget, readPublicProfile } from '@/services/public/profiles'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'

/**
 * The public reading of the profiles on the fictional set of the bench (ticket 071; plan 02 U20):
 * the empty, the unavailable and the hidden are out of the list; the contact details leave only
 * when their owner published them; a hidden profile gives nothing.
 */

let bilan: ProfilesSummary

beforeAll(async () => {
	bilan = await placeDemoProfiles(await payloadDeTest())
}, 120_000)

afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

const slugDe = (cle: string): string => {
	const pose = bilan.profils.find(profil => profil.cle === cle)
	if (!pose) throw new Error(`le profil type « ${cle} » manque au bilan`)
	return pose.slug
}

describe('La liste : le vide, l’indisponible et le masqué sont absents', () => {
	test('les profils listés du jeu, et eux seuls', async () => {
		const payload = await payloadDeTest()

		const { cartes, totalDocs } = await listProfiles(payload, { limite: 100 })

		const slugs = cartes.map(({ slug }) => slug)
		expect(totalDocs).toBe(cartes.length)
		for (const cle of ['vide', 'indisponible', 'masquee']) expect(slugs, cle).not.toContain(slugDe(cle))
		// Availability never set counts as available (U20); a profile that cannot be published is still listed.
		for (const cle of ['reference', 'disponibilite-inconnue', 'actif-non-publiable', 'sans-contact-public'])
			expect(slugs, cle).toContain(slugDe(cle))
	})

	test('une carte ne porte jamais de coordonnées, même quand la maquilleuse les publie', async () => {
		const payload = await payloadDeTest()

		const { cartes } = await listProfiles(payload, { limite: 100 })

		// The address of a photo is made of random characters: it is checked apart, the rest has no digit pair to hide.
		const texte = JSON.stringify(cartes.map(({ photo: _photo, ...reste }) => reste))
		expect(texte).not.toContain('@')
		expect(texte).not.toMatch(/0[1-9][ .]?\d{2}/)
		for (const carte of cartes)
			expect(Object.keys(carte).sort()).toEqual([
				'lieu',
				'nom',
				'photo',
				'pid',
				'slug',
				'specialite',
				'superMaquilleuse',
			])
	})

	test('la pagination est stable : deux pages de cinq se suivent sans se recouper', async () => {
		const payload = await payloadDeTest()

		const [un, deux] = [
			await listProfiles(payload, { page: 1, limite: 5 }),
			await listProfiles(payload, { page: 2, limite: 5 }),
		]

		expect(un.cartes).toHaveLength(5)
		expect(un.hasNextPage).toBe(true)
		const vus = new Set(un.cartes.map(({ slug }) => slug))
		expect(deux.cartes.every(({ slug }) => !vus.has(slug))).toBe(true)
	})
})

describe('La lecture par slug', () => {
	test('les coordonnées sortent seulement quand la maquilleuse les publie', async () => {
		const payload = await payloadDeTest()

		const publie = await readPublicProfile(payload, slugDe('reference'))
		const ferme = await readPublicProfile(payload, slugDe('sans-contact-public'))

		expect(publie?.coordonnees?.telephone).toBeTruthy()
		expect(publie?.coordonnees?.email).toContain('@')
		expect(ferme).not.toBeNull()
		expect(ferme?.coordonnees).toBeNull()
		expect(JSON.stringify(ferme)).not.toContain('louise-girard.example.test')
		expect(JSON.stringify(ferme)).not.toContain('06 39 98 10 08')
	})

	test('indexable seulement quand le profil est publiable', async () => {
		const payload = await payloadDeTest()

		expect((await readPublicProfile(payload, slugDe('reference')))?.indexable).toBe(true)
		const nonPubliable = await readPublicProfile(payload, slugDe('actif-non-publiable'))
		expect(nonPubliable).not.toBeNull()
		expect(nonPubliable?.indexable).toBe(false)
	})

	test('masqué : rien', async () => {
		const payload = await payloadDeTest()

		expect(await readPublicProfile(payload, slugDe('masquee'))).toBeNull()
	})
})

describe('La lecture du profil pour sa page (tickets 101 et 102)', () => {
	test('le profil de référence : zone, photo, listes dans l’ordre et canaux publiés', async () => {
		const payload = await payloadDeTest()

		const profil = await readPublicProfile(payload, slugDe('reference'))

		expect(profil).toMatchObject({
			nom: 'Inès Morel',
			nomArtiste: 'Inès Morel Maquillage',
			zone: 'Annecy et 30 km autour',
			lieu: 'Annecy',
			seDeplace: true,
			disponible: true,
		})
		expect(profil?.photo?.url).toMatch(/^https?:\/\//)
		expect(profil?.prestations.map(({ nom }) => nom)).toEqual([
			'Maquillage de la mariée',
			'Essai maquillage',
			'Maquillage des invitées',
		])
		expect(profil?.prestations[0]?.options.map(({ nom }) => nom)).toEqual(['Retouches jusqu’au dîner'])
		expect(profil?.prestations[0]?.prix).toEqual(['À partir de 180 €'])
		expect(profil?.competences).toEqual(['Maquillage longue tenue', 'Peaux sensibles', 'Coiffure de mariée'])
		expect(profil?.langues).toEqual(['Français', 'Anglais', 'Italien'])
		expect(profil?.formations.map(({ obtenu }) => obtenu)).toEqual(['juin 2014', 'novembre 2015'])
		expect(profil?.experiences.map(({ periode }) => periode)).toEqual([
			'septembre 2015 - août 2018',
			'septembre 2018 - aujourd’hui',
		])
		expect(profil?.liens.map(({ canal }) => canal)).toEqual(['instagram', 'email', 'phone', 'website'])
	})

	test('sans contact public : les réseaux seuls, jamais le téléphone ni l’email', async () => {
		const payload = await payloadDeTest()

		const profil = await readPublicProfile(payload, slugDe('sans-contact-public'))

		expect(profil?.liens).toEqual([])
		expect(JSON.stringify(profil)).not.toMatch(/06 39 98|example\.test/)
	})

	test('un profil vide (brouillon) est lu mais pas indexable, une disponibilité jamais posée compte comme disponible', async () => {
		const payload = await payloadDeTest()

		const vide = await readPublicProfile(payload, slugDe('vide'))
		const inconnue = await readPublicProfile(payload, slugDe('disponibilite-inconnue'))

		// A draft answers its page in noindex (ticket 104).
		expect(vide?.indexable).toBe(false)
		expect(inconnue?.disponible).toBe(true)
		expect((await readPublicProfile(payload, slugDe('indisponible')))?.disponible).toBe(false)
	})
})

describe('L’adresse d’un profil (ticket 104)', () => {
	test('le slug donne le profil, publié ou non ; le masqué et l’inconnu ne donnent rien', async () => {
		const payload = await payloadDeTest()

		expect((await readProfileUrlTarget(payload, slugDe('reference'))).type).toBe('profil')
		expect((await readProfileUrlTarget(payload, slugDe('vide'))).type).toBe('profil')
		expect(await readProfileUrlTarget(payload, slugDe('masquee'))).toEqual({ type: 'inconnue' })
		expect(await readProfileUrlTarget(payload, 'audit-inexistant-zz9')).toEqual({ type: 'inconnue' })
		expect(await readProfileUrlTarget(payload, 'a\u0000b')).toEqual({ type: 'inconnue' })
	})

	test('l’ancien nom d’utilisateur et une variante du slug mènent au slug, jamais à un masqué', async () => {
		const payload = await payloadDeTest()
		const slug = slugDe('ancien-nom-accentue')

		expect(await readProfileUrlTarget(payload, 'zoé lefèvre')).toEqual({ type: 'redirection', slug })
		expect(await readProfileUrlTarget(payload, slug.toUpperCase())).toEqual({ type: 'redirection', slug })
		expect(await readProfileUrlTarget(payload, slugDe('masquee').toUpperCase())).toEqual({ type: 'inconnue' })
	})
})
