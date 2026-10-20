import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Profiles } from '../../src/collections/Profiles'
import { DEMO_PROFILES } from '../../src/demo-data/profiles'
import { poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'

/**
 * Tickets 165 and 166 (plan 01 §3.4, plan 02 §7.4): the admin finds a profile in the list with the
 * filters of the panel, which are the `where` of the REST API; the sort by last activity is right; a
 * value that is not a choice is refused with a message. The admin hides a profile from its sheet
 * (`chosenStatus`), and publishing it again brings it back; the editorial role changes no status.
 * The twelve profiles of the set of the bench are the base: their expected state is in
 * src/demo-data/profiles.ts.
 */

const remettreAZero = () => Promise.all([viderLaBase(), viderLeStockage()])

beforeAll(async () => {
	await remettreAZero()
	await poserLeJeuDuBanc()
}, 60_000)

afterAll(remettreAZero)

interface Liste {
	totalDocs: number
	docs: { id: number; slug: string; status: string; updatedAt: string }[]
}

/** The twelve profiles of the set, among the profiles of the fixed accounts: the way the panel counts them. */
const DU_JEU = 'where[and][0][pro.email][like]=jeu-profil-'

/** The list of profiles the admin panel asks for, with one `where` clause on the profiles of the set. */
async function lister(enTetes: Record<string, string>, requete: string) {
	const reponse = await appelerRest(
		'GET',
		`/api/profiles?limit=50&depth=0&${DU_JEU}&${requete.replace(/^where\[/, 'where[and][1][')}`,
		{
			enTetes,
		}
	)
	return { statut: reponse.statut, liste: reponse.corps as Liste, texte: reponse.texte }
}

/** The slugs the set expects for a filter on the expected state. */
const attendus = (garde: (profil: (typeof DEMO_PROFILES)[number]) => boolean) =>
	DEMO_PROFILES.filter(garde)
		.map(({ attendu }) => attendu.slug)
		.sort()

describe('La liste des profils de l’admin (ticket 165)', () => {
	test('la liste montre l’adresse, la commune, la complétude, le caractère publiable, le statut et la dernière activité, la plus récente d’abord', () => {
		expect(Profiles.admin?.defaultColumns).toEqual([
			'slug',
			'city.name',
			'completeness',
			'publishable',
			'status',
			'updatedAt',
		])
		expect(Profiles.defaultSort).toBe('-updatedAt')
	})

	test('chaque filtre rend le nombre attendu sur les 12 profils du banc', async () => {
		const admin = await creerCompte('admin')
		const { enTetes } = admin.session

		const tous = await lister(enTetes, 'sort=slug')
		expect(tous.liste.totalDocs).toBe(12)

		const cas: [string, string, string[]][] = [
			['non publiables', 'where[publishable][equals]=false', attendus(p => !p.attendu.publishable)],
			['publiables', 'where[publishable][equals]=true', attendus(p => p.attendu.publishable)],
			['vides', 'where[fullyEmpty][equals]=true', attendus(p => p.attendu.fullyEmpty)],
			['draft', 'where[status][equals]=draft', attendus(p => p.attendu.status === 'draft')],
			['publié', 'where[status][equals]=published', attendus(p => p.attendu.status === 'published')],
			['masqué', 'where[status][equals]=hidden', attendus(p => p.attendu.status === 'hidden')],
		]
		for (const [nom, requete, slugs] of cas) {
			const { statut, liste } = await lister(enTetes, requete)
			expect({ nom, statut, slugs: liste.docs.map(({ slug }) => slug).sort() }).toEqual({ nom, statut: 200, slugs })
		}
		// The set holds at least one profile of each of these, so that no filter passes by being empty.
		for (const [, , slugs] of cas) expect(slugs.length).toBeGreaterThan(0)
		// The three statuses cover the twelve profiles.
		const parStatut = await Promise.all(
			['draft', 'published', 'hidden'].map(
				async s => (await lister(enTetes, `where[status][equals]=${s}`)).liste.totalDocs
			)
		)
		expect(parStatut.reduce((a, b) => a + b, 0)).toBe(12)
	}, 30_000)

	test('la recherche du panneau retrouve un profil par son adresse ou sa commune', async () => {
		const admin = await creerCompte('admin')
		const { enTetes } = admin.session
		const reference = DEMO_PROFILES.find(({ cle }) => cle === 'reference')
		if (!reference) throw new Error('Le jeu n’a pas de profil de référence.')

		const parAdresse = await lister(enTetes, `where[slug][like]=${reference.attendu.slug}`)
		expect(parAdresse.liste.docs.map(({ slug }) => slug)).toEqual([reference.attendu.slug])
		const communes = await lister(enTetes, 'where[city.name][like]=Nantes')
		expect(communes.liste.totalDocs).toBeGreaterThan(0)
		expect(communes.liste.totalDocs).toBeLessThan(12)
	})

	test('le tri par dernière activité est juste, dans les deux sens, et un profil qu’on corrige remonte', async () => {
		const admin = await creerCompte('admin')
		const { enTetes } = admin.session

		const recentes = (await lister(enTetes, 'sort=-updatedAt')).liste.docs
		const anciennes = (await lister(enTetes, 'sort=updatedAt')).liste.docs
		const dates = recentes.map(({ updatedAt }) => Date.parse(updatedAt))
		expect(dates).toEqual([...dates].sort((a, b) => b - a))
		expect(anciennes.map(({ id }) => id)).toEqual(recentes.map(({ id }) => id).reverse())

		// She who is corrected is the oldest one: after the correction, she is the first.
		const derniere = recentes.at(-1)
		if (!derniere) throw new Error('La liste est vide.')
		const correction = await appelerRest('PATCH', `/api/profiles/${derniere.id}`, {
			enTetes,
			corps: { internalNote: 'Corrigé par l’admin.' },
		})
		expect(correction.statut).toBe(200)
		const apres = (await lister(enTetes, 'sort=-updatedAt')).liste.docs
		expect(apres[0]?.id).toBe(derniere.id)
	}, 30_000)

	test('une valeur qui n’est pas un choix est refusée avec un message, sur la fiche et dans le filtre', async () => {
		const admin = await creerCompte('admin')
		const { enTetes } = admin.session
		const profil = (await lister(enTetes, 'sort=slug')).liste.docs[0]
		if (!profil) throw new Error('La liste est vide.')

		const payload = await payloadDeTest()
		const avant = await payload.findByID({ collection: 'profiles', id: profil.id, depth: 0 })
		const refus = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
			enTetes,
			corps: { chosenStatus: 'archive' },
		})
		expect(refus.statut).toBe(400)
		expect(refus.texte).toContain('chosenStatus')
		expect(refus.texte).toContain('Ce statut n’existe pas')
		const apres = await payload.findByID({ collection: 'profiles', id: profil.id, depth: 0 })
		expect([apres.chosenStatus, apres.status]).toEqual([avant.chosenStatus, avant.status])

		// The filter on a status nobody holds is refused with a sentence, not a 500 of the database.
		const filtre = await lister(enTetes, 'where[status][equals]=archive')
		expect(filtre.statut).toBe(400)
		expect(filtre.texte).toContain('statut qui n’existe pas')
		const dansOu = await appelerRest('GET', '/api/profiles?where[or][0][status][in]=published,archive', { enTetes })
		expect(dansOu.statut).toBe(400)
	})
})

