import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileView } from '@/components/profile/ProfileView'
import { ResultCard } from '@/components/search/ResultCard'
import { DEMO_PROFILES, type DemoProfile, LOADED_DEMO_PROFILES } from '@/demo-data/profiles'
import { displayedArtistName } from '@/lib/profile/public-view'
import { type ProfilePageData, type PublicProfile, publicProfileOf } from '@/services/public/profiles'

/**
 * The page of a public profile, rendered from the profile the public reading gives, on the twelve
 * profile types of the fictional set and without a database (tickets 101 to 103; plan 02 E43 and E44
 * run the same page in a browser: tests/e2e/public-profile.spec.ts).
 */

const PHOTO_URL = 'https://photos.example.test/media'

/** A profile of the set as the public reading holds it: what the set writes, plus a main photo when it has one. */
function readType(type: DemoProfile, surcharge: Partial<ProfilePageData> = {}): PublicProfile {
	const doc: ProfilePageData = {
		slug: type.attendu.slug,
		status: type.attendu.status,
		publishable: type.attendu.publishable,
		indexable: type.attendu.indexable,
		...type.profil,
		...surcharge,
	}
	const photo = type.photos.principale
		? { url: `${PHOTO_URL}/${type.photos.principale}`, width: 400, height: 400 }
		: null
	const gallery = type.photos.galerie.map(fichier => ({
		url: `${PHOTO_URL}/${fichier}`,
		width: 400,
		height: 400,
	}))
	// What the public reading does: the contact details leave only when she published them.
	const { phone = null, email = null } = type.profil.contactDetails ?? {}
	const contactDetails = type.profil.publicContact === true && (phone || email) ? { telephone: phone, email } : null
	return publicProfileOf(doc, { photo, galerie: gallery, coordonnees: contactDetails })
}

const renderNow = (profil: PublicProfile): string => renderToStaticMarkup(<ProfileView profil={profil} />)

const type = (cle: string): DemoProfile => {
	const found = DEMO_PROFILES.find(profil => profil.cle === cle)
	if (!found) throw new Error(`pas de profil type « ${cle} »`)
	return found
}

