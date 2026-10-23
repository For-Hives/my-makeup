import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Hero } from '@/components/blocks/Hero'
import { ResultCard } from '@/components/search/ResultCard'
import type { ProfileCard } from '@/services/public/profiles'

/**
 * The pictures that are the largest element of a page above the fold (issue 1033): the picture of the head of a page,
 * the photo of a profile, the first cards of a search. Each is asked first (`fetchpriority="high"`), and the head
 * picture is asked at the width it is drawn: without `sizes`, a phone of 1.75 dppx fetched the 2048 px copy of a picture
 * drawn 412 px wide (142 KB for about 60).
 */

const CARD: ProfileCard = {
	slug: 'zoe-fictive',
	pid: 1 as never,
	nom: 'Zoé Fictive',
	specialite: 'Mariage',
	lieu: 'Annecy',
	superMaquilleuse: false,
	photo: { url: 'https://photos.example.test/media/abc.webp', width: 400, height: 400 },
}

const imgOf = (html: string, alt: string): string => {
	const found = html.match(new RegExp(`<img[^>]*alt="${alt}"[^>]*>`))
	if (!found) throw new Error(`no image with the text ${alt}`)
	return found[0]
}

describe('the head picture of a page (home, talent pages)', () => {
	const html = renderToStaticMarkup(<Hero titre="Un titre" description="Une ligne" />)
	const hero = imgOf(html, 'trouver une maquilleuse professionnelle freelance')

	test('it is asked first, and preloaded', () => {
		expect(hero).toContain('fetchPriority="high"')
		expect(html).toContain('rel="preload"')
	})

	test('it says the width it is drawn at, so a phone does not fetch the 2048 px copy', () => {
		expect(hero).toContain('sizes="(min-width: 1024px) 50vw, 100vw"')
		// A width list (750w, 828w…), not the 1x and 2x of a picture whose size is not told.
		expect(hero).toMatch(/srcSet="[^"]*\s\d+w/)
		expect(hero).not.toMatch(/\s2x[",]/)
	})
})

describe('the cards of a search', () => {
	test('a card that loads at once is asked first; another one asks nothing', () => {
		const first = renderToStaticMarkup(<ResultCard carte={CARD} prioritaire rang={1} />)
		const later = renderToStaticMarkup(<ResultCard carte={CARD} prioritaire={false} rang={3} />)
		expect(imgOf(first, 'Photo de Zoé Fictive')).toContain('fetchPriority="high"')
		expect(imgOf(later, 'Photo de Zoé Fictive')).not.toContain('fetchPriority')
		expect(imgOf(later, 'Photo de Zoé Fictive')).toContain('loading="lazy"')
	})
})
