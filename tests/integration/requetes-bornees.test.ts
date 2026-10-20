import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { CollectionSlug, Payload, Where } from 'payload'
import { boundedQuery, CONDITIONS_MAX, PRIVATE_FIELD_MESSAGE, TOO_MANY_CONDITIONS_MESSAGE } from '@/lib/bounded-query'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * A public request that is too large, or that filters or sorts on a private field, is refused
 * before the database (ticket 048; plan 02 §7.2, U60, played through the real API). An admin
 * passes, except on the secrets of an account, which nobody filters on.
 */

type Compte = Awaited<ReturnType<typeof createAccount<'maquilleuse'>>>
type Lecteur = { nom: string; enTetes: Record<string, string> }

let payload: Payload
let a: Compte
let b: Compte
let lecteurs: { anonyme: Lecteur; maquilleuse: Lecteur; redaction: Lecteur; admin: Lecteur }
let profilA: number
let profilB: number

/** The contact details, internal note and score of A's published profile: never a filter for the public. */
const PRIVE_DE_A = { telephone: '06 39 98 00 01', email: 'contact-a@example.test', note: 'Note interne fictive' }

beforeAll(async () => {
	payload = await testPayload()
	;[a, b] = [await createAccount('maquilleuse'), await createAccount('maquilleuse')]
	const [autre, redaction, admin] = [
		await createAccount('maquilleuse'),
		await createAccount('redaction'),
		await createAccount('admin'),
	]
	lecteurs = {
		anonyme: { nom: 'anonyme', enTetes: {} },
		maquilleuse: { nom: 'une autre maquilleuse', enTetes: autre.session.enTetes },
		redaction: { nom: 'redaction', enTetes: redaction.session.enTetes },
		admin: { nom: 'admin', enTetes: admin.session.enTetes },
	}
	const profilDe = async (compte: Compte) =>
		(await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })).docs[0]?.id ?? 0
	;[profilA, profilB] = [await profilDe(a), await profilDe(b)]
	await payload.update({
		collection: 'profiles',
		id: profilA,
		data: {
			status: 'published',
			contactDetails: { phone: PRIVE_DE_A.telephone, email: PRIVE_DE_A.email },
			internalNote: PRIVE_DE_A.note,
			score: 4.5,
		},
	})
	await payload.update({ collection: 'profiles', id: profilB, data: { status: 'published', score: 2 } })
	await payload.create({
		collection: 'talents',
		data: { title: 'Talent fictif', slug: 'talent-fictif', _status: 'published' },
	})
})

afterAll(emptyBase)

/** `n` conditions on the slug, in one `or`, as a query string. */
const conditions = (n: number, prefixe = 'where[or]') =>
	Array.from({ length: n }, (_, i) => `${prefixe}[${i}][slug][equals]=slug-${i}`).join('&')

/** A REST read, with what a client sees of it. */
async function lire(chemin: string, lecteur: Lecteur = lecteurs.anonyme) {
	const { statut, corps, texte } = await callRest('GET', chemin, { enTetes: lecteur.enTetes })
	return {
		statut,
		corps: corps as { docs?: { id: number }[]; totalDocs?: number; errors?: { message: string }[] },
		texte,
	}
}

/** The calls the database receives while `faire` runs: none, for a request refused before it. */
async function appelsALaBase(faire: () => Promise<unknown>): Promise<number> {
	const db = payload.db as unknown as Record<string, unknown>
	const espionnees = ['find', 'findOne', 'count', 'queryDrafts', 'findDistinct', 'updateMany', 'deleteMany'] as const
	const originales = espionnees.map(nom => [nom, db[nom]] as const)
	let appels = 0
	for (const [nom, originale] of originales)
		if (typeof originale === 'function')
			db[nom] = (...args: unknown[]) => {
				appels += 1
				return (originale as (...a: unknown[]) => unknown).apply(payload.db, args)
			}
	try {
		await faire().catch(() => undefined)
	} finally {
		for (const [nom, originale] of originales) db[nom] = originale
	}
	return appels
}

