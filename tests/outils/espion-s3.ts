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
 * Payload runs in the process of the tests (tests/outils/payload-test.ts), and so do the REST
 * calls (tests/outils/rest.ts). `arreter` puts the original back; a test file calls it after each
 * test, or the next file would inherit the spy.
 *
 * The test client of the bench (tests/outils/s3.ts) talks to the storage by `fetch`: the spy does
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
import { cleEnCorbeille, estEnCorbeille } from '@/lib/trash'

/** One request to the storage, as the spy saw it. */
export interface CommandeS3 {
	/** `PutObject`, `HeadObject`, `CopyObject`, `DeleteObject`, `DeleteObjects`, or the name of another command. */
	nom: string
	/** What the command was given: `Key`, `CopySource`… */
	entree: Record<string, unknown>
	/** True once the storage has answered without an error. */
	reussie: boolean
}

export interface Espion {
	/** Every request, in the order they were sent. */
	readonly journal: CommandeS3[]
	/** From now on, a request for which `regle` is true fails before it leaves, as when the storage is down. */
	fairePanne(regle: (commande: CommandeS3) => boolean): void
	/** Puts the client of the SDK back as it was. */
	arreter(): void
}

/** The error of a storage that does not answer. */
const panneSimulee = () =>
	Object.assign(new Error('Panne simulée du stockage d’objets.'), {
		name: 'ServiceUnavailable',
		$metadata: { httpStatusCode: 503 },
	})

const NOMS: [new (...args: never[]) => unknown, string][] = [
	[PutObjectCommand, 'PutObject'],
	[HeadObjectCommand, 'HeadObject'],
	[CopyObjectCommand, 'CopyObject'],
	[DeleteObjectCommand, 'DeleteObject'],
	[DeleteObjectsCommand, 'DeleteObjects'],
]

const nomDe = (commande: unknown): string =>
	NOMS.find(([Classe]) => commande instanceof Classe)?.[1] ??
	(commande as { constructor?: { name?: string } } | null)?.constructor?.name ??
	'inconnue'

type Envoi = (this: S3Client, commande: unknown, ...reste: unknown[]) => Promise<unknown>

/** Starts recording every request of every S3 client of the process. */
export function espionnerLeStockage(): Espion {
	const prototype = S3Client.prototype as unknown as { send: Envoi }
	const avant = Object.getOwnPropertyDescriptor(prototype, 'send')
	const original = prototype.send
	const journal: CommandeS3[] = []
	let panne: ((commande: CommandeS3) => boolean) | undefined
	prototype.send = async function (this: S3Client, commande: unknown, ...reste: unknown[]) {
		const ligne: CommandeS3 = {
			nom: nomDe(commande),
			entree: { ...((commande as { input?: Record<string, unknown> }).input ?? {}) },
			reussie: false,
		}
		journal.push(ligne)
		if (panne?.(ligne)) throw panneSimulee()
		const reponse = await original.call(this, commande, ...reste)
		ligne.reussie = true
		return reponse
	}
	return {
		journal,
		fairePanne: regle => {
			panne = regle
		},
		arreter: () => {
			if (avant) Object.defineProperty(prototype, 'send', avant)
			else Reflect.deleteProperty(prototype, 'send')
		},
	}
}

/** The key a copy reads from: its `CopySource` without the bucket, each segment decoded. */
export const sourceDe = (commande: CommandeS3): string =>
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
export function suppressionsSansCorbeille(journal: readonly CommandeS3[]): string[] {
	const copiees = new Set<string>()
	const fautes: string[] = []
	for (const commande of journal) {
		if (commande.nom === 'CopyObject' && commande.reussie && commande.entree.Key === cleEnCorbeille(sourceDe(commande)))
			copiees.add(sourceDe(commande))
		if (commande.nom === 'DeleteObjects') fautes.push('(plusieurs objets à la fois)')
		if (commande.nom === 'DeleteObject') {
			const cle = String(commande.entree.Key)
			if (estEnCorbeille(cle) || !copiees.has(cle)) fautes.push(cle)
		}
	}
	return fautes
}
