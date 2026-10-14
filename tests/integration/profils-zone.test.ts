import { afterEach, describe, expect, test } from 'bun:test'
import { ValidationError } from 'payload'
import { CONTEXTE_SANS_PROFIL } from '@/collections/Profils'
import { MESSAGES_DE_LA_ZONE } from '@/lib/profil/zone'
import { type CompteDeTest, creerCompte, motDePasseAleatoire } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The zone of a profile (ticket 041): a commune with its INSEE code, a radius and « à domicile »,
 * written by the makeup artist through REST as her space will, and by the server as the import
 * will. Communes are public reference data: Annecy, Ajaccio, Lyon and Saint-Barthélemy are real,
 * nothing else is (the street of an address is invented).
 */

afterEach(viderLaBase)

const ANNECY = { nom: 'Annecy', codeInsee: '74010', latitude: 45.8992, longitude: 6.1294 } as const
/** Annecy as the server stores it: its département, and the coordinates of its centre to about 1 km. */
const ANNECY_STOCKEE = { ...ANNECY, departement: '74', latitude: 45.9, longitude: 6.13 } as const
const COMMUNE_VIDE = { nom: null, codeInsee: null, departement: null, latitude: null, longitude: null } as const

type Maquilleuse = CompteDeTest<'maquilleuse'>

/** A makeup artist of the factory, with the identifier of the profile her account received. */
async function maquilleuseEtSonProfil(): Promise<{ compte: Maquilleuse; profil: number }> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'profils',
		depth: 0,
		limit: 1,
		where: { pro: { equals: compte.id } },
	})
	const profil = docs[0]?.id
	if (profil === undefined) throw new Error('La fabrique n’a pas créé le profil de la maquilleuse.')
	return { compte, profil }
}

/** She changes her own profile through REST. */
const modifier = (compte: Maquilleuse, profil: number, corps: Record<string, unknown>) =>
	appelerRest('PATCH', `/api/profils/${profil}?depth=0`, { enTetes: compte.session.enTetes, corps })

/** The zone as the database holds it, read without access control. */
async function zoneStockee(profil: number) {
	const payload = await payloadDeTest()
	const { commune, rayonKm, aDomicile } = await payload.findByID({ collection: 'profils', depth: 0, id: profil })
	return { commune, rayonKm, aDomicile }
}

/** What a REST refusal says, field by field. */
function champsRefuses(corps: unknown): { path: string; message: string }[] {
	const { errors = [] } = corps as { errors?: { data?: { errors?: { path: string; message: string }[] } }[] }
	return errors.flatMap(({ data }) => data?.errors ?? []).map(({ path, message }) => ({ path, message }))
}

