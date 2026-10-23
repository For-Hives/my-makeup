import { describe, expect, test } from 'bun:test'
import { createUnverifiedLimits, TURNSTILE_TOKEN_FIELD, TURNSTILE_VERIFY_URL } from '@/lib/contact/turnstile'
import { composerEmail } from '@/lib/emails/layout'
import { quoteArtistEmailContent, quoteClientEmailContent } from '@/lib/emails/quote'
import { parseServerEnv } from '@/lib/env'
import { createQuoteRateLimits } from '@/lib/quote/rate-limit'
import { QUOTE_RETENTION_MONTHS, QUOTE_STATUSES, quotePurgeThreshold, validateQuote } from '@/lib/quote/request'
import { type QuoteStore, saveQuoteRequest } from '@/lib/quote/save'
import { quoteFormShown } from '@/lib/quote/shown'
import { HttpResponse, http, simulate } from '../support/outgoing-http'

/**
 * Issue 1003: the quote requests sent to a makeup artist from her profile. The rules, the flow with a double
 * store and a double mail door, the mails, the switch. The same lines against the real store and the mail
 * catcher of the bench: tests/integration/quote-requests.test.ts.
 */

const TODAY = '2026-10-23'
const NOW = new Date('2026-10-23T10:00:00.000Z')

const valid = {
	eventDate: '2027-06-12',
	place: 'Annecy',
	serviceType: 'wedding',
	message: 'Mariage civil et religieux, une trentaine d’invités, essai souhaité.',
	firstName: 'Camille',
	email: 'camille@example.test',
	phone: '',
	consent: 'on',
}

const form = (extra: Record<string, unknown> = {}) => {
	const values: Record<string, unknown> = { ...valid, ...extra }
	return { get: (name: string) => values[name] }
}

describe('the rules of the form', () => {
	test('a complete request is read as typed, trimmed', () => {
		const result = validateQuote(form({ place: '  Annecy  ' }), TODAY)
		expect(result).toEqual({
			ok: true,
			quote: {
				eventDate: '2027-06-12',
				place: 'Annecy',
				serviceType: 'wedding',
				message: valid.message,
				firstName: 'Camille',
				email: 'camille@example.test',
				phone: '',
			},
		})
	})

	test('the telephone is optional, the others are required', () => {
		for (const field of ['eventDate', 'place', 'serviceType', 'message', 'firstName', 'email']) {
			const result = validateQuote(form({ [field]: '' }), TODAY)
			expect(result.ok).toBe(false)
			if (!result.ok) expect(Object.keys(result.errors)).toEqual([field])
		}
		expect(validateQuote(form({ phone: '' }), TODAY).ok).toBe(true)
		expect(validateQuote(form({ phone: '06 12 34 56 78' }), TODAY).ok).toBe(true)
	})

	test('the consent is required, and nothing but the box ticked counts', () => {
		for (const consent of [undefined, '', 'off', 'false']) {
			const result = validateQuote(form({ consent }), TODAY)
			expect(result.ok).toBe(false)
			if (!result.ok) expect(Object.keys(result.errors)).toEqual(['consent'])
		}
	})

	test('the date: today is allowed, yesterday is not, and not more than three years ahead', () => {
		expect(validateQuote(form({ eventDate: '2026-10-23' }), TODAY).ok).toBe(true)
		expect(validateQuote(form({ eventDate: '2026-10-22' }), TODAY).ok).toBe(false)
		expect(validateQuote(form({ eventDate: '2029-10-23' }), TODAY).ok).toBe(true)
		expect(validateQuote(form({ eventDate: '2029-10-24' }), TODAY).ok).toBe(false)
		for (const bad of ['demain', '12/06/2027', '2027-02-30', '2027-13-01', '2027-6-1'])
			expect(validateQuote(form({ eventDate: bad }), TODAY).ok).toBe(false)
	})

	test('the type is one of the five', () => {
		for (const serviceType of ['wedding', 'event', 'shoot', 'lesson', 'other'])
			expect(validateQuote(form({ serviceType }), TODAY).ok).toBe(true)
		expect(validateQuote(form({ serviceType: 'mariage' }), TODAY).ok).toBe(false)
	})

	test('the limits', () => {
		expect(validateQuote(form({ message: 'a'.repeat(1000) }), TODAY).ok).toBe(true)
		expect(validateQuote(form({ message: 'a'.repeat(1001) }), TODAY).ok).toBe(false)
		expect(validateQuote(form({ place: 'a'.repeat(121) }), TODAY).ok).toBe(false)
		expect(validateQuote(form({ email: `${'a'.repeat(250)}@x.fr` }), TODAY).ok).toBe(false)
		expect(validateQuote(form({ email: 'pas-une-adresse' }), TODAY).ok).toBe(false)
		expect(validateQuote(form({ email: 'a@b.test, c@d.test' }), TODAY).ok).toBe(false)
		expect(validateQuote(form({ phone: '0'.repeat(31) }), TODAY).ok).toBe(false)
	})

	test('the sentences are in « vous »', () => {
		const result = validateQuote(form({ message: '', consent: '' }), TODAY)
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.errors.message).toBe('Le message est requis')
			expect(result.errors.consent).toBe('Cochez la case pour envoyer votre demande')
		}
	})
})

