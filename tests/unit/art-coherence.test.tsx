import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthShell } from '../../src/components/auth/AuthShell'
import { ForgotPasswordForm } from '../../src/components/auth/ForgotPasswordForm'
import { PasswordResetForm } from '../../src/components/auth/PasswordResetForm'
import { ResendForm } from '../../src/components/auth/ResendForm'
import { SignInForm } from '../../src/components/auth/SignInForm'
import { SignUpForm } from '../../src/components/auth/SignUpForm'
import { ErrorPage } from '../../src/components/layout/ErrorPage'
import { NotFoundPage } from '../../src/components/layout/NotFoundPage'

/** Coherence pass (25/10/2026): the pages outside the content pages wear the art direction kit, not the old shells. */

const noop = (async () => null) as never
const forms: [string, string][] = [
	['SignInForm', renderToStaticMarkup(<SignInForm action={noop} retour="/" />)],
	['SignUpForm', renderToStaticMarkup(<SignUpForm action={noop} />)],
	['ForgotPasswordForm', renderToStaticMarkup(<ForgotPasswordForm action={noop} />)],
	['PasswordResetForm', renderToStaticMarkup(<PasswordResetForm action={noop} />)],
	['ResendForm', renderToStaticMarkup(<ResendForm action={noop} />)],
]

describe('formulaires d’authentification dans le kit', () => {
	for (const [name, html] of forms) {
		test(`${name} : champs arrondis du kit, bouton en pilule, aucun ancien style`, () => {
			expect(html).toContain('rounded-art-field')
			expect(html).toContain('rounded-full')
			expect(html).not.toContain('rounded-md')
			expect(html).not.toContain('bg-neutral-900')
		})
	}
})

describe('coquille des pages d’authentification', () => {
	test('titre en Bodoni sur fond papier, une seule h1', () => {
		const html = renderToStaticMarkup(
			<AuthShell title="Se connecter">
				<p>x</p>
			</AuthShell>
		)
		expect(html.match(/<h1/g)).toHaveLength(1)
		expect(html).toContain('font-display')
		expect(html).toContain('bg-art-paper')
		expect(html).toContain('Se connecter')
	})

	test.each([
		'signin',
		'signup',
		'mot-de-passe-oublie',
		'reinitialiser',
		'verification-wall',
		'verification-complete',
		'error',
	])('la page /auth/%s passe par AuthShell, sans l’ancien <main> ni bouton noir', page => {
		const source = readFileSync(`src/app/(front)/(dashboard)/auth/${page}/page.tsx`, 'utf8')
		expect(source).toContain('<AuthShell')
		expect(source).not.toContain('<main')
		expect(source).not.toContain('bg-neutral-900')
	})
})

describe('404 et erreur dans le kit', () => {
	test('la 404 : titre en Bodoni, lien en pilule, mots inchangés', () => {
		const html = renderToStaticMarkup(<NotFoundPage />)
		expect(html).toContain('font-display')
		expect(html).toContain('rounded-full')
		expect(html).not.toContain('btn-primary-large')
		expect(html).toContain('Oops ! La page que vous cherchez n&#x27;existe pas.')
	})

	test('l’erreur : titre en Bodoni, deux pilules de 44 px', () => {
		const html = renderToStaticMarkup(<ErrorPage reessayer={() => undefined} />)
		expect(html).toContain('font-display')
		expect(html).not.toContain('btn-primary-large')
		expect(html.match(/rounded-full/g)?.length).toBeGreaterThanOrEqual(2)
	})
})
