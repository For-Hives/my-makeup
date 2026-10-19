import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { enregistrerLocalisation } from '@/lib/espace/enregistrer-localisation'
import { MESSAGE_SERVICE_DES_COMMUNES } from '@/lib/espace/localisation'
import { profilDeLaMaquilleuse, type UtilisateurDeLEspace } from '@/lib/espace/mon-profil'
import { MESSAGE_ECHEC } from '@/lib/espace/resultat'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { HttpResponse, http, simuler } from '../outils/http-sortant'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'

/**
 * The location saved from her space (ticket 123; plan 02 U16, I02, I19, E19-E29 for the zone): the
 * commune stored is the one of the official list for the code she chose, the radius is bounded, free
 * text and a forged name are refused, and a service of the communes that is down changes nothing.
 * The list is simulated (ticket 037): nothing goes out of this machine.
 */

afterEach(viderLaBase)

type Maquilleuse = CompteDeTest<'maquilleuse'>

const LISTE = 'https://geo.api.gouv.fr/communes'
const ANNECY = {
	nom: 'Annecy',
	code: '74010',
	codeDepartement: '74',
	centre: { type: 'Point', coordinates: [6.1264, 45.9024] },
}
const LYON = {
	nom: 'Lyon',
	code: '69123',
	codeDepartement: '69',
	centre: { type: 'Point', coordinates: [4.8357, 45.764] },
}

/** The list answers for these communes, 404 for any other code, and records the codes asked. */
function listeOfficielle() {
	const demandes: string[] = []
	simuler(
		http.get(`${LISTE}/:code`, ({ params }) => {
			const code = String(params.code)
			demandes.push(code)
			const trouvee = [ANNECY, LYON].find(commune => commune.code === code)
			return trouvee ? HttpResponse.json(trouvee) : new HttpResponse('Not Found', { status: 404 })
		})
	)
	return demandes
}

async function utilisateurDe(payload: Payload, compte: Maquilleuse): Promise<UtilisateurDeLEspace> {
	const doc = await payload.findByID({ collection: 'pros', id: compte.id, depth: 0, overrideAccess: true })
	return { ...doc, collection: 'pros' } as UtilisateurDeLEspace
}

async function profilStocke(payload: Payload, compte: Maquilleuse) {
	const { docs } = await payload.find({
		collection: 'profiles',
		depth: 0,
		overrideAccess: true,
		where: { pro: { equals: compte.id } },
	})
	const profil = docs[0]
	if (!profil) throw new Error('pas de profil')
	return profil
}

const SAISIE = { codeInsee: '74010', rayonKm: 30, aDomicile: true }

describe('U16 : « Annecy » choisie, enregistrée', () => {
	test('le code INSEE, le nom, le département et le centre de la liste ; le libellé rendu est « Annecy (74) »', async () => {
		const demandes = listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avant = await profilStocke(payload, a)

		const resultat = await enregistrerLocalisation(payload, await utilisateurDe(payload, a), SAISIE)

		expect(resultat).toEqual({
			ok: true,
			valeurs: { codeInsee: '74010', libelle: 'Annecy (74)', rayonKm: 30, aDomicile: true },
		})
		expect(demandes).toEqual(['74010'])
		const stocke = await profilStocke(payload, a)
		expect(stocke.commune).toMatchObject({ nom: 'Annecy', codeInsee: '74010', departement: '74' })
		// The centre of the commune, to about 1 km.
		expect(stocke.commune?.latitude).toBe(45.9)
		expect(stocke.commune?.longitude).toBe(6.13)
		expect(stocke.rayonKm).toBe(30)
		expect(stocke.aDomicile).toBe(true)
		// I19: the slug does not move.
		expect(stocke.slug).toBe(avant.slug)
		// What the page reads next is the same commune.
		const lu = await profilDeLaMaquilleuse(payload, await utilisateurDe(payload, a))
		expect(lu?.commune).toMatchObject({ nom: 'Annecy', codeInsee: '74010', departement: '74' })
	})

	test('changer de commune remplace tout : nom, code, département et centre', async () => {
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		await enregistrerLocalisation(payload, utilisateur, SAISIE)

		const resultat = await enregistrerLocalisation(payload, utilisateur, { ...SAISIE, codeInsee: '69123' })

		expect(resultat.ok && resultat.valeurs.libelle).toBe('Lyon (69)')
		const { commune } = await profilStocke(payload, a)
		expect(commune).toMatchObject({ nom: 'Lyon', codeInsee: '69123', departement: '69' })
		expect(commune?.latitude).toBe(45.76)
		expect(commune?.longitude).toBe(4.84)
	})

	test('seul le profil de A change', async () => {
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const b = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const avantB = await profilStocke(payload, b)

		await enregistrerLocalisation(payload, await utilisateurDe(payload, a), SAISIE)

		const apresB = await profilStocke(payload, b)
		expect(apresB.commune?.codeInsee ?? null).toBe(avantB.commune?.codeInsee ?? null)
		expect(apresB.rayonKm ?? null).toBe(avantB.rayonKm ?? null)
	})
})

