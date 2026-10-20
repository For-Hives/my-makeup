import { afterEach, describe, expect, test } from 'bun:test'
import { benchEnvironment, RefusedBench } from '../support/bench'
import { RefusedEnvironment } from '../support/environment-guard'
import {
	benchStorage,
	deleteObject,
	dropObject,
	emptyStorage,
	listObjects,
	type ObjectStorage,
	readObject,
} from '../support/s3'

const BANC = benchEnvironment({ nom: 'my-makeup-test', decalage: 0 })

interface Demande {
	methode: string
	chemin: string
	parametres: Record<string, string>
	entetes: Headers
	corps: string
}

/** What a test has to close when it ends, whatever happened. */
const aFermer: (() => unknown)[] = []
afterEach(async () => {
	await Promise.all(aFermer.splice(0).map(fermer => fermer()))
})

/** A storage that is not the bench: a stand-in on a local port, which answers what the test decides. */
function fauxStockage(
	repondre: (demande: Demande) => Response,
	bucket = 'faux-test'
): ObjectStorage & { demandes: Demande[] } {
	const demandes: Demande[] = []
	const serveur = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: async requete => {
			const url = new URL(requete.url)
			const demande = {
				methode: requete.method,
				chemin: url.pathname,
				parametres: Object.fromEntries(url.searchParams),
				entetes: requete.headers,
				corps: await requete.text(),
			}
			demandes.push(demande)
			return repondre(demande)
		},
	})
	aFermer.push(() => serveur.stop(true))
	return {
		service: 'stockage d’objets',
		instance: { nom: 'faux-banc', decalage: 0 },
		adresse: `http://127.0.0.1:${serveur.port}`,
		bucket,
		demandes,
	}
}

const echec = async (essai: Promise<unknown>): Promise<unknown> => {
	try {
		await essai
	} catch (erreur) {
		return erreur
	}
	throw new Error('rien n’a échoué')
}

const refus = (essai: () => unknown): string => {
	try {
		essai()
	} catch (erreur) {
		if (erreur instanceof RefusedBench) return erreur.message
		throw erreur
	}
	throw new Error('rien n’a été refusé')
}

const xml = (corps: string, statut = 200): Response =>
	new Response(`<?xml version="1.0" encoding="UTF-8"?>${corps}`, {
		status: statut,
		headers: { 'Content-Type': 'application/xml' },
	})

describe('Le client ne lit et ne vide que le stockage du banc de son instance', () => {
	test('le stockage du banc est reconnu : c’est celui de .env.test', () => {
		expect(benchStorage(BANC)).toEqual({
			service: 'stockage d’objets',
			instance: { nom: 'my-makeup-test', decalage: 0 },
			adresse: 'http://127.0.0.1:9090',
			bucket: 'mymakeup-test',
		})
	})

	test('sans stockage réglé, tout s’arrête avec la commande à lancer', () => {
		expect(refus(() => benchStorage({}))).toBe(
			'Aucun banc de test n’est réglé (S3_ENDPOINT manque) : le stockage d’objets n’est ni lu ni vidé. Démarre le banc par « bun run bench:up », puis lance les tests par « bun run test:integration ».'
		)
	})

	test.each([
		['le stockage d’une autre instance', { S3_ENDPOINT: 'http://127.0.0.1:9110' }, 'S3_ENDPOINT'],
		['un stockage distant', { S3_ENDPOINT: 'https://compte-factice.r2.cloudflarestorage.com' }, 'S3_ENDPOINT'],
		['un autre espace du même stockage', { S3_BUCKET: 'autre-test' }, 'S3_BUCKET'],
	])('refuse %s, sans recopier l’adresse', (_cas, variables, nom) => {
		const message = refus(() => benchStorage({ ...BANC, ...variables }))

		expect(message).toStartWith(`${nom} ne désigne pas le stockage d’objets du banc de test : il n’est ni lu ni vidé.`)
		for (const valeur of Object.values(variables)) expect(message).not.toContain(valeur)
	})

	test('le stockage d’une instance décalée n’est reconnu que sous les variables de cette instance', () => {
		const voisin = benchEnvironment({ nom: 'voisin', decalage: 20 })

		expect(benchStorage({ ...voisin, BENCH_INSTANCE: 'voisin', BENCH_OFFSET: '20' }).adresse).toBe(
			'http://127.0.0.1:9110'
		)
		expect(() => benchStorage(voisin)).toThrow(RefusedBench)
	})

	test('un espace dont le nom ne finit pas par -test est refusé avant toute requête, même donné à la main', async () => {
		const stockage = fauxStockage(() => new Response('', { status: 200 }), 'photos')

		for (const essai of [
			() => dropObject('objet.txt', 'x', { stockage }),
			() => readObject('objet.txt', { stockage }),
			() => deleteObject('objet.txt', { stockage }),
			() => listObjects('', { stockage }),
			() => emptyStorage({ stockage }),
		]) {
			const erreur = await echec(essai())

			expect(erreur).toBeInstanceOf(RefusedEnvironment)
			expect((erreur as Error).message).toStartWith('S3_BUCKET refusé (« photos »)')
		}
		expect(stockage.demandes).toEqual([])
	})

	test('un stockage qui n’est pas sur ce poste est refusé de la même façon', async () => {
		const distant: ObjectStorage = {
			service: 'stockage d’objets',
			instance: { nom: 'faux-banc', decalage: 0 },
			adresse: 'https://compte-factice.r2.cloudflarestorage.com',
			bucket: 'mymakeup-test',
		}

		const erreur = await echec(emptyStorage({ stockage: distant }))

		expect(erreur).toBeInstanceOf(RefusedEnvironment)
		expect((erreur as Error).message).toStartWith(
			'S3_ENDPOINT refusé (hôte « compte-factice.r2.cloudflarestorage.com »)'
		)
	})
})

