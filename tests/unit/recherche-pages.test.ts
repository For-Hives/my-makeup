/**
 * The pages of the results, the brake and the failing read (ticket 100; plan 02 U18, E41 and I30 on
 * the logic). Unit tests: no database, no server. The page is tests/e2e/recherche-mot-cle.spec.ts.
 */

import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { creerFrein } from '@/lib/auth/frein'
import { freinerLaRecherche, RECHERCHES_PAR_MINUTE } from '@/lib/recherche/frein'
import { DELAI_DE_LECTURE_MS, lireSansBloquer } from '@/lib/recherche/lecture'
import { PAR_PAGE, paginer, sectionsDeLaPage } from '@/lib/recherche/pagination'
import { proxy } from '@/proxy'

describe('U18 et E41 : les pages de 20, sans doublon', () => {
	const liste = Array.from({ length: 45 }, (_, i) => `p${i + 1}`)

	test('20 par page, la dernière garde le reste', () => {
		expect(PAR_PAGE).toBe(20)
		expect(paginer(liste, 1)).toMatchObject({ page: 1, pages: 3, total: 45, premier: 1 })
		expect(paginer(liste, 1).elements).toHaveLength(20)
		expect(paginer(liste, 3).elements).toEqual(['p41', 'p42', 'p43', 'p44', 'p45'])
	})

	test('les pages mises bout à bout redonnent la liste, chaque profil une seule fois', () => {
		const lues = [1, 2, 3].flatMap(page => paginer(liste, page).elements)
		expect(lues).toEqual(liste)
		expect(new Set(lues).size).toBe(lues.length)
	})

	test('une page hors bornes est ramenée dans les bornes ; une liste vide est une page vide', () => {
		expect(paginer(liste, 99).page).toBe(3)
		expect(paginer(liste, 0).page).toBe(1)
		expect(paginer(liste, Number.NaN).page).toBe(1)
		expect(paginer([], 4)).toEqual({ elements: [], page: 1, pages: 1, total: 0, premier: 1 })
	})

	test('une page à cheval sur deux sections montre la fin de l’une et le début de l’autre, sans rien répéter', () => {
		// 12 of the city, 15 of the département, 10 of the rest: the pages of 20 cut the second section.
		const longueurs = [12, 15, 10]
		const toutes = Array.from({ length: 37 }, (_, i) => i)
		const vues: number[] = []
		for (const page of [1, 2]) {
			const p = paginer(toutes, page)
			const parts = sectionsDeLaPage(p, longueurs)
			expect(parts.flat()).toEqual(p.elements)
			vues.push(...parts.flat())
		}
		expect(vues).toEqual(toutes)
		expect(sectionsDeLaPage(paginer(toutes, 1), longueurs).map(part => part.length)).toEqual([12, 8, 0])
		expect(sectionsDeLaPage(paginer(toutes, 2), longueurs).map(part => part.length)).toEqual([0, 7, 10])
	})
})

const requete = (chemin: string, adresse?: string, methode = 'GET') =>
	new NextRequest(`http://localhost:3100${chemin}`, {
		method: methode,
		headers: adresse ? { 'x-forwarded-for': adresse } : {},
	})

const unFrein = (limite: number) =>
	creerFrein({ nom: `essai-recherche-${crypto.randomUUID()}`, limite, fenetreMs: 60_000 })