describe('La zone enregistrée se relit telle quelle', () => {
	test('commune, rayon de 30 km et « à domicile », enregistrés par la maquilleuse puis relus', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const enregistre = await modifier(compte, profil, { commune: ANNECY, rayonKm: 30, aDomicile: true })
		expect(enregistre.statut).toBe(200)

		const attendu = { commune: ANNECY_STOCKEE, rayonKm: 30, aDomicile: true }
		const relu = await appelerRest('GET', `/api/profils/${profil}?depth=0`, { enTetes: compte.session.enTetes })
		expect(relu.statut).toBe(200)
		expect(relu.corps).toMatchObject(attendu)
		expect(await zoneStockee(profil)).toEqual(attendu)
	})

	test('une sauvegarde d’un autre champ laisse la zone telle quelle', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY, rayonKm: 30, aDomicile: false })

		expect((await modifier(compte, profil, { prenom: 'Léa' })).statut).toBe(200)

		expect(await zoneStockee(profil)).toEqual({ commune: ANNECY_STOCKEE, rayonKm: 30, aDomicile: false })
	})

	test('un profil créé avec son compte n’a pas encore de zone : rien n’est supposé', async () => {
		const { profil } = await maquilleuseEtSonProfil()

		expect(await zoneStockee(profil)).toEqual({ commune: COMMUNE_VIDE, rayonKm: null, aDomicile: null })
	})

	test('le département est calculé par le serveur depuis le code INSEE, quoi que la requête envoie', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const ajaccio = { nom: 'Ajaccio', codeInsee: ' 2a004 ', departement: '13', latitude: 41.9192, longitude: 8.7386 }
		expect((await modifier(compte, profil, { commune: ajaccio })).statut).toBe(200)
		expect((await zoneStockee(profil)).commune).toEqual({
			...ajaccio,
			codeInsee: '2A004',
			departement: '2A',
			latitude: 41.92,
			longitude: 8.74,
		})

		expect((await modifier(compte, profil, { commune: { ...ANNECY, departement: '2A' } })).statut).toBe(200)
		expect((await zoneStockee(profil)).commune).toEqual(ANNECY_STOCKEE)
	})

	test('toute la France : une commune d’une collectivité d’outre-mer de la liste officielle est acceptée', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const saintBarthelemy = { nom: 'Saint-Barthélemy', codeInsee: '97701', latitude: 17.9, longitude: -62.83 }
		expect((await modifier(compte, profil, { commune: saintBarthelemy })).statut).toBe(200)
		expect((await zoneStockee(profil)).commune).toEqual({ ...saintBarthelemy, departement: '977' })
	})

	test('vider la commune, champ par champ ou d’un coup, vide aussi son département', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		for (const vide of [{ ...COMMUNE_VIDE, departement: '74' }, null]) {
			await modifier(compte, profil, { commune: ANNECY, rayonKm: 30 })
			expect((await modifier(compte, profil, { commune: vide })).statut, JSON.stringify(vide)).toBe(200)
			expect(await zoneStockee(profil), JSON.stringify(vide)).toEqual({
				commune: COMMUNE_VIDE,
				rayonKm: 30,
				aDomicile: null,
			})
		}
	})
})

