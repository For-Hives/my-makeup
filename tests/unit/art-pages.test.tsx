import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CapsuleImage } from '@/components/art/CapsuleImage'
import { AboutArticle } from '@/components/static-pages/AboutArticle'
import { ArtistBenefits } from '@/components/static-pages/ArtistBenefits'
import { ABOUT, ARTIST_BENEFITS, PARTNERSHIPS } from '@/components/static-pages/artist-texts'
import { ClientBenefits } from '@/components/static-pages/ClientBenefits'
import { ClientGuide } from '@/components/static-pages/ClientGuide'
import { PageArticle, partTitles } from '@/components/static-pages/PageArticle'
import { PageHead, pickIllustration } from '@/components/static-pages/PageHead'
import { ProfileGrid } from '@/components/static-pages/ProfileGrid'
import { GUIDE_FIND_AN_ARTIST } from '@/content/static-pages/client-guides'
import type { ProfileCard } from '@/services/public/profiles'
import { pageText } from '../support/page-text'

/**
 * The content pages in the kit's look (issue 1111): the building blocks (page head, steps, tiered arches, rows with a
 * capsule, the statement of « À propos », the zone and talent grid) render as the kit says and keep the rules of the
 * site (one h1, a head that is never faded, decoration hidden from screen readers, no invented text).
 */

const html = (node: React.ReactElement) => renderToStaticMarkup(node)

const CARD: ProfileCard = {
	slug: 'zoe-fictive',
	pid: 1 as never,
	nom: 'Zoé Fictive',
	specialite: 'Mariage',
	lieu: 'Annecy',
	superMaquilleuse: false,
	photo: null,
}

describe('PageHead', () => {
	test('split : un h1 qui n’est que masqué (jamais fondu), une arche prioritaire, un bouton d’inscription', () => {
		const markup = html(<PageHead title="Un titre" description="Une phrase." signUp />)
		expect(markup.match(/<h1[\s>]/g)).toHaveLength(1)
		expect(markup).toMatch(/<h1 class="[^"]*\benter-mask\b/)
		expect(markup).not.toMatch(/<h1 class="[^"]*\benter-fade\b/)
		expect(markup).toContain('class="art-arch')
		expect(markup).toContain('fetchPriority="high"')
		expect(markup).toContain('href="/auth/signin"')
		expect(markup).toContain('S&#x27;inscrire sur My-Makeup')
	})

	test('mirrored : l’arche passe à gauche, après le texte dans le HTML (le titre se lit en premier)', () => {
		const markup = html(<PageHead title="Un titre" description="Une phrase." mirrored />)
		expect(markup).toContain('data-side="left"')
		expect(markup.indexOf('<h1')).toBeLessThan(markup.indexOf('art-arch'))
	})

	test('centered : pas d’image, un titre centré qui porte une pastille cachée aux lecteurs d’écran', () => {
		const markup = html(
			<PageHead
				layout="centered"
				drawing="lips"
				title={
					<>
						Un titre <CapsuleImage tint="blush" object="brush" />
					</>
				}
				description="Une phrase."
			/>
		)
		expect(markup).not.toContain('<img')
		expect(markup).toMatch(/<h1[^>]*>Un titre <span aria-hidden="true"[^>]*art-capsule/)
		expect(markup).not.toMatch(/<h1[^>]*>[\s\S]*<div/)
		expect(pageText(markup).split('\n')[0]).toBe('Un titre')
	})

	test('une illustration se choisit sur une clé et reste la même', () => {
		expect(pickIllustration('maquillage-mariee')).toEqual(pickIllustration('maquillage-mariee'))
		expect(new Set(['a', 'b', 'c', 'd', 'e'].map(key => pickIllustration(key).image)).size).toBeGreaterThan(1)
		for (const key of ['a', 'maquillage-fx', 'x'.repeat(40)])
			expect(pickIllustration(key).image).toMatch(/^\/assets\/back\/maquilleuse_\w+_white\.webp$/)
	})
})

describe('un guide : les étapes en pastilles numérotées (disposition E)', () => {
	const markup = html(<ClientGuide contenu={GUIDE_FIND_AN_ARTIST} />)

	test('une liste numérotée, chaque étape avec son numéro dessiné caché, son apparition et sa teinte', () => {
		expect(markup).toMatch(/<ol[^>]*>/)
		const steps = markup.match(/<li[^>]*data-step="\d+"[^>]*>/g) ?? []
		expect(steps).toHaveLength(GUIDE_FIND_AN_ARTIST.etapes.length)
		for (const step of steps) expect(step).toContain('reveal')
		expect(markup.match(/<div aria-hidden="true" data-tint="[a-z]+"[^>]*>\d<\/div>/g)).toHaveLength(
			GUIDE_FIND_AN_ARTIST.etapes.length
		)
	})

	test('la recherche du guide suit la description et précède l’article', () => {
		const text = pageText(markup).split('\n')
		const at = (line: string) => text.indexOf(line)
		expect(at('Prestation recherchée')).toBeGreaterThan(1)
		expect(at('Prestation recherchée')).toBeLessThan(at('Particulier'))
	})
})

