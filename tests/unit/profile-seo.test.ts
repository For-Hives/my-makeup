import { describe, expect, test } from 'bun:test'
import { DEMO_PROFILES, type DemoProfile } from '@/demo-data/profiles'
import { minimumPrice } from '@/lib/price'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import { profileBreadcrumb, profileMetadata, profileStructuredData, profileTitle } from '@/lib/seo/profile'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, MAX_TITLE } from '@/lib/seo/text'
import { type ProfilePageData, type PublicProfile, publicProfileOf } from '@/services/public/profiles'
import { profileSchema } from '../support/profile-json-ld-schema'

/**
 * The head of the public page of a profile (ticket 105; plan 02 U47 to U50, and the schema half of
 * E65): title, description, structured data. On the twelve profile types of the fictional set, with
 * no database.
 */

function readType(type: DemoProfile, surcharge: Partial<ProfilePageData> = {}): PublicProfile {
	const doc: ProfilePageData = {
		slug: type.attendu.slug,
		status: type.attendu.status,
		publishable: type.attendu.publishable,
		...type.profil,
		...surcharge,
	}
	const photo = type.photos.principale
		? { url: `https://photos.example.test/media/${type.photos.principale}`, width: 400, height: 400 }
		: null
	const { phone = null, email = null } = type.profil.contactDetails ?? {}
	const contactDetails = type.profil.publicContact === true && (phone || email) ? { telephone: phone, email } : null
	return publicProfileOf(doc, { photo, galerie: [], coordonnees: contactDetails })
}

const type = (cle: string): DemoProfile => {
	const found = DEMO_PROFILES.find(profil => profil.cle === cle)
	if (!found) throw new Error(`pas de profil type « ${cle} »`)
	return found
}

describe('titre et description du profil', () => {
	test('les douze profils types : titre de 60 caractères au plus, description de 70 à 155, jamais « null »', () => {
		for (const profileType of DEMO_PROFILES) {
			const meta = profileMetadata(readType(profileType))
			const title = String((meta.title as { absolute: string }).absolute)
			expect(title.length, profileType.cle).toBeLessThanOrEqual(MAX_TITLE)
			expect(title, profileType.cle).not.toMatch(/\b(?:null|undefined|NaN)\b/)
			expect(String(meta.description).length, profileType.cle).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
			expect(String(meta.description).length, profileType.cle).toBeLessThanOrEqual(DESCRIPTION_MAX)
		}
	})

	test('le titre dit le nom, la spécialité et la ville, et la marque quand elle tient', () => {
		expect(profileTitle({ nom: 'Léa Martin', specialite: 'Maquillage mariage', lieu: 'Annecy' })).toBe(
			'Léa Martin – Maquillage mariage à Annecy | My-Makeup'
		)
		expect(profileTitle({ nom: 'Léa Martin', specialite: null, lieu: 'Annecy' })).toBe(
			'Léa Martin – maquilleuse à Annecy | My-Makeup'
		)
		expect(profileTitle({ nom: 'Léa Martin', specialite: null, lieu: null })).toBe(
			'Léa Martin – maquilleuse professionnelle | My-Makeup'
		)
		const long = profileTitle({ nom: 'A'.repeat(70), specialite: 'x', lieu: null })
		expect(long.length).toBeLessThanOrEqual(MAX_TITLE)
	})

	test('publiable : adresse canonique absolue sans barre finale ; sinon noindex et pas de canonique', () => {
		const published = profileMetadata(readType(type('reference')))
		expect(published.alternates?.canonical).toBe(`https://my-makeup.fr/profil/${type('reference').attendu.slug}`)
		expect(published.robots).toBeUndefined()
		const draft = profileMetadata(readType(type('actif-non-publiable')))
		expect(draft.alternates).toBeUndefined()
		expect(draft.robots).toEqual({ index: false, follow: true })
	})
})

