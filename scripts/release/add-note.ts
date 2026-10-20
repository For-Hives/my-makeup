/**
 * Adds a release note to the pending ones (ticket 036, docs/publication.md).
 *
 *   bun run notes:add ajout "Tu peux ajouter une vidéo à ta galerie."
 *
 * The type is `ajout`, `amelioration` or `correction`. The sentence is checked by the rule of
 * src/lib/release-notes.ts, the same one the unit tests apply to the whole file. The note
 * waits in src/content/changelog.json until the next publication moves it under its number.
 * Run from the root of the repository.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { addNote, CHANGELOG_FILE, NOTE_TYPES, parseChangelog, serializeChangelog } from '../../src/lib/release-notes'

/** Adds the note to the changelog under `root`. Gives back the note, throws in French when it is refused. */
export function addNoteToFile(root: string, type: string, text: string) {
	const file = path.join(root, CHANGELOG_FILE)
	if (!existsSync(file))
		throw new Error(`${CHANGELOG_FILE} est introuvable : lance la commande depuis la racine du dépôt.`)
	const changelog = addNote(parseChangelog(readFileSync(file, 'utf8')), type, text)
	writeFileSync(file, serializeChangelog(changelog))
	return changelog.pending.at(-1)
}

function main(): void {
	const [type = '', ...words] = process.argv.slice(2)
	const text = words.join(' ').trim()
	if (type === '' || text === '') {
		console.error(
			[
				'Usage : bun run notes:add <type> "<une phrase>"',
				`Types : ${Object.entries(NOTE_TYPES)
					.map(([key, label]) => `${key} (${label})`)
					.join(', ')}.`,
				'La phrase dit ce que la personne peut faire, ou ce qui s’améliore pour elle.',
			].join('\n')
		)
		process.exitCode = 1
		return
	}
	try {
		const note = addNoteToFile(process.cwd(), type, text)
		console.log(`Note en attente ajoutée (${note?.id}) : elle partira avec la prochaine version.`)
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	}
}

if (import.meta.main) main()
