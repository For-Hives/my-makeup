import { describe, expect, test } from 'bun:test'
import { artistFromAccount } from '@/lib/auth/artist'
import { greetingName } from '@/lib/dashboard/greeting'

describe('T298 : « Bonjour Audrey », le champ du compte est lu sous son vrai nom', () => {
	test('la session construite depuis un compte { name: "Audrey" } porte « Audrey »', () => {
		const artist = artistFromAccount({ id: 7, name: 'Audrey', email: 'audrey@example.test' })
		expect(artist).toEqual({ id: 7, name: 'Audrey', email: 'audrey@example.test', expire: null })
	})

	test('un compte sans nom ou au nom vide donne un nom vide, et la salutation « toi »', () => {
		for (const name of ['', null, undefined]) {
			const artist = artistFromAccount({ id: 7, name, email: 'a@example.test' })
			expect(artist.name).toBe('')
			expect(greetingName({ accountName: artist.name })).toBe('toi')
		}
	})

	test('le prénom du profil passe avant le nom du compte', () => {
		expect(greetingName({ firstName: 'Audrey', accountName: 'Mme Martin' })).toBe('Audrey')
	})

	test('sans prénom de profil, le nom du compte sert ; un nom complet est ramené à son prénom', () => {
		expect(greetingName({ firstName: '  ', accountName: 'Audrey' })).toBe('Audrey')
		expect(greetingName({ firstName: null, accountName: 'Audrey Martin' })).toBe('Audrey')
	})

	test('ni prénom ni nom : « toi »', () => {
		expect(greetingName({})).toBe('toi')
		expect(greetingName({ firstName: '', accountName: '   ' })).toBe('toi')
	})
})