const FORBIDDEN_WORDS = /\b(?:undefined|null|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

describe('E43 : l’en-tête du profil, dans le HTML du serveur', () => {
	test('le profil de référence : un h1 avec le nom, la spécialité, la zone, la disponibilité, la description', () => {
		const html = renderNow(readType(type('reference')))

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toMatch(/<h1[^>]*>Inès Morel<\/h1>/)
		expect(html).toContain('Maquillage mariage')
		expect(html).toContain('Annecy et 30 km autour')
		expect(html).toContain('Prend de nouvelles dates')
		expect(html).toContain('À propos')
		expect(html).toContain('Maquilleuse professionnelle installée à Annecy')
		expect(html).toContain('alt="Photo d’Inès Morel"')
		expect(html).toContain('Inès Morel Maquillage')
	})

	test('une disponibilité jamais posée compte comme disponible ; seul « false » dit indisponible', () => {
		expect(renderNow(readType(type('disponibilite-inconnue')))).toContain('Prend de nouvelles dates')
		const html = renderNow(readType(type('indisponible')))
		expect(html).toContain('Indisponible')
		expect(html).not.toContain('Prend de nouvelles dates')
	})

	test('sans photo, la photo du site est montrée sans texte alternatif', () => {
		const html = renderNow(readType(type('vide')))

		expect(html).toContain('pp_makeup.webp')
		expect(html).toContain('alt=""')
		expect(html).toMatch(/<h1[^>]*>Maquilleuse professionnelle<\/h1>/)
	})

	test('un champ vide n’affiche ni titre ni ligne vide, et jamais « undefined » ni « null »', () => {
		const html = renderNow(readType(type('vide')))

		expect(html).not.toMatch(FORBIDDEN_WORDS)
		expect(html).not.toContain('À propos')
		expect(html).not.toContain('km autour')
		expect(html).not.toMatch(/<p[^>]*><\/p>/)
	})

	test('une ville sans rayon : la ville seule ; un rayon sans ville : aucune zone', () => {
		expect(readType(type('reference'), { radiusKm: null }).zone).toBe('Annecy')
		expect(readType(type('reference'), { city: {} }).zone).toBeNull()
		expect(readType(type('reference'), { city: { name: 'null' }, radiusKm: 30 }).zone).toBeNull()
	})

	test('la description s’affiche une ligne par paragraphe, sans ligne vide', () => {
		const html = renderNow(readType(type('reference'), { description: 'Première ligne.\n\n  \nDeuxième ligne.\nnull' }))

		const section = html.slice(html.indexOf('À propos'))
		expect(section.slice(0, section.indexOf('</section>')).match(/<p /g)).toHaveLength(2)
		expect(html).toContain('Première ligne.')
		expect(html).toContain('Deuxième ligne.')
		expect(html).not.toMatch(FORBIDDEN_WORDS)
	})

	test('le nom d’artiste ne s’affiche que s’il ajoute quelque chose', () => {
		expect(
			displayedArtistName({ firstName: 'Léa', lastName: 'Garnier', artistName: 'Léa Garnier' }, 'Léa Garnier')
		).toBeNull()
		expect(
			displayedArtistName({ firstName: 'Léa', lastName: 'Garnier', artistName: 'Léa Garnier Beauté' }, 'Léa Garnier')
		).toBe('Léa Garnier Beauté')
		// Without a first or last name, the artist name is the h1 already.
		expect(displayedArtistName({ artistName: 'Studio Fictif' }, 'Studio Fictif')).toBeNull()
		expect(displayedArtistName({ firstName: 'Léa', artistName: 'undefined' }, 'Léa')).toBeNull()
	})

	test('aucune adresse postale : seule la commune est lue', () => {
		const profile = readType(type('reference'))

		expect(JSON.stringify(profile)).not.toMatch(/codeInsee|latitude|longitude|74010/)
	})

	test('les textes les plus longs : tout est rendu, avec de quoi passer à la ligne', () => {
		const html = renderNow(readType(type('textes-maximaux')))

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toContain('break-words')
		expect(html).toContain('Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson et 200 km autour')
	})
})

describe('E44 : les sections du profil', () => {
	test('les prestations : prix formatés par la règle unique, options dans l’ordre', () => {
		const html = renderNow(readType(type('reference')))

		expect(html).toContain('Prestations et tarifs')
		expect(html).toContain('Maquillage de la mariée')
		expect(html).toContain('À partir de 180\u00a0€')
		expect(html).toContain('60\u00a0€')
		expect(html).toContain('À partir de 45\u00a0€')
		// The offers keep the order she gave, and an option sits under its offer.
		const place = (texte: string) => html.indexOf(texte)
		expect(place('Maquillage de la mariée')).toBeLessThan(place('Retouches jusqu’au dîner'))
		expect(place('Retouches jusqu’au dîner')).toBeLessThan(place('Essai maquillage'))
		expect(place('Essai maquillage')).toBeLessThan(place('Maquillage des invitées'))
		// An option holds its price in the HTML even closed.
		expect(html).toMatch(/<details[^>]*>[\s\S]*Retouches jusqu’au dîner[\s\S]*60\u00a0€[\s\S]*<\/details>/)
	})

	test('un prix « sur devis » ou en texte libre reste tel qu’il a été écrit, avec une majuscule', () => {
		const html = renderNow(readType(type('publiable-non-indexable')))

		expect(html).toContain('Sur devis')
		expect(html).toContain('Selon le nombre de personnes')
		expect(html).not.toMatch(FORBIDDEN_WORDS)
	})

	test('les compétences, les langues, les formations et les expériences', () => {
		const html = renderNow(readType(type('reference')))

		expect(html).toContain('Compétences')
		expect(html).toContain('Maquillage longue tenue')
		expect(html).toContain('Langues')
		expect(html).toContain('Italien')
		expect(html).toContain('Formations &amp; diplômes')
		expect(html).toContain('CAP Esthétique, cosmétique, parfumerie')
		expect(html).toContain('juin 2014')
		expect(html).toContain('Expériences professionnelles')
		expect(html).toContain('septembre 2015 - août 2018')
		expect(html).toContain('septembre 2018 - aujourd’hui')
		expect(html).toContain('à Annecy')
	})

	test('une section vide n’est pas affichée, titre compris', () => {
		const html = renderNow(
			readType(type('sans-contact-public'), {
				skills: [{ name: '  ' }, { name: 'null' }],
				languages: [],
				courses: [{ diploma: null, school: '', graduatedAt: '2014-06-30' }],
				experiences: null,
				serviceOffers: [{ name: 'undefined', priceText: '50 €' }],
				networks: {},
			})
		)

		for (const title of [
			'Compétences',
			'Langues',
			'Formations',
			'Expériences',
			'Prestations et tarifs',
			'Réseaux sociaux',
		])
			expect(html, title).not.toContain(title)
		expect(html).not.toMatch(FORBIDDEN_WORDS)
	})

	test('les coordonnées publiées s’affichent, les autres jamais', () => {
		const published = renderNow(readType(type('reference')))
		expect(published).toContain('Réseaux sociaux &amp; contacts')
		expect(published).toContain('href="tel:0639981001"')
		expect(published).toContain('href="mailto:contact@ines-morel.example.test"')
		expect(published).toContain('href="https://instagram.example.test/ines.morel"')
		expect(published).toContain('href="https://ines-morel.example.test/"')

		const closed = renderNow(readType(type('sans-contact-public')))
		expect(closed).not.toContain('Réseaux sociaux')
		expect(closed).not.toContain('06 39 98 10 08')
		expect(closed).not.toContain('louise-girard.example.test')
		expect(closed).not.toContain('tel:')
		expect(closed).not.toContain('mailto:')
	})

	test('les liens sont ceux que la maquilleuse a saisis, jamais un schéma dangereux', () => {
		const html = renderNow(
			readType(type('reference'), {
				networks: {
					instagram: 'ines.morel',
					facebook: 'javascript:alert(1)',
					linkedin: 'instagram.com',
					youtube: '@ines',
					website: 'ines-morel.example.test/portfolio',
				},
			})
		)

		expect(html).toContain('href="https://www.instagram.com/ines.morel"')
		expect(html).not.toContain('href="javascript:')
		expect(html).toContain('href="https://www.youtube.com/@ines"')
		expect(html).toContain('href="https://ines-morel.example.test/portfolio"')
		// A value that leads nowhere is still shown as text, not as a link.
		expect(html).toContain('instagram.com')
	})

	test('les liens externes s’ouvrent dans un autre onglet, pas l’email ni le téléphone', () => {
		const html = renderNow(readType(type('reference')))

		expect(html).toMatch(
			/href="https:\/\/instagram\.example\.test[^"]*"[^>]*target="_blank"[^>]*rel="noopener nofollow noreferrer"/
		)
		expect(html).not.toMatch(/href="mailto:[^"]*"[^>]*target=/)
		expect(html).not.toMatch(/href="tel:[^"]*"[^>]*target=/)
	})

	test('les douze profils types : ni « undefined » ni « null », un seul h1, aucun titre sans contenu', () => {
		expect(DEMO_PROFILES).toHaveLength(12)
		for (const profileType of DEMO_PROFILES) {
			const html = renderNow(readType(profileType))
			const text = html.replace(/<[^>]+>/g, ' ')

			expect(text, profileType.cle).not.toMatch(FORBIDDEN_WORDS)
			expect(html.match(/<h1[\s>]/g), profileType.cle).toHaveLength(1)
			// A title is followed by something: never by the end of its card.
			expect(html, profileType.cle).not.toMatch(/<\/h[23]>\s*<\/(?:div|li|section)>/)
			expect(html, profileType.cle).not.toMatch(/<(?:p|li|h[1-6])[^>]*>\s*<\/(?:p|li|h[1-6])>/)
		}
	})
})