describe('Une zone mal formée est refusée en français, et rien ne change', () => {
	test('rayon hors bornes ou décimal : refusé ; 0 et 200 km acceptés', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY, rayonKm: 30 })
		const avant = await zoneStockee(profil)

		for (const rayonKm of [201, -1, 12.5, 1000]) {
			const refus = await modifier(compte, profil, { rayonKm })
			expect(refus.statut, String(rayonKm)).toBe(400)
			expect(champsRefuses(refus.corps), String(rayonKm)).toEqual([
				{ path: 'rayonKm', message: MESSAGES_DE_LA_ZONE.rayon },
			])
		}
		expect(await zoneStockee(profil)).toEqual(avant)

		for (const rayonKm of [0, 200]) {
			expect((await modifier(compte, profil, { rayonKm })).statut, String(rayonKm)).toBe(200)
			expect((await zoneStockee(profil)).rayonKm).toBe(rayonKm)
		}
	})

	test('code INSEE mal formé : refusé', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY })
		const avant = await zoneStockee(profil)

		for (const codeInsee of ['7401', '740100', '20004', 'ABCDE', '97001', '98501']) {
			const refus = await modifier(compte, profil, { commune: { ...ANNECY, codeInsee } })
			expect(refus.statut, codeInsee).toBe(400)
			expect(champsRefuses(refus.corps), codeInsee).toEqual([
				{ path: 'commune.codeInsee', message: MESSAGES_DE_LA_ZONE.codeInseeMalForme },
			])
		}
		expect(await zoneStockee(profil)).toEqual(avant)
	})

	test('commune sans code INSEE : refusée, qu’elle soit nouvelle ou qu’on retire son code', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const nouvelle = await modifier(compte, profil, { commune: { nom: 'Annecy' } })
		expect(nouvelle.statut).toBe(400)
		expect(champsRefuses(nouvelle.corps)).toEqual([
			{ path: 'commune.codeInsee', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		expect((await zoneStockee(profil)).commune).toEqual(COMMUNE_VIDE)

		await modifier(compte, profil, { commune: ANNECY })
		const sansCode = await modifier(compte, profil, { commune: { ...ANNECY, codeInsee: '' } })
		expect(sansCode.statut).toBe(400)
		expect(champsRefuses(sansCode.corps)).toEqual([
			{ path: 'commune.codeInsee', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		expect((await zoneStockee(profil)).commune).toEqual(ANNECY_STOCKEE)
	})

	test('une ville en texte libre, comme sur l’ancien site, n’est pas une commune : refusée', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const ville = await modifier(compte, profil, { commune: 'Annecy' })
		expect(ville.statut).toBe(400)
		expect(champsRefuses(ville.corps)).toEqual([
			{ path: 'commune.codeInsee', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])

		const adresse = await modifier(compte, profil, { commune: '12 rue des Lilas, 74000 Annecy' })
		expect(adresse.statut).toBe(400)
		expect(champsRefuses(adresse.corps)).toEqual([
			{ path: 'commune.nom', message: MESSAGES_DE_LA_ZONE.nomAdresse },
			{ path: 'commune.codeInsee', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		expect((await zoneStockee(profil)).commune).toEqual(COMMUNE_VIDE)
	})

	test('une commune envoyée en liste est refusée, et son département reste celui de son code', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY })

		for (const commune of [[], ['Annecy'], [ANNECY]]) {
			const refus = await modifier(compte, profil, { commune })
			expect(refus.statut, JSON.stringify(commune)).toBe(400)
			expect(champsRefuses(refus.corps), JSON.stringify(commune)).toEqual([
				{ path: 'commune', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
			])
			expect((await zoneStockee(profil)).commune, JSON.stringify(commune)).toEqual(ANNECY_STOCKEE)
		}

		// The import's path, the local API, is held by the same rule.
		const payload = await payloadDeTest()
		const parLeServeur = await payload
			.update({ collection: 'profils', id: profil, data: { commune: [] as never } })
			.catch((erreur: unknown) => erreur)
		expect(parLeServeur).toBeInstanceOf(ValidationError)
		expect((await zoneStockee(profil)).commune).toEqual(ANNECY_STOCKEE)
	})

	test('la commune s’envoie entière : un nom sans son code, ou un code sans son nom, est refusé même quand l’autre est enregistré', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY })

		const nomSeul = await modifier(compte, profil, { commune: { nom: 'Lyon' } })
		expect(nomSeul.statut).toBe(400)
		expect(champsRefuses(nomSeul.corps)).toEqual([
			{ path: 'commune.codeInsee', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		const codeSeul = await modifier(compte, profil, { commune: { codeInsee: '69123' } })
		expect(codeSeul.statut).toBe(400)
		expect(champsRefuses(codeSeul.corps)).toEqual([
			{ path: 'commune.nom', message: MESSAGES_DE_LA_ZONE.codeInseeSansNom },
		])
		expect((await zoneStockee(profil)).commune).toEqual(ANNECY_STOCKEE)

		// A new commune without coordinates does not keep those of the former one.
		expect((await modifier(compte, profil, { commune: { nom: 'Lyon', codeInsee: '69123' } })).statut).toBe(200)
		expect((await zoneStockee(profil)).commune).toEqual({
			nom: 'Lyon',
			codeInsee: '69123',
			departement: '69',
			latitude: null,
			longitude: null,
		})
	})

	test('un nom qui ressemble à une adresse est refusé, même avec un code INSEE bien formé', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY })

		for (const nom of ['12 rue des Lilas, 74000 Annecy', 'rue des Lilas', 'Annecy 74000']) {
			const refus = await modifier(compte, profil, { commune: { ...ANNECY, nom } })
			expect(refus.statut, nom).toBe(400)
			expect(champsRefuses(refus.corps), nom).toEqual([
				{ path: 'commune.nom', message: MESSAGES_DE_LA_ZONE.nomAdresse },
			])
		}
		expect((await zoneStockee(profil)).commune).toEqual(ANNECY_STOCKEE)
	})

	test('un nom fait d’autres caractères que ceux d’un nom de commune est refusé : un email, un site, un symbole', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY })

		for (const nom of ['moi@exemple.test', 'www.site-fictif.test', 'St. Gervais', 'Annecy & alentours']) {
			const refus = await modifier(compte, profil, { commune: { ...ANNECY, nom } })
			expect(refus.statut, nom).toBe(400)
			expect(champsRefuses(refus.corps), nom).toEqual([
				{ path: 'commune.nom', message: MESSAGES_DE_LA_ZONE.nomCaracteres },
			])
		}
		expect((await zoneStockee(profil)).commune).toEqual(ANNECY_STOCKEE)
		// Its form only: whether the name is the one of its code, the list of the space and of the import says it.
		expect((await modifier(compte, profil, { commune: { ...ANNECY, nom: 'Lyon' } })).statut).toBe(200)
	})

	test('le serveur aussi est tenu par les bornes : l’import d’un rayon de 400 km est refusé, jamais ramené à 200', async () => {
		const payload = await payloadDeTest()
		const compte = await payload.create({
			collection: 'pros',
			data: { email: `zone-${crypto.randomUUID()}@example.test`, password: motDePasseAleatoire(), _verified: true },
			context: CONTEXTE_SANS_PROFIL,
			disableVerificationEmail: true,
		})

		const refus = await payload
			.create({ collection: 'profils', data: { pro: compte.id, slug: 'zone-importee', rayonKm: 400 } })
			.catch((erreur: unknown) => erreur)
		expect(refus).toBeInstanceOf(ValidationError)
		expect((refus as ValidationError).data.errors).toEqual([
			expect.objectContaining({ path: 'rayonKm', message: MESSAGES_DE_LA_ZONE.rayon }),
		])
		expect((await payload.count({ collection: 'profils' })).totalDocs).toBe(0)

		const importe = await payload.create({
			collection: 'profils',
			data: { pro: compte.id, slug: 'zone-importee', commune: ANNECY, rayonKm: 30 },
		})
		expect(importe).toMatchObject({ commune: ANNECY_STOCKEE, rayonKm: 30, aDomicile: null })
	})
})