describe('le rayon est borné de 0 à 200 km, jamais « & km »', () => {
	test.each([201, 1000, -1, 12.5])('%p est refusé, rien n’est écrit', async rayonKm => {
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()

		const resultat = await enregistrerLocalisation(payload, await utilisateurDe(payload, a), { ...SAISIE, rayonKm })

		expect(resultat.ok).toBe(false)
		if (resultat.ok) return
		expect(resultat.champs?.rayonKm).toContain('de 0 à 200 km')
		const stocke = await profilStocke(payload, a)
		expect(stocke.rayonKm ?? null).toBeNull()
		expect(stocke.commune?.codeInsee ?? null).toBeNull()
	})

	test('0 et 200 sont acceptés ; null efface le rayon', async () => {
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		for (const [rayonKm, attendu] of [
			[0, 0],
			[200, 200],
			[null, null],
		] as const) {
			const resultat = await enregistrerLocalisation(payload, utilisateur, { ...SAISIE, rayonKm })
			expect(resultat.ok && resultat.valeurs.rayonKm).toBe(attendu)
			expect((await profilStocke(payload, a)).rayonKm ?? null).toBe(attendu)
		}
	})
})

describe('un texte libre n’est jamais une commune, côté serveur non plus', () => {
	test.each([
		{ codeInsee: 'Annecy' },
		{ codeInsee: '12 rue des Lilas, 74000 Annecy' },
		{ codeInsee: '' },
		{ codeInsee: null },
		{ codeInsee: 74010 },
		{ codeInsee: '20004' },
	])('le code %p est refusé sans interroger la liste, la commune stockée reste', async remplacement => {
		const demandes = listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		await enregistrerLocalisation(payload, utilisateur, SAISIE)
		demandes.length = 0

		const resultat = await enregistrerLocalisation(payload, utilisateur, { ...SAISIE, ...remplacement, rayonKm: 99 })

		expect(resultat.ok).toBe(false)
		expect(demandes).toEqual([])
		const stocke = await profilStocke(payload, a)
		expect(stocke.commune).toMatchObject({ nom: 'Annecy', codeInsee: '74010' })
		expect(stocke.rayonKm).toBe(30)
	})

	test('un nom, des coordonnées ou un champ réservé dans la requête la refusent en bloc', async () => {
		const demandes = listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)

		for (const extra of [
			{ nom: 'Paris' },
			{ commune: { nom: 'Paris', codeInsee: '75056' } },
			{ latitude: 48.85, longitude: 2.35 },
			{ departement: '75' },
			{ statut: 'publie' },
			{ pro: 999 },
			{ adresse: '12 rue des Lilas' },
		]) {
			const resultat = await enregistrerLocalisation(payload, utilisateur, { ...SAISIE, ...extra })
			expect(resultat).toEqual({ ok: false, message: MESSAGE_ECHEC })
		}
		expect(demandes).toEqual([])
		expect((await profilStocke(payload, a)).commune?.codeInsee ?? null).toBeNull()
	})

	test('un code que la liste ne connaît pas (404) est refusé sous le champ de la commune', async () => {
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()

		const resultat = await enregistrerLocalisation(payload, await utilisateurDe(payload, a), {
			...SAISIE,
			codeInsee: '74999',
		})

		expect(resultat.ok).toBe(false)
		if (resultat.ok) return
		expect(resultat.champs?.codeInsee).toContain('pas dans la liste officielle')
		expect((await profilStocke(payload, a)).commune?.codeInsee ?? null).toBeNull()
	})

	test('le nom stocké est celui de la liste, pas un autre : un code ne s’enregistre pas avec le nom d’une autre commune', async () => {
		// The list answers for 74010 with the name Annecy whatever the request says.
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		await enregistrerLocalisation(payload, await utilisateurDe(payload, a), SAISIE)
		expect((await profilStocke(payload, a)).commune?.nom).toBe('Annecy')
	})
})

