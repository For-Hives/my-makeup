import { beforeEach, describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'
import { POST as refuser } from '@/app/(front)/(site)/contact/throttled/route'
import { mailboxKey } from '@/lib/auth/canonical-email'
import { CONTACT_TRAP_FIELD, MESSAGE_TOO_MANY_MESSAGES } from '@/lib/contact/message'
import { type RequestStorage, saveContactMessage } from '@/lib/contact/payload-send'
import {
	contactRateLimitByAddress,
	contactRateLimitByEmail,
	createContactRateLimits,
	formEmail,
	secondsBeforeMailbox,
	secondsBeforeMessage,
	takeContactSlot,
} from '@/lib/contact/rate-limit'
import { contactProxy, proxy } from '@/proxy'

/** The brakes of the contact form (ticket 161; plan 02 U77), then the trap field and the proxy that answers 429. */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let n = 0
const fresh = () => createContactRateLimits(`u77-${++n}`)

describe('U77 : 5 demandes par heure et par adresse, 20 par jour et par email', () => {
	test('la sixième demande de l’heure d’une adresse est refusée, une autre adresse passe', () => {
		const rateLimits = fresh()
		for (let i = 0; i < 5; i++)
			expect(takeContactSlot('198.51.100.1', `a${i}@example.test`, rateLimits, 0).autorise).toBe(true)
		const refusal = takeContactSlot('198.51.100.1', 'a9@example.test', rateLimits, 60_000)
		expect(refusal).toMatchObject({ autorise: false, raison: 'adresse' })
		expect(refusal.autorise === false && refusal.reessayerDansS).toBe(HOUR / 1000 - 60)
		expect(takeContactSlot('198.51.100.2', 'a9@example.test', rateLimits, 60_000).autorise).toBe(true)
	})

	test('l’adresse est libre une heure après sa première demande', () => {
		const rateLimits = fresh()
		for (let i = 0; i < 5; i++) takeContactSlot('198.51.100.1', `a${i}@example.test`, rateLimits, 0)
		expect(takeContactSlot('198.51.100.1', 'b@example.test', rateLimits, HOUR - 1).autorise).toBe(false)
		expect(takeContactSlot('198.51.100.1', 'b@example.test', rateLimits, HOUR + 1).autorise).toBe(true)
	})

	test('la vingt et unième demande du jour pour un même email est refusée, d’où qu’elle vienne', () => {
		const rateLimits = fresh()
		for (let i = 0; i < 20; i++)
			expect(takeContactSlot(`192.0.2.${i}`, 'Lea@Example.test', rateLimits, i).autorise).toBe(true)
		const refusal = takeContactSlot('192.0.2.99', ' lea@example.test ', rateLimits, 1000)
		expect(refusal).toMatchObject({ autorise: false, raison: 'email' })
		expect(takeContactSlot('192.0.2.99', 'autre@example.test', rateLimits, 1000).autorise).toBe(true)
		expect(takeContactSlot('192.0.2.99', 'lea@example.test', rateLimits, DAY + 100).autorise).toBe(true)
	})

	test('le refus d’une boîte rend la place prise par l’adresse', () => {
		const rateLimits = fresh()
		for (let i = 0; i < 20; i++) takeContactSlot(`192.0.2.${i}`, 'lea@example.test', rateLimits, 0)
		for (let i = 0; i < 10; i++)
			expect(takeContactSlot('198.51.100.1', 'lea@example.test', rateLimits, 1).autorise).toBe(false)
		// The address has taken no place for these refusals: its five are still there.
		for (let i = 0; i < 5; i++)
			expect(takeContactSlot('198.51.100.1', `autre${i}@example.test`, rateLimits, 2).autorise).toBe(true)
	})

	test('une adresse locale (développement, banc) n’est jamais comptée par adresse', () => {
		const rateLimits = fresh()
		for (let i = 0; i < 30; i++) expect(takeContactSlot('local', `a${i}@example.test`, rateLimits).autorise).toBe(true)
		for (let i = 0; i < 30; i++)
			expect(takeContactSlot('127.0.0.1', `b${i}@example.test`, rateLimits).autorise).toBe(true)
		expect(secondsBeforeMessage('local', rateLimits)).toBeUndefined()
	})

	test('secondesAvantUnMessage lit le frein sans rien prendre', () => {
		const rateLimits = fresh()
		for (let i = 0; i < 20; i++) expect(secondsBeforeMessage('198.51.100.1', rateLimits)).toBeUndefined()
		for (let i = 0; i < 5; i++) takeContactSlot('198.51.100.1', `a${i}@example.test`, rateLimits)
		expect(secondsBeforeMessage('198.51.100.1', rateLimits)).toBeGreaterThan(0)
		expect(secondsBeforeMessage('198.51.100.1', rateLimits)).toBeGreaterThan(0)
		expect(secondsBeforeMessage('198.51.100.2', rateLimits)).toBeUndefined()
	})
})

describe('le flux : champ piège et limites ne créent ni ligne ni mail', () => {
	function bench() {
		const events: string[] = []
		const rateLimits = fresh()
		const storage: RequestStorage = {
			creer: async () => {
				events.push('creer')
				return 1
			},
			marquer: async () => {},
		}
		const base = {
			prenom: 'Léa',
			nom: 'Témoin',
			email: 'lea@example.test',
			telephone: '0199001234',
			message: 'Bonjour',
		}
		const launch = (surcharge: Record<string, unknown> = {}, client = '198.51.100.1') => {
			const values: Record<string, unknown> = { ...base, ...surcharge }
			return saveContactMessage({
				formulaire: { get: nom => values[nom] },
				stockage: storage,
				envoyer: async () => void events.push('envoyer'),
				destinataire: 'equipe@example.test',
				apres: travail => void travail(),
				journal: { info: () => {}, erreur: () => {} },
				client,
				freins: rateLimits,
			})
		}
		return { evenements: events, freins: rateLimits, lancer: launch }
	}

	test('le champ piège rempli : le succès d’une visiteuse, rien d’écrit, rien d’envoyé, aucune place prise', async () => {
		const b = bench()
		for (let i = 0; i < 10; i++)
			expect(await b.lancer({ [CONTACT_TRAP_FIELD]: 'http://spam.example' })).toEqual({ ok: true })
		expect(b.evenements).toEqual([])
		expect(secondsBeforeMessage('198.51.100.1', b.freins)).toBeUndefined()
	})

	test('un champ piège d’espaces seuls est vide : le message passe', async () => {
		const b = bench()
		expect(await b.lancer({ [CONTACT_TRAP_FIELD]: '   ' })).toEqual({ ok: true })
		expect(b.evenements).toContain('creer')
	})

	test('un message invalide ne prend aucune place', async () => {
		const b = bench()
		for (let i = 0; i < 10; i++) expect(await b.lancer({ nom: '' })).toMatchObject({ code: 'donnees-invalides' })
		expect(secondsBeforeMessage('198.51.100.1', b.freins)).toBeUndefined()
	})

	test('la sixième demande d’une adresse : trop-de-messages, rien d’écrit', async () => {
		const b = bench()
		for (let i = 0; i < 5; i++) expect(await b.lancer({ email: `a${i}@example.test` })).toEqual({ ok: true })
		const before = b.evenements.length
		const sixth = await b.lancer({ email: 'a9@example.test' })
		expect(sixth).toMatchObject({ ok: false, code: 'trop-de-messages' })
		expect(b.evenements.length).toBe(before)
	})

	test('la vingt et unième demande d’un email : trop-de-messages, rien d’écrit', async () => {
		const b = bench()
		for (let i = 0; i < 20; i++) expect(await b.lancer({}, `192.0.2.${i + 1}`)).toEqual({ ok: true })
		const before = b.evenements.length
		expect(await b.lancer({}, '192.0.2.200')).toMatchObject({ ok: false, code: 'trop-de-messages' })
		expect(b.evenements.length).toBe(before)
	})
})

describe('le proxy renvoie un 429 en français à la sixième demande', () => {
	beforeEach(() => {
		contactRateLimitByAddress.vider()
		contactRateLimitByEmail.vider()
	})

	const request = (methode: string, adresse: string, chemin = '/contact') =>
		new NextRequest(`http://localhost:3361${chemin}`, { method: methode, headers: { 'x-forwarded-for': adresse } })

	/** A POST with a multipart body named as React names the fields of a Server Action with a bound state. */
	const action = (adresse: string, email: string, prefixe = '1_') => {
		const corps = new FormData()
		corps.set('$ACTION_REF_1', '')
		corps.set(`${prefixe}prenom`, 'Léa')
		corps.set(`${prefixe}email`, email)
		return new NextRequest('http://localhost:3361/contact', {
			method: 'POST',
			headers: { 'x-forwarded-for': adresse, 'next-action': 'abc' },
			body: corps,
		})
	}

	test('POST /contact passe tant que l’adresse a des places, puis est réécrit vers la route de refus', async () => {
		for (let i = 0; i < 5; i++) contactRateLimitByAddress.prendre('198.51.100.1')
		const refuse = await proxy(request('POST', '198.51.100.1'))
		expect(refuse.headers.get('x-middleware-rewrite')).toContain('/contact/throttled')
		expect((await proxy(request('POST', '198.51.100.2'))).headers.get('x-middleware-rewrite')).toBeNull()
		// Reading the page is never braked.
		expect(proxy(request('GET', '198.51.100.1')).headers.get('x-middleware-rewrite')).toBeNull()
	})

	test('la route de refus répond 429 avec la phrase et Retry-After pour une action, 404 pour une adresse libre', async () => {
		for (let i = 0; i < 5; i++) contactRateLimitByAddress.prendre('198.51.100.1')
		const action = await refuser(
			new Request('http://localhost/contact/throttled', {
				method: 'POST',
				headers: { 'x-forwarded-for': '198.51.100.1', 'next-action': 'abc' },
			})
		)
		expect(action.status).toBe(429)
		expect(action.headers.get('content-type')).toBe('text/plain')
		expect(Number(action.headers.get('retry-after'))).toBeGreaterThan(0)
		expect(await action.text()).toBe(MESSAGE_TOO_MANY_MESSAGES)

		const form = await refuser(
			new Request('http://localhost/contact/throttled', {
				method: 'POST',
				headers: { 'x-forwarded-for': '198.51.100.1' },
			})
		)
		expect(form.status).toBe(429)
		expect(await form.text()).toContain('Ce que vous avez écrit est conservé')

		const free = await refuser(
			new Request('http://localhost/contact/throttled', {
				method: 'POST',
				headers: { 'x-forwarded-for': '198.51.100.9' },
			})
		)
		expect(free.status).toBe(404)
	})

	test('la vingt et unième demande du jour pour une boîte est réécrite vers la route de refus, d’où qu’elle vienne', async () => {
		for (let i = 0; i < 20; i++) contactRateLimitByEmail.prendre(mailboxKey('boite.pleine@example.test'))
		// The same mailbox, written otherwise, from an address that has sent nothing.
		const refused = await contactProxy(action('203.0.113.5', ' Boite.Pleine@Example.test '))
		expect(refused.headers.get('x-middleware-rewrite')).toContain('/contact/throttled')
		const free = await contactProxy(action('203.0.113.5', 'autre@example.test'))
		expect(free.headers.get('x-middleware-rewrite')).toBeNull()
		// The proxy only reads: the brake still holds 20 places for the pleine mailbox, none for the other.
		expect(secondsBeforeMailbox('autre@example.test')).toBeUndefined()
	})

	test('une adresse locale ou sans corps lisible n’est refusée par la boîte que si le corps le permet', async () => {
		for (let i = 0; i < 20; i++) contactRateLimitByEmail.prendre(mailboxKey('boite.pleine@example.test'))
		const withoutBody = await contactProxy(request('POST', '127.0.0.1'))
		expect(withoutBody.headers.get('x-middleware-rewrite')).toBeNull()
		const full = await contactProxy(action('127.0.0.1', 'boite.pleine@example.test'))
		expect(full.headers.get('x-middleware-rewrite')).toContain('/contact/throttled')
	})

	test('la route de refus répond 429 pour une boîte pleine dont le corps est celui d’une action', async () => {
		for (let i = 0; i < 20; i++) contactRateLimitByEmail.prendre(mailboxKey('boite.pleine@example.test'))
		const corps = new FormData()
		corps.set('1_email', 'boite.pleine@example.test')
		const response = await refuser(
			new Request('http://localhost/contact/throttled', {
				method: 'POST',
				headers: { 'x-forwarded-for': '203.0.113.5', 'next-action': 'abc' },
				body: corps,
			})
		)
		expect(response.status).toBe(429)
		expect(await response.text()).toBe(MESSAGE_TOO_MANY_MESSAGES)
	})
})

describe('emailDuFormulaire : le nom du champ dans le corps d’une action', () => {
	test('trouve l’email avec ou sans préfixe de React, jamais un autre champ', () => {
		const a = new FormData()
		a.set('1_email', 'a@example.test')
		expect(formEmail(a)).toBe('a@example.test')
		const b = new FormData()
		b.set('email', 'b@example.test')
		expect(formEmail(b)).toBe('b@example.test')
		const c = new FormData()
		c.set('1_nom', 'x')
		c.set('1_emailing', 'y')
		expect(formEmail(c)).toBeUndefined()
	})
})