describe('301 : la fiche parle à la cliente', () => {
	const h2s = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(match => match[1])

	test('les nouveaux titres sont rendus, les anciens ne le sont plus', () => {
		const html = renderNow(readType(type('reference')))

		expect(h2s(html)).toContain('Prestations et tarifs')
		expect(h2s(html)).toContain('À propos')
		for (const old of ['Service(s) proposé(s)', 'Vous en quelques mots', 'Localisation', 'Peut travailler chez vous'])
			expect(html, old).not.toContain(old)
		expect(html).toContain('Prend de nouvelles dates')
		expect(html).not.toMatch(/>Disponible</)
	})

	test('la carte « Localisation & département » (doublon de l’en-tête) est absente, la zone reste dans l’en-tête', () => {
		for (const key of ['reference', 'textes-maximaux', 'ville-eloignee']) {
			const html = renderNow(readType(type(key)))
			expect(html, key).not.toContain('Localisation &amp; département')
			expect(html.match(/km autour/g)?.length ?? 0, key).toBeLessThanOrEqual(1)
		}
		expect(renderNow(readType(type('reference')))).toContain('Annecy et 30 km autour')
	})

	test('un seul h1, les titres de section sont des h2, les noms de prestation des h3', () => {
		const html = renderNow(readType(type('reference')))

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html.match(/<h2[\s>]/g)?.length).toBe(h2s(html).length)
		expect(html).toMatch(/<h3[^>]*>Maquillage de la mariée<\/h3>/)
		expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'))
	})

	test('le prix est dans l’élément de la prestation, en indigo, au corps du nom de la prestation', () => {
		const html = renderNow(readType(type('reference')))
		const offer = html.slice(html.indexOf('Maquillage de la mariée'), html.indexOf('Maquillage des invitées'))

		expect(offer).toMatch(/<p[^>]*text-indigo-900[^>]*text-lg[^>]*>À partir de 180\u00a0€<\/p>/)
		expect(offer).not.toContain('italic text-md')
		// The name of the offer is at the same size.
		expect(html).toMatch(/<h3[^>]*text-lg[^>]*>Maquillage de la mariée<\/h3>/)
	})
})

