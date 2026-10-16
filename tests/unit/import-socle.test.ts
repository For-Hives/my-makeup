import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SanitizedConfig } from 'payload'
import { lireLesArguments } from '../../scripts/migration/import/arguments'
import {
	configurationSansChangementDeSchema,
	ImportRefuse,
	verifierLaBaseAttendue,
	verifierLaCible,
} from '../../scripts/migration/import/cible'
import {
	type Adaptateur,
	type Attendu,
	codeDeLErreur,
	type Existant,
	empreinteDesDocuments,
	ImportInterrompu,
	messageDUneErreurInattendue,
	normaliser,
	parite,
	pariteComplete,
	planifier,
	sansEcartInexplique,
} from '../../scripts/migration/import/moteur'
import {
	codeDeSortie,
	codeDuControle,
	controleEnTexte,
	type Rapport,
	rapportEnTexte,
} from '../../scripts/migration/import/rapport'
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
		expect(verifierLaCible('postgres://u:p@127.0.0.1/base', { cibleDistante: true, baseAttendue: 'base' })).toBe(
			'locale'
		)
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
			expect(verifierLaCible(adresse, { cibleDistante: true, baseAttendue: 'prod' }), adresse).toBe('distante')
		}
	})

	test('Payload se branche sur la cible sans en changer le schéma : ni poussée, ni migration', () => {
		const avant = process.env.PAYLOAD_MIGRATING
		const interrupteur = (): string | undefined => process.env.PAYLOAD_MIGRATING
		const adaptateur = { name: 'postgres', prodMigrations: [{ name: 'socle' }] }
		const config = { db: { name: 'postgres', init: () => adaptateur } } as unknown as SanitizedConfig
		try {
			delete process.env.PAYLOAD_MIGRATING
			const pourLImport = configurationSansChangementDeSchema(config)

			// Payload's own switch: no push of the schema when it connects.
			expect(interrupteur()).toBe('true')
			// No migration played when it connects in production; the adapter is the same otherwise.
			const cree = pourLImport.db.init({ payload: {} as never }) as unknown as typeof adaptateur
			expect(cree).toBe(adaptateur)
			expect(cree.prodMigrations).toBeUndefined()
			expect(cree.name).toBe('postgres')
			expect(pourLImport.db.name).toBe('postgres')
		} finally {
			if (avant === undefined) delete process.env.PAYLOAD_MIGRATING
			else process.env.PAYLOAD_MIGRATING = avant
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
		expect(() => verifierLaCible(undefined, { cibleDistante: true, baseAttendue: 'prod' })).toThrow(
			'DATABASE_URI manque'
		)
	})
})

describe('L9 (ticket 233) : --cible-distante exige --base-attendue, et la base doit porter ce nom', () => {
	test('--cible-distante sans --base-attendue est refusé (code 1), avant la lecture de l’adresse', () => {
		for (const adresse of ['postgres://u:p@base.example.test:5432/prod', 'postgres://u:p@127.0.0.1/base', undefined]) {
			let message = ''
			try {
				verifierLaCible(adresse, { cibleDistante: true })
			} catch (erreur) {
				expect(erreur).toBeInstanceOf(ImportRefuse)
				message = (erreur as Error).message
			}
			expect(message, String(adresse)).toContain('--cible-distante exige --base-attendue')
			expect(message).not.toContain('example.test')
		}
		expect(() =>
			verifierLaCible('postgres://u:p@base.example.test/prod', { cibleDistante: true, baseAttendue: '' })
		).toThrow(ImportRefuse)
	})

	test('une base locale sans le drapeau n’a pas besoin du nom', () => {
		expect(verifierLaCible('postgres://u:p@127.0.0.1/base', { cibleDistante: false })).toBe('locale')
	})

	test('--base-attendue prend un nom, et ne se répète pas', () => {
		expect(lireLesArguments(['--base-attendue'])).toBeNull()
		expect(lireLesArguments(['--base-attendue', '--reel'])).toBeNull()
		expect(lireLesArguments(['--base-attendue', 'a', '--base-attendue', 'b'])).toBeNull()
	})

	const payloadDont = (base: string | undefined) =>
		({
			db: { pool: { query: async () => ({ rows: base === undefined ? [] : [{ base }] }) } },
		}) as unknown as Parameters<typeof verifierLaBaseAttendue>[0]

	test('la base qui donne le nom attendu passe ; une autre est refusée sans dire laquelle', async () => {
		await expect(verifierLaBaseAttendue(payloadDont('mymakeup_v3'), 'mymakeup_v3')).resolves.toBeUndefined()
		let message = ''
		try {
			await verifierLaBaseAttendue(payloadDont('mymakeup_preprod_ancienne'), 'mymakeup_v3')
		} catch (erreur) {
			expect(erreur).toBeInstanceOf(ImportRefuse)
			message = (erreur as Error).message
		}
		expect(message).toContain('« mymakeup_v3 »')
		expect(message).toContain('--base-attendue')
		expect(message).not.toContain('mymakeup_preprod_ancienne')
		await expect(verifierLaBaseAttendue(payloadDont(undefined), 'mymakeup_v3')).rejects.toBeInstanceOf(ImportRefuse)
	})
})