describe('retention', () => {
	test('six months, in calendar months', () => {
		expect(QUOTE_RETENTION_MONTHS).toBe(6)
		expect(quotePurgeThreshold(NOW).toISOString()).toBe('2026-04-23T10:00:00.000Z')
		expect(quotePurgeThreshold(new Date('2026-08-31T10:00:00.000Z')).toISOString()).toBe('2026-02-28T10:00:00.000Z')
	})

	test('two statuses: new and answered', () => {
		expect(QUOTE_STATUSES).toEqual(['new', 'answered'])
	})
})

describe('who sees the form', () => {
	const open = { enabled: true, published: true, reachable: true, available: true }

	test('a published, reachable, available profile, with the switch on', () => {
		expect(quoteFormShown(open)).toBe(true)
	})

	test('the switch off, a draft profile, a profile with no way to reach her, or a profile on pause: no form', () => {
		expect(quoteFormShown({ ...open, enabled: false })).toBe(false)
		expect(quoteFormShown({ ...open, published: false })).toBe(false)
		expect(quoteFormShown({ ...open, reachable: false })).toBe(false)
		expect(quoteFormShown({ ...open, available: false })).toBe(false)
	})
})

describe('the switch QUOTE_REQUESTS', () => {
	const base = {
		DATABASE_URI: 'postgres://u:p@127.0.0.1:5442/b',
		PAYLOAD_SECRET: 'a'.repeat(40),
		NODE_ENV: 'test',
	}

	test('off unless the value is exactly « on »', () => {
		for (const QUOTE_REQUESTS of [undefined, '', '  ', 'off', 'ON', 'true', '1', 'oui'])
			expect(parseServerEnv({ ...base, QUOTE_REQUESTS }).quoteRequests).toBe(false)
		expect(parseServerEnv({ ...base, QUOTE_REQUESTS: 'on' }).quoteRequests).toBe(true)
		expect(parseServerEnv({ ...base, QUOTE_REQUESTS: ' on ' }).quoteRequests).toBe(true)
	})
})

/** A store in memory and a mail door that notes what leaves. */
function bench(
	over: { recipient?: string | undefined; unknownProfile?: boolean; failCreate?: boolean; failMail?: boolean } = {}
) {
	const created: { profileId: number; quote: Record<string, string>; consentAt: Date }[] = []
	const marks: string[] = []
	const mails: { a: string; sujet: string; texte: string; html: string; repondreA?: string }[] = []
	const jobs: Promise<void>[] = []
	const logs: string[] = []
	const store: QuoteStore = {
		target: async slug =>
			over.unknownProfile || slug !== 'profil-fictif'
				? null
				: { profileId: 7, recipient: 'recipient' in over ? over.recipient : 'maquilleuse@example.test' },
		create: async (profileId, quote, consentAt) => {
			if (over.failCreate) throw new Error(`boom ${quote.email}`)
			created.push({ profileId, quote: { ...quote }, consentAt })
			return created.length
		},
		mark: async (_id, mailStatus) => {
			marks.push(mailStatus)
		},
	}
	const limits = createQuoteRateLimits(crypto.randomUUID())
	const unverified = createUnverifiedLimits(`quote-${crypto.randomUUID()}`)
	return {
		created,
		marks,
		mails,
		logs,
		unverified,
		run: async (
			extra: Record<string, unknown> = {},
			client = '203.0.113.9',
			options: { enabled?: boolean; turnstile?: boolean; slug?: string } = {}
		) => {
			const result = await saveQuoteRequest({
				form: form(extra),
				slug: options.slug ?? 'profil-fictif',
				enabled: options.enabled ?? true,
				now: NOW,
				store,
				send: async email => {
					if (over.failMail) throw new Error('relay down')
					mails.push(email)
				},
				site: 'https://exemple.test',
				after: job => void jobs.push(job()),
				log: { info: line => void logs.push(line), erreur: line => void logs.push(line) },
				client,
				limits,
				...(options.turnstile && { turnstile: { secret: 'secret-de-test-pas-un-vrai', unverified } }),
			})
			await Promise.all(jobs.splice(0))
			return result
		},
	}
}