describe('le service des communes en panne : message clair, ancienne commune gardée', () => {
	test.each([
		['une réponse 500', () => new HttpResponse(null, { status: 500 })],
		['un réseau coupé', () => HttpResponse.error()],
		['une réponse qui n’est pas une commune', () => HttpResponse.json({ ok: true })],
	])('%s', async (_nom, panne) => {
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		await enregistrerLocalisation(payload, utilisateur, SAISIE)

		simuler(http.get(`${LISTE}/69123`, panne))
		const resultat = await enregistrerLocalisation(payload, utilisateur, { ...SAISIE, codeInsee: '69123', rayonKm: 80 })

		expect(resultat).toEqual({ ok: false, message: MESSAGE_SERVICE_DES_COMMUNES })
		const stocke = await profilStocke(payload, a)
		expect(stocke.commune).toMatchObject({ nom: 'Annecy', codeInsee: '74010', departement: '74' })
		// Nothing of the refused save was kept: not the radius either.
		expect(stocke.rayonKm).toBe(30)
	})

	test('la commune qu’elle a déjà ne demande rien à la liste : son rayon se change même en panne', async () => {
		listeOfficielle()
		const a = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const utilisateur = await utilisateurDe(payload, a)
		await enregistrerLocalisation(payload, utilisateur, SAISIE)

		// From here, any call to the list fails (an undeclared request would fail the test too).
		simuler(http.get(`${LISTE}/:code`, () => new HttpResponse(null, { status: 500 })))
		const resultat = await enregistrerLocalisation(payload, utilisateur, { ...SAISIE, rayonKm: 45, aDomicile: false })

		expect(resultat).toEqual({
			ok: true,
			valeurs: { codeInsee: '74010', libelle: 'Annecy (74)', rayonKm: 45, aDomicile: false },
		})
		const stocke = await profilStocke(payload, a)
		expect(stocke.commune).toMatchObject({ nom: 'Annecy', codeInsee: '74010', departement: '74' })
		expect(stocke.rayonKm).toBe(45)
	})
})

describe('I02 : le profil écrit est celui du compte', () => {
	test('un compte de l’administration n’a pas de profil à écrire', async () => {
		listeOfficielle()
		const admin = await creerCompte('admin')
		const payload = await payloadDeTest()
		const doc = await payload.findByID({ collection: 'admins', id: admin.id, depth: 0, overrideAccess: true })
		const utilisateur = { ...doc, collection: 'admins' } as unknown as UtilisateurDeLEspace
		expect(await enregistrerLocalisation(payload, utilisateur, SAISIE)).toEqual({ ok: false, message: MESSAGE_ECHEC })
	})
})
