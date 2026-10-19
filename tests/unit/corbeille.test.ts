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
import { avecLaCorbeille, MESSAGE_UN_A_LA_FOIS, sansSuppressionDuGreffon, unALaFois } from '@/collections/trash'
import { CONTEXTE_IMPORT } from '@/lib/contexte-import'
import {
	cleEnCorbeille,
	clesDesObjets,
	deplacerVersLaCorbeille,
	estEnCorbeille,
	PanneDuStockage,
	remettreEnPlace,
	type StockageDesObjets,
} from '@/lib/corbeille'
import { sourceDeLaCopie } from '@/lib/stockage'
import { type CommandeS3, suppressionsSansCorbeille } from '../outils/espion-s3'

/**
 * The bin of the object storage (ticket 045; plan 01 §1.8): a photo that no longer serves moves
 * under `deleted/`, never erased. The rule, against a storage in memory; the requests themselves,
 * against the simulator of the bench, are in tests/integration/media-corbeille.test.ts.
 */

/** A storage in memory that writes down every operation, and fails on demand. */
class StockageEnMemoire implements StockageDesObjets {
	readonly objets = new Map<string, Uint8Array>()
	readonly operations: string[] = []
	/** An operation for which this is true fails, as when the storage is down. */
	panne: (operation: string) => boolean = () => false
	/** A copy for which this is true loses its last byte. */
	copieTronquee: (source: string) => boolean = () => false

	constructor(objets: Record<string, string> = {}) {
		for (const [cle, contenu] of Object.entries(objets)) this.objets.set(cle, new TextEncoder().encode(contenu))
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
		const octets = this.objets.get(source)
		if (!octets) throw new Error('NoSuchKey')
		this.objets.set(destination, this.copieTronquee(source) ? octets.slice(0, -1) : octets.slice())
	}

	async retirer(cle: string) {
		this.noter(`retirer ${cle}`)
		this.objets.delete(cle)
	}

	contenu(cle: string): string | undefined {
		const octets = this.objets.get(cle)
		return octets && new TextDecoder().decode(octets)
	}

	/** The operations of one kind, in order. */
	des(type: 'taille' | 'copier' | 'retirer'): string[] {
		return this.operations.filter(operation => operation.startsWith(`${type} `))
	}
}

