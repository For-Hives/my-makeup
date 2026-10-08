import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
	balisesMeta,
	descriptionMeta,
	IMAGE_PAR_DEFAUT,
	jsonLdFilAriane,
	sansVides,
	seoArticle,
	seoPage,
	seoProfil,
	seoTalent,
	serialiserJsonLd,
	titrePage,
	tronquer,
} from '../../src/lib/seo/meta.js'
import {
	CHEMINS_NOINDEX,
	NOINDEX,
	robotsPourChemin,
} from '../../src/lib/seo/robots.js'
import { retrograderTitres } from '../../src/lib/contenu.js'

const require = createRequire(import.meta.url)
const SITE = 'https://my-makeup.fr'
const DESCRIPTION =
	'Maquilleuse professionnelle à Annecy depuis dix ans, je prépare les mariées, leurs témoins et leurs invitées, à domicile ou au salon, avec un essai offert pour toute réservation. Produits adaptés aux peaux sensibles.'

// made-up publiable profile, content API shape
const profil = {
	id: 7,
	attributes: {
		username: 'Zoé Lefèvre',
		first_name: 'Zoé',
		last_name: 'Lefèvre',
		speciality: 'Maquillage mariée',
		city: 'Annecy',
		action_radius: 30,
		description: DESCRIPTION,
		main_picture: {
			data: { id: 1, attributes: { url: 'https://r2.example.test/zoe.webp' } },
		},
		image_gallery: {
			data: [{ id: 2, attributes: { url: '/uploads/g1.webp' } }],
		},
		skills: [{ name: 'Mariée' }, { name: 'Mariée' }, { name: 'Soirée' }],
		language: [{ name: 'Français' }],
		service_offers: [
			{
				name: 'Mariée',
				description: 'Essai et jour J',
				price: 'à partir de 180 €',
				options: [],
			},
			{ name: 'Invitée', description: '', price: 'Sur devis', options: [] },
		],
		network: {
			instagram: '@zoe.makeup',
			email: 'zoe@example.test',
			phone: '06 39 98 00 01',
			website: '',
		},
	},
}

const meta = (balises, cle) => balises.find(b => b.cle === cle)?.contenu

describe('titles and descriptions (plans/02 U44-U45)', () => {
	test('U44 fallback title: never « null null » nor « undefined », 60 characters at most', () => {
		const vides = seoProfil({
			profil: { attributes: { first_name: null, last_name: null } },
			slug: 'x',
			site: SITE,
		})
		assert.doesNotMatch(vides.titre, /null|undefined/)
		assert.ok(vides.titre.length <= 60, vides.titre)
		const s = seoProfil({ profil, slug: 'zoe-lefevre', site: SITE })
		assert.equal(
			s.titre,
			'Zoé Lefèvre – Maquillage mariée à Annecy | My-Makeup'
		)
		const long = seoProfil({
			profil: {
				attributes: {
					...profil.attributes,
					first_name: 'A'.repeat(40),
					last_name: 'B'.repeat(40),
				},
			},
			slug: 'x',
			site: SITE,
		})
		assert.ok(long.titre.length <= 60, long.titre)
		assert.equal(
			titrePage('Maquillage mariée'),
			'Maquillage mariée | My-Makeup'
		)
		assert.ok(titrePage('x'.repeat(80)).length <= 60)
		assert.equal(tronquer('un deux trois quatre', 12), 'un deux…')
	})

	test('U45 meta description of 70 to 155 characters, without HTML', () => {
		const s = seoProfil({ profil, slug: 'zoe-lefevre', site: SITE })
		assert.ok(
			s.description.length >= 70 && s.description.length <= 155,
			s.description
		)
		const court = seoProfil({
			profil: { attributes: { ...profil.attributes, description: 'Court.' } },
			slug: 'x',
			site: SITE,
		})
		assert.ok(
			court.description.length >= 70 && court.description.length <= 155,
			court.description
		)
		assert.match(
			court.description,
			/^Découvrez Zoé Lefèvre, Maquillage mariée à Annecy/
		)
		assert.equal(
			descriptionMeta(
				'<p>Un **texte** [lien](https://x.test) assez long pour passer le seuil de soixante-dix caractères.</p>',
				'repli'
			),
			'Un texte lien assez long pour passer le seuil de soixante-dix caractères.'
		)
	})
})

