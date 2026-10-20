import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { isAdmin } from '@/lib/access'
import { respondToDelta } from '@/lib/cutover/delta-response'
import { readDelta } from '@/lib/cutover/export-delta'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForPayload } from '../support/photos'
import { emptyStorage } from '../support/s3'

/**
 * Ticket 234 (PLAN-PROD-DIRECT §4.5, §7 L5): the export of what the v3 received since the switch, against the
 * real database of the bench. An imported record nobody touched (it keeps the dates of the old site) is out;
 * what was created or changed after the date is in; no secret leaves.
 */

const OLD = '2020-01-15T10:00:00.000Z'
const FICTIONAL_PASSWORD = 'Mot-de-passe-fictif-du-test-234'
const FICTIONAL_HASH = `$2a$10$${'f'.repeat(53)}`

let since: Date
const ids: Record<string, number> = {}

/** Gives a record the dates of the old site, as the import writes them back. */
async function age(collection: 'pros' | 'profiles' | 'media' | 'contact-requests', id: number) {
	const payload = await testPayload()
	await payload.db.updateOne({ collection, id, data: { createdAt: OLD, updatedAt: OLD } })
}

beforeAll(async () => {
	const payload = await testPayload()
	await Promise.all([emptyBase(), emptyStorage()])

	// The imported ones, untouched since the old site.
	const imported = await createAccount('maquilleuse')
	ids.compteImporte = Number(imported.id)
	await payload.update({
		collection: 'pros',
		id: ids.compteImporte,
		data: { legacyBcrypt: FICTIONAL_HASH, strapiId: 4101 },
	})
	const importedProfile = await payload.find({ collection: 'profiles', where: { pro: { equals: ids.compteImporte } } })
	ids.profilImporte = importedProfile.docs[0]?.id as number
	const importedPhoto = await payload.create({ collection: 'media', data: {}, file: fileForPayload() })
	ids.photoImportee = importedPhoto.id
	const messageImported = await payload.create({
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
	ids.messageImporte = messageImported.id
	// A second imported account, changed after the switch.
	const modified = await createAccount('maquilleuse')
	ids.compteModifie = Number(modified.id)
	await payload.update({ collection: 'pros', id: ids.compteModifie, data: { strapiId: 4102 } })
	const modifiedProfile = await payload.find({ collection: 'profiles', where: { pro: { equals: ids.compteModifie } } })
	ids.profilModifie = modifiedProfile.docs[0]?.id as number

	for (const [collection, id] of [
		['pros', ids.compteImporte],
		['profiles', ids.profilImporte],
		['media', ids.photoImportee],
		['contact-requests', ids.messageImporte],
		['pros', ids.compteModifie],
		['profiles', ids.profilModifie],
	] as const)
		await age(collection, id as number)

	// The switch.
	since = new Date(Date.now() - 5_000)
	await Bun.sleep(20)

	// After it: an account and its profile, a photo, a message, a change to an imported account and profile, a deleted account.
	const fresh = await createAccount('maquilleuse', { motDePasse: () => FICTIONAL_PASSWORD })
	ids.compteNeuf = Number(fresh.id)
	const newProfile = await payload.find({ collection: 'profiles', where: { pro: { equals: ids.compteNeuf } } })
	ids.profilNeuf = newProfile.docs[0]?.id as number
	const photo = await payload.create({
		collection: 'media',
		data: { owner: ids.compteNeuf },
		file: fileForPayload(),
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
	await payload.create({ collection: 'deleted-accounts', data: { strapiId: 4198, date: OLD } })
}, 120_000)

afterAll(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

const idsOf = (liste: { id: number }[]) => liste.map(({ id }) => id).sort((a, b) => a - b)

describe('l’export du delta, sur le banc', () => {
	test('ce qui est créé ou modifié après la date y est, ce qui est importé et inchangé n’y est pas', async () => {
		const delta = await readDelta(await testPayload(), since)
		expect(idsOf(delta.accounts)).toEqual(
			[ids.compteModifie, ids.compteNeuf].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[]
		)
		expect(delta.accounts.find(({ id }) => id === ids.compteNeuf)?.sinceCutover).toBe('created')
		expect(delta.accounts.find(({ id }) => id === ids.compteModifie)?.sinceCutover).toBe('updated')
		expect(idsOf(delta.profiles)).toEqual(
			[ids.profilModifie, ids.profilNeuf].sort((a, b) => (a ?? 0) - (b ?? 0)) as number[]
		)
		expect(delta.profiles.find(({ id }) => id === ids.profilModifie)?.sinceCutover).toBe('updated')
		expect(delta.profiles.find(({ id }) => id === ids.profilModifie)?.specialty).toBe('Mariage')
		expect(idsOf(delta.photos)).toEqual([ids.photoNeuve as number])
		expect(delta.photos[0]?.owner).toBe(ids.compteNeuf)
		expect(idsOf(delta.messages)).toEqual([ids.messageNeuf as number])
		expect(delta.messages[0]?.message).toBe('Écrit après la bascule.')
		expect(delta.deletedAccounts.map(({ strapiId }) => strapiId)).toEqual([4199])
		expect(delta.counts).toEqual({ accounts: 2, profiles: 2, photos: 1, messages: 1, deletedAccounts: 1 })
		// The imported ones that nobody touched are nowhere in the file.
		const text = JSON.stringify(delta)
		expect(text).not.toContain('Écrit avant la bascule')
		expect(text).not.toContain('ancienne@example.test')
	})

	test('deux lancements donnent le même texte tant que rien n’a changé', async () => {
		const payload = await testPayload()
		const a = JSON.stringify(await readDelta(payload, since))
		const two = JSON.stringify(await readDelta(payload, since))
		expect(a).toBe(two)
	})

	test('aucun champ secret n’est exporté : ni clé de mot de passe, hash, sel, jeton ou session, ni leur valeur', async () => {
		const payload = await testPayload()
		// The imported account with a hash is in the file here (its date is brought forward), to show the hash stays out.
		const withHash = await readDelta(payload, new Date(OLD))
		expect(withHash.accounts.some(({ id }) => id === ids.compteImporte)).toBe(true)
		const stored = await payload.db.findOne<{ id: number; sessions?: { id: string }[]; salt?: string; hash?: string }>({
			collection: 'pros',
			where: { id: { equals: ids.compteNeuf } },
		})
		expect(stored?.hash).toBeTruthy()
		const keys: string[] = []
		const browse = (valeur: unknown): void => {
			if (Array.isArray(valeur)) valeur.forEach(browse)
			else if (valeur !== null && typeof valeur === 'object')
				for (const [key, under] of Object.entries(valeur)) {
					keys.push(key)
					browse(under)
				}
		}
		browse(withHash)
		expect(keys.filter(cle => /hash|salt|token|password|secret|bcrypt|session|attempts|^lock/i.test(cle))).toEqual([])
		const text = JSON.stringify(withHash)
		for (const value of [
			FICTIONAL_HASH,
			FICTIONAL_PASSWORD,
			stored?.hash,
			stored?.salt,
			...(stored?.sessions ?? []).map(({ id }) => id),
		])
			if (value) expect(text.includes(value)).toBe(false)
		// What a replay needs is there.
		const account = withHash.accounts.find(({ id }) => id === ids.compteNeuf)
		expect(account).toMatchObject({ email: expect.stringContaining('@example.test'), strapiId: null })
	})

	test('la route : un admin reçoit le fichier, une maquilleuse et un visiteur non', async () => {
		const payload = await testPayload()
		const admin = await createAccount('admin')
		const artist = await createAccount('maquilleuse')
		const answer = async (enTetes: Record<string, string> | undefined) => {
			const lines: string[] = []
			const response = await respondToDelta(
				new Request(`https://my-makeup.fr/api/cutover/delta?since=${since.toISOString()}`),
				{
					place: 'site',
					cutoverDate: undefined,
					isAdmin: async () => {
						const { user } = await payload.auth({ headers: new Headers(enTetes) })
						return user ? isAdmin(user) : 'anonyme'
					},
					read: debut => readDelta(payload, debut),
					log: ligne => lines.push(ligne),
				}
			)
			return { reponse: response, lignes: lines }
		}
		expect((await answer(undefined)).reponse.status).toBe(401)
		expect((await answer(artist.session.enTetes)).reponse.status).toBe(403)
		const { reponse: response, lignes: lines } = await answer(admin.session.enTetes)
		expect(response.status).toBe(200)
		const corps = (await response.json()) as { counts: { accounts: number } }
		// The two accounts of the test itself (admin excluded: another collection) add to the three above.
		expect(corps.counts.accounts).toBeGreaterThanOrEqual(3)
		expect(lines.join('\n')).not.toMatch(/@/)
	})
})
