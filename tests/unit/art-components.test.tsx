import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArchImage } from '@/components/art/ArchImage'
import { ArtCta } from '@/components/art/ArtCta'
import { BlogCard } from '@/components/art/BlogCard'
import { CapsuleImage } from '@/components/art/CapsuleImage'
import { Chip } from '@/components/art/Chip'
import { LINE_DRAWINGS, type LineDrawingName, MAKEUP_OBJECTS, type MakeupObjectName } from '@/components/art/drawings'
import { GlowBlob, Hairline, Icon, LineDrawing, MakeupObject, PrintMark } from '@/components/art/graphics'
import { IconPath } from '@/components/art/IconPath'
import { ICON_CLOSE, ICONS, type IconName } from '@/components/art/icons'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
import { Pill } from '@/components/art/Pill'
import { ProfileCard, ProfileRowCard } from '@/components/art/ProfileCard'
import { RotatingBadge } from '@/components/art/RotatingBadge'
import { RoundButton } from '@/components/art/RoundButton'
import { SectionHead } from '@/components/art/SectionHead'
import { TestimonialArch } from '@/components/art/TestimonialArch'
import { TitleAccent, TitleWithCapsules } from '@/components/art/TitleWithCapsules'
import type { ProfileCard as ProfileCardData } from '@/services/public/profiles'

/**
 * The base components of the art direction kit (issue 1111), rendered on the server as a page would: what they say to a
 * screen reader, what a keyboard finds, what is only decoration. Made-up values only.
 */

const ROOT = join(import.meta.dir, '../..')
const CSS = readFileSync(join(ROOT, 'src/app/(front)/globals.css'), 'utf8')

const html = (node: React.ReactElement) => renderToStaticMarkup(node)

const PROFILE: ProfileCardData = {
	slug: 'zoe-fictive',
	pid: 1 as never,
	nom: 'Zoé Fictive',
	specialite: 'Mariage',
	lieu: 'Annecy et 30 km autour',
	superMaquilleuse: true,
	photo: { url: 'https://photos.example.test/media/abc.webp', width: 400, height: 400 },
	offerNames: ['Mariée', 'Soirée'],
	startingPrice: 150,
	activityVerified: true,
}

/** Every `<svg …>` the markup draws carries aria-hidden: drawings are decoration. */
function everySvgIsHidden(markup: string) {
	const svgs = markup.match(/<svg\b[^>]*>/g) ?? []
	expect(svgs.length).toBeGreaterThan(0)
	for (const svg of svgs) expect(svg).toContain('aria-hidden="true"')
}

