import { describe, expect, test } from 'bun:test'
import { mailboxKey, canonicalEmail, canonicalGmailLocal } from '@/lib/auth/canonical-email'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { takeMailFor } from '@/lib/auth/sign-up-rate-limits'

describe('emailCanonique : les variantes Gmail sont une boîte (ticket 084)', () => {
	test.each([
		['Lea.Fictive@Gmail.com', 'leafictive@gmail.com'],
		['l.e.a.f.i.c.t.i.v.e@gmail.com', 'leafictive@gmail.com'],
		['leafictive+promo@gmail.com', 'leafictive@gmail.com'],
		['lea.fictive+a+b@googlemail.com', 'leafictive@gmail.com'],
		['  leafictive@googlemail.com ', 'leafictive@gmail.com'],
	])('%s -> %s', (entree, attendu) => {
		expect(canonicalEmail(entree)).toBe(attendu)
	})

	test('ailleurs que chez Gmail, rien ne change : un point ou un « + » fait une autre boîte', () => {
		expect(canonicalEmail('Lea.Fictive+x@Example.test')).toBe('lea.fictive+x@example.test')
		expect(canonicalEmail('lea@gmail.com.example.test')).toBe('lea@gmail.com.example.test')
		expect(canonicalEmail('lea@notgmail.com')).toBe('lea@notgmail.com')
	})

	test('une valeur sans « @ » reste telle quelle, en minuscules', () => {
		expect(canonicalEmail('Pas-Une-Adresse')).toBe('pas-une-adresse')
		expect(canonicalEmail('')).toBe('')
	})

	test('localGmailCanonique : la partie locale de la boîte Gmail, rien pour un autre fournisseur ou un nom vide', () => {
		expect(canonicalGmailLocal('L.ea+x@gmail.com')).toBe('lea')
		expect(canonicalGmailLocal('lea@example.test')).toBeNull()
		expect(canonicalGmailLocal('...@gmail.com')).toBeNull()
		expect(canonicalGmailLocal('+x@gmail.com')).toBeNull()
	})

	test('cleDeBoite : un condensat, le même pour les variantes, aucune adresse en clair', () => {
		const cle = mailboxKey('lea.fictive@gmail.com')
		expect(cle).toMatch(/^[0-9a-f]{64}$/)
		expect(mailboxKey('LEAFICTIVE+x@googlemail.com')).toBe(cle)
		expect(mailboxKey('lea@example.test')).not.toBe(mailboxKey('lea.@example.test'))
	})
})

describe('prendreUnMailPour : 1 par minute, 5 par jour, par boîte', () => {
	const freins = () => ({
		parMinute: createRateLimit({ nom: `u-minute-${crypto.randomUUID()}`, limite: 1, fenetreMs: 60_000 }),
		parJour: createRateLimit({ nom: `u-jour-${crypto.randomUUID()}`, limite: 5, fenetreMs: 86_400_000 }),
	})

	test('le second mail de la minute est refusé, avec le temps d’attente', () => {
		const f = freins()
		expect(takeMailFor('a', f, 0)).toEqual({ autorise: true })
		expect(takeMailFor('a', f, 10_000)).toEqual({ autorise: false, raison: 'minute', reessayerDansS: 50 })
		expect(takeMailFor('b', f, 10_000)).toEqual({ autorise: true })
	})

	test('le sixième mail du jour est refusé, et la place de la minute est rendue', () => {
		const f = freins()
		for (let i = 0; i < 5; i++) expect(takeMailFor('a', f, i * 61_000).autorise).toBe(true)
		const refus = takeMailFor('a', f, 5 * 61_000)
		expect(refus).toMatchObject({ autorise: false, raison: 'jour' })
		// The refused mail took no place of the minute: the next one is not refused for the minute.
		expect(takeMailFor('a', f, 5 * 61_000 + 1)).toMatchObject({ autorise: false, raison: 'jour' })
		expect(takeMailFor('a', f, 86_400_000 + 1_000)).toEqual({ autorise: true })
	})
})

describe('confirmerSousFrein : le lien du mail, freiné par adresse cliente', () => {
	test('au-delà de la limite : « lien invalide », sans lire la base ni écrire au journal', async () => {
		const { confirmWithRateLimit: confirmerSousFrein } = await import('@/lib/auth/confirmation')
		const frein = createRateLimit({ nom: `u-confirmation-${crypto.randomUUID()}`, limite: 2, fenetreMs: 60_000 })
		const base = { db: { findOne: () => Promise.reject(new Error('la base ne doit pas être lue')) } }
		const lignes: string[] = []
		const journal = (e: { code: string }) => {
			lignes.push(e.code)
			return Promise.resolve()
		}

		const essais = []
		for (let i = 0; i < 4; i++)
			essais.push(
				await confirmerSousFrein(base as never, 'f'.repeat(40), frein, 'client', journal as never).catch(() => 'erreur')
			)

		// The two first reach the table (which fails here, so the page would say so); the others never do.
		expect(essais).toEqual(['erreur', 'erreur', 'lien-invalide', 'lien-invalide'])
		expect(lignes).toEqual([])
	})
})
