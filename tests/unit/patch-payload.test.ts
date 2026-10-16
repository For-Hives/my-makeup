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

describe('le niveau d’un refus de Payload ne dépend pas du nom des classes (ticket 223, constat 10)', () => {
	// A production bundle is minified: the classes are renamed, so `err.name` is `c` or `l`. The patched logError
	// tells the three classes by their constructor. The renaming is simulated by overwriting `name`.
	const niveaux = { APIError: 'info', AuthenticationError: 'info', UnverifiedEmail: 'info' }
	const journalise = async (fabrique: (m: typeof import('payload')) => Error) => {
		const payload = await import('payload')
		const { logError } = await import(path.join(RACINE, 'node_modules/payload/dist/utilities/logError.js'))
		const err = fabrique(payload)
		err.name = 'c'
		const appels: string[] = []
		const logger = {
			info: () => void appels.push('info'),
			error: () => void appels.push('error'),
			warn: () => void appels.push('warn'),
		}
		logError({ err, payload: { config: { loggingLevels: niveaux }, logger } } as never)
		return appels
	}

	test('APIError renommée : une ligne info', async () => {
		expect(await journalise(({ APIError }) => new APIError('Missing ID of document to update.', 400))).toEqual(['info'])
	})
	test('AuthenticationError renommée : une ligne info', async () => {
		expect(await journalise(({ AuthenticationError }) => new AuthenticationError())).toEqual(['info'])
	})
	test('UnverifiedEmail renommée : une ligne info', async () => {
		expect(await journalise(({ UnverifiedEmail }) => new UnverifiedEmail({ t: undefined } as never))).toEqual(['info'])
	})
	test('une autre classe renommée reste une ligne error', async () => {
		expect(await journalise(({ Forbidden }) => new Forbidden())).toEqual(['error'])
	})
})
