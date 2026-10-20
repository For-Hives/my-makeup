import { describe, expect, test } from 'bun:test'
import { adresseDuMedia, cleDuMedia, GALERIE_MAX, PREFIXE_DES_ENVOIS } from '@/lib/media'

/** Where the object of a media is, and its public address (ticket 043). */

describe('L’adresse publique = la base des photos, le préfixe du document, le nom du fichier', () => {
	const base = 'https://photos.exemple.test'

	test('à la racine du stockage : la base, puis le nom', () => {
		for (const prefixe of ['', null, undefined])
			expect(adresseDuMedia(base, prefixe, 'photo_3f2a1b.jpg')).toBe('https://photos.exemple.test/photo_3f2a1b.jpg')
	})

	test('sous un préfixe, même imbriqué : la base, le préfixe, puis le nom', () => {
		expect(adresseDuMedia(base, 'media', 'a1b2.webp')).toBe('https://photos.exemple.test/media/a1b2.webp')
		expect(adresseDuMedia(base, 'ancien/dossier', 'a1b2.webp')).toBe(
			'https://photos.exemple.test/ancien/dossier/a1b2.webp'
		)
	})

	test('la base du banc porte son espace dans le chemin', () => {
		expect(adresseDuMedia('http://127.0.0.1:9090/mymakeup-test', 'media', 'a.png')).toBe(
			'http://127.0.0.1:9090/mymakeup-test/media/a.png'
		)
	})

	test('les noms que donne le stockage restent tels quels ; un autre caractère est encodé', () => {
		expect(adresseDuMedia(base, 'media', 'Photo_1-a.B.jpg')).toBe('https://photos.exemple.test/media/Photo_1-a.B.jpg')
		expect(adresseDuMedia(base, 'media', 'une photo#1.jpg')).toBe(
			'https://photos.exemple.test/media/une%20photo%231.jpg'
		)
	})

	test('la clé de l’objet : le préfixe sans barre en trop, puis le nom', () => {
		expect(cleDuMedia('media', 'a.png')).toBe('media/a.png')
		expect(cleDuMedia('/media/', 'a.png')).toBe('media/a.png')
		expect(cleDuMedia('', 'a.png')).toBe('a.png')
	})

	test('une photo envoyée dans la v3 va sous media/ ; une galerie compte 10 photos au plus', () => {
		expect(PREFIXE_DES_ENVOIS).toBe('media')
		expect(GALERIE_MAX).toBe(10)
	})
})
