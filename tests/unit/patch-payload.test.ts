import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The patch of `payload` (patches/payload@3.90.2.patch, CLAUDE.md « Pièges »): the lock of a document
 * is read in the transaction of the save. bun applies a patch only to the exact version its key names,
 * and says nothing when a bump makes the key stale: this test says it, before five simultaneous saves
 * freeze the application again.
 */

const ROOT = path.resolve(import.meta.dir, '../..')
const read = (fichier: string) => readFileSync(path.join(ROOT, fichier), 'utf8')

const { patchedDependencies = {} } = JSON.parse(read('package.json')) as {
	patchedDependencies?: Record<string, string>
}
const { version } = JSON.parse(read('node_modules/payload/package.json')) as { version: string }

describe('le patch de payload s’applique à la version installée', () => {
	test('sa clé nomme la version de payload installée, et son fichier existe', () => {
		const keys = Object.keys(patchedDependencies).filter(cle => cle.startsWith('payload@'))
		expect(keys).toEqual([`payload@${version}`])
		expect(read(patchedDependencies[`payload@${version}`] ?? '')).toContain('checkDocumentLockStatus.js')
	})

	test('le verrou se lit dans la transaction de l’enregistrement : la lecture reçoit req', () => {
		const code = read('node_modules/payload/dist/utilities/checkDocumentLockStatus.js')
		const reading = /const lockedDocumentResult = await payload\.db\.find\(\{([\s\S]*?)\}\);/.exec(code)?.[1] ?? ''
		expect(reading).toContain("req: payload.db.name === 'mongoose' ? undefined : req")
	})
})

describe('le niveau d’un refus de Payload ne dépend pas du nom des classes (ticket 223, constat 10)', () => {
	// A production bundle is minified: the classes are renamed, so `err.name` is `c` or `l`. The patched logError
	// tells the three classes by their constructor. The renaming is simulated by overwriting `name`.
	const levels = {
		APIError: 'info',
		AuthenticationError: 'info',
		Forbidden: 'info',
		UnauthorizedError: 'info',
		UnverifiedEmail: 'info',
	}
	const logged = async (fabrique: (m: typeof import('payload')) => Error) => {
		const payload = await import('payload')
		const { logError } = await import(path.join(ROOT, 'node_modules/payload/dist/utilities/logError.js'))
		const err = fabrique(payload)
		err.name = 'c'
		const calls: string[] = []
		const logger = {
			info: () => void calls.push('info'),
			error: () => void calls.push('error'),
			warn: () => void calls.push('warn'),
		}
		logError({ err, payload: { config: { loggingLevels: levels }, logger } } as never)
		return calls
	}

	test('APIError renommée : une ligne info', async () => {
		expect(await logged(({ APIError }) => new APIError('Missing ID of document to update.', 400))).toEqual(['info'])
	})
	test('AuthenticationError renommée : une ligne info', async () => {
		expect(await logged(({ AuthenticationError }) => new AuthenticationError())).toEqual(['info'])
	})
	test('UnverifiedEmail renommée : une ligne info', async () => {
		expect(await logged(({ UnverifiedEmail }) => new UnverifiedEmail({ t: undefined } as never))).toEqual(['info'])
	})
	test('Forbidden renommée : une ligne info (ticket 276)', async () => {
		expect(await logged(({ Forbidden }) => new Forbidden())).toEqual(['info'])
	})
	test('UnauthorizedError renommée : une ligne info (ticket 276)', async () => {
		expect(await logged(({ UnauthorizedError }) => new UnauthorizedError())).toEqual(['info'])
	})
	test('une autre classe renommée reste une ligne error', async () => {
		expect(await logged(({ Locked }) => new Locked('verrou'))).toEqual(['error'])
	})
})
