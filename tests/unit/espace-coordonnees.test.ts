import { describe, expect, test } from 'bun:test'
import { cartesDuProfil, type ProfilDeLEspace } from '@/lib/dashboard/cartes'
import {
	dateLongue,
	erreursDesCoordonnees,
	schemaDesCoordonnees,
	schemaDesCoordonneesStrict,
} from '@/lib/dashboard/coordonnees'

/**
 * The contact details she edits in her space (ticket 126; plan 02 U28, E30): the bounds, the French
 * messages under the field, the strict schema, and the line « Affichées sur ton profil » of the card.
 */

const VALIDE = { telephone: '06 12 34 56 78', email: 'contact-fictif@example.test', contactPublic: true }

describe('U28 : un téléphone de 20 caractères au plus, un email bien formé', () => {
	test.each([
		'06 12 34 56 78',
		'0612345678',
		'+33 6 12 34 56 78',
		'06.12.34.56.78',
		'(+33) 6 12 34 56 78',
		'',
		'   ',
	])('le téléphone « %s » passe', telephone => {
		expect(schemaDesCoordonnees.safeParse({ ...VALIDE, telephone }).success).toBe(true)
	})

	test('rogné : les espaces des bords ne comptent pas', () => {
		expect(
			schemaDesCoordonnees.parse({ ...VALIDE, telephone: '  06 12 34 56 78  ', email: ' a@example.test ' })
		).toMatchObject({
			telephone: '06 12 34 56 78',
			email: 'a@example.test',
		})
	})

	test.each([
		['des lettres', '06 12 34 56 ab'],
		['trop court', '06 12'],
		['21 caractères', '06 12 34 56 78 90 12 3'],
		['des caractères inattendus', '06/12/34/56/78'],
	])('un téléphone avec %s est refusé, en français', (_cas, telephone) => {
		const lue = schemaDesCoordonnees.safeParse({ ...VALIDE, telephone })
		if (lue.success) throw new Error('doit être refusé')
		const message = erreursDesCoordonnees(lue.error).telephone ?? ''
		expect(message).toMatch(/^(Ce numéro n’est pas valide|Ton numéro ne doit pas dépasser 20 caractères)/)
	})

	test('les 20 caractères sont la borne', () => {
		expect(schemaDesCoordonnees.safeParse({ ...VALIDE, telephone: '+33 6 12 34 56 78 90' }).success).toBe(true)
		const lue = schemaDesCoordonnees.safeParse({ ...VALIDE, telephone: '+33 6 12 34 56 78 901' })
		if (lue.success) throw new Error('doit être refusé')
		expect(erreursDesCoordonnees(lue.error).telephone).toBe('Ton numéro ne doit pas dépasser 20 caractères.')
	})

	test.each([
		'contact.example.test',
		'contact@',
		'con tact@example.test',
		'a@b@example.test',
	])('l’email « %s » est refusé, en français', email => {
		const lue = schemaDesCoordonnees.safeParse({ ...VALIDE, email })
		if (lue.success) throw new Error('doit être refusé')
		expect(erreursDesCoordonnees(lue.error).email).toBe(
			'Cet email n’est pas valide : écris-le comme prenom@exemple.fr.'
		)
	})

	test('un email de plus de 200 caractères est refusé', () => {
		const long = `${'a'.repeat(60)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(20)}.test`
		const lue = schemaDesCoordonnees.safeParse({ ...VALIDE, email: long })
		if (lue.success) throw new Error('doit être refusé')
		expect(erreursDesCoordonnees(lue.error).email).toBe('Ton email ne doit pas dépasser 200 caractères.')
	})

	test('chaque champ refusé a son message, sans anglais', () => {
		const lue = schemaDesCoordonnees.safeParse({ telephone: 12, email: 'x', contactPublic: 'oui' })
		if (lue.success) throw new Error('doit être refusé')
		const messages = Object.values(erreursDesCoordonnees(lue.error))
		expect(messages).toHaveLength(3)
		for (const message of messages) expect(message).not.toMatch(/expected|invalid|string|boolean/i)
	})
})

describe('le schéma du serveur est strict : elle n’écrit pas la date de son propre consentement', () => {
	test('les trois champs passent', () => {
		expect(schemaDesCoordonneesStrict.safeParse(VALIDE).success).toBe(true)
	})

	test.each([
		['consentedAt', '2020-01-01T00:00:00.000Z'],
		['consentSource', 'import'],
		['status', 'published'],
		['pro', 1],
		['id', 1],
	])('la clé %s refuse la requête entière', (cle, valeur) => {
		expect(schemaDesCoordonneesStrict.safeParse({ ...VALIDE, [cle]: valeur }).success).toBe(false)
	})
})

describe('la carte dit si les coordonnées sont affichées, et depuis quand', () => {
	const ligne = (profil: ProfilDeLEspace) =>
		cartesDuProfil(profil)
			.find(carte => carte.section === 'coordonnees')
			?.lignes.find(l => l.libelle === 'Affichées sur ton profil')?.valeur

	test('masquées : « Non », même avec une date restée d’avant', () => {
		expect(ligne({ id: 1, publicContact: false })).toBe('Non')
		expect(ligne({ id: 1, publicContact: false, consentedAt: '2026-10-15T10:00:00.000Z' })).toBe('Non')
	})

	test('affichées avec la date du serveur : « Oui, depuis le … », à l’heure de Paris', () => {
		expect(ligne({ id: 1, publicContact: true, consentedAt: '2026-10-15T10:00:00.000Z' })).toBe(
			'Oui, depuis le 15 octobre 2026'
		)
		// 23:30 UTC the 14th is already the 15th in Paris.
		expect(dateLongue('2026-10-14T23:30:00.000Z')).toBe('15 octobre 2026')
	})

	test('affichées sans date lisible : « Oui » seulement', () => {
		expect(ligne({ id: 1, publicContact: true })).toBe('Oui')
		expect(ligne({ id: 1, publicContact: true, consentedAt: 'pas une date' })).toBe('Oui')
	})
})
