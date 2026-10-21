import { describe, expect, test } from 'bun:test'
import {
	altWork,
	contacts,
	courses,
	experiences,
	monthYear,
	names,
	networkUrl,
	period,
	readableLabel,
	rows,
	serviceOffers,
} from '@/lib/profile/public-view'

/**
 * What the page of a profile shows, computed from the profile as the public reading gives it
 * (tickets 101 and 102). Ported from the tests of vue-publique.js of the old site: same cases, same
 * values, under the field names of the v3.
 */

const FORBIDDEN = /\b(?:undefined|null|NaN|Invalid Date)\b/

describe('lignes', () => {
	test('une ligne par ligne saisie, sans ligne vide ni « null »', () => {
		expect(rows('  a \n\n b\nnull\nundefined\n   ')).toEqual(['a', 'b'])
		expect(rows(null)).toEqual([])
		expect(rows(42)).toEqual([])
	})
})

describe('dates', () => {
	test('un mois et une année en français, lus en UTC', () => {
		expect(monthYear('2020-01-15T12:00:00.000Z')).toBe('janvier 2020')
		expect(monthYear('2016-06-30')).toBe('juin 2016')
		for (const nothing of ['', '  ', 'pas une date', null, undefined, 42]) expect(monthYear(nothing)).toBe('')
	})

	test('une période : la fin absente veut dire aujourd’hui, un début absent ne dit rien', () => {
		expect(period({ startDate: '2020-01-15', endDate: '2022-03-02' })).toBe('janvier 2020 - mars 2022')
		expect(period({ startDate: '2020-01-15', endDate: null })).toBe('janvier 2020 - aujourd’hui')
		expect(period({ startDate: null, endDate: '2022-03-02' })).toBe('')
		expect(period(undefined)).toBe('')
		expect(period({ startDate: 'n’importe quoi', endDate: 'x' })).toBe('')
	})
})

describe('urlReseau', () => {
	test('une adresse web telle quelle, un pseudo sur son réseau, un domaine en https', () => {
		expect(networkUrl('instagram', 'https://www.instagram.com/studio')).toBe('https://www.instagram.com/studio')
		expect(networkUrl('instagram', '@studio.fictif')).toBe('https://www.instagram.com/studio.fictif')
		expect(networkUrl('instagram', 'studio.fictif')).toBe('https://www.instagram.com/studio.fictif')
		expect(networkUrl('youtube', '@chaine')).toBe('https://www.youtube.com/@chaine')
		expect(networkUrl('website', 'studio.example.test/portfolio')).toBe('https://studio.example.test/portfolio')
		expect(networkUrl('instagram', 'instagram.com/studio')).toBe('https://instagram.com/studio')
	})

	test('jamais un schéma dangereux ni un lien relatif', () => {
		for (const value of [
			'javascript:alert(1)',
			'data:text/html,x',
			'/profil/autre',
			'//example.test',
			'deux mots',
			'',
			'null',
		])
			expect(networkUrl('website', value), value).toBeNull()
		// A bare word is no website, but it is a pseudo on a network.
		expect(networkUrl('website', 'studio')).toBeNull()
		expect(networkUrl('facebook', 'studio')).toBe('https://www.facebook.com/studio')
	})
})

describe('contacts', () => {
	test('dans l’ordre de la page, avec le lien de chaque canal', () => {
		const links = contacts({
			reseaux: { website: 'https://studio.example.test', instagram: '@studio', facebook: '', linkedin: null },
			telephone: '06 39 98 10 01',
			email: 'contact@studio.example.test',
		})

		expect(links.map(({ canal }) => canal)).toEqual(['instagram', 'email', 'phone', 'website'])
		expect(links.map(({ href }) => href)).toEqual([
			'https://www.instagram.com/studio',
			'mailto:contact@studio.example.test',
			'tel:0639981001',
			'https://studio.example.test/',
		])
	})

	test('un email mal formé ou un numéro trop court se montre sans lien', () => {
		const links = contacts({ telephone: '12', email: 'pas-un-email' })

		expect(links).toEqual([
			{ canal: 'email', libelle: 'pas-un-email', affichage: 'pas-un-email', href: null },
			{ canal: 'phone', libelle: '12', affichage: '12', href: null },
		])
	})

	test('rien de publié : aucun canal', () => {
		expect(contacts({})).toEqual([])
		expect(contacts({ reseaux: {}, telephone: null, email: 'null' })).toEqual([])
	})
})