describe('21 conditions : refus ; 20 : réponse (U60)', () => {
	test('par REST, pour l’anonyme, une maquilleuse et la rédaction, sur chaque collection publique', async () => {
		expect(CONDITIONS_MAX).toBe(20)
		for (const lecteur of [lecteurs.anonyme, lecteurs.maquilleuse, lecteurs.redaction])
			for (const collection of ['profiles', 'talents', 'articles'] as const) {
				const vingt = await lire(`/api/${collection}?${conditions(20)}`, lecteur)
				expect([lecteur.nom, collection, vingt.statut]).toEqual([lecteur.nom, collection, 200])
				const vingtEtUne = await lire(`/api/${collection}?${conditions(21)}`, lecteur)
				expect([lecteur.nom, collection, vingtEtUne.statut]).toEqual([lecteur.nom, collection, 400])
				expect(vingtEtUne.corps.errors?.[0]?.message).toBe(TOO_MANY_CONDITIONS_MESSAGE)
			}
	})

	test('les conditions se comptent dans les « et » et les « ou » imbriqués, et sur le décompte aussi', async () => {
		const imbriquees = (n: number) =>
			Array.from({ length: n }, (_, i) => `where[and][0][or][${i % 2}][and][${i}][slug][equals]=s-${i}`).join('&')
		expect((await lire(`/api/profiles?${imbriquees(20)}`)).statut).toBe(200)
		expect((await lire(`/api/profiles?${imbriquees(21)}`)).statut).toBe(400)
		// Two operators on one field are two conditions.
		const deuxParChamp = Array.from(
			{ length: 11 },
			(_, i) => `where[or][${i}][slug][equals]=s-${i}&where[or][${i}][slug][not_equals]=t-${i}`
		).join('&')
		expect((await lire(`/api/profiles?${deuxParChamp}`)).statut).toBe(400)
		expect((await lire(`/api/profiles/count?${conditions(21)}`)).statut).toBe(400)
		expect((await lire(`/api/profiles/count?${conditions(20)}`)).statut).toBe(200)
	})

	test('refusée avant la base : aucune requête ne part', async () => {
		expect(await appelsALaBase(() => lire(`/api/profiles?${conditions(21)}`))).toBe(0)
		expect(await appelsALaBase(() => lire(`/api/talents?${conditions(21)}`))).toBe(0)
		// The control: the same request with 20 conditions reaches the database.
		expect(await appelsALaBase(() => lire(`/api/profiles?${conditions(20)}`))).toBeGreaterThan(0)
	})

	test('par l’API locale avec les règles actives : de même ; le code du serveur, sans règles, n’est pas borné', async () => {
		const ou = (n: number): Where => ({ or: Array.from({ length: n }, (_, i) => ({ slug: { equals: `s-${i}` } })) })
		await expect(payload.find({ collection: 'profiles', overrideAccess: false, where: ou(21) })).rejects.toMatchObject({
			status: 400,
			message: TOO_MANY_CONDITIONS_MESSAGE,
		})
		expect((await payload.find({ collection: 'profiles', overrideAccess: false, where: ou(20) })).totalDocs).toBe(0)
		expect((await payload.find({ collection: 'profiles', where: ou(21) })).totalDocs).toBe(0)
	})

	test('un admin passe : la borne est celle de la lecture publique', async () => {
		expect((await lire(`/api/profiles?${conditions(21)}`, lecteurs.admin)).statut).toBe(200)
		expect((await lire(`/api/profiles?${conditions(60)}`, lecteurs.admin)).statut).toBe(200)
	})

	test('chaque collection porte la borne, en premier, celles que Payload ajoute lui-même comprises', () => {
		for (const { config } of Object.values(payload.collections)) {
			expect([config.slug, config.hooks.beforeOperation[0]]).toEqual([config.slug, boundedQuery])
			expect(config.hooks.beforeOperation.filter(crochet => crochet === boundedQuery)).toHaveLength(1)
		}
		expect(Object.keys(payload.collections)).toEqual(
			expect.arrayContaining([
				'admins',
				'pros',
				'profiles',
				'media',
				'talents',
				'articles',
				'payload-locked-documents',
				'payload-preferences',
			] satisfies CollectionSlug[])
		)
	})

	test('les verrous des documents, réservés aux comptes de l’administration : bornés eux aussi', async () => {
		const verrous = '/api/payload-locked-documents'
		const surLId = (n: number) => Array.from({ length: n }, (_, i) => `where[or][${i}][id][equals]=${i + 1}`).join('&')
		// A makeup artist no longer reaches the locks (ticket 094): 403 within the bound; above it the
		// bound answers first, as it runs before the access rules.
		expect((await lire(`${verrous}?${surLId(20)}`, lecteurs.maquilleuse)).statut).toBe(403)
		expect((await lire(`${verrous}?${surLId(21)}`, lecteurs.maquilleuse)).statut).toBe(400)
		// The newsroom is bounded, like the public; the role `admin` is not.
		expect((await lire(`${verrous}?${surLId(20)}`, lecteurs.redaction)).statut).toBe(200)
		const refus = await lire(`${verrous}?${surLId(21)}`, lecteurs.redaction)
		expect(refus.statut).toBe(400)
		expect(refus.corps.errors?.[0]?.message).toBe(TOO_MANY_CONDITIONS_MESSAGE)
		expect((await lire(`${verrous}?${surLId(30)}`, lecteurs.admin)).statut).toBe(200)
	})
})

