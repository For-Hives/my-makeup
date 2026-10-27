import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { placeProfile, profilePresent } from '../../src/demo-data/loading'
import type { DemoProfile } from '../../src/demo-data/profiles'
import { type PageProfile, pageProfilesUnderPrefix, setPageProfiles } from '../fixtures/page-profiles'
import { underLock } from '../support/lock'
import { testPayload } from '../support/payload-test'
import { createContent, deleteContent } from '../support/public-pages'
import { largePhotoSynthetic } from '../support/synthetic-photo'

/**
 * The preview of a shared link, end to end (ticket 116; plan 02 E64 and U51): twelve addresses of every kind
 * of page, each with its own title, a description, its canonical address (none when it is not indexed), the
 * Open Graph and Twitter tags, and a single h1. The picture shared for a profile is her main photo
 * lightened: 1 200 px wide, 300 KB at most, measured on a photo of 2 400 px and 1.6 MB.
 */

const WEIGHT_MAX = 300 * 1024
const suffix = Date.now().toString(36)
const talents = [`essai-og-talent-a-${suffix}`, `essai-og-talent-b-${suffix}`]
const articles = [`essai-og-article-a-${suffix}`, `essai-og-article-b-${suffix}`]
const identifiers: { collection: 'talents' | 'articles'; id: number }[] = []
let profiles: ReadonlyMap<string, PageProfile>
let large: PageProfile

/** The big-photo profile: a variant of the reference type with one very large photo and no gallery. */
function largePhotoType(base: DemoProfile): DemoProfile {
	return {
		...base,
		cle: 'og-grande-photo',
		compte: { email: 'og-grande-photo@example.test', nom: 'Og Grande' },
		profil: { ...base.profil, firstName: 'Og', lastName: 'Grande', artistName: 'Og Grande Maquillage' },
		photos: { principale: 'photo-1.webp', galerie: [] },
	}
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	test.setTimeout(240_000)
	const types = pageProfilesUnderPrefix('Og')
	const chosen = new Map(
		['reference', 'ville-voisine', 'textes-maximaux', 'publiable-non-indexable'].map(cle => {
			const type = types.get(cle)
			if (!type) throw new Error(`pas de profil type « ${cle} »`)
			return [cle, type] as const
		})
	)
	profiles = await setPageProfiles(chosen)
	const base = types.get('reference')
	if (!base) throw new Error('pas de profil de référence')
	const type = largePhotoType(base)
	const bytes = await largePhotoSynthetic()
	expect(bytes.length, 'l’original doit peser bien plus que 300 Ko').toBeGreaterThan(WEIGHT_MAX * 4)
	const set = await underLock('profil-og-grande-photo', async () => {
		const payload = await testPayload()
		return (await profilePresent(payload, type)) ?? (await placeProfile(payload, type, async () => bytes, false))
	})
	large = { id: set.profil, slug: set.slug, type }
	for (const [rank, slug] of talents.entries())
		identifiers.push({
			collection: 'talents',
			id: await createContent(request, 'talents', {
				title: `Talent ${rank} ${suffix}`,
				slug,
				seo_title: `Le maquillage fictif ${rank} ${suffix}`,
				description:
					'Une présentation écrite pour l’essai des aperçus de partage, assez longue pour être une description.',
				_status: 'published',
			}),
		})
	for (const slug of articles)
		identifiers.push({
			collection: 'articles',
			id: await createContent(request, 'articles', { title: `Essai ${slug}`, slug, _status: 'published' }),
		})
})