describe('readableLabel : le texte court d’un lien', () => {
	const label = (canal: Parameters<typeof readableLabel>[0], typed: string) =>
		readableLabel(canal, typed, networkUrl(canal === 'email' || canal === 'phone' ? 'website' : canal, typed))

	test('Instagram : « @pseudo », qu’elle ait écrit le pseudo ou l’adresse', () => {
		expect(label('instagram', 'https://www.instagram.com/ines.morel/?igsh=abc')).toBe('@ines.morel')
		expect(label('instagram', '@ines.morel')).toBe('@ines.morel')
		expect(label('instagram', 'ines.morel')).toBe('@ines.morel')
	})

	test('un site : le domaine, sans « www. » ni chemin', () => {
		expect(label('website', 'https://www.ines-morel.fr/portfolio')).toBe('ines-morel.fr')
		expect(label('website', 'ines-morel.fr')).toBe('ines-morel.fr')
	})

	test('les autres réseaux : le nom de la page, ou le nom du réseau quand l’adresse n’en porte pas', () => {
		expect(label('linkedin', 'https://www.linkedin.com/in/ines-morel/')).toBe('ines-morel')
		expect(label('linkedin', 'https://www.linkedin.com/company/studio')).toBe('LinkedIn')
		expect(label('youtube', 'https://www.youtube.com/@inesmorel')).toBe('@inesmorel')
		expect(label('youtube', 'https://www.youtube.com/watch?v=abc')).toBe('YouTube')
		expect(label('facebook', 'https://www.facebook.com/ines.morel')).toBe('ines.morel')
		expect(label('facebook', 'https://www.facebook.com/profile.php?id=123')).toBe('Facebook')
		expect(label('instagram', 'https://www.instagram.com/')).toBe('Instagram')
	})

	test('un email, un téléphone, ou une valeur sans lien : ce qu’elle a saisi', () => {
		expect(readableLabel('email', 'ines@exemple.test', 'mailto:ines@exemple.test')).toBe('ines@exemple.test')
		expect(readableLabel('phone', '06 39 98 10 01', 'tel:0639981001')).toBe('06 39 98 10 01')
		expect(readableLabel('website', 'mon site', null)).toBe('mon site')
	})

	test('jamais l’adresse complète dans le texte des liens d’une fiche', () => {
		const links = contacts({
			reseaux: { instagram: 'https://www.instagram.com/ines.morel', website: 'https://www.ines-morel.fr/a/b' },
		})
		expect(links.map(({ affichage }) => affichage)).toEqual(['@ines.morel', 'ines-morel.fr'])
	})
})

describe('les listes', () => {
	test('les prestations sans nom disparaissent, les options sans nom aussi, l’ordre est gardé', () => {
		const read = serviceOffers([
			{
				name: 'B',
				priceFrom: 50,
				priceText: '50 €',
				options: [{ name: 'o2', priceText: 'Sur devis' }, { name: ' ' }, { name: 'o1' }],
			},
			{ name: 'null', priceText: '10 €' },
			{ name: 'A', description: 'l1\n\nl2', priceText: null, priceFrom: 1200 },
			null,
		])

		expect(read.map(({ nom }) => nom)).toEqual(['B', 'A'])
		expect(read[0]?.options.map(({ nom }) => nom)).toEqual(['o2', 'o1'])
		expect(read[0]?.options[0]?.prix).toEqual(['Sur devis'])
		expect(read[0]?.prix).toEqual(['50 €'])
		expect(read[1]?.description).toEqual(['l1', 'l2'])
		expect(read[1]?.prix).toEqual(['1 200 €'])
		expect(JSON.stringify(read)).not.toMatch(FORBIDDEN)
	})

	test('compétences et langues : les noms qui disent quelque chose', () => {
		expect(names([{ name: 'Teint' }, { name: '' }, { name: 'undefined' }, null, { name: ' Yeux ' }])).toEqual([
			'Teint',
			'Yeux',
		])
		expect(names(undefined)).toEqual([])
	})

	test('formations et expériences : une ligne avec un diplôme, une école, une entreprise ou un poste', () => {
		expect(
			courses([
				{ diploma: '', school: '', graduatedAt: '2020-01-01' },
				{ diploma: 'CAP', graduatedAt: '2014-06-30' },
			])
		).toEqual([{ diploma: 'CAP', school: '', obtenu: 'juin 2014', description: [] }])
		expect(
			experiences([
				{ company: '', jobTitle: '', city: 'Annecy' },
				{ jobTitle: 'Maquilleuse', startDate: '2018-09-03', endDate: null, city: 'null' },
			])
		).toEqual([
			{ company: '', jobTitle: 'Maquilleuse', city: '', periode: 'septembre 2018 - aujourd’hui', description: [] },
		])
	})
})

describe('altRealisation', () => {
	test('« Réalisation de <nom> (n/N) »', () => {
		expect(altWork('Inès Morel', 2, 6)).toBe('Réalisation de Inès Morel (2/6)')
	})
})
