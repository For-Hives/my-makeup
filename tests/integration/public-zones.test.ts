import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { placeProfile, readDemoPhoto } from '@/demo-data/loading'
import { DEMO_PROFILES, DEMO_ZONE_PROFILES, type DemoProfile } from '@/demo-data/profiles'
import { municipalitiesOfPostalCodes } from '@/lib/search/place'
import { find } from '@/lib/search/results'
import { profileMetadata, profileStructuredData } from '@/lib/seo/profile'
import { sitemapEntries, sitemapXml } from '@/lib/seo/sitemap'
import { readIndexableProfiles } from '@/services/public/indexable-pages'
import { readDirectory, readPublicProfile } from '@/services/public/profiles'
import { emptyBase, testPayload } from '../support/payload-test'
import { profileSchema } from '../support/profile-json-ld-schema'
import { emptyStorage } from '../support/s3'

/**
 * The zones the public reads (tickets 263 and 264; PLAN-ZONES.md §3.3 and §3.4), on the bench: the search by
 * postal code and by country over the real directory, and the page, the structured data and the sitemap of
 * a profile whose zone is abroad. The profile types are those of the fictional set (src/demo-data).
 */

const REGIONAL_INDICATORS = /[\u{1F1E6}-\u{1F1FF}]/u
const TYPES: DemoProfile[] = [...DEMO_PROFILES.filter(({ cle: key }) => key === 'reference'), ...DEMO_ZONE_PROFILES]
const slugOf = (key: string): string => {
	const found = TYPES.find(type => type.cle === key)
	if (!found) throw new Error(`pas de profil type « ${key} »`)
	return found.attendu.slug
}

let payload: Payload

beforeAll(async () => {
	payload = await testPayload()
	for (const type of TYPES) await placeProfile(payload, type, readDemoPhoto, false)
}, 120_000)

afterAll(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

describe('263 : la recherche sur l’annuaire de la base', () => {
	test('un code postal partagé : les profils des deux communes d’abord, le département ensuite, les communes nommées', async () => {
		const directory = await readDirectory(payload)
		const { locaux: local } = find(directory, { search: '', city: '74990' })

		const slugs = local.map(({ carte }) => carte.slug)
		expect(slugs.slice(0, 2).sort()).toEqual([slugOf('code-postal-partage-a'), slugOf('code-postal-partage-b')].sort())
		// The département comes second: Annecy is in it, the countries never are.
		expect(slugs).toContain(slugOf('reference'))
		expect(slugs).not.toContain(slugOf('zone-belgique'))
		expect(municipalitiesOfPostalCodes(local, '74990').sort()).toEqual(['Hautcombe', 'Valbrume'])
	})

	test('les codes postaux d’une commune sortent de la base avec son profil, sans coordonnées', async () => {
		const directory = await readDirectory(payload)
		const annecy = directory.find(({ carte }) => carte.slug === slugOf('reference'))
		expect(annecy?.postalCodes).toEqual(['74000'])
		expect(find(directory, { search: '', city: '74000' }).locaux[0]?.carte.slug).toBe(slugOf('reference'))
		expect(JSON.stringify(directory)).not.toMatch(/latitude|longitude|inseeCode/)
	})

	test('« Belgique », « Bruxelles » et « Italie » classent les profils de pays au premier rang', async () => {
		const directory = await readDirectory(payload)
		const first = (city: string) => find(directory, { search: '', city }).locaux.map(({ carte }) => carte.slug)

		expect(first('Belgique')).toEqual([slugOf('zone-belgique')])
		expect(first('Bruxelles')).toEqual([slugOf('zone-belgique')])
		expect(first('Italie')).toEqual([slugOf('zone-france-italie')])
	})

	test('un profil [FR, IT] se déplace pour une ville française, et aucun profil de pays n’est d’un département', async () => {
		const directory = await readDirectory(payload)
		const found = find(directory, { search: '', city: 'Annecy' })

		const move = found.sections.find(({ cle }) => cle === 'deplacent')
		expect(move?.profils.map(({ carte }) => carte.slug)).toContain(slugOf('zone-france-italie'))
		const byDepartment = found.sections.find(({ cle }) => cle === 'departement')
		for (const key of ['zone-belgique', 'zone-france-italie'])
			expect(byDepartment?.profils.map(({ carte }) => carte.slug) ?? []).not.toContain(slugOf(key))
	})
})

describe('264 : la page, les données structurées et le sitemap d’un profil de pays', () => {
	test('la lecture publique : le texte de zone sans drapeau, les drapeaux à part', async () => {
		const belgium = await readPublicProfile(payload, slugOf('zone-belgique'))
		const several = await readPublicProfile(payload, slugOf('zone-france-italie'))

		expect(belgium).toMatchObject({
			zone: 'Bruxelles (Belgique)',
			lieu: 'Bruxelles (Belgique)',
			flags: ['🇧🇪'],
			indexable: true,
		})
		expect(several).toMatchObject({ zone: 'France et Italie', flags: ['🇫🇷', '🇮🇹'], indexable: true })
		for (const profile of [belgium, several])
			expect(JSON.stringify([profile?.zone, profile?.lieu, profile?.placePhrase, profile?.area])).not.toMatch(
				REGIONAL_INDICATORS
			)
	})

	test('titre, canonique et données structurées passent : aucun City ne porte un nom de pays', async () => {
		for (const key of ['zone-belgique', 'zone-france-italie']) {
			const profile = await readPublicProfile(payload, slugOf(key))
			if (!profile) throw new Error(key)
			const meta = profileMetadata(profile)
			expect(meta.alternates?.canonical).toBe(`https://my-makeup.fr/profil/${slugOf(key)}`)
			expect(meta.robots).toBeUndefined()
			const output = JSON.stringify(profileStructuredData(profile))
			expect(() => profileSchema.parse(JSON.parse(output)), key).not.toThrow()
			expect(output).not.toMatch(REGIONAL_INDICATORS)
		}
	})

	test('le sitemap les liste, et ne liste pas le profil sans zone', async () => {
		const profiles = await readIndexableProfiles(payload)
		const xml = sitemapXml(sitemapEntries({ profils: profiles, talents: [], articles: [] }))

		for (const key of [
			'reference',
			'zone-belgique',
			'zone-france-italie',
			'code-postal-partage-a',
			'code-postal-partage-b',
		])
			expect(xml, key).toContain(`https://my-makeup.fr/profil/${slugOf(key)}<`)
		expect(xml).not.toContain(`/profil/${slugOf('zone-a-revoir')}<`)
	})
})
