import { afterEach, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { replaceLegacyHash } from '@/lib/auth/legacy'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'
import { openWithPassword } from '@/lib/auth/token'
import { createAccount, FIXTURE_LEGACY_PASSWORD } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The sign-in of an account of the old site (tickets 087 and 088; plan 02 I15). The browser side,
 * the Server Action and the cookie are played by tests/e2e/legacy-sign-in.spec.ts (E73).
 */

afterEach(emptyBase)

const url = (n: number) => new Headers({ 'x-forwarded-for': `192.0.2.${n}` })

async function wire(nomDuFrein: string) {
	const payload = await testPayload()
	const calls = { herite: 0 }
	return {
		payload,
		appels: calls,
		frein: createRateLimit({ nom: nomDuFrein, limite: 100, fenetreMs: 60_000 }),
		entrees: {
			ouvrir: (data: { email: string; password: string }) => openWithPassword(payload, 'pros', data),
			herite: (data: { email: string; password: string }) => {
				calls.herite++
				return replaceLegacyHash(payload, data)
			},
			journal: authLog(payload),
		},
	}
}

interface Line {
	id: number
	legacyBcrypt?: string | null
	hash?: string
	salt?: string
}

async function accountLine(id: number | string): Promise<Line> {
	const line = await (await testPayload()).db.findOne<Line>({ collection: 'pros', where: { id: { equals: id } } })
	if (!line) throw new Error('le compte n’est pas en base')
	return line
}

const ranked = async (code: string) =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, where: { code: { equals: code } } })).docs

