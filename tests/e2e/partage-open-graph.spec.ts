import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { poserLeProfil, profilPresent } from '../../src/jeu-fictif/chargement'
import type { ProfilDuJeu } from '../../src/jeu-fictif/profils'
import { type ProfilDePage, poserLesProfilsDePage, profilsDePageSousLePrefixe } from '../fixtures/profils-de-page'
import { creerContenu, supprimerContenu } from '../outils/pages-publiques'
import { payloadDeTest } from '../outils/payload-test'
import { grandePhotoSynthetique } from '../outils/photo-synthetique'
import { sousVerrou } from '../outils/verrou'

/**
 * The preview of a shared link, end to end (ticket 116; plan 02 E64 and U51): twelve addresses of every kind
 * of page, each with its own title, a description, its canonical address (none when it is not indexed), the
 * Open Graph and Twitter tags, and a single h1. The picture shared for a profile is her main photo
 * lightened: 1 200 px wide, 300 KB at most, measured on a photo of 2 400 px and 1.6 MB.
 */

const POIDS_MAX = 300 * 1024
const suffixe = Date.now().toString(36)
const talents = [`essai-og-talent-a-${suffixe}`, `essai-og-talent-b-${suffixe}`]
const articles = [`essai-og-article-a-${suffixe}`, `essai-og-article-b-${suffixe}`]
const identifiants: { collection: 'talents' | 'articles'; id: number }[] = []
let profils: ReadonlyMap<string, ProfilDePage>
let grande: ProfilDePage

/** The big-photo profile: a variant of the reference type with one very large photo and no gallery. */
function typeDeLaGrandePhoto(base: ProfilDuJeu): ProfilDuJeu {
	return {
		...base,
		cle: 'og-grande-photo',
		compte: { email: 'og-grande-photo@example.test', nom: 'Og Grande' },
		profil: { ...base.profil, prenom: 'Og', nom: 'Grande', nomArtiste: 'Og Grande Maquillage' },
		photos: { principale: 'photo-1.webp', galerie: [] },
	}
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
	test.setTimeout(240_000)
	const types = profilsDePageSousLePrefixe('Og')
	const choisis = new Map(
		['reference', 'ville-voisine', 'textes-maximaux', 'actif-non-publiable'].map(cle => {
			const type = types.get(cle)
			if (!type) throw new Error(`pas de profil type « ${cle} »`)
			return [cle, type] as const
		})
	)
	profils = await poserLesProfilsDePage(choisis)
	const base = types.get('reference')
	if (!base) throw new Error('pas de profil de référence')
	const type = typeDeLaGrandePhoto(base)
	const octets = await grandePhotoSynthetique()
	expect(octets.length, 'l’original doit peser bien plus que 300 Ko').toBeGreaterThan(POIDS_MAX * 4)
	const posee = await sousVerrou('profil-og-grande-photo', async () => {
		const payload = await payloadDeTest()
		return (await profilPresent(payload, type)) ?? (await poserLeProfil(payload, type, async () => octets, false))
	})
	grande = { id: posee.profil, slug: posee.slug, type }
	for (const [rang, slug] of talents.entries())
		identifiants.push({
			collection: 'talents',
			id: await creerContenu(request, 'talents', {
				title: `Talent ${rang} ${suffixe}`,
				slug,
				seo_title: `Le maquillage fictif ${rang} ${suffixe}`,
				description:
					'Une présentation écrite pour l’essai des aperçus de partage, assez longue pour être une description.',
				_status: 'published',
			}),
		})
	for (const slug of articles)
		identifiants.push({
			collection: 'articles',
			id: await creerContenu(request, 'articles', { title: `Essai ${slug}`, slug, _status: 'published' }),
		})
})

test.afterAll(async ({ request }) => {
	test.setTimeout(180_000)
	for (const { collection, id } of identifiants) await supprimerContenu(request, collection, id)
	const payload = await payloadDeTest()
	for (const { id } of [...(profils?.values() ?? []), ...(grande ? [grande] : [])]) {
		const profil = await payload
			.findByID({ collection: 'profiles', id, depth: 0, select: { pro: true } })
			.catch(() => null)
		if (!profil) continue
		await payload.delete({ collection: 'profiles', id })
		const pro = typeof profil.pro === 'object' ? profil.pro.id : profil.pro
		if (pro !== undefined && pro !== null) await payload.delete({ collection: 'pros', id: pro }).catch(() => undefined)
	}
})

/** The value of a `<meta>` (by `name` or `property`) in the HTML the server sent. */
function balise(html: string, cle: string): string | null {
	const motif = new RegExp(`<meta (?:name|property)="${cle}" content="([^"]*)"`)
	return motif.exec(html)?.[1]?.replaceAll('&amp;', '&').replaceAll('&quot;', '"') ?? null
}

interface Adresse {
	chemin: string
	/** False for a page that must not be indexed: it keeps its tags, and has no canonical address. */
	indexable: boolean
	type: 'website' | 'profile' | 'article'
}