describe('E44 : le portfolio', () => {
	test('six photos, chacune avec son texte alternatif, dans l’ordre donné', () => {
		const html = renderNow(readType(type('reference')))

		expect(html).toContain('Portfolio')
		for (let n = 1; n <= 6; n++) expect(html).toContain(`alt="Réalisation d’Inès Morel (${n}/6)"`)
		expect(html.indexOf('(1/6)')).toBeLessThan(html.indexOf('(6/6)'))
		expect(html).toContain('Photo 1 sur 6')
	})

	test('sans galerie, la section est absente', () => {
		const html = renderNow(readType(type('vide')))

		expect(html).not.toContain('Portfolio')
		expect(html).not.toContain('Réalisation de')
	})

	test('une galerie dont les photos ont disparu n’affiche rien', () => {
		const profile = readType(type('reference'))

		expect(renderNow({ ...profile, galerie: [] })).not.toContain('Portfolio')
	})
})

// Ticket 264 (PLAN-ZONES.md §3.4): a zone abroad on the page, with the flag as decoration only.

const REGIONAL_INDICATORS = /[\u{1F1E6}-\u{1F1FF}]/u
const zoneType = (key: string): DemoProfile => {
	const found = LOADED_DEMO_PROFILES.find(profil => profil.cle === key)
	if (!found) throw new Error(`pas de profil type « ${key} »`)
	return found
}
/** The HTML with every `aria-hidden` span taken out: what a screen reader and a search engine read. */
const withoutDecoration = (html: string): string => html.replace(/<span aria-hidden="true">[^<]*<\/span>/g, '')

