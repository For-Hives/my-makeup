/**
 * A spy on every request the application sends to its object storage through the S3 client of the
 * AWS SDK: the storage plugin's and the bin's alike (ticket 045). A test records them, fails on a
 * removal that is not the second half of a move to the bin, and makes the storage fail on purpose.
 *
 *   const espion = espionnerLeStockage()
 *   espion.fairePanne(commande => commande.nom === 'CopyObject')
 *   // … the test …
 *   expect(suppressionsSansCorbeille(espion.journal)).toEqual([])
 *   espion.arreter()
 *
 * It replaces `send` on the prototype of `S3Client`, which every S3 client of the process shares:
 * Payload runs in the process of the tests (tests/support/payload-test.ts), and so do the REST
 * calls (tests/support/rest.ts). `arreter` puts the original back; a test file calls it after each
 * test, or the next file would inherit the spy.
 *
 * The test client of the bench (tests/support/s3.ts) talks to the storage by `fetch`: the spy does
 * not see it, and a test empties its bucket freely.
 */

import {
	CopyObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { isInTrash, trashKey } from '@/lib/trash'

/** One request to the storage, as the spy saw it. */
export interface CommandS3 {
	/** `PutObject`, `HeadObject`, `CopyObject`, `DeleteObject`, `DeleteObjects`, or the name of another command. */
	nom: string
	/** What the command was given: `Key`, `CopySource`… */
	entree: Record<string, unknown>
	/** True once the storage has answered without an error. */
	reussie: boolean
}

export interface Spy {
	/** Every request, in the order they were sent. */
	readonly journal: CommandS3[]
	/** From now on, a request for which `regle` is true fails before it leaves, as when the storage is down. */
	fairePanne(regle: (commande: CommandS3) => boolean): void
	/** Puts the client of the SDK back as it was. */
	arreter(): void
}

/** The error of a storage that does not answer. */
const simulatedFailure = () =>
	Object.assign(new Error('Panne simulée du stockage d’objets.'), {
		name: 'ServiceUnavailable',
		$metadata: { httpStatusCode: 503 },
	})

const NAMES: [new (...args: never[]) => unknown, string][] = [
	[PutObjectCommand, 'PutObject'],
	[HeadObjectCommand, 'HeadObject'],
	[CopyObjectCommand, 'CopyObject'],
	[DeleteObjectCommand, 'DeleteObject'],
	[DeleteObjectsCommand, 'DeleteObjects'],
]

const nameOf = (commande: unknown): string =>
	NAMES.find(([Classe]) => commande instanceof Classe)?.[1] ??
	(commande as { constructor?: { name?: string } } | null)?.constructor?.name ??
	'inconnue'

type Upload = (this: S3Client, commande: unknown, ...reste: unknown[]) => Promise<unknown>

/** Starts recording every request of every S3 client of the process. */
export function spyStorage(): Spy {
	const prototype = S3Client.prototype as unknown as { send: Upload }
	const before = Object.getOwnPropertyDescriptor(prototype, 'send')
	const original = prototype.send
	const log: CommandS3[] = []
	let failure: ((commande: CommandS3) => boolean) | undefined
	prototype.send = async function (this: S3Client, commande: unknown, ...reste: unknown[]) {
		const line: CommandS3 = {
			nom: nameOf(commande),
			entree: { ...((commande as { input?: Record<string, unknown> }).input ?? {}) },
			reussie: false,
		}
		log.push(line)
		if (failure?.(line)) throw simulatedFailure()
		const response = await original.call(this, commande, ...reste)
		line.reussie = true
		return response
	}
	return {
		journal: log,
		fairePanne: regle => {
			failure = regle
		},
		arreter: () => {
			if (before) Object.defineProperty(prototype, 'send', before)
			else Reflect.deleteProperty(prototype, 'send')
		},
	}
}

/** The key a copy reads from: its `CopySource` without the bucket, each segment decoded. */
export const sourceOf = (commande: CommandS3): string =>
	String(commande.entree.CopySource ?? '')
		.split('/')
		.slice(1)
		.map(decodeURIComponent)
		.join('/')

/**
 * The removals of this journal that are not the second half of a move to the bin: a removal of an
 * object whose copy in the bin the storage has not confirmed, a removal of an object of the bin,
 * a removal of several objects at once. Empty when the application erased nothing.
 */
export function deletionsWithoutTrash(journal: readonly CommandS3[]): string[] {
	const copied = new Set<string>()
	const faults: string[] = []
	for (const command of journal) {
		if (command.nom === 'CopyObject' && command.reussie && command.entree.Key === trashKey(sourceOf(command)))
			copied.add(sourceOf(command))
		if (command.nom === 'DeleteObjects') faults.push('(plusieurs objets à la fois)')
		if (command.nom === 'DeleteObject') {
			const key = String(command.entree.Key)
			if (isInTrash(key) || !copied.has(key)) faults.push(key)
		}
	}
	return faults
}
