import { describe, expect, test } from 'bun:test'
import { type DashboardProfile, profileCards, SECTIONS } from '@/lib/dashboard/cards'

/** The cards of the page of her space (ticket 118): the value stored, or nothing — never « null ». */

const EMPTY: DashboardProfile = { id: 1 }

const card = (profil: DashboardProfile, section: string) => {
	const found = profileCards(profil).find(c => c.section === section)
	if (!found) throw new Error(`pas de carte ${section}`)
	return found
}

describe('une carte par section, dans l’ordre de la page', () => {
	test('un profil vide a toutes ses cartes, et aucune valeur', () => {
		const cards = profileCards(EMPTY)
		expect(cards.map(c => c.section)).toEqual([...SECTIONS])
		for (const { lignes: lines } of cards) {
			expect(lines.length).toBeGreaterThan(0)
		}
		const values = cards.flatMap(c => c.lignes.map(l => l.valeur))
		// The coordinates line « shown on your profile » is a yes/no; an empty profile reads « Disponible » (ticket 124); the rest is empty.
		expect(values.filter(v => v !== null)).toEqual(['Disponible', 'Non'])
	})
})

describe('les valeurs enregistrées', () => {
	const PROFILE: DashboardProfile = {
		id: 2,
		firstName: 'Léa',
		lastName: 'Fictive',
		artistName: 'Studio Fictif',
		specialty: 'Maquillage mariée',
		description: 'Une ligne\nUne autre',
		city: { name: 'Annecy', department: '74' },
		radiusKm: 30,
		homeService: true,
		available: false,
		skills: [{ name: 'Teint' }, { name: 'Regard' }],
		languages: [{ name: 'Français' }],
		courses: [{ diploma: 'CAP esthétique', school: 'École fictive', graduatedAt: '2020-01-15T12:00:00.000Z' }],
		experiences: [{ jobTitle: 'Maquilleuse', company: 'Studio', startDate: '2021-03-01T12:00:00.000Z' }],
		serviceOffers: [{ name: 'Mariée', priceText: 'à partir de 80 €', priceFrom: 80 }],
		networks: { instagram: '@studio.fictif', website: 'https://studio.example.test' },
		contactDetails: { phone: '0100000000', email: 'lea@example.test' },
		publicContact: true,
		gallery: [1, 2, 3],
		mainPicture: 7,
	}

	test('chaque carte porte ce qui est stocké', () => {
		expect(card(PROFILE, 'identite').lignes.map(l => l.valeur)).toEqual([
			'Léa',
			'Fictive',
			'Studio Fictif',
			'Maquillage mariée',
		])
		expect(card(PROFILE, 'localisation').lignes.map(l => l.valeur)).toEqual(['Annecy (74)', '30 km', 'Oui'])
		expect(card(PROFILE, 'disponibilite').lignes[0]?.valeur).toBe('Pas disponible en ce moment')
		expect(card(PROFILE, 'disponibilite').lignes[1]?.valeur).toContain('n’apparaît plus')
		expect(card(PROFILE, 'competences').lignes.map(l => l.valeur)).toEqual(['Teint', 'Regard'])
		expect(card(PROFILE, 'formations').lignes[0]?.valeur).toBe('CAP esthétique - École fictive - janvier 2020')
		expect(card(PROFILE, 'experiences').lignes[0]?.valeur).toBe('Maquilleuse - Studio - mars 2021 - aujourd’hui')
		expect(card(PROFILE, 'reseaux').lignes.map(l => l.libelle)).toEqual(['Instagram', 'Site web'])
		expect(card(PROFILE, 'portfolio').lignes[0]?.valeur).toBe('3 photos')
		expect(card(PROFILE, 'photo').lignes[0]?.valeur).toBe('Photo ajoutée')
		expect(card(PROFILE, 'coordonnees').lignes.map(l => l.valeur)).toEqual(['0100000000', 'lea@example.test', 'Oui'])
		expect(card(PROFILE, 'prestations').lignes[0]?.valeur).toContain('Mariée')
	})

	test('les mots « null » et « undefined » enregistrés par erreur ne s’affichent jamais', () => {
		const sale: DashboardProfile = {
			id: 3,
			firstName: 'null',
			lastName: ' undefined ',
			specialty: '   ',
			description: 'null',
			skills: [{ name: 'null' }, { name: null }],
			networks: { instagram: 'undefined' },
		}
		const texts = profileCards(sale).flatMap(c => c.lignes.map(l => l.valeur))
		for (const value of texts) expect(value === null || !/null|undefined/i.test(value)).toBe(true)
		expect(
			card(sale, 'identite')
				.lignes.slice(0, 2)
				.map(l => l.valeur)
		).toEqual([null, null])
		expect(card(sale, 'competences').lignes).toEqual([{ valeur: null }])
	})
})

