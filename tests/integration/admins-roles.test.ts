import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { z } from 'zod'
import { ADMIN_SESSION_DURATION_S } from '@/collections/Admins'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

const MonCompte = z.object({
	user: z.object({ id: z.number(), email: z.string(), role: z.enum(['admin', 'editor']) }).nullable(),
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
			role: 'editor',
		})
	})

	test('la session d’un compte admin dure 8 heures, puis elle n’ouvre plus rien (horloge simulée)', async () => {
		const debut = Date.now()
		const { email, session } = await creerCompte('admin')

		expect(ADMIN_SESSION_DURATION_S).toBe(8 * 3600)
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
		expect((await monCompte(session.enTetes)).user?.role).toBe('editor')

		setSystemTime(new Date((exp ?? 0) * 1000 + 1000))
		expect((await monCompte(session.enTetes)).user).toBeNull()
	})

	test('sur une base vide, l’écran du premier compte est fermé : un visiteur n’y crée aucun compte', async () => {
		const email = `premier-${crypto.randomUUID()}@example.test`
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)

		// What Payload's « create the first account » screen posts, without any session.
		const { statut } = await appelerRest('POST', '/api/admins/first-register', {
			corps: { email, password: crypto.randomUUID(), role: 'admin' },
		})

		expect(statut).toBe(403)
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
	})

	test('sur une base vide, la session d’une maquilleuse ne crée aucun compte admin, avec ou sans rôle dans le corps', async () => {
		const maquilleuse = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()

		for (const corps of [
			{ role: 'editor' },
			{ role: 'admin' },
			// Without a role: the default would be `editor`.
			{},
		]) {
			const { statut } = await appelerRest('POST', '/api/admins/first-register', {
				enTetes: maquilleuse.session.enTetes,
				corps: { email: `intrus-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID(), ...corps },
			})
			expect([JSON.stringify(corps), statut]).toEqual([JSON.stringify(corps), 403])
		}
		expect((await payload.count({ collection: 'admins' })).totalDocs).toBe(0)
	})

	test('le premier compte se crée par la Local API de la procédure d’exploitation, avec le rôle admin', async () => {
		const email = `procedure-${crypto.randomUUID()}@example.test`
		const payload = await payloadDeTest()

		// What `bun run admin:create` does: the Local API, without any request.
		await payload.create({ collection: 'admins', data: { email, password: crypto.randomUUID(), role: 'admin' } })

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
		expect((corps as { doc?: { role?: string } }).doc?.role).toBe('editor')
	})
})

describe('Le frein par adresse sur la connexion du back-office (ticket 094)', () => {
	const MOT_DE_PASSE = 'un-mot-de-passe-de-test-094'
	const connexion = (email: string, password: string, xForwardedFor: string) =>
		appelerRest('POST', '/api/admins/login', {
			corps: { email, password },
			enTetes: { 'x-forwarded-for': xForwardedFor },
		})

	afterEach(async () => {
		await viderLaBase()
	})

	test('le 11e échec d’une adresse est refusé en 429, même avec le bon mot de passe ; une autre adresse reste libre', async () => {
		const compte = await creerCompte('admin', { motDePasse: () => MOT_DE_PASSE })
		const adresseFrenee = '203.0.113.40'

		for (let i = 0; i < 10; i++) expect((await connexion(compte.email, `faux-${i}`, adresseFrenee)).statut).toBe(401)
		const onzieme = await connexion(compte.email, 'faux-10', adresseFrenee)

		expect(onzieme.statut).toBe(429)
		expect(onzieme.texte).toContain('Trop d’essais, réessaie dans quelques minutes.')
		expect((await connexion(compte.email, MOT_DE_PASSE, adresseFrenee)).statut).toBe(429)
		// Another address is not braked, and the account is not locked: the right password gets in.
		expect((await connexion(compte.email, MOT_DE_PASSE, '203.0.113.41')).statut).toBe(200)
	})

	test('des mots de passe faux sous le frein ne verrouillent pas le compte, pour aucune adresse', async () => {
		const compte = await creerCompte('admin', { motDePasse: () => MOT_DE_PASSE })

		// Well past the 5 failures of Payload's default lock, still under the brake of 10.
		for (let i = 0; i < 8; i++) expect((await connexion(compte.email, `faux-${i}`, '203.0.113.43')).statut).toBe(401)

		expect((await connexion(compte.email, MOT_DE_PASSE, '203.0.113.44')).statut).toBe(200)
	})

	test('un admin qui se trompe pas se connecte, avec son cookie', async () => {
		const compte = await creerCompte('admin', { motDePasse: () => MOT_DE_PASSE })

		const { statut, enTetes } = await connexion(compte.email, MOT_DE_PASSE, '203.0.113.42')

		expect(statut).toBe(200)
		expect(enTetes.get('set-cookie') ?? '').toStartWith('payload-token=')
	})
})
