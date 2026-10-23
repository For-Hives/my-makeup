import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type {
	CollectionAfterChangeHook,
	CollectionAfterDeleteHook,
	CollectionBeforeOperationHook,
	CollectionConfig,
	Config,
	Plugin,
} from 'payload'
import { ONE_AT_A_TIME_MESSAGE, oneAtATime, withoutPluginDeletion, withTrash } from '@/collections/trash'
import { IMPORT_CONTEXT } from '@/lib/import-context'
import { copySource } from '@/lib/storage'
import { isInTrash, moveToTrash, type ObjectStorage, objectKeys, restore, StorageOutage, trashKey } from '@/lib/trash'
import { type CommandS3, deletionsWithoutTrash } from '../support/s3-spy'

/**
 * The bin of the object storage (ticket 045; plan 01 §1.8): a photo that no longer serves moves
 * under `deleted/`, never erased. The rule, against a storage in memory; the requests themselves,
 * against the simulator of the bench, are in tests/integration/media-trash.test.ts.
 */

/** A storage in memory that writes down every operation, and fails on demand. */
class StorageInMemory implements ObjectStorage {
	readonly objets = new Map<string, Uint8Array>()
	readonly operations: string[] = []
	/** An operation for which this is true fails, as when the storage is down. */
	panne: (operation: string) => boolean = () => false
	/** A copy for which this is true loses its last byte. */
	copieTronquee: (source: string) => boolean = () => false

	constructor(objets: Record<string, string> = {}) {
		for (const [key, content] of Object.entries(objets)) this.objets.set(key, new TextEncoder().encode(content))
	}

	private noter(operation: string) {
		this.operations.push(operation)
		if (this.panne(operation)) throw new Error('Panne simulée du stockage.')
	}

	async taille(cle: string) {
		this.noter(`taille ${cle}`)
		return this.objets.get(cle)?.length
	}

	async copier(source: string, destination: string) {
		this.noter(`copier ${source} ${destination}`)
		const bytes = this.objets.get(source)
		if (!bytes) throw new Error('NoSuchKey')
		this.objets.set(destination, this.copieTronquee(source) ? bytes.slice(0, -1) : bytes.slice())
	}

	async retirer(cle: string) {
		this.noter(`retirer ${cle}`)
		this.objets.delete(cle)
	}

	contenu(cle: string): string | undefined {
		const bytes = this.objets.get(cle)
		return bytes && new TextDecoder().decode(bytes)
	}

	/** The operations of one kind, in order. */
	des(type: 'taille' | 'copier' | 'retirer'): string[] {
		return this.operations.filter(operation => operation.startsWith(`${type} `))
	}
}

describe('Les clés d’un média : l’original et chaque taille dérivée, dans son dossier', () => {
	test('à la racine, sous un préfixe, sous un préfixe imbriqué', () => {
		expect(objectKeys({ prefix: '', filename: 'a.png' })).toEqual(['a.png'])
		expect(objectKeys({ prefix: null, filename: 'a.png' })).toEqual(['a.png'])
		expect(objectKeys({ prefix: 'media', filename: 'a.png' })).toEqual(['media/a.png'])
		expect(objectKeys({ prefix: 'ancien/dossier', filename: 'a.png' })).toEqual(['ancien/dossier/a.png'])
	})

	test('les tailles dérivées suivent l’original, sans doublon ni nom vide', () => {
		expect(
			objectKeys({
				prefix: 'media',
				filename: 'a.webp',
				sizes: {
					vignette: { filename: 'a-300x300.webp' },
					carte: { filename: 'a-800x600.webp' },
					absente: { filename: null },
					vide: null,
					identique: { filename: 'a.webp' },
				},
			})
		).toEqual(['media/a.webp', 'media/a-300x300.webp', 'media/a-800x600.webp'])
	})

	test('le dossier d’un envoi direct du navigateur (`_objectKey`) s’ajoute au préfixe ; sans nom, aucune clé', () => {
		expect(objectKeys({ prefix: 'media', _objectKey: 'k1', filename: 'a.png' })).toEqual(['media/k1/a.png'])
		expect(objectKeys({ prefix: 'media', filename: null })).toEqual([])
	})

	test('la corbeille est le dossier deleted/, à la racine, et la clé d’origine suit', () => {
		expect(trashKey('media/a.png')).toBe('deleted/media/a.png')
		expect(trashKey('a.png')).toBe('deleted/a.png')
		expect(isInTrash('deleted/media/a.png')).toBe(true)
		for (const key of ['media/a.png', 'deleted.png', 'media/deleted/a.png']) expect(isInTrash(key)).toBe(false)
	})
})