describe('266 : la carte d’une zone de pays dit ce que dit la page publique, sans drapeau', () => {
	const row = (profil: DashboardProfile) => card(profil, 'localisation').lignes.map(l => [l.libelle, l.valeur])

	test('une ville et un pays, avec un rayon', () => {
		expect(
			row({ id: 3, zoneKind: 'countries', countries: ['BE'], town: 'Bruxelles', radiusKm: 30, homeService: true })
		).toEqual([
			['Zone', 'Bruxelles (Belgique) et 30 km autour'],
			['Se déplace à domicile', 'Oui'],
		])
	})

	test('un pays seul, plusieurs pays : le rayon n’y est pas lu', () => {
		expect(row({ id: 3, zoneKind: 'countries', countries: ['BE'], radiusKm: 30, homeService: false })).toEqual([
			['Zone', 'Belgique'],
			['Se déplace à domicile', 'Non'],
		])
		expect(row({ id: 3, zoneKind: 'countries', countries: ['FR', 'IT'], radiusKm: 30, homeService: true })).toEqual([
			['Zone', 'France et Italie'],
			['Se déplace à domicile', 'Oui'],
		])
	})

	test('jamais un drapeau dans le texte de la carte', () => {
		const texts = row({ id: 3, zoneKind: 'countries', countries: ['FR', 'IT', 'BE'] }).map(([, cell]) => cell)
		for (const cell of texts) expect(cell ?? '').not.toMatch(/\p{Regional_Indicator}/u)
	})

	test('« à domicile » reste dit quand il n’y a pas de commune', () => {
		expect(row({ id: 3, zoneKind: 'countries', countries: ['BE'], homeService: true })[1]).toEqual([
			'Se déplace à domicile',
			'Oui',
		])
	})

	test('une commune se lit comme avant, même avec des pays vides', () => {
		expect(
			row({
				id: 3,
				zoneKind: 'city',
				countries: [],
				city: { name: 'Annecy', department: '74' },
				radiusKm: 30,
				homeService: true,
			})
		).toEqual([
			['Commune', 'Annecy (74)'],
			['Rayon', '30 km'],
			['Se déplace à domicile', 'Oui'],
		])
	})
})

describe('photos marquées sans objet (275) : le résumé suit ce que l’espace affiche', () => {
	const named: DashboardProfile = { id: 1, mainPicture: 126, gallery: [127] }
	const find = (section: string, shown: Parameters<typeof profileCards>[1]) => {
		const found = profileCards(named, shown).find(c => c.section === section)
		if (!found) throw new Error(`pas de carte ${section}`)
		return found.lignes[0]?.valeur
	}

	test('photo principale marquée manquante : pas de « Photo ajoutée », portfolio vide', () => {
		const shown = { photo: null, galerie: [] }
		expect(find('photo', shown)).toBeNull()
		expect(find('portfolio', shown)).toBeNull()
	})

	test('photos affichées : le résumé les compte', () => {
		const shown = { photo: { id: 126 }, galerie: [{ id: 127 }] }
		expect(find('photo', shown)).toBe('Photo ajoutée')
		expect(find('portfolio', shown)).toBe('1 photo')
	})
})