describe('Filtre anonyme sur email, hash ou sessions, même par relation : refus (U60)', () => {
	test('par la relation du profil à son compte, ou de la photo à sa propriétaire : refusé, sans rien dire', async () => {
		for (const chemin of [
			'pro.email',
			'pro.hash',
			'pro.salt',
			'pro.sessions.id',
			'pro.legacyBcrypt',
			'pro.resetPasswordToken',
		]) {
			const vise = await lire(`/api/profiles?where[${chemin}][equals]=${encodeURIComponent(a.email)}`)
			const autre = await lire(`/api/profiles?where[${chemin}][equals]=personne%40example.test`)
			expect([chemin, vise.statut]).toEqual([chemin, 400])
			// The same answer whether the value matches or not: nothing to learn from it.
			expect(vise.texte).toBe(autre.texte)
			expect(vise.texte).not.toContain(a.email)
		}
		expect((await lire(`/api/profiles?where[pro.sessions.expiresAt][exists]=true`)).statut).toBe(400)
		expect((await lire(`/api/media?where[owner.email][equals]=${encodeURIComponent(a.email)}`)).statut).toBe(400)
		// Through the gallery: a filter nested in a photo of the profile.
		expect(
			(await lire(`/api/profiles?where[galerie][contains][owner.email][equals]=${encodeURIComponent(a.email)}`)).statut
		).toBe(400)
		expect((await lire(`/api/pros?where[email][equals]=${encodeURIComponent(a.email)}`)).statut).toBe(400)
	})

	test('un tri sur l’un d’eux : refusé de même', async () => {
		for (const tri of ['pro.email', '-pro.email', 'pro.hash', 'title,pro.sessions.id'])
			expect([tri, (await lire(`/api/profiles?sort=${tri}`)).statut]).toEqual([tri, 400])
	})

	test('une maquilleuse ne filtre ni ne trie son propre compte sur son hash, son sel ou ses sessions', async () => {
		const sienne = { nom: 'A', enTetes: a.session.enTetes }
		for (const requete of [
			'where[hash][exists]=true',
			'where[salt][exists]=true',
			'where[sessions.id][exists]=true',
			'where[legacyBcrypt][exists]=false',
			'sort=hash',
			'sort=-sessions.expiresAt',
		])
			expect([requete, (await lire(`/api/pros?${requete}`, sienne)).statut]).toEqual([requete, 400])
	})

	test('un admin non plus : les secrets d’un compte ne servent jamais de filtre ; son email, oui', async () => {
		for (const requete of [
			'where[hash][exists]=true',
			'where[salt][like]=a',
			'where[sessions.id][exists]=true',
			'where[legacyBcrypt][exists]=true',
			'sort=hash',
		])
			expect([requete, (await lire(`/api/pros?${requete}`, lecteurs.admin)).statut]).toEqual([requete, 400])
		const parEmail = await lire(`/api/pros?where[email][equals]=${encodeURIComponent(a.email)}`, lecteurs.admin)
		expect([parEmail.statut, parEmail.corps.docs?.map(({ id }) => id)]).toEqual([200, [Number(a.id)]])
	})
})

