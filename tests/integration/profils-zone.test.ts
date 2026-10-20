import { afterEach, describe, expect, test } from 'bun:test'
import { ValidationError } from 'payload'
import { CONTEXTE_SANS_PROFIL } from '@/collections/Profiles'
import { MESSAGES_DE_LA_ZONE } from '@/lib/profile/zone'
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

const ANNECY = { name: 'Annecy', inseeCode: '74010', latitude: 45.8992, longitude: 6.1294 } as const
/** Annecy as the server stores it: its département, and the coordinates of its centre to about 1 km. */
const ANNECY_STOCKEE = { ...ANNECY, department: '74', latitude: 45.9, longitude: 6.13 } as const
const COMMUNE_VIDE = { name: null, inseeCode: null, department: null, latitude: null, longitude: null } as const

type Maquilleuse = CompteDeTest<'maquilleuse'>

/** A makeup artist of the factory, with the identifier of the profile her account received. */
async function maquilleuseEtSonProfil(): Promise<{ compte: Maquilleuse; profil: number }> {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'profiles',
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
	appelerRest('PATCH', `/api/profiles/${profil}?depth=0`, { enTetes: compte.session.enTetes, corps })

/** The zone as the database holds it, read without access control. */
async function zoneStockee(profil: number) {
	const payload = await payloadDeTest()
	const { city, radiusKm, homeService } = await payload.findByID({ collection: 'profiles', depth: 0, id: profil })
	return { city, radiusKm, homeService }
}

/** What a REST refusal says, field by field. */
function champsRefuses(corps: unknown): { path: string; message: string }[] {
	const { errors = [] } = corps as { errors?: { data?: { errors?: { path: string; message: string }[] } }[] }
	return errors.flatMap(({ data }) => data?.errors ?? []).map(({ path, message }) => ({ path, message }))
}

describe('La zone enregistrée se relit telle quelle', () => {
	test('commune, rayon de 30 km et « à domicile », enregistrés par la maquilleuse puis relus', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const enregistre = await modifier(compte, profil, { city: ANNECY, radiusKm: 30, homeService: true })
		expect(enregistre.statut).toBe(200)

		const attendu = { city: ANNECY_STOCKEE, radiusKm: 30, homeService: true }
		const relu = await appelerRest('GET', `/api/profiles/${profil}?depth=0`, { enTetes: compte.session.enTetes })
		expect(relu.statut).toBe(200)
		expect(relu.corps).toMatchObject(attendu)
		expect(await zoneStockee(profil)).toEqual(attendu)
	})

	test('une sauvegarde d’un autre champ laisse la zone telle quelle', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY, radiusKm: 30, homeService: false })

		expect((await modifier(compte, profil, { firstName: 'Léa' })).statut).toBe(200)

		expect(await zoneStockee(profil)).toEqual({ city: ANNECY_STOCKEE, radiusKm: 30, homeService: false })
	})

	test('un profil créé avec son compte n’a pas encore de zone : rien n’est supposé', async () => {
		const { profil } = await maquilleuseEtSonProfil()

		expect(await zoneStockee(profil)).toEqual({ city: COMMUNE_VIDE, radiusKm: null, homeService: null })
	})

	test('le département est calculé par le serveur depuis le code INSEE, quoi que la requête envoie', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const ajaccio = { name: 'Ajaccio', inseeCode: ' 2a004 ', department: '13', latitude: 41.9192, longitude: 8.7386 }
		expect((await modifier(compte, profil, { city: ajaccio })).statut).toBe(200)
		expect((await zoneStockee(profil)).city).toEqual({
			...ajaccio,
			inseeCode: '2A004',
			department: '2A',
			latitude: 41.92,
			longitude: 8.74,
		})

		expect((await modifier(compte, profil, { city: { ...ANNECY, department: '2A' } })).statut).toBe(200)
		expect((await zoneStockee(profil)).city).toEqual(ANNECY_STOCKEE)
	})

	test('toute la France : une commune d’une collectivité d’outre-mer de la liste officielle est acceptée', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const saintBarthelemy = { name: 'Saint-Barthélemy', inseeCode: '97701', latitude: 17.9, longitude: -62.83 }
		expect((await modifier(compte, profil, { city: saintBarthelemy })).statut).toBe(200)
		expect((await zoneStockee(profil)).city).toEqual({ ...saintBarthelemy, department: '977' })
	})

	test('vider la commune, champ par champ ou d’un coup, vide aussi son département', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		for (const vide of [{ ...COMMUNE_VIDE, department: '74' }, null]) {
			await modifier(compte, profil, { city: ANNECY, radiusKm: 30 })
			expect((await modifier(compte, profil, { city: vide })).statut, JSON.stringify(vide)).toBe(200)
			expect(await zoneStockee(profil), JSON.stringify(vide)).toEqual({
				city: COMMUNE_VIDE,
				radiusKm: 30,
				homeService: null,
			})
		}
	})
})

