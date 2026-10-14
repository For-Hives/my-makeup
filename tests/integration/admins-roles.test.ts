import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { z } from 'zod'
import { DUREE_SESSION_ADMIN_S } from '@/collections/Admins'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

const MonCompte = z.object({
	user: z.object({ id: z.number(), email: z.string(), role: z.enum(['admin', 'redaction']) }).nullable(),
	exp: z.number().optional(),
})

/** « Mon compte » of the admin panel: which account the request is logged in as, and when its session ends. */
async function monCompte(enTetes: Record<string, string>) {
	const { statut, corps } = await appelerRest('GET', '/api/admins/me', { enTetes })
	expect(statut).toBe(200)
	return MonCompte.parse(corps)
}

describe('Les comptes admins : deux rôles, une session de 8 heures', () => {
	afterEach(async () => {
		setSystemTime()
		await viderLaBase()
	})

	test('la fabrique crée un compte admin et un compte redaction, et chacun ouvre sa session', async () => {
		const [admin, redaction] = await Promise.all([creerCompte('admin'), creerCompte('redaction')])

		expect((await monCompte(admin.session.enTetes)).user).toEqual({
			id: Number(admin.id),
			email: admin.email,
			role: 'admin',
		})
		expect((await monCompte(redaction.session.enTetes)).user).toEqual({
			id: Number(redaction.id),
			email: redaction.email,
			role: 'redaction',
		})
	})

	test('la session d’un compte admin dure 8 heures, puis elle n’ouvre plus rien (horloge simulée)', async () => {
		const debut = Date.now()
		const { email, session } = await creerCompte('admin')

		expect(DUREE_SESSION_ADMIN_S).toBe(8 * 3600)
		const { exp } = await monCompte(session.enTetes)
		// The token is signed for 8 hours from its opening, to the second.
		expect((exp ?? 0) - Math.floor(debut / 1000)).toBeGreaterThanOrEqual(8 * 3600 - 5)
		expect((exp ?? 0) - Math.floor(debut / 1000)).toBeLessThanOrEqual(8 * 3600 + 5)
		expect(session.expire.getTime()).toBe((exp ?? 0) * 1000)

		setSystemTime(new Date((exp ?? 0) * 1000 - 60_000))
		expect((await monCompte(session.enTetes)).user?.email).toBe(email)

		setSystemTime(new Date((exp ?? 0) * 1000 + 1000))
		expect((await monCompte(session.enTetes)).user).toBeNull()
	})

	test('la session d’un compte redaction dure aussi 8 heures', async () => {
		const debut = Date.now()
		const { session } = await creerCompte('redaction')
		const { exp } = await monCompte(session.enTetes)

		expect(Math.abs((exp ?? 0) - Math.floor(debut / 1000) - 8 * 3600)).toBeLessThanOrEqual(5)
		setSystemTime(new Date((exp ?? 0) * 1000 - 60_000))
		expect((await monCompte(session.enTetes)).user?.role).toBe('redaction')

		setSystemTime(new Date((exp ?? 0) * 1000 + 1000))
		expect((await monCompte(session.enTetes)).user).toBeNull()
	})

	test('sur une base vide, le premier compte est un admin, même si le formulaire disait redaction', async () => {
		const email = `premier-${crypto.randomUUID()}@example.test`

		// What Payload's « create the first account » screen posts, without any session.
		const { statut } = await appelerRest('POST', '/api/admins/first-register', {
			corps: { email, password: crypto.randomUUID(), role: 'redaction' },
		})

		expect(statut).toBe(200)
		const payload = await payloadDeTest()
		const { docs } = await payload.find({ collection: 'admins', where: { email: { equals: email } } })
		expect(docs.map(({ role }) => role)).toEqual(['admin'])
	})

	test('une fois le premier compte créé, l’écran du premier compte est fermé', async () => {
		await creerCompte('admin')
		const email = `second-${crypto.randomUUID()}@example.test`

		const { statut } = await appelerRest('POST', '/api/admins/first-register', {
			corps: { email, password: crypto.randomUUID(), role: 'admin' },
		})

		expect(statut).toBe(403)
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'admins', where: { email: { equals: email } } })).totalDocs).toBe(0)
	})

	test('un compte créé par un admin sans rôle choisi est un compte redaction, le plus étroit', async () => {
		const admin = await creerCompte('admin')
		const email = `sans-role-${crypto.randomUUID()}@example.test`

		const { statut, corps } = await appelerRest('POST', '/api/admins', {
			enTetes: admin.session.enTetes,
			corps: { email, password: crypto.randomUUID() },
		})

		expect(statut).toBe(201)
		expect((corps as { doc?: { role?: string } }).doc?.role).toBe('redaction')
	})
})