describe('Filtre ou tri sur coordonnées, note interne ou score : refus sans fuite ; un admin passe', () => {
	/** Each filter twice: on the stored value, and on a value nobody has. */
	const FILTRES: [string, string, string][] = [
		['contactDetails.phone', PRIVE_DE_A.telephone, '01 00 00 00 00'],
		['contactDetails.email', PRIVE_DE_A.email, 'personne@example.test'],
		['internalNote', PRIVE_DE_A.note, 'Aucune note'],
		['score', '4.5', '1'],
	]

	test('l’anonyme, une maquilleuse, la rédaction : refusés, la même réponse que la valeur existe ou non', async () => {
		for (const lecteur of [lecteurs.anonyme, lecteurs.maquilleuse, lecteurs.redaction])
			for (const [champ, existe, absente] of FILTRES)
				for (const operateur of ['equals', 'like']) {
					const vise = await lire(`/api/profiles?where[${champ}][${operateur}]=${encodeURIComponent(existe)}`, lecteur)
					const autre = await lire(
						`/api/profiles?where[${champ}][${operateur}]=${encodeURIComponent(absente)}`,
						lecteur
					)
					expect([lecteur.nom, champ, operateur, vise.statut]).toEqual([lecteur.nom, champ, operateur, 400])
					expect(vise.texte).toBe(autre.texte)
					expect(vise.corps.errors?.[0]?.message).toBe(PRIVATE_FIELD_MESSAGE)
					for (const valeur of Object.values(PRIVE_DE_A)) expect(vise.texte).not.toContain(valeur)
				}
	})

	test('un tri sur le score ou les coordonnées : refusé, rien de l’ordre ne sort', async () => {
		for (const lecteur of [lecteurs.anonyme, lecteurs.maquilleuse, lecteurs.redaction])
			for (const tri of ['score', '-score', 'contactDetails.phone', 'internalNote', 'slug,-score'])
				expect([lecteur.nom, tri, (await lire(`/api/profiles?sort=${tri}`, lecteur)).statut]).toEqual([
					lecteur.nom,
					tri,
					400,
				])
	})

	test('les autres champs privés du profil ne servent pas non plus de filtre ni de tri au public (Payload)', async () => {
		for (const champ of [
			'status',
			'reason',
			'verified',
			'siret',
			'pro',
			'strapiId',
			'legacyUsername',
			'publicContact',
		]) {
			expect([champ, (await lire(`/api/profiles?where[${champ}][exists]=true`)).statut]).toEqual([champ, 400])
			expect([champ, (await lire(`/api/profiles?sort=-${champ}`)).statut]).toEqual([champ, 400])
		}
	})

	test('par l’API locale avec les règles actives : de même', async () => {
		await expect(
			payload.find({ collection: 'profiles', overrideAccess: false, where: { score: { greater_than: 3 } } })
		).rejects.toMatchObject({ status: 400 })
		await expect(payload.find({ collection: 'profiles', overrideAccess: false, sort: '-score' })).rejects.toMatchObject(
			{
				status: 400,
			}
		)
	})

	test('un admin filtre et trie sur eux', async () => {
		const idsDe = async (chemin: string) => (await lire(chemin, lecteurs.admin)).corps.docs?.map(({ id }) => id)
		expect(await idsDe('/api/profiles?where[score][greater_than]=3')).toEqual([profilA])
		expect(await idsDe('/api/profiles?sort=-score&where[score][exists]=true')).toEqual([profilA, profilB])
		expect(await idsDe('/api/profiles?sort=score&where[score][exists]=true')).toEqual([profilB, profilA])
		expect(
			await idsDe(`/api/profiles?where[contactDetails.phone][equals]=${encodeURIComponent(PRIVE_DE_A.telephone)}`)
		).toEqual([profilA])
		expect(await idsDe('/api/profiles?where[internalNote][like]=fictive')).toEqual([profilA])
	})
})

describe('Un identifiant qu’aucun document ne peut porter : refusé avant la base, jamais une erreur 500', () => {
	const IMPOSSIBLES = ['abc', '1e999', '99999999999', '1.5']

	test('lire un compte, un talent ou un article par cet identifiant : 403 pour chacun', async () => {
		for (const lecteur of [lecteurs.anonyme, lecteurs.maquilleuse, lecteurs.redaction, lecteurs.admin])
			for (const collection of ['pros', 'admins', 'talents', 'articles'])
				for (const id of IMPOSSIBLES)
					expect([lecteur.nom, collection, id, (await lire(`/api/${collection}/${id}`, lecteur)).statut]).toEqual([
						lecteur.nom,
						collection,
						id,
						403,
					])
	})

	test('modifier ou supprimer par cet identifiant : refusé (403), ou par Payload lui-même (400) quand il n’y lit aucun nombre', async () => {
		const ecrivains = [lecteurs.maquilleuse, lecteurs.redaction, lecteurs.admin]
		for (const lecteur of ecrivains)
			for (const collection of ['profiles', 'pros', 'admins', 'talents', 'articles'])
				for (const id of IMPOSSIBLES) {
					const modification = await callRest('PATCH', `/api/${collection}/${id}`, {
						enTetes: lecteur.enTetes,
						corps: { title: 'Titre fictif' },
					})
					const suppression = await callRest('DELETE', `/api/${collection}/${id}`, { enTetes: lecteur.enTetes })
					for (const { statut } of [modification, suppression])
						expect([lecteur.nom, collection, id, [400, 403].includes(statut)]).toEqual([
							lecteur.nom,
							collection,
							id,
							true,
						])
				}
	})
})

describe('Le champ « profil » des comptes (une jointure) dans une adresse saisie à la main : jamais une erreur 500 (ticket 224)', () => {
	test('un admin le filtre (200) ; tout autre lecteur est refusé (400 ou 403), jamais 500', async () => {
		const chemin = '/api/pros?where[profile][exists]=true'

		expect((await lire(chemin, lecteurs.admin)).statut).toBe(200)
		for (const lecteur of [lecteurs.anonyme, lecteurs.maquilleuse, lecteurs.redaction])
			expect([lecteur.nom, [400, 403].includes((await lire(chemin, lecteur)).statut)]).toEqual([lecteur.nom, true])
	})
})
