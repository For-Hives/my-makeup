import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	formatZone,
	rayonKm,
	villeAffichee,
} from '../../src/lib/format-zone.js'
import {
	altRealisation,
	attributs,
	contacts,
	galerie,
	lignes,
	medias,
	moisAnnee,
	nomAffiche,
	offres,
	periode,
	photoPrincipale,
	sectionsVisibles,
	urlMedia,
	urlReseau,
} from '../../src/lib/profil/vue-publique.js'
import { trierProfilsPublics } from '../../src/lib/profil/publiables.js'

const INTERDIT = /\b(null|undefined|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

describe('formatZone (plans/02 U14)', () => {
	test('U14 no city / radius combination gives « null », « undefined » or « & km »', () => {
		const villes = [
			'Annecy',
			'  Annecy  ',
			'',
			'   ',
			null,
			undefined,
			'null',
			'undefined',
			42,
			{},
		]
		const rayons = [
			30,
			'30',
			0,
			'0',
			null,
			undefined,
			'',
			'abc',
			-5,
			1e6,
			12.6,
			Number.NaN,
		]
		for (const city of villes)
			for (const radius of rayons) {
				const zone = formatZone({ city, radius })
				assert.doesNotMatch(zone, INTERDIT, `${city} / ${radius} → ${zone}`)
			}
		assert.equal(formatZone(), '')
	})

	test('city and radius', () => {
		assert.equal(
			formatZone({ city: 'Annecy', radius: 30 }),
			'Annecy et 30 km autour'
		)
		assert.equal(
			formatZone({ city: ' Annecy ', radius: '12.6' }),
			'Annecy et 13 km autour'
		)
		assert.equal(formatZone({ city: 'Annecy', radius: 0 }), 'Annecy')
		assert.equal(formatZone({ city: 'Annecy', radius: null }), 'Annecy')
		assert.equal(formatZone({ city: '', radius: 30 }), '')
		assert.equal(villeAffichee('null'), '')
		assert.equal(rayonKm(2000), null)
	})
})

describe('public profile view (UI-06)', () => {
	const fichier = (id, w = 800, h = 600) => ({
		id,
		attributes: {
			url: `https://r2.example.test/${id}.webp`,
			width: w,
			height: h,
		},
	})

	test('media of the content API and of /api/me-makeup, flat', () => {
		assert.deepEqual(
			medias({ data: [fichier(1), fichier(2)] }).map(m => m.url),
			['https://r2.example.test/1.webp', 'https://r2.example.test/2.webp']
		)
		assert.equal(
			photoPrincipale({ main_picture: { data: fichier(3) } }).url,
			'https://r2.example.test/3.webp'
		)
		assert.equal(photoPrincipale({ main_picture: { data: null } }), null)
		assert.equal(
			photoPrincipale({ main_picture: { id: 4, url: '/uploads/4.webp' } }).url,
			'/uploads/4.webp'
		)
		assert.deepEqual(
			galerie({
				image_gallery: [{ id: 5, url: 'https://x.test/5.png' }, { id: 6 }],
			}).length,
			1
		)
		assert.deepEqual(
			medias({ data: [{ id: 7, attributes: { url: 'u', width: null } }] })[0],
			{
				url: 'u',
				width: null,
				height: null,
				formats: {},
			}
		)
		assert.deepEqual(galerie(null), [])
	})

	test('media: the copies resized by Strapi, with their weight, not the thumbnail', () => {
		const [media] = medias({
			data: {
				id: 8,
				attributes: {
					url: 'https://r2.example.test/8.jpg',
					size: 1400.5,
					formats: {
						thumbnail: { url: 'https://r2.example.test/t_8.jpg', size: 8 },
						large: { url: 'https://r2.example.test/l_8.jpg', size: 180.2 },
						medium: { url: 'https://r2.example.test/m_8.jpg' },
						small: { url: null, size: 30 },
					},
				},
			},
		})
		assert.deepEqual(media.formats, {
			large: { url: 'https://r2.example.test/l_8.jpg', taille: 180.2 },
			medium: { url: 'https://r2.example.test/m_8.jpg', taille: null },
		})
		assert.deepEqual(medias({ url: 'u', formats: null })[0].formats, {})
	})

	test('absolute picture URLs', () => {
		assert.equal(
			urlMedia('https://r2.example.test/a.webp', 'http://api'),
			'https://r2.example.test/a.webp'
		)
		assert.equal(
			urlMedia('/uploads/a.webp', 'https://api.example.test/'),
			'https://api.example.test/uploads/a.webp'
		)
		assert.equal(urlMedia('//evil.test/a.webp', 'https://api'), '')
		assert.equal(urlMedia(null), '')
	})

	test('the name of the h1: first and last name, else the artist name, never « null »', () => {
		assert.equal(
			nomAffiche({ attributes: { first_name: 'Zoé', last_name: 'Lefèvre' } }),
			'Zoé Lefèvre'
		)
		assert.equal(
			nomAffiche({
				first_name: null,
				last_name: 'null',
				company_artist_name: 'Studio Z',
			}),
			'Studio Z'
		)
		assert.equal(nomAffiche({}), 'Maquilleuse professionnelle')
		assert.equal(attributs(null).first_name, undefined)
	})

	test('pictures named « Réalisation de <nom> (n/N) »', () => {
		assert.equal(
			altRealisation('Zoé Lefèvre', 2, 6),
			'Réalisation de Zoé Lefèvre (2/6)'
		)
	})

	test('dates in UTC, never « Invalid Date » nor 1970', () => {
		assert.equal(moisAnnee('2020-01-01'), 'janvier 2020')
		assert.equal(moisAnnee('2020-01-01T00:00:00.000Z'), 'janvier 2020')
		for (const v of [null, undefined, '', 'pas une date', 0])
			assert.equal(moisAnnee(v), '')
		assert.equal(
			periode({ date_start: '2019-03-01', date_end: null }),
			'mars 2019 - aujourd’hui'
		)
		assert.equal(
			periode({ date_start: '2019-03-01', date_end: '2021-07-15' }),
			'mars 2019 - juillet 2021'
		)
		assert.equal(periode({ date_start: null, date_end: '2021-07-15' }), '')
	})

	test('lines of a text', () => {
		assert.deepEqual(lignes('a\n\n b \n'), ['a', 'b'])
		assert.deepEqual(lignes(null), [])
	})

	test('network links: http(s) only, @pseudo on its network, never javascript:', () => {
		assert.equal(
			urlReseau('instagram', 'https://instagram.com/zoe'),
			'https://instagram.com/zoe'
		)
		assert.equal(
			urlReseau('instagram', '@zoe.makeup'),
			'https://www.instagram.com/zoe.makeup'
		)
		assert.equal(
			urlReseau('instagram', 'zoe.makeup'),
			'https://www.instagram.com/zoe.makeup'
		)
		assert.equal(
			urlReseau('instagram', 'instagram.com/zoe'),
			'https://instagram.com/zoe'
		)
		assert.equal(
			urlReseau('website', 'studio.example.test'),
			'https://studio.example.test/'
		)
		assert.equal(urlReseau('website', 'mon site'), null)
		assert.equal(urlReseau('website', 'javascript:alert(1)'), null)
		assert.equal(urlReseau('facebook', ''), null)
	})

	test('contacts: mailto and tel, nothing for an empty channel', () => {
		const liste = contacts({
			id: 1,
			instagram: '@zoe',
			email: 'zoe@example.test',
			phone: '06 39 98 00 01',
			website: '',
			youtube: null,
		})
		assert.deepEqual(
			liste.map(c => [c.canal, c.href]),
			[
				['instagram', 'https://www.instagram.com/zoe'],
				['email', 'mailto:zoe@example.test'],
				['phone', 'tel:0639980001'],
			]
		)
		assert.deepEqual(contacts(null), [])
	})

	test('empty sections are hidden', () => {
		assert.deepEqual(sectionsVisibles({}), {
			localisation: false,
			reseaux: false,
			competences: false,
			langues: false,
			formations: false,
			description: false,
			portfolio: false,
			offres: false,
			experiences: false,
		})
		const v = sectionsVisibles({
			city: 'Annecy',
			network: { instagram: 'zoe' },
			skills: [{ name: 'Mariée' }],
			language: [{ name: '' }],
			courses: [{ diploma: 'CAP' }],
			description: 'Texte',
			image_gallery: { data: [fichier(1)] },
			service_offers: [
				{ name: 'Mariée', options: [{ name: '' }, { name: 'Essai' }] },
			],
			experiences: [{ company: null, job_name: null }],
		})
		assert.equal(v.langues, false)
		assert.equal(v.experiences, false)
		assert.equal(v.offres, true)
		assert.deepEqual(
			offres({
				service_offers: [
					{ name: 'Mariée', options: [{ name: '' }, { name: 'Essai' }] },
					{ name: '' },
				],
			}).map(o => o.options.length),
			[1]
		)
	})
})

describe('publiable profiles of a list (SEO-10)', () => {
	const DESCRIPTION = 'Maquilleuse professionnelle. '.repeat(8)
	const complet = (id, username, extra = {}) => ({
		id,
		attributes: {
			username,
			createdAt: `2024-01-${String(id).padStart(2, '0')}T00:00:00.000Z`,
			updatedAt: `2026-0${(id % 9) + 1}-01T00:00:00.000Z`,
			city: 'Annecy',
			speciality: 'Mariage',
			description: DESCRIPTION,
			main_picture: { data: { id } },
			service_offers: [{ price: '120 €' }],
			network: { id, instagram: 'compte' },
			...extra,
		},
	})

	test('publiables with their slug and updatedAt; a profile without contact in a list is to be checked alone', () => {
		const { publiables, aVerifier } = trierProfilsPublics([
			complet(1, 'Zoé Lefèvre'),
			complet(2, 'ZOE LEFEVRE'),
			// API PR #370: email and phone removed from the list
			complet(3, 'camille', { network: { id: 3, instagram: '' } }),
			// before PR #370: the list says there is no channel at all
			complet(4, 'sans-canal', {
				network: { id: 4, instagram: '', email: '', phone: '' },
			}),
			complet(5, 'coquille', { city: '', main_picture: { data: null } }),
		])
		assert.deepEqual(
			publiables.map(p => [p.slug, p.updatedAt]),
			[
				['zoe-lefevre', '2026-02-01T00:00:00.000Z'],
				['zoe-lefevre-2', '2026-03-01T00:00:00.000Z'],
			]
		)
		assert.deepEqual(
			aVerifier.map(p => p.username),
			['camille']
		)
		assert.equal(
			trierProfilsPublics(
				[complet(3, 'camille', { network: { instagram: '' } })],
				{ formulaireDevis: true }
			).publiables.length,
			1
		)
	})
})