describe('the flow', () => {
	test('a valid request is stored once, then the artist is written to, and the client gets an acknowledgement', async () => {
		const b = bench()
		expect(await b.run()).toEqual({ ok: true })
		expect(b.created).toHaveLength(1)
		expect(b.created[0]?.profileId).toBe(7)
		expect(b.created[0]?.consentAt.toISOString()).toBe(NOW.toISOString())
		expect(b.mails.map(mail => mail.a)).toEqual(['maquilleuse@example.test', 'camille@example.test'])
		expect(b.marks).toEqual(['sent'])
	})

	test('the mail to the artist: a fixed subject with nothing of the client, a reply to the client', async () => {
		const b = bench()
		await b.run()
		const mail = b.mails[0]
		expect(mail?.sujet).toBe('Nouvelle demande de devis sur My Makeup')
		expect(mail?.repondreA).toBe('camille@example.test')
		expect(mail?.texte).toContain(valid.message)
		expect(mail?.texte).toContain('Annecy')
		expect(mail?.texte).toContain('/auth/profil')
		for (const secret of ['Camille', 'camille@example.test', 'Annecy']) expect(mail?.sujet).not.toContain(secret)
	})

	test('the acknowledgement says nothing she typed, and is not a reply to anyone', async () => {
		const b = bench()
		await b.run({ message: 'MESSAGE-LIBRE-UNIQUE', place: 'LIEU-UNIQUE', firstName: 'PRENOM-UNIQUE' })
		const ack = b.mails[1]
		expect(ack?.a).toBe('camille@example.test')
		expect(ack?.sujet).toBe('Votre demande de devis a bien été envoyée')
		for (const free of ['MESSAGE-LIBRE-UNIQUE', 'LIEU-UNIQUE', 'PRENOM-UNIQUE']) {
			expect(ack?.texte).not.toContain(free)
			expect(ack?.html).not.toContain(free)
		}
		expect(ack?.repondreA).toBeUndefined()
	})

	test('the switch off: nothing is stored, nothing is sent, whoever calls', async () => {
		const b = bench()
		expect(await b.run({}, '203.0.113.9', { enabled: false })).toEqual({ ok: false, code: 'indisponible' })
		expect(b.created).toEqual([])
		expect(b.mails).toEqual([])
	})

	test('an unknown profile, a hidden one, one with no way to reach her: the same answer, nothing stored', async () => {
		const b = bench({ unknownProfile: true })
		expect(await b.run()).toEqual({ ok: false, code: 'indisponible' })
		expect(await bench().run({}, '203.0.113.9', { slug: 'autre-profil' })).toEqual({ ok: false, code: 'indisponible' })
		expect(b.created).toEqual([])
	})

	test('the trap field answers the success of a person and does nothing', async () => {
		const b = bench()
		expect(await b.run({ commentaire: 'http://spam.test' })).toEqual({ ok: true })
		expect(b.created).toEqual([])
		expect(b.mails).toEqual([])
	})

	test('an invalid request stores nothing and sends nothing', async () => {
		const b = bench()
		const result = await b.run({ message: '', consent: '' })
		expect(result.ok).toBe(false)
		if (!result.ok && result.code === 'donnees-invalides')
			expect(Object.keys(result.errors).sort()).toEqual(['consent', 'message'])
		expect(b.created).toEqual([])
		expect(b.mails).toEqual([])
	})

	test('a store that fails stores nothing, sends nothing, and the log holds nothing she typed', async () => {
		const b = bench({ failCreate: true })
		expect(await b.run()).toEqual({ ok: false, code: 'enregistrement-impossible' })
		expect(b.mails).toEqual([])
		expect(b.logs.join('\n')).not.toContain('camille@example.test')
	})

	test('a mail that fails leaves the request stored, marked failed, and the client sees the success', async () => {
		const b = bench({ failMail: true })
		expect(await b.run()).toEqual({ ok: true })
		expect(b.created).toHaveLength(1)
		expect(b.marks).toEqual(['failed'])
		expect(b.logs.join('\n')).not.toContain('camille@example.test')
	})

	test('an artist whose account has no address: stored, marked failed, no mail to her; the client is still answered', async () => {
		const b = bench({ recipient: undefined })
		expect(await b.run()).toEqual({ ok: true })
		expect(b.created).toHaveLength(1)
		expect(b.marks).toEqual(['failed'])
		expect(b.mails.map(mail => mail.a)).toEqual(['camille@example.test'])
	})

	test('five requests an hour from one address, the sixth is refused and stores nothing', async () => {
		const b = bench()
		for (let index = 0; index < 5; index++) expect((await b.run({ email: `c${index}@example.test` })).ok).toBe(true)
		const sixth = await b.run({ email: 'c6@example.test' })
		expect(sixth).toMatchObject({ ok: false, code: 'trop-de-demandes' })
		expect(b.created).toHaveLength(5)
	})

	test('five requests a day from one mailbox, whatever the address', async () => {
		const b = bench()
		for (let index = 0; index < 5; index++) expect((await b.run({}, `203.0.113.${index + 10}`)).ok).toBe(true)
		expect(await b.run({}, '203.0.113.99')).toMatchObject({ ok: false, code: 'trop-de-demandes' })
	})
})

