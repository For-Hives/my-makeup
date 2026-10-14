import { describe, expect, test } from 'bun:test'
import { lireLesArguments } from '../../scripts/migration/import/arguments'
import { ImportRefuse, verifierLaCible } from '../../scripts/migration/import/cible'
import {
	type Adaptateur,
	type Attendu,
	type Existant,
	empreinteDesDocuments,
	normaliser,
	parite,
	pariteComplete,
	planifier,
} from '../../scripts/migration/import/moteur'
import { importReussi, type Rapport, rapportEnTexte } from '../../scripts/migration/import/rapport'
import { memesTables } from '../../scripts/migration/import/source'
import { type LigneTalent, talentAttendu, talentsAttendus } from '../../scripts/migration/import/talents'
import { CONTEXTE_IMPORT, estUnImport } from '../../src/lib/contexte-import'

/**
 * Ticket 024: the parts of the import that need no database. The runs themselves are in
 * tests/integration/import-talents.test.ts, on the bench.
 */

describe('la cible : une base de ce poste, ou une base distante que la commande nomme', () => {
	test('une base locale est acceptée, avec ou sans drapeau', () => {
		for (const hote of ['127.0.0.1:5443', 'localhost:5442', '[::1]:5432'])
			expect(verifierLaCible(`postgres://u:p@${hote}/base`, { cibleDistante: false })).toBe('locale')
		expect(verifierLaCible('postgres://u:p@127.0.0.1/base', { cibleDistante: true })).toBe('locale')
	})

	test('une base distante est refusée sans le drapeau, acceptée avec', () => {
		const distantes = [
			'postgres://u:p@base.example.test:5432/prod',
			'postgres://u:p@10.0.0.5/prod',
			// A host parameter replaces the host of the address: it counts.
			'postgres://u:p@127.0.0.1/prod?host=base.example.test',
			'pas une adresse',
		]
		for (const adresse of distantes) {
			expect(() => verifierLaCible(adresse, { cibleDistante: false }), adresse).toThrow(ImportRefuse)
			expect(verifierLaCible(adresse, { cibleDistante: true }), adresse).toBe('distante')
		}
	})

	test('le refus nomme la variable et le drapeau, jamais l’adresse', () => {
		const adresse = 'postgres://utilisateur:secret-de-test@base.example.test:5432/prod'
		let message = ''
		try {
			verifierLaCible(adresse, { cibleDistante: false })
		} catch (erreur) {
			message = (erreur as Error).message
		}
		expect(message).toContain('DATABASE_URI')
		expect(message).toContain('--cible-distante')
		for (const morceau of ['base.example.test', 'secret-de-test', 'utilisateur']) expect(message).not.toContain(morceau)
		expect(() => verifierLaCible(undefined, { cibleDistante: true })).toThrow('DATABASE_URI manque')
	})
})

describe('la ligne de commande : à blanc par défaut', () => {
	test('sans option, rien n’est écrit ; --reel écrit', () => {
		expect(lireLesArguments([])).toEqual({ mode: 'a-blanc', cibleDistante: false })
		expect(lireLesArguments(['--reel', '--cible-distante', '--rapport', 'r.json'])).toEqual({
			mode: 'reel',
			cibleDistante: true,
			rapport: 'r.json',
		})
	})

	test('une option inconnue, répétée ou sans sa valeur n’est pas comprise', () => {
		for (const ligne of [['--prod'], ['--reel', '--reel'], ['--rapport'], ['--rapport', '--reel'], ['reel']])
			expect(lireLesArguments(ligne), ligne.join(' ')).toBeNull()
	})
})

describe('le contexte d’import', () => {
	test('il se reconnaît, et rien d’autre ne passe pour lui', () => {
		expect(estUnImport(CONTEXTE_IMPORT)).toBe(true)
		expect(estUnImport({ ...CONTEXTE_IMPORT, profilAutomatique: false })).toBe(true)
		for (const autre of [undefined, {}, { import: 'true' }, { import: 1 }]) expect(estUnImport(autre)).toBe(false)
	})
})

const ADAPTATEUR: Adaptateur = {
	collection: 'talents',
	champs: { title: 'texte', publishedAt: 'date', strapiId: 'nombre' },
}

