import { afterAll, describe, expect, test } from 'bun:test'
import { authLog } from '@/lib/auth/auth-log'
import { createRateLimit, type RateLimit } from '@/lib/auth/rate-limit'
import { resendConfirmation } from '@/lib/auth/resend'
import { SIGN_UP_MESSAGES } from '@/lib/auth/sign-up'
import { SIGN_UP_FLOOR_MS, signUpAccount } from '@/lib/auth/sign-up-payload'
import type { MailboxRateLimits } from '@/lib/auth/sign-up-rate-limits'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { purgeUnconfirmedAccounts } from '@/lib/tasks/unconfirmed-accounts'
import { emptySink, mailReceived, waitMail } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * An address that already has an account (ticket 083; plan 02 E03, E04), the Gmail variants of an
 * address, and the purge of the accounts never confirmed (ticket 084). The page and the form are
 * played by tests/e2e/sign-up.spec.ts.
 */

afterAll(async () => {
	await Promise.all([emptyBase(), emptySink()])
})

const PASSWORD = 'aaaaaaaa'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'
const unique = () => crypto.randomUUID().slice(0, 8)
const address = (prefixe: string) => `${prefixe}-${crypto.randomUUID()}@example.test`

/** Brakes by mailbox on a clock the test moves. */
function rateLimitsWithClock(): { freins: MailboxRateLimits; avancer: (ms: number) => void } {
	let now = Date.now()
	const mount = (frein: RateLimit): RateLimit => ({
		prendre: cle => frein.prendre(cle, now),
		rendre: cle => frein.rendre(cle, now),
		vider: () => frein.vider(),
	})
	const name = crypto.randomUUID()
	return {
		freins: {
			parMinute: mount(createRateLimit({ nom: `minute-${name}`, limite: 1, fenetreMs: 60_000 })),
			parJour: mount(createRateLimit({ nom: `jour-${name}`, limite: 5, fenetreMs: 24 * 60 * 60 * 1000 })),
		},
		avancer: ms => {
			now += ms
		},
	}
}
const wideRateLimits = (): MailboxRateLimits => ({
	parMinute: createRateLimit({ nom: `larges-minute-${unique()}`, limite: 1000, fenetreMs: 60_000 }),
	parJour: createRateLimit({ nom: `larges-jour-${unique()}`, limite: 1000, fenetreMs: 60_000 }),
})

async function signUp(
	email: string,
	options: { plancherMs?: number; freins?: MailboxRateLimits; verifier?: boolean } = {}
) {
	const payload = await testPayload()
	return signUpAccount({
		payload,
		donnees: { prenom: 'Léa', nom: 'Fictive', email, password: PASSWORD },
		verifier: options.verifier ?? true,
		envoyer: payloadSendEmail(payload, serverEnv()),
		site: SITE,
		journal: authLog(payload),
		plancherMs: options.plancherMs ?? 0,
		freins: options.freins ?? wideRateLimits(),
	})
}

async function resend(email: string, freins: MailboxRateLimits) {
	const payload = await testPayload()
	return resendConfirmation({
		payload,
		email,
		envoyer: payloadSendEmail(payload, serverEnv()),
		site: SITE,
		journal: authLog(payload),
		plancherMs: 0,
		freins,
	})
}

const accounts = async () => (await (await testPayload()).count({ collection: 'pros' })).totalDocs
const profiles = async () => (await (await testPayload()).count({ collection: 'profiles' })).totalDocs
const log = async () =>
	(await (await testPayload()).find({ collection: 'auth-events', depth: 0, limit: 1000, sort: 'id' })).docs
