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

function lireLeType(type: DemoProfile, surcharge: Partial<ProfilePageData> = {}): PublicProfile {
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
	const { phone: telephone = null, email = null } = type.profil.contactDetails ?? {}
	const coordonnees = type.profil.publicContact === true && (telephone || email) ? { telephone, email } : null
	return publicProfileOf(doc, { photo, galerie: [], coordonnees })
}

const type = (cle: string): DemoProfile => {
	const trouve = DEMO_PROFILES.find(profil => profil.cle === cle)
	if (!trouve) throw new Error(`pas de profil type « ${cle} »`)
	return trouve
}

describe('titre et description du profil', () => {
	test('les douze profils types : titre de 60 caractères au plus, description de 70 à 155, jamais « null »', () => {
		for (const profilType of DEMO_PROFILES) {
			const meta = profileMetadata(lireLeType(profilType))
			const titre = String((meta.title as { absolute: string }).absolute)
			expect(titre.length, profilType.cle).toBeLessThanOrEqual(MAX_TITLE)
			expect(titre, profilType.cle).not.toMatch(/\b(?:null|undefined|NaN)\b/)
			expect(String(meta.description).length, profilType.cle).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
			expect(String(meta.description).length, profilType.cle).toBeLessThanOrEqual(DESCRIPTION_MAX)
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
		const publie = profileMetadata(lireLeType(type('reference')))
		expect(publie.alternates?.canonical).toBe(`https://my-makeup.fr/profil/${type('reference').attendu.slug}`)
		expect(publie.robots).toBeUndefined()
		const brouillon = profileMetadata(lireLeType(type('actif-non-publiable')))
		expect(brouillon.alternates).toBeUndefined()
		expect(brouillon.robots).toEqual({ index: false, follow: true })
	})
})

describe('U47 : ProfilePage → Person, avec des Offer en euros', () => {
	test('les douze profils types : le schéma strict passe', () => {
		for (const profilType of DEMO_PROFILES) {
			const donnees = profileStructuredData(lireLeType(profilType))
			expect(() => profileSchema.parse(JSON.parse(serializeJsonLd(donnees))), profilType.cle).not.toThrow()
		}
	})

	test('le profil de référence : nom, spécialité, zone, photo, réseaux, compétences, langues, offres', () => {
		const profil = lireLeType(type('reference'))
		const donnees = profileStructuredData(profil) as { '@graph': Record<string, unknown>[] }
		const page = donnees['@graph'][0] as { mainEntity: Record<string, unknown> }
		const personne = page.mainEntity
		expect(personne).toMatchObject({ '@type': 'Person', name: profil.nom, jobTitle: profil.specialite })
		expect(personne.areaServed).toEqual({ '@type': 'City', name: profil.lieu })
		expect(personne.image).toBe(profil.photo?.url)
		expect(personne.sameAs).toEqual(
			profil.liens.filter(l => l.canal !== 'email' && l.canal !== 'phone').map(l => l.href)
		)
		expect(personne.knowsAbout).toEqual(profil.competences.slice(0, 10))
		expect(personne.knowsLanguage).toEqual(profil.langues)
		const offres = personne.makesOffer as { price?: number; priceCurrency?: string }[]
		expect(offres).toHaveLength(profil.offres.length)
		expect(offres.length).toBeGreaterThan(0)
		for (const offre of offres) expect(offre.priceCurrency).toBe('EUR')
	})

	test('U37 : le prix du JSON-LD est le prix minimal du profil', () => {
		const profil = lireLeType(type('reference'))
		const donnees = profileStructuredData(profil) as {
			'@graph': { mainEntity: { makesOffer: { price?: number }[] } }[]
		}
		const prix = (donnees['@graph'][0]?.mainEntity.makesOffer ?? []).flatMap(({ price }) => price ?? [])
		expect(prix.length).toBeGreaterThan(1)
		expect(Math.min(...prix)).toBe(profil.prixMinimal ?? Number.NaN)
		expect(profil.prixMinimal).toBe(45)
		expect(profil.prixMinimal).toBe(minimumPrice([{ priceFrom: 150 }, { priceFrom: 45 }, { priceFrom: null }]))
	})

	test('une offre sans montant reste une offre, sans prix ni devise', () => {
		const profil = lireLeType(type('reference'), {
			serviceOffers: [
				{ name: 'Sur mesure', priceText: 'Sur devis', priceFrom: null },
				{ name: 'Soirée', priceText: '60 €', priceFrom: 60 },
			],
		})
		const personne = (profileStructuredData(profil) as { '@graph': { mainEntity: { makesOffer: object[] } }[] })[
			'@graph'
		][0]?.mainEntity
		expect(personne?.makesOffer).toHaveLength(2)
		expect(personne?.makesOffer[0]).not.toHaveProperty('price')
		expect(personne?.makesOffer[0]).not.toHaveProperty('priceCurrency')
		expect(profil.prixMinimal).toBe(60)
	})
})

describe('U48 : rien de non public, rien de nul', () => {
	test('ni email, ni téléphone, ni adresse postale, ni note, quel que soit le profil, même publié', () => {
		for (const profilType of DEMO_PROFILES) {
			const profil = lireLeType(profilType)
			const texte = JSON.stringify(profileStructuredData(profil))
			for (const interdit of [
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
				expect(texte, `${profilType.cle} ${interdit}`).not.toContain(interdit)
			for (const coordonnee of [profil.coordonnees?.telephone, profil.coordonnees?.email])
				if (coordonnee) expect(texte, profilType.cle).not.toContain(coordonnee)
			expect(texte, profilType.cle).not.toMatch(/\b(?:null|undefined|NaN)\b/)
		}
	})

	test('le profil qui n’a pas publié ses coordonnées ne les a jamais lues, et rien ne les redonne', () => {
		const profilType = type('sans-contact-public')
		const profil = lireLeType(profilType)
		expect(profil.coordonnees).toBeNull()
		const texte = JSON.stringify(profileStructuredData(profil))
		expect(texte).not.toContain(profilType.profil.contactDetails?.email ?? 'absent')
		expect(texte).not.toContain(profilType.profil.contactDetails?.phone ?? 'absent')
	})

	test('un profil non publiable n’a que son fil d’Ariane, pas de personne', () => {
		const donnees = profileStructuredData(lireLeType(type('actif-non-publiable'))) as {
			'@graph': { '@type': string }[]
		}
		expect(donnees['@graph'].map(noeud => noeud['@type'])).toEqual(['BreadcrumbList'])
	})
})

describe('U49 : fil d’Ariane', () => {
	test('l’accueil, puis le profil, en adresses absolues et positions croissantes', () => {
		const fil = profileBreadcrumb({ nom: 'Léa Martin', slug: 'lea-martin' })
		expect(fil.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Accueil', item: 'https://my-makeup.fr' },
			{ '@type': 'ListItem', position: 2, name: 'Léa Martin', item: 'https://my-makeup.fr/profil/lea-martin' },
		])
	})
})

describe('U50 : un texte avec une balise de fermeture de script', () => {
	test('la description, le nom et les offres ne ferment pas la balise, et se relisent à l’identique', () => {
		const piege = '</script><img src=x onerror=alert(1)> & fin'
		const profil = lireLeType(type('reference'), {
			firstName: 'Léa',
			lastName: piege,
			description: `${piege} ${'texte '.repeat(30)}`,
			specialty: piege,
			skills: [{ name: piege }],
			serviceOffers: [{ name: piege, description: piege, priceFrom: 50, priceText: '50 €' }],
		})
		const donnees = profileStructuredData(profil)
		const sortie = serializeJsonLd(donnees)
		expect(sortie).not.toMatch(/[<>&]/)
		expect(sortie.toLowerCase()).not.toContain('</script')
		expect(() => profileSchema.parse(JSON.parse(sortie))).not.toThrow()
	})
})
