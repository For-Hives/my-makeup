import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { REFERENCES } from '../../scripts/migration/import/ecarts'
import { normaliser } from '../../scripts/migration/import/moteur'
import {
	ADAPTATEUR_PROFILS,
	affichesALaSource,
	coordonneesARevoir,
	coordonneesDeLaSource,
	PROFILS_DU_SPAM,
	type ProfilLu,
	profilsAttendus,
	profilsLaisses,
	statutCalcule,
	videALaSource,
} from '../../scripts/migration/import/profils'
import { SECTIONS_VIDES } from '../../scripts/migration/import/sections'
import { NOM_NEUTRE, nomAffiche, nomComplet, texte } from '../../src/lib/profil/nom-affiche'
import { CHAMPS_PUBLICS_DU_PROFIL } from '../../src/services/public/profils'

/**
 * Tickets 026 and 059: what the import makes of a profile of the old site, the name of its page,
 * and the fields the public reading chooses. No database: the runs are in
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
	score: null,
	available: true,
	pro: false,
	created_at: '2024-01-01T10:00:00.000Z',
	updated_at: '2024-02-01T10:00:00.000Z',
	compte: id + 100,
	aPhotoPrincipale: false,
	prix: [],
	reseaux: null,
	sections: SECTIONS_VIDES,
	...modif,
})

describe('la source dit si un profil est entièrement vide, comme l’ancien site le lit', () => {
	test('un nom seul laisse le profil entièrement vide', () => {
		expect(videALaSource(profil(1, { first_name: 'Manon', last_name: 'Petit' }))).toBe(true)
		expect(videALaSource(profil(1, { reseaux: { instagram: '   ' } }))).toBe(true)
	})

	test('une seule des six conditions suffit à ne plus l’être', () => {
		const uneCondition: Partial<ProfilLu>[] = [
			{ aPhotoPrincipale: true },
			{ city: 'Annecy' },
			{ speciality: 'Mariage' },
			{ prix: ['Sur devis', 'à partir de 80 €'] },
			{ description: 'x'.repeat(200) },
			{ reseaux: { phone: '06 39 98 00 00' } },
		]
		for (const modif of uneCondition) expect(videALaSource(profil(1, modif)), JSON.stringify(modif)).toBe(false)
		// What is not a condition: a short description, a country, a price without a number.
		for (const modif of [{ description: 'Courte.' }, { city: 'France' }, { prix: ['Sur devis'] }])
			expect(videALaSource(profil(1, modif)), JSON.stringify(modif)).toBe(true)
	})
})

describe('le statut est celui que le serveur calcule de ce que l’import écrit (ticket 044)', () => {
	test('entièrement vide : brouillon ; une condition remplie : publié', () => {
		expect(statutCalcule({ prenom: 'Manon', nom: 'Petit' })).toBe('brouillon')
		expect(statutCalcule({ specialite: 'Mariage' })).toBe('publie')
		expect(statutCalcule({ description: 'x'.repeat(200) })).toBe('publie')
		expect(statutCalcule({ description: 'Courte.' })).toBe('brouillon')
	})

	test('le statut est comparé mais jamais écrit ; le choix du statut est rendu à la règle', () => {
		expect(ADAPTATEUR_PROFILS.calcules).toEqual(['statut'])
		expect(ADAPTATEUR_PROFILS.champs).toMatchObject({ statut: 'texte', statutChoisi: 'texte' })
		const [attendu] = profilsAttendus([profil(21, { speciality: 'Mariage' })], new Map([[121, 501]])).attendus
		expect(attendu?.valeurs).toMatchObject({ statut: 'publie', statutChoisi: 'automatique' })
	})
})

describe('les profils que l’import ne prend pas (SCHEMA.md §4.1 et §11)', () => {
	const profils = [
		profil(21, { compte: 1 }),
		profil(29, { compte: 11 }),
		profil(31, { compte: 12 }),
		// The spam: no account at all.
		profil(67, { compte: null }),
		profil(74, { compte: null }),
		// No account, out of the list of the spam: a link to an account the source no longer holds.
		profil(40, { compte: 99 }),
		profil(41, { compte: null }),
	]
	const comptesDeLaSource = new Set([1, 11, 12])

	test('la liste du spam est celle de SCHEMA.md §4.1', () => {
		const schema = readFileSync(path.resolve(import.meta.dir, '../../docs/migration/SCHEMA.md'), 'utf8')
		const section = schema.slice(schema.indexOf('### 4.1'), schema.indexOf('### 4.2'))
		expect(section).toContain(`Identifiants (\`makeup_artistes.id\`) : ${PROFILS_DU_SPAM.join(', ')}.`)
		expect(PROFILS_DU_SPAM).toHaveLength(13)
	})

	test('sans décision : les profils du spam sont écartés, tout autre profil sans compte arrête l’import', () => {
		expect(profilsLaisses(profils, { comptesDeLaSource, comptesEcartes: [11, 12], profilsEcartes: [] })).toEqual({
			ecartes: [],
			spam: [67, 74],
			deComptesEcartes: [29, 31],
			sansCompte: [40, 41],
			sansObjet: 0,
		})
	})

	test('une décision par profil le laisse de côté ; une décision qui ne nomme aucun de ces cas est sans objet', () => {
		expect(
			profilsLaisses(profils, {
				comptesDeLaSource,
				comptesEcartes: [11, 12],
				// 21 has its account, 67 is the spam already, 500 is not in the source.
				profilsEcartes: [29, 41, 21, 67, 500],
			})
		).toEqual({ ecartes: [29, 41], spam: [67, 74], deComptesEcartes: [31], sansCompte: [40], sansObjet: 3 })
	})

	test('un profil de la liste du spam qui a un compte est un profil comme un autre', () => {
		expect(
			profilsLaisses([profil(67, { compte: 1 })], { comptesDeLaSource, comptesEcartes: [], profilsEcartes: [] })
		).toEqual({ ecartes: [], spam: [], deComptesEcartes: [], sansCompte: [], sansObjet: 0 })
	})
})

describe('les profils attendus', () => {
	const profils = [
		profil(21, { username: 'Zoé Lefèvre', compte: 1, speciality: 'Mariage', created_at: '2023-05-12T09:20:00.000Z' }),
		profil(22, { username: 'lea-martin', compte: 2, first_name: 'Léa', available: null }),
		// Same slug as 21, created later: it takes the suffix, as on the old site.
		profil(23, { username: 'zoe lefevre', compte: 3, created_at: '2024-01-01T00:00:00.000Z', available: false }),
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
	const laisses = { ecartes: [25], spam: [24, 26] }

	test('reliés à leur compte dans Payload, avec le slug de l’ancien site, calculé sur toute la source', () => {
		const { attendus } = profilsAttendus(profils, comptes, laisses)

		expect(attendus.map(({ strapiId, valeurs }) => [strapiId, valeurs.pro, valeurs.slug])).toEqual([
			[21, 501, 'zoe-lefevre-2'],
			[22, 502, 'lea-martin'],
			[23, null, 'zoe-lefevre-3'],
		])
	})

	test('un profil ni pris ni laissé de côté est une erreur : l’import devait s’arrêter avant', () => {
		expect(() => profilsAttendus(profils, comptes, { ecartes: [25], spam: [26] })).toThrow(
			'Le profil 24 n’a pas de compte repris'
		)
	})

	test('chaque transformation porte sa référence : slug stocké, disponibilité par défaut, profil vide en brouillon', () => {
		const { attendus, statuts } = profilsAttendus(profils, comptes, laisses)

		expect(attendus.map(({ strapiId, ecarts }) => [strapiId, ecarts.map(({ reference }) => reference)])).toEqual([
			[21, ['slug-stocke']],
			[22, ['disponibilite-par-defaut', 'profils-vides-brouillon']],
			[23, ['slug-stocke', 'profils-vides-brouillon']],
		])
		expect(statuts).toEqual({ publie: 1, brouillon: 2 })
		for (const reference of ['disponibilite-par-defaut', 'profils-spam-non-repris'])
			expect(Object.values(REFERENCES) as string[]).toContain(reference)
	})

	test('l’identité, l’ancien nom d’utilisateur, le score, le badge et les dates tels quels ; nul reste nul, sauf la disponibilité', () => {
		const [zoe, lea, ines] = profilsAttendus(
			[
				{ ...(profils[0] as ProfilLu), score: '12.50', pro: true, updated_at: '2026-09-28T10:11:12.131Z' },
				...profils.slice(1),
			],
			comptes,
			laisses
		).attendus

		expect(zoe?.valeurs).toEqual({
			strapiId: 21,
			pro: 501,
			slug: 'zoe-lefevre-2',
			legacyUsername: 'Zoé Lefèvre',
			prenom: null,
			nom: null,
			nomArtiste: null,
			specialite: 'Mariage',
			description: null,
			commune: null,
			disponible: true,
			score: 12.5,
			superMaquilleuse: true,
			// Its sections (ticket 060): none at the source, none in the target.
			photoPrincipale: null,
			galerie: [],
			competences: [],
			langues: [],
			formations: [],
			experiences: [],
			prestations: [],
			reseaux: null,
			// Its contact details (ticket 064): none at the source, so closed, without date or source.
			coordonnees: { telephone: null, email: null },
			contactPublic: false,
			consentiLe: null,
			sourceConsentement: null,
			statutChoisi: 'automatique',
			statut: 'publie',
			createdAt: '2023-05-12T09:20:00.000Z',
			updatedAt: '2026-09-28T10:11:12.131Z',
		})
		expect([lea?.valeurs.disponible, lea?.valeurs.score, lea?.valeurs.legacyUsername]).toEqual([
			true,
			null,
			'lea-martin',
		])
		expect(ines?.valeurs.disponible).toBe(false)
	})

	test('un statut que la source ne donne pas est listé : une section pas encore reprise', () => {
		// 22 is empty in the v3 but not at the source: its only condition is its main picture.
		const { statutsDifferentsDeLaSource } = profilsAttendus(
			[profils[0] as ProfilLu, { ...(profils[1] as ProfilLu), aPhotoPrincipale: true }],
			comptes
		)

		expect(statutsDifferentsDeLaSource).toEqual([22])
	})

	test('un profil non vide à la source qui devient brouillon porte sa propre référence, pas celle des profils vides', () => {
		const { attendus } = profilsAttendus(
			[profils[0] as ProfilLu, { ...(profils[1] as ProfilLu), aPhotoPrincipale: true }],
			comptes
		)
		const references = (id: number) => attendus.find(({ strapiId }) => strapiId === id)?.ecarts.map(e => e.reference)

		expect(references(22)).toContain('profil-non-vide-en-brouillon')
		expect(references(22)).not.toContain('profils-vides-brouillon')
		expect(Object.values(REFERENCES) as string[]).toContain('profil-non-vide-en-brouillon')
	})
})

describe('le moteur compare un groupe de champs comme un tout', () => {
	test('un groupe vide vaut nul ; deux groupes égaux champ par champ sont égaux, dans n’importe quel ordre', () => {
		expect(normaliser('objet', { nom: null, codeInsee: undefined })).toBeNull()
		expect(normaliser('objet', { nom: 'Annecy', codeInsee: '74010' })).toBe(
			normaliser('objet', { codeInsee: '74010', nom: 'Annecy', latitude: undefined })
		)
		expect(normaliser('objet', { nom: 'Annecy', codeInsee: '74010' })).not.toBe(
			normaliser('objet', { nom: 'Annecy', codeInsee: '74011' })
		)
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

describe('les coordonnées de contact sont lues comme l’ancien site les lit (ticket 064)', () => {
	const reseaux = (phone: string | null, email: string | null) =>
		profil(1, { reseaux: { phone, email } as ProfilLu['reseaux'] })

	test('rognées, et sans valeur quand elles sont vides ou les mots null et undefined', () => {
		expect(coordonneesDeLaSource(reseaux(' 06 12 ', '  a@example.test '))).toEqual({
			telephone: '06 12',
			email: 'a@example.test',
		})
		for (const vide of ['', '   ', 'null', 'undefined', ' Undefined ', 'NULL']) {
			expect(coordonneesDeLaSource(reseaux(vide, vide)), vide).toEqual({ telephone: null, email: null })
			expect(affichesALaSource(reseaux(vide, vide)), vide).toBe(false)
		}
	})

	test('une valeur que le serveur refuserait est laissée de côté et listée, sans sa valeur', () => {
		const lu = reseaux('0'.repeat(21), 'Insta: @hugo')

		expect(coordonneesDeLaSource(lu)).toEqual({ telephone: null, email: null })
		expect(coordonneesARevoir(lu)).toEqual([
			{ profil: 1, champ: 'telephone' },
			{ profil: 1, champ: 'email' },
		])
		expect(affichesALaSource(lu)).toBe(false)
		// The other channel still opens the contact details.
		expect(affichesALaSource(reseaux('0'.repeat(21), 'a@example.test'))).toBe(true)
		expect(coordonneesARevoir(reseaux('06', 'a@example.test'))).toEqual([])
	})
})
