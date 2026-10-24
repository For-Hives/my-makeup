import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileView } from '@/components/profile/ProfileView'
import { PageArticle } from '@/components/static-pages/PageArticle'
import { DEMO_PROFILES, type DemoProfile, LOADED_DEMO_PROFILES } from '@/demo-data/profiles'
import { travelSentence } from '@/lib/profile/travel-sentence'
import { type ProfilePageData, type PublicProfile, publicProfileOf } from '@/services/public/profiles'

/**
 * The order of the page of a profile on a phone, and the folded sections (ticket 304; audit UX,
 * improvement 5): header, contact, « Prestations et tarifs », portfolio, « À propos », the zone in a
 * sentence, then skills, languages, courses and experiences folded. The HTML keeps the order of the
 * computer (the right column is unchanged); the phone reorders it with CSS only, so what a search engine
 * reads does not move. The measure in a browser (the prices in the first 1 400 px) is in
 * tests/e2e/profile-order-accessibility.spec.ts.
 */

const type = (cle: string): DemoProfile => {
	const found = DEMO_PROFILES.find(profil => profil.cle === cle)
	if (!found) throw new Error(`pas de profil type « ${cle} »`)
	return found
}

function readType(demo: DemoProfile, surcharge: Partial<ProfilePageData> = {}): PublicProfile {
	const doc: ProfilePageData = {
		slug: demo.attendu.slug,
		status: demo.attendu.status,
		publishable: demo.attendu.publishable,
		...demo.profil,
		...surcharge,
	}
	const { phone = null, email = null } = demo.profil.contactDetails ?? {}
	const contactDetails = demo.profil.publicContact === true && (phone || email) ? { telephone: phone, email } : null
	const gallery = demo.photos.galerie.map(fichier => ({
		url: `https://photos.example.test/media/${fichier}`,
		width: 400,
		height: 400,
	}))
	return publicProfileOf(doc, { photo: null, galerie: gallery, coordonnees: contactDetails })
}

const render = (profil: PublicProfile): string => renderToStaticMarkup(<ProfileView profil={profil} />)

/** The phone rank (`order-N`) of the block that holds each title, by title. */
function phoneRanks(html: string): Map<string, number> {
	const ranks = new Map<string, number>()
	for (const match of html.matchAll(
		/<div class="[^"]*\border-(\d+)\b[^"]*">(?:(?!<div class="[^"]*\border-\d)[\s\S])*?<h2[^>]*>([^<]*)<\/h2>/g
	))
		ranks.set(match[2] as string, Number(match[1]))
	return ranks
}

const SENTENCE = 'Se déplace à domicile, jusqu’à 30 km d’Annecy'

describe('304 : l’ordre de la fiche sur téléphone', () => {
	test('contact, prestations, portfolio, à propos, zone, puis compétences, langues, formations, expériences', () => {
		const html = render(readType(type('reference')))
		const ranks = phoneRanks(html)
		const order = [
			'Réseaux sociaux & contacts',
			'Prestations et tarifs',
			'Portfolio',
			'À propos',
			'Compétences',
			'Langues',
			'Formations & diplômes',
			'Expériences professionnelles',
		].map(title => ranks.get(title.replaceAll('&', '&amp;')))

		expect(order.every(rank => rank !== undefined)).toBe(true)
		expect([...order]).toEqual([...order].sort((a, b) => (a as number) - (b as number)))
		expect(new Set(order).size).toBe(order.length)
		// The sentence of the zone sits between « À propos » and the skills.
		const zone = /<div class="[^"]*\border-(\d+)\b[^"]*"><p[^>]*>(?:(?!<\/p>)[\s\S])*Se déplace à domicile/.exec(html)
		expect(Number(zone?.[1])).toBeGreaterThan(ranks.get('À propos') ?? 99)
		expect(Number(zone?.[1])).toBeLessThan(ranks.get('Compétences') ?? 0)
	})

	test('le HTML garde l’ordre de l’ordinateur : la colonne de droite est inchangée, rien ne bouge pour un moteur', () => {
		const html = render(readType(type('reference')))
		const place = (title: string) => html.indexOf(`>${title}</h2>`)

		expect(place('À propos')).toBeLessThan(place('Portfolio'))
		expect(place('Portfolio')).toBeLessThan(place('Prestations et tarifs'))
		expect(place('Prestations et tarifs')).toBeLessThan(place('Expériences professionnelles'))
		// A computer puts the blocks back in their own order.
		expect(html.match(/md:order-none/g)?.length).toBeGreaterThanOrEqual(8)
		expect(html).toContain('contents')
	})

	test('un seul h1, des h2 pour les sections, aucun titre de section sans contenu', () => {
		for (const profileType of DEMO_PROFILES) {
			const html = render(readType(profileType))
			expect(html.match(/<h1[\s>]/g), profileType.cle).toHaveLength(1)
			expect(html, profileType.cle).not.toMatch(/<\/h2>\s*<\/(?:div|li|section)>/)
		}
	})
})

