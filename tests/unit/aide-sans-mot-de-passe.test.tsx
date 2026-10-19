import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AideSansMotDePasse } from '@/components/auth/PasswordlessHelp'

/** Ticket 093: the help line of the sign-in page names Facebook and sends to « Mot de passe oublié ». */
describe('la ligne d’aide de la connexion', () => {
	const html = renderToStaticMarkup(<AideSansMotDePasse />)

	test('elle dit aux anciennes inscrites Facebook de passer par « Mot de passe oublié »', () => {
		expect(html).toContain('Facebook')
		expect(html).toContain('href="/auth/mot-de-passe-oublie"')
		expect(html).toContain('Mot de passe oublié')
	})

	test('elle ne demande ni ne montre aucune adresse, et n’a aucun bouton Facebook', () => {
		expect(html).not.toContain('<input')
		expect(html).not.toContain('<button')
		expect(html).not.toContain('@')
		expect(html).not.toContain('/auth/facebook')
	})
})