describe('Masquer un profil depuis sa fiche (ticket 166)', () => {
	/** The slug of the profile of the set that is published and publishable: the reference one. */
	const reference = () => {
		const profil = DEMO_PROFILES.find(({ cle }) => cle === 'reference')
		if (!profil) throw new Error('Le jeu n’a pas de profil de référence.')
		return profil.attendu.slug
	}

	/** What an anonymous visitor reads: the public list of profiles, by slug. */
	const lusParLePublic = async (slug: string) =>
		(
			(await appelerRest('GET', `/api/profiles?depth=0&where[slug][equals]=${slug}`)).corps as {
				docs: { slug: string }[]
			}
		).docs.map(d => d.slug)

	test('masqué, le profil n’est plus lu par le public ; republié, il revient publiable', async () => {
		const admin = await creerCompte('admin')
		const { enTetes } = admin.session
		const slug = reference()
		const id = (await lister(enTetes, `where[slug][equals]=${slug}`)).liste.docs[0]?.id ?? 0
		expect(await lusParLePublic(slug)).toEqual([slug])

		const masque = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes,
			corps: { chosenStatus: 'hidden', reason: 'Essai de modération.' },
		})
		expect(masque.statut).toBe(200)
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'profiles', id, depth: 0 })).status).toBe('hidden')
		expect(await lusParLePublic(slug)).toEqual([])

		const republie = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes,
			corps: { chosenStatus: 'automatic' },
		})
		expect(republie.statut).toBe(200)
		const revenu = await payload.findByID({ collection: 'profiles', id, depth: 0 })
		expect([revenu.status, revenu.publishable]).toEqual(['published', true])
		expect(await lusParLePublic(slug)).toEqual([slug])
	}, 30_000)

	test('la rédaction ne change pas le statut d’un profil', async () => {
		const [redaction, admin] = await Promise.all([creerCompte('redaction'), creerCompte('admin')])
		const slug = reference()
		const id = (await lister(admin.session.enTetes, `where[slug][equals]=${slug}`)).liste.docs[0]?.id ?? 0

		const reponse = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: redaction.session.enTetes,
			corps: { chosenStatus: 'hidden' },
		})
		expect(reponse.statut).toBeGreaterThanOrEqual(400)
		const apres = await (await payloadDeTest()).findByID({ collection: 'profiles', id, depth: 0 })
		expect([apres.chosenStatus, apres.status]).toEqual(['automatic', 'published'])
	})
})
