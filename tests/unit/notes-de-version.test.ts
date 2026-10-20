import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseVersionFile, RELEASE_FILE } from '../../scripts/release/publication'
import {
	addNote,
	CHANGELOG_FILE,
	type Changelog,
	changelogProblems,
	compareVersions,
	NOTE_MAX_LENGTH,
	noteTextProblems,
	parseChangelog,
	promotePending,
	serializeChangelog,
} from '../../src/lib/release-notes'

/**
 * The release notes (ticket 036): the rule of a note, the changelog that holds them, and the
 * file of the repository itself. A faulty note fails here, in the CI of its pull request,
 * long before a publication would stumble on it.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const COMMIT_A = 'a'.repeat(40)
const COMMIT_B = 'b'.repeat(40)
const EMPTY: Changelog = { pending: [], releases: [] }

describe('the changelog of the repository', () => {
	test('is sound, written as the scripts write it', () => {
		const text = readFileSync(path.join(ROOT, CHANGELOG_FILE), 'utf8')
		const changelog = parseChangelog(text)

		expect(changelogProblems(changelog)).toEqual([])
		expect(serializeChangelog(changelog)).toBe(text)
	})

	test('agrees with the last version file, when there is one', () => {
		const changelog = parseChangelog(readFileSync(path.join(ROOT, CHANGELOG_FILE), 'utf8'))
		const file = path.join(ROOT, RELEASE_FILE)
		// Before the first publication, on v3, there is no version file yet.
		const published = existsSync(file) ? parseVersionFile(readFileSync(file, 'utf8')).version : undefined
		const latest = changelog.releases[0]?.version

		if (published !== undefined && latest !== undefined)
			expect(compareVersions(latest, published)).toBeLessThanOrEqual(0)
		if (published === undefined) expect(changelog.releases).toEqual([])
	})
})

describe('a note is one French sentence, for the person who reads it', () => {
	test.each([
		'Tu peux ajouter jusqu’à 20 photos à ta galerie.',
		'La recherche trouve aussi les maquilleuses des communes voisines.',
		'Les pages des profils s’affichent plus vite sur téléphone !',
		'Écris ta présentation : elle apparaît en haut de ton profil.',
		'Le site garde ta session ouverte pendant 14 jours.',
	])('accepted: « %s »', text => {
		expect(noteTextProblems(text)).toEqual([])
	})

	test.each([
		['empty', '', 'la note est vide'],
		['blank', '   ', 'la note est vide'],
		['not a text', 42, 'la note est vide'],
		['spaces around it', ' Tu peux ajouter une photo. ', 'commence ou finit par un espace'],
		['too long', `T${'u'.repeat(NOTE_MAX_LENGTH)}.`, `${NOTE_MAX_LENGTH} au plus`],
		['a small first letter', 'tu peux ajouter une photo.', 'commence par une majuscule'],
		['no final point', 'Tu peux ajouter une photo', 'finit par un point'],
		['a file name', 'La galerie de ProfilGalerie.tsx est corrigée.', 'pas de nom de fichier ni de code'],
		['a folder of the repository', 'Le calcul de src/lib est plus juste.', 'pas de nom de fichier ni de code'],
		['some code', 'Le champ `contactPublic` est respecté.', 'pas de nom de fichier ni de code'],
		['a word of the trade', 'Un commit corrige la galerie.', '« commit » est un mot de technicien'],
		['a tool', 'La page passe à Payload.', '« Payload » est un mot de technicien'],
		['an acronym', 'L’API répond plus vite.', '« API » est un mot de technicien'],
		['an email address', 'Écris à contact@example.test pour nous aider.', 'aucune donnée personnelle'],
		['a phone number', 'Appelle le 06 00 00 00 00 pour nous aider.', 'aucune donnée personnelle'],
	])('refused: %s', (_case, text, expected) => {
		expect(noteTextProblems(text).join('\n')).toContain(expected)
	})

	test('an acronym is a word of the trade in capitals only, a word of the language never', () => {
		expect(noteTextProblems('Ta page de profil apparaît en premier.')).toEqual([])
		expect(noteTextProblems('Le site parle de ta maquillaPIstique.')).toEqual([])
	})
})

describe('adding a note', () => {
	test('it waits in pending, with an identifier made from the sentence', () => {
		const changelog = addNote(EMPTY, 'ajout', 'Tu peux ajouter une vidéo à ta galerie.')

		expect(changelog.pending).toEqual([
			{ id: 'tu-peux-ajouter-une-video-a-ta-galerie', type: 'ajout', text: 'Tu peux ajouter une vidéo à ta galerie.' },
		])
		expect(changelog.releases).toEqual([])
		expect(changelogProblems(changelog)).toEqual([])
	})

	test('two notes with the same sentence keep two identifiers, published ones included', () => {
		const first = addNote(EMPTY, 'correction', 'La galerie se ferme au clavier.')
		const published = promotePending(first, { version: '3.0.0', date: '2026-10-14', commit: COMMIT_A })
		const again = addNote(
			addNote(published, 'correction', 'La galerie se ferme au clavier.'),
			'correction',
			'La galerie se ferme au clavier.'
		)

		expect(again.pending.map(note => note.id)).toEqual([
			'la-galerie-se-ferme-au-clavier-2',
			'la-galerie-se-ferme-au-clavier-3',
		])
		expect(changelogProblems(again)).toEqual([])
	})

	test('a long sentence gives an identifier of 60 characters at most', () => {
		const text = `Tu peux maintenant ranger les photos de ta galerie dans l’ordre que tu préfères, en les faisant glisser.`
		const [note] = addNote(EMPTY, 'amelioration', text).pending

		expect(note?.id.length).toBeLessThanOrEqual(60)
		expect(note?.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	})

	test.each([
		['an unknown type', 'nouveaute', 'Tu peux ajouter une vidéo.', 'le type « nouveaute » n’existe pas'],
		['a refused sentence', 'ajout', 'Ajout du composant Galerie.tsx.', 'pas de nom de fichier ni de code'],
	])('refused: %s', (_case, type, text, expected) => {
		expect(() => addNote(EMPTY, type, text)).toThrow(expected)
	})
})

describe('publishing moves the pending notes under the new number', () => {
	const withTwo = addNote(
		addNote(EMPTY, 'ajout', 'Tu peux ajouter une vidéo.'),
		'correction',
		'La galerie se ferme au clavier.'
	)

	test('every pending note, in its order, goes under the new version, newest first', () => {
		const first = promotePending(withTwo, { version: '3.0.0', date: '2026-10-14', commit: COMMIT_A })
		const second = promotePending(addNote(first, 'amelioration', 'La recherche est plus rapide.'), {
			version: '3.0.1',
			date: '2026-10-15',
			commit: COMMIT_B,
		})

		expect(first.pending).toEqual([])
		expect(first.releases).toEqual([{ version: '3.0.0', date: '2026-10-14', commit: COMMIT_A, notes: withTwo.pending }])
		expect(second.releases.map(release => [release.version, release.notes.map(note => note.type)])).toEqual([
			['3.0.1', ['amelioration']],
			['3.0.0', ['ajout', 'correction']],
		])
		expect(changelogProblems(second)).toEqual([])
	})

	test('a version without notes leaves the changelog as it is', () => {
		const published = promotePending(withTwo, { version: '3.0.0', date: '2026-10-14', commit: COMMIT_A })

		expect(promotePending(published, { version: '3.0.1', date: '2026-10-15', commit: COMMIT_B })).toEqual(published)
	})

	test.each([
		['the same number again', '3.0.0', 'n’est pas plus récente que la dernière publiée (3.0.0)'],
		['an older number', '2.9.9', 'n’est pas plus récente que la dernière publiée (3.0.0)'],
		['an unreadable number', '3.0', 'Numéro à publier illisible'],
	])('refused: %s', (_case, version, expected) => {
		const published = promotePending(withTwo, { version: '3.0.0', date: '2026-10-14', commit: COMMIT_A })
		const pending = addNote(published, 'ajout', 'Tu peux ajouter une seconde vidéo.')

		expect(() => promotePending(pending, { version, date: '2026-10-15', commit: COMMIT_B })).toThrow(expected)
	})
})

describe('a faulty changelog is refused, with where and why', () => {
	const note = { id: 'une-note', type: 'ajout', text: 'Tu peux ajouter une vidéo.' }
	const release = { version: '3.0.0', date: '2026-10-14', commit: COMMIT_A, notes: [note] }

	test.each([
		['not an object', [], 'Le journal est un objet'],
		['no pending list', { releases: [] }, '« pending » est la liste'],
		['no releases list', { pending: [] }, '« releases » est la liste'],
		[
			'a key with a typo',
			{ pending: [], releases: [], pendings: [] },
			'Champ inconnu à la racine du journal (pendings)',
		],
		['a note without its type', { pending: [{ id: 'x', text: note.text }], releases: [] }, 'pending[0] : le type est'],
		[
			'a note with a field of its own',
			{ pending: [{ ...note, auteur: 'x' }], releases: [] },
			'pending[0] : champ inconnu (auteur)',
		],
		[
			'an identifier in capitals',
			{ pending: [{ ...note, id: 'Une-Note' }], releases: [] },
			'pending[0] : l’identifiant',
		],
		[
			'the same identifier twice',
			{ pending: [note], releases: [release] },
			'releases[0].notes[0] : l’identifiant « une-note » existe déjà',
		],
		[
			'a refused sentence',
			{ pending: [{ ...note, text: 'fix du bug' }], releases: [] },
			'pending[0] : la phrase commence par une majuscule',
		],
		[
			'a version without notes',
			{ pending: [], releases: [{ ...release, notes: [] }] },
			'releases[0] : une version listée porte au moins une note',
		],
		['an unreadable number', { pending: [], releases: [{ ...release, version: 'v3.0.0' }] }, 'releases[0] : le numéro'],
		[
			'a day that does not exist',
			{ pending: [], releases: [{ ...release, date: '2026-02-30' }] },
			'releases[0] : la date',
		],
		[
			'a short commit',
			{ pending: [], releases: [{ ...release, commit: 'abc1234' }] },
			'releases[0] : le commit publié',
		],
		[
			'versions in the wrong order',
			{
				pending: [],
				releases: [
					{ ...release, notes: [{ ...note, id: 'a' }] },
					{ ...release, version: '3.0.1', notes: [{ ...note, id: 'b' }] },
				],
			},
			'releases[1] : les versions vont de la plus récente à la plus ancienne',
		],
		[
			'the same version twice',
			{
				pending: [],
				releases: [
					{ ...release, notes: [{ ...note, id: 'a' }] },
					{ ...release, notes: [{ ...note, id: 'b' }] },
				],
			},
			'sans doublon',
		],
	])('%s', (_case, data, expected) => {
		expect(changelogProblems(data).join('\n')).toContain(expected)
	})

	test('a text that is not JSON is refused by name', () => {
		expect(() => parseChangelog('{ pending: [] ')).toThrow(`${CHANGELOG_FILE} n’est pas du JSON lisible.`)
	})
})