describe('Les clés d’un média : l’original et chaque taille dérivée, dans son dossier', () => {
	test('à la racine, sous un préfixe, sous un préfixe imbriqué', () => {
		expect(clesDesObjets({ prefix: '', filename: 'a.png' })).toEqual(['a.png'])
		expect(clesDesObjets({ prefix: null, filename: 'a.png' })).toEqual(['a.png'])
		expect(clesDesObjets({ prefix: 'media', filename: 'a.png' })).toEqual(['media/a.png'])
		expect(clesDesObjets({ prefix: 'ancien/dossier', filename: 'a.png' })).toEqual(['ancien/dossier/a.png'])
	})

	test('les tailles dérivées suivent l’original, sans doublon ni nom vide', () => {
		expect(
			clesDesObjets({
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
		expect(clesDesObjets({ prefix: 'media', _objectKey: 'k1', filename: 'a.png' })).toEqual(['media/k1/a.png'])
		expect(clesDesObjets({ prefix: 'media', filename: null })).toEqual([])
	})

	test('la corbeille est le dossier deleted/, à la racine, et la clé d’origine suit', () => {
		expect(cleEnCorbeille('media/a.png')).toBe('deleted/media/a.png')
		expect(cleEnCorbeille('a.png')).toBe('deleted/a.png')
		expect(estEnCorbeille('deleted/media/a.png')).toBe(true)
		for (const cle of ['media/a.png', 'deleted.png', 'media/deleted/a.png']) expect(estEnCorbeille(cle)).toBe(false)
	})
})

describe('Un objet passe à la corbeille : copié, vérifié, puis retiré de sa place', () => {
	test('chaque objet passe sous deleted/, octet pour octet ; rien d’autre ne bouge', async () => {
		const stockage = new StockageEnMemoire({ 'media/a.png': 'AAAA', 'media/a-300.png': 'aa', 'media/b.png': 'BB' })

		const bilan = await deplacerVersLaCorbeille(stockage, ['media/a.png', 'media/a-300.png'])

		expect(bilan).toEqual({ deplacees: ['media/a.png', 'media/a-300.png'], absentes: [], dejaEnCorbeille: [] })
		expect([...stockage.objets.keys()].sort()).toEqual([
			'deleted/media/a-300.png',
			'deleted/media/a.png',
			'media/b.png',
		])
		expect(stockage.contenu('deleted/media/a.png')).toBe('AAAA')
		expect(stockage.contenu('deleted/media/a-300.png')).toBe('aa')
	})

	test('l’original n’est retiré qu’après la copie et la vérification de sa taille', async () => {
		const stockage = new StockageEnMemoire({ 'media/a.png': 'AAAA' })

		await deplacerVersLaCorbeille(stockage, ['media/a.png'])

		expect(stockage.operations).toEqual([
			'taille media/a.png',
			'copier media/a.png deleted/media/a.png',
			'taille deleted/media/a.png',
			'retirer media/a.png',
		])
	})

	test('un objet absent n’est pas une erreur ; un objet déjà en corbeille y reste ; une clé donnée deux fois, une fois', async () => {
		const stockage = new StockageEnMemoire({ 'media/a.png': 'A', 'deleted/media/z.png': 'Z' })

		const bilan = await deplacerVersLaCorbeille(stockage, [
			'media/absente.png',
			'media/a.png',
			'media/a.png',
			'deleted/media/z.png',
		])

		expect(bilan).toEqual({
			deplacees: ['media/a.png'],
			absentes: ['media/absente.png'],
			dejaEnCorbeille: ['deleted/media/z.png'],
		})
		expect(stockage.contenu('deleted/media/z.png')).toBe('Z')
		expect(stockage.des('retirer')).toEqual(['retirer media/a.png'])
	})

	test('une copie incomplète : l’original reste, rien n’est retiré, l’erreur remonte', async () => {
		const stockage = new StockageEnMemoire({ 'media/a.png': 'AAAA' })
		stockage.copieTronquee = () => true

		await expect(deplacerVersLaCorbeille(stockage, ['media/a.png'])).rejects.toBeInstanceOf(PanneDuStockage)

		expect(stockage.contenu('media/a.png')).toBe('AAAA')
		expect(stockage.des('retirer')).toEqual([])
	})
})

describe('Panne du stockage : ce qui a bougé est remis en place, une fois, et l’erreur remonte', () => {
	const troisObjets = () =>
		new StockageEnMemoire({ 'media/1.png': 'un', 'media/2.png': 'deux', 'media/3.png': 'trois' })

	test('la panne au deuxième objet : le premier revient, le troisième n’a jamais bougé', async () => {
		const stockage = troisObjets()
		stockage.panne = operation => operation === 'copier media/2.png deleted/media/2.png'

		const erreur = await deplacerVersLaCorbeille(stockage, ['media/1.png', 'media/2.png', 'media/3.png']).catch(
			(e: unknown) => e
		)

		expect(erreur).toBeInstanceOf(PanneDuStockage)
		expect(erreur).toMatchObject({ remises: ['media/1.png'], nonRemises: [] })
		for (const [cle, contenu] of [
			['media/1.png', 'un'],
			['media/2.png', 'deux'],
			['media/3.png', 'trois'],
		])
			expect(stockage.contenu(cle as string)).toBe(contenu)
		// The copy back, once; the copy in the bin stays, for the rule of the storage: nothing removed.
		expect(stockage.des('copier').filter(op => op.startsWith('copier deleted/'))).toEqual([
			'copier deleted/media/1.png media/1.png',
		])
		expect(stockage.contenu('deleted/media/1.png')).toBe('un')
		expect(stockage.des('retirer')).toEqual(['retirer media/1.png'])
	})

	test('la remise en place échoue aussi : elle n’est pas répétée, l’objet attend dans la corbeille et l’erreur le dit', async () => {
		const stockage = troisObjets()
		stockage.panne = operation =>
			operation === 'copier media/2.png deleted/media/2.png' || operation === 'copier deleted/media/1.png media/1.png'

		const erreur = await deplacerVersLaCorbeille(stockage, ['media/1.png', 'media/2.png']).catch((e: unknown) => e)

		expect(erreur).toMatchObject({ name: 'PanneDuStockage', remises: [], nonRemises: ['media/1.png'] })
		expect(stockage.des('copier').filter(op => op.startsWith('copier deleted/'))).toHaveLength(1)
		expect(stockage.contenu('deleted/media/1.png')).toBe('un')
	})

	test('le retrait de l’original échoue : l’original est toujours là, rien à remettre', async () => {
		const stockage = troisObjets()
		stockage.panne = operation => operation === 'retirer media/1.png'

		const erreur = await deplacerVersLaCorbeille(stockage, ['media/1.png']).catch((e: unknown) => e)

		expect(erreur).toMatchObject({ remises: ['media/1.png'], nonRemises: [] })
		expect(stockage.contenu('media/1.png')).toBe('un')
		expect(stockage.des('copier')).toEqual(['copier media/1.png deleted/media/1.png'])
	})

	test('le stockage ne répond pas dès le début : rien n’a bougé, rien à remettre', async () => {
		const stockage = troisObjets()
		stockage.panne = () => true

		const erreur = await deplacerVersLaCorbeille(stockage, ['media/1.png']).catch((e: unknown) => e)

		expect(erreur).toMatchObject({ remises: [], nonRemises: [] })
		expect((erreur as Error).message).not.toContain('media/1.png')
		expect(stockage.contenu('media/1.png')).toBe('un')
	})
})

describe('La remise en place d’un objet de la corbeille', () => {
	test('l’objet revient à sa place ; sa copie reste dans la corbeille ; rien n’est retiré', async () => {
		const stockage = new StockageEnMemoire({ 'media/a.png': 'AAAA' })
		await deplacerVersLaCorbeille(stockage, ['media/a.png'])

		const bilan = await remettreEnPlace(stockage, ['media/a.png'])

		expect(bilan).toEqual({ remises: ['media/a.png'], nonRemises: [] })
		expect(stockage.contenu('media/a.png')).toBe('AAAA')
		expect(stockage.contenu('deleted/media/a.png')).toBe('AAAA')
		expect(stockage.des('retirer')).toEqual(['retirer media/a.png'])
	})

	test('un objet déjà à sa place n’est pas réécrit ; sans copie dans la corbeille, il est listé', async () => {
		const stockage = new StockageEnMemoire({ 'media/a.png': 'neuf', 'deleted/media/a.png': 'ancien' })

		const bilan = await remettreEnPlace(stockage, ['media/a.png', 'media/inconnue.png'])

		expect(bilan).toEqual({ remises: ['media/a.png'], nonRemises: ['media/inconnue.png'] })
		expect(stockage.contenu('media/a.png')).toBe('neuf')
		expect(stockage.des('copier')).toEqual([])
	})
})

describe('Un test échoue si une suppression d’objet est appelée (l’espion du banc)', () => {
	const commande = (nom: string, entree: Record<string, unknown>, reussie = true): CommandeS3 => ({
		nom,
		entree,
		reussie,
	})
	const copieEnCorbeille = (cle: string, reussie = true) =>
		commande('CopyObject', { Bucket: 'b', Key: cleEnCorbeille(cle), CopySource: sourceDeLaCopie('b', cle) }, reussie)

	test('un déplacement vers la corbeille n’est pas une suppression', () => {
		expect(
			suppressionsSansCorbeille([
				commande('HeadObject', { Key: 'media/a b.png' }),
				copieEnCorbeille('media/a b.png'),
				commande('HeadObject', { Key: 'deleted/media/a b.png' }),
				commande('DeleteObject', { Key: 'media/a b.png' }),
			])
		).toEqual([])
	})

	test('ce que faisait le greffon de stockage : un objet retiré sans copie dans la corbeille, signalé', () => {
		expect(suppressionsSansCorbeille([commande('DeleteObject', { Key: 'media/a.png' })])).toEqual(['media/a.png'])
	})

	test('une copie échouée, une copie ailleurs, un objet de la corbeille, plusieurs objets à la fois : signalés', () => {
		expect(
			suppressionsSansCorbeille([
				copieEnCorbeille('media/a.png', false),
				commande('DeleteObject', { Key: 'media/a.png' }),
				commande('CopyObject', { Key: 'ailleurs/b.png', CopySource: sourceDeLaCopie('b', 'media/b.png') }),
				commande('DeleteObject', { Key: 'media/b.png' }),
				commande('DeleteObject', { Key: 'deleted/media/c.png' }),
				commande('DeleteObjects', { Delete: { Objects: [] } }),
			])
		).toEqual(['media/a.png', 'media/b.png', 'deleted/media/c.png', '(plusieurs objets à la fois)'])
	})
})

describe('L’application n’efface jamais un objet : une seule suppression dans le code, celle du déplacement', () => {
	const racine = path.resolve(import.meta.dir, '../..')
	const fichiers = (dossier: string): string[] =>
		readdirSync(path.join(racine, dossier), { recursive: true, encoding: 'utf8' })
			.filter(fichier => /\.(ts|tsx)$/.test(fichier))
			.map(fichier => path.join(dossier, fichier))
	const contenant = (motif: RegExp) =>
		[...fichiers('src'), ...fichiers('scripts')].filter(fichier =>
			motif.test(readFileSync(path.join(racine, fichier), 'utf8'))
		)

	test('une requête de suppression du stockage n’existe que dans src/lib/stockage.ts', () => {
		expect(contenant(/DeleteObjects?Command|\.deleteObjects?\s*\(/)).toEqual(['src/lib/stockage.ts'])
	})

	test('et elle n’est appelée que par le déplacement vers la corbeille', () => {
		expect(contenant(/\.retirer\s*\(/)).toEqual(['src/lib/corbeille.ts'])
	})
})

describe('Le greffon de stockage perd ses suppressions ; media et profils reçoivent la corbeille', () => {
	const propre: CollectionAfterChangeHook = ({ doc }) => doc
	const propreALaSuppression: CollectionAfterDeleteHook = ({ doc }) => doc

	/** A plugin that does what @payloadcms/storage-s3 does: an upload then a deletion after a change, a deletion after a delete. */
	function faussePlugin() {
		const recus: unknown[] = []
		const televersement: CollectionAfterChangeHook = args => {
			recus.push(args.previousDoc)
			return args.doc
		}
		const suppression: CollectionAfterDeleteHook = ({ doc }) => doc
		const plugin: Plugin = config => ({
			...config,
			collections: config.collections?.map(collection =>
				collection.slug === 'media'
					? {
							...collection,
							hooks: {
								...collection.hooks,
								afterChange: [...(collection.hooks?.afterChange ?? []), televersement],
								afterDelete: [...(collection.hooks?.afterDelete ?? []), suppression],
							},
						}
					: collection
			),
		})
		return { plugin, recus, suppression, televersement }
	}

	const collections = (): CollectionConfig[] => [
		{ slug: 'media', upload: true, fields: [], hooks: { afterChange: [propre], afterDelete: [propreALaSuppression] } },
		{ slug: 'profils', fields: [], hooks: { afterChange: [propre] } },
		{ slug: 'talents', fields: [] },
	]

	test('après le greffon : ses suppressions retirées, ses envois gardés, les crochets de la collection d’abord, la corbeille en dernier', async () => {
		const fausse = faussePlugin()

		const config = (await avecLaCorbeille(fausse.plugin, undefined)({ collections: collections() } as Config))
			.collections as CollectionConfig[]
		const [media, profils, talents] = config

		expect(media?.hooks?.afterDelete).toHaveLength(2)
		expect(media?.hooks?.afterDelete?.[0]).toBe(propreALaSuppression)
		expect(media?.hooks?.afterDelete).not.toContain(fausse.suppression)
		expect(media?.hooks?.afterChange).toHaveLength(3)
		expect(media?.hooks?.afterChange?.[0]).toBe(propre)
		expect(profils?.hooks?.afterChange).toHaveLength(2)
		expect(profils?.hooks?.afterChange?.[0]).toBe(propre)
		expect(profils?.hooks?.afterDelete).toHaveLength(1)
		expect(talents?.hooks).toBeUndefined()
	})

	test('media et profils : un document à la fois, d’abord ; la liste de l’administration n’offre plus d’agir sur plusieurs', async () => {
		const avant: CollectionBeforeOperationHook = ({ args }) => args
		const [media, profils, talents] = (
			await avecLaCorbeille(
				faussePlugin().plugin,
				undefined
			)({
				collections: collections().map(collection =>
					collection.slug === 'media'
						? { ...collection, hooks: { ...collection.hooks, beforeOperation: [avant] } }
						: collection
				),
			} as Config)
		).collections as CollectionConfig[]

		expect(media?.hooks?.beforeOperation).toEqual([unALaFois, avant])
		expect(profils?.hooks?.beforeOperation).toEqual([unALaFois])
		for (const collection of [media, profils])
			expect(collection).toMatchObject({ disableBulkDelete: true, disableBulkEdit: true })
		expect(talents?.disableBulkDelete).toBeUndefined()
		expect(talents?.disableBulkEdit).toBeUndefined()
	})

	test('l’envoi du greffon ne voit plus le document précédent : il ne peut plus effacer l’ancien fichier', async () => {
		const fausse = faussePlugin()
		const [media] =
			sansSuppressionDuGreffon(
				{
					slug: 'media',
					fields: [],
					hooks: { afterChange: [propre, fausse.televersement], afterDelete: [fausse.suppression] },
				},
				{ afterChange: [propre] }
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

		expect(fausse.recus).toEqual([undefined])
	})

	test('un greffon qui n’ajoute rien (stockage absent) : la collection reste telle quelle', () => {
		const collection: CollectionConfig = { slug: 'media', fields: [], hooks: { afterChange: [propre] } }
		expect(sansSuppressionDuGreffon(collection, collection.hooks)).toBe(collection)
	})
})

describe('Plusieurs médias ou profils à la fois : refusé avant toute écriture, sauf pour l’import', () => {
	const operation = (nom: string, args: Record<string, unknown>, context: Record<string, unknown> = {}) =>
		unALaFois({
			args: args as never,
			collection: {} as never,
			context,
			operation: nom as never,
			overrideAccess: true,
			req: {} as never,
		})

	test('une suppression ou une modification par un filtre : refusée en 403, avec le message en français', () => {
		for (const nom of ['delete', 'update']) {
			let erreur: unknown
			try {
				operation(nom, { where: { id: { equals: 1 } } })
			} catch (e) {
				erreur = e
			}
			expect(erreur).toMatchObject({ message: MESSAGE_UN_A_LA_FOIS, status: 403, isPublic: true })
		}
	})

	test('par son identifiant, une lecture, une création : passent telles quelles', () => {
		for (const [nom, args] of [
			['delete', { id: 1 }],
			['update', { id: 1, data: {} }],
			['update', { id: 0, data: {} }],
			['read', { where: {} }],
			['create', { data: {} }],
		] as const)
			expect(operation(nom, args)).toBe(args as never)
	})

	test('sous le contexte d’import : passent aussi, l’import ne déplace rien', () => {
		const args = { where: { id: { in: [1, 2] } } }
		expect(operation('delete', args, CONTEXTE_IMPORT)).toBe(args as never)
		expect(operation('update', args, CONTEXTE_IMPORT)).toBe(args as never)
	})
})

describe('Sans stockage d’objets, le ménage d’un profil ne supprime aucun média', () => {
	/** A request whose Local API writes down what it is asked, finds nothing, and deletes nothing. */
	function fausseRequete() {
		const appels: string[] = []
		const avertissements: string[] = []
		const req = {
			context: {},
			payload: {
				find: async ({ collection }: { collection: string }) => {
					appels.push(`find ${collection}`)
					return { docs: [] }
				},
				findVersions: async ({ collection }: { collection: string }) => {
					appels.push(`findVersions ${collection}`)
					return { docs: [] }
				},
				delete: async ({ collection }: { collection: string }) => {
					appels.push(`delete ${collection}`)
				},
				logger: { info: () => {}, warn: (ligne: string) => avertissements.push(ligne), error: () => {} },
			},
		}
		return { appels, avertissements, req: req as never }
	}

	/** The hooks of the bin on `profils`, as src/payload.config.ts sets them, with this storage or none. */
	async function crochetsDesProfils(stockage: StockageDesObjets | undefined) {
		const profilsSeuls: CollectionConfig[] = [{ slug: 'profils', fields: [] }]
		const config = await avecLaCorbeille(config => config, stockage)({ collections: profilsSeuls } as Config)
		const [profils] = config.collections as CollectionConfig[]
		const [apresEnregistrement] = profils?.hooks?.afterChange ?? []
		const [apresSuppression] = profils?.hooks?.afterDelete ?? []
		if (!apresEnregistrement || !apresSuppression) throw new Error('La corbeille n’a pas posé ses crochets.')
		return { apresEnregistrement, apresSuppression }
	}

	const avant = { id: 7, pro: 3, photoPrincipale: 11, galerie: [12, { id: 13 }] }
	const apres = { id: 7, pro: 3, photoPrincipale: null, galerie: [] }

	test('une photo retirée, un profil supprimé : aucune lecture, aucune suppression ; une ligne le dit', async () => {
		const { apresEnregistrement, apresSuppression } = await crochetsDesProfils(undefined)
		const enregistrement = fausseRequete()
		const suppression = fausseRequete()

		await apresEnregistrement({
			collection: {} as never,
			context: {},
			data: {},
			doc: apres,
			operation: 'update',
			previousDoc: avant,
			req: enregistrement.req,
		})
		await apresSuppression({ collection: {} as never, context: {}, doc: avant, id: 7, req: suppression.req })

		expect(enregistrement.appels).toEqual([])
		expect(suppression.appels).toEqual([])
		expect(enregistrement.avertissements).toEqual([
			'[corbeille] profile 7: no object storage, the clean-up is skipped and 3 media kept',
		])
		expect(suppression.avertissements).toHaveLength(1)
	})

	test('avec un stockage, le même enregistrement cherche ce que rien ne désigne plus : le ménage n’est coupé que sans stockage', async () => {
		const { apresEnregistrement } = await crochetsDesProfils(new StockageEnMemoire())
		const { appels, avertissements, req } = fausseRequete()

		await apresEnregistrement({
			collection: {} as never,
			context: {},
			data: {},
			doc: apres,
			operation: 'update',
			previousDoc: avant,
			req,
		})

		expect(appels).toEqual(['find profils', 'find articles', 'findVersions articles', 'find media'])
		expect(avertissements).toEqual([])
	})
})