describe('Une zone mal formée est refusée en français, et rien ne change', () => {
	test('rayon hors bornes ou décimal : refusé ; 0 et 200 km acceptés', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY, radiusKm: 30 })
		const avant = await zoneStockee(profil)

		for (const radiusKm of [201, -1, 12.5, 1000]) {
			const refus = await modifier(compte, profil, { radiusKm })
			expect(refus.statut, String(radiusKm)).toBe(400)
			expect(champsRefuses(refus.corps), String(radiusKm)).toEqual([
				{ path: 'radiusKm', message: MESSAGES_DE_LA_ZONE.rayon },
			])
		}
		expect(await zoneStockee(profil)).toEqual(avant)

		for (const radiusKm of [0, 200]) {
			expect((await modifier(compte, profil, { radiusKm })).statut, String(radiusKm)).toBe(200)
			expect((await zoneStockee(profil)).radiusKm).toBe(radiusKm)
		}
	})

	test('code INSEE mal formé : refusé', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY })
		const avant = await zoneStockee(profil)

		for (const codeInsee of ['7401', '740100', '20004', 'ABCDE', '97001', '98501']) {
			const refus = await modifier(compte, profil, { city: { ...ANNECY, inseeCode: codeInsee } })
			expect(refus.statut, codeInsee).toBe(400)
			expect(champsRefuses(refus.corps), codeInsee).toEqual([
				{ path: 'city.inseeCode', message: MESSAGES_DE_LA_ZONE.codeInseeMalForme },
			])
		}
		expect(await zoneStockee(profil)).toEqual(avant)
	})

	test('commune sans code INSEE : refusée, qu’elle soit nouvelle ou qu’on retire son code', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const nouvelle = await modifier(compte, profil, { city: { name: 'Annecy' } })
		expect(nouvelle.statut).toBe(400)
		expect(champsRefuses(nouvelle.corps)).toEqual([
			{ path: 'city.inseeCode', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		expect((await zoneStockee(profil)).city).toEqual(COMMUNE_VIDE)

		await modifier(compte, profil, { city: ANNECY })
		const sansCode = await modifier(compte, profil, { city: { ...ANNECY, inseeCode: '' } })
		expect(sansCode.statut).toBe(400)
		expect(champsRefuses(sansCode.corps)).toEqual([
			{ path: 'city.inseeCode', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		expect((await zoneStockee(profil)).city).toEqual(ANNECY_STOCKEE)
	})

	test('une ville en texte libre, comme sur l’ancien site, n’est pas une city : refusée', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const ville = await modifier(compte, profil, { city: 'Annecy' })
		expect(ville.statut).toBe(400)
		expect(champsRefuses(ville.corps)).toEqual([
			{ path: 'city.inseeCode', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])

		const adresse = await modifier(compte, profil, { city: '12 rue des Lilas, 74000 Annecy' })
		expect(adresse.statut).toBe(400)
		expect(champsRefuses(adresse.corps)).toEqual([
			{ path: 'city.name', message: MESSAGES_DE_LA_ZONE.nomAdresse },
			{ path: 'city.inseeCode', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		expect((await zoneStockee(profil)).city).toEqual(COMMUNE_VIDE)
	})

	test('une commune envoyée en liste est refusée, et son département reste celui de son code', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY })

		for (const commune of [[], ['Annecy'], [ANNECY]]) {
			const refus = await modifier(compte, profil, { city: commune })
			expect(refus.statut, JSON.stringify(commune)).toBe(400)
			expect(champsRefuses(refus.corps), JSON.stringify(commune)).toEqual([
				{ path: 'city', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
			])
			expect((await zoneStockee(profil)).city, JSON.stringify(commune)).toEqual(ANNECY_STOCKEE)
		}

		// The import's path, the local API, is held by the same rule.
		const payload = await payloadDeTest()
		const parLeServeur = await payload
			.update({ collection: 'profiles', id: profil, data: { city: [] as never } })
			.catch((erreur: unknown) => erreur)
		expect(parLeServeur).toBeInstanceOf(ValidationError)
		expect((await zoneStockee(profil)).city).toEqual(ANNECY_STOCKEE)
	})

	test('la commune s’envoie entière : un nom sans son code, ou un code sans son nom, est refusé même quand l’autre est enregistré', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY })

		const nomSeul = await modifier(compte, profil, { city: { name: 'Lyon' } })
		expect(nomSeul.statut).toBe(400)
		expect(champsRefuses(nomSeul.corps)).toEqual([
			{ path: 'city.inseeCode', message: MESSAGES_DE_LA_ZONE.communeSansCodeInsee },
		])
		const codeSeul = await modifier(compte, profil, { city: { inseeCode: '69123' } })
		expect(codeSeul.statut).toBe(400)
		expect(champsRefuses(codeSeul.corps)).toEqual([
			{ path: 'city.name', message: MESSAGES_DE_LA_ZONE.codeInseeSansNom },
		])
		expect((await zoneStockee(profil)).city).toEqual(ANNECY_STOCKEE)

		// A new commune without coordinates does not keep those of the former one.
		expect((await modifier(compte, profil, { city: { name: 'Lyon', inseeCode: '69123' } })).statut).toBe(200)
		expect((await zoneStockee(profil)).city).toEqual({
			name: 'Lyon',
			inseeCode: '69123',
			department: '69',
			latitude: null,
			longitude: null,
		})
	})

	test('un nom qui ressemble à une adresse est refusé, même avec un code INSEE bien formé', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY })

		for (const nom of ['12 rue des Lilas, 74000 Annecy', 'rue des Lilas', 'Annecy 74000']) {
			const refus = await modifier(compte, profil, { city: { ...ANNECY, name: nom } })
			expect(refus.statut, nom).toBe(400)
			expect(champsRefuses(refus.corps), nom).toEqual([{ path: 'city.name', message: MESSAGES_DE_LA_ZONE.nomAdresse }])
		}
		expect((await zoneStockee(profil)).city).toEqual(ANNECY_STOCKEE)
	})

	test('un nom fait d’autres caractères que ceux d’un nom de commune est refusé : un email, un site, un symbole', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY })

		for (const nom of ['moi@exemple.test', 'www.site-fictif.test', 'St. Gervais', 'Annecy & alentours']) {
			const refus = await modifier(compte, profil, { city: { ...ANNECY, name: nom } })
			expect(refus.statut, nom).toBe(400)
			expect(champsRefuses(refus.corps), nom).toEqual([
				{ path: 'city.name', message: MESSAGES_DE_LA_ZONE.nomCaracteres },
			])
		}
		expect((await zoneStockee(profil)).city).toEqual(ANNECY_STOCKEE)
		// Its form only: whether the name is the one of its code, the list of the space and of the import says it.
		expect((await modifier(compte, profil, { city: { ...ANNECY, name: 'Lyon' } })).statut).toBe(200)
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
			.create({ collection: 'profiles', data: { pro: compte.id, slug: 'zone-importee', radiusKm: 400 } })
			.catch((erreur: unknown) => erreur)
		expect(refus).toBeInstanceOf(ValidationError)
		expect((refus as ValidationError).data.errors).toEqual([
			expect.objectContaining({ path: 'radiusKm', message: MESSAGES_DE_LA_ZONE.rayon }),
		])
		expect((await payload.count({ collection: 'profiles' })).totalDocs).toBe(0)

		const importe = await payload.create({
			collection: 'profiles',
			data: { pro: compte.id, slug: 'zone-importee', city: ANNECY, radiusKm: 30 },
		})
		expect(importe).toMatchObject({ city: ANNECY_STOCKEE, radiusKm: 30, homeService: null })
	})
})