describe('le frein de la recherche (I30 côté unité)', () => {
	test('la 61e requête d’une adresse est refusée en 429, en français, avec Retry-After', () => {
		const frein = unFrein(RECHERCHES_PAR_MINUTE)
		const entetes = new Headers({ 'x-forwarded-for': '192.0.2.1' })
		for (let i = 0; i < RECHERCHES_PAR_MINUTE; i += 1)
			expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes }, frein), `requête ${i + 1}`).toBeNull()
		const refusee = freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes }, frein)
		expect(refusee?.status).toBe(429)
		expect(refusee?.corps).toContain('Trop de recherches')
		expect(refusee?.corps).toContain('lang="fr"')
		expect(Number(refusee?.entetes['Retry-After'])).toBeGreaterThan(0)
		expect(Number(refusee?.entetes['Retry-After'])).toBeLessThanOrEqual(60)
		expect(refusee?.entetes['Cache-Control']).toBe('no-store')
	})

	test('une autre adresse passe, et la minute écoulée libère l’adresse freinée', () => {
		const frein = unFrein(3)
		const a = new Headers({ 'x-forwarded-for': '192.0.2.1' })
		const b = new Headers({ 'x-forwarded-for': '192.0.2.2' })
		for (let i = 0; i < 3; i += 1) frein.prendre('192.0.2.1')
		expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes: a }, frein)?.status).toBe(429)
		expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes: b }, frein)).toBeNull()
		expect(frein.prendre('192.0.2.1', Date.now() + 61_000)).toEqual({ autorise: true })
	})

	test('une requête qui n’est pas passée par le proxy n’est jamais freinée : pas d’en-tête, adresse locale écrite par Next', () => {
		const frein = unFrein(1)
		for (const adresse of [undefined, '127.0.0.1', '127.0.0.53', '::1', '::ffff:127.0.0.1', '[::1]'])
			for (let i = 0; i < 5; i += 1)
				expect(
					freinerLaRecherche(
						{ chemin: '/search', methode: 'GET', entetes: new Headers(adresse ? { 'x-forwarded-for': adresse } : {}) },
						frein
					),
					String(adresse)
				).toBeNull()
		// An address that is not local is counted at once.
		const distante = new Headers({ 'x-forwarded-for': '203.0.113.9' })
		expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes: distante }, frein)).toBeNull()
		expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes: distante }, frein)?.status).toBe(429)
	})

	test('seule la recherche est comptée : pas une autre page, un envoi, un préchargement, ni une requête sans proxy', () => {
		const frein = unFrein(1)
		const entetes = new Headers({ 'x-forwarded-for': '192.0.2.3' })
		const prechargement = new Headers({ 'x-forwarded-for': '192.0.2.3', 'next-router-prefetch': '1' })
		for (let i = 0; i < 5; i += 1) {
			expect(freinerLaRecherche({ chemin: '/', methode: 'GET', entetes }, frein)).toBeNull()
			expect(freinerLaRecherche({ chemin: '/profil/ana', methode: 'GET', entetes }, frein)).toBeNull()
			expect(freinerLaRecherche({ chemin: '/search', methode: 'POST', entetes }, frein)).toBeNull()
			expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes: prechargement }, frein)).toBeNull()
			expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes: new Headers() }, frein)).toBeNull()
		}
		// None of those took a place: the first real search still passes, the second is refused.
		expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes }, frein)).toBeNull()
		expect(freinerLaRecherche({ chemin: '/search', methode: 'GET', entetes }, frein)?.status).toBe(429)
	})

	test('par le proxy : la 61e recherche est refusée, l’accueil et un profil restent servis, une autre adresse passe', async () => {
		const adresse = '198.51.100.61'
		for (let i = 0; i < RECHERCHES_PAR_MINUTE; i += 1)
			expect(proxy(requete(`/search?city=Annecy&page=${i + 1}`, adresse)).status, `requête ${i + 1}`).not.toBe(429)
		const refusee = proxy(requete('/search?city=Annecy', adresse))
		expect(refusee.status).toBe(429)
		expect(refusee.headers.get('content-type')).toContain('text/html')
		expect(refusee.headers.get('retry-after')).not.toBeNull()
		expect(refusee.headers.get('x-robots-tag')).toBe('noindex, follow')
		expect(await refusee.text()).toContain('Trop de recherches')
		for (const chemin of ['/', '/profil/ana', '/blog', '/talent/mariee'])
			expect(proxy(requete(chemin, adresse)).status, chemin).not.toBe(429)
		expect(proxy(requete('/search?city=Annecy', '198.51.100.62')).status).not.toBe(429)
	})

	test('la barre finale est redirigée avant le frein : elle ne prend pas de place', () => {
		const adresse = '198.51.100.63'
		for (let i = 0; i < 10; i += 1) expect(proxy(requete('/search/?city=Annecy', adresse)).status).toBe(308)
		for (let i = 0; i < RECHERCHES_PAR_MINUTE; i += 1)
			expect(proxy(requete('/search?city=Annecy', adresse)).status).not.toBe(429)
	})
})

function journaliser() {
	const lignes: string[] = []
	const avant = console.error
	console.error = (...args: unknown[]) => {
		lignes.push(args.map(String).join(' '))
	}
	return {
		lignes,
		restaurer: () => {
			console.error = avant
		},
	}
}

describe('la lecture qui ne bloque jamais (ticket 100)', () => {
	test('une lecture qui réussit rend sa valeur', async () => {
		expect(await lireSansBloquer(async () => 42)).toEqual({ reussie: true, valeur: 42 })
	})

	test('une lecture qui échoue rend un échec sans lever, et ne journalise que la classe de l’erreur', async () => {
		const journal = journaliser()
		const lecture = await lireSansBloquer(async () => {
			throw new Error('connexion refusée : requête pour « mariage Annecy »')
		})
		journal.restaurer()
		expect(lecture).toEqual({ reussie: false })
		expect(journal.lignes).toHaveLength(1)
		expect(journal.lignes.join(' ')).not.toContain('mariage')
		expect(journal.lignes.join(' ')).not.toContain('Annecy')
	})

	test('une lecture qui ne répond pas est coupée au délai, et le délai tient sous les 10 secondes du ticket', async () => {
		const journal = journaliser()
		const debut = performance.now()
		const lecture = await lireSansBloquer(() => new Promise<never>(() => {}), 50)
		journal.restaurer()
		expect(lecture).toEqual({ reussie: false })
		expect(performance.now() - debut).toBeLessThan(1000)
		expect(DELAI_DE_LECTURE_MS).toBeLessThan(10_000)
	})
})
