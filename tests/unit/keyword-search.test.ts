/**
 * The search by a word (ticket 099; plan 02 U23): the relevance score, the words kept, the way the
 * city places the profiles the words found. Unit tests: no database, no server. The page itself is
 * tests/e2e/keyword-search.spec.ts, the directory of 500 profiles tests/integration/search.test.ts.
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

const texts = (partiels: Partial<SearchTexts>) =>
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

interface Sheet {
	id: string
	textes: ReturnType<typeof texts>
}
const sheet = (id: string, partiels: Partial<SearchTexts>): Sheet => ({ id, textes: texts(partiels) })
const found = (fiches: readonly Sheet[], terme: string): string[] =>
	rankByRelevance(fiches, f => f.textes, terme).map(({ profil: profile }) => profile.id)

const ANNECY = sheet('annecy', {
	ville: 'Annecy',
	specialite: 'Maquillage mariée',
	description: 'Je fais le maquillage de mariage et des événements',
})
const SETE = sheet('sete', { ville: 'Sète', specialite: 'Teint', competences: ['Mains'] })
const NANTES = sheet('nantes', { ville: 'Nantes', specialite: 'Effets spéciaux', competences: ['Mains'] })
const SHEETS = [ANNECY, SETE, NANTES]

describe('U23 : le score de pertinence', () => {
	test('les poids sont normalisés : ils font 1, dans l’ordre voulu', () => {
		const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
		expect(sum).toBeCloseTo(1, 12)
		expect(WEIGHTS.ville).toBeGreaterThan(WEIGHTS.specialite)
		expect(WEIGHTS.specialite).toBeGreaterThan(WEIGHTS.description)
		expect(WEIGHTS.description).toBeGreaterThan(WEIGHTS.competences)
		expect(WEIGHTS.competences).toBeGreaterThan(WEIGHTS.nom)
	})

	test('le seuil est d’une faute pour cinq lettres : « Anecy » trouve Annecy, un mot plus court doit être exact', () => {
		expect(THRESHOLD).toBe(0.2)
		expect(found(SHEETS, 'Anecy')).toEqual(['annecy'])
		expect(found(SHEETS, 'Anecyy')).toEqual([])
		expect(found([sheet('a', { ville: 'Lyon' })], 'Lyan')).toEqual([])
		expect(found([sheet('a', { ville: 'Lyon' })], 'Lyon')).toEqual(['a'])
	})

	test('les accents et la casse ne comptent ni dans le mot ni dans le profil', () => {
		expect(withoutAccents('Événement Sète')).toBe('evenement sete')
		for (const word of ['evenement', 'événement', 'ÉVÉNEMENT']) expect(found(SHEETS, word)).toEqual(['annecy'])
		for (const word of ['Sete', 'sète', 'SÈTE']) expect(found(SHEETS, word)).toEqual(['sete'])
	})

	test('un mot que personne ne porte ne renvoie rien, sans erreur', () => {
		for (const word of ['zzqq', 'blah', 'zzqqxxyy']) expect(found(SHEETS, word)).toEqual([])
		expect(found(SHEETS, '')).toEqual([])
		expect(found(SHEETS, '   ')).toEqual([])
		expect(found([], 'mariage')).toEqual([])
	})

	test('tous les mots doivent être trouvés, chacun dans l’un des textes', () => {
		expect(found(SHEETS, 'mains')).toEqual(['sete', 'nantes'])
		expect(found(SHEETS, 'mains Nantes')).toEqual(['nantes'])
		expect(found(SHEETS, 'mains zzqq')).toEqual([])
		expect(found(SHEETS, 'Nantes mains')).toEqual(['nantes'])
	})

	test('un mot loin dans une longue description est trouvé aussi bien qu’au début', () => {
		const long = `${'Je me déplace avec mes produits dans toute la région, du lundi au samedi. '.repeat(3)}Je fais aussi le maquillage de mariage.`
		expect(long.indexOf('mariage')).toBeGreaterThan(150)
		expect(found([sheet('loin', { description: long }), SETE], 'mariage')).toEqual(['loin'])
	})

	test('le texte qui pèse le plus passe devant : la ville avant la description', () => {
		const inCity = sheet('ville', { ville: 'Mariage-sur-Mer' })
		const inDescription = sheet('description', { description: 'Un mariage, deux mariages' })
		const inName = sheet('nom', { nom: 'Mariage' })
		expect(found([inDescription, inName, inCity], 'mariage')).toEqual(['ville', 'description', 'nom'])
	})

	test('le score est déterministe et reste sous le nombre de mots', () => {
		const one = rankByRelevance(SHEETS, f => f.textes, 'mains')
		const two = rankByRelevance(SHEETS, f => f.textes, 'mains')
		expect(two).toEqual(one)
		for (const { score } of one) expect(score).toBeGreaterThan(0)
		for (const { score } of rankByRelevance(SHEETS, f => f.textes, 'mains Nantes')) {
			expect(score).toBeGreaterThan(0)
			expect(score).toBeLessThan(2)
		}
	})

	test('le préfiltre des morceaux ne perd aucune correspondance de Fuse, fautes comprises', () => {
		const testTexts = [
			'maquillage de mariage et de soiree en studio',
			'effets speciaux et prothèses',
			'une peau mature, un teint lumineux',
			'coiffure de mariee, chignons et ondulations',
			'annecy',
			'thonon-les-bains',
			'body painting et maquillage artistique',
			'pas du tout le meme sujet',
		]
		const sheets = testTexts.map((description, i) => sheet(`f${i}`, { description }))
		const reference = (mot: string): string[] =>
			new Fuse(
				testTexts.map((valeur, rang) => ({ rang, valeurs: [valeur] })),
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
		const words = [
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
		for (const word of words)
			expect(
				rankByRelevance(sheets, f => f.textes, word)
					.map(({ profil: profile }) => profile.id)
					.sort(),
				word
			).toEqual(reference(word))
	})

	test('à score égal, l’ordre de l’annuaire décide', () => {
		const a = sheet('a', { specialite: 'Teint' })
		const b = sheet('b', { specialite: 'Teint' })
		const c = sheet('c', { specialite: 'Teint' })
		expect(found([b, c, a], 'teint')).toEqual(['b', 'c', 'a'])
		expect(found([a, c, b], 'teint')).toEqual(['a', 'c', 'b'])
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
		expect(found(SHEETS, 'je cherche une maquilleuse pour mon mariage')).toEqual(['annecy'])
		expect(found(SHEETS, 'mariage')).toEqual(['annecy'])
	})

	test('les textes de la recherche ne comptent ni email, ni téléphone, ni adresse', () => {
		expect(Object.keys(texts({})).sort()).toEqual(
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

interface Profile extends SearchableProfile {
	id: string
}
const profile = (
	id: string,
	ville: string | null,
	departement: string | null,
	partiels: Partial<SearchTexts> = {},
	seDeplace = false
): Profile => ({
	id,
	ville,
	departement,
	seDeplace,
	textes: texts({ ville: ville ?? '', specialite: 'Mariage', ...partiels }),
})

describe('chercher : le mot filtre, la ville place', () => {
	const DIRECTORY: Profile[] = [
		profile('lyon', 'Lyon', '69', { specialite: 'Mariage' }),
		profile('annecy', 'Annecy', '74', { specialite: 'Mariage' }),
		profile('thonon', 'Thonon-les-Bains', '74', { specialite: 'Mariage' }),
		profile('paris', 'Paris', '75', { specialite: 'Effets spéciaux' }, true),
		profile('nantes', 'Nantes', '44', { specialite: 'Soirées', description: 'Mariage et soirées' }, true),
	]
	const ids = (liste: readonly { id: string }[]) => liste.map(({ id }) => id)

	test('un mot seul : une seule liste, sans section ; celles qui ne le portent pas sont absentes', () => {
		const r = find(DIRECTORY, { search: 'mariage', city: '' })
		expect(r.parLieu).toBe(false)
		expect(r.sections).toEqual([])
		expect(ids(r.locaux)).toEqual(['lyon', 'annecy', 'thonon', 'nantes'])
	})

	test('un mot et une ville : celles de la ville d’abord, jamais une maquilleuse que le mot n’a pas trouvée', () => {
		const r = find(DIRECTORY, { search: 'mariage', city: 'Annecy' })
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
		expect(ids(find(DIRECTORY, { search: 'mariage', city: '74' }).locaux)).toEqual(['annecy', 'thonon'])
	})

	test('une ville seule : tout l’annuaire, placé', () => {
		const r = find(DIRECTORY, { search: '', city: 'Annecy' })
		expect(ids(r.locaux)).toEqual(['annecy'])
		expect(r.locaux.length + r.sections.reduce((n, s) => n + s.profils.length, 0)).toBe(DIRECTORY.length)
	})

	test('un mot et une ville sans lieu utilisable : le mot seul', () => {
		const r = find(DIRECTORY, { search: 'mariage', city: 'France' })
		expect(r.parLieu).toBe(false)
		expect(ids(r.locaux)).toEqual(['lyon', 'annecy', 'thonon', 'nantes'])
	})

	test('un mot qui ne trouve rien : rien, même avec une ville', () => {
		const r = find(DIRECTORY, { search: 'zzqq', city: 'Annecy' })
		expect(r.locaux).toEqual([])
		expect(r.sections).toEqual([])
	})
})

describe('le texte saisi n’est ni journalisé ni mesuré', () => {
	test('aucun événement de mesure de la recherche ne porte de texte', () => {
		// `zone` is the code of a département of the list (or `unknown`), never what was typed.
		for (const name of ['search_submit', 'search_result_click', 'search_refine', 'card_click'] as const)
			for (const spec of Object.values(CATALOG[name]))
				expect(['boolean', 'enum', 'int', 'pid', 'zone'], name).toContain(spec.type)
	})

	test('le code de la recherche n’écrit dans aucun journal, hors le message fixe de l’échec de lecture', () => {
		const folders = ['src/lib/search', 'src/components/search', 'src/app/(front)/(site)/search']
		const files = folders.flatMap(dossier =>
			readdirSync(dossier, { recursive: true, withFileTypes: true })
				.filter(entree => entree.isFile())
				.map(entree => `${entree.parentPath}/${entree.name}`)
		)
		expect(files.length).toBeGreaterThan(6)
		for (const file of files) {
			const calls = [...readFileSync(file, 'utf8').matchAll(/console\.\w+\(/g)].map(([appel]) => appel)
			if (file.endsWith('src/lib/search/read.ts')) expect(calls, file).toEqual(['console.error('])
			else expect(calls, file).toEqual([])
		}
	})
})