describe('the drawn assets', () => {
	test('every drawing is decoration: aria-hidden, never focusable, no title', () => {
		for (const node of [
			<PrintMark key="a" kind="plus" />,
			<PrintMark key="b" kind="ring" />,
			<PrintMark key="c" kind="dot" />,
			<PrintMark key="d" kind="dash" />,
			<Icon key="e" name="arrow-right" />,
			<MakeupObject key="f" name="lipstick" />,
			<LineDrawing key="g" name="lips" />,
			<Hairline key="i" variant="marks" />,
		]) {
			const markup = html(node)
			everySvgIsHidden(markup)
			expect(markup).toContain('focusable="false"')
			expect(markup).not.toContain('<title')
		}
	})

	test('the drawings take currentColor, so a class sets their colour: one filled path, never a stroke', () => {
		for (const markup of [
			html(<MakeupObject name="brush" />),
			html(<LineDrawing name="eye" />),
			html(<Icon name="search" />),
		]) {
			expect(markup).toContain('fill="currentColor"')
			expect(markup).toContain('fill-rule="evenodd"')
			expect(markup.match(/<path /g)).toHaveLength(1)
			expect(markup).not.toContain('stroke')
			expect(markup).not.toMatch(/(?:href|style|onload|onclick)=/)
		}
		expect(html(<MakeupObject name="brush" />)).toContain('class="art-drawing')
		expect(html(<PrintMark kind="plus" />)).toContain('stroke="currentColor"')
	})

	test('every makeup object, line drawing and icon is a path of the same 24 grid', () => {
		for (const name of Object.keys(MAKEUP_OBJECTS) as MakeupObjectName[])
			expect(html(<MakeupObject name={name} />)).toContain('viewBox="0 0 24 24"')
		for (const name of Object.keys(LINE_DRAWINGS) as LineDrawingName[])
			expect(html(<LineDrawing name={name} />)).toContain('viewBox="0 0 24 24"')
		for (const name of Object.keys(ICONS) as IconName[]) {
			const markup = html(<Icon name={name} />)
			expect(markup).toContain('viewBox="0 0 24 24"')
			expect(markup).toContain('aria-hidden="true"')
		}
		expect(Object.keys(MAKEUP_OBJECTS).sort()).toEqual(
			[
				'brush',
				'camera',
				'comb',
				'compact',
				'dress',
				'eyelash-curler',
				'eyeliner',
				'eyeshadow-palette',
				'foundation',
				'hair-dryer',
				'lipstick',
				'makeup-bag',
				'mascara',
				'mirror',
				'nail-polish',
				'perfume',
				'ring',
				'scissors',
				'sponge',
			].sort()
		)
		expect(Object.keys(LINE_DRAWINGS).sort()).toEqual(['eye', 'lips'])
	})

	test('the drawing data is clean: no metadata, no background, no stroke, no script, no link', () => {
		for (const file of ['drawings.ts', 'icons.ts']) {
			const source = readFileSync(join(ROOT, 'src/components/art', file), 'utf8')
			const data = source.slice(source.indexOf('export const'))
			for (const forbidden of ['c2pa', 'metadata', 'rgb(255', '<script', 'xmlns', 'fill', 'stroke', 'href', 'style'])
				expect(data.toLowerCase()).not.toContain(forbidden)
		}
	})

	test('an icon is drawn by IconPath, a server component names it, a client one imports its constant', () => {
		const path = html(<IconPath d={ICON_CLOSE} className="h-6 w-6" />)
		expect(path).toBe(html(<Icon name="close" className="h-6 w-6" />))
		expect(readFileSync(join(ROOT, 'src/components/art/IconPath.tsx'), 'utf8')).not.toContain('./icons')
		expect(readFileSync(join(ROOT, 'src/components/art/MarqueePauseButton.tsx'), 'utf8')).toContain("from './IconPath'")
	})

	test('the glow is a soft gradient, in three sizes, that never takes a click', () => {
		for (const size of ['sm', 'md', 'lg'] as const)
			expect(html(<GlowBlob size={size} />)).toContain(`data-size="${size}"`)
		expect(html(<GlowBlob />)).toContain('aria-hidden="true"')
		const rule = /\.art-glow \{([^}]*)\}/.exec(CSS)?.[1] ?? ''
		expect(rule).toContain('pointer-events: none')
		expect(rule).toContain('radial-gradient')
		expect(CSS).not.toMatch(/\.art-glow[^{]*\{[^}]*animation/)
	})
})