describe('« Pourquoi… » : arches étagées (disposition B)', () => {
	for (const [name, node, count] of [
		['maquilleuse', <ArtistBenefits key="a" />, ARTIST_BENEFITS.length],
		['particulier', <ClientBenefits key="c" />, 7],
	] as const) {
		test(`${name} : une arche par avantage, objet dessiné et numéro cachés, étagement sur grand écran`, () => {
			const markup = html(node)
			expect(markup.match(/<li[^>]*data-benefit/g)).toHaveLength(count)
			expect(markup.match(/class="art-arch["\s]/g)).toHaveLength(count)
			expect(markup.match(/<p aria-hidden="true"[^>]*>\d\d<\/p>/g)).toHaveLength(count)
			expect(markup).toContain('lg:[&amp;&gt;li:nth-child(4n+2)]:mt-16')
			expect(markup).not.toContain('<img')
		})
	}

	test('les deux pages n’ont pas le même jeu d’objets', () => {
		const objects = (markup: string) => markup.match(/<svg [^>]*art-drawing[^>]*>/g)?.length
		const artist = html(<ArtistBenefits />).split('art-drawing')
		const client = html(<ClientBenefits />).split('art-drawing')
		expect(objects(html(<ArtistBenefits />))).toBeGreaterThan(0)
		expect(artist.slice(1).join('|')).not.toBe(client.slice(1).join('|'))
	})
})

describe('les pages d’articles pour les maquilleuses', () => {
	test('partTitles : les titres des parties, tels quels', () => {
		expect(partTitles(PARTNERSHIPS)).toEqual([
			'Une page professionnelle gratuite',
			'Partenariat : vous restez libre',
			'Mettez en valeur votre parcours',
			'Votre voix compte : Nous sommes à votre écoute',
		])
		expect(partTitles(ABOUT)[0]).toBe('Notre histoire')
	})

	test('rangées : une pastille ronde cachée et une section qui apparaît par partie', () => {
		const markup = html(<PageArticle eyebrow="Maquilleuse" contenu={PARTNERSHIPS} />)
		expect((markup.match(/<section[^>]*class="reveal /g) ?? []).length).toBe(PARTNERSHIPS.parties.length)
		expect(markup.match(/data-shape="round"/g)).toHaveLength(PARTNERSHIPS.parties.length)
		expect(markup).toMatch(/<h3[^>]*>[^<]+<\/h3>/)
	})
})

describe('À propos : l’énoncé et deux arches (disposition D)', () => {
	const markup = html(<AboutArticle eyebrow="À propos" contenu={ABOUT} />)

	test('le paragraphe est le texte de la page, sans guillemets ni blockquote (ce n’est pas une citation)', () => {
		expect(markup).not.toContain('<blockquote')
		expect(markup).not.toContain('<figure')
		expect(markup).not.toMatch(/[«»“”]/)
		expect(pageText(markup)).toContain(ABOUT.introduction)
	})

	test('deux arches, les quatre parties en cartes teintées', () => {
		expect(markup.match(/class="art-arch["\s]/g)).toHaveLength(2)
		expect(markup.match(/<section[^>]*data-tint=/g)).toHaveLength(4)
	})
})

describe('ProfileGrid : zones et talents', () => {
	test('sans carte, ni bloc ni champ', () => {
		expect(html(<ProfileGrid titre="Des maquilleuses" cartes={[]} />)).toBe('')
	})

	test('les cartes de la recherche, sans mesure de clic ; « Votre ville » en GET vers la recherche', () => {
		const markup = html(<ProfileGrid titre="Des maquilleuses pour votre x" cartes={[CARD]} specialite="Mariage" />)
		expect(markup).toContain('data-testid="bloc-maquilleuses"')
		expect(markup).toContain('aria-labelledby="maquilleuses-talent"')
		expect(markup).toContain('href="/profil/zoe-fictive"')
		expect(markup).toContain('data-profile-card')
		expect(markup).toMatch(/<form [^>]*action="\/search" method="get"/)
		expect(markup).toContain('name="specialite" value="Mariage"')
		expect(markup).toContain('name="city"')
		expect(markup).toContain('Votre ville')
		expect(markup).toMatch(/<button type="submit"/)
	})

	test('sur une page de zone : pas de spécialité dans le formulaire', () => {
		expect(html(<ProfileGrid titre="t" cartes={[CARD]} />)).not.toContain('name="specialite"')
	})
})