describe('Un objet passe à la corbeille : copié, vérifié, puis retiré de sa place', () => {
	test('chaque objet passe sous deleted/, octet pour octet ; rien d’autre ne bouge', async () => {
		const storage = new StorageInMemory({ 'media/a.png': 'AAAA', 'media/a-300.png': 'aa', 'media/b.png': 'BB' })

		const summary = await moveToTrash(storage, ['media/a.png', 'media/a-300.png'])

		expect(summary).toEqual({ deplacees: ['media/a.png', 'media/a-300.png'], absentes: [], dejaEnCorbeille: [] })
		expect([...storage.objets.keys()].sort()).toEqual(['deleted/media/a-300.png', 'deleted/media/a.png', 'media/b.png'])
		expect(storage.contenu('deleted/media/a.png')).toBe('AAAA')
		expect(storage.contenu('deleted/media/a-300.png')).toBe('aa')
	})

	test('l’original n’est retiré qu’après la copie et la vérification de sa taille', async () => {
		const storage = new StorageInMemory({ 'media/a.png': 'AAAA' })

		await moveToTrash(storage, ['media/a.png'])

		expect(storage.operations).toEqual([
			'taille media/a.png',
			'copier media/a.png deleted/media/a.png',
			'taille deleted/media/a.png',
			'retirer media/a.png',
		])
	})

	test('un objet absent n’est pas une erreur ; un objet déjà en corbeille y reste ; une clé donnée deux fois, une fois', async () => {
		const storage = new StorageInMemory({ 'media/a.png': 'A', 'deleted/media/z.png': 'Z' })

		const summary = await moveToTrash(storage, [
			'media/absente.png',
			'media/a.png',
			'media/a.png',
			'deleted/media/z.png',
		])

		expect(summary).toEqual({
			deplacees: ['media/a.png'],
			absentes: ['media/absente.png'],
			dejaEnCorbeille: ['deleted/media/z.png'],
		})
		expect(storage.contenu('deleted/media/z.png')).toBe('Z')
		expect(storage.des('retirer')).toEqual(['retirer media/a.png'])
	})

	test('une copie incomplète : l’original reste, rien n’est retiré, l’erreur remonte', async () => {
		const storage = new StorageInMemory({ 'media/a.png': 'AAAA' })
		storage.copieTronquee = () => true

		await expect(moveToTrash(storage, ['media/a.png'])).rejects.toBeInstanceOf(StorageOutage)

		expect(storage.contenu('media/a.png')).toBe('AAAA')
		expect(storage.des('retirer')).toEqual([])
	})
})

