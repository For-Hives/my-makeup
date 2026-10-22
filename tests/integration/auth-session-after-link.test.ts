import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { deleteAccountAndDependents } from '@/lib/account/deletion'
import { authLog } from '@/lib/auth/auth-log'
import { confirmEmail, confirmLink } from '@/lib/auth/confirmation'
import { resetPassword } from '@/lib/auth/password-reset-payload'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { openSessionAfterConfirmation } from '@/lib/auth/session-after-link'
import { openWithoutPassword } from '@/lib/auth/token'
import { createAccount } from '../support/account-factory'
import { emptySink } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

setDefaultTimeout(30_000)

/**
 * The makeup artist is signed in after she confirmed her address or chose a new password (ticket 302).
 * What is checked here is the server side, played against the bench database: the single use of the
 * link, its window, the accounts that never get a session, the fallback, and what the journal holds.
 */

afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})
beforeEach(async () => {
	await emptyBase()
})

const NEW_PASSWORD = 'nouveau-mot-de-passe-fictif'
let n = 0
const clientUrl = () => new Headers({ 'x-forwarded-for': `203.0.113.${1 + (n++ % 250)}` })
const free = () => createRateLimit({ nom: `essai-lien-${n++}`, limite: 1000, fenetreMs: 60_000 })

type Row = {
	id: number
	_verified?: boolean
	_verificationToken?: string | null
	blocked?: boolean
	sessions?: unknown[]
	createdAt?: string
}

const row = async (id: number | string) =>
	(await testPayload()).db.findOne<Row>({ collection: 'pros', where: { id: { equals: id } } })

/** An account that waits for its link: the token of the sign-up is read from the table, as the mail would carry it. */
async function waitingAccount(options: { blocked?: boolean; createdAgoMs?: number } = {}) {
	const account = await createAccount('maquilleuse-non-verifiee')
	const payload = await testPayload()
	const data: Record<string, unknown> = {}
	if (options.blocked) data.blocked = true
	if (options.createdAgoMs !== undefined) data.createdAt = new Date(Date.now() - options.createdAgoMs).toISOString()
	if (Object.keys(data).length > 0)
		await payload.db.updateOne({
			collection: 'pros',
			data,
			returning: false,
			where: { id: { equals: account.id } },
		})
	const stored = await row(account.id)
	const token = stored?._verificationToken ?? ''
	expect(token).toMatch(/^[0-9a-f]{40}$/)
	return { ...account, token }
}

const log = async () =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, limit: 1000, sort: 'id' })).docs

const openAfterConfirmation = async (code: string, open?: typeof openWithoutPassword) => {
	const payload = await testPayload()
	return openSessionAfterConfirmation({ payload, code, journal: authLog(payload), ...(open ? { open } : {}) })
}