function lesDouzeAdresses(): Adresse[] {
	const profil = (cle: string) => profils.get(cle)?.slug ?? ''
	return [
		{ chemin: '/', indexable: true, type: 'website' },
		{ chemin: '/blog', indexable: true, type: 'website' },
		...articles.map(slug => ({ chemin: `/blog/${slug}`, indexable: true, type: 'article' as const })),
		...talents.map(slug => ({ chemin: `/talent/${slug}`, indexable: true, type: 'website' as const })),
		...['reference', 'ville-voisine', 'textes-maximaux'].map(cle => ({
			chemin: `/profil/${profil(cle)}`,
			indexable: true,
			type: 'profile' as const,
		})),
		{ chemin: `/profil/${grande.slug}`, indexable: true, type: 'profile' },
		{ chemin: `/profil/${profil('actif-non-publiable')}`, indexable: false, type: 'profile' },
		{ chemin: '/search', indexable: false, type: 'website' },
	]
}

test.describe('E64 : titre unique, description, canonique, balises de partage, un seul h1', () => {
	test('les douze adresses', async ({ request }) => {
		test.setTimeout(180_000)
		const adresses = lesDouzeAdresses()
		expect(adresses).toHaveLength(12)
		const titres = new Set<string>()
		for (const { chemin, indexable, type } of adresses) {
			const reponse = await request.get(chemin)
			expect(reponse.status(), chemin).toBe(200)
			const html = await reponse.text()
			const titre = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
			const description = balise(html, 'description') ?? ''
			expect(titre.length, chemin).toBeGreaterThan(0)
			expect(titre.length, chemin).toBeLessThanOrEqual(60)
			expect(description.length, chemin).toBeGreaterThanOrEqual(70)
			expect(description.length, chemin).toBeLessThanOrEqual(155)
			expect(html.match(/<h1[\s>]/g)?.length ?? 0, chemin).toBe(1)
			const canonique = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null
			const adressePropre = chemin === '/' ? 'https://my-makeup.fr' : `https://my-makeup.fr${chemin}`
			if (indexable) {
				expect(canonique, chemin).toBe(adressePropre)
				expect(balise(html, 'robots'), chemin).toBeNull()
			} else {
				expect(canonique, chemin).toBeNull()
				expect(balise(html, 'robots'), chemin).toBe('noindex, follow')
			}
			// The preview of the link, on a page that is not indexed too.
			expect(balise(html, 'og:title'), chemin).toBe(titre)
			expect(balise(html, 'og:description'), chemin).toBe(description)
			expect(balise(html, 'og:url'), chemin).toBe(adressePropre)
			expect(balise(html, 'og:type'), chemin).toBe(type)
			expect(balise(html, 'og:site_name'), chemin).toBe('My-Makeup')
			expect(balise(html, 'og:locale'), chemin).toBe('fr_FR')
			expect(balise(html, 'og:image'), chemin).toMatch(/^https:\/\/my-makeup\.fr\/\S+/)
			expect(balise(html, 'twitter:card'), chemin).toBe('summary_large_image')
			expect(balise(html, 'twitter:title'), chemin).toBe(titre)
			expect(balise(html, 'twitter:image'), chemin).toBe(balise(html, 'og:image'))
			titres.add(titre)
		}
		expect(titres.size, 'un titre par page').toBe(12)
	})

	test('l’image de partage : celle du site par défaut, la photo allégée pour un profil', async ({ request }) => {
		const accueil = await (await request.get('/')).text()
		expect(balise(accueil, 'og:image')).toBe('https://my-makeup.fr/assets/og-my-makeup.jpg')
		const sansPhoto = await (await request.get(`/profil/${profils.get('actif-non-publiable')?.slug}`)).text()
		const image = balise(sansPhoto, 'og:image') ?? ''
		expect(image === 'https://my-makeup.fr/assets/og-my-makeup.jpg' || image.includes('/_next/image?')).toBe(true)
		const article = await (await request.get(`/blog/${articles[0]}`)).text()
		expect(balise(article, 'og:image')).toBe('https://my-makeup.fr/assets/og-my-makeup.jpg')
	})

	test('la photo d’un profil : 1 200 px de large et 300 Ko au plus', async ({ request }) => {
		const html = await (await request.get(`/profil/${grande.slug}`)).text()
		const adresse = balise(html, 'og:image') ?? ''
		const lue = new URL(adresse)
		expect(lue.pathname).toBe('/_next/image')
		// The apex is the site online; the run asks the application of the bench for the same path.
		const reponse = await request.get(`${lue.pathname}${lue.search}`)
		expect(reponse.status()).toBe(200)
		expect(reponse.headers()['content-type']).toMatch(/^image\//)
		const octets = await reponse.body()
		expect(octets.length).toBeLessThanOrEqual(POIDS_MAX)
		const { width, height } = await sharp(octets).metadata()
		expect(width).toBe(1200)
		expect(height).toBe(800)
		expect(Number(balise(html, 'og:image:width'))).toBe(1200)
		expect(Number(balise(html, 'og:image:height'))).toBe(800)
	})
})
