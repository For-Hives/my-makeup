import { describe, expect, test } from 'bun:test'
import {
	CONFIRMATION_COOKIE,
	CONFIRMATION_PAGE,
	confirmationLinkPlan,
	SESSION_OFFER_WINDOW_MS,
	sessionOfferOpen,
} from '@/lib/auth/confirmation-link'

const TOKEN = 'a'.repeat(40)
const params = (query: string) => new URLSearchParams(query)

describe('le lien de confirmation : le proxy range le code dans un cookie', () => {
	test('un code de 40 caractères hexadécimaux devient un cookie de la page seule, et l’adresse perd son code', () => {
		const plan = confirmationLinkPlan(CONFIRMATION_PAGE, params(`code=${TOKEN}`))
		expect(plan).toEqual({
			aller: CONFIRMATION_PAGE,
			cookie: { valeur: TOKEN, maxAgeS: SESSION_OFFER_WINDOW_MS / 1000 },
		})
		expect(CONFIRMATION_COOKIE).toBe('mm-confirm')
	})

	test('un code d’une autre forme efface le cookie au lieu de le garder', () => {
		for (const code of ['', 'abc', 'g'.repeat(40), `${TOKEN}0`, 'A'.repeat(40)])
			expect(confirmationLinkPlan(CONFIRMATION_PAGE, params(`code=${code}`))?.cookie).toEqual({
				valeur: '',
				maxAgeS: 0,
			})
	})

	test('rien d’autre n’est concerné : ni une autre page, ni une adresse sans paramètre code', () => {
		expect(confirmationLinkPlan(CONFIRMATION_PAGE, params(''))).toBeNull()
		expect(confirmationLinkPlan('/auth/signin', params(`code=${TOKEN}`))).toBeNull()
		expect(confirmationLinkPlan(`${CONFIRMATION_PAGE}/autre`, params(`code=${TOKEN}`))).toBeNull()
	})
})

describe('la fenêtre de la session ouverte par le lien', () => {
	const NOW = Date.UTC(2026, 9, 22, 12, 0, 0)
	test('une heure depuis la création du compte, pas une seconde de plus', () => {
		expect(SESSION_OFFER_WINDOW_MS).toBe(3_600_000)
		expect(sessionOfferOpen(new Date(NOW - 59 * 60_000).toISOString(), NOW)).toBe(true)
		expect(sessionOfferOpen(new Date(NOW - SESSION_OFFER_WINDOW_MS).toISOString(), NOW)).toBe(false)
		expect(sessionOfferOpen(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe(false)
	})

	test('une date absente ou illisible ferme la fenêtre', () => {
		expect(sessionOfferOpen(undefined, NOW)).toBe(false)
		expect(sessionOfferOpen(null, NOW)).toBe(false)
		expect(sessionOfferOpen('pas une date', NOW)).toBe(false)
	})
})
