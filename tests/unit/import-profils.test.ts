import { describe, expect, test } from 'bun:test'
import { type ProfilLu, profilsAttendus, statutProvisoire } from '../../scripts/migration/import/profils'
import { NOM_NEUTRE, nomAffiche, nomComplet, texte } from '../../src/lib/profil/nom-affiche'
import { CHAMPS_PUBLICS_DU_PROFIL } from '../../src/services/public/profils'

/**
 * Ticket 026: what the first slice of the import makes of a profile of the old site, the name of
 * its page, and the fields the public reading chooses. No database: the runs are in
 * tests/integration/import-profils.test.ts. Every value here is fictional.
 */

const profil = (id: number, modif: Partial<ProfilLu> = {}): ProfilLu => ({
	id,
	first_name: null,
	last_name: null,
	company_artist_name: null,
	speciality: null,
	description: null,
	city: null,
	username: `Profil ${id}`,
	created_at: '2024-01-01T10:00:00.000Z',
	compte: id + 100,
	aPhotoPrincipale: false,
	prix: [],
	reseaux: null,
	...modif,
})

describe('règle provisoire du statut : brouillon si entièrement vide, publié sinon', () => {
	test('un nom seul laisse le profil entièrement vide', () => {
		expect(statutProvisoire(profil(1, { first_name: 'Manon', last_name: 'Petit' }))).toBe('brouillon')
		expect(statutProvisoire(profil(1, { reseaux: { instagram: '   ' } }))).toBe('brouillon')
	})

	test('une seule des six conditions suffit à publier', () => {
		const uneCondition: Partial<ProfilLu>[] = [
			{ aPhotoPrincipale: true },
			{ city: 'Annecy' },
			{ speciality: 'Mariage' },
			{ prix: ['Sur devis', 'à partir de 80 €'] },
			{ description: 'x'.repeat(200) },
			{ reseaux: { phone: '06 39 98 00 00' } },
		]
		for (const modif of uneCondition) expect(statutProvisoire(profil(1, modif)), JSON.stringify(modif)).toBe('publie')
		// What is not a condition: a short description, a country, a price without a number.
		for (const modif of [{ description: 'Courte.' }, { city: 'France' }, { prix: ['Sur devis'] }])
			expect(statutProvisoire(profil(1, modif)), JSON.stringify(modif)).toBe('brouillon')
	})
})

describe('les profils attendus', () => {
	const profils = [
		profil(21, { username: 'Zoé Lefèvre', compte: 1, speciality: 'Mariage', created_at: '2023-05-12T09:20:00.000Z' }),
		profil(22, { username: 'lea-martin', compte: 2, first_name: 'Léa' }),
		// Same slug as 21, created later: it takes the suffix, as on the old site.
		profil(23, { username: 'zoe lefevre', compte: 3, created_at: '2024-01-01T00:00:00.000Z' }),
		profil(24, { username: 'Sans compte', compte: null }),
		profil(25, { username: 'Compte écarté', compte: 11 }),
		// Older than 21 and without an account: its slug still counts in the table of the old site.
		profil(26, { username: 'ZOE-LEFEVRE', compte: null, created_at: '2022-01-01T00:00:00.000Z' }),
	]
	const comptes = new Map<number, number | null>([
		[1, 501],
		[2, 502],
		[3, null],
	])

	test('reliés à leur compte dans Payload, avec le slug de l’ancien site, calculé sur toute la source', () => {
		const { attendus } = profilsAttendus(profils, comptes)

		expect(attendus.map(({ strapiId, valeurs }) => [strapiId, valeurs.pro, valeurs.slug])).toEqual([
			[21, 501, 'zoe-lefevre-2'],
			[22, 502, 'lea-martin'],
			[23, null, 'zoe-lefevre-3'],
		])
	})

	test('un profil sans compte repris est laissé de côté et listé', () => {
		expect(profilsAttendus(profils, comptes).sansCompte).toEqual([24, 25, 26])
	})

	test('chaque transformation porte sa référence : slug stocké, profil vide en brouillon', () => {
		const { attendus, statuts } = profilsAttendus(profils, comptes)

		expect(attendus.map(({ strapiId, ecarts }) => [strapiId, ecarts.map(({ reference }) => reference)])).toEqual([
			[21, ['slug-stocke']],
			[22, ['profils-vides-brouillon']],
			[23, ['slug-stocke', 'profils-vides-brouillon']],
		])
		expect(statuts).toEqual({ publie: 1, brouillon: 2 })
	})

	test('les noms, la spécialité et la description sont repris tels quels ; nul reste nul', () => {
		const [zoe] = profilsAttendus(profils, comptes).attendus

		expect(zoe?.valeurs).toEqual({
			strapiId: 21,
			pro: 501,
			slug: 'zoe-lefevre-2',
			prenom: null,
			nom: null,
			nomArtiste: null,
			specialite: 'Mariage',
			description: null,
			statut: 'publie',
		})
	})
})

describe('le nom de la page : prénom et nom, sinon le nom d’artiste, sinon un libellé neutre', () => {
	test('comme sur l’ancien site', () => {
		expect(nomAffiche({ prenom: 'Zoé', nom: 'Lefèvre', nomArtiste: 'Zoé Make-up' })).toBe('Zoé Lefèvre')
		expect(nomAffiche({ prenom: ' Zoé ', nom: null })).toBe('Zoé')
		expect(nomAffiche({ nom: 'Lefèvre' })).toBe('Lefèvre')
		expect(nomAffiche({ prenom: '  ', nom: 'null', nomArtiste: 'Studio Lumière' })).toBe('Studio Lumière')
		expect(nomAffiche({ nomArtiste: 'undefined' })).toBe(NOM_NEUTRE)
		expect(nomAffiche({})).toBe('Maquilleuse professionnelle')
	})

	test('jamais « undefined » ni « null »', () => {
		expect(texte('NULL')).toBe('')
		expect(texte(42)).toBe('')
		expect(nomComplet({ prenom: 'Undefined', nom: 'Petit' })).toBe('Petit')
	})
})

describe('la lecture publique choisit ses champs un par un', () => {
	test('l’identité seulement : ni coordonnées, ni compte, ni ce qu’ont écrit l’import ou un admin', () => {
		expect(Object.keys(CHAMPS_PUBLICS_DU_PROFIL).sort()).toEqual([
			'description',
			'nom',
			'nomArtiste',
			'prenom',
			'slug',
			'specialite',
		])
	})
})
