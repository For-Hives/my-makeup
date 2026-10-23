import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { deleteAccountAndDependents } from '@/lib/account/deletion'
import { payloadSendEmail } from '@/lib/emails/send'
import { serverEnv } from '@/lib/env'
import { markMyQuote, readMyQuotes } from '@/lib/quote/dashboard'
import { createQuoteRateLimits } from '@/lib/quote/rate-limit'
import { saveQuoteRequest } from '@/lib/quote/save'
import { payloadQuoteStore } from '@/lib/quote/store'
import { runDailyTasks } from '@/lib/tasks/daily'
import { purgeQuoteRequests } from '@/lib/tasks/quote-requests'
import { readQuoteFacts } from '@/services/public/quote-facts'
import { createAccount, type TestAccount } from '../support/account-factory'
import { activateProfile } from '../support/active-profile'
import { mailReceived } from '../support/mailpit'
import { emptyBase, testPayload } from '../support/payload-test'

/**
 * Issue 1003: the quote requests, against the real store and the mail catcher of the bench. The same rules
 * with doubles: tests/unit/quote-request.test.ts. Nothing here reaches a real address.
 */

afterEach(emptyBase)

type Artist = TestAccount<'maquilleuse'>

const FORM = {
	eventDate: '2028-06-12',
	place: 'Annecy',
	serviceType: 'wedding',
	message: 'Mariage civil, une trentaine d’invités.',
	firstName: 'Camille',
	phone: '06 12 34 56 78',
	consent: 'on',
}

const NO_LOG = { info: () => undefined, erreur: () => undefined }

/** A published profile of an artist with a way to reach her (a network), unless said otherwise. */
async function artist(
	options: { chosenStatus?: 'published' | 'hidden' | 'draft'; available?: boolean; networks?: boolean } = {}
) {
	const account: Artist = await createAccount('maquilleuse')
	const payload = await testPayload()
	await activateProfile(account.id)
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } })
	const profile = docs[0]
	if (!profile) throw new Error('pas de profil')
	await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: {
			chosenStatus: options.chosenStatus ?? 'published',
			available: options.available ?? true,
			...(options.networks !== false && { networks: { instagram: 'https://www.instagram.com/fictive' } }),
		},
	})
	const { docs: fresh } = await payload.find({
		collection: 'profiles',
		depth: 0,
		where: { id: { equals: profile.id } },
	})
	return { account, payload, profileId: profile.id, slug: fresh[0]?.slug ?? '' }
}

let counter = 0
async function send(payload: Payload, slug: string, over: Record<string, unknown> = {}, enabled = true) {
	counter++
	const values: Record<string, unknown> = {
		...FORM,
		email: `cliente-${counter}-${crypto.randomUUID()}@example.test`,
		...over,
	}
	const jobs: Promise<void>[] = []
	const door = payloadSendEmail(payload, serverEnv())
	const result = await saveQuoteRequest({
		form: { get: name => values[name] },
		slug,
		enabled,
		now: new Date(),
		store: payloadQuoteStore(payload, readQuoteFacts),
		send: async email => void (await door(email)),
		site: 'http://localhost:3100',
		after: job => void jobs.push(job()),
		log: NO_LOG,
		client: `203.0.113.${(counter % 200) + 1}`,
		limits: createQuoteRateLimits(crypto.randomUUID()),
	})
	await Promise.all(jobs)
	return { result, email: String(values.email) }
}

const rows = async (payload: Payload) =>
	(await payload.find({ collection: 'quote-requests', depth: 0, pagination: false })).docs

describe('1003 : la demande de devis', () => {
	test('elle est enregistrée, la maquilleuse reçoit un courriel à objet fixe avec réponse à la cliente, la cliente un accusé', async () => {
		const { account, payload, slug, profileId } = await artist()
		const { result, email } = await send(payload, slug)
		expect(result).toEqual({ ok: true })
		const [row] = await rows(payload)
		expect(row).toMatchObject({
			profile: profileId,
			status: 'new',
			mailStatus: 'sent',
			eventDate: '2028-06-12',
			serviceType: 'wedding',
		})

		const artistMails = await mailReceived(account.email)
		expect(artistMails).toHaveLength(1)
		expect(artistMails[0]?.sujet).toBe('Nouvelle demande de devis sur My Makeup')
		expect(artistMails[0]?.repondreA.map(({ adresse }) => adresse)).toEqual([email])
		expect(artistMails[0]?.texte).toContain(FORM.message)
		expect(artistMails[0]?.liens.some(link => link.endsWith('/auth/profil'))).toBe(true)

		const clientMails = await mailReceived(email)
		expect(clientMails).toHaveLength(1)
		expect(clientMails[0]?.sujet).toBe('Votre demande de devis a bien été envoyée')
		expect(clientMails[0]?.texte).not.toContain(FORM.message)
		expect(clientMails[0]?.texte).not.toContain('Camille')
	})

	test('un profil masqué, un brouillon, une maquilleuse sans moyen de la joindre ou en pause : refusé, rien n’est enregistré ni envoyé', async () => {
		for (const options of [
			{ chosenStatus: 'hidden' as const },
			{ chosenStatus: 'draft' as const },
			{ networks: false },
			{ available: false },
		]) {
			const { account, payload, slug } = await artist(options)
			const { result, email } = await send(payload, slug)
			expect(result).toEqual({ ok: false, code: 'indisponible' })
			expect(await rows(payload)).toEqual([])
			expect(await mailReceived(account.email)).toEqual([])
			expect(await mailReceived(email)).toEqual([])
			await emptyBase()
		}
	})

	test('l’interrupteur éteint : refusé même pour un profil qui convient', async () => {
		const { payload, slug } = await artist()
		const { result } = await send(payload, slug, {}, false)
		expect(result).toEqual({ ok: false, code: 'indisponible' })
		expect(await rows(payload)).toEqual([])
	})

	test('le contact de la cliente n’est jamais dans la lecture publique du profil', async () => {
		const { payload, slug } = await artist()
		const { email } = await send(payload, slug)
		const { readPublicProfile } = await import('@/services/public/profiles')
		const publicRead = JSON.stringify(await readPublicProfile(payload, slug))
		expect(publicRead).not.toContain(email)
		expect(publicRead).not.toContain(FORM.phone)
	})
})