const attendu = (strapiId: number, title: string | null, publishedAt: string | null = null): Attendu => ({
	strapiId,
	valeurs: { strapiId, title, publishedAt },
	ecarts: [],
})

const existant = (id: number, strapiId: number, title?: string | null, publishedAt?: string | null): Existant => ({
	id,
	valeurs: { strapiId, title, publishedAt },
})

describe('le moteur : chaque document retrouvé par son strapiId', () => {
	test('une valeur se compare normalisée : vide et nul se valent, une date est un instant', () => {
		expect(normaliser('texte', undefined)).toBeNull()
		expect(normaliser('date', '2023-04-01T09:00:00Z')).toBe('2023-04-01T09:00:00.000Z')
		expect(normaliser('date', new Date('2023-04-01T09:00:00.000Z'))).toBe('2023-04-01T09:00:00.000Z')
		expect(normaliser('relation', { id: 4, email: 'x' })).toBe(4)
		expect(normaliser('relation', '4')).toBe(4)
		expect(normaliser('nombre', '12.50')).toBe(12.5)
	})

	test('absent : création ; autre valeur : mise à jour des seuls champs différents ; même valeur : rien', () => {
		const plan = planifier(
			ADAPTATEUR,
			[attendu(1, 'Un'), attendu(2, 'Deux', '2023-04-01T09:00:00.000Z'), attendu(3, null)],
			[existant(10, 2, 'Deux', '2023-04-01T09:00:00Z'), existant(11, 3, 'Trois'), existant(12, 9, 'Neuf')]
		)

		expect(plan.actions.map(action => [action.attendu.strapiId, action.genre])).toEqual([
			[1, 'creation'],
			[2, 'inchange'],
			[3, 'modification'],
		])
		expect(plan.actions[2]).toMatchObject({ id: 11, champs: ['title'] })
		// Never deleted: listed.
		expect(plan.enTrop).toEqual([9])
	})

	test('la parité est complète quand la cible tient exactement les documents attendus', () => {
		const attendus = [attendu(1, 'Un'), attendu(2, 'Deux')]
		const complete = parite(ADAPTATEUR, attendus, [existant(5, 2, 'Deux'), existant(4, 1, 'Un')])
		expect(complete).toMatchObject({ attendus: 2, presents: 2, egaux: 2, differents: [], manquants: [], enTrop: [] })
		expect(complete.empreinteCible).toBe(complete.empreinteAttendue)
		expect(pariteComplete(complete)).toBe(true)

		const incomplete = parite(ADAPTATEUR, attendus, [existant(4, 1, 'Un modifié'), existant(6, 7, 'Sept')])
		expect(incomplete).toMatchObject({ presents: 1, egaux: 0, differents: [1], manquants: [2], enTrop: [7] })
		expect(pariteComplete(incomplete)).toBe(false)
	})

	test('l’empreinte ne dépend pas de l’ordre, et change avec la moindre valeur', () => {
		const a = empreinteDesDocuments(ADAPTATEUR, [attendu(1, 'Un'), attendu(2, 'Deux')])
		expect(empreinteDesDocuments(ADAPTATEUR, [attendu(2, 'Deux'), attendu(1, 'Un')])).toBe(a)
		expect(empreinteDesDocuments(ADAPTATEUR, [attendu(1, 'Un'), attendu(2, 'deux')])).not.toBe(a)
		expect(a).toMatch(/^[0-9a-f]{64}$/)
	})
})

const ligneTalent = (id: number, slug: string | null, publie = true): LigneTalent => ({
	id,
	title: `Talent ${id}`,
	seo_title: null,
	description: null,
	seo_description: null,
	content: '## Contenu',
	slug,
	created_at: '2023-04-01T09:00:00.000Z',
	updated_at: '2024-05-02T10:00:00.000Z',
	published_at: publie ? '2023-04-01T09:00:00.000Z' : null,
})