describe('Les coordonnées de la commune sont celles de son centre, à environ 1 km près', () => {
	test('envoyées au huitième de décimale, elles sont gardées à deux, et le public ne lit que celles-là', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()

		const precises = { ...ANNECY, latitude: 48.85341234, longitude: 2.34881234 }
		expect((await modifier(compte, profil, { city: precises })).statut).toBe(200)

		const arrondies = { latitude: 48.85, longitude: 2.35 }
		expect((await zoneStockee(profil)).city).toMatchObject(arrondies)
		// With a commune, the profile is published (ticket 044): what the public reads.
		const publique = await appelerRest('GET', `/api/profiles/${profil}?depth=0`)
		expect(publique.statut).toBe(200)
		expect((publique.corps as { city: unknown }).city).toMatchObject(arrondies)
	})

	test('le serveur aussi les arrondit : l’import d’un centre au mètre près', async () => {
		const { profil } = await maquilleuseEtSonProfil()
		const payload = await payloadDeTest()

		await payload.update({ collection: 'profiles', id: profil, data: { city: { ...ANNECY, latitude: 45.899247 } } })

		expect((await zoneStockee(profil)).city).toEqual(ANNECY_STOCKEE)
	})
})

describe('Lecture anonyme : la commune et son département sortent avec le profil publié', () => {
	test('par REST et par l’API locale avec les règles actives, seul et en liste ; un brouillon ne sort pas', async () => {
		const { compte, profil } = await maquilleuseEtSonProfil()
		const brouillon = await maquilleuseEtSonProfil()
		await modifier(compte, profil, { city: ANNECY, radiusKm: 30, homeService: true })
		await modifier(brouillon.compte, brouillon.profil, { city: ANNECY })
		const payload = await payloadDeTest()
		// With a commune, the rule of ticket 044 publishes the first; an admin holds the other as a draft.
		await payload.update({ collection: 'profiles', id: brouillon.profil, data: { chosenStatus: 'draft' } })

		const attendu = { city: ANNECY_STOCKEE, radiusKm: 30, homeService: true }
		const seul = await appelerRest('GET', `/api/profiles/${profil}?depth=0`)
		expect(seul.statut).toBe(200)
		expect(seul.corps).toMatchObject(attendu)
		const liste = (await appelerRest('GET', '/api/profiles?depth=0')).corps as { docs: { id: number }[] }
		const locale = await payload.find({ collection: 'profiles', depth: 0, overrideAccess: false })
		for (const docs of [liste.docs, locale.docs]) {
			expect(docs.map(({ id }) => id)).toEqual([profil])
			expect(docs[0]).toMatchObject(attendu)
		}

		expect((await appelerRest('GET', `/api/profiles/${brouillon.profil}`)).statut).toBe(404)
	})
})
