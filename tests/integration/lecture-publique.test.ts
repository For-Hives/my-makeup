import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { type BilanDesProfils, poserLesProfilsDuJeu } from '@/jeu-fictif/chargement'
import { lireLeProfilPublic, listerLesProfils } from '@/services/public/profils'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { viderLeStockage } from '../outils/s3'

/**
 * The public reading of the profiles on the fictional set of the bench (ticket 071; plan 02 U20):
 * the empty, the unavailable and the hidden are out of the list; the contact details leave only
 * when their owner published them; a hidden profile gives nothing.
 */

let bilan: BilanDesProfils

beforeAll(async () => {
	bilan = await poserLesProfilsDuJeu(await payloadDeTest())
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

		const { cartes, totalDocs } = await listerLesProfils(payload, { limite: 100 })

		const slugs = cartes.map(({ slug }) => slug)
		expect(totalDocs).toBe(cartes.length)
		for (const cle of ['vide', 'indisponible', 'masquee']) expect(slugs, cle).not.toContain(slugDe(cle))
		// Availability never set counts as available (U20); a profile that cannot be published is still listed.
		for (const cle of ['reference', 'disponibilite-inconnue', 'actif-non-publiable', 'sans-contact-public'])
			expect(slugs, cle).toContain(slugDe(cle))
	})

	test('une carte ne porte jamais de coordonnées, même quand la maquilleuse les publie', async () => {
		const payload = await payloadDeTest()

		const { cartes } = await listerLesProfils(payload, { limite: 100 })

		// The address of a photo is made of random characters: it is checked apart, the rest has no digit pair to hide.
		const texte = JSON.stringify(cartes.map(({ photo: _photo, ...reste }) => reste))
		expect(texte).not.toContain('@')
		expect(texte).not.toMatch(/0[1-9][ .]?\d{2}/)
		for (const carte of cartes)
			expect(Object.keys(carte).sort()).toEqual(['lieu', 'nom', 'photo', 'slug', 'specialite', 'superMaquilleuse'])
	})

	test('la pagination est stable : deux pages de cinq se suivent sans se recouper', async () => {
		const payload = await payloadDeTest()

		const [un, deux] = [
			await listerLesProfils(payload, { page: 1, limite: 5 }),
			await listerLesProfils(payload, { page: 2, limite: 5 }),
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

		const publie = await lireLeProfilPublic(payload, slugDe('reference'))
		const ferme = await lireLeProfilPublic(payload, slugDe('sans-contact-public'))

		expect(publie?.coordonnees?.telephone).toBeTruthy()
		expect(publie?.coordonnees?.email).toContain('@')
		expect(ferme).not.toBeNull()
		expect(ferme?.coordonnees).toBeNull()
		expect(JSON.stringify(ferme)).not.toContain('louise-girard.example.test')
		expect(JSON.stringify(ferme)).not.toContain('06 39 98 10 08')
	})

	test('indexable seulement quand le profil est publiable', async () => {
		const payload = await payloadDeTest()

		expect((await lireLeProfilPublic(payload, slugDe('reference')))?.indexable).toBe(true)
		const nonPubliable = await lireLeProfilPublic(payload, slugDe('actif-non-publiable'))
		expect(nonPubliable).not.toBeNull()
		expect(nonPubliable?.indexable).toBe(false)
	})

	test('masqué : rien', async () => {
		const payload = await payloadDeTest()

		expect(await lireLeProfilPublic(payload, slugDe('masquee'))).toBeNull()
	})
})
