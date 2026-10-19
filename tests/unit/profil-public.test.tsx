import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { VueDuProfil } from '@/components/profil/VueDuProfil'
import { PROFILS_DU_JEU, type ProfilDuJeu } from '@/jeu-fictif/profils'
import { nomDArtisteAffiche } from '@/lib/profil/vue-publique'
import { type ProfilDeLaPage, type ProfilPublic, profilPublicDe } from '@/services/public/profils'

/**
 * The page of a public profile, rendered from the profile the public reading gives, on the twelve
 * profile types of the fictional set and without a database (tickets 101 to 103; plan 02 E43 and E44
 * run the same page in a browser: tests/e2e/profil-public.spec.ts).
 */

const ADRESSE_DE_PHOTO = 'https://photos.example.test/media'

/** A profile of the set as the public reading holds it: what the set writes, plus a main photo when it has one. */
function lireLeType(type: ProfilDuJeu, surcharge: Partial<ProfilDeLaPage> = {}): ProfilPublic {
	const doc: ProfilDeLaPage = {
		slug: type.attendu.slug,
		status: type.attendu.status,
		publishable: type.attendu.publishable,
		...type.profil,
		...surcharge,
	}
	const photo = type.photos.principale
		? { url: `${ADRESSE_DE_PHOTO}/${type.photos.principale}`, width: 400, height: 400 }
		: null
	const galerie = type.photos.galerie.map(fichier => ({
		url: `${ADRESSE_DE_PHOTO}/${fichier}`,
		width: 400,
		height: 400,
	}))
	// What the public reading does: the contact details leave only when she published them.
	const { phone: telephone = null, email = null } = type.profil.contactDetails ?? {}
	const coordonnees = type.profil.publicContact === true && (telephone || email) ? { telephone, email } : null
	return profilPublicDe(doc, { photo, galerie, coordonnees })
}

const rendre = (profil: ProfilPublic): string => renderToStaticMarkup(<VueDuProfil profil={profil} />)

const type = (cle: string): ProfilDuJeu => {
	const trouve = PROFILS_DU_JEU.find(profil => profil.cle === cle)
	if (!trouve) throw new Error(`pas de profil type « ${cle} »`)
	return trouve
}

const MOTS_INTERDITS = /\b(?:undefined|null|NaN|Invalid Date)\b|&\s*km|\bnullkm\b/

describe('E43 : l’en-tête du profil, dans le HTML du serveur', () => {
	test('le profil de référence : un h1 avec le nom, la spécialité, la zone, la disponibilité, la description', () => {
		const html = rendre(lireLeType(type('reference')))

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toMatch(/<h1[^>]*>Inès Morel<\/h1>/)
		expect(html).toContain('Maquillage mariage')
		expect(html).toContain('Annecy et 30 km autour')
		expect(html).toContain('Disponible')
		expect(html).toContain('Vous en quelques mots')
		expect(html).toContain('Maquilleuse professionnelle installée à Annecy')
		expect(html).toContain('alt="Photo de Inès Morel"')
		expect(html).toContain('Inès Morel Maquillage')
	})

	test('une disponibilité jamais posée compte comme disponible ; seul « false » dit indisponible', () => {
		expect(rendre(lireLeType(type('disponibilite-inconnue')))).toContain('Disponible')
		const html = rendre(lireLeType(type('indisponible')))
		expect(html).toContain('Indisponible')
		expect(html).not.toMatch(/>Disponible</)
	})

	test('sans photo, la photo du site est montrée sans texte alternatif', () => {
		const html = rendre(lireLeType(type('vide')))

		expect(html).toContain('pp_makeup.webp')
		expect(html).toContain('alt=""')
		expect(html).toMatch(/<h1[^>]*>Maquilleuse professionnelle<\/h1>/)
	})

	test('un champ vide n’affiche ni titre ni ligne vide, et jamais « undefined » ni « null »', () => {
		const html = rendre(lireLeType(type('vide')))

		expect(html).not.toMatch(MOTS_INTERDITS)
		expect(html).not.toContain('Vous en quelques mots')
		expect(html).not.toContain('km autour')
		expect(html).not.toMatch(/<p[^>]*><\/p>/)
	})

	test('une ville sans rayon : la ville seule ; un rayon sans ville : aucune zone', () => {
		expect(lireLeType(type('reference'), { radiusKm: null }).zone).toBe('Annecy')
		expect(lireLeType(type('reference'), { city: {} }).zone).toBeNull()
		expect(lireLeType(type('reference'), { city: { name: 'null' }, radiusKm: 30 }).zone).toBeNull()
	})

	test('la description s’affiche une ligne par paragraphe, sans ligne vide', () => {
		const html = rendre(lireLeType(type('reference'), { description: 'Première ligne.\n\n  \nDeuxième ligne.\nnull' }))

		const section = html.slice(html.indexOf('Vous en quelques mots'))
		expect(section.slice(0, section.indexOf('</section>')).match(/<p /g)).toHaveLength(2)
		expect(html).toContain('Première ligne.')
		expect(html).toContain('Deuxième ligne.')
		expect(html).not.toMatch(MOTS_INTERDITS)
	})

	test('le nom d’artiste ne s’affiche que s’il ajoute quelque chose', () => {
		expect(
			nomDArtisteAffiche({ firstName: 'Léa', lastName: 'Garnier', artistName: 'Léa Garnier' }, 'Léa Garnier')
		).toBeNull()
		expect(
			nomDArtisteAffiche({ firstName: 'Léa', lastName: 'Garnier', artistName: 'Léa Garnier Beauté' }, 'Léa Garnier')
		).toBe('Léa Garnier Beauté')
		// Without a first or last name, the artist name is the h1 already.
		expect(nomDArtisteAffiche({ artistName: 'Studio Fictif' }, 'Studio Fictif')).toBeNull()
		expect(nomDArtisteAffiche({ firstName: 'Léa', artistName: 'undefined' }, 'Léa')).toBeNull()
	})

	test('aucune adresse postale : seule la commune est lue', () => {
		const profil = lireLeType(type('reference'))

		expect(JSON.stringify(profil)).not.toMatch(/codeInsee|latitude|longitude|74010/)
	})

	test('les textes les plus longs : tout est rendu, avec de quoi passer à la ligne', () => {
		const html = rendre(lireLeType(type('textes-maximaux')))

		expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(html).toContain('break-words')
		expect(html).toContain('Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson et 200 km autour')
	})
})

