import { beforeEach, describe, expect, test } from 'bun:test'
import { AuthenticationError } from 'payload'
import { createRateLimit } from '@/lib/auth/rate-limit'
import { signInWithPassword } from '@/lib/auth/sign-in'

const frein = createRateLimit({ nom: 'essai-connexion', limite: 10, fenetreMs: 15 * 60_000 })
beforeEach(() => frein.vider())

const adresse = (ip: string) => new Headers({ 'x-forwarded-for': ip })
const t = (cle: string) => cle as unknown as never // keeps the translator out of the way
const refuse = () => Promise.reject(new AuthenticationError(t as never))

function faux(login: () => Promise<{ token?: string }>) {
	const appels: unknown[] = []
	return {
		appels,
		ouvrir: (options: unknown) => {
			appels.push(options)
			return login()
		},
	}
}

describe('connecter', () => {
	test('un mot de passe juste rend le jeton', async () => {
		const { ouvrir, appels } = faux(() => Promise.resolve({ token: 'jeton' }))
		const r = await signInWithPassword({
			ouvrir,
			headers: adresse('192.0.2.1'),
			email: 'Lea@Example.test ',
			password: 'x',
			frein,
		})
		expect(r).toEqual({ ok: true, token: 'jeton' })
		expect(appels[0]).toEqual({ email: 'Lea@Example.test ', password: 'x' })
	})

	test('aucune règle de composition : un mot de passe d’une lettre part chez Payload', async () => {
		const { ouvrir, appels } = faux(() => Promise.resolve({ token: 'jeton' }))
		await signInWithPassword({ ouvrir, headers: adresse('192.0.2.1'), email: 'a@example.test', password: 'a', frein })
		expect(appels.length).toBe(1)
	})

	test('un refus de Payload donne le message générique, sans dire pourquoi', async () => {
		const { ouvrir } = faux(refuse)
		const r = await signInWithPassword({
			ouvrir,
			headers: adresse('192.0.2.1'),
			email: 'a@example.test',
			password: 'mauvais',
			frein,
		})
		expect(r).toEqual({ ok: false, code: 'identifiants-invalides' })
	})

	test('des champs vides ou absents : générique, sans appeler Payload', async () => {
		const { ouvrir, appels } = faux(() => Promise.resolve({ token: 'jeton' }))
		for (const [email, password] of [
			['', 'x'],
			['a@example.test', ''],
			[null, 'x'],
			['a@example.test', null],
			['a@example.test', 'x'.repeat(2000)],
		])
			expect(await signInWithPassword({ ouvrir, headers: adresse('192.0.2.1'), email, password, frein })).toEqual({
				ok: false,
				code: 'identifiants-invalides',
			})
		expect(appels.length).toBe(0)
	})

	test('une panne n’est pas un mauvais mot de passe, et ne compte pas', async () => {
		const { ouvrir } = faux(() => Promise.reject(new Error('base injoignable')))
		for (let i = 0; i < 15; i++)
			expect(
				await signInWithPassword({
					ouvrir,
					headers: adresse('192.0.2.2'),
					email: 'a@example.test',
					password: 'x',
					frein,
				})
			).toEqual({
				ok: false,
				code: 'service-indisponible',
			})
	})

	test('le onzième échec d’une adresse est freiné sans appeler Payload ; une autre adresse passe', async () => {
		const { ouvrir, appels } = faux(refuse)
		for (let i = 0; i < 10; i++)
			expect(
				await signInWithPassword({
					ouvrir,
					headers: adresse('192.0.2.3'),
					email: 'a@example.test',
					password: 'x',
					frein,
				})
			).toEqual({
				ok: false,
				code: 'identifiants-invalides',
			})
		expect(
			await signInWithPassword({ ouvrir, headers: adresse('192.0.2.3'), email: 'a@example.test', password: 'x', frein })
		).toEqual({
			ok: false,
			code: 'trop-de-tentatives',
		})
		expect(appels.length).toBe(10)
		const bon = faux(() => Promise.resolve({ token: 'jeton' }))
		expect(
			(
				await signInWithPassword({
					ouvrir: bon.ouvrir,
					headers: adresse('192.0.2.4'),
					email: 'a@example.test',
					password: 'x',
					frein,
				})
			).ok
		).toBe(true)
	})

	test('l’adresse écrite en tête de X-Forwarded-For ne change pas le compte', async () => {
		const { ouvrir } = faux(refuse)
		for (let i = 0; i < 10; i++)
			await signInWithPassword({
				ouvrir,
				headers: adresse(`10.0.0.${i}, 192.0.2.5`),
				email: 'a@example.test',
				password: 'x',
				frein,
			})
		const r = await signInWithPassword({
			ouvrir,
			headers: adresse('10.9.9.9, 192.0.2.5'),
			email: 'a@example.test',
			password: 'x',
			frein,
		})
		expect(r).toEqual({ ok: false, code: 'trop-de-tentatives' })
	})

	test('une connexion réussie rend sa place', async () => {
		const bon = faux(() => Promise.resolve({ token: 'jeton' }))
		for (let i = 0; i < 30; i++)
			expect(
				(
					await signInWithPassword({
						ouvrir: bon.ouvrir,
						headers: adresse('192.0.2.6'),
						email: 'a@example.test',
						password: 'x',
						frein,
					})
				).ok
			).toBe(true)
	})
})