describe('Ce que le client demande au stockage', () => {
	test('un dépôt : l’espace dans le chemin, la clé encodée segment par segment, le type donné, aucune signature', async () => {
		const stockage = fauxStockage(() => new Response('', { status: 200 }))

		await dropObject('photos/été 2026/n°1 & 2.webp', 'contenu', { stockage, type: 'image/webp' })

		const [demande] = stockage.demandes
		expect(stockage.demandes.length).toBe(1)
		expect(demande?.methode).toBe('PUT')
		expect(demande?.chemin).toBe('/faux-test/photos/%C3%A9t%C3%A9%202026/n%C2%B01%20%26%202.webp')
		expect(demande?.entetes.get('content-type')).toBe('image/webp')
		expect(demande?.corps).toBe('contenu')
		// S3Mock checks no signature, and this client sends none: it could not reach a real storage.
		expect(demande?.entetes.get('authorization')).toBeNull()
	})

	test('une liste : le préfixe demandé, les pages suivies jusqu’à la dernière, les clés décodées', async () => {
		const pages: Record<string, string> = {
			'': '<ListBucketResult><Contents><Key>a/un%20fichier.txt</Key><Size>3</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>suite-1</NextContinuationToken></ListBucketResult>',
			'suite-1':
				'<ListBucketResult><Contents><Size>12</Size><Key>a/deux+mots%2Bplus.txt</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>',
		}
		const stockage = fauxStockage(({ parametres }) => xml(pages[parametres['continuation-token'] ?? ''] ?? ''))

		expect(await listObjects('a/', { stockage })).toEqual([
			{ cle: 'a/un fichier.txt', taille: 3 },
			{ cle: 'a/deux mots+plus.txt', taille: 12 },
		])
		expect(stockage.demandes.map(({ methode, chemin, parametres }) => ({ methode, chemin, parametres }))).toEqual([
			{
				methode: 'GET',
				chemin: '/faux-test',
				parametres: { 'list-type': '2', 'encoding-type': 'url', 'max-keys': '1000', prefix: 'a/' },
			},
			{
				methode: 'GET',
				chemin: '/faux-test',
				parametres: {
					'list-type': '2',
					'encoding-type': 'url',
					'max-keys': '1000',
					prefix: 'a/',
					'continuation-token': 'suite-1',
				},
			},
		])
	})

	test('une remise à zéro supprime chaque objet de la liste, et rien quand l’espace est vide', async () => {
		const cles = Array.from({ length: 45 }, (_cle, rang) => `objets/${rang}.txt`)
		const liste = `<ListBucketResult>${cles.map(cle => `<Contents><Key>${encodeURIComponent(cle)}</Key><Size>1</Size></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`
		const plein = fauxStockage(({ methode }) => (methode === 'GET' ? xml(liste) : new Response(null, { status: 204 })))
		const vide = fauxStockage(() => xml('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'))

		await emptyStorage({ stockage: plein })
		await emptyStorage({ stockage: vide })

		const supprimes = plein.demandes.filter(({ methode }) => methode === 'DELETE').map(({ chemin }) => chemin)
		expect(supprimes.sort()).toEqual(cles.map(cle => `/faux-test/${cle}`).sort())
		expect(vide.demandes.map(({ methode }) => methode)).toEqual(['GET'])
	})
})

describe('Ce que le stockage répond', () => {
	const ABSENT = '<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>'
	const SANS_ESPACE = '<Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist.</Message></Error>'

	test('une clé absente ne rend rien ; un espace absent est une erreur, pas un objet absent', async () => {
		expect(await readObject('absent.txt', { stockage: fauxStockage(() => xml(ABSENT, 404)) })).toBeUndefined()

		const erreur = await echec(readObject('objet.txt', { stockage: fauxStockage(() => xml(SANS_ESPACE, 404)) }))

		expect((erreur as Error).message).toBe(
			'Le stockage d’objets du banc « faux-banc » a répondu 404 à la demande « lire un objet ».'
		)
	})

	test.each([
		['déposer un objet', (stockage: ObjectStorage) => dropObject('objet.txt', 'x', { stockage })],
		['lire un objet', (stockage: ObjectStorage) => readObject('objet.txt', { stockage })],
		['supprimer un objet', (stockage: ObjectStorage) => deleteObject('objet.txt', { stockage })],
		['lister les objets', (stockage: ObjectStorage) => listObjects('', { stockage })],
	])('une panne à la demande « %s » : l’erreur dit quel service, de quel banc, à quelle demande', async (demande, essai) => {
		const erreur = await echec(essai(fauxStockage(() => new Response('panne', { status: 500 }))))

		expect((erreur as Error).message).toBe(
			`Le stockage d’objets du banc « faux-banc » a répondu 500 à la demande « ${demande} ».`
		)
	})

	test('une liste dont une ligne n’a pas de clé ou pas de taille est illisible', async () => {
		for (const ligne of ['<Contents><Size>3</Size></Contents>', '<Contents><Key>a.txt</Key></Contents>']) {
			const stockage = fauxStockage(() =>
				xml(`<ListBucketResult>${ligne}<IsTruncated>false</IsTruncated></ListBucketResult>`)
			)

			expect(((await echec(listObjects('', { stockage }))) as Error).message).toBe(
				'Le stockage d’objets du banc « faux-banc » a rendu une liste illisible.'
			)
		}
	})
})