describe('1003 : le suivi dans l’espace', () => {
	test('elle ne voit que ses demandes, la plus récente d’abord, et en change l’état', async () => {
		const mine = await artist()
		const other = await artist()
		await send(mine.payload, mine.slug, { message: 'La première.' })
		await send(mine.payload, mine.slug, { message: 'La seconde.' })
		await send(other.payload, other.slug, { message: 'Pour une autre.' })

		const quotes = await readMyQuotes(mine.payload, mine.profileId)
		expect(quotes?.map(quote => quote.message)).toEqual(['La seconde.', 'La première.'])
		expect(quotes?.every(quote => quote.status === 'new')).toBe(true)

		const first = quotes?.[0]
		if (!first) throw new Error('pas de demande')
		expect(await markMyQuote(mine.payload, mine.profileId, { id: first.id, status: 'answered' })).toEqual({
			ok: true,
			status: 'answered',
		})
		expect((await readMyQuotes(mine.payload, mine.profileId))?.[0]?.status).toBe('answered')
		expect(await markMyQuote(mine.payload, mine.profileId, { id: String(first.id), status: 'new' })).toEqual({
			ok: true,
			status: 'new',
		})
	})

	test('une autre maquilleuse ne peut ni lire ni changer la demande ; un état inconnu est refusé', async () => {
		const mine = await artist()
		const other = await artist()
		await send(mine.payload, mine.slug)
		const [mineQuote] = (await readMyQuotes(mine.payload, mine.profileId)) ?? []
		if (!mineQuote) throw new Error('pas de demande')

		expect(await readMyQuotes(other.payload, other.profileId)).toEqual([])
		expect(await markMyQuote(other.payload, other.profileId, { id: mineQuote.id, status: 'answered' })).toEqual({
			ok: false,
		})
		expect(await markMyQuote(mine.payload, mine.profileId, { id: mineQuote.id, status: 'spam' })).toEqual({ ok: false })
		expect(await markMyQuote(mine.payload, mine.profileId, { id: -1, status: 'answered' })).toEqual({ ok: false })
		expect(await markMyQuote(mine.payload, mine.profileId, { id: 'abc', status: 'answered' })).toEqual({ ok: false })
		expect((await readMyQuotes(mine.payload, mine.profileId))?.[0]?.status).toBe('new')
	})
})

describe('1003 : la conservation', () => {
	test('6 mois et un jour : supprimée ; moins : gardée ; la ligne sans profil part aussi', async () => {
		const { payload, profileId } = await artist()
		const now = new Date('2026-10-23T10:00:00.000Z')
		const make = (createdAt: string, profile: number | null = profileId) =>
			payload.create({
				collection: 'quote-requests',
				data: {
					...(profile !== null && { profile }),
					status: 'new',
					mailStatus: 'sent',
					eventDate: '2028-06-12',
					place: 'Annecy',
					serviceType: 'wedding',
					message: 'Un message de test.',
					clientFirstName: 'Camille',
					clientEmail: `purge-${crypto.randomUUID()}@example.test`,
					consentAt: createdAt,
					createdAt,
				},
			})
		const old = await make('2026-04-22T09:59:00.000Z')
		const exactly = await make('2026-04-23T10:00:00.000Z')
		const recent = await make('2026-09-01T10:00:00.000Z')
		const orphan = await make('2026-10-01T10:00:00.000Z', null)

		const first = await runDailyTasks(payload, now, [purgeQuoteRequests])
		expect(first).toEqual([{ nom: 'purge-demandes-devis', supprimes: 2 }])
		const ids = (await rows(payload)).map(row => row.id)
		expect(ids).not.toContain(old.id)
		expect(ids).not.toContain(orphan.id)
		expect(ids).toContain(exactly.id)
		expect(ids).toContain(recent.id)
		expect(await runDailyTasks(payload, now, [purgeQuoteRequests])).toEqual([
			{ nom: 'purge-demandes-devis', supprimes: 0 },
		])
	})

	test('la suppression du compte supprime les demandes de son profil, pas celles des autres', async () => {
		const mine = await artist()
		const other = await artist()
		await send(mine.payload, mine.slug)
		await send(other.payload, other.slug)
		await deleteAccountAndDependents(mine.payload, mine.account.id)
		const remaining = await rows(mine.payload)
		expect(remaining).toHaveLength(1)
		expect(remaining[0]?.profile).toBe(other.profileId)
	})
})
