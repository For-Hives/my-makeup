import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { estAdmin } from '@/lib/access'
import { lireLeDelta } from '@/lib/bascule/export-delta'
import { repondreAuDelta } from '@/lib/bascule/reponse-delta'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { fichierPourPayload } from '../outils/photos'
import { viderLeStockage } from '../outils/s3'

/**
 * Ticket 234 (PLAN-PROD-DIRECT §4.5, §7 L5): the export of what the v3 received since the switch, against the
 * real database of the bench. An imported record nobody touched (it keeps the dates of the old site) is out;
 * what was created or changed after the date is in; no secret leaves.
 */

const ANCIEN = '2020-01-15T10:00:00.000Z'
const MOT_DE_PASSE_FICTIF = 'Mot-de-passe-fictif-du-test-234'
const HASH_FICTIF = `$2a$10$${'f'.repeat(53)}`

let depuis: Date
const ids: Record<string, number> = {}

/** Gives a record the dates of the old site, as the import writes them back. */
async function vieillir(collection: 'pros' | 'profiles' | 'media' | 'contact-requests', id: number) {
	const payload = await payloadDeTest()
	await payload.db.updateOne({ collection, id, data: { createdAt: ANCIEN, updatedAt: ANCIEN } })
}

beforeAll(async () => {
	const payload = await payloadDeTest()
	await Promise.all([viderLaBase(), viderLeStockage()])

	// The imported ones, untouched since the old site.
	const importe = await creerCompte('maquilleuse')
	ids.compteImporte = Number(importe.id)
	await payload.update({
		collection: 'pros',
		id: ids.compteImporte,
		data: { legacyBcrypt: HASH_FICTIF, strapiId: 4101 },
	})
	const profilImporte = await payload.find({ collection: 'profiles', where: { pro: { equals: ids.compteImporte } } })
	ids.profilImporte = profilImporte.docs[0]?.id as number
	const photoImportee = await payload.create({ collection: 'media', data: {}, file: fichierPourPayload() })
	ids.photoImportee = photoImportee.id
	const messageImporte = await payload.create({
		collection: 'contact-requests',
		data: {
			type: 'contact',
			status: 'new',
			mailStatus: 'sent',
			phone: '0199001234',
			firstName: 'Ancienne',
			lastName: 'Visiteuse',
			email: 'ancienne@example.test',
			message: 'Écrit avant la bascule.',
		},
	})
	ids.messageImporte = messageImporte.id
	// A second imported account, changed after the switch.
	const modifie = await creerCompte('maquilleuse')
	ids.compteModifie = Number(modifie.id)
	await payload.update({ collection: 'pros', id: ids.compteModifie, data: { strapiId: 4102 } })
	const profilModifie = await payload.find({ collection: 'profiles', where: { pro: { equals: ids.compteModifie } } })
	ids.profilModifie = profilModifie.docs[0]?.id as number

	for (const [collection, id] of [
		['pros', ids.compteImporte],
		['profiles', ids.profilImporte],
		['media', ids.photoImportee],
		['contact-requests', ids.messageImporte],
		['pros', ids.compteModifie],
		['profiles', ids.profilModifie],
	] as const)
		await vieillir(collection, id as number)

	// The switch.
	depuis = new Date(Date.now() - 5_000)
	await Bun.sleep(20)

	// After it: an account and its profile, a photo, a message, a change to an imported account and profile, a deleted account.
	const neuf = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE_FICTIF })
	ids.compteNeuf = Number(neuf.id)
	const profilNeuf = await payload.find({ collection: 'profiles', where: { pro: { equals: ids.compteNeuf } } })
	ids.profilNeuf = profilNeuf.docs[0]?.id as number
	const photo = await payload.create({
		collection: 'media',
		data: { owner: ids.compteNeuf },
		file: fichierPourPayload(),
	})
	ids.photoNeuve = photo.id
	const message = await payload.create({
		collection: 'contact-requests',
		data: {
			type: 'contact',
			status: 'new',
			mailStatus: 'sent',
			phone: '0199001234',
			firstName: 'Nouvelle',
			lastName: 'Visiteuse',
			email: 'nouvelle@example.test',
			message: 'Écrit après la bascule.',
		},
	})
	ids.messageNeuf = message.id
	await payload.update({ collection: 'pros', id: ids.compteModifie, data: { name: 'Nom changé après la bascule' } })
	await payload.update({ collection: 'profiles', id: ids.profilModifie, data: { specialty: 'Mariage' } })
	await payload.create({ collection: 'deleted-accounts', data: { strapiId: 4199, date: new Date().toISOString() } })
	await payload.create({ collection: 'deleted-accounts', data: { strapiId: 4198, date: ANCIEN } })
}, 120_000)

