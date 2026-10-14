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
		statut: type.attendu.statut,
		publiable: type.attendu.publiable,
		...type.profil,
		...surcharge,
	}
	const photo = type.photos.principale
		? { url: `${ADRESSE_DE_PHOTO}/${type.photos.principale}`, width: 400, height: 400 }
		: null
	return profilPublicDe(doc, { photo, coordonnees: null })
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
		expect(lireLeType(type('reference'), { rayonKm: null }).zone).toBe('Annecy')
		expect(lireLeType(type('reference'), { commune: {} }).zone).toBeNull()
		expect(lireLeType(type('reference'), { commune: { nom: 'null' }, rayonKm: 30 }).zone).toBeNull()
	})

	test('la description s’affiche une ligne par paragraphe, sans ligne vide', () => {
		const html = rendre(lireLeType(type('reference'), { description: 'Première ligne.\n\n  \nDeuxième ligne.\nnull' }))

		expect(html.match(/<p class="break-words text-gray-800">/g)).toHaveLength(2)
		expect(html).toContain('Première ligne.')
		expect(html).toContain('Deuxième ligne.')
		expect(html).not.toMatch(MOTS_INTERDITS)
	})

	test('le nom d’artiste ne s’affiche que s’il ajoute quelque chose', () => {
		expect(nomDArtisteAffiche({ prenom: 'Léa', nom: 'Garnier', nomArtiste: 'Léa Garnier' }, 'Léa Garnier')).toBeNull()
		expect(nomDArtisteAffiche({ prenom: 'Léa', nom: 'Garnier', nomArtiste: 'Léa Garnier Beauté' }, 'Léa Garnier')).toBe(
			'Léa Garnier Beauté'
		)
		// Without a first or last name, the artist name is the h1 already.
		expect(nomDArtisteAffiche({ nomArtiste: 'Studio Fictif' }, 'Studio Fictif')).toBeNull()
		expect(nomDArtisteAffiche({ prenom: 'Léa', nomArtiste: 'undefined' }, 'Léa')).toBeNull()
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