describe('canonical, robots and Open Graph (plans/02 U46, U51, U52)', () => {
	test('U46 canonical: absolute, on the slug, no trailing slash nor parameter', () => {
		const s = seoProfil({
			profil,
			slug: 'zoe-lefevre',
			site: 'https://my-makeup.fr/',
		})
		assert.equal(s.url, 'https://my-makeup.fr/profil/zoe-lefevre')
		assert.equal(
			seoPage({ titre: 'Accueil', description: 'd', chemin: '/', site: SITE })
				.url,
			'https://my-makeup.fr'
		)
		assert.equal(
			seoTalent({
				talent: { slug: 'maquillage-mariee', title: 'Mariée' },
				site: SITE,
			}).url,
			'https://my-makeup.fr/talent/maquillage-mariee'
		)
		assert.equal(
			seoArticle({ article: { slug: 'prix', title: 'Prix' }, site: SITE }).url,
			'https://my-makeup.fr/blog/prix'
		)
	})

	test('U51 Open Graph: title, description, absolute image, type, url; Twitter card', () => {
		const s = seoProfil({ profil, slug: 'zoe-lefevre', site: SITE })
		const balises = balisesMeta(s)
		assert.equal(meta(balises, 'og:type'), 'profile')
		assert.equal(meta(balises, 'og:title'), s.titre)
		assert.equal(meta(balises, 'og:description'), s.description)
		assert.equal(meta(balises, 'og:image'), 'https://r2.example.test/zoe.webp')
		assert.equal(
			meta(balises, 'og:url'),
			'https://my-makeup.fr/profil/zoe-lefevre'
		)
		assert.equal(meta(balises, 'twitter:card'), 'summary_large_image')
		assert.equal(meta(balises, 'robots'), undefined)
		for (const b of balises)
			assert.doesNotMatch(b.contenu, /\b(null|undefined)\b/, b.cle)
		const sansPhoto = seoProfil({
			profil: {
				attributes: { ...profil.attributes, main_picture: { data: null } },
			},
			slug: 'x',
			site: SITE,
		})
		assert.equal(sansPhoto.image, `${SITE}${IMAGE_PAR_DEFAUT}`)
		for (const page of [
			seoPage({
				titre: 'Accueil',
				description: 'Texte',
				chemin: '/',
				site: SITE,
			}),
			seoTalent({ talent: { slug: 't', title: 'T' }, site: SITE }),
			seoArticle({ article: { slug: 'a', title: 'A' }, site: SITE }),
		]) {
			const b = balisesMeta(page)
			for (const cle of [
				'og:title',
				'og:description',
				'og:image',
				'og:url',
				'twitter:card',
			])
				assert.ok(meta(b, cle), `${page.url} ${cle}`)
			assert.match(meta(b, 'og:image'), /^https:\/\//)
		}
	})

	test('U52 robots: noindex on profiles that are not publiable, /auth/*, /search', () => {
		const coquille = seoProfil({
			profil: { attributes: { username: 'vide', first_name: 'Vide' } },
			slug: 'vide',
			site: SITE,
		})
		assert.equal(coquille.indexable, false)
		assert.equal(meta(balisesMeta(coquille), 'robots'), NOINDEX)
		// without a published channel, the quote form makes her publiable
		const sansCanal = { attributes: { ...profil.attributes, network: {} } }
		assert.equal(
			seoProfil({ profil: sansCanal, slug: 'x', site: SITE }).indexable,
			false
		)
		assert.equal(
			seoProfil({
				profil: sansCanal,
				slug: 'x',
				site: SITE,
				formulaireDevis: true,
			}).indexable,
			true
		)
		for (const p of [
			'/auth',
			'/auth/signin',
			'/auth/profil',
			'/search',
			'/404',
		])
			assert.equal(robotsPourChemin(p), NOINDEX, p)
		for (const p of [
			'/',
			'/profil/[username]',
			'/authentique',
			'/searching',
			'/blog',
			undefined,
		])
			assert.equal(robotsPourChemin(p), null, String(p))
	})

	test('next.config.js sends X-Robots-Tag on the same paths', async () => {
		const config = require('../../next.config.js')
		const regles = await config.headers()
		const sources = regles.map(r => r.source)
		for (const prefixe of CHEMINS_NOINDEX) {
			assert.ok(sources.includes(prefixe), prefixe)
			for (const r of regles)
				assert.deepEqual(r.headers, [
					{ key: 'X-Robots-Tag', value: 'noindex, follow' },
				])
		}
		assert.ok(sources.includes('/auth/:path*'))
	})
})

describe('JSON-LD (plans/02 U47-U50)', () => {
	test('U47 profile: Person with speciality, city, picture, networks, and its offers (Service, EUR)', () => {
		const [personne, ariane] = seoProfil({
			profil,
			slug: 'zoe-lefevre',
			site: SITE,
			apiBase: 'https://api.example.test',
		}).jsonLd
		assert.equal(personne['@type'], 'Person')
		assert.equal(personne.name, 'Zoé Lefèvre')
		assert.equal(personne.jobTitle, 'Maquillage mariée')
		assert.equal(personne.url, 'https://my-makeup.fr/profil/zoe-lefevre')
		assert.equal(personne.image, 'https://r2.example.test/zoe.webp')
		assert.deepEqual(personne.workLocation, {
			'@type': 'Place',
			name: 'Annecy',
		})
		assert.deepEqual(personne.knowsAbout, ['Mariée', 'Soirée'])
		assert.deepEqual(personne.sameAs, ['https://www.instagram.com/zoe.makeup'])
		assert.equal(personne.makesOffer.length, 2)
		const [mariee, invitee] = personne.makesOffer
		assert.equal(mariee.itemOffered['@type'], 'Service')
		assert.deepEqual(mariee.itemOffered.areaServed, {
			'@type': 'City',
			name: 'Annecy',
		})
		assert.deepEqual(mariee.priceSpecification, {
			'@type': 'PriceSpecification',
			minPrice: 180,
			priceCurrency: 'EUR',
		})
		assert.equal(invitee.priceSpecification, null)
		assert.deepEqual(personne.subjectOf.image, [
			'https://api.example.test/uploads/g1.webp',
		])
		assert.equal(ariane['@type'], 'BreadcrumbList')
	})

	test('U48 no email, phone, postal address nor rating; nothing null once serialised', () => {
		const json = seoProfil({ profil, slug: 'zoe-lefevre', site: SITE })
			.jsonLd.map(serialiserJsonLd)
			.join('\n')
		assert.doesNotMatch(json, /zoe@example\.test|39 98|0639980001|mailto|tel:/)
		assert.doesNotMatch(
			json,
			/PostalAddress|streetAddress|AggregateRating|Review/
		)
		assert.doesNotMatch(json, /null|undefined/)
	})

	test('a profile that is not publiable only has its breadcrumb', () => {
		const ld = seoProfil({
			profil: { attributes: { first_name: 'Vide', last_name: 'Profil' } },
			slug: 'vide',
			site: SITE,
		}).jsonLd
		assert.deepEqual(
			ld.map(d => d['@type']),
			['BreadcrumbList']
		)
	})

	test('U49 BreadcrumbList from the home page', () => {
		assert.deepEqual(
			seoArticle({ article: { slug: 'prix', title: 'Prix 2027' }, site: SITE })
				.jsonLd[0].itemListElement,
			[
				{
					'@type': 'ListItem',
					position: 1,
					name: 'Accueil',
					item: 'https://my-makeup.fr',
				},
				{
					'@type': 'ListItem',
					position: 2,
					name: 'Blog',
					item: 'https://my-makeup.fr/blog',
				},
				{
					'@type': 'ListItem',
					position: 3,
					name: 'Prix 2027',
					item: 'https://my-makeup.fr/blog/prix',
				},
			]
		)
		assert.equal(jsonLdFilAriane([]).itemListElement.length, 0)
	})

	test('U50 serialiserJsonLd escapes <, > and &', () => {
		const json = serialiserJsonLd({
			name: '</script><script>alert(1)</script> & co',
		})
		assert.doesNotMatch(json, /[<>&]/)
		assert.equal(
			JSON.parse(json).name,
			'</script><script>alert(1)</script> & co'
		)
		assert.deepEqual(
			sansVides({ a: null, b: [], c: { d: '' }, e: 0, f: [null, 'x'] }),
			{ e: 0, f: ['x'] }
		)
	})
})

describe('content of talents and articles', () => {
	test('their « # titre » become h2: the page title is the only h1', () => {
		assert.equal(
			retrograderTitres('<h1>Titre</h1><p>x</p><h1 id="a">B</h1 >'),
			'<h2>Titre</h2><p>x</p><h2 id="a">B</h2>'
		)
		assert.equal(retrograderTitres('<h2>déjà</h2>'), '<h2>déjà</h2>')
		assert.equal(retrograderTitres(null), '')
	})
})
