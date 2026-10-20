import { describe, expect, test } from 'bun:test'
import { NETWORKS_FIELDS, normalizeNetwork, readNetworks, strictNetworksSchema } from '@/lib/dashboard/networks'
import { networkUrl } from '@/lib/profile/public-view'

/** The networks she edits in her space (ticket 125; plan 02 U28, E30): one stored address per network. */

const valeur = (canal: Parameters<typeof normalizeNetwork>[0], saisie: unknown): string => {
	const lue = normalizeNetwork(canal, saisie)
	if (!lue.ok) throw new Error(`refusé : ${lue.message}`)
	return lue.valeur
}
const message = (canal: Parameters<typeof normalizeNetwork>[0], saisie: unknown): string => {
	const lue = normalizeNetwork(canal, saisie)
	if (lue.ok) throw new Error(`accepté : ${lue.valeur}`)
	return lue.message
}

describe('U28 : « @pseudo » et l’adresse complète donnent la même valeur', () => {
	test.each([
		['instagram', '@studio.fictif', 'https://www.instagram.com/studio.fictif'],
		['instagram', 'studio.fictif', 'https://www.instagram.com/studio.fictif'],
		['instagram', 'https://www.instagram.com/studio.fictif/', 'https://www.instagram.com/studio.fictif'],
		['instagram', 'http://instagram.com/studio.fictif', 'https://www.instagram.com/studio.fictif'],
		['instagram', 'instagram.com/studio.fictif', 'https://www.instagram.com/studio.fictif'],
		['facebook', '@studio.fictif', 'https://www.facebook.com/studio.fictif'],
		['linkedin', 'studiofictif', 'https://www.linkedin.com/in/studiofictif'],
		['youtube', '@studio.fictif', 'https://www.youtube.com/@studio.fictif'],
		['youtube', 'https://youtube.com/@studio.fictif', 'https://www.youtube.com/@studio.fictif'],
	] as const)('%s : « %s »', (canal, saisie, attendu) => {
		expect(valeur(canal, saisie)).toBe(attendu)
	})

	test('le même compte, écrit de quatre façons, donne une seule valeur', () => {
		const ecritures = [
			'@studio.fictif',
			'studio.fictif',
			'https://www.instagram.com/studio.fictif',
			'  instagram.com/studio.fictif/  ',
		]
		expect(new Set(ecritures.map(saisie => valeur('instagram', saisie))).size).toBe(1)
	})

	test('la valeur rangée mène là où la page publique mène pour la saisie d’origine', () => {
		for (const canal of ['instagram', 'facebook', 'youtube'] as const) {
			const stockee = valeur(canal, '@studio.fictif')
			expect(networkUrl(canal, stockee)).toBe(networkUrl(canal, '@studio.fictif') as string)
		}
	})

	test('normaliser une valeur déjà normalisée ne change rien', () => {
		for (const [canal, saisie] of [
			['instagram', '@studio.fictif'],
			['facebook', 'fb.me/studio'],
			['linkedin', 'https://fr.linkedin.com/in/studio-fictif'],
			['youtube', 'https://youtu.be/abc'],
			['siteWeb', 'www.studio-fictif.example.test'],
			['siteWeb', 'http://studio-fictif.example.test/a?b=1'],
		] as const) {
			const une = valeur(canal, saisie)
			expect(valeur(canal, une)).toBe(une)
		}
	})

	test('un site web : l’adresse telle qu’écrite, ou complétée par https://', () => {
		expect(valeur('siteWeb', 'https://studio-fictif.example.test')).toBe('https://studio-fictif.example.test')
		expect(valeur('siteWeb', 'http://studio-fictif.example.test/a')).toBe('http://studio-fictif.example.test/a')
		expect(valeur('siteWeb', 'studio-fictif.example.test/tarifs')).toBe('https://studio-fictif.example.test/tarifs')
	})

	test('vide ou fait d’espaces : la valeur est vide, le réseau est retiré', () => {
		for (const canal of NETWORKS_FIELDS) expect([valeur(canal, ''), valeur(canal, '   ')]).toEqual(['', ''])
	})
})

describe('E30 : une adresse d’un autre site est refusée sous le champ', () => {
	test.each([
		['instagram', 'https://www.facebook.com/studio.fictif'],
		['instagram', 'https://example.test/instagram.com/studio'],
		['instagram', 'mon-site.example.test'],
		['facebook', 'https://www.instagram.com/studio.fictif'],
		['linkedin', 'https://www.youtube.com/@studio'],
		['youtube', 'https://www.linkedin.com/in/studio'],
		['instagram', 'https://instagram.com.example.test/studio'],
	] as const)('%s refuse « %s »', (canal, saisie) => {
		expect(message(canal, saisie)).toMatch(
			/^Cette adresse n’est pas celle (d’Instagram|de Facebook|de LinkedIn|de YouTube)/
		)
	})

	test('le message est en français, avec ce qu’il faut écrire', () => {
		expect(message('instagram', 'https://www.facebook.com/x')).toBe(
			'Cette adresse n’est pas celle d’Instagram : colle l’adresse de ta page Instagram ou écris ton @pseudo.'
		)
	})

	test('un lien qui n’en est pas un : illisible, jamais javascript: ni data:', () => {
		expect(message('instagram', 'mon pseudo')).toContain('n’est pas lisible')
		expect(message('instagram', 'https://www.instagram.com')).toContain('n’est pas lisible')
		expect(message('siteWeb', 'javascript:alert(1)')).toContain('n’est pas lisible')
		expect(message('siteWeb', 'data:text/html,x')).toContain('n’est pas lisible')
		expect(message('siteWeb', 'https://nom:secret@studio.example.test')).toContain('n’est pas lisible')
	})

	test('un site web n’est pas un @pseudo, ni un mot sans point', () => {
		expect(message('siteWeb', '@studio.fictif')).toContain('Ce n’est pas une adresse de site')
		expect(message('siteWeb', 'http://localhost')).toContain('Ce n’est pas une adresse de site')
	})

	test('plus de 200 caractères : refusé', () => {
		expect(message('siteWeb', `https://studio.example.test/${'a'.repeat(173)}`)).toBe(
			'Ce lien ne doit pas dépasser 200 caractères.'
		)
		expect(valeur('siteWeb', `https://studio.example.test/${'a'.repeat(172)}`)).toHaveLength(200)
	})

	test('une valeur qui n’est pas un texte (requête forgée) a un message français', () => {
		expect(message('instagram', 42)).toBe('Ce champ doit être un texte.')
	})

	test('chaque champ refusé a son message, les autres passent', () => {
		const lue = readNetworks({
			instagram: 'https://www.facebook.com/x',
			facebook: '@studio',
			youtube: '',
			linkedin: 'a b',
			siteWeb: 'studio.example.test',
		})
		if (lue.ok) throw new Error('doit être refusé')
		expect(Object.keys(lue.champs).sort()).toEqual(['instagram', 'linkedin'])
	})
})

describe('le schéma du serveur est strict', () => {
	const TOUS = { instagram: '', facebook: '', youtube: '', linkedin: '', siteWeb: '' }

	test.each([
		'statut',
		'pro',
		'slug',
		'id',
		'contactPublic',
		'coordonnees',
	])('la clé %s refuse la requête entière', cle => {
		expect(strictNetworksSchema.safeParse({ ...TOUS, [cle]: 'x' }).success).toBe(false)
	})

	test('les cinq champs passent', () => {
		expect(strictNetworksSchema.safeParse(TOUS).success).toBe(true)
	})
})
