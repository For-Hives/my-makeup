import { afterEach, describe, expect, test } from 'bun:test'
import { cleDeAdresse, ipClient } from '@/lib/auth/ip-client'

const avec = (entetes: Record<string, string>) => new Headers(entetes)

describe('ipClient : l’adresse que le proxy a vue', () => {
	test('la dernière entrée de X-Forwarded-For, jamais la première', () => {
		expect(ipClient(avec({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9')
		expect(ipClient(avec({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.9' }))).toBe('203.0.113.9')
	})

	test('un en-tête forgé n’a aucun effet : seules les entrées de tête changent', () => {
		const a = ipClient(avec({ 'x-forwarded-for': 'a, 198.51.100.4' }))
		const b = ipClient(avec({ 'x-forwarded-for': 'b, c, d, 198.51.100.4' }))
		expect(a).toBe(b)
	})

	test('X-Real-IP n’est jamais lu', () => {
		expect(ipClient(avec({ 'x-real-ip': '198.51.100.7' }))).toBe('local')
		expect(ipClient(avec({ 'x-forwarded-for': '203.0.113.9', 'x-real-ip': '198.51.100.7' }))).toBe('203.0.113.9')
	})

	test('sans proxy ni en-tête : local', () => {
		expect(ipClient(new Headers())).toBe('local')
		expect(ipClient(avec({ 'x-forwarded-for': ' ' }))).toBe('local')
	})
})

describe('cleDeAdresse : une IPv6 compte par bloc /64', () => {
	test('toutes les écritures d’un même /64 donnent la même clé', () => {
		const cle = '2001:db8:0:0::/64'
		for (const ecriture of [
			'2001:db8::1',
			'2001:DB8:0:0::ab',
			'2001:db8:0:0:0:0:0:1',
			'[2001:db8::ffff:1]',
			'2001:db8::1%eth0',
		])
			expect(cleDeAdresse(ecriture)).toBe(cle)
	})

	test('deux /64 différents ont deux clés', () => {
		expect(cleDeAdresse('2001:db8:0:1::1')).not.toBe(cleDeAdresse('2001:db8:0:2::1'))
	})

	test('une IPv4 reste elle-même, et une IPv4 vue par une socket IPv6 la retrouve', () => {
		expect(cleDeAdresse('203.0.113.7')).toBe('203.0.113.7')
		expect(cleDeAdresse('::ffff:203.0.113.7')).toBe('203.0.113.7')
	})

	test('ce qui n’est pas une adresse passe tel quel', () => {
		expect(cleDeAdresse('pas:une:adresse')).toBe('pas:une:adresse')
	})
})

describe('TRUSTED_PROXY_CIDRS : les sauts de confiance sont ignorés', () => {
	const avant = process.env.TRUSTED_PROXY_CIDRS
	afterEach(() => {
		if (avant === undefined) delete process.env.TRUSTED_PROXY_CIDRS
		else process.env.TRUSTED_PROXY_CIDRS = avant
	})

	test('un CDN de confiance devant le proxy : le visiteur reste distinct', () => {
		process.env.TRUSTED_PROXY_CIDRS = '173.245.48.0/20, 2400:cb00::/32'
		expect(ipClient(avec({ 'x-forwarded-for': '203.0.113.9, 173.245.48.5' }))).toBe('203.0.113.9')
		expect(ipClient(avec({ 'x-forwarded-for': '198.51.100.4, 173.245.48.5' }))).toBe('198.51.100.4')
		expect(ipClient(avec({ 'x-forwarded-for': '203.0.113.9, 2400:cb00:1::7' }))).toBe('203.0.113.9')
	})

	test('une entrée forgée à gauche n’a pas d’effet, une entrée de confiance forgée non plus', () => {
		process.env.TRUSTED_PROXY_CIDRS = '173.245.48.0/20'
		const a = ipClient(avec({ 'x-forwarded-for': 'x, 203.0.113.9, 173.245.48.5' }))
		const b = ipClient(avec({ 'x-forwarded-for': '1.1.1.1, 173.245.48.9, 203.0.113.9, 173.245.48.5' }))
		expect(a).toBe('203.0.113.9')
		expect(b).toBe('203.0.113.9')
	})

	test('tout est de confiance : la plus à gauche ; configuration invalide : ignorée', () => {
		process.env.TRUSTED_PROXY_CIDRS = '10.0.0.0/8'
		expect(ipClient(avec({ 'x-forwarded-for': '10.1.1.1, 10.2.2.2' }))).toBe('10.1.1.1')
		process.env.TRUSTED_PROXY_CIDRS = 'n’importe quoi, 10.0.0.0/99'
		expect(ipClient(avec({ 'x-forwarded-for': '203.0.113.9, 10.2.2.2' }))).toBe('10.2.2.2')
	})
})