describe('Les coordonnées de la commune sont celles de son centre, à environ 1 km près', () => {
	test('envoyées au huitième de décimale, elles sont gardées à deux, et le public ne lit que celles-là', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const precises = { ...ANNECY, latitude: 48.85341234, longitude: 2.34881234 }
		expect((await modifier(compte, profil, { commune: precises })).statut).toBe(200)

		const arrondies = { latitude: 48.85, longitude: 2.35 }
		expect((await zoneStockee(profil)).commune).toMatchObject(arrondies)
		// With a commune, the profile is published (ticket 044): what the public reads.
		const publique = await appelerRest('GET', `/api/profils/${profil}?depth=0`)
		expect(publique.statut).toBe(200)
		expect((publique.corps as { commune: unknown }).commune).toMatchObject(arrondies)
	})

	test('le serveur aussi les arrondit : l’import d’un centre au mètre près', async () => {
		const { profil } = await maquilleuseEtSonProfil()
		const payload = await payloadDeTest()

		await payload.update({ collection: 'profils', id: profil, data: { commune: { ...ANNECY, latitude: 45.899247 } } })

		expect((await zoneStockee(profil)).commune).toEqual(ANNECY_STOCKEE)
	})
})

describe('Lecture anonyme : la commune et son département sortent avec le profil publié', () => {
	test('par REST et par l’API locale avec les règles actives, seul et en liste ; un brouillon ne sort pas', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const brouillon = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { commune: ANNECY, rayonKm: 30, aDomicile: true })
		await modifier(brouillon.compte, brouillon.profil, { commune: ANNECY })
		const payload = await payloadDeTest()
		// With a commune, the rule of ticket 044 publishes the first; an admin holds the other as a draft.
		await payload.update({ collection: 'profils', id: brouillon.profil, data: { statutChoisi: 'brouillon' } })

		const attendu = { commune: ANNECY_STOCKEE, rayonKm: 30, aDomicile: true }
		const seul = await appelerRest('GET', `/api/profils/${profil}?depth=0`)
		expect(seul.statut).toBe(200)
		expect(seul.corps).toMatchObject(attendu)
		const liste = (await appelerRest('GET', '/api/profils?depth=0')).corps as { docs: { id: number }[] }
		const locale = await payload.find({ collection: 'profils', depth: 0, overrideAccess: false })
		for (const docs of [liste.docs, locale.docs]) {
			expect(docs.map(({ id }) => id)).toEqual([profil])
			expect(docs[0]).toMatchObject(attendu)
		}

		expect((await appelerRest('GET', `/api/profils/${brouillon.profil}`)).statut).toBe(404)
	})
})
