import { beforeEach, describe, expect, test } from 'bun:test'
import { AuthenticationError } from 'payload'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'

const rateLimit = createRateLimit({ nom: 'essai-connexion', limite: 10, fenetreMs: 15 * 60_000 })
beforeEach(() => rateLimit.vider())

const url = (ip: string) => new Headers({ 'x-forwarded-for': ip })
const t = (cle: string) => cle as unknown as never // keeps the translator out of the way
const refuse = () => Promise.reject(new AuthenticationError(t as never))

function fake(login: () => Promise<{ token?: string }>) {
	const calls: unknown[] = []
	return {
		appels: calls,
		ouvrir: (options: unknown) => {
			calls.push(options)
			return login()
		},
	}
}

describe('connecter', () => {
	test('un mot de passe juste rend le jeton', async () => {
		const { ouvrir: open, appels: calls } = fake(() => Promise.resolve({ token: 'jeton' }))
		const r = await signInWithPassword({
			ouvrir: open,
			headers: url('192.0.2.1'),
			email: 'Lea@Example.test ',
			password: 'x',
			frein: rateLimit,
		})
		expect(r).toEqual({ ok: true, token: 'jeton' })
		expect(calls[0]).toEqual({ email: 'Lea@Example.test ', password: 'x' })
	})

	test('aucune règle de composition : un mot de passe d’une lettre part chez Payload', async () => {
		const { ouvrir: open, appels: calls } = fake(() => Promise.resolve({ token: 'jeton' }))
		await signInWithPassword({
			ouvrir: open,
			headers: url('192.0.2.1'),
			email: 'a@example.test',
			password: 'a',
			frein: rateLimit,
		})
		expect(calls.length).toBe(1)
	})

	test('un refus de Payload donne le message générique, sans dire pourquoi', async () => {
		const { ouvrir: open } = fake(refuse)
		const r = await signInWithPassword({
			ouvrir: open,
			headers: url('192.0.2.1'),
			email: 'a@example.test',
			password: 'mauvais',
			frein: rateLimit,
		})
		expect(r).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('des champs vides ou absents : générique, sans appeler Payload', async () => {
		const { ouvrir: open, appels: calls } = fake(() => Promise.resolve({ token: 'jeton' }))
		for (const [email, password] of [
			['', 'x'],
			['a@example.test', ''],
			[null, 'x'],
			['a@example.test', null],
			['a@example.test', 'x'.repeat(2000)],
		])
			expect(
				await signInWithPassword({ ouvrir: open, headers: url('192.0.2.1'), email, password, frein: rateLimit })
			).toEqual({
				ok: false,
				code: 'identifiants-invalides',
			})
		expect(calls.length).toBe(0)
	})

	test('une panne n’est pas un mauvais mot de passe, et ne compte pas', async () => {
		const { ouvrir: open } = fake(() => Promise.reject(new Error('base injoignable')))
		for (let i = 0; i < 15; i++)
			expect(
				await signInWithPassword({
					ouvrir: open,
					headers: url('192.0.2.2'),
					email: 'a@example.test',
					password: 'x',
					frein: rateLimit,
				})
			).toEqual({
				ok: false,
				code: 'service-indisponible',
			})
	})

	test('le onzième échec d’une adresse est freiné sans appeler Payload ; une autre adresse passe', async () => {
		const { ouvrir: open, appels: calls } = fake(refuse)
		for (let i = 0; i < 10; i++)
			expect(
				await signInWithPassword({
					ouvrir: open,
					headers: url('192.0.2.3'),
					email: 'a@example.test',
					password: 'x',
					frein: rateLimit,
				})
			).toEqual({
				ok: false,
				code: 'identifiants-invalides',
			})
		expect(
			await signInWithPassword({
				ouvrir: open,
				headers: url('192.0.2.3'),
				email: 'a@example.test',
				password: 'x',
				frein: rateLimit,
			})
		).toEqual({
			ok: false,
			code: 'trop-de-tentatives',
		})
		expect(calls.length).toBe(10)
		const good = fake(() => Promise.resolve({ token: 'jeton' }))
		expect(
			(
				await signInWithPassword({
					ouvrir: good.ouvrir,
					headers: url('192.0.2.4'),
					email: 'a@example.test',
					password: 'x',
					frein: rateLimit,
				})
			).ok
		).toBe(true)
	})

	test('l’adresse écrite en tête de X-Forwarded-For ne change pas le compte', async () => {
		const { ouvrir: open } = fake(refuse)
		for (let i = 0; i < 10; i++)
			await signInWithPassword({
				ouvrir: open,
				headers: url(`10.0.0.${i}, 192.0.2.5`),
				email: 'a@example.test',
				password: 'x',
				frein: rateLimit,
			})
		const r = await signInWithPassword({
			ouvrir: open,
			headers: url('10.9.9.9, 192.0.2.5'),
			email: 'a@example.test',
			password: 'x',
			frein: rateLimit,
		})
		expect(r).toEqual({ ok: false, code: 'trop-de-tentatives' })
	})

	test('une connexion réussie rend sa place', async () => {
		const good = fake(() => Promise.resolve({ token: 'jeton' }))
		for (let i = 0; i < 30; i++)
			expect(
				(
					await signInWithPassword({
						ouvrir: good.ouvrir,
						headers: url('192.0.2.6'),
						email: 'a@example.test',
						password: 'x',
						frein: rateLimit,
					})
				).ok
			).toBe(true)
	})
})
