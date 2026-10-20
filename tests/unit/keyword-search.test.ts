/**
 * The search by a word (ticket 099; plan 02 U23): the relevance score, the words kept, the way the
 * city places the profiles the words found. Unit tests: no database, no server. The page itself is
 * tests/e2e/recherche-mot-cle.spec.ts, the directory of 500 profiles tests/integration/recherche.test.ts.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import Fuse from 'fuse.js'
import { CATALOG } from '@/lib/analytics/events'
import {
	normalizeTexts,
	rankByRelevance,
	type SearchTexts,
	searchWords,
	THRESHOLD,
	WEIGHTS,
	withoutAccents,
} from '@/lib/search/relevance'
import { find, type SearchableProfile } from '@/lib/search/results'

const textes = (partiels: Partial<SearchTexts>) =>
	normalizeTexts({
		ville: '',
		specialite: '',
		description: '',
		competences: [],
		descriptionsDesCompetences: [],
		descriptionsDesPrestations: [],
		nom: '',
		prenom: '',
		...partiels,
	})

interface Fiche {
	id: string
	textes: ReturnType<typeof textes>
}
const fiche = (id: string, partiels: Partial<SearchTexts>): Fiche => ({ id, textes: textes(partiels) })
const trouve = (fiches: readonly Fiche[], terme: string): string[] =>
	rankByRelevance(fiches, f => f.textes, terme).map(({ profil }) => profil.id)

const ANNECY = fiche('annecy', {
	ville: 'Annecy',
	specialite: 'Maquillage mariée',
	description: 'Je fais le maquillage de mariage et des événements',
})
const SETE = fiche('sete', { ville: 'Sète', specialite: 'Teint', competences: ['Mains'] })
const NANTES = fiche('nantes', { ville: 'Nantes', specialite: 'Effets spéciaux', competences: ['Mains'] })
const FICHES = [ANNECY, SETE, NANTES]

describe('U23 : le score de pertinence', () => {
	test('les poids sont normalisés : ils font 1, dans l’ordre voulu', () => {
		const somme = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
		expect(somme).toBeCloseTo(1, 12)
		expect(WEIGHTS.ville).toBeGreaterThan(WEIGHTS.specialite)
		expect(WEIGHTS.specialite).toBeGreaterThan(WEIGHTS.description)
		expect(WEIGHTS.description).toBeGreaterThan(WEIGHTS.competences)
		expect(WEIGHTS.competences).toBeGreaterThan(WEIGHTS.nom)
	})

	test('le seuil est d’une faute pour cinq lettres : « Anecy » trouve Annecy, un mot plus court doit être exact', () => {
		expect(THRESHOLD).toBe(0.2)
		expect(trouve(FICHES, 'Anecy')).toEqual(['annecy'])
		expect(trouve(FICHES, 'Anecyy')).toEqual([])
		expect(trouve([fiche('a', { ville: 'Lyon' })], 'Lyan')).toEqual([])
		expect(trouve([fiche('a', { ville: 'Lyon' })], 'Lyon')).toEqual(['a'])
	})

	test('les accents et la casse ne comptent ni dans le mot ni dans le profil', () => {
		expect(withoutAccents('Événement Sète')).toBe('evenement sete')
		for (const mot of ['evenement', 'événement', 'ÉVÉNEMENT']) expect(trouve(FICHES, mot)).toEqual(['annecy'])
		for (const mot of ['Sete', 'sète', 'SÈTE']) expect(trouve(FICHES, mot)).toEqual(['sete'])
	})

	test('un mot que personne ne porte ne renvoie rien, sans erreur', () => {
		for (const mot of ['zzqq', 'blah', 'zzqqxxyy']) expect(trouve(FICHES, mot)).toEqual([])
		expect(trouve(FICHES, '')).toEqual([])
		expect(trouve(FICHES, '   ')).toEqual([])
		expect(trouve([], 'mariage')).toEqual([])
	})

	test('tous les mots doivent être trouvés, chacun dans l’un des textes', () => {
		expect(trouve(FICHES, 'mains')).toEqual(['sete', 'nantes'])
		expect(trouve(FICHES, 'mains Nantes')).toEqual(['nantes'])
		expect(trouve(FICHES, 'mains zzqq')).toEqual([])
		expect(trouve(FICHES, 'Nantes mains')).toEqual(['nantes'])
	})

	test('un mot loin dans une longue description est trouvé aussi bien qu’au début', () => {
		const longue = `${'Je me déplace avec mes produits dans toute la région, du lundi au samedi. '.repeat(3)}Je fais aussi le maquillage de mariage.`
		expect(longue.indexOf('mariage')).toBeGreaterThan(150)
		expect(trouve([fiche('loin', { description: longue }), SETE], 'mariage')).toEqual(['loin'])
	})

	test('le texte qui pèse le plus passe devant : la ville avant la description', () => {
		const dansLaVille = fiche('ville', { ville: 'Mariage-sur-Mer' })
		const dansLaDescription = fiche('description', { description: 'Un mariage, deux mariages' })
		const dansLeNom = fiche('nom', { nom: 'Mariage' })
		expect(trouve([dansLaDescription, dansLeNom, dansLaVille], 'mariage')).toEqual(['ville', 'description', 'nom'])
	})

	test('le score est déterministe et reste sous le nombre de mots', () => {
		const un = rankByRelevance(FICHES, f => f.textes, 'mains')
		const deux = rankByRelevance(FICHES, f => f.textes, 'mains')
		expect(deux).toEqual(un)
		for (const { score } of un) expect(score).toBeGreaterThan(0)
		for (const { score } of rankByRelevance(FICHES, f => f.textes, 'mains Nantes')) {
			expect(score).toBeGreaterThan(0)
			expect(score).toBeLessThan(2)
		}
	})

	test('le préfiltre des morceaux ne perd aucune correspondance de Fuse, fautes comprises', () => {
		const textesDeLEssai = [
			'maquillage de mariage et de soiree en studio',
			'effets speciaux et prothèses',
			'une peau mature, un teint lumineux',
			'coiffure de mariee, chignons et ondulations',
			'annecy',
			'thonon-les-bains',
			'body painting et maquillage artistique',
			'pas du tout le meme sujet',
		]
		const fiches = textesDeLEssai.map((description, i) => fiche(`f${i}`, { description }))
		const reference = (mot: string): string[] =>
			new Fuse(
				textesDeLEssai.map((valeur, rang) => ({ rang, valeurs: [valeur] })),
				{
					keys: ['valeurs'],
					threshold: THRESHOLD,
					ignoreLocation: true,
					includeScore: true,
					findAllMatches: true,
					ignoreFieldNorm: true,
				}
			)
				.search(mot)
				.map(({ item }) => `f${item.rang}`)
				.sort()
		const mots = [
			'mariage',
			'mariaje',
			'marriage',
			'mariag',
			'soiree',
			'soirre',
			'speciaux',
			'spéciaux',
			'protheses',
			'prothses',
			'lumineux',
			'luminex',
			'chignons',
			'chinons',
			'ondulations',
			'ondulatons',
			'ondulatiens',
			'annecy',
			'anecy',
			'annesy',
			'thonon',
			'tonon',
			'painting',
			'paintin',
			'artistique',
			'artistiqe',
			'artistiqueee',
			'teint',
			'tient',
			'xyzxyz',
			'maquillage',
			'maquilage',
			'maquilllage',
			'maquillagexyz',
		]
		for (const mot of mots)
			expect(
				rankByRelevance(fiches, f => f.textes, mot)
					.map(({ profil }) => profil.id)
					.sort(),
				mot
			).toEqual(reference(mot))
	})

	test('à score égal, l’ordre de l’annuaire décide', () => {
		const a = fiche('a', { specialite: 'Teint' })
		const b = fiche('b', { specialite: 'Teint' })
		const c = fiche('c', { specialite: 'Teint' })
		expect(trouve([b, c, a], 'teint')).toEqual(['b', 'c', 'a'])
		expect(trouve([a, c, b], 'teint')).toEqual(['a', 'c', 'b'])
	})

	test('mots vides et mots de la demande sont ignorés ; un mot seul est cherché tel quel', () => {
		expect(searchWords('je cherche une maquilleuse pour mon mariage')).toEqual(['mariage'])
		expect(searchWords('maquillage pour un mariage')).toEqual(['mariage'])
		expect(searchWords('Maquilleuse Mariée')).toEqual(['mariee'])
		// A term of one word, or of words that are all dropped, is looked for as typed.
		expect(searchWords('maquillage')).toEqual(['maquillage'])
		expect(searchWords('pour les')).toEqual(['pour les'])
		expect(searchWords('ab')).toEqual(['ab'])
		// The same word twice is one word.
		expect(searchWords('mariage mariage')).toEqual(['mariage'])
		expect(searchWords('   ')).toEqual([])
		expect(trouve(FICHES, 'je cherche une maquilleuse pour mon mariage')).toEqual(['annecy'])
		expect(trouve(FICHES, 'mariage')).toEqual(['annecy'])
	})

	test('les textes de la recherche ne comptent ni email, ni téléphone, ni adresse', () => {
		expect(Object.keys(textes({})).sort()).toEqual(
			[
				'competences',
				'description',
				'descriptionsDesCompetences',
				'descriptionsDesPrestations',
				'nom',
				'prenom',
				'specialite',
				'ville',
			].sort()
		)
	})
})

interface Profil extends SearchableProfile {
	id: string
}
const profil = (
	id: string,
	ville: string | null,
	departement: string | null,
	partiels: Partial<SearchTexts> = {},
	seDeplace = false
): Profil => ({
	id,
	ville,
	departement,
	seDeplace,
	textes: textes({ ville: ville ?? '', specialite: 'Mariage', ...partiels }),
})

describe('chercher : le mot filtre, la ville place', () => {
	const ANNUAIRE: Profil[] = [
		profil('lyon', 'Lyon', '69', { specialite: 'Mariage' }),
		profil('annecy', 'Annecy', '74', { specialite: 'Mariage' }),
		profil('thonon', 'Thonon-les-Bains', '74', { specialite: 'Mariage' }),
		profil('paris', 'Paris', '75', { specialite: 'Effets spéciaux' }, true),
		profil('nantes', 'Nantes', '44', { specialite: 'Soirées', description: 'Mariage et soirées' }, true),
	]
	const ids = (liste: readonly { id: string }[]) => liste.map(({ id }) => id)

	test('un mot seul : une seule liste, sans section ; celles qui ne le portent pas sont absentes', () => {
		const r = find(ANNUAIRE, { search: 'mariage', city: '' })
		expect(r.parLieu).toBe(false)
		expect(r.sections).toEqual([])
		expect(ids(r.locaux)).toEqual(['lyon', 'annecy', 'thonon', 'nantes'])
	})

	test('un mot et une ville : celles de la ville d’abord, jamais une maquilleuse que le mot n’a pas trouvée', () => {
		const r = find(ANNUAIRE, { search: 'mariage', city: 'Annecy' })
		expect(r.parLieu).toBe(true)
		// « Annecy » names no département: the artists of the city only are « local »; the other artists of its
		// département (found from hers) follow, then those who travel, then the rest.
		expect(ids(r.locaux)).toEqual(['annecy'])
		expect(r.sections.map(s => [s.cle, ids(s.profils)])).toEqual([
			['departement', ['thonon']],
			['deplacent', ['nantes']],
			['autres', ['lyon']],
		])
		expect(ids(r.locaux)).not.toContain('paris')
		expect([...ids(r.locaux), ...ids(r.sections.flatMap(s => s.profils))]).not.toContain('paris')
	})

	test('un département tapé place ses maquilleuses en tête, mot ou pas', () => {
		expect(ids(find(ANNUAIRE, { search: 'mariage', city: '74' }).locaux)).toEqual(['annecy', 'thonon'])
	})

	test('une ville seule : tout l’annuaire, placé', () => {
		const r = find(ANNUAIRE, { search: '', city: 'Annecy' })
		expect(ids(r.locaux)).toEqual(['annecy'])
		expect(r.locaux.length + r.sections.reduce((n, s) => n + s.profils.length, 0)).toBe(ANNUAIRE.length)
	})

	test('un mot et une ville sans lieu utilisable : le mot seul', () => {
		const r = find(ANNUAIRE, { search: 'mariage', city: 'France' })
		expect(r.parLieu).toBe(false)
		expect(ids(r.locaux)).toEqual(['lyon', 'annecy', 'thonon', 'nantes'])
	})

	test('un mot qui ne trouve rien : rien, même avec une ville', () => {
		const r = find(ANNUAIRE, { search: 'zzqq', city: 'Annecy' })
		expect(r.locaux).toEqual([])
		expect(r.sections).toEqual([])
	})
})

describe('le texte saisi n’est ni journalisé ni mesuré', () => {
	test('aucun événement de mesure de la recherche ne porte de texte', () => {
		for (const nom of ['search_submit', 'search_result_click'] as const)
			for (const spec of Object.values(CATALOG[nom]))
				expect(['boolean', 'enum', 'int', 'pid'], nom).toContain(spec.type)
	})

	test('le code de la recherche n’écrit dans aucun journal, hors le message fixe de l’échec de lecture', () => {
		const dossiers = ['src/lib/search', 'src/components/search', 'src/app/(front)/(site)/search']
		const fichiers = dossiers.flatMap(dossier =>
			readdirSync(dossier, { recursive: true, withFileTypes: true })
				.filter(entree => entree.isFile())
				.map(entree => `${entree.parentPath}/${entree.name}`)
		)
		expect(fichiers.length).toBeGreaterThan(6)
		for (const fichier of fichiers) {
			const appels = [...readFileSync(fichier, 'utf8').matchAll(/console\.\w+\(/g)].map(([appel]) => appel)
			if (fichier.endsWith('src/lib/search/read.ts')) expect(appels, fichier).toEqual(['console.error('])
			else expect(appels, fichier).toEqual([])
		}
	})
})