describe('I15 : un compte migré (bcrypt) se connecte, son hash est remplacé, la seconde connexion est en pbkdf2', () => {
	test('le mot de passe habituel ouvre le compte, une fois, puis le hash hérité n’existe plus', async () => {
		const account = await createAccount('reprise-avec-hash')
		const { entrees: entries, appels: calls, frein: rateLimit } = await wire('essai-int-herite-1')
		const before = await accountLine(account.id)
		expect(before.legacyBcrypt).toStartWith('$2a$10$')

		const first = await signInWithPassword({
			...entries,
			headers: url(21),
			email: account.email,
			password: FIXTURE_LEGACY_PASSWORD,
			frein: rateLimit,
		})

		expect(first.ok).toBe(true)
		expect(calls.herite).toBe(1)
		const after = await accountLine(account.id)
		expect(after.legacyBcrypt ?? null).toBeNull()
		// Payload's own format now: a new salt and a new hash, not the random ones of the import.
		expect(after.hash).not.toBe(before.hash)
		expect(after.salt).not.toBe(before.salt)
		expect(await ranked('heritee')).toHaveLength(1)

		// The second sign-in is Payload's own: the old-hash path is not asked.
		const second = await signInWithPassword({
			...entries,
			headers: url(21),
			email: account.email,
			password: FIXTURE_LEGACY_PASSWORD,
			frein: rateLimit,
		})
		expect(second.ok).toBe(true)
		expect(calls.herite).toBe(1)
		expect((await ranked('heritee')).length).toBe(1)
		expect((await ranked('ok')).length).toBe(1)
	})

	test('un mauvais mot de passe : message générique, hash hérité et mot de passe Payload intacts', async () => {
		const account = await createAccount('reprise-avec-hash')
		const { entrees: entries, frein: rateLimit } = await wire('essai-int-herite-2')
		const before = await accountLine(account.id)

		const r = await signInWithPassword({
			...entries,
			headers: url(22),
			email: account.email,
			password: 'pas-le-bon',
			frein: rateLimit,
		})

		expect(r).toEqual({ ok: false, code: 'identifiants-invalides' })
		const after = await accountLine(account.id)
		expect(after).toEqual(before)
		expect(await ranked('heritee')).toEqual([])
		expect((await ranked('identifiants-invalides')).length).toBe(1)
	})

	test('l’adresse s’écrit comme on veut : casse et espaces de bord', async () => {
		const account = await createAccount('reprise-avec-hash')
		const { entrees: entries, frein: rateLimit } = await wire('essai-int-herite-3')
		const r = await signInWithPassword({
			...entries,
			headers: url(23),
			email: ` ${account.email.toUpperCase()} `,
			password: FIXTURE_LEGACY_PASSWORD,
			frein: rateLimit,
		})
		expect(r.ok).toBe(true)
	})

	test('un compte Google avec hash se connecte aussi par son ancien mot de passe ; sans hash, il est refusé', async () => {
		const [withHash, withoutHash] = await Promise.all([
			createAccount('reprise-google-avec-hash'),
			createAccount('reprise-google'),
		])
		const { entrees: entries, frein: rateLimit } = await wire('essai-int-herite-4')
		const just = await signInWithPassword({
			...entries,
			headers: url(24),
			email: withHash.email,
			password: FIXTURE_LEGACY_PASSWORD,
			frein: rateLimit,
		})
		const refusal = await signInWithPassword({
			...entries,
			headers: url(24),
			email: withoutHash.email,
			password: FIXTURE_LEGACY_PASSWORD,
			frein: rateLimit,
		})
		expect(just.ok).toBe(true)
		expect(refusal).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('le hash hérité ne sort ni par REST ni par l’API locale, pour un admin comme pour la propriétaire', async () => {
		const [admin, account] = await Promise.all([createAccount('admin'), createAccount('reprise-avec-hash')])
		const hash = (await accountLine(account.id)).legacyBcrypt ?? ''
		expect(hash).not.toBe('')

		const rest = await callRest('GET', `/api/pros/${account.id}`, { enTetes: admin.session.enTetes })
		const list = await callRest('GET', '/api/pros?limit=100', { enTetes: admin.session.enTetes })
		const payload = await testPayload()
		const locale = await payload.findByID({
			collection: 'pros',
			id: account.id,
			depth: 0,
			overrideAccess: false,
			user: { ...(await payload.findByID({ collection: 'admins', id: admin.id, depth: 0 })), collection: 'admins' },
		})
		const dump = JSON.stringify([rest.texte, list.texte, locale])
		expect(dump).not.toContain(hash)
		expect(dump).not.toContain('legacyBcrypt')
		expect(dump).not.toContain('$2a$')
	})

	test('un mot de passe choisi autrement (admin, API locale) efface le hash hérité : l’ancien ne marche plus, le nouveau si', async () => {
		const account = await createAccount('reprise-avec-hash')
		const { entrees: entries, appels: calls, frein: rateLimit } = await wire('essai-int-herite-6')
		const payload = await testPayload()
		const fresh = 'nouveau-mot-de-passe-42'

		await payload.update({ collection: 'pros', id: account.id, data: { password: fresh }, overrideAccess: true })

		expect((await accountLine(account.id)).legacyBcrypt ?? null).toBeNull()
		const old = await signInWithPassword({
			...entries,
			headers: url(26),
			email: account.email,
			password: FIXTURE_LEGACY_PASSWORD,
			frein: rateLimit,
		})
		const chosen = await signInWithPassword({
			...entries,
			headers: url(26),
			email: account.email,
			password: fresh,
			frein: rateLimit,
		})
		expect(old).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(chosen.ok).toBe(true)
		expect(calls.herite).toBe(1)
		expect(await ranked('heritee')).toHaveLength(0)
	})

	test('un mot de passe défini par l’admin en REST efface aussi le hash hérité', async () => {
		const [admin, account] = await Promise.all([createAccount('admin'), createAccount('reprise-avec-hash')])
		const { statut: status } = await callRest('PATCH', `/api/pros/${account.id}`, {
			corps: { password: 'choisi-par-l-admin-42' },
			enTetes: admin.session.enTetes,
		})
		expect(status).toBe(200)
		expect((await accountLine(account.id)).legacyBcrypt ?? null).toBeNull()
	})

	test('le lien de réinitialisation efface le hash hérité : l’ancien mot de passe ne marche plus', async () => {
		const account = await createAccount('reprise-avec-hash')
		const { entrees: entries, frein: rateLimit } = await wire('essai-int-herite-7')
		const payload = await testPayload()
		const fresh = 'apres-reinitialisation-42'

		const token = await payload.forgotPassword({
			collection: 'pros',
			data: { email: account.email },
			disableEmail: true,
		})
		await payload.resetPassword({ collection: 'pros', data: { token: token, password: fresh }, overrideAccess: true })

		expect((await accountLine(account.id)).legacyBcrypt ?? null).toBeNull()
		const old = await signInWithPassword({
			...entries,
			headers: url(27),
			email: account.email,
			password: FIXTURE_LEGACY_PASSWORD,
			frein: rateLimit,
		})
		const chosen = await signInWithPassword({
			...entries,
			headers: url(27),
			email: account.email,
			password: fresh,
			frein: rateLimit,
		})
		expect(old).toEqual({ ok: false, code: 'identifiants-invalides' })
		expect(chosen.ok).toBe(true)
	})

	test('la porte REST native ne connaît pas le chemin hérité : le compte y reçoit un refus', async () => {
		const account = await createAccount('reprise-avec-hash')
		const { statut: status } = await callRest('POST', '/api/pros/login', {
			corps: { email: account.email, password: FIXTURE_LEGACY_PASSWORD },
			enTetes: { 'x-forwarded-for': '192.0.2.25' },
		})
		expect(status).toBe(401)
		expect((await accountLine(account.id)).legacyBcrypt).toStartWith('$2a$10$')
	})
})

describe('088 : la porte REST répond aux refus avec le même plancher et la même réponse', () => {
	test('adresse inconnue, mauvais mot de passe, compte hérité : 401, même corps, jamais avant 300 ms', async () => {
		const [known, legacy] = await Promise.all([createAccount('maquilleuse'), createAccount('reprise-avec-hash')])
		const tests = ['personne@example.test', known.email, legacy.email]
		const responses: { statut: number; texte: string; duree: number }[] = []
		for (const email of tests) {
			const start = performance.now()
			const { statut: status, texte: text } = await callRest('POST', '/api/pros/login', {
				corps: { email, password: 'pas-le-bon' },
				enTetes: { 'x-forwarded-for': '192.0.2.26' },
			})
			responses.push({ statut: status, texte: text, duree: performance.now() - start })
		}

		expect(responses.map(r => r.statut)).toEqual([401, 401, 401])
		expect(new Set(responses.map(r => r.texte)).size).toBe(1)
		// A lower bound only: a timer may fire a hair early, and the work itself may take longer.
		for (const { duree: duration } of responses) expect(duration).toBeGreaterThanOrEqual(290)
	})
})