describe('E44 : les sections du profil', () => {
	test('les prestations : prix formatés par la règle unique, options dans l’ordre', () => {
		const html = rendre(lireLeType(type('reference')))

		expect(html).toContain('Service(s) proposé(s)')
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
		const html = rendre(lireLeType(type('actif-non-publiable')))

		expect(html).toContain('Sur devis')
		expect(html).toContain('Selon le nombre de personnes')
		expect(html).not.toMatch(MOTS_INTERDITS)
	})

	test('les compétences, les langues, les formations et les expériences', () => {
		const html = rendre(lireLeType(type('reference')))

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
		const html = rendre(
			lireLeType(type('sans-contact-public'), {
				skills: [{ name: '  ' }, { name: 'null' }],
				languages: [],
				courses: [{ diploma: null, school: '', graduatedAt: '2014-06-30' }],
				experiences: null,
				serviceOffers: [{ name: 'undefined', priceText: '50 €' }],
				networks: {},
			})
		)

		for (const titre of ['Compétences', 'Langues', 'Formations', 'Expériences', 'Service(s)', 'Réseaux sociaux'])
			expect(html, titre).not.toContain(titre)
		expect(html).not.toMatch(MOTS_INTERDITS)
	})

	test('les coordonnées publiées s’affichent, les autres jamais', () => {
		const publiees = rendre(lireLeType(type('reference')))
		expect(publiees).toContain('Réseaux sociaux &amp; contacts')
		expect(publiees).toContain('href="tel:0639981001"')
		expect(publiees).toContain('href="mailto:contact@ines-morel.example.test"')
		expect(publiees).toContain('href="https://instagram.example.test/ines.morel"')
		expect(publiees).toContain('href="https://ines-morel.example.test/"')

		const fermees = rendre(lireLeType(type('sans-contact-public')))
		expect(fermees).not.toContain('Réseaux sociaux')
		expect(fermees).not.toContain('06 39 98 10 08')
		expect(fermees).not.toContain('louise-girard.example.test')
		expect(fermees).not.toContain('tel:')
		expect(fermees).not.toContain('mailto:')
	})

	test('les liens sont ceux que la maquilleuse a saisis, jamais un schéma dangereux', () => {
		const html = rendre(
			lireLeType(type('reference'), {
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
		const html = rendre(lireLeType(type('reference')))

		expect(html).toMatch(
			/href="https:\/\/instagram\.example\.test[^"]*"[^>]*target="_blank"[^>]*rel="noopener nofollow noreferrer"/
		)
		expect(html).not.toMatch(/href="mailto:[^"]*"[^>]*target=/)
		expect(html).not.toMatch(/href="tel:[^"]*"[^>]*target=/)
	})

	test('les douze profils types : ni « undefined » ni « null », un seul h1, aucun titre sans contenu', () => {
		expect(PROFILS_DU_JEU).toHaveLength(12)
		for (const profilType of PROFILS_DU_JEU) {
			const html = rendre(lireLeType(profilType))
			const texte = html.replace(/<[^>]+>/g, ' ')

			expect(texte, profilType.cle).not.toMatch(MOTS_INTERDITS)
			expect(html.match(/<h1[\s>]/g), profilType.cle).toHaveLength(1)
			// A title is followed by something: never by the end of its card.
			expect(html, profilType.cle).not.toMatch(/<\/h[23]>\s*<\/(?:div|li|section)>/)
			expect(html, profilType.cle).not.toMatch(/<(?:p|li|h[1-6])[^>]*>\s*<\/(?:p|li|h[1-6])>/)
		}
	})
})

describe('E44 : le portfolio', () => {
	test('six photos, chacune avec son texte alternatif, dans l’ordre donné', () => {
		const html = rendre(lireLeType(type('reference')))

		expect(html).toContain('Portfolio')
		for (let n = 1; n <= 6; n++) expect(html).toContain(`alt="Réalisation de Inès Morel (${n}/6)"`)
		expect(html.indexOf('(1/6)')).toBeLessThan(html.indexOf('(6/6)'))
		expect(html).toContain('Photo 1 sur 6')
	})

	test('sans galerie, la section est absente', () => {
		const html = rendre(lireLeType(type('vide')))

		expect(html).not.toContain('Portfolio')
		expect(html).not.toContain('Réalisation de')
	})

	test('une galerie dont les photos ont disparu n’affiche rien', () => {
		const profil = lireLeType(type('reference'))

		expect(rendre({ ...profil, galerie: [] })).not.toContain('Portfolio')
	})
})