describe('les talents : repris tels quels', () => {
	test('un talent garde chaque valeur, ses dates, et nul reste nul', () => {
		expect(talentAttendu(ligneTalent(3, 'effets-speciaux'))).toEqual({
			strapiId: 3,
			valeurs: {
				strapiId: 3,
				title: 'Talent 3',
				slug: 'effets-speciaux',
				seo_title: null,
				description: null,
				seo_description: null,
				content: '## Contenu',
				_status: 'published',
				publishedAt: '2023-04-01T09:00:00.000Z',
				createdAt: '2023-04-01T09:00:00.000Z',
				updatedAt: '2024-05-02T10:00:00.000Z',
			},
			ecarts: [],
		})
		expect(talentAttendu(ligneTalent(4, 'brouillon', false)).valeurs).toMatchObject({
			_status: 'draft',
			publishedAt: null,
		})
	})

	test('un slug qui n’est pas une adresse, ou déjà pris par un talent plus ancien, est refusé', () => {
		const { attendus, refuses } = talentsAttendus([
			ligneTalent(3, 'mariage'),
			ligneTalent(1, 'mariage'),
			ligneTalent(2, 'Maquillage Mode'),
			ligneTalent(4, null),
		])
		expect(attendus.map(({ strapiId }) => strapiId)).toEqual([1])
		expect(refuses).toEqual([
			{ strapiId: 2, motif: 'slug-pas-une-adresse', champs: ['slug'] },
			{ strapiId: 3, motif: 'slug-en-double', champs: ['slug'] },
			{ strapiId: 4, motif: 'slug-pas-une-adresse', champs: ['slug'] },
		])
	})
})

describe('le rapport', () => {
	const rapport = (modif: Partial<Rapport> = {}): Rapport => ({
		mode: 'reel',
		cible: 'locale',
		arret: null,
		decisionsSansObjet: 0,
		source: {
			avant: { talents: { lignes: 3, empreinte: 'a'.repeat(64) } },
			apres: { talents: { lignes: 3, empreinte: 'a'.repeat(64) } },
			inchangee: true,
		},
		collections: {
			talents: {
				source: 4,
				crees: 2,
				modifies: 1,
				inchanges: 0,
				refuses: [{ strapiId: 4, motif: 'slug-en-double', champs: ['slug'] }],
				enTrop: [9],
			},
		},
		ecarts: {},
		parite: {
			talents: {
				attendus: 3,
				presents: 3,
				egaux: 3,
				differents: [],
				manquants: [],
				enTrop: [],
				empreinteAttendue: 'b'.repeat(64),
				empreinteCible: 'b'.repeat(64),
			},
		},
		...modif,
	})

	test('il se lit en français, en nombres et en identifiants', () => {
		expect(rapportEnTexte(rapport()).split('\n')).toEqual([
			'Import réel.',
			'Cible : une base de ce poste.',
			'',
			'Talents : 4 à la source ; 2 créations, 1 mise à jour, 0 inchangé, 1 refusé',
			'  - refusé : 4 (slug-en-double : slug)',
			'  - dans la cible, absents de la source, gardés : 9',
			'',
			'Écarts voulus : aucun.',
			'',
			'Parité, la cible relue :',
			'Talents : 3 sur 3 égaux, parité complète (empreinte bbbbbbbbbbbb…)',
			'',
			'Source : 1 table lue, 3 lignes, inchangée par l’import.',
		])
		expect(rapportEnTexte(rapport({ mode: 'a-blanc', parite: null }))).toContain(
			'Talents : 4 à la source ; 2 créations annoncées, 1 mise à jour annoncée'
		)
	})

	test('un import réussit si la source n’a pas bougé et, en réel, si la parité est complète', () => {
		expect(importReussi(rapport())).toBe(true)
		expect(importReussi(rapport({ source: { ...rapport().source, inchangee: false } }))).toBe(false)
		const incomplete = rapport().parite?.talents
		expect(importReussi(rapport({ parite: { talents: { ...(incomplete ?? ({} as never)), manquants: [2] } } }))).toBe(
			false
		)
		expect(importReussi(rapport({ mode: 'a-blanc', parite: null }))).toBe(true)
	})

	test('deux empreintes de la source se comparent table par table', () => {
		const une = { talents: { lignes: 3, empreinte: 'a' }, up_users: { lignes: 1, empreinte: 'b' } }
		expect(memesTables(une, { up_users: { lignes: 1, empreinte: 'b' }, talents: { lignes: 3, empreinte: 'a' } })).toBe(
			true
		)
		expect(memesTables(une, { ...une, talents: { lignes: 3, empreinte: 'c' } })).toBe(false)
	})
})
