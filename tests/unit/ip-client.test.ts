import { describe, expect, test } from 'bun:test'
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