describe('U47 : ProfilePage → Person, avec des Offer en euros', () => {
	test('les douze profils types : le schéma strict passe', () => {
		for (const profileType of DEMO_PROFILES) {
			const data = profileStructuredData(readType(profileType))
			expect(() => profileSchema.parse(JSON.parse(serializeJsonLd(data))), profileType.cle).not.toThrow()
		}
	})

	test('le profil de référence : nom, spécialité, zone, photo, réseaux, compétences, langues, offres', () => {
		const profile = readType(type('reference'))
		const data = profileStructuredData(profile) as { '@graph': Record<string, unknown>[] }
		const page = data['@graph'][0] as { mainEntity: Record<string, unknown> }
		const person = page.mainEntity
		expect(person).toMatchObject({ '@type': 'Person', name: profile.nom, jobTitle: profile.specialite })
		expect(person.areaServed).toEqual({ '@type': 'City', name: profile.lieu })
		expect(person.image).toBe(profile.photo?.url)
		expect(person.sameAs).toEqual(
			profile.liens.filter(l => l.canal !== 'email' && l.canal !== 'phone').map(l => l.href)
		)
		expect(person.knowsAbout).toEqual(profile.competences.slice(0, 10))
		expect(person.knowsLanguage).toEqual(profile.langues)
		const offers = person.makesOffer as { price?: number; priceCurrency?: string }[]
		expect(offers).toHaveLength(profile.offres.length)
		expect(offers.length).toBeGreaterThan(0)
		for (const offer of offers) expect(offer.priceCurrency).toBe('EUR')
	})

	test('U37 : le prix du JSON-LD est le prix minimal du profil', () => {
		const profile = readType(type('reference'))
		const data = profileStructuredData(profile) as {
			'@graph': { mainEntity: { makesOffer: { price?: number }[] } }[]
		}
		const priceValue = (data['@graph'][0]?.mainEntity.makesOffer ?? []).flatMap(({ price }) => price ?? [])
		expect(priceValue.length).toBeGreaterThan(1)
		expect(Math.min(...priceValue)).toBe(profile.prixMinimal ?? Number.NaN)
		expect(profile.prixMinimal).toBe(45)
		expect(profile.prixMinimal).toBe(minimumPrice([{ priceFrom: 150 }, { priceFrom: 45 }, { priceFrom: null }]))
	})

	test('une offre sans montant reste une offre, sans prix ni devise', () => {
		const profile = readType(type('reference'), {
			serviceOffers: [
				{ name: 'Sur mesure', priceText: 'Sur devis', priceFrom: null },
				{ name: 'Soirée', priceText: '60 €', priceFrom: 60 },
			],
		})
		const person = (profileStructuredData(profile) as { '@graph': { mainEntity: { makesOffer: object[] } }[] })[
			'@graph'
		][0]?.mainEntity
		expect(person?.makesOffer).toHaveLength(2)
		expect(person?.makesOffer[0]).not.toHaveProperty('price')
		expect(person?.makesOffer[0]).not.toHaveProperty('priceCurrency')
		expect(profile.prixMinimal).toBe(60)
	})
})

describe('U48 : rien de non public, rien de nul', () => {
	test('ni email, ni téléphone, ni adresse postale, ni note, quel que soit le profil, même publié', () => {
		for (const profileType of DEMO_PROFILES) {
			const profile = readType(profileType)
			const text = JSON.stringify(profileStructuredData(profile))
			for (const forbidden of [
				'AggregateRating',
				'aggregateRating',
				'PostalAddress',
				'address',
				'telephone',
				'email',
				'Review',
				'mailto:',
				'tel:',
			])
				expect(text, `${profileType.cle} ${forbidden}`).not.toContain(forbidden)
			for (const contactDetail of [profile.coordonnees?.telephone, profile.coordonnees?.email])
				if (contactDetail) expect(text, profileType.cle).not.toContain(contactDetail)
			expect(text, profileType.cle).not.toMatch(/\b(?:null|undefined|NaN)\b/)
		}
	})

	test('le profil qui n’a pas publié ses coordonnées ne les a jamais lues, et rien ne les redonne', () => {
		const profileType = type('sans-contact-public')
		const profile = readType(profileType)
		expect(profile.coordonnees).toBeNull()
		const text = JSON.stringify(profileStructuredData(profile))
		expect(text).not.toContain(profileType.profil.contactDetails?.email ?? 'absent')
		expect(text).not.toContain(profileType.profil.contactDetails?.phone ?? 'absent')
	})

	test('un profil non publiable n’a que son fil d’Ariane, pas de personne', () => {
		const data = profileStructuredData(readType(type('actif-non-publiable'))) as {
			'@graph': { '@type': string }[]
		}
		expect(data['@graph'].map(noeud => noeud['@type'])).toEqual(['BreadcrumbList'])
	})
})

describe('U49 : fil d’Ariane', () => {
	test('l’accueil, puis le profil, en adresses absolues et positions croissantes', () => {
		const thread = profileBreadcrumb({ nom: 'Léa Martin', slug: 'lea-martin' })
		expect(thread.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://my-makeup.fr' },
			{ '@type': 'ListItem', position: 2, name: 'Léa Martin', item: 'https://my-makeup.fr/profil/lea-martin' },
		])
	})
})

describe('U50 : un texte avec une balise de fermeture de script', () => {
	test('la description, le nom et les offres ne ferment pas la balise, et se relisent à l’identique', () => {
		const trap = '</script><img src=x onerror=alert(1)> & fin'
		const profile = readType(type('reference'), {
			firstName: 'Léa',
			lastName: trap,
			description: `${trap} ${'texte '.repeat(30)}`,
			specialty: trap,
			skills: [{ name: trap }],
			serviceOffers: [{ name: trap, description: trap, priceFrom: 50, priceText: '50 €' }],
		})
		const data = profileStructuredData(profile)
		const output = serializeJsonLd(data)
		expect(output).not.toMatch(/[<>&]/)
		expect(output.toLowerCase()).not.toContain('</script')
		expect(() => profileSchema.parse(JSON.parse(output))).not.toThrow()
	})
})