describe('Panne du stockage : ce qui a bougé est remis en place, une fois, et l’erreur remonte', () => {
	const threeObjects = () => new StorageInMemory({ 'media/1.png': 'un', 'media/2.png': 'deux', 'media/3.png': 'trois' })

	test('la panne au deuxième objet : le premier revient, le troisième n’a jamais bougé', async () => {
		const storage = threeObjects()
		storage.panne = operation => operation === 'copier media/2.png deleted/media/2.png'

		const error = await moveToTrash(storage, ['media/1.png', 'media/2.png', 'media/3.png']).catch((e: unknown) => e)

		expect(error).toBeInstanceOf(StorageOutage)
		expect(error).toMatchObject({ remises: ['media/1.png'], nonRemises: [] })
		for (const [key, content] of [
			['media/1.png', 'un'],
			['media/2.png', 'deux'],
			['media/3.png', 'trois'],
		])
			expect(storage.contenu(key as string)).toBe(content)
		// The copy back, once; the copy in the bin stays, for the rule of the storage: nothing removed.
		expect(storage.des('copier').filter(op => op.startsWith('copier deleted/'))).toEqual([
			'copier deleted/media/1.png media/1.png',
		])
		expect(storage.contenu('deleted/media/1.png')).toBe('un')
		expect(storage.des('retirer')).toEqual(['retirer media/1.png'])
	})

	test('la remise en place échoue aussi : elle n’est pas répétée, l’objet attend dans la corbeille et l’erreur le dit', async () => {
		const storage = threeObjects()
		storage.panne = operation =>
			operation === 'copier media/2.png deleted/media/2.png' || operation === 'copier deleted/media/1.png media/1.png'

		const error = await moveToTrash(storage, ['media/1.png', 'media/2.png']).catch((e: unknown) => e)

		expect(error).toMatchObject({ name: 'PanneDuStockage', remises: [], nonRemises: ['media/1.png'] })
		expect(storage.des('copier').filter(op => op.startsWith('copier deleted/'))).toHaveLength(1)
		expect(storage.contenu('deleted/media/1.png')).toBe('un')
	})

	test('le retrait de l’original échoue : l’original est toujours là, rien à remettre', async () => {
		const storage = threeObjects()
		storage.panne = operation => operation === 'retirer media/1.png'

		const error = await moveToTrash(storage, ['media/1.png']).catch((e: unknown) => e)

		expect(error).toMatchObject({ remises: ['media/1.png'], nonRemises: [] })
		expect(storage.contenu('media/1.png')).toBe('un')
		expect(storage.des('copier')).toEqual(['copier media/1.png deleted/media/1.png'])
	})

	test('le stockage ne répond pas dès le début : rien n’a bougé, rien à remettre', async () => {
		const storage = threeObjects()
		storage.panne = () => true

		const error = await moveToTrash(storage, ['media/1.png']).catch((e: unknown) => e)

		expect(error).toMatchObject({ remises: [], nonRemises: [] })
		expect((error as Error).message).not.toContain('media/1.png')
		expect(storage.contenu('media/1.png')).toBe('un')
	})
})

describe('La remise en place d’un objet de la corbeille', () => {
	test('l’objet revient à sa place ; sa copie reste dans la corbeille ; rien n’est retiré', async () => {
		const storage = new StorageInMemory({ 'media/a.png': 'AAAA' })
		await moveToTrash(storage, ['media/a.png'])

		const summary = await restore(storage, ['media/a.png'])

		expect(summary).toEqual({ remises: ['media/a.png'], nonRemises: [] })
		expect(storage.contenu('media/a.png')).toBe('AAAA')
		expect(storage.contenu('deleted/media/a.png')).toBe('AAAA')
		expect(storage.des('retirer')).toEqual(['retirer media/a.png'])
	})

	test('un objet déjà à sa place n’est pas réécrit ; sans copie dans la corbeille, il est listé', async () => {
		const storage = new StorageInMemory({ 'media/a.png': 'neuf', 'deleted/media/a.png': 'ancien' })

		const summary = await restore(storage, ['media/a.png', 'media/inconnue.png'])

		expect(summary).toEqual({ remises: ['media/a.png'], nonRemises: ['media/inconnue.png'] })
		expect(storage.contenu('media/a.png')).toBe('neuf')
		expect(storage.des('copier')).toEqual([])
	})
})

