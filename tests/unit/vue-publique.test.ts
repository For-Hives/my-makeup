import { describe, expect, test } from 'bun:test'
import {
	altRealisation,
	contacts,
	experiences,
	formations,
	lignes,
	moisAnnee,
	noms,
	periode,
	prestations,
	urlReseau,
} from '@/lib/profile/public-view'

/**
 * What the page of a profile shows, computed from the profile as the public reading gives it
 * (tickets 101 and 102). Ported from the tests of vue-publique.js of the old site: same cases, same
 * values, under the field names of the v3.
 */

const INTERDIT = /\b(?:undefined|null|NaN|Invalid Date)\b/

describe('lignes', () => {
	test('une ligne par ligne saisie, sans ligne vide ni « null »', () => {
		expect(lignes('  a \n\n b\nnull\nundefined\n   ')).toEqual(['a', 'b'])
		expect(lignes(null)).toEqual([])
		expect(lignes(42)).toEqual([])
	})
})

describe('dates', () => {
	test('un mois et une année en français, lus en UTC', () => {
		expect(moisAnnee('2020-01-15T12:00:00.000Z')).toBe('janvier 2020')
		expect(moisAnnee('2016-06-30')).toBe('juin 2016')
		for (const rien of ['', '  ', 'pas une date', null, undefined, 42]) expect(moisAnnee(rien)).toBe('')
	})

	test('une période : la fin absente veut dire aujourd’hui, un début absent ne dit rien', () => {
		expect(periode({ startDate: '2020-01-15', endDate: '2022-03-02' })).toBe('janvier 2020 - mars 2022')
		expect(periode({ startDate: '2020-01-15', endDate: null })).toBe('janvier 2020 - aujourd’hui')
		expect(periode({ startDate: null, endDate: '2022-03-02' })).toBe('')
		expect(periode(undefined)).toBe('')
		expect(periode({ startDate: 'n’importe quoi', endDate: 'x' })).toBe('')
	})
})

describe('urlReseau', () => {
	test('une adresse web telle quelle, un pseudo sur son réseau, un domaine en https', () => {
		expect(urlReseau('instagram', 'https://www.instagram.com/studio')).toBe('https://www.instagram.com/studio')
		expect(urlReseau('instagram', '@studio.fictif')).toBe('https://www.instagram.com/studio.fictif')
		expect(urlReseau('instagram', 'studio.fictif')).toBe('https://www.instagram.com/studio.fictif')
		expect(urlReseau('youtube', '@chaine')).toBe('https://www.youtube.com/@chaine')
		expect(urlReseau('website', 'studio.example.test/portfolio')).toBe('https://studio.example.test/portfolio')
		expect(urlReseau('instagram', 'instagram.com/studio')).toBe('https://instagram.com/studio')
	})

	test('jamais un schéma dangereux ni un lien relatif', () => {
		for (const valeur of [
			'javascript:alert(1)',
			'data:text/html,x',
			'/profil/autre',
			'//example.test',
			'deux mots',
			'',
			'null',
		])
			expect(urlReseau('website', valeur), valeur).toBeNull()
		// A bare word is no website, but it is a pseudo on a network.
		expect(urlReseau('website', 'studio')).toBeNull()
		expect(urlReseau('facebook', 'studio')).toBe('https://www.facebook.com/studio')
	})
})

describe('contacts', () => {
	test('dans l’ordre de la page, avec le lien de chaque canal', () => {
		const liens = contacts({
			reseaux: { website: 'https://studio.example.test', instagram: '@studio', facebook: '', linkedin: null },
			telephone: '06 39 98 10 01',
			email: 'contact@studio.example.test',
		})

		expect(liens.map(({ canal }) => canal)).toEqual(['instagram', 'email', 'phone', 'website'])
		expect(liens.map(({ href }) => href)).toEqual([
			'https://www.instagram.com/studio',
			'mailto:contact@studio.example.test',
			'tel:0639981001',
			'https://studio.example.test/',
		])
	})

	test('un email mal formé ou un numéro trop court se montre sans lien', () => {
		const liens = contacts({ telephone: '12', email: 'pas-un-email' })

		expect(liens).toEqual([
			{ canal: 'email', libelle: 'pas-un-email', href: null },
			{ canal: 'phone', libelle: '12', href: null },
		])
	})

	test('rien de publié : aucun canal', () => {
		expect(contacts({})).toEqual([])
		expect(contacts({ reseaux: {}, telephone: null, email: 'null' })).toEqual([])
	})
})

describe('les listes', () => {
	test('les prestations sans nom disparaissent, les options sans nom aussi, l’ordre est gardé', () => {
		const lues = prestations([
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

		expect(lues.map(({ nom }) => nom)).toEqual(['B', 'A'])
		expect(lues[0]?.options.map(({ nom }) => nom)).toEqual(['o2', 'o1'])
		expect(lues[0]?.options[0]?.prix).toEqual(['Sur devis'])
		expect(lues[0]?.prix).toEqual(['50 €'])
		expect(lues[1]?.description).toEqual(['l1', 'l2'])
		expect(lues[1]?.prix).toEqual(['1 200 €'])
		expect(JSON.stringify(lues)).not.toMatch(INTERDIT)
	})

	test('compétences et langues : les noms qui disent quelque chose', () => {
		expect(noms([{ name: 'Teint' }, { name: '' }, { name: 'undefined' }, null, { name: ' Yeux ' }])).toEqual([
			'Teint',
			'Yeux',
		])
		expect(noms(undefined)).toEqual([])
	})

	test('formations et expériences : une ligne avec un diplôme, une école, une entreprise ou un poste', () => {
		expect(
			formations([
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
		expect(altRealisation('Inès Morel', 2, 6)).toBe('Réalisation de Inès Morel (2/6)')
	})
})
