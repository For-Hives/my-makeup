/**
 * The search by a word (ticket 099; plan 02 U23): the relevance score, the words kept, the way the
 * city places the profiles the words found. Unit tests: no database, no server. The page itself is
 * tests/e2e/recherche-mot-cle.spec.ts, the directory of 500 profiles tests/integration/recherche.test.ts.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import Fuse from 'fuse.js'
import { CATALOGUE } from '@/lib/analytics/events'
import {
	classerParPertinence,
	motsDeLaRecherche,
	normaliserLesTextes,
	POIDS,
	SEUIL,
	sansAccents,
	type TextesDeRecherche,
} from '@/lib/search/relevance'
import { chercher, type ProfilCherchable } from '@/lib/search/results'

const textes = (partiels: Partial<TextesDeRecherche>) =>
	normaliserLesTextes({
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
const fiche = (id: string, partiels: Partial<TextesDeRecherche>): Fiche => ({ id, textes: textes(partiels) })
const trouve = (fiches: readonly Fiche[], terme: string): string[] =>
	classerParPertinence(fiches, f => f.textes, terme).map(({ profil }) => profil.id)

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
		const somme = Object.values(POIDS).reduce((a, b) => a + b, 0)
		expect(somme).toBeCloseTo(1, 12)
		expect(POIDS.ville).toBeGreaterThan(POIDS.specialite)
		expect(POIDS.specialite).toBeGreaterThan(POIDS.description)
		expect(POIDS.description).toBeGreaterThan(POIDS.competences)
		expect(POIDS.competences).toBeGreaterThan(POIDS.nom)
	})

	test('le seuil est d’une faute pour cinq lettres : « Anecy » trouve Annecy, un mot plus court doit être exact', () => {
		expect(SEUIL).toBe(0.2)
		expect(trouve(FICHES, 'Anecy')).toEqual(['annecy'])
		expect(trouve(FICHES, 'Anecyy')).toEqual([])
		expect(trouve([fiche('a', { ville: 'Lyon' })], 'Lyan')).toEqual([])
		expect(trouve([fiche('a', { ville: 'Lyon' })], 'Lyon')).toEqual(['a'])
	})

	test('les accents et la casse ne comptent ni dans le mot ni dans le profil', () => {
		expect(sansAccents('Événement Sète')).toBe('evenement sete')
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
		const un = classerParPertinence(FICHES, f => f.textes, 'mains')
		const deux = classerParPertinence(FICHES, f => f.textes, 'mains')
		expect(deux).toEqual(un)
		for (const { score } of un) expect(score).toBeGreaterThan(0)
		for (const { score } of classerParPertinence(FICHES, f => f.textes, 'mains Nantes')) {
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
					threshold: SEUIL,
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
				classerParPertinence(fiches, f => f.textes, mot)
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
		expect(motsDeLaRecherche('je cherche une maquilleuse pour mon mariage')).toEqual(['mariage'])
		expect(motsDeLaRecherche('maquillage pour un mariage')).toEqual(['mariage'])
		expect(motsDeLaRecherche('Maquilleuse Mariée')).toEqual(['mariee'])
		// A term of one word, or of words that are all dropped, is looked for as typed.
		expect(motsDeLaRecherche('maquillage')).toEqual(['maquillage'])
		expect(motsDeLaRecherche('pour les')).toEqual(['pour les'])
		expect(motsDeLaRecherche('ab')).toEqual(['ab'])
		// The same word twice is one word.
		expect(motsDeLaRecherche('mariage mariage')).toEqual(['mariage'])
		expect(motsDeLaRecherche('   ')).toEqual([])
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

interface Profil extends ProfilCherchable {
	id: string
}
const profil = (
	id: string,
	ville: string | null,
	departement: string | null,
	partiels: Partial<TextesDeRecherche> = {},
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
		const r = chercher(ANNUAIRE, { search: 'mariage', city: '' })
		expect(r.parLieu).toBe(false)
		expect(r.sections).toEqual([])
		expect(ids(r.locaux)).toEqual(['lyon', 'annecy', 'thonon', 'nantes'])
	})

	test('un mot et une ville : celles de la ville d’abord, jamais une maquilleuse que le mot n’a pas trouvée', () => {
		const r = chercher(ANNUAIRE, { search: 'mariage', city: 'Annecy' })
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
		expect(ids(chercher(ANNUAIRE, { search: 'mariage', city: '74' }).locaux)).toEqual(['annecy', 'thonon'])
	})

	test('une ville seule : tout l’annuaire, placé', () => {
		const r = chercher(ANNUAIRE, { search: '', city: 'Annecy' })
		expect(ids(r.locaux)).toEqual(['annecy'])
		expect(r.locaux.length + r.sections.reduce((n, s) => n + s.profils.length, 0)).toBe(ANNUAIRE.length)
	})

	test('un mot et une ville sans lieu utilisable : le mot seul', () => {
		const r = chercher(ANNUAIRE, { search: 'mariage', city: 'France' })
		expect(r.parLieu).toBe(false)
		expect(ids(r.locaux)).toEqual(['lyon', 'annecy', 'thonon', 'nantes'])
	})

	test('un mot qui ne trouve rien : rien, même avec une ville', () => {
		const r = chercher(ANNUAIRE, { search: 'zzqq', city: 'Annecy' })
		expect(r.locaux).toEqual([])
		expect(r.sections).toEqual([])
	})
})

describe('le texte saisi n’est ni journalisé ni mesuré', () => {
	test('aucun événement de mesure de la recherche ne porte de texte', () => {
		for (const nom of ['search_submit', 'search_result_click'] as const)
			for (const spec of Object.values(CATALOGUE[nom]))
				expect(['boolean', 'enum', 'int', 'pid'], nom).toContain(spec.type)
	})

	test('le code de la recherche n’écrit dans aucun journal, hors le message fixe de l’échec de lecture', () => {
		const dossiers = ['src/lib/recherche', 'src/components/recherche', 'src/app/(front)/(site)/search']
		const fichiers = dossiers.flatMap(dossier =>
			readdirSync(dossier, { recursive: true, withFileTypes: true })
				.filter(entree => entree.isFile())
				.map(entree => `${entree.parentPath}/${entree.name}`)
		)
		expect(fichiers.length).toBeGreaterThan(6)
		for (const fichier of fichiers) {
			const appels = [...readFileSync(fichier, 'utf8').matchAll(/console\.\w+\(/g)].map(([appel]) => appel)
			if (fichier.endsWith('src/lib/recherche/lecture.ts')) expect(appels, fichier).toEqual(['console.error('])
			else expect(appels, fichier).toEqual([])
		}
	})
})