describe('302 : le lien de confirmation, puis un clic, ouvre la session une seule fois', () => {
	test('un jeton récent : la page confirme et propose la session ; le clic l’ouvre, avec une session enregistrée sur le compte', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()

		const outcome = await confirmLink(payload, account.token, authLog(payload))
		expect(outcome).toEqual({ result: 'ok', sessionOffered: true })
		expect((await row(account.id))?._verified).toBe(true)
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)

		const opened = await openAfterConfirmation(account.token)
		expect(opened.ok).toBe(true)
		expect(opened.ok && opened.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
		expect((await row(account.id))?.sessions).toHaveLength(1)
	})

	test('le même lien rejoué après le clic n’ouvre rien, et la page dit « déjà confirmé »', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()
		await confirmLink(payload, account.token, authLog(payload))
		expect((await openAfterConfirmation(account.token)).ok).toBe(true)

		expect((await openAfterConfirmation(account.token)).ok).toBe(false)
		expect(await confirmLink(payload, account.token)).toEqual({ result: 'deja-confirme', sessionOffered: false })
		expect((await row(account.id))?.sessions).toHaveLength(1)
	})

	test('le clic sans que la page ait confirmé n’ouvre rien : le jeton brut ne vaut pas une session', async () => {
		const account = await waitingAccount()
		expect((await openAfterConfirmation(account.token)).ok).toBe(false)
		expect((await row(account.id))?._verified).toBe(false)
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
	})

	test('un lecteur de courrier qui ouvre le lien avant elle confirme le compte, mais ne garde aucune session ; elle peut encore cliquer', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()
		await confirmEmail(payload, account.token) // the scanner
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)

		expect(await confirmLink(payload, account.token)).toEqual({ result: 'ok', sessionOffered: true }) // her visit
		expect((await openAfterConfirmation(account.token)).ok).toBe(true)
	})

	test('deux clics au même instant : une seule session', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()
		await confirmLink(payload, account.token)

		const outcomes = await Promise.all([openAfterConfirmation(account.token), openAfterConfirmation(account.token)])

		expect(outcomes.filter(o => o.ok)).toHaveLength(1)
		expect((await row(account.id))?.sessions).toHaveLength(1)
	})

	test('deux ouvertures du lien au même instant, puis deux clics : une seule session', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()

		await Promise.all([confirmEmail(payload, account.token), confirmEmail(payload, account.token)])
		const outcomes = await Promise.all([openAfterConfirmation(account.token), openAfterConfirmation(account.token)])

		expect((await row(account.id))?._verified).toBe(true)
		expect(outcomes.filter(o => o.ok)).toHaveLength(1)
		expect((await row(account.id))?.sessions).toHaveLength(1)
	})

	test('un jeton périmé (compte créé il y a plus d’une heure) confirme le compte mais ne propose ni n’ouvre aucune session', async () => {
		const account = await waitingAccount({ createdAgoMs: 2 * 3_600_000 })
		const payload = await testPayload()

		expect(await confirmLink(payload, account.token)).toEqual({ result: 'ok', sessionOffered: false })
		expect((await row(account.id))?._verified).toBe(true)
		expect((await openAfterConfirmation(account.token)).ok).toBe(false)
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
	})

	test('un jeton qui devient périmé entre la page et le clic n’ouvre rien', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()
		await confirmLink(payload, account.token)
		await payload.db.updateOne({
			collection: 'pros',
			data: { createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString() },
			returning: false,
			where: { id: { equals: account.id } },
		})

		expect((await openAfterConfirmation(account.token)).ok).toBe(false)
	})

	test('un compte bloqué par l’équipe n’est jamais connecté par ce chemin, et rien ne le dit à celui qui tient le lien', async () => {
		const account = await waitingAccount({ blocked: true })
		const payload = await testPayload()
		await confirmLink(payload, account.token)

		const opened = await openAfterConfirmation(account.token)

		expect(opened).toEqual({ ok: false })
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
		expect((await log()).map(({ type, code, method }) => [type, code, method]).at(-1)).toEqual([
			'sign-in',
			'compte-bloque',
			'confirmation',
		])
	})

	test('un compte supprimé : son lien ne connaît plus personne', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()
		await deleteAccountAndDependents(payload, account.id)

		expect(await confirmLink(payload, account.token)).toEqual({ result: 'lien-invalide', sessionOffered: false })
		expect((await openAfterConfirmation(account.token)).ok).toBe(false)
	})

	test('un code de la mauvaise forme ou inconnu n’ouvre rien', async () => {
		await waitingAccount()
		for (const code of ['', 'x', 'f'.repeat(40), `${'a'.repeat(39)}`, 'A'.repeat(40)])
			expect((await openAfterConfirmation(code)).ok).toBe(false)
	})

	test('une ouverture qui échoue : le compte reste confirmé, aucune session, et la ligne du journal le dit', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()
		await confirmLink(payload, account.token)

		const opened = await openAfterConfirmation(account.token, () => Promise.reject(new Error('base indisponible')))

		expect(opened).toEqual({ ok: false })
		expect((await row(account.id))?._verified).toBe(true)
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
		expect((await log()).at(-1)).toMatchObject({
			type: 'sign-in',
			code: 'service-indisponible',
			method: 'confirmation',
		})
	})

	test('le journal garde l’origine de la session, et ni lui ni la base ne gardent le jeton', async () => {
		const account = await waitingAccount()
		const payload = await testPayload()
		await confirmLink(payload, account.token, authLog(payload))
		const opened = await openAfterConfirmation(account.token)

		expect((await log()).map(({ type, code, method }) => [type, code, method ?? null])).toEqual([
			['confirmation', 'ok', null],
			['sign-in', 'ok', 'confirmation'],
		])
		const stored = (await row(account.id))?._verificationToken
		expect(stored).toStartWith('utilise:')
		expect(stored).not.toContain(account.token)
		const dump = JSON.stringify(await log())
		expect(dump).not.toContain(account.token)
		expect(opened.ok && dump.includes(opened.token)).toBe(false)
	})
})

