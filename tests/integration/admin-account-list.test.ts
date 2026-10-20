import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Pros } from '../../src/collections/Pros'
import { filterLink } from '../../src/lib/account/admin-filters'
import { setBenchDataset } from '../fixtures/bench-dataset'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * Ticket 168 (plan 01 §6.1; decisions of 13/10 on the sign-up spam): the admin lists the accounts, spots
 * the fake ones with the filters « not confirmed », « without profile » and « blocked », and blocks from
 * the sheet. The twenty accounts of the set of the bench are the base: one is not confirmed, one has no
 * profile, one is blocked. The editorial role does not see the accounts.
 */

const resetToZero = () => Promise.all([emptyBase(), emptyStorage()])

beforeAll(async () => {
	await resetToZero()
	await setBenchDataset()
}, 60_000)

afterAll(resetToZero)

interface List {
	totalDocs: number
	docs: { id: number; email: string; createdAt: string; blocked?: boolean; profile?: { docs?: unknown[] } }[]
}

const PASSWORD = 'aaaaaaaa'

async function listAll(enTetes: Record<string, string>, requete: string) {
	const response = await callRest('GET', `/api/pros?limit=100&depth=0&${requete}`, { enTetes })
	return { statut: response.statut, liste: response.corps as List }
}

describe('La liste des comptes de l’admin (ticket 168)', () => {
	test('la liste montre la création, l’adresse confirmée, le blocage, la dernière connexion et le profil, le plus récent d’abord', () => {
		expect(Pros.admin?.defaultColumns).toEqual([
			'email',
			'createdAt',
			'_verified',
			'blocked',
			'lastSignInAt',
			'profile',
		])
		expect(Pros.defaultSort).toBe('-createdAt')
	})

	test('chaque filtre rend le nombre attendu sur les 20 comptes du banc', async () => {
		const { session } = await createAccount('admin')
		const all = await listAll(session.enTetes, 'sort=-createdAt')
		expect(all.liste.totalDocs).toBe(20)
		const dates = all.liste.docs.map(({ createdAt }) => createdAt)
		expect(dates).toEqual([...dates].sort().reverse())

		const emails = async (requete: string) =>
			(await listAll(session.enTetes, requete)).liste.docs.map(({ email }) => email).sort()

		expect(await emails('where[_verified][equals]=false')).toEqual(['jeu-maquilleuse-non-verifiee@example.test'])
		expect(await emails('where[profile][exists]=false')).toEqual(['jeu-maquilleuse-sans-profil@example.test'])
		expect(await emails('where[blocked][equals]=true')).toEqual(['jeu-maquilleuse-bloquee@example.test'])
		expect((await listAll(session.enTetes, 'where[profile][exists]=true')).liste.totalDocs).toBe(19)
		// The link of the panel (« without profile » by the owners of the profiles) holds the same account.
		const payload = await testPayload()
		const profiles = await payload.find({
			collection: 'profiles',
			depth: 0,
			limit: 0,
			pagination: false,
			select: { pro: true },
		})
		const owners = profiles.docs.map(({ pro }) => (typeof pro === 'object' ? pro.id : pro))
		const link = filterLink('sans-profil', owners).split('?')[1] ?? ''
		expect((await emails(link)).join()).toBe('jeu-maquilleuse-sans-profil@example.test')
		// Combined: an unconfirmed account that is also blocked does not exist in the set.
		expect(
			(await listAll(session.enTetes, 'where[_verified][equals]=false&where[blocked][equals]=true')).liste.totalDocs
		).toBe(0)
	}, 30_000)

	test('la liste dit, pour chaque compte, s’il a un profil', async () => {
		const { session } = await createAccount('admin')
		const { liste: list } = await listAll(session.enTetes, 'where[email][like]=jeu-maquilleuse')
		const hasProfile = (email: string) =>
			(list.docs.find(autre => autre.email === email)?.profile?.docs?.length ?? 0) > 0
		expect(hasProfile('jeu-maquilleuse-sans-profil@example.test')).toBe(false)
		expect(hasProfile('jeu-maquilleuse@example.test')).toBe(true)
	})

	test('la rédaction ne voit pas les comptes ; une maquilleuse ne voit que le sien, filtres compris', async () => {
		const editor = await createAccount('redaction')
		expect((await listAll(editor.session.enTetes, 'sort=-createdAt')).statut).toBe(403)
		expect((await listAll(editor.session.enTetes, 'where[blocked][equals]=true')).statut).toBe(403)

		const artist = await createAccount('maquilleuse')
		const his = await listAll(artist.session.enTetes, 'where[_verified][equals]=true')
		expect(his.liste.docs.map(({ id }) => String(id))).toEqual([String(artist.id)])
		const blocked = await listAll(artist.session.enTetes, 'where[blocked][equals]=true')
		expect(blocked.liste.totalDocs).toBe(0)
		// The join is the admin's: the account holder does not read it.
		expect(his.liste.docs[0]?.profile).toBeUndefined()
		// ... and she cannot filter on it either: that would tell her what she may not read.
		expect((await listAll(artist.session.enTetes, 'where[profile][exists]=false')).statut).not.toBe(200)
	})
})

describe('L’admin bloque un compte depuis sa fiche (ticket 168)', () => {
	test('le blocage par l’API de l’administration refuse la connexion et ferme la session ; le déblocage la rend', async () => {
		const admin = await createAccount('admin')
		const account = await createAccount('maquilleuse', { motDePasse: () => PASSWORD })
		const signIn = () =>
			callRest('POST', '/api/pros/login', {
				corps: { email: account.email, password: PASSWORD },
				enTetes: { 'x-forwarded-for': '192.0.2.168' },
			})
		const me = () => callRest('GET', '/api/pros/me', { enTetes: account.session.enTetes })
		expect(((await me()).corps as { user: unknown }).user).not.toBeNull()

		const block = await callRest('PATCH', `/api/pros/${account.id}`, {
			corps: { blocked: true },
			enTetes: admin.session.enTetes,
		})
		expect(block.statut).toBe(200)

		expect(((await me()).corps as { user: unknown }).user).toBeNull()
		expect((await signIn()).statut).toBe(403)
		const blocked = await listAll(admin.session.enTetes, 'where[blocked][equals]=true')
		expect(blocked.liste.docs.map(({ id }) => String(id))).toContain(String(account.id))

		const unblock = await callRest('PATCH', `/api/pros/${account.id}`, {
			corps: { blocked: false },
			enTetes: admin.session.enTetes,
		})
		expect(unblock.statut).toBe(200)
		expect((await signIn()).statut).toBe(200)
	}, 30_000)

	test('la rédaction ne bloque pas un compte', async () => {
		const editor = await createAccount('redaction')
		const account = await createAccount('maquilleuse')
		const response = await callRest('PATCH', `/api/pros/${account.id}`, {
			corps: { blocked: true },
			enTetes: editor.session.enTetes,
		})
		expect(response.statut).toBeGreaterThanOrEqual(400)
		const read = await (await testPayload()).findByID({ collection: 'pros', id: account.id, depth: 0 })
		expect(read.blocked).toBe(false)
	})
})
