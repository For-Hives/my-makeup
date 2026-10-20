import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RefreshSession } from '@/components/dashboard/RefreshSession'
import { createExtension, EXTENSION_ROUTE } from '@/lib/auth/extend'
import {
	capReached,
	EXTENSION_THRESHOLD_S,
	extensionDuration,
	openedAt,
	SESSION_CAP_S,
	SESSION_DURATION_S,
	shouldExtend,
	tokenExpiration,
} from '@/lib/auth/sliding-session'
import { openWindow } from '../support/dom-react'

const DAY = 86_400
const T0 = Date.UTC(2026, 0, 1)

describe('U67 : un rafraîchissement quand il reste moins de 7 jours', () => {
	test('les valeurs du plan : 14 jours, seuil de 7, plafond de 90', () => {
		expect(SESSION_DURATION_S).toBe(14 * DAY)
		expect(EXTENSION_THRESHOLD_S).toBe(7 * DAY)
		expect(SESSION_CAP_S).toBe(90 * DAY)
	})
	test('il reste 6 jours : oui ; 7 jours pile : non ; 13 jours : non ; échue : oui', () => {
		const now = 1_000_000
		expect(shouldExtend(now + 6 * DAY, now)).toBe(true)
		expect(shouldExtend(now + 7 * DAY - 1, now)).toBe(true)
		expect(shouldExtend(now + 7 * DAY, now)).toBe(false)
		expect(shouldExtend(now + 13 * DAY, now)).toBe(false)
		expect(shouldExtend(now - 1, now)).toBe(true)
	})
})

describe('U68 : refus au-delà de 90 jours depuis l’ouverture de la session', () => {
	test('89 jours : permis ; 90 jours : refusé ; 91 jours : refusé', () => {
		expect(capReached(T0, T0 + 89 * DAY * 1000)).toBe(false)
		expect(capReached(T0, T0 + 90 * DAY * 1000 - 1000)).toBe(false)
		expect(capReached(T0, T0 + 90 * DAY * 1000)).toBe(true)
		expect(capReached(T0, T0 + 91 * DAY * 1000)).toBe(true)
	})
	test('un prolongement dure 14 jours, moins près du plafond, jamais au-delà', () => {
		expect(extensionDuration(T0, T0 + 13 * DAY * 1000)).toBe(14 * DAY)
		expect(extensionDuration(T0, T0 + 76 * DAY * 1000)).toBe(14 * DAY)
		expect(extensionDuration(T0, T0 + 80 * DAY * 1000)).toBe(10 * DAY)
		expect(extensionDuration(T0, T0 + 89 * DAY * 1000)).toBe(DAY)
	})
})

describe('lecture du jeton et de la session', () => {
	const token = (charge: unknown) => `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.signature`
	test('l’expiration vient de la charge du jeton ; tout le reste donne rien', () => {
		expect(tokenExpiration(token({ exp: 1234 }))).toBe(1234)
		expect(tokenExpiration(token({ exp: '1234' }))).toBeNull()
		expect(tokenExpiration(token({}))).toBeNull()
		expect(tokenExpiration('pas-un-jeton')).toBeNull()
		expect(tokenExpiration('a.@@@.c')).toBeNull()
		expect(tokenExpiration(undefined)).toBeNull()
	})
	test('l’ouverture d’une session se retrouve par son identifiant', () => {
		const sessions = [
			{ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' },
			{ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' },
		]
		expect(openedAt(sessions, 'b')).toBe(Date.UTC(2026, 1, 1))
		expect(openedAt(sessions, 'c')).toBeNull()
		expect(openedAt(undefined, 'a')).toBeNull()
		expect(openedAt(sessions, undefined)).toBeNull()
	})
})

describe('au plus un prolongement par visite', () => {
	const nowMs = () => 1_000_000_000
	const nowS = Math.floor(nowMs() / 1000)

	test('moins de 7 jours : une seule demande, même appelé plusieurs fois', async () => {
		const routes: string[] = []
		const extend = createExtension(async route => void routes.push(route), nowMs)
		expect(await extend(nowS + 3 * DAY)).toBe(true)
		expect(await extend(nowS + 3 * DAY)).toBe(false)
		expect(await extend(nowS + DAY)).toBe(false)
		expect(routes).toEqual([EXTENSION_ROUTE])
	})
	test('plus de 7 jours, ou jeton illisible : aucune demande', async () => {
		let requests = 0
		const extend = createExtension(async () => void requests++, nowMs)
		expect(await extend(nowS + 10 * DAY)).toBe(false)
		expect(await extend(null)).toBe(false)
		expect(requests).toBe(0)
	})
	test('une demande qui échoue reste silencieuse et ne se répète pas', async () => {
		let requests = 0
		const extend = createExtension(async () => {
			requests++
			throw new Error('réseau')
		}, nowMs)
		expect(await extend(nowS + DAY)).toBe(true)
		expect(await extend(nowS + DAY)).toBe(false)
		expect(requests).toBe(1)
	})
})

describe('le composant du navigateur', () => {
	const jsdomWindow = openWindow()
	test('il ne dessine rien et ne demande rien quand il reste plus de 7 jours', async () => {
		const calls: string[] = []
		const original = globalThis.fetch
		globalThis.fetch = (async (route: string) => void calls.push(route)) as never
		try {
			const zone = await jsdomWindow.monter(<RefreshSession expire={Math.floor(Date.now() / 1000) + 12 * DAY} />)
			expect(zone.innerHTML).toBe('')
			expect(calls).toEqual([])
		} finally {
			globalThis.fetch = original
		}
	})
	test('il demande une fois le renouvellement par la route de Payload, avec le cookie, même monté deux fois', async () => {
		const calls: { route: string; init?: RequestInit }[] = []
		const original = globalThis.fetch
		globalThis.fetch = (async (route: string, init?: RequestInit) => void calls.push({ route, init })) as never
		try {
			const soon = Math.floor(Date.now() / 1000) + 2 * DAY
			await jsdomWindow.monter(<RefreshSession expire={soon} />)
			await jsdomWindow.monter(<RefreshSession expire={soon} />)
			await jsdomWindow.attendre(() => calls.length > 0 || null)
			expect(calls).toHaveLength(1)
			expect(calls[0]?.route).toBe('/api/pros/refresh-token')
			expect(calls[0]?.init).toEqual({ method: 'POST', credentials: 'same-origin' })
		} finally {
			globalThis.fetch = original
		}
	})
})

describe('browser bundle boundary (079 review)', () => {
	// The client component reaches these files: none may import server code, 'payload' above all.
	for (const file of ['src/lib/auth/extend.ts', 'src/lib/auth/session-duration.ts']) {
		test(`${file} imports nothing from payload`, () => {
			const code = readFileSync(path.join(process.cwd(), file), 'utf8')
			const imports = [...code.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1] ?? '')
			expect(imports.filter(i => !i.startsWith('./'))).toEqual([])
			expect(imports.filter(i => i.startsWith('./') && !i.endsWith('session-duration'))).toEqual([])
		})
	}
})