test.afterAll(async ({ request }) => {
	test.setTimeout(180_000)
	for (const { collection, id } of identifiers) await deleteContent(request, collection, id)
	const payload = await testPayload()
	for (const { id } of [...(profiles?.values() ?? []), ...(large ? [large] : [])]) {
		const profile = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profile) continue
		await payload.delete({ collection: 'profiles', id })
		const pro = typeof profile.pro === 'object' ? profile.pro.id : profile.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

/** The value of a `<meta>` (by `name` or `property`) in the HTML the server sent. */
function tag(html: string, cle: string): string | null {
	const reason = new RegExp(`<meta (?:name|property)="${cle}" content="([^"]*)"`)
	return reason.exec(html)?.[1]?.replaceAll('&quot;', '"').replaceAll('&amp;', '&') ?? null
}

interface Url {
	chemin: string
	/** False for a page that must not be indexed: it keeps its tags, and has no canonical address. */
	indexable: boolean
	type: 'website' | 'profile' | 'article'
}

function twelveUrls(): Url[] {
	const profile = (cle: string) => profiles.get(cle)?.slug ?? ''
	return [
		{ chemin: '/', indexable: true, type: 'website' },
		{ chemin: '/blog', indexable: true, type: 'website' },
		...articles.map(slug => ({ chemin: `/blog/${slug}`, indexable: true, type: 'article' as const })),
		...talents.map(slug => ({ chemin: `/talent/${slug}`, indexable: true, type: 'website' as const })),
		...['reference', 'ville-voisine', 'textes-maximaux'].map(cle => ({
			chemin: `/profil/${profile(cle)}`,
			indexable: true,
			type: 'profile' as const,
		})),
		{ chemin: `/profil/${large.slug}`, indexable: true, type: 'profile' },
		{ chemin: `/profil/${profile('publiable-non-indexable')}`, indexable: false, type: 'profile' },
		{ chemin: '/search', indexable: false, type: 'website' },
	]
}

test.describe('E64 : titre unique, description, canonique, balises de partage, un seul h1', () => {
	test('les douze adresses', async ({ request }) => {
		test.setTimeout(180_000)
		const urls = twelveUrls()
		expect(urls).toHaveLength(12)
		const titles = new Set<string>()
		for (const { chemin: path, indexable, type } of urls) {
			const response = await request.get(path)
			expect(response.status(), path).toBe(200)
			const html = await response.text()
			const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
			const description = tag(html, 'description') ?? ''
			expect(title.length, path).toBeGreaterThan(0)
			expect(title.length, path).toBeLessThanOrEqual(60)
			expect(description.length, path).toBeGreaterThanOrEqual(70)
			expect(description.length, path).toBeLessThanOrEqual(155)
			expect(html.match(/<h1[\s>]/g)?.length ?? 0, path).toBe(1)
			const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null
			const ownUrl = path === '/' ? 'https://my-makeup.fr' : `https://my-makeup.fr${path}`
			if (indexable) {
				expect(canonical, path).toBe(ownUrl)
				expect(tag(html, 'robots'), path).toBeNull()
			} else {
				expect(canonical, path).toBeNull()
				expect(tag(html, 'robots'), path).toBe('noindex, follow')
			}
			// The preview of the link, on a page that is not indexed too.
			expect(tag(html, 'og:title'), path).toBe(title)
			expect(tag(html, 'og:description'), path).toBe(description)
			expect(tag(html, 'og:url'), path).toBe(ownUrl)
			expect(tag(html, 'og:type'), path).toBe(type)
			expect(tag(html, 'og:site_name'), path).toBe('My-Makeup')
			expect(tag(html, 'og:locale'), path).toBe('fr_FR')
			expect(tag(html, 'og:image'), path).toMatch(/^https:\/\/my-makeup\.fr\/\S+/)
			expect(tag(html, 'twitter:card'), path).toBe('summary_large_image')
			expect(tag(html, 'twitter:title'), path).toBe(title)
			expect(tag(html, 'twitter:image'), path).toBe(tag(html, 'og:image'))
			titles.add(title)
		}
		expect(titles.size, 'un titre par page').toBe(12)
	})

	test('l’image de partage : celle du site par défaut, la photo allégée pour un profil', async ({ request }) => {
		const home = await (await request.get('/')).text()
		expect(tag(home, 'og:image')).toBe('https://my-makeup.fr/assets/og-my-makeup.jpg')
		const withoutPhoto = await (await request.get(`/profil/${profiles.get('publiable-non-indexable')?.slug}`)).text()
		const image = tag(withoutPhoto, 'og:image') ?? ''
		expect(image === 'https://my-makeup.fr/assets/og-my-makeup.jpg' || image.includes('/_next/image?')).toBe(true)
		const article = await (await request.get(`/blog/${articles[0]}`)).text()
		expect(tag(article, 'og:image')).toBe('https://my-makeup.fr/assets/og-my-makeup.jpg')
	})

	test('la photo d’un profil : 1 200 px de large et 300 Ko au plus', async ({ request }) => {
		const html = await (await request.get(`/profil/${large.slug}`)).text()
		const url = tag(html, 'og:image') ?? ''
		const read = new URL(url)
		expect(read.pathname).toBe('/_next/image')
		// The apex is the site online; the run asks the application of the bench for the same path.
		const response = await request.get(`${read.pathname}${read.search}`)
		expect(response.status()).toBe(200)
		expect(response.headers()['content-type']).toMatch(/^image\//)
		const bytes = await response.body()
		expect(bytes.length).toBeLessThanOrEqual(WEIGHT_MAX)
		const { width, height } = await sharp(bytes).metadata()
		expect(width).toBe(1200)
		expect(height).toBe(800)
		expect(Number(tag(html, 'og:image:width'))).toBe(1200)
		expect(Number(tag(html, 'og:image:height'))).toBe(800)
	})
})