afterAll(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

const idsDe = (liste: { id: number }[]) => liste.map(({ id }) => id).sort((a, b) => a - b)

describe('l’export du delta, sur le banc', () => {
	test('ce qui est créé ou modifié après la date y est, ce qui est importé et inchangé n’y est pas', async () => {
		const delta = await lireLeDelta(await payloadDeTest(), depuis)
		expect(idsDe(delta.comptes)).toEqual(
			[ids.compteModifie, ids.compteNeuf].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[]
		)
		expect(delta.comptes.find(({ id }) => id === ids.compteNeuf)?.depuisLaBascule).toBe('cree')
		expect(delta.comptes.find(({ id }) => id === ids.compteModifie)?.depuisLaBascule).toBe('modifie')
		expect(idsDe(delta.profils)).toEqual(
			[ids.profilModifie, ids.profilNeuf].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[]
		)
		expect(delta.profils.find(({ id }) => id === ids.profilModifie)?.depuisLaBascule).toBe('modifie')
		expect(delta.profils.find(({ id }) => id === ids.profilModifie)?.specialty).toBe('Mariage')
		expect(idsDe(delta.photos)).toEqual([ids.photoNeuve as number])
		expect(delta.photos[0]?.owner).toBe(ids.compteNeuf)
		expect(idsDe(delta.messages)).toEqual([ids.messageNeuf as number])
		expect(delta.messages[0]?.message).toBe('Écrit après la bascule.')
		expect(delta.comptesSupprimes.map(({ strapiId }) => strapiId)).toEqual([4199])
		expect(delta.nombres).toEqual({ comptes: 2, profils: 2, photos: 1, messages: 1, comptesSupprimes: 1 })
		// The imported ones that nobody touched are nowhere in the file.
		const texte = JSON.stringify(delta)
		expect(texte).not.toContain('Écrit avant la bascule')
		expect(texte).not.toContain('ancienne@example.test')
	})

	test('deux lancements donnent le même texte tant que rien n’a changé', async () => {
		const payload = await payloadDeTest()
		const un = JSON.stringify(await lireLeDelta(payload, depuis))
		const deux = JSON.stringify(await lireLeDelta(payload, depuis))
		expect(un).toBe(deux)
	})

	test('aucun champ secret n’est exporté : ni clé de mot de passe, hash, sel, jeton ou session, ni leur valeur', async () => {
		const payload = await payloadDeTest()
		// The imported account with a hash is in the file here (its date is brought forward), to show the hash stays out.
		const avecHash = await lireLeDelta(payload, new Date(ANCIEN))
		expect(avecHash.comptes.some(({ id }) => id === ids.compteImporte)).toBe(true)
		const stocke = await payload.db.findOne<{ id: number; sessions?: { id: string }[]; salt?: string; hash?: string }>({
			collection: 'pros',
			where: { id: { equals: ids.compteNeuf } },
		})
		expect(stocke?.hash).toBeTruthy()
		const cles: string[] = []
		const parcourir = (valeur: unknown): void => {
			if (Array.isArray(valeur)) valeur.forEach(parcourir)
			else if (valeur !== null && typeof valeur === 'object')
				for (const [cle, sous] of Object.entries(valeur)) {
					cles.push(cle)
					parcourir(sous)
				}
		}
		parcourir(avecHash)
		expect(cles.filter(cle => /hash|salt|token|password|secret|bcrypt|session|attempts|^lock/i.test(cle))).toEqual([])
		const texte = JSON.stringify(avecHash)
		for (const valeur of [
			HASH_FICTIF,
			MOT_DE_PASSE_FICTIF,
			stocke?.hash,
			stocke?.salt,
			...(stocke?.sessions ?? []).map(({ id }) => id),
		])
			if (valeur) expect(texte.includes(valeur)).toBe(false)
		// What a replay needs is there.
		const compte = avecHash.comptes.find(({ id }) => id === ids.compteNeuf)
		expect(compte).toMatchObject({ email: expect.stringContaining('@example.test'), strapiId: null })
	})

	test('la route : un admin reçoit le fichier, une maquilleuse et un visiteur non', async () => {
		const payload = await payloadDeTest()
		const admin = await creerCompte('admin')
		const maquilleuse = await creerCompte('maquilleuse')
		const repondre = async (enTetes: Record<string, string> | undefined) => {
			const lignes: string[] = []
			const reponse = await repondreAuDelta(
				new Request(`https://my-makeup.fr/api/cutover/delta?since=${depuis.toISOString()}`),
				{
					lieu: 'site',
					basculeLe: undefined,
					estAdmin: async () => {
						const { user } = await payload.auth({ headers: new Headers(enTetes) })
						return user ? estAdmin(user) : 'anonyme'
					},
					lire: debut => lireLeDelta(payload, debut),
					journal: ligne => lignes.push(ligne),
				}
			)
			return { reponse, lignes }
		}
		expect((await repondre(undefined)).reponse.status).toBe(401)
		expect((await repondre(maquilleuse.session.enTetes)).reponse.status).toBe(403)
		const { reponse, lignes } = await repondre(admin.session.enTetes)
		expect(reponse.status).toBe(200)
		const corps = (await reponse.json()) as { nombres: { comptes: number } }
		// The two accounts of the test itself (admin excluded: another collection) add to the three above.
		expect(corps.nombres.comptes).toBeGreaterThanOrEqual(3)
		expect(lignes.join('\n')).not.toMatch(/@/)
	})
})