describe('L1 (ticket 233) : les deux scripts qui écrivent dans une base ne lisent jamais le .env de travail', () => {
	test('migration:import et admin:creer portent --no-env-file', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(import.meta.dir, '../../package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}
		expect(scripts['migration:import']).toBe('bun --no-env-file scripts/migration/import.ts')
		expect(scripts['admin:creer']).toBe('bun --no-env-file scripts/admin/creer-admin.ts')
	})

	test('banc:import (qui n’est pas migration:import) le porte aussi, et charge import.ts en direct', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(import.meta.dir, '../../package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}
		expect(scripts['banc:import']).toBe('bun --no-env-file scripts/migration/banc-import.ts')
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
		expect(lireLesArguments(['--cible-distante', '--base-attendue', 'mymakeup_v3'])).toEqual({
			mode: 'a-blanc',
			cibleDistante: true,
			baseAttendue: 'mymakeup_v3',
		})
	})

	test('--sans-photos ne prend pas de valeur et ne se répète pas', () => {
		expect(lireLesArguments(['--sans-photos'])).toEqual({ mode: 'a-blanc', cibleDistante: false, sansPhotos: true })
		expect(lireLesArguments(['--sans-photos', '--sans-photos'])).toBeNull()
	})

	test('--controle est un passage à blanc : il ne va pas avec --reel', () => {
		expect(lireLesArguments(['--controle'])).toEqual({ mode: 'a-blanc', cibleDistante: false, controle: true })
		expect(lireLesArguments(['--controle', '--reel'])).toBeNull()
		expect(lireLesArguments(['--reel', '--controle'])).toBeNull()
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

	test('un document refusé compte : la parité le dit incomplète, sans le prendre pour un manquant ni un écart', () => {
		const attendus = [attendu(1, 'Un'), attendu(2, 'Deux')]
		// Document 2 was refused by Payload, its earlier values stay; document 5 was refused before the write.
		const cible = [existant(4, 1, 'Un'), existant(6, 2, 'Deux d’avant')]
		const refus = [
			{ strapiId: 2, motif: 'refuse-par-payload', champs: ['title'] },
			{ strapiId: 5, motif: 'slug-en-double', champs: ['slug'] },
		]

		const avecRefus = parite(ADAPTATEUR, attendus, cible, refus)

		expect(avecRefus).toMatchObject({
			attendus: 3,
			presents: 1,
			egaux: 1,
			refuses: [2, 5],
			differents: [],
			manquants: [],
			enTrop: [],
		})
		expect(avecRefus.empreinteCible).toBe(avecRefus.empreinteAttendue)
		expect(sansEcartInexplique(avecRefus)).toBe(true)
		expect(pariteComplete(avecRefus)).toBe(false)
		// Without refusal, the same target is simply not equal.
		expect(pariteComplete(parite(ADAPTATEUR, attendus, cible))).toBe(false)
		expect(parite(ADAPTATEUR, attendus, cible)).toMatchObject({ refuses: [], differents: [2] })
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
				attendus: 4,
				presents: 3,
				egaux: 3,
				refuses: [4],
				differents: [],
				manquants: [],
				enTrop: [],
				empreinteAttendue: 'b'.repeat(64),
				empreinteCible: 'b'.repeat(64),
			},
		},
		...modif,
	})

	/** The same run, where nothing was refused. */
	const sansRefus = (modif: Partial<Rapport> = {}): Rapport => {
		const base = rapport()
		const talents = base.collections.talents ?? ({} as never)
		const parite = base.parite?.talents ?? ({} as never)
		return rapport({
			collections: { talents: { ...talents, refuses: [] } },
			parite: { talents: { ...parite, attendus: 3, refuses: [] } },
			...modif,
		})
	}

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
			'Talents : 3 sur 4 égaux, parité incomplète : 1 refusé (4), empreinte bbbbbbbbbbbb…',
			'',
			'Source : 1 table lue, 3 lignes, inchangée par l’import.',
		])
		expect(rapportEnTexte(sansRefus())).toContain('Talents : 3 sur 3 égaux, parité complète, empreinte bbbbbbbbbbbb…')
		expect(rapportEnTexte(rapport({ mode: 'a-blanc', parite: null }))).toContain(
			'Talents : 4 à la source ; 2 créations annoncées, 1 mise à jour annoncée'
		)
	})

	test('le code de sortie : 0 fini, 3 arrêté, 4 un écart inexpliqué ou la source changée, 5 des refusés', () => {
		expect(codeDeSortie(sansRefus())).toBe(0)
		expect(codeDeSortie(sansRefus({ mode: 'a-blanc', parite: null }))).toBe(0)
		// A refused document is never read as a complete run, dry or real.
		expect(codeDeSortie(rapport())).toBe(5)
		expect(codeDeSortie(rapport({ mode: 'a-blanc', parite: null }))).toBe(5)
		expect(codeDeSortie(sansRefus({ source: { ...rapport().source, inchangee: false } }))).toBe(4)
		const talents = rapport().parite?.talents ?? ({} as never)
		expect(codeDeSortie(rapport({ parite: { talents: { ...talents, manquants: [2] } } }))).toBe(4)
		expect(codeDeSortie(rapport({ parite: { talents: { ...talents, empreinteCible: 'c'.repeat(64) } } }))).toBe(4)
		expect(
			codeDeSortie(
				rapport({ arret: { emailsPartages: [[9, 10]], profilsDeComptesEcartes: [], profilsSansCompte: [] } })
			)
		).toBe(3)
	})

	test('le contrôle : 0 si la cible est la source, 4 dès qu’un passage réel écrirait ou qu’un document est en trop', () => {
		const talentsPropres = (bilan: object): Rapport => {
			const base = sansRefus({ mode: 'a-blanc', parite: null })
			const talents = { ...(base.collections.talents ?? ({} as never)), crees: 0, modifies: 0, enTrop: [], ...bilan }
			return { ...base, collections: { talents } } as Rapport
		}
		const propre = talentsPropres({})
		expect(codeDuControle(propre)).toBe(0)
		expect(controleEnTexte(propre)).toBe(
			'Contrôle : la cible est la source (0 création, 0 mise à jour, 0 document en trop).'
		)
		// A document removed by hand is a creation to make, a value changed by hand an update, an extra one a document too many.
		for (const bilan of [{ crees: 1 }, { modifies: 1 }, { enTrop: [9] }]) {
			expect(codeDuControle(talentsPropres(bilan)), JSON.stringify(bilan)).toBe(4)
			expect(controleEnTexte(talentsPropres(bilan))).toContain('Contrôle : la cible n’est PAS la source.')
		}
		expect(controleEnTexte(talentsPropres({ crees: 2, modifies: 1 }))).toContain(
			'Talents : 2 créations à faire, 1 mise à jour à faire, 0 document en trop'
		)
		// The codes of a dry run are kept: stopped, a source that moved, a document refused.
		expect(codeDuControle(rapport({ mode: 'a-blanc', parite: null }))).toBe(5)
		expect(codeDuControle(talentsPropres({ crees: 1, refuses: [{ strapiId: 4, motif: 'slug-en-double' }] }))).toBe(5)
		expect(
			codeDuControle(
				rapport({ arret: { emailsPartages: [[9, 10]], profilsDeComptesEcartes: [], profilsSansCompte: [] } })
			)
		).toBe(3)
	})

	test('le contrôle ne dit « la cible est la source » que s’il a pu comparer (codes 3, 4 et 5)', () => {
		const arrete = rapport({
			mode: 'a-blanc',
			parite: null,
			arret: { emailsPartages: [[9, 10]], profilsDeComptesEcartes: [], profilsSansCompte: [] },
		})
		expect(controleEnTexte(arrete)).toContain('sans conclusion')
		expect(controleEnTexte(arrete)).toContain('code 3')
		expect(controleEnTexte(arrete)).not.toContain('la cible est la source')

		const base = sansRefus({ mode: 'a-blanc', parite: null })
		const talents = { ...(base.collections.talents ?? ({} as never)), crees: 0, modifies: 0, enTrop: [] }
		const refuse = {
			...base,
			collections: { talents: { ...talents, refuses: [{ strapiId: 4, motif: 'slug-en-double' }] } },
		} as Rapport
		expect(codeDuControle(refuse)).toBe(5)
		expect(controleEnTexte(refuse)).toContain('code 5')
		expect(controleEnTexte(refuse)).not.toContain('la cible est la source')

		const bouge = { ...base, collections: { talents }, source: { ...base.source, inchangee: false } } as Rapport
		expect(codeDuControle(bouge)).toBe(4)
		expect(controleEnTexte(bouge)).toContain('code 4')
		expect(controleEnTexte(bouge)).not.toContain('la cible est la source')
	})

	test('l’arrêt nomme chaque cas par identifiants : les comptes au même email, les profils d’un compte écarté ou sans compte', () => {
		const texte = rapportEnTexte(
			rapport({
				arret: { emailsPartages: [[9, 10, 11, 12]], profilsDeComptesEcartes: [28, 29], profilsSansCompte: [] },
				parite: null,
			})
		)
		expect(texte).toContain('Import arrêté avant toute écriture : rien n’est écrit.')
		expect(texte).toContain('Groupes, par identifiant : [9, 10, 11, 12].')
		expect(texte).toContain('Profils, par identifiant : 28, 29.')
		expect(texte).not.toContain('aucun compte dans la source')
		const sansCompte = rapportEnTexte(
			rapport({ arret: { emailsPartages: [], profilsDeComptesEcartes: [29], profilsSansCompte: [40] }, parite: null })
		)
		expect(sansCompte).not.toContain('Groupes')
		expect(sansCompte).toContain(
			'Des profils n’ont aucun compte dans la source et ne sont pas parmi les 13 profils du spam (SCHEMA.md §4.1). Profils, par identifiant : 40.'
		)
	})

	test('deux empreintes de la source se comparent table par table', () => {
		const une = { talents: { lignes: 3, empreinte: 'a' }, up_users: { lignes: 1, empreinte: 'b' } }
		expect(memesTables(une, { up_users: { lignes: 1, empreinte: 'b' }, talents: { lignes: 3, empreinte: 'a' } })).toBe(
			true
		)
		expect(memesTables(une, { ...une, talents: { lignes: 3, empreinte: 'c' } })).toBe(false)
	})
})

