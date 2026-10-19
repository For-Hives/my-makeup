import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Pros } from '../../src/collections/Pros'
import { lienDuFiltre } from '../../src/lib/compte/filtres-admin'
import { poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'
import { viderLeStockage } from '../outils/s3'

/**
 * Ticket 168 (plan 01 §6.1; decisions of 13/10 on the sign-up spam): the admin lists the accounts, spots
 * the fake ones with the filters « not confirmed », « without profile » and « blocked », and blocks from
 * the sheet. The twenty accounts of the set of the bench are the base: one is not confirmed, one has no
 * profile, one is blocked. The editorial role does not see the accounts.
 */

const remettreAZero = () => Promise.all([viderLaBase(), viderLeStockage()])

beforeAll(async () => {
	await remettreAZero()
	await poserLeJeuDuBanc()
}, 60_000)

afterAll(remettreAZero)

interface Liste {
	totalDocs: number
	docs: { id: number; email: string; createdAt: string; blocked?: boolean; profile?: { docs?: unknown[] } }[]
}

const MOT_DE_PASSE = 'aaaaaaaa'

async function lister(enTetes: Record<string, string>, requete: string) {
	const reponse = await appelerRest('GET', `/api/pros?limit=100&depth=0&${requete}`, { enTetes })
	return { statut: reponse.statut, liste: reponse.corps as Liste }
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
		const { session } = await creerCompte('admin')
		const tous = await lister(session.enTetes, 'sort=-createdAt')
		expect(tous.liste.totalDocs).toBe(20)
		const dates = tous.liste.docs.map(({ createdAt }) => createdAt)
		expect(dates).toEqual([...dates].sort().reverse())

		const emails = async (requete: string) =>
			(await lister(session.enTetes, requete)).liste.docs.map(({ email }) => email).sort()

		expect(await emails('where[_verified][equals]=false')).toEqual(['jeu-maquilleuse-non-verifiee@example.test'])
		expect(await emails('where[profile][exists]=false')).toEqual(['jeu-maquilleuse-sans-profil@example.test'])
		expect(await emails('where[blocked][equals]=true')).toEqual(['jeu-maquilleuse-bloquee@example.test'])
		expect((await lister(session.enTetes, 'where[profile][exists]=true')).liste.totalDocs).toBe(19)
		// The link of the panel (« without profile » by the owners of the profiles) holds the same account.
		const payload = await payloadDeTest()
		const profils = await payload.find({
			collection: 'profiles',
			depth: 0,
			limit: 0,
			pagination: false,
			select: { pro: true },
		})
		const proprietaires = profils.docs.map(({ pro }) => (typeof pro === 'object' ? pro.id : pro))
		const lien = lienDuFiltre('sans-profil', proprietaires).split('?')[1] ?? ''
		expect((await emails(lien)).join()).toBe('jeu-maquilleuse-sans-profil@example.test')
		// Combined: an unconfirmed account that is also blocked does not exist in the set.
		expect(
			(await lister(session.enTetes, 'where[_verified][equals]=false&where[blocked][equals]=true')).liste.totalDocs
		).toBe(0)
	}, 30_000)

	test('la liste dit, pour chaque compte, s’il a un profil', async () => {
		const { session } = await creerCompte('admin')
		const { liste } = await lister(session.enTetes, 'where[email][like]=jeu-maquilleuse')
		const aUnProfil = (email: string) =>
			(liste.docs.find(autre => autre.email === email)?.profile?.docs?.length ?? 0) > 0
		expect(aUnProfil('jeu-maquilleuse-sans-profil@example.test')).toBe(false)
		expect(aUnProfil('jeu-maquilleuse@example.test')).toBe(true)
	})

	test('la rédaction ne voit pas les comptes ; une maquilleuse ne voit que le sien, filtres compris', async () => {
		const redaction = await creerCompte('redaction')
		expect((await lister(redaction.session.enTetes, 'sort=-createdAt')).statut).toBe(403)
		expect((await lister(redaction.session.enTetes, 'where[blocked][equals]=true')).statut).toBe(403)

		const maquilleuse = await creerCompte('maquilleuse')
		const siens = await lister(maquilleuse.session.enTetes, 'where[_verified][equals]=true')
		expect(siens.liste.docs.map(({ id }) => String(id))).toEqual([String(maquilleuse.id)])
		const bloques = await lister(maquilleuse.session.enTetes, 'where[blocked][equals]=true')
		expect(bloques.liste.totalDocs).toBe(0)
		// The join is the admin's: the account holder does not read it.
		expect(siens.liste.docs[0]?.profile).toBeUndefined()
		// ... and she cannot filter on it either: that would tell her what she may not read.
		expect((await lister(maquilleuse.session.enTetes, 'where[profile][exists]=false')).statut).not.toBe(200)
	})
})

describe('L’admin bloque un compte depuis sa fiche (ticket 168)', () => {
	test('le blocage par l’API de l’administration refuse la connexion et ferme la session ; le déblocage la rend', async () => {
		const admin = await creerCompte('admin')
		const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
		const connexion = () =>
			appelerRest('POST', '/api/pros/login', {
				corps: { email: compte.email, password: MOT_DE_PASSE },
				enTetes: { 'x-forwarded-for': '192.0.2.168' },
			})
		const moi = () => appelerRest('GET', '/api/pros/me', { enTetes: compte.session.enTetes })
		expect(((await moi()).corps as { user: unknown }).user).not.toBeNull()

		const bloquer = await appelerRest('PATCH', `/api/pros/${compte.id}`, {
			corps: { blocked: true },
			enTetes: admin.session.enTetes,
		})
		expect(bloquer.statut).toBe(200)

		expect(((await moi()).corps as { user: unknown }).user).toBeNull()
		expect((await connexion()).statut).toBe(403)
		const bloques = await lister(admin.session.enTetes, 'where[blocked][equals]=true')
		expect(bloques.liste.docs.map(({ id }) => String(id))).toContain(String(compte.id))

		const debloquer = await appelerRest('PATCH', `/api/pros/${compte.id}`, {
			corps: { blocked: false },
			enTetes: admin.session.enTetes,
		})
		expect(debloquer.statut).toBe(200)
		expect((await connexion()).statut).toBe(200)
	}, 30_000)

	test('la rédaction ne bloque pas un compte', async () => {
		const redaction = await creerCompte('redaction')
		const compte = await creerCompte('maquilleuse')
		const reponse = await appelerRest('PATCH', `/api/pros/${compte.id}`, {
			corps: { blocked: true },
			enTetes: redaction.session.enTetes,
		})
		expect(reponse.statut).toBeGreaterThanOrEqual(400)
		const lu = await (await payloadDeTest()).findByID({ collection: 'pros', id: compte.id, depth: 0 })
		expect(lu.blocked).toBe(false)
	})
})