describe('buttons and controls', () => {
	test('a pill link is a link, 44 px high at least, with a focus ring, its arrow hidden', () => {
		for (const variant of ['outline', 'filled', 'light', 'ghost-light'] as const)
			for (const size of ['md', 'sm'] as const) {
				const markup = html(
					<Pill href="/search" variant={variant} size={size} arrow>
						Trouver
					</Pill>
				)
				expect(markup).toMatch(/<a [^>]*href="\/search"/)
				expect(markup).toMatch(/min-h-1[13]\b/)
				expect(markup).toContain('focus-visible:outline-2')
				expect(markup).toContain('Trouver')
				everySvgIsHidden(markup)
			}
	})

	test('without href a pill is a button of type button; the play variant has a 56 px disc', () => {
		expect(html(<Pill>Envoyer</Pill>)).toMatch(/<button type="button"/)
		const play = html(<Pill variant="play">Comment ça marche ?</Pill>)
		expect(play).toContain('size-14')
		expect(play).toContain('min-h-14')
		expect(play).toContain('Comment ça marche ?')
	})

	test('a round button is named by its label and is 52 px wide', () => {
		const next = html(<RoundButton icon="arrow-right" label="Suivant" solid />)
		expect(next).toContain('aria-label="Suivant"')
		expect(next).toContain('size-13')
		expect(next).toContain('bg-ink')
		expect(html(<RoundButton icon="arrow-left" label="Précédent" href="/blog" />)).toMatch(
			/<a [^>]*href="\/blog"[^>]*aria-label="Précédent"|<a [^>]*aria-label="Précédent"[^>]*href="\/blog"/
		)
		expect(html(<RoundButton icon="arrow-left" label="Précédent" disabled />)).toContain('disabled=""')
	})

	test('a chip is a plain label, a link or a toggle: only the last two are 44 px targets', () => {
		const plain = html(<Chip tone="blush">Soirée</Chip>)
		expect(plain).toMatch(/^<span/)
		expect(plain).toContain('min-h-[30px]')
		const link = html(
			<Chip href="/search?type=mariage" current>
				Mariage
			</Chip>
		)
		expect(link).toMatch(/^<a /)
		expect(link).toContain('min-h-11')
		expect(link).toContain('aria-current="true"')
		const toggle = html(<Chip pressed>Mariage</Chip>)
		expect(toggle).toMatch(/^<button type="button" aria-pressed="true"/)
		expect(toggle).toContain('min-h-11')
		expect(toggle).toContain('focus-visible:outline-2')
		expect(html(<Chip pressed={false}>Soirée</Chip>)).toContain('aria-pressed="false"')
	})

	test('the lipstick colour token is not in any control', () => {
		const all = html(
			<>
				<Pill>a</Pill>
				<Chip tone="solid">b</Chip>
				<RoundButton icon="menu" label="Menu" />
			</>
		)
		expect(all).not.toMatch(/lipstick/)
	})
})

describe('the scrolling banner', () => {
	const banner = html(<MarqueeBanner label="Annonce" items={['Mariage', 'Soirée']} variant="rule" />)

	test('is a named region and its text is read once: the repeats and the second group are aria-hidden', () => {
		expect(banner).toMatch(/<section aria-label="Annonce"/)
		const exposed = [...banner.matchAll(/<span class="art-marquee__item"(?![^>]*aria-hidden)[^>]*>([^<]*)/g)].map(
			match => match[1]
		)
		expect(exposed).toEqual(['Mariage', 'Soirée'])
		expect(banner).toMatch(/<div class="art-marquee__group" aria-hidden="true">/)
	})

	test('has its pause button, named, with the state in aria-pressed, 44 px', () => {
		expect(banner).toContain('aria-label="Mettre en pause le défilement"')
		expect(banner).toContain('aria-pressed="false"')
		expect(CSS).toMatch(/\.art-marquee__pause \{[^}]*width: 44px;[^}]*height: 44px/)
	})

	test('has three variants', () => {
		for (const variant of ['band', 'rule', 'blush'] as const)
			expect(html(<MarqueeBanner label="x" items={['a']} variant={variant} />)).toContain(`data-variant="${variant}"`)
	})

	test('moves only under no-preference; with reduced motion it is a static line with no copy and no pause button', () => {
		const slide = CSS.indexOf('animation: art-slide')
		const noPreference = CSS.lastIndexOf('@media (prefers-reduced-motion: no-preference)', slide)
		expect(noPreference).toBeGreaterThan(CSS.indexOf('ART DIRECTION KIT'))
		// Nothing outside that media block declares the animation, and the global reduce rule stops loops.
		const outside = CSS.slice(CSS.indexOf('ART DIRECTION KIT'), noPreference)
		expect(outside).not.toMatch(/animation:/)
		expect(CSS).toMatch(
			/prefers-reduced-motion: reduce\) \{\s*\*,\s*::before,\s*::after \{[^}]*animation-iteration-count: 1 !important/
		)
		// The static state: copies, second group and pause button are display: none until motion is allowed.
		expect(outside).toMatch(
			/\.art-marquee__group\[aria-hidden="true"\],\s*\.art-marquee__item\[data-copy\],\s*\.art-marquee__pause \{\s*display: none/
		)
		// Hover, focus and the button pause it (WCAG 2.2.2).
		const motion = CSS.slice(noPreference)
		expect(motion).toContain('.art-marquee:hover .art-marquee__track')
		expect(motion).toContain('.art-marquee:focus-within .art-marquee__track')
		expect(motion).toContain('.art-marquee[data-paused="true"] .art-marquee__track')
	})

	test('only transform moves, in keyframes', () => {
		for (const name of ['art-slide', 'art-spin']) {
			const body = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
			expect(body).toContain('transform')
			expect(body).not.toMatch(/\b(left|top|width|height|margin)\b/)
		}
	})
})