describe('304 : les sections repliées', () => {
	test('compétences, langues, formations et expériences sont des details dont le texte est dans le HTML du serveur', () => {
		const html = render(readType(type('reference')))

		for (const [title, content] of [
			['Compétences', 'Maquillage longue tenue'],
			['Langues', 'Italien'],
			['Formations &amp; diplômes', 'CAP Esthétique, cosmétique, parfumerie'],
			['Expériences professionnelles', 'Maquilleuse indépendante'],
		] as const) {
			const block = new RegExp(
				`<details[^>]*>\\s*<summary[^>]*>(?:(?!</summary>)[\\s\\S])*${title}[\\s\\S]*?</details>`
			).exec(html)?.[0]
			expect(block, title).toBeDefined()
			expect(block, title).toContain(content)
		}
	})

	test('ouvertes dans le HTML : sans JavaScript, ou sur ordinateur, rien n’est caché', () => {
		const html = render(readType(type('reference')))
		const folded = [...html.matchAll(/<details([^>]*class="group")>\s*<summary/g)].map(match => match[1])

		expect(folded).toHaveLength(4)
		for (const attributes of folded) expect(attributes).toContain('open')
	})

	test('le résumé se prend au clavier : il reste un summary natif, avec un titre h2 dedans', () => {
		const html = render(readType(type('reference')))

		expect(html).toMatch(/<summary[^>]*>(?:(?!<\/summary>)[\s\S])*<h2[^>]*>Compétences<\/h2>/)
		// The prices of the options keep their own details (ticket 102).
		expect(html).toContain('Retouches jusqu’au dîner')
	})
})

describe('304 : la zone en une phrase', () => {
	test('« Se déplace à domicile, jusqu’à 30 km d’Annecy » pour le profil de référence', () => {
		const profile = readType(type('reference'))

		expect(travelSentence(profile)).toBe(SENTENCE)
		expect(render(profile)).toContain(SENTENCE)
	})

	test('l’élision suit la commune : « de Lyon », « d’Orléans »', () => {
		const base = readType(type('reference'))

		expect(travelSentence({ ...base, lieu: 'Lyon', zone: 'Lyon et 30 km autour' })).toBe(
			'Se déplace à domicile, jusqu’à 30 km de Lyon'
		)
		expect(travelSentence({ ...base, lieu: 'Orléans', zone: 'Orléans et 30 km autour' })).toBe(
			'Se déplace à domicile, jusqu’à 30 km d’Orléans'
		)
	})

	test('sans rayon et sans plusieurs pays, elle ne se déplace pas : aucune phrase', () => {
		const profile = readType(type('reference'), { radiusKm: null })

		expect(travelSentence(profile)).toBeNull()
		expect(render(profile)).not.toContain('Se déplace')
	})

	test('plusieurs pays : « Se déplace à domicile en France et en Italie »', () => {
		const zoneType = LOADED_DEMO_PROFILES.find(profil => profil.cle === 'zone-france-italie')
		if (!zoneType) throw new Error('profil type manquant')

		expect(travelSentence(readType(zoneType))).toBe('Se déplace à domicile en France et en Italie')
	})

	test('un profil sans zone n’a pas de phrase', () => {
		expect(travelSentence(readType(type('vide')))).toBeNull()
	})
})

describe('23 : le contraste de la signature des pages de texte', () => {
	test('la signature « L’équipe My-Makeup » n’est plus en gris clair', () => {
		const html = renderToStaticMarkup(
			<PageArticle eyebrow="E" contenu={{ titre: 'T', introduction: 'I', parties: [] }} />
		)

		expect(html).not.toContain('text-gray-400')
		expect(html).toContain('text-gray-700')
	})
})

describe('23 : le lien d’évitement', () => {
	test('il est la première chose du corps de la page, avant la navigation', () => {
		const layout = readFileSync(join(import.meta.dir, '../../src/app/(front)/layout.tsx'), 'utf8')

		expect(layout).toContain('<SkipLink />')
		expect(layout.indexOf('<SkipLink />')).toBeLessThan(layout.indexOf('{children}'))
		expect(layout.indexOf('<SkipLink />')).toBeLessThan(layout.indexOf('<WebVitals />'))
	})
})