describe('une erreur de la base : nommée par son code, jamais par son texte', () => {
	/** An error of a query as the driver gives it: the query and its values in the message, the SQLSTATE in its cause. */
	const erreurDeRequete = () => {
		const erreur = new Error(
			`Failed query: insert into "pros" ("email", "legacy_bcrypt") values ($1, $2) params: zoe@example.test,$2a$10$${'a'.repeat(53)}`,
			{ cause: Object.assign(new Error('refus du banc'), { code: 'P0001', detail: 'Key (email)=(zoe@example.test)' }) }
		)
		erreur.name = 'DrizzleQueryError'
		return erreur
	}

	test('le code se lit sur l’erreur ou sur l’une de ses causes, et seulement s’il a la forme d’un code', () => {
		expect(codeDeLErreur(erreurDeRequete())).toBe('P0001')
		expect(codeDeLErreur(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe('ECONNRESET')
		expect(codeDeLErreur(Object.assign(new Error('x'), { code: 'zoe@example.test' }))).toBeUndefined()
		for (const autre of [undefined, null, 'texte', 42, new Error('sans code')])
			expect(codeDeLErreur(autre)).toBeUndefined()
	})

	test('une écriture interrompue dit la collection, le document et le code, et ne garde pas l’erreur', () => {
		const interrompu = new ImportInterrompu('pros', 2, 'P0001')

		expect(interrompu.message).toContain('la base n’a pas écrit le document 2 de « pros » (code P0001)')
		expect(interrompu.cause).toBeUndefined()
		expect(new ImportInterrompu('talents', 3, undefined).message).not.toContain('code')
	})

	test('une erreur inattendue se dit par son type et son code : ni requête, ni valeur', () => {
		const message = messageDUneErreurInattendue(erreurDeRequete())

		expect(message).toContain('(DrizzleQueryError, code P0001)')
		for (const morceau of ['$2a$', '@example.test', 'insert into', 'refus du banc', 'Key (email)'])
			expect(message).not.toContain(morceau)
		// A type that is not a plain name is not printed either.
		const etrange = Object.assign(new Error('x'), { name: 'zoe@example.test' })
		expect(messageDUneErreurInattendue(etrange)).not.toContain('example.test')
		expect(messageDUneErreurInattendue('texte jeté')).not.toContain('texte jeté')
	})
})