const mailLink = (liens: string[]) => liens.find(l => l.includes('/auth/verification-complete'))
const median = (valeurs: number[]) => [...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0

describe('E03 : une adresse déjà utilisée ne révèle rien et ne crée pas de doublon', () => {
	test('même réponse que pour une adresse neuve, aucun second compte ni profil, et la vraie propriétaire, encore en attente, reçoit son lien de nouveau', async () => {
		const email = address('deja')
		const freshAddress = await signUp(email)
		await waitMail({ pour: email })
		const [c, p, mails] = [await accounts(), await profiles(), (await mailReceived(email)).length]

		// Typed in capitals, by someone else, under another name.
		const duplicate = await signUp(email.toUpperCase())

		expect(duplicate).toEqual(freshAddress)
		expect(await accounts()).toBe(c)
		expect(await profiles()).toBe(p)
		// Her account is still waiting: the mail she lost leaves again, with the same link.
		const received = await mailReceived(email)
		expect(received.length).toBe(mails + 1)
		expect(mailLink(received[1]?.liens ?? [])).toBe(mailLink(received[0]?.liens ?? []))
	})

	test('un compte confirmé reçoit « tu as déjà un compte », sans lien de confirmation', async () => {
		const email = address('confirme-deux-fois')
		await signUp(email, { verifier: false })
		const [c, p] = [await accounts(), await profiles()]

		const duplicate = await signUp(email)

		expect(duplicate).toEqual({ ok: true, confirmee: false })
		expect(await accounts()).toBe(c)
		expect(await profiles()).toBe(p)
		const mail = await waitMail({ pour: email })
		expect(mail.sujet).toContain('déjà un compte')
		expect(mailLink(mail.liens)).toBeUndefined()
		expect(mail.liens.some(l => l.endsWith('/auth/signin'))).toBe(true)
	})

	test('le journal garde le motif « email-deja-pris », sans adresse ni nom', async () => {
		const email = address('journal-pris')
		await signUp(email)
		const before = (await log()).length

		await signUp(email)

		const lines = (await log()).slice(before)
		expect(lines.map(({ type, code }) => [type, code])).toEqual([['sign-up', 'email-deja-pris']])
		expect(JSON.stringify(lines)).not.toContain('journal-pris')
	})

	test('une adresse que Payload refuse pour sa forme n’est jamais dite « déjà utilisée » : la phrase du champ, aucun compte (ticket 224)', async () => {
		// The form checks the address first; this is what a rule of Payload that the form does not know would give.
		const payload = await testPayload()
		const before = (await payload.count({ collection: 'pros', overrideAccess: true })).totalDocs
		const result = await signUp('pas-une-adresse')

		expect(result).toEqual({
			ok: false,
			code: 'email-invalide',
			erreurs: { email: SIGN_UP_MESSAGES.email.invalide },
		})
		expect((await payload.count({ collection: 'pros', overrideAccess: true })).totalDocs).toBe(before)
		expect((await log()).map(({ type, code }) => [type, code]).at(-1)).toEqual(['sign-up', 'donnees-invalides'])
	})

	test('un mail de la propriétaire qui ne part pas donne la même réponse que pour une adresse neuve dont le mail ne part pas', async () => {
		const email = address('relais-en-feu')
		await signUp(email)
		const payload = await testPayload()
		const down = () => Promise.reject(new Error('relais en feu'))
		const call = (adresse: string) =>
			signUpAccount({
				payload,
				donnees: { prenom: 'Léa', nom: 'Fictive', email: adresse, password: PASSWORD },
				verifier: true,
				envoyer: down,
				site: SITE,
				plancherMs: 0,
				freins: wideRateLimits(),
			})

		const taken = await call(email)
		const freshOne = await call(address('neuve-en-panne'))

		expect(taken).toEqual({ ok: false, code: 'service-indisponible' })
		expect(freshOne).toEqual(taken)
	})

	test('la confirmation coupée (AUTH_VERIFY=off) : la réponse honnête, car un compte neuf entrerait aussitôt', async () => {
		const email = address('sans-mur')
		await signUp(email, { verifier: false })

		expect(await signUp(email, { verifier: false })).toEqual({ ok: false, code: 'email-deja-pris' })
	})

	test('la durée de la réponse est la même, à 50 ms près, pour une adresse neuve ou prise', async () => {
		const takenAddress = address('duree-prise')
		await signUp(takenAddress)
		const measure = async (email: string) => {
			const start = performance.now()
			await signUp(email, { plancherMs: SIGN_UP_FLOOR_MS })
			return performance.now() - start
		}
		// Warm up (first connection, first render of the mail), then alternate the two cases.
		await measure(address('echauffement'))
		await measure(takenAddress)
		const freshAddresses: number[] = []
		const takenAddresses: number[] = []
		for (let i = 0; i < 5; i++) {
			freshAddresses.push(await measure(address('duree-neuve')))
			takenAddresses.push(await measure(takenAddress))
		}

		expect(Math.abs(median(freshAddresses) - median(takenAddresses))).toBeLessThan(50)
		expect(Math.min(...freshAddresses, ...takenAddresses)).toBeGreaterThanOrEqual(SIGN_UP_FLOOR_MS - 5)
	}, 60_000)

	test('une propriétaire submergée : au plus un mail « déjà un compte » par minute et par boîte', async () => {
		const email = address('submergee')
		const { freins: rateLimits, avancer } = rateLimitsWithClock()
		// A confirmed account (no mail, no place taken); the sign-ups that follow are on the wall's rules.
		await signUp(email, { verifier: false })
		const alreadyAnAccount = async () =>
			(await mailReceived(email)).filter(m => m.sujet.includes('déjà un compte')).length

		await signUp(email, { freins: rateLimits })
		await signUp(email, { freins: rateLimits })
		await signUp(email, { freins: rateLimits })
		expect(await alreadyAnAccount()).toBe(1)

		avancer(61_000)
		await signUp(email, { freins: rateLimits })
		expect(await alreadyAnAccount()).toBe(2)
	})
})

describe('variantes Gmail : une boîte, un compte', () => {
	const local = () => `zz.fictif${unique()}`
	test('points, étiquette « + », googlemail.com et majuscules sont la même boîte que le compte existant', async () => {
		const base = local()
		const existing = `${base.replace('.', '')}@gmail.com`
		await signUp(existing, { verifier: false })
		const c = await accounts()
		const p = await profiles()

		const variants = [
			`${base}@gmail.com`,
			`${base}+promo@gmail.com`,
			`${base.replace('.', '')}@googlemail.com`,
			`${base.toUpperCase()}@GMAIL.COM`,
			`z.z.f.i.c.t.i.f${base.slice(base.indexOf('fictif') + 6)}+x@gmail.com`,
		]
		const responses = []
		for (const variant of variants) responses.push(await signUp(variant))

		expect(responses).toEqual(Array(variants.length).fill({ ok: true, confirmee: false }))
		expect(await accounts()).toBe(c)
		expect(await profiles()).toBe(p)
		// The real owner is told, at the address stored.
		expect((await mailReceived(existing)).some(m => m.sujet.includes('déjà un compte'))).toBe(true)
	})

	test('l’inverse aussi : le compte existant porte les points, la variante n’en a pas', async () => {
		const base = `zz${unique()}`
		const existing = `${base.slice(0, 4)}.${base.slice(4)}@gmail.com`
		await signUp(existing)
		const c = await accounts()

		await signUp(`${base}@gmail.com`)

		expect(await accounts()).toBe(c)
	})

	test('ailleurs que chez Gmail, un point ou un « + » fait une autre boîte : le compte est créé', async () => {
		const base = unique()
		await signUp(`ab${base}@example.test`)
		const c = await accounts()

		const other = await signUp(`a.b${base}@example.test`)
		const tag = await signUp(`ab${base}+x@example.test`)

		expect([other, tag]).toEqual([
			{ ok: true, confirmee: false },
			{ ok: true, confirmee: false },
		])
		expect(await accounts()).toBe(c + 2)
	})
})

describe('E04 : le renvoi de la confirmation est limité', () => {
	test('un par minute, 5 par jour (l’inscription compte pour un), le même lien à chaque fois, et le jour suivant il repart', async () => {
		const email = address('renvoi')
		const { freins: rateLimits, avancer } = rateLimitsWithClock()
		await signUp(email, { freins: rateLimits })
		const first = await waitMail({ pour: email })
		const link = mailLink(first.liens)

		// The sign-up took the place of the minute: a resend at once is refused, one a minute later leaves.
		expect(await resend(email, rateLimits)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		for (let i = 2; i <= 5; i++) {
			avancer(61_000)
			expect(await resend(email, rateLimits)).toEqual({ ok: true })
			expect(await resend(email, rateLimits)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		}
		const received = await mailReceived(email)
		expect(received.length).toBe(5)
		expect(received.every(m => mailLink(m.liens) === link)).toBe(true)

		avancer(61_000)
		expect(await resend(email, rateLimits)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'jour' })
		expect((await mailReceived(email)).length).toBe(5)

		avancer(24 * 60 * 60 * 1000)
		expect(await resend(email, rateLimits)).toEqual({ ok: true })
		expect((await mailReceived(email)).length).toBe(6)
	})

	test('l’inscription suivie du renvoi donne les mêmes réponses pour une adresse neuve et pour une adresse prise : pas d’oracle', async () => {
		const takenAddress = address('oracle-prise')
		await signUp(takenAddress)
		const freshAddress = address('oracle-neuve')
		const { freins: rateLimits, avancer } = rateLimitsWithClock()
		const { freins: takenRateLimits, avancer: advanceTaken } = rateLimitsWithClock()
		// The taken address has an old account: its sign-up and resend run on their own clock.
		const sequence = async (email: string, f: MailboxRateLimits, avance: (ms: number) => void) => {
			const signedUp = await signUp(email, { freins: f })
			const first = await resend(email, f)
			avance(61_000)
			const second = await resend(email, f)
			return [signedUp, first, second]
		}

		const forFresh = await sequence(freshAddress, rateLimits, avancer)
		const forTaken = await sequence(takenAddress, takenRateLimits, advanceTaken)

		expect(forFresh[1]).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		expect(forTaken).toEqual(forFresh)
	})

	test('un second formulaire sur un compte pas encore confirmé renvoie son lien, pas « connecte-toi »', async () => {
		const email = address('relance')
		const { freins: rateLimits, avancer } = rateLimitsWithClock()
		await signUp(email, { freins: rateLimits })
		const first = await waitMail({ pour: email })
		avancer(61_000)

		await signUp(email, { freins: rateLimits })

		const received = await mailReceived(email)
		expect(received.length).toBe(2)
		expect(received.every(m => !m.sujet.includes('déjà un compte'))).toBe(true)
		expect(mailLink(received[1]?.liens ?? [])).toBe(mailLink(first.liens))
	})

	test('même réponse, même limite, pour une adresse sans compte : rien ne part et rien ne se devine', async () => {
		const { freins: rateLimits, avancer } = rateLimitsWithClock()
		const unknown = address('inconnue')

		expect(await resend(unknown, rateLimits)).toEqual({ ok: true })
		expect(await resend(unknown, rateLimits)).toMatchObject({ ok: false, code: 'trop-de-renvois', raison: 'minute' })
		avancer(61_000)
		expect(await resend(unknown, rateLimits)).toEqual({ ok: true })
		expect(await mailReceived(unknown)).toEqual([])
	})

	test('un compte déjà confirmé reçoit « tu as déjà un compte », pas un lien de confirmation', async () => {
		const email = address('confirme')
		await signUp(email, { verifier: false })

		expect(await resend(email, wideRateLimits())).toEqual({ ok: true })

		const mail = await waitMail({ pour: email })
		expect(mail.sujet).toContain('déjà un compte')
		expect(mailLink(mail.liens)).toBeUndefined()
	})

	test('les variantes Gmail d’une adresse partagent la même limite', async () => {
		const base = `zz.renvoi${unique()}`
		const { freins: rateLimits, avancer } = rateLimitsWithClock()
		await signUp(`${base.replace('.', '')}@gmail.com`, { freins: rateLimits })
		avancer(61_000)

		expect(await resend(`${base.replace('.', '')}@gmail.com`, rateLimits)).toEqual({ ok: true })
		expect(await resend(`${base}+x@gmail.com`, rateLimits)).toMatchObject({ ok: false, code: 'trop-de-renvois' })
	})

	test('une adresse qui n’en est pas une est dite telle, sans rien compter', async () => {
		const { freins: rateLimits } = rateLimitsWithClock()

		expect(await resend('pas-une-adresse', rateLimits)).toMatchObject({ ok: false, code: 'email-invalide' })
		expect(await resend('', rateLimits)).toMatchObject({ ok: false, code: 'email-invalide' })
	})

	test('le journal : un « renvoi » par demande, avec son issue, sans adresse', async () => {
		const email = address('journal-renvoi')
		const { freins: rateLimits, avancer } = rateLimitsWithClock()
		await signUp(email, { freins: rateLimits })
		avancer(61_000)
		const before = (await log()).length

		await resend(email, rateLimits)
		await resend(email, rateLimits)
		avancer(61_000)
		await resend(email, rateLimits)

		const lines = (await log()).slice(before)
		expect(lines.map(({ type, code }) => [type, code])).toEqual([
			['resend', 'ok'],
			['resend', 'trop-de-tentatives'],
			['resend', 'ok'],
		])
		expect(JSON.stringify(lines)).not.toContain('journal-renvoi')
	})
})

describe('purge des comptes jamais confirmés (ticket 084)', () => {
	const daysBefore = (jours: number) => new Date(Date.now() - jours * 24 * 60 * 60 * 1000).toISOString()

	async function create(options: {
		jours: number
		verifie?: boolean
		strapiId?: number
		legacyProvider?: string
		profilRempli?: boolean
	}) {
		const payload = await testPayload()
		const account = await payload.create({
			collection: 'pros',
			data: {
				email: address('purge'),
				password: PASSWORD,
				name: 'Compte Fictif',
				_verified: options.verifie ?? false,
				createdAt: daysBefore(options.jours),
				...(options.strapiId !== undefined && { strapiId: options.strapiId }),
				...(options.legacyProvider !== undefined && { legacyProvider: options.legacyProvider }),
			},
			depth: 0,
			disableVerificationEmail: true,
			overrideAccess: true,
		})
		const profile = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }))
			.docs[0]
		if (options.profilRempli && profile)
			await payload.update({
				collection: 'profiles',
				id: profile.id,
				data: { specialty: 'Maquillage de mariée' },
				depth: 0,
				overrideAccess: true,
			})
		return { compte: account, profil: profile }
	}
	const exists = async (collection: 'pros' | 'profiles', id: number) =>
		(await (await testPayload()).count({ collection, where: { id: { equals: id } } })).totalDocs === 1

	test('un compte non confirmé de 8 jours part avec son profil vide ; tout le reste est gardé', async () => {
		const payload = await testPayload()
		const stale = await create({ jours: 8 })
		const recent = await create({ jours: 6 })
		const confirmed = await create({ jours: 30, verifie: true })
		const imported = await create({ jours: 30, strapiId: 910_001 })
		const oldProvider = await create({ jours: 30, legacyProvider: 'local' })
		const filled = await create({ jours: 30, profilRempli: true })
		expect(filled.profil?.id).toBeDefined()

		const deleted = await purgeUnconfirmedAccounts.executer(payload, new Date())

		expect(deleted).toBe(1)
		expect(await exists('pros', stale.compte.id)).toBe(false)
		expect(await exists('profiles', stale.profil?.id ?? 0)).toBe(false)
		for (const guarded of [recent, confirmed, imported, oldProvider, filled]) {
			expect(await exists('pros', guarded.compte.id)).toBe(true)
			expect(await exists('profiles', guarded.profil?.id ?? 0)).toBe(true)
		}
	})

	test('la purge se rejoue sans effet, et le délai est de 7 jours pleins', async () => {
		const payload = await testPayload()
		const limit = await create({ jours: 7 })
		const just = await create({ jours: 6.9 })

		const firstOne = await purgeUnconfirmedAccounts.executer(payload, new Date())
		const secondOne = await purgeUnconfirmedAccounts.executer(payload, new Date())

		expect(firstOne).toBeGreaterThanOrEqual(1)
		expect(secondOne).toBe(0)
		expect(await exists('pros', limit.compte.id)).toBe(false)
		expect(await exists('pros', just.compte.id)).toBe(true)
	})
})
