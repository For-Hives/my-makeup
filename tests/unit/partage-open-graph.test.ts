/**
 * The preview of a shared link (ticket 116; plan 02 U51): `og:title`, `og:description`, an absolute
 * `og:image`, `og:type`, on every kind of page, indexed or not.
 */

import { describe, expect, test } from 'bun:test'
import { editorialMetadata, pageMetadata } from '../../src/lib/seo/metadata'
import { profileMetadata } from '../../src/lib/seo/profile'
import { DEFAULT_IMAGE, SHARE_QUALITY, SHARE_WIDTH, shareImageOfPhoto } from '../../src/lib/seo/share'
import type { PublicProfile } from '../../src/services/public/profiles'

const ABSOLUE = /^https:\/\/my-makeup\.fr\//

const profil = (surcharge: Partial<PublicProfile> = {}): PublicProfile =>
	({
		slug: 'lea-imaginaire',
		nom: 'Léa Imaginaire',
		specialite: 'maquilleuse mariage',
		lieu: 'Annecy',
		description: 'Une description écrite pour l’essai, assez longue pour dépasser les soixante-dix caractères requis.',
		photo: { url: 'https://photos.example.test/media/abc.webp', width: 3000, height: 2000 },
		indexable: true,
		...surcharge,
	}) as PublicProfile

const og = (meta: ReturnType<typeof pageMetadata>) => {
	const { openGraph } = meta
	if (!openGraph) throw new Error('pas de balises Open Graph')
	return openGraph as Record<string, unknown> & { images: { url: string; width?: number; height?: number }[] }
}

describe('Open Graph (U51)', () => {
	test('une page ordinaire : titre, description, adresse, type, image absolue par défaut', () => {
		const meta = pageMetadata({
			titre: 'Blog et actualités',
			description: 'x'.repeat(80),
			repli: 'repli',
			chemin: '/blog',
		})
		const balises = og(meta)
		expect(balises.title).toBe('Blog et actualités | My-Makeup')
		expect(balises.description).toBe(meta.description)
		expect(String(balises.description).length).toBeGreaterThanOrEqual(70)
		expect(balises.url).toBe('https://my-makeup.fr/blog')
		expect(balises.type).toBe('website')
		expect(balises.siteName).toBe('My-Makeup')
		expect(balises.locale).toBe('fr_FR')
		expect(balises.images).toEqual([DEFAULT_IMAGE])
		expect(balises.images[0]?.url).toMatch(ABSOLUE)
	})

	test('og:title est le titre de la page, pas une valeur vide ni « null »', () => {
		const balises = og(pageMetadata({ titre: null, description: null, repli: 'r'.repeat(80), chemin: '/' }))
		expect(balises.title).toBe('My-Makeup')
		expect(JSON.stringify(balises)).not.toMatch(/null|undefined/)
	})

	test('la carte Twitter reprend titre, description et image', () => {
		const meta = pageMetadata({ titre: 'Blog', description: 'y'.repeat(90), repli: 'r', chemin: '/blog' })
		expect(meta.twitter).toEqual({
			card: 'summary_large_image',
			title: 'Blog | My-Makeup',
			description: meta.description as string,
			images: [DEFAULT_IMAGE.url],
		})
	})

	test('une page éditoriale (article) : la description rédigée est aussi celle du partage', () => {
		const meta = editorialMetadata({
			titre: 'Un article',
			descriptionRedigee: 'Courte description rédigée.',
			autres: [],
			repli: 'repli',
			chemin: '/blog/un-article',
			typeDePartage: 'article',
		})
		expect(meta.description).toBe('Courte description rédigée.')
		expect(og(meta).description).toBe('Courte description rédigée.')
		expect(og(meta).type).toBe('article')
		expect(og(meta).url).toBe('https://my-makeup.fr/blog/un-article')
	})

	test('un profil : type « profile », sa photo principale allégée à 1 200 px, absolue', () => {
		const balises = og(profileMetadata(profil()))
		expect(balises.type).toBe('profile')
		expect(balises.title).toBe('Léa Imaginaire – maquilleuse mariage à Annecy | My-Makeup')
		const [image] = balises.images
		expect(image?.url).toMatch(ABSOLUE)
		const adresse = new URL(image?.url ?? '')
		expect(adresse.pathname).toBe('/_next/image')
		expect(adresse.searchParams.get('url')).toBe('https://photos.example.test/media/abc.webp')
		expect(adresse.searchParams.get('w')).toBe(String(SHARE_WIDTH))
		expect(adresse.searchParams.get('q')).toBe(String(SHARE_QUALITY))
		expect(image).toMatchObject({ width: 1200, height: 800 })
	})

	test('un profil sans photo : l’image par défaut', () => {
		expect(og(profileMetadata(profil({ photo: null }))).images).toEqual([DEFAULT_IMAGE])
	})

	test('une page en noindex garde ses balises, sans adresse canonique', () => {
		const meta = profileMetadata(profil({ indexable: false }))
		expect(meta.robots).toEqual({ index: false, follow: true })
		expect(meta.alternates).toBeUndefined()
		const balises = og(meta)
		expect(balises.title).toBe('Léa Imaginaire – maquilleuse mariage à Annecy | My-Makeup')
		expect(balises.url).toBe('https://my-makeup.fr/profil/lea-imaginaire')
		expect(balises.images[0]?.url).toMatch(ABSOLUE)
		expect(meta.twitter).toBeDefined()
	})
})

describe('l’image de partage d’une photo', () => {
	test('une photo plus étroite que 1 200 px n’est pas agrandie dans les dimensions annoncées', () => {
		expect(shareImageOfPhoto({ url: 'https://photos.example.test/a.jpg', width: 600, height: 400 })).toMatchObject({
			width: 600,
			height: 400,
		})
	})

	test('sans dimensions, l’adresse seule', () => {
		const image = shareImageOfPhoto({ url: 'https://photos.example.test/a.jpg' })
		expect(Object.keys(image)).toEqual(['url'])
	})

	test('une adresse qui n’est pas absolue, ou pas de photo : l’image du site', () => {
		for (const photo of [null, undefined, {}, { url: '/media/a.jpg' }, { url: 'javascript:alert(1)' }, { url: 42 }])
			expect(shareImageOfPhoto(photo)).toBe(DEFAULT_IMAGE)
	})
})
