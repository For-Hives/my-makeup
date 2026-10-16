import { describe, expect, test } from 'bun:test'
import {
	adresseAVerifier,
	type FamilleVerifiee,
	memoireDesPagesQuiExistent,
	segmentEcrit,
} from '@/lib/urls/page-inconnue'

/** Which addresses the proxy looks up before the page runs (ticket 231). */

describe('adresseAVerifier', () => {
	test.each<[string, FamilleVerifiee, string]>([
		['/profil/zoe-lefevre', 'profil', 'zoe-lefevre'],
		['/talent/maquillage-mariee', 'talent', 'maquillage-mariee'],
		['/blog/un-article', 'blog', 'un-article'],
	])('%s est vérifiée', (chemin, famille, segment) => {
		expect(adresseAVerifier(chemin, 'GET')).toEqual({ famille, segment })
		expect(adresseAVerifier(chemin, 'HEAD')).toEqual({ famille, segment })
	})

	test('le segment est lu comme la page le lit (décodé)', () => {
		expect(adresseAVerifier('/profil/zo%C3%A9', 'GET')).toEqual({ famille: 'profil', segment: 'zoé' })
		expect(segmentEcrit('%E0%A4%A')).toBe('%E0%A4%A')
	})

	test.each([
		'/',
		'/profil',
		'/profil/',
		'/blog',
		'/blog/a/b',
		'/profil/a/b',
		'/search',
		'/auth/profil',
		'/api/profil/x',
		'/talents/x',
		'/Profil/x',
	])('%s n’est pas vérifiée', chemin => {
		expect(adresseAVerifier(chemin, 'GET')).toBeNull()
	})

	test.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('une requête %s n’est jamais vérifiée', methode => {
		expect(adresseAVerifier('/profil/x', methode)).toBeNull()
	})
})

describe('memoireDesPagesQuiExistent', () => {
	test('retient une page qui existe pendant la durée, puis l’oublie', () => {
		let t = 1_000
		const memoire = memoireDesPagesQuiExistent({ dureeMs: 60_000 }, () => t)
		expect(memoire.connait('talent:a')).toBe(false)
		memoire.retenir('talent:a')
		expect(memoire.connait('talent:a')).toBe(true)
		t += 59_999
		expect(memoire.connait('talent:a')).toBe(true)
		t += 2
		expect(memoire.connait('talent:a')).toBe(false)
		expect(memoire.taille).toBe(0)
	})

	test('ne dépasse jamais sa taille : la plus ancienne part', () => {
		let t = 0
		const memoire = memoireDesPagesQuiExistent({ dureeMs: 60_000, tailleMax: 3 }, () => t++)
		for (const cle of ['a', 'b', 'c', 'd']) memoire.retenir(cle)
		expect(memoire.taille).toBe(3)
		expect(memoire.connait('a')).toBe(false)
		expect(memoire.connait('d')).toBe(true)
	})

	test('une page retenue de nouveau repart pour toute la durée', () => {
		let t = 0
		const memoire = memoireDesPagesQuiExistent({ dureeMs: 100 }, () => t)
		memoire.retenir('a')
		t = 90
		memoire.retenir('a')
		t = 150
		expect(memoire.connait('a')).toBe(true)
		expect(memoire.taille).toBe(1)
	})
})