describe('titles, heads and pictures', () => {
	test('a title with capsules reads as its words only: the capsules are hidden', () => {
		const title = html(
			<TitleWithCapsules
				as="h1"
				segments={[
					{ text: 'Trouvez la' },
					{ capsule: { object: 'compact' } },
					{ lineBreak: true },
					{ text: 'maquilleuse', tone: 'indigo' },
					{ text: 'de votre', tone: 'ink' },
					{ text: 'grand jour', tone: 'berry', italic: true },
				]}
			/>
		)
		expect(title).toMatch(/^<h1 /)
		expect(title).toContain('<br/>')
		expect(title).toContain('font-display')
		expect(title.match(/<span aria-hidden="true"[^>]*art-capsule/g)).toHaveLength(1)
		// The text nodes between tags, in order: the capsule has none, so the heading reads as its words.
		const words = [...title.matchAll(/>([^<]+)</g)].map(match => match[1]).join(' ')
		expect(words.replace(/\s+/g, ' ').trim()).toBe('Trouvez la maquilleuse de votre grand jour')
		expect(title).toContain('text-art-berry')
		expect(html(<TitleAccent>x</TitleAccent>)).toContain('text-indigo-700')
	})

	test('a capsule is a hidden pill with an inner outline, in both shapes and a dark version', () => {
		expect(html(<CapsuleImage object="lipstick" />)).toMatch(
			/aria-hidden="true"[^>]*class="art-capsule"|class="art-capsule"[^>]*aria-hidden="true"/
		)
		expect(html(<CapsuleImage shape="round" />)).toContain('data-shape="round"')
		expect(html(<CapsuleImage dark line="lips" />)).toContain('data-dark=""')
		expect(CSS).toMatch(/\.art-capsule__in::after \{[^}]*border: 1px solid/)
	})

	test('the section head: centred with art on the sides, or left with a numbered eyebrow and an aside', () => {
		const centred = html(
			<SectionHead eyebrow="Les catégories" title="Un style" sideArt={{ start: <LineDrawing name="lips" /> }}>
				Du mariage au plateau.
			</SectionHead>
		)
		expect(centred).toContain('text-center')
		expect(centred).toMatch(/<h2 class="reveal /)
		expect(centred).toContain('hidden w-32 lg:block')
		expect(centred).toMatch(/aria-hidden="true" class="pointer-events-none absolute/)
		const left = html(
			<SectionHead
				variant="left"
				number="01"
				eyebrow="Mise en avant"
				title="Les plus demandées"
				id="mise-en-avant"
				aside={<RoundButton icon="arrow-right" label="Suivant" />}
			/>
		)
		expect(left).toContain('>01<')
		expect(left).toContain('id="mise-en-avant"')
		expect(left).toContain('aria-label="Suivant"')
		// The number is read as part of the eyebrow, in italic Bodoni; the hairline after it is hidden.
		expect(left).toContain('italic')
	})

	test('an arch picture: band, side, mark (hidden), alt kept or empty', () => {
		const arch = html(
			<ArchImage src="https://photos.example.test/a.webp" alt="Portrait de la mariée" band="rose" mark="ring" />
		)
		expect(arch).toContain('data-band="rose"')
		expect(arch).toContain('alt="Portrait de la mariée"')
		expect(arch).toMatch(/<span aria-hidden="true" class="art-arch__mark/)
		expect(html(<ArchImage side="left" size="sm" mark={false} />)).not.toContain('art-arch__mark')
		expect(html(<ArchImage side="left" size="sm" />)).toContain('data-side="left"')
		expect(html(<ArchImage src="https://photos.example.test/a.webp" />)).toContain('alt=""')
	})

	test('the rotating badge: the ring is hidden and still without motion, the link has a name and a 56 px target', () => {
		const badge = html(
			<RotatingBadge text="Explorer les maquilleuses" href="/search" label="Explorer les maquilleuses" />
		)
		expect(badge).toContain('art-spin')
		expect(badge).toMatch(/<svg aria-hidden="true"[^>]*art-spin/)
		expect(badge).toContain('EXPLORER LES MAQUILLEUSES')
		expect(badge).toMatch(/<a [^>]*aria-label="Explorer les maquilleuses"/)
		expect(badge).toContain('size-14')
		// The kit's own rule: the home hero reuses the keyframes for the ring of its badge, earlier in the sheet, under
		// the attribute its script sets (tests/unit/home-hero.test.tsx).
		const spin = CSS.indexOf('animation: art-spin', CSS.indexOf('ART DIRECTION KIT'))
		expect(spin).toBeGreaterThan(-1)
		expect(CSS.lastIndexOf('@media (prefers-reduced-motion: no-preference)', spin)).toBeGreaterThan(
			CSS.indexOf('ART DIRECTION KIT')
		)
		expect(html(<RotatingBadge text="Décor" />)).not.toContain('<a ')
	})
})

describe('cards', () => {
	test('the vertical profile card takes the data of the search card and keeps its rules', () => {
		const card = html(<ProfileCard profile={PROFILE} rank={3} />)
		expect(card).toContain('data-profile-card')
		expect(card).toMatch(/<h3 [^>]*><a [^>]*href="\/profil\/zoe-fictive"[^>]*>Zoé Fictive<\/a><\/h3>/)
		expect(card).toContain('Annecy et 30 km autour')
		expect(card).toContain('Mariage')
		expect(card).toContain('aria-label="Prestations"')
		expect(card).toContain('Mariée')
		expect(card).toContain('150')
		expect(card).toContain('Activité vérifiée')
		expect(card).toContain('Photo de Zoé Fictive')
		// The whole card is the one link: it stretches over the card.
		expect(card).toContain('after:absolute after:inset-0')
		expect(card).toContain('card-hover')
		expect(card.match(/<a /g)).toHaveLength(1)
		// The photo is in an arch with a band.
		expect(card).toContain('art-arch')
	})

	test('says an empty zone and an unreachable profile in words, and has no photo alt without a photo', () => {
		const card = html(
			<ProfileCard profile={{ ...PROFILE, lieu: null, unreachable: true, photo: null, superMaquilleuse: false }} />
		)
		expect(card).toContain('Zone non renseignée')
		expect(card).toContain('Coordonnées pas encore indiquées')
		expect(card).toContain('alt=""')
		expect(card).not.toContain('Pro</span>')
	})

	test('the card carries no contact detail and no field the search card does not have', () => {
		const card = html(<ProfileCard profile={PROFILE} />)
		expect(card).not.toMatch(/tel:|mailto:|@example|https?:\/\/(?!photos\.example\.test)/)
	})

	test('the horizontal card has the same data in a row, with its own heading level', () => {
		const row = html(<ProfileRowCard profile={PROFILE} headingLevel={2} />)
		expect(row).toContain('data-profile-row-card')
		expect(row).toMatch(/<h2 /)
		expect(row).toContain('Zoé Fictive')
		expect(row).toContain('md:grid-cols-[148px_minmax(0,1fr)_auto]')
		expect(row.match(/<a /g)).toHaveLength(1)
		expect(row).toContain('data-size="sm"')
	})

	test('a blog card takes the data of the blog list: one link, a time and a decorative illustration', () => {
		const card = html(
			<BlogCard
				article={{
					slug: 'choisir-sa-maquilleuse',
					titre: 'Choisir sa maquilleuse',
					extrait: 'Les questions à poser.',
					publieLe: '2026-10-12',
				}}
			/>
		)
		expect(card).toMatch(
			/<h3 [^>]*><a [^>]*href="\/blog\/choisir-sa-maquilleuse"[^>]*>Choisir sa maquilleuse<\/a><\/h3>/
		)
		expect(card).toContain('<time dateTime="2026-10-12"')
		expect(card).toContain('12 octobre 2026')
		expect(card).toContain('Les questions à poser.')
		expect(card).toMatch(/<img alt=""/)
		expect(card).not.toContain('data-tint')
		// The same article always gets the same illustration.
		const again = html(
			<BlogCard article={{ slug: 'choisir-sa-maquilleuse', titre: 'x', extrait: '', publieLe: null }} />
		)
		expect(again.match(/src="[^"]+"/)?.[0]).toBe(card.match(/src="[^"]+"/)?.[0])
		expect(
			html(
				<BlogCard
					article={{ slug: 'a', titre: 'Un', extrait: '', publieLe: null }}
					variant="feature"
					headingLevel={2}
				/>
			)
		).toContain('<h2 ')
	})

	test('the testimonial is a figure with a blockquote and a caption; the big quote mark is hidden', () => {
		const testimonial = html(
			<TestimonialArch
				quote={
					<>
						Une maquilleuse <TitleAccent>à l’écoute</TitleAccent>.
					</>
				}
				name="Léa M."
				byline="Mariée"
			/>
		)
		expect(testimonial).toMatch(/^<figure /)
		expect(testimonial).toMatch(/<blockquote [^>]*>Une maquilleuse/)
		expect(testimonial).toMatch(/<figcaption [^>]*>[\s\S]*Léa M\.[\s\S]*Mariée/)
		expect(testimonial).toMatch(/<span aria-hidden="true" class="[^"]*">“<\/span>/)
		expect(testimonial).toContain('art-arch')
	})
})

describe('the call to action of the kit', () => {
	const cta = html(
		<ArtCta
			title="Rejoignez My-Makeup"
			primary={{ href: '/search', label: 'Trouver ma maquilleuse', where: 'cta_recherche' }}
			secondary={{ href: '/auth/signup', label: 'Je suis maquilleuse', where: 'cta_inscription' }}
		>
			La recherche est gratuite.
		</ArtCta>
	)

	test('keeps the real backdrop (static layer first, shader on demand), the two links, one h2', () => {
		expect(cta).toMatch(/data-backdrop="static"/)
		expect(cta).toContain('cta-backdrop-static')
		expect(cta).not.toContain('<canvas')
		expect(cta).toMatch(/<a [^>]*href="\/search"/)
		expect(cta).toMatch(/<a [^>]*href="\/auth\/signup"/)
		expect(cta.match(/<h2/g)).toHaveLength(1)
		expect(cta).not.toContain('<h1')
	})

	test('buttons are 52 px pills with a white focus ring, and nothing is drawn around the panel', () => {
		expect(cta).toContain('min-h-13')
		expect(cta).toContain('focus-visible:outline-white')
		// No lips, brush, print mark or glow: the only svg left is none, and no decor layer hidden under 768 px.
		expect(cta).not.toContain('<svg')
		expect(cta).not.toContain('pointer-events-none absolute inset-0 hidden')
		expect(cta).not.toMatch(/blur-|rounded-full bg-/)
		const source = readFileSync(join(ROOT, 'src/components/art/ArtCta.tsx'), 'utf8')
		expect(source).not.toMatch(/GlowBlob|LineDrawing|MakeupObject|PrintMark/)
	})

	test('follows the frame of the site and is lighter than before', () => {
		// The shared block of the site (13 pages) is this one: it only gives it its words and its two measured links.
		const shared = readFileSync(join(ROOT, 'src/components/blocks/Cta.tsx'), 'utf8')
		expect(shared).toContain('<ArtCta')
		expect(shared).not.toContain('CtaBackdrop')
		// The panel sits in the one `page-frame` of the pages, with no box of its own.
		expect(cta).toMatch(/<div class="page-frame"><div class="reveal art-cta-open /)
		expect(cta).not.toMatch(/max-w-(6xl|7xl)/)
		expect(cta).toContain('md:py-24')
		expect(cta).not.toMatch(/md:py-(36|44)|md:px-24/)
		expect(cta).toContain('lg:text-[3.25rem]')
		expect(cta).not.toContain('lg:text-[5rem]')
		expect(cta).toContain('max-w-[24ch]')
		expect(cta).not.toContain('max-w-[16ch]')
	})

	test('lifts the side mask because the text is centred, and the mask stays elsewhere', () => {
		expect(CSS).toMatch(/\.art-cta-open \.cta-backdrop-mask \{\s*mask-image: none/)
		expect(cta).toContain('art-cta-open')
	})
})