describe('302 : le nouveau mot de passe ouvre la session', () => {
	const OLD = 'ancien-mot-de-passe-fictif'
	const known = () => createAccount('maquilleuse', { motDePasse: () => OLD })
	const linkToken = async (email: string) => {
		const token = await (await testPayload()).forgotPassword({
			collection: 'pros',
			data: { email },
			disableEmail: true,
		})
		return token
	}
	const reset = async (jeton: string, open?: typeof openWithoutPassword) => {
		const payload = await testPayload()
		return resetPassword({
			payload,
			headers: clientUrl(),
			jeton,
			motDePasse: NEW_PASSWORD,
			confirmation: NEW_PASSWORD,
			frein: free(),
			journal: authLog(payload),
			...(open ? { ouvrirSession: open } : {}),
		})
	}

	test('une session, la seule du compte : les autres appareils sont déconnectés', async () => {
		const account = await known() // opens a first session
		expect((await row(account.id))?.sessions?.length).toBeGreaterThan(0)

		const result = await reset(await linkToken(account.email), openWithoutPassword)

		expect(result.ok && result.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
		expect((await row(account.id))?.sessions).toHaveLength(1)
	})

	test('le lien rejoué ne rouvre rien', async () => {
		const account = await known()
		const token = await linkToken(account.email)
		expect((await reset(token, openWithoutPassword)).ok).toBe(true)

		expect(await reset(token, openWithoutPassword)).toEqual({ ok: false, code: 'code-invalide' })
		expect((await row(account.id))?.sessions).toHaveLength(1)
	})

	test('un compte bloqué : Payload refuse déjà le choix du mot de passe, et aucune session ne s’ouvre', async () => {
		const account = await known()
		const payload = await testPayload()
		await payload.update({ collection: 'pros', id: account.id, data: { blocked: true }, overrideAccess: true })

		const result = await reset(await linkToken(account.email), openWithoutPassword)

		expect(result).toEqual({ ok: false, code: 'code-invalide' })
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
	})

	test('une adresse jamais confirmée n’obtient pas de session par ce chemin : la porte de la confirmation reste fermée', async () => {
		const account = await waitingAccount()
		const result = await reset(await linkToken(account.email), openWithoutPassword)

		expect(result).toEqual({ ok: true })
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
	})

	test('une ouverture qui échoue : le mot de passe est enregistré, le résultat est celui d’aujourd’hui', async () => {
		const account = await known()

		const result = await reset(await linkToken(account.email), () => Promise.reject(new Error('base indisponible')))

		expect(result).toEqual({ ok: true })
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
		expect((await log()).at(-1)).toMatchObject({
			type: 'sign-in',
			code: 'service-indisponible',
			method: 'password-reset',
		})
	})

	test('sans ouvreur donné, aucune session (le comportement des essais d’avant)', async () => {
		const account = await known()
		expect(await reset(await linkToken(account.email))).toEqual({ ok: true })
		expect((await row(account.id))?.sessions ?? []).toHaveLength(0)
	})

	test('le journal garde l’origine, jamais le jeton du lien ni le mot de passe', async () => {
		const account = await known()
		const token = await linkToken(account.email)
		await reset(token, openWithoutPassword)

		const lines = await log()
		expect(lines.map(({ type, code, method }) => [type, code, method ?? null]).slice(-2)).toEqual([
			['password-reset', 'ok', null],
			['sign-in', 'ok', 'password-reset'],
		])
		const dump = JSON.stringify(lines)
		expect(dump).not.toContain(token)
		expect(dump).not.toContain(NEW_PASSWORD)
	})
})