describe('Un test échoue si une suppression d’objet est appelée (l’espion du banc)', () => {
	const command = (nom: string, entree: Record<string, unknown>, reussie = true): CommandS3 => ({
		nom,
		entree,
		reussie,
	})
	const copyInTrash = (cle: string, reussie = true) =>
		command('CopyObject', { Bucket: 'b', Key: trashKey(cle), CopySource: copySource('b', cle) }, reussie)

	test('un déplacement vers la corbeille n’est pas une suppression', () => {
		expect(
			deletionsWithoutTrash([
				command('HeadObject', { Key: 'media/a b.png' }),
				copyInTrash('media/a b.png'),
				command('HeadObject', { Key: 'deleted/media/a b.png' }),
				command('DeleteObject', { Key: 'media/a b.png' }),
			])
		).toEqual([])
	})

	test('ce que faisait le greffon de stockage : un objet retiré sans copie dans la corbeille, signalé', () => {
		expect(deletionsWithoutTrash([command('DeleteObject', { Key: 'media/a.png' })])).toEqual(['media/a.png'])
	})

	test('une copie échouée, une copie ailleurs, un objet de la corbeille, plusieurs objets à la fois : signalés', () => {
		expect(
			deletionsWithoutTrash([
				copyInTrash('media/a.png', false),
				command('DeleteObject', { Key: 'media/a.png' }),
				command('CopyObject', { Key: 'ailleurs/b.png', CopySource: copySource('b', 'media/b.png') }),
				command('DeleteObject', { Key: 'media/b.png' }),
				command('DeleteObject', { Key: 'deleted/media/c.png' }),
				command('DeleteObjects', { Delete: { Objects: [] } }),
			])
		).toEqual(['media/a.png', 'media/b.png', 'deleted/media/c.png', '(plusieurs objets à la fois)'])
	})
})