describe('Turnstile', () => {
	const token = { [TURNSTILE_TOKEN_FIELD]: 'jeton' }

	test('a token Cloudflare refuses stores nothing', async () => {
		simulate(http.post(TURNSTILE_VERIFY_URL, () => HttpResponse.json({ success: false })))
		const b = bench()
		expect(await b.run(token, '203.0.113.9', { turnstile: true })).toEqual({ ok: false, code: 'verification-echouee' })
		expect(b.created).toEqual([])
	})

	test('a token Cloudflare accepts goes through', async () => {
		simulate(http.post(TURNSTILE_VERIFY_URL, () => HttpResponse.json({ success: true })))
		const b = bench()
		expect((await b.run(token, '203.0.113.9', { turnstile: true })).ok).toBe(true)
	})

	test('Cloudflare silent: the request goes through under the tight brake, two an hour from one address', async () => {
		simulate(http.post(TURNSTILE_VERIFY_URL, () => new HttpResponse(null, { status: 503 })))
		const b = bench()
		expect((await b.run({ ...token, email: 'a@example.test' }, '203.0.113.20', { turnstile: true })).ok).toBe(true)
		expect((await b.run({ ...token, email: 'b@example.test' }, '203.0.113.20', { turnstile: true })).ok).toBe(true)
		expect(await b.run({ ...token, email: 'c@example.test' }, '203.0.113.20', { turnstile: true })).toMatchObject({
			ok: false,
			code: 'trop-de-demandes',
		})
	})

	test('no token and no claim of an outage: refused', async () => {
		const b = bench()
		expect(await b.run({}, '203.0.113.9', { turnstile: true })).toEqual({ ok: false, code: 'verification-echouee' })
	})
})

describe('the mails', () => {
	const quote = validateQuote(form(), TODAY)
	if (!quote.ok) throw new Error('requête de départ invalide')

	test('to the artist: in « tu », every detail, the link of her space', () => {
		const mail = composerEmail(quoteArtistEmailContent(quote.quote), 'https://exemple.test')
		expect(mail.sujet).toBe('Nouvelle demande de devis sur My Makeup')
		for (const part of ['Camille', 'camille@example.test', 'Annecy', 'Mariage', '12 juin 2027', valid.message])
			expect(mail.texte).toContain(part)
		expect(mail.lien).toBe('https://exemple.test/auth/profil')
		expect(mail.texte).toContain('Répondre à cet email répond à la cliente')
	})

	test('to the client: in « vous », short, nothing she typed', () => {
		const mail = composerEmail(quoteClientEmailContent(), 'https://exemple.test')
		expect(mail.sujet).toBe('Votre demande de devis a bien été envoyée')
		expect(mail.texte).toContain('Votre demande a été transmise à la maquilleuse')
		expect(mail.texte.length).toBeLessThan(900)
	})
})