describe('264 : la zone hors de France sur la page du profil', () => {
	test('une ville à l’étranger : le drapeau dans son span aria-hidden, le pays toujours écrit', () => {
		const html = renderNow(readType(zoneType('zone-belgique'), { radiusKm: 30 }))

		expect(html).toContain('<span aria-hidden="true">🇧🇪</span> Bruxelles (Belgique) et 30 km autour')
		// The card of the location is gone (ticket 301): the header is the only place that says it.
		expect(html.match(/🇧🇪/g)).toHaveLength(1)
		expect(withoutDecoration(html)).not.toMatch(REGIONAL_INDICATORS)
		expect(withoutDecoration(html)).toContain('Bruxelles (Belgique) et 30 km autour')
	})

	test('plusieurs pays : un drapeau par pays, dans l’ordre, et les noms écrits', () => {
		const html = renderNow(readType(zoneType('zone-france-italie')))

		expect(html).toContain('<span aria-hidden="true">🇫🇷 🇮🇹</span> France et Italie')
		expect(withoutDecoration(html)).not.toMatch(REGIONAL_INDICATORS)
		expect(html).not.toContain('km autour')
	})

	test('le profil public : zone, lieu et phrase sont du texte sans drapeau, les drapeaux sont à part', () => {
		for (const [key, over, zone, place, phrase, flags] of [
			[
				'zone-belgique',
				{ radiusKm: 30 },
				'Bruxelles (Belgique) et 30 km autour',
				'Bruxelles (Belgique)',
				'à Bruxelles (Belgique)',
				['🇧🇪'],
			],
			['zone-belgique', { town: null }, 'Belgique', 'Belgique', 'en Belgique', ['🇧🇪']],
			['zone-france-italie', {}, 'France et Italie', 'France et Italie', 'en France et en Italie', ['🇫🇷', '🇮🇹']],
			['zone-france-italie', { countries: ['NL'] }, 'Pays-Bas', 'Pays-Bas', 'aux Pays-Bas', ['🇳🇱']],
		] as const) {
			const profile = readType(zoneType(key), over as Partial<ProfilePageData>)
			expect(profile, key).toMatchObject({ zone, lieu: place, placePhrase: phrase, flags })
			expect(JSON.stringify([profile.zone, profile.lieu, profile.placePhrase, profile.area]), key).not.toMatch(
				REGIONAL_INDICATORS
			)
		}
	})

	test('un pays à l’étranger se déplace s’il a plusieurs pays, ou un rayon', () => {
		expect(readType(zoneType('zone-france-italie')).seDeplace).toBe(true)
		expect(readType(zoneType('zone-belgique')).seDeplace).toBe(false)
		expect(readType(zoneType('zone-belgique'), { radiusKm: 30 }).seDeplace).toBe(true)
	})

	// Issue 1033: the photo of the head of the profile is asked first (`fetchPriority="high"` on the image and on its preload).
	// The 12 hashes of `profile` were taken again; each equals the old one once that attribute is taken out.
	test('le HTML du serveur d’une commune est identique, au caractère près, à celui d’avant le ticket', () => {
		const golden = JSON.parse(
			readFileSync(join(import.meta.dir, '../fixtures/municipality-html-hashes.json'), 'utf8')
		) as Record<string, { profile: string; card: string }>
		const hash = (html: string) => createHash('sha256').update(html).digest('hex')
		const taken: Record<string, { profile: string; card: string }> = {}
		expect(Object.keys(golden)).toEqual(DEMO_PROFILES.map(({ cle }) => cle))
		for (const profileType of DEMO_PROFILES) {
			const profile = publicProfileOf(
				{
					slug: profileType.attendu.slug,
					status: profileType.attendu.status,
					publishable: profileType.attendu.publishable,
					indexable: profileType.attendu.indexable,
					...profileType.profil,
				},
				{ photo: null, galerie: [], coordonnees: null }
			)
			const card = {
				slug: profile.slug,
				pid: 1,
				nom: profile.nom,
				specialite: profile.specialite,
				lieu: profile.zone,
				superMaquilleuse: false,
				photo: null,
			}
			const profileHash = hash(renderToStaticMarkup(<ProfileView profil={profile} />))
			const cardHash = hash(renderToStaticMarkup(<ResultCard carte={card} prioritaire={false} rang={1} />))
			taken[profileType.cle] = { profile: profileHash, card: cardHash }
			if (process.env.UPDATE_GOLDEN === '1') continue
			expect(profileHash, profileType.cle).toBe(golden[profileType.cle]?.profile as string)
			expect(cardHash, profileType.cle).toBe(golden[profileType.cle]?.card as string)
		}
		// A change of the public page on purpose (an icon, a class) takes the hashes again: `UPDATE_GOLDEN=1`.
		if (process.env.UPDATE_GOLDEN === '1')
			writeFileSync(
				join(import.meta.dir, '../fixtures/municipality-html-hashes.json'),
				`${JSON.stringify(taken, null, '\t')}\n`
			)
	})

	test('la carte : le drapeau dans son span aria-hidden, le nom du pays écrit ; une commune n’en a pas', () => {
		const card = (lieu: string | null, flags?: string[]) => ({
			slug: 'essai',
			pid: 1,
			nom: 'Essai',
			specialite: null,
			lieu,
			...(flags && { flags }),
			superMaquilleuse: false,
			photo: null,
		})
		const html = (lieu: string | null, flags?: string[]) =>
			renderToStaticMarkup(<ResultCard carte={card(lieu, flags)} prioritaire={false} rang={1} />)

		expect(html('Bruxelles (Belgique) et 30 km autour', ['🇧🇪'])).toContain(
			'<span aria-hidden="true">🇧🇪</span> Bruxelles (Belgique) et 30 km autour'
		)
		expect(html('France et Italie', ['🇫🇷', '🇮🇹'])).toContain('<span aria-hidden="true">🇫🇷 🇮🇹</span> France et Italie')
		expect(html('Annecy')).not.toMatch(REGIONAL_INDICATORS)
		expect(html('Annecy')).not.toContain('aria-hidden="true">Annecy')
		expect(html(null)).toContain('Zone non renseignée')
	})
})