describe('L’application n’efface jamais un objet : une seule suppression dans le code, celle du déplacement', () => {
	const root = path.resolve(import.meta.dir, '../..')
	const files = (dossier: string): string[] =>
		readdirSync(path.join(root, dossier), { recursive: true, encoding: 'utf8' })
			.filter(fichier => /\.(ts|tsx)$/.test(fichier))
			.map(fichier => path.join(dossier, fichier))
	const containing = (motif: RegExp) =>
		[...files('src'), ...files('scripts')].filter(fichier => motif.test(readFileSync(path.join(root, fichier), 'utf8')))

	test('une requête de suppression du stockage n’existe que dans src/lib/storage.ts', () => {
		expect(containing(/DeleteObjects?Command|\.deleteObjects?\s*\(/)).toEqual(['src/lib/storage.ts'])
	})

	test('et elle n’est appelée que par le déplacement vers la corbeille', () => {
		expect(containing(/\.retirer\s*\(/)).toEqual(['src/lib/trash.ts'])
	})
})

describe('Le greffon de stockage perd ses suppressions ; media et profils reçoivent la corbeille', () => {
	const own: CollectionAfterChangeHook = ({ doc }) => doc
	const ownToDeletion: CollectionAfterDeleteHook = ({ doc }) => doc

	/** A plugin that does what @payloadcms/storage-s3 does: an upload then a deletion after a change, a deletion after a delete. */
	function fakePlugin() {
		const received: unknown[] = []
		const upload: CollectionAfterChangeHook = args => {
			received.push(args.previousDoc)
			return args.doc
		}
		const deletion: CollectionAfterDeleteHook = ({ doc }) => doc
		const plugin: Plugin = config => ({
			...config,
			collections: config.collections?.map(collection =>
				collection.slug === 'media'
					? {
							...collection,
							hooks: {
								...collection.hooks,
								afterChange: [...(collection.hooks?.afterChange ?? []), upload],
								afterDelete: [...(collection.hooks?.afterDelete ?? []), deletion],
							},
						}
					: collection
			),
		})
		return { plugin, recus: received, suppression: deletion, televersement: upload }
	}

	const collections = (): CollectionConfig[] => [
		{ slug: 'media', upload: true, fields: [], hooks: { afterChange: [own], afterDelete: [ownToDeletion] } },
		{ slug: 'profiles', fields: [], hooks: { afterChange: [own] } },
		{ slug: 'talents', fields: [] },
	]

	test('après le greffon : ses suppressions retirées, ses envois gardés, les crochets de la collection d’abord, la corbeille en dernier', async () => {
		const fake = fakePlugin()

		const config = (await withTrash(fake.plugin, undefined)({ collections: collections() } as Config))
			.collections as CollectionConfig[]
		const [media, profiles, talents] = config

		expect(media?.hooks?.afterDelete).toHaveLength(2)
		expect(media?.hooks?.afterDelete?.[0]).toBe(ownToDeletion)
		expect(media?.hooks?.afterDelete).not.toContain(fake.suppression)
		expect(media?.hooks?.afterChange).toHaveLength(3)
		expect(media?.hooks?.afterChange?.[0]).toBe(own)
		expect(profiles?.hooks?.afterChange).toHaveLength(2)
		expect(profiles?.hooks?.afterChange?.[0]).toBe(own)
		expect(profiles?.hooks?.afterDelete).toHaveLength(1)
		expect(talents?.hooks).toBeUndefined()
	})

	test('media et profils : un document à la fois, d’abord ; la liste de l’administration n’offre plus d’agir sur plusieurs', async () => {
		const before: CollectionBeforeOperationHook = ({ args }) => args
		const [media, profiles, talents] = (
			await withTrash(
				fakePlugin().plugin,
				undefined
			)({
				collections: collections().map(collection =>
					collection.slug === 'media'
						? { ...collection, hooks: { ...collection.hooks, beforeOperation: [before] } }
						: collection
				),
			} as Config)
		).collections as CollectionConfig[]

		expect(media?.hooks?.beforeOperation).toEqual([oneAtATime, before])
		expect(profiles?.hooks?.beforeOperation).toEqual([oneAtATime])
		for (const collection of [media, profiles])
			expect(collection).toMatchObject({ disableBulkDelete: true, disableBulkEdit: true })
		expect(talents?.disableBulkDelete).toBeUndefined()
		expect(talents?.disableBulkEdit).toBeUndefined()
	})

	test('l’envoi du greffon ne voit plus le document précédent : il ne peut plus effacer l’ancien fichier', async () => {
		const fake = fakePlugin()
		const [media] =
			withoutPluginDeletion(
				{
					slug: 'media',
					fields: [],
					hooks: { afterChange: [own, fake.televersement], afterDelete: [fake.suppression] },
				},
				{ afterChange: [own] }
			).hooks?.afterChange?.slice(1) ?? []

		await media?.({
			collection: {} as never,
			context: {},
			data: {},
			doc: { id: 1, filename: 'nouveau.png' },
			operation: 'update',
			previousDoc: { id: 1, filename: 'ancien.png' },
			req: {} as never,
		})

		expect(fake.recus).toEqual([undefined])
	})

	test('un greffon qui n’ajoute rien (stockage absent) : la collection reste telle quelle', () => {
		const collection: CollectionConfig = { slug: 'media', fields: [], hooks: { afterChange: [own] } }
		expect(withoutPluginDeletion(collection, collection.hooks)).toBe(collection)
	})
})

describe('Plusieurs médias ou profils à la fois : refusé avant toute écriture, sauf pour l’import', () => {
	const operation = (nom: string, args: Record<string, unknown>, context: Record<string, unknown> = {}) =>
		oneAtATime({
			args: args as never,
			collection: {} as never,
			context,
			operation: nom as never,
			overrideAccess: true,
			req: {} as never,
		})

	test('une suppression ou une modification par un filtre : refusée en 403, avec le message en français', () => {
		for (const name of ['delete', 'update']) {
			let error: unknown
			try {
				operation(name, { where: { id: { equals: 1 } } })
			} catch (e) {
				error = e
			}
			expect(error).toMatchObject({ message: ONE_AT_A_TIME_MESSAGE, status: 403, isPublic: true })
		}
	})

	test('par son identifiant, une lecture, une création : passent telles quelles', () => {
		for (const [name, args] of [
			['delete', { id: 1 }],
			['update', { id: 1, data: {} }],
			['update', { id: 0, data: {} }],
			['read', { where: {} }],
			['create', { data: {} }],
		] as const)
			expect(operation(name, args)).toBe(args as never)
	})

	test('sous le contexte d’import : passent aussi, l’import ne déplace rien', () => {
		const args = { where: { id: { in: [1, 2] } } }
		expect(operation('delete', args, IMPORT_CONTEXT)).toBe(args as never)
		expect(operation('update', args, IMPORT_CONTEXT)).toBe(args as never)
	})
})

describe('Sans stockage d’objets, le ménage d’un profil ne supprime aucun média', () => {
	/** A request whose Local API writes down what it is asked, finds nothing, and deletes nothing. */
	function fakeRequest() {
		const calls: string[] = []
		const warnings: string[] = []
		const req = {
			context: {},
			payload: {
				find: async ({ collection }: { collection: string }) => {
					calls.push(`find ${collection}`)
					return { docs: [] }
				},
				findVersions: async ({ collection }: { collection: string }) => {
					calls.push(`findVersions ${collection}`)
					return { docs: [] }
				},
				delete: async ({ collection }: { collection: string }) => {
					calls.push(`delete ${collection}`)
				},
				logger: { info: () => {}, warn: (ligne: string) => warnings.push(ligne), error: () => {} },
			},
		}
		return { appels: calls, avertissements: warnings, req: req as never }
	}

	/** The hooks of the bin on `profils`, as src/payload.config.ts sets them, with this storage or none. */
	async function profileHooks(stockage: ObjectStorage | undefined) {
		const profileOnly: CollectionConfig[] = [{ slug: 'profiles', fields: [] }]
		const config = await withTrash(config => config, stockage)({ collections: profileOnly } as Config)
		const [profiles] = config.collections as CollectionConfig[]
		const [afterRecord] = profiles?.hooks?.afterChange ?? []
		const [afterDeletion] = profiles?.hooks?.afterDelete ?? []
		if (!afterRecord || !afterDeletion) throw new Error('La corbeille n’a pas posé ses crochets.')
		return { apresEnregistrement: afterRecord, apresSuppression: afterDeletion }
	}

	const before = { id: 7, pro: 3, mainPicture: 11, gallery: [12, { id: 13 }] }
	const after = { id: 7, pro: 3, mainPicture: null, gallery: [] }

	test('une photo retirée, un profil supprimé : aucune lecture, aucune suppression ; une ligne le dit', async () => {
		const { apresEnregistrement: afterRecord, apresSuppression: afterDeletion } = await profileHooks(undefined)
		const record = fakeRequest()
		const deletion = fakeRequest()

		await afterRecord({
			collection: {} as never,
			context: {},
			data: {},
			doc: after,
			operation: 'update',
			previousDoc: before,
			req: record.req,
		})
		await afterDeletion({ collection: {} as never, context: {}, doc: before, id: 7, req: deletion.req })

		expect(record.appels).toEqual([])
		expect(deletion.appels).toEqual([])
		expect(record.avertissements).toEqual([
			'[corbeille] profile 7: no object storage, the clean-up is skipped and 3 media kept',
		])
		expect(deletion.avertissements).toHaveLength(1)
	})

	test('avec un stockage, le même enregistrement cherche ce que rien ne désigne plus : le ménage n’est coupé que sans stockage', async () => {
		const { apresEnregistrement: afterRecord } = await profileHooks(new StorageInMemory())
		const { appels: calls, avertissements: warnings, req } = fakeRequest()

		await afterRecord({
			collection: {} as never,
			context: {},
			data: {},
			doc: after,
			operation: 'update',
			previousDoc: before,
			req,
		})

		expect(calls).toEqual(['find profiles', 'find articles', 'findVersions articles', 'find media'])
		expect(warnings).toEqual([])
	})
})
