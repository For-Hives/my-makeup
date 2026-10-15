import { describe, expect, test } from 'bun:test'
import { PROFILS_DU_JEU, type ProfilDuJeu } from '@/jeu-fictif/profils'
import { prixMinimal } from '@/lib/prix'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import { donneesStructureesDuProfil, filDArianeDuProfil, metadonneesDuProfil, titreDuProfil } from '@/lib/seo/profil'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITRE_MAX } from '@/lib/seo/texte'
import { type ProfilDeLaPage, type ProfilPublic, profilPublicDe } from '@/services/public/profils'
import { schemaDuProfil } from '../outils/schema-profil-json-ld'

/**
 * The head of the public page of a profile (ticket 105; plan 02 U47 to U50, and the schema half of
 * E65): title, description, structured data. On the twelve profile types of the fictional set, with
 * no database.
 */

function lireLeType(type: ProfilDuJeu, surcharge: Partial<ProfilDeLaPage> = {}): ProfilPublic {
	const doc: ProfilDeLaPage = {
		slug: type.attendu.slug,
		statut: type.attendu.statut,
		publiable: type.attendu.publiable,
		...type.profil,
		...surcharge,
	}
	const photo = type.photos.principale
		? { url: `https://photos.example.test/media/${type.photos.principale}`, width: 400, height: 400 }
		: null
	const { telephone = null, email = null } = type.profil.coordonnees ?? {}
	const coordonnees = type.profil.contactPublic === true && (telephone || email) ? { telephone, email } : null
	return profilPublicDe(doc, { photo, galerie: [], coordonnees })
}

const type = (cle: string): ProfilDuJeu => {
	const trouve = PROFILS_DU_JEU.find(profil => profil.cle === cle)
	if (!trouve) throw new Error(`pas de profil type « ${cle} »`)
	return trouve
}

describe('titre et description du profil', () => {
	test('les douze profils types : titre de 60 caractères au plus, description de 70 à 155, jamais « null »', () => {
		for (const profilType of PROFILS_DU_JEU) {
			const meta = metadonneesDuProfil(lireLeType(profilType))
			const titre = String((meta.title as { absolute: string }).absolute)
			expect(titre.length, profilType.cle).toBeLessThanOrEqual(TITRE_MAX)
			expect(titre, profilType.cle).not.toMatch(/\b(?:null|undefined|NaN)\b/)
			expect(String(meta.description).length, profilType.cle).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
			expect(String(meta.description).length, profilType.cle).toBeLessThanOrEqual(DESCRIPTION_MAX)
		}
	})

	test('le titre dit le nom, la spécialité et la ville, et la marque quand elle tient', () => {
		expect(titreDuProfil({ nom: 'Léa Martin', specialite: 'Maquillage mariage', lieu: 'Annecy' })).toBe(
			'Léa Martin – Maquillage mariage à Annecy | My-Makeup'
		)
		expect(titreDuProfil({ nom: 'Léa Martin', specialite: null, lieu: 'Annecy' })).toBe(
			'Léa Martin – maquilleuse à Annecy | My-Makeup'
		)
		expect(titreDuProfil({ nom: 'Léa Martin', specialite: null, lieu: null })).toBe(
			'Léa Martin – maquilleuse professionnelle | My-Makeup'
		)
		const long = titreDuProfil({ nom: 'A'.repeat(70), specialite: 'x', lieu: null })
		expect(long.length).toBeLessThanOrEqual(TITRE_MAX)
	})

	test('publiable : adresse canonique absolue sans barre finale ; sinon noindex et pas de canonique', () => {
		const publie = metadonneesDuProfil(lireLeType(type('reference')))
		expect(publie.alternates?.canonical).toBe(`https://my-makeup.fr/profil/${type('reference').attendu.slug}`)
		expect(publie.robots).toBeUndefined()
		const brouillon = metadonneesDuProfil(lireLeType(type('actif-non-publiable')))
		expect(brouillon.alternates).toBeUndefined()
		expect(brouillon.robots).toEqual({ index: false, follow: true })
	})
})

describe('U47 : ProfilePage → Person, avec des Offer en euros', () => {
	test('les douze profils types : le schéma strict passe', () => {
		for (const profilType of PROFILS_DU_JEU) {
			const donnees = donneesStructureesDuProfil(lireLeType(profilType))
			expect(() => schemaDuProfil.parse(JSON.parse(serializeJsonLd(donnees))), profilType.cle).not.toThrow()
		}
	})

	test('le profil de référence : nom, spécialité, zone, photo, réseaux, compétences, langues, offres', () => {
		const profil = lireLeType(type('reference'))
		const donnees = donneesStructureesDuProfil(profil) as { '@graph': Record<string, unknown>[] }
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
		const donnees = donneesStructureesDuProfil(profil) as {
			'@graph': { mainEntity: { makesOffer: { price?: number }[] } }[]
		}
		const prix = (donnees['@graph'][0]?.mainEntity.makesOffer ?? []).flatMap(({ price }) => price ?? [])
		expect(prix.length).toBeGreaterThan(1)
		expect(Math.min(...prix)).toBe(profil.prixMinimal ?? Number.NaN)
		expect(profil.prixMinimal).toBe(45)
		expect(profil.prixMinimal).toBe(
			prixMinimal([{ prixAPartirDe: 150 }, { prixAPartirDe: 45 }, { prixAPartirDe: null }])
		)
	})

	test('une offre sans montant reste une offre, sans prix ni devise', () => {
		const profil = lireLeType(type('reference'), {
			prestations: [
				{ nom: 'Sur mesure', prixTexte: 'Sur devis', prixAPartirDe: null },
				{ nom: 'Soirée', prixTexte: '60 €', prixAPartirDe: 60 },
			],
		})
		const personne = (donneesStructureesDuProfil(profil) as { '@graph': { mainEntity: { makesOffer: object[] } }[] })[
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
		for (const profilType of PROFILS_DU_JEU) {
			const profil = lireLeType(profilType)
			const texte = JSON.stringify(donneesStructureesDuProfil(profil))
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
		const texte = JSON.stringify(donneesStructureesDuProfil(profil))
		expect(texte).not.toContain(profilType.profil.coordonnees?.email ?? 'absent')
		expect(texte).not.toContain(profilType.profil.coordonnees?.telephone ?? 'absent')
	})

	test('un profil non publiable n’a que son fil d’Ariane, pas de personne', () => {
		const donnees = donneesStructureesDuProfil(lireLeType(type('actif-non-publiable'))) as {
			'@graph': { '@type': string }[]
		}
		expect(donnees['@graph'].map(noeud => noeud['@type'])).toEqual(['BreadcrumbList'])
	})
})

describe('U49 : fil d’Ariane', () => {
	test('l’accueil, puis le profil, en adresses absolues et positions croissantes', () => {
		const fil = filDArianeDuProfil({ nom: 'Léa Martin', slug: 'lea-martin' })
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
			prenom: 'Léa',
			nom: piege,
			description: `${piege} ${'texte '.repeat(30)}`,
			specialite: piege,
			competences: [{ nom: piege }],
			prestations: [{ nom: piege, description: piege, prixAPartirDe: 50, prixTexte: '50 €' }],
		})
		const donnees = donneesStructureesDuProfil(profil)
		const sortie = serializeJsonLd(donnees)
		expect(sortie).not.toMatch(/[<>&]/)
		expect(sortie.toLowerCase()).not.toContain('</script')
		expect(() => schemaDuProfil.parse(JSON.parse(sortie))).not.toThrow()
	})
})
