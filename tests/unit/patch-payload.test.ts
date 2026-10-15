import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The patch of `payload` (patches/payload@3.90.2.patch, CLAUDE.md « Pièges »): the lock of a document
 * is read in the transaction of the save. bun applies a patch only to the exact version its key names,
 * and says nothing when a bump makes the key stale: this test says it, before five simultaneous saves
 * freeze the application again.
 */

const RACINE = path.resolve(import.meta.dir, '../..')
const lire = (fichier: string) => readFileSync(path.join(RACINE, fichier), 'utf8')

const { patchedDependencies = {} } = JSON.parse(lire('package.json')) as {
	patchedDependencies?: Record<string, string>
}
const { version } = JSON.parse(lire('node_modules/payload/package.json')) as { version: string }

describe('le patch de payload s’applique à la version installée', () => {
	test('sa clé nomme la version de payload installée, et son fichier existe', () => {
		const cles = Object.keys(patchedDependencies).filter(cle => cle.startsWith('payload@'))
		expect(cles).toEqual([`payload@${version}`])
		expect(lire(patchedDependencies[`payload@${version}`] ?? '')).toContain('checkDocumentLockStatus.js')
	})

	test('le verrou se lit dans la transaction de l’enregistrement : la lecture reçoit req', () => {
		const code = lire('node_modules/payload/dist/utilities/checkDocumentLockStatus.js')
		const lecture = /const lockedDocumentResult = await payload\.db\.find\(\{([\s\S]*?)\}\);/.exec(code)?.[1] ?? ''
		expect(lecture).toContain("req: payload.db.name === 'mongoose' ? undefined : req")
	})
})
