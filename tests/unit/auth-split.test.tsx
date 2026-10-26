import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthShell } from '../../src/components/auth/AuthShell'
import { GoogleButton } from '../../src/components/auth/GoogleButton'
import { PasswordlessHelp } from '../../src/components/auth/PasswordlessHelp'

/** Issue 1138: the sign-in and sign-up pages wear the split layout (art panel with the title, form card). */
const split = renderToStaticMarkup(
	<AuthShell title="Se connecter" layout="split" footer={<p>pied</p>}>
		<p>contenu</p>
	</AuthShell>
)

describe('coquille en deux colonnes', () => {
	test('une seule h1 en Bodoni, un seul <main>, le titre précède le formulaire', () => {
		expect(split.match(/<h1/g)).toHaveLength(1)
		expect(split.match(/<main/g)).toHaveLength(1)
		expect(split).toContain('font-display')
		expect(split.indexOf('<h1')).toBeLessThan(split.indexOf('contenu'))
	})

	test('un panneau d’art avec une arche décorative (alt vide), caché en dessous de 1024 px', () => {
		expect(split).toContain('art-arch')
		expect(split).toMatch(/alt=""/)
		expect(split).toMatch(/class="[^"]*\bhidden\b[^"]*\blg:block\b[^"]*"><div data-band/)
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

	test('la connexion et l’inscription passent par la mise en page en deux colonnes', () => {
		for (const page of ['signin', 'signup']) {
			const source = readFileSync(`src/app/(front)/(dashboard)/auth/${page}/page.tsx`, 'utf8')
			expect(source).toContain('layout="split"')
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
		expect(html).toContain('Tu t’étais inscrite avec Facebook ? Ce bouton n’existe plus')
		expect(html).toContain('pour recevoir un lien et choisir ton mot de passe.')
	})
})
