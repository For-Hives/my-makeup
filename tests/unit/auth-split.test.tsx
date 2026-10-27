import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthShell } from '../../src/components/auth/AuthShell'
import { GoogleButton } from '../../src/components/auth/GoogleButton'
import { PasswordlessHelp } from '../../src/components/auth/PasswordlessHelp'

/** The sign-in and sign-up pages wear the simple card layout (27/10/2026: one column, no art panel). */
const split = renderToStaticMarkup(
	<AuthShell title="Se connecter" layout="card" footer={<p>pied</p>}>
		<p>contenu</p>
	</AuthShell>
)

describe('coquille en une colonne', () => {
	test('une seule h1 en Bodoni, un seul <main>, le titre précède le formulaire', () => {
		expect(split.match(/<h1/g)).toHaveLength(1)
		expect(split.match(/<main/g)).toHaveLength(1)
		expect(split).toContain('font-display')
		expect(split.indexOf('<h1')).toBeLessThan(split.indexOf('contenu'))
	})

	test('aucune photo ni décor : pas d’arche, pas d’image, pas de pinceau', () => {
		expect(split).not.toContain('art-arch')
		expect(split).not.toContain('<img')
		expect(split).not.toContain('<svg')
	})

	test('le nom du site est un lien vers l’accueil, avec une cible de 44 px au moins', () => {
		expect(split).toMatch(/<a [^>]*href="\/"[^>]*>My Makeup<\/a>/)
		expect(split).toContain('min-h-11')
	})

	test('le contenu est dans une carte, le pied hors de la carte', () => {
		expect(split).toContain('data-testid="auth-card"')
		const card = split.indexOf('data-testid="auth-card"')
		expect(split.indexOf('contenu')).toBeGreaterThan(card)
		expect(split.indexOf('pied')).toBeGreaterThan(split.indexOf('contenu'))
		// The card closes before the footer opens.
		expect(split).toContain('<p>contenu</p></div><div')
	})

	test('la mise en page centrée reste celle des autres pages', () => {
		const centred = renderToStaticMarkup(
			<AuthShell title="Mot de passe oublié">
				<p>x</p>
			</AuthShell>
		)
		expect(centred).not.toContain('auth-card')
		expect(centred).not.toContain('art-arch')
		expect(centred).toContain('text-center')
	})

	test('la connexion et l’inscription passent par la mise en page en une colonne', () => {
		for (const page of ['signin', 'signup']) {
			const source = readFileSync(`src/app/(front)/(dashboard)/auth/${page}/page.tsx`, 'utf8')
			expect(source).toContain('layout="card"')
		}
	})
})

describe('éléments de la carte', () => {
	test('le bouton Google garde ses mots, sa cible de 44 px et un anneau de focus', () => {
		const html = renderToStaticMarkup(<GoogleButton libelle="Se connecter avec Google" retour="/" />)
		expect(html).toContain('Se connecter avec Google')
		expect(html).toContain('min-h-13')
		expect(html).toContain('focus-visible:outline')
		expect(html).toContain('>Ou<')
	})

	test('l’aide sans mot de passe garde ses mots', () => {
		const html = renderToStaticMarkup(<PasswordlessHelp />)
		expect(html).toContain('Inscrite avec Facebook ou Google, sans mot de passe ?')
		expect(html).toContain('pour en choisir un.')
	})
})
