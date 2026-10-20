import { afterEach, describe, expect, test } from 'bun:test'
import type { RequiredDataFromCollectionSlug } from 'payload'
import type { Article, Media } from '@/payload-types'
import { creerCompte } from '../support/account-factory'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { fichierPourFormulaire, fichierPourPayload, nomDePhoto } from '../support/photos'
import { appelerRest, formulaireAvecFichier } from '../support/rest'
import { viderLeStockage } from '../support/s3'

/**
 * The articles of the blog (ticket 046): the public reads what is published, and nothing else;
 * the newsroom writes; the content comes back as it was written, whatever its length; the gallery
 * holds images only, and its photos are public only with a published article. The access matrix
 * plays who may do what (tests/integration/payload-acces.test.ts); this file looks at what each
 * reading and each save gives.
 */

afterEach(async () => {
	await Promise.all([viderLaBase(), viderLeStockage()])
})

/** An article as the import writes it: through the Local API, without access control. */
async function ecrireArticle(donnees: Partial<RequiredDataFromCollectionSlug<'articles'>> & { slug: string }) {
	const payload = await payloadDeTest()
	return payload.create({
		collection: 'articles',
		data: {
			title: `Article ${donnees.slug}`,
			author: 'Rédaction fictive',
			content: '## Un article\n\nUn article fictif du banc de test.\n',
			_status: 'published',
			...donnees,
		},
	})
}

interface Liste {
	docs: Article[]
	totalDocs: number
}

/** A REST read, with its status and its body. */
async function lire(chemin: string, enTetes: Record<string, string> = {}) {
	const { statut, corps } = await appelerRest('GET', chemin, { enTetes })
	return { statut, corps: corps as Liste & Partial<Article> }
}

/** The slugs a REST list gives. */
const slugsDe = (corps: Liste) => corps.docs.map(({ slug }) => slug).sort()

/** A media written by the server, as the newsroom or the import would hold it: a file of this type. */
async function mediaDuType(type: 'image/png' | 'application/pdf'): Promise<Media> {
	const payload = await payloadDeTest()
	const file = type === 'image/png' ? fichierPourPayload(nomDePhoto('article')) : undefined
	// A PDF is no longer taken as a file (ticket 133): it exists only as the import adopts one,
	// a document that names its object, without any file.
	if (!file)
		return payload.create({
			collection: 'media',
			data: { alt: 'Fichier fictif', filename: 'fiche-fictive.pdf', mimeType: 'application/pdf', prefix: '' },
			context: { skipCloudStorage: true },
		})
	return payload.create({ collection: 'media', data: { alt: 'Fichier fictif' }, file })
}

/**
 * A markdown text of exactly `longueur` characters, with what a text editor might break: accents,
 * French quotes, an emoji, tabs, Windows line breaks, trailing spaces, HTML, a backslash, `$` and
 * braces.
 */
function markdownDe(longueur: number): string {
	const paragraphe =
		'## Un titre fictif\r\n\r\nUn paragraphe avec é, è, à, ç, œ, « guillemets » et 💄,\tune tabulation,  ' +
		'des espaces en fin de ligne  \n<script>alert(1)</script> \\échappé\\ $' +
		'{pas une variable} `code`.\n\n'
	const texte = paragraphe.repeat(Math.ceil(longueur / paragraphe.length) + 1)
	// Cut on a whole character: an emoji is two code units, never split.
	let fin = longueur
	while (texte.charCodeAt(fin - 1) >= 0xd800 && texte.charCodeAt(fin - 1) <= 0xdbff) fin -= 1
	return texte.slice(0, fin) + 'x'.repeat(longueur - fin)
}

describe('Article publié lu par un anonyme, brouillon introuvable', () => {
	test('la liste, la lecture par identifiant et la recherche par slug ne rendent que l’article publié', async () => {
		const publie = await ecrireArticle({ slug: 'essai-maquillage-fictif' })
		const brouillon = await ecrireArticle({ slug: 'article-en-cours', _status: 'draft' })

		const liste = await lire('/api/articles?depth=0')
		expect(liste.statut).toBe(200)
		expect(slugsDe(liste.corps)).toEqual(['essai-maquillage-fictif'])

		expect((await lire(`/api/articles/${publie.id}`)).corps.title).toBe('Article essai-maquillage-fictif')
		expect((await lire(`/api/articles/${brouillon.id}`)).statut).toBe(404)

		// What the page of an article will ask: the article of a slug.
		expect((await lire('/api/articles?where[slug][equals]=essai-maquillage-fictif')).corps.totalDocs).toBe(1)
		expect((await lire('/api/articles?where[slug][equals]=article-en-cours')).corps.totalDocs).toBe(0)
	})

	test('demander les brouillons (?draft=true) ne rend rien de plus, ni à un anonyme ni à une maquilleuse', async () => {
		const brouillon = await ecrireArticle({ slug: 'article-en-cours', _status: 'draft' })
		await ecrireArticle({ slug: 'essai-maquillage-fictif' })
		const maquilleuse = await creerCompte('maquilleuse')

		for (const enTetes of [{}, maquilleuse.session.enTetes]) {
			expect(slugsDe((await lire('/api/articles?draft=true', enTetes)).corps)).toEqual(['essai-maquillage-fictif'])
			expect((await lire(`/api/articles/${brouillon.id}?draft=true`, enTetes)).statut).toBe(404)
			expect((await lire('/api/articles/versions', enTetes)).statut).toBe(403)
		}
	})

	test('par l’API locale avec les règles actives, sans compte : de même', async () => {
		const brouillon = await ecrireArticle({ slug: 'article-en-cours', _status: 'draft' })
		await ecrireArticle({ slug: 'essai-maquillage-fictif' })
		const payload = await payloadDeTest()

		const { docs } = await payload.find({ collection: 'articles', overrideAccess: false, draft: true })
		expect(docs.map(({ slug }) => slug)).toEqual(['essai-maquillage-fictif'])
		await expect(
			payload.findByID({ collection: 'articles', id: brouillon.id, overrideAccess: false })
		).rejects.toMatchObject({ status: 404 })
	})

	test('l’identifiant de l’ancien site ne sort que pour la rédaction', async () => {
		const publie = await ecrireArticle({ slug: 'essai-maquillage-fictif', strapiId: 4 })
		const redaction = await creerCompte('redaction')

		expect(Object.keys((await lire(`/api/articles/${publie.id}`)).corps)).not.toContain('strapiId')
		expect((await lire(`/api/articles/${publie.id}`, redaction.session.enTetes)).corps.strapiId).toBe(4)
	})
})

describe('Redaction crée et publie ; maquilleuse et anonyme refusés (U59)', () => {
	const nouvelArticle = {
		title: 'Un article fictif',
		slug: 'un-article-fictif',
		author: 'Rédaction fictive',
		excerpt: 'Un extrait fictif.',
		seo_title: 'Un article fictif',
		seo_description: 'Une description fictive.',
		content: '## Un article\n\nFictif.\n',
	}

	test('la rédaction écrit un brouillon, le public ne le voit pas ; publié, il le lit, avec sa date de publication', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		const cree = await appelerRest('POST', '/api/articles?draft=true', { enTetes, corps: nouvelArticle })
		expect(cree.statut).toBe(201)
		const id = (cree.corps as { doc: Article }).doc.id
		expect((await lire(`/api/articles/${id}`)).statut).toBe(404)

		const publie = await appelerRest('PATCH', `/api/articles/${id}`, { enTetes, corps: { _status: 'published' } })
		expect(publie.statut).toBe(200)
		const lu = await lire(`/api/articles/${id}`)
		expect(lu.statut).toBe(200)
		expect(lu.corps).toMatchObject({ ...nouvelArticle, _status: 'published' })
		expect(Date.now() - Date.parse(String(lu.corps.publishedAt))).toBeLessThan(60_000)

		// Unpublished: out of reach again.
		await appelerRest('PATCH', `/api/articles/${id}`, { enTetes, corps: { _status: 'draft' } })
		expect((await lire(`/api/articles/${id}`)).statut).toBe(404)
	})

	test('une maquilleuse et un anonyme ne créent ni ne publient : refusés, rien n’est écrit', async () => {
		const maquilleuse = await creerCompte('maquilleuse')
		const brouillon = await ecrireArticle({ slug: 'article-en-cours', _status: 'draft' })
		const payload = await payloadDeTest()

		for (const enTetes of [{}, maquilleuse.session.enTetes]) {
			for (const chemin of ['/api/articles', '/api/articles?draft=true'])
				expect((await appelerRest('POST', chemin, { enTetes, corps: nouvelArticle })).statut).toBe(403)
			const publication = await appelerRest('PATCH', `/api/articles/${brouillon.id}`, {
				enTetes,
				corps: { _status: 'published' },
			})
			expect([403, 404]).toContain(publication.statut)
		}
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
		expect((await payload.findByID({ collection: 'articles', id: brouillon.id }))._status).toBe('draft')
	})

	test('un slug déjà pris, ou qui n’a pas la forme d’une adresse, est refusé à la publication', async () => {
		await ecrireArticle({ slug: 'un-article-fictif' })
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		const doublon = await appelerRest('POST', '/api/articles', {
			enTetes,
			corps: { ...nouvelArticle, _status: 'published' },
		})
		expect(doublon.statut).toBe(400)
		const malForme = await appelerRest('POST', '/api/articles', {
			enTetes,
			corps: { ...nouvelArticle, slug: 'Un Article Fictif', _status: 'published' },
		})
		expect(malForme.statut).toBe(400)
		expect(malForme.texte).toContain('« un-article-fictif »')
		const payload = await payloadDeTest()
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
	})

	test('un titre pour les moteurs de plus de 70 caractères, une description de plus de 155 : refusés', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		for (const corps of [
			{ ...nouvelArticle, seo_title: 't'.repeat(71) },
			{ ...nouvelArticle, seo_description: 'd'.repeat(156) },
		])
			expect(
				(await appelerRest('POST', '/api/articles', { enTetes, corps: { ...corps, _status: 'published' } })).statut
			).toBe(400)
		const juste = { ...nouvelArticle, seo_title: 't'.repeat(70), seo_description: 'd'.repeat(155) }
		expect(
			(await appelerRest('POST', '/api/articles', { enTetes, corps: { ...juste, _status: 'published' } })).statut
		).toBe(201)
	})
})

describe('Contenu de 60 000 caractères relu à l’identique ; PDF refusé dans la galerie', () => {
	test('écrit par la rédaction, relu par le public : le même texte, caractère pour caractère', async () => {
		const contenu = markdownDe(60_000)
		expect(contenu.length).toBe(60_000)
		const redaction = await creerCompte('redaction')

		const cree = await appelerRest('POST', '/api/articles', {
			enTetes: redaction.session.enTetes,
			corps: { title: 'Un long article', slug: 'un-long-article', content: contenu, _status: 'published' },
		})
		expect(cree.statut).toBe(201)
		const id = (cree.corps as { doc: Article }).doc.id

		expect((await lire(`/api/articles/${id}`)).corps.content).toBe(contenu)
		expect((await lire('/api/articles')).corps.docs[0]?.content).toBe(contenu)
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'articles', id })).content).toBe(contenu)
	})

	test('écrit par l’import (API locale) : de même, et 200 000 caractères passent aussi', async () => {
		for (const longueur of [60_000, 200_000]) {
			const contenu = markdownDe(longueur)
			const article = await ecrireArticle({ slug: `long-${longueur}`, content: contenu })
			expect((await lire(`/api/articles/${article.id}`)).corps.content).toBe(contenu)
		}
	})

	test('un PDF dans la galerie : refusé, publié comme en brouillon, par REST comme par l’API locale ; rien ne change', async () => {
		const [image, pdf] = [await mediaDuType('image/png'), await mediaDuType('application/pdf')]
		const article = await ecrireArticle({ slug: 'un-article-fictif', gallery: [image.id] })
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		for (const chemin of [`/api/articles/${article.id}`, `/api/articles/${article.id}?draft=true`]) {
			const { statut, corps, texte } = await appelerRest('PATCH', chemin, {
				enTetes,
				corps: { gallery: [image.id, pdf.id] },
			})
			expect(statut).toBe(400)
			expect(texte).toContain('La galerie d’un article ne prend que des images')
			// The envelope is in French too (ticket 221), with a no-break space before the colon.
			expect((corps as { errors: { message: string }[] }).errors[0]?.message).toBe(
				'Le champ suivant n’est pas valide\u00a0: Galerie'
			)
		}
		const creation = await appelerRest('POST', '/api/articles?draft=true', {
			enTetes,
			corps: { title: 'Avec un PDF', slug: 'avec-un-pdf', gallery: [pdf.id] },
		})
		expect(creation.statut).toBe(400)

		const payload = await payloadDeTest()
		// The import too: the Local API, without access control, refuses it.
		await expect(ecrireArticle({ slug: 'import-avec-un-pdf', gallery: [pdf.id] })).rejects.toMatchObject({
			status: 400,
		})
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual([image.id])
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
	})

	test('un identifiant qu’aucun média ne peut porter : refusé avec le message, jamais une erreur du serveur', async () => {
		const image = await mediaDuType('image/png')
		const article = await ecrireArticle({ slug: 'un-article-fictif', gallery: [image.id] })
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		for (const impossible of ['abc', '99999999999', 99_999_999_999, 1.5, -1, '', { id: 'x' }]) {
			const gallery = [image.id, impossible]
			for (const [methode, chemin] of [
				['PATCH', `/api/articles/${article.id}`],
				['PATCH', `/api/articles/${article.id}?draft=true`],
				['POST', '/api/articles'],
				['POST', '/api/articles?draft=true'],
			] as const) {
				const corps = methode === 'POST' ? { title: 'Fictif', slug: 'fictif', gallery } : { gallery }
				const { statut, texte } = await appelerRest(methode, chemin, { enTetes, corps })
				expect([impossible, chemin, statut]).toEqual([impossible, chemin, 400])
				expect(texte).toContain('La galerie d’un article ne prend que des images')
			}
			// The import too: a validation error, never a failed query.
			await expect(ecrireArticle({ slug: 'import-fictif', gallery: gallery as never })).rejects.toMatchObject({
				status: 400,
			})
		}
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual([image.id])
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
	})

	test('des images, dans l’ordre donné : enregistrées, et l’ordre est gardé', async () => {
		const images = [await mediaDuType('image/png'), await mediaDuType('image/png'), await mediaDuType('image/png')]
		const article = await ecrireArticle({ slug: 'un-article-fictif' })
		const redaction = await creerCompte('redaction')
		const ordre = images.map(({ id }) => id).reverse()

		const { statut } = await appelerRest('PATCH', `/api/articles/${article.id}`, {
			enTetes: redaction.session.enTetes,
			corps: { gallery: ordre },
		})
		expect(statut).toBe(200)
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual(ordre)
	})
})

describe('Média d’un article publié lisible, d’un brouillon non', () => {
	/** A photo sent by the newsroom through REST, as the admin panel sends it. */
	async function envoyerParLaRedaction(enTetes: Record<string, string>): Promise<Media> {
		const { statut, corps, texte } = await appelerRest('POST', '/api/media?depth=0', {
			enTetes,
			formulaire: formulaireAvecFichier(fichierPourFormulaire(nomDePhoto('article')), { alt: 'Photo fictive' }),
		})
		if (statut !== 201) throw new Error(`L’envoi de la photo a échoué : ${statut} ${texte}`)
		return (corps as { doc: Media }).doc
	}

	test('la rédaction envoie une photo : elle n’appartient à personne, et le public ne la lit qu’une fois l’article publié', async () => {
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes
		const photo = await envoyerParLaRedaction(enTetes)
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'media', id: photo.id, depth: 0 })).owner ?? null).toBeNull()

		const cree = await appelerRest('POST', '/api/articles?draft=true', {
			enTetes,
			corps: { title: 'Un article fictif', slug: 'un-article-fictif', gallery: [photo.id] },
		})
		expect(cree.statut).toBe(201)
		const id = (cree.corps as { doc: Article }).doc.id

		// A draft: its photo is out of reach for the public, read by the newsroom.
		expect((await appelerRest('GET', `/api/media/${photo.id}`)).statut).toBe(404)
		expect((await appelerRest('GET', `/api/media/${photo.id}`, { enTetes })).statut).toBe(200)

		await appelerRest('PATCH', `/api/articles/${id}`, { enTetes, corps: { _status: 'published' } })
		const lue = await appelerRest('GET', `/api/media/${photo.id}?depth=0`)
		expect(lue.statut).toBe(200)
		expect(lue.corps).toMatchObject({ id: photo.id, url: photo.url })

		// Unpublished: out of reach again.
		await appelerRest('PATCH', `/api/articles/${id}`, { enTetes, corps: { _status: 'draft' } })
		expect((await appelerRest('GET', `/api/media/${photo.id}`)).statut).toBe(404)
	})

	test('une photo qu’un brouillon ajoute à un article publié reste introuvable jusqu’à la publication', async () => {
		const [premiere, ajoutee] = [await mediaDuType('image/png'), await mediaDuType('image/png')]
		const article = await ecrireArticle({ slug: 'un-article-fictif', gallery: [premiere.id] })
		const redaction = await creerCompte('redaction')
		const enTetes = redaction.session.enTetes

		const brouillon = await appelerRest('PATCH', `/api/articles/${article.id}?draft=true`, {
			enTetes,
			corps: { gallery: [premiere.id, ajoutee.id] },
		})
		expect(brouillon.statut).toBe(200)
		expect((await appelerRest('GET', `/api/media/${premiere.id}`)).statut).toBe(200)
		expect((await appelerRest('GET', `/api/media/${ajoutee.id}`)).statut).toBe(404)

		await appelerRest('PATCH', `/api/articles/${article.id}`, { enTetes, corps: { _status: 'published' } })
		expect((await appelerRest('GET', `/api/media/${ajoutee.id}`)).statut).toBe(200)
	})

	test('la photo d’une maquilleuse n’entre dans aucune galerie : refusée à la rédaction, à un admin et à l’import ; elle reste privée', async () => {
		const maquilleuse = await creerCompte('maquilleuse')
		const envoi = await appelerRest('POST', '/api/media?depth=0', {
			enTetes: maquilleuse.session.enTetes,
			formulaire: formulaireAvecFichier(fichierPourFormulaire()),
		})
		expect(envoi.statut).toBe(201)
		const privee = (envoi.corps as { doc: Media }).doc.id
		const image = await mediaDuType('image/png')
		const article = await ecrireArticle({ slug: 'un-article-fictif', gallery: [image.id] })
		const [redaction, admin] = [await creerCompte('redaction'), await creerCompte('admin')]

		for (const enTetes of [redaction.session.enTetes, admin.session.enTetes]) {
			for (const [methode, chemin] of [
				['PATCH', `/api/articles/${article.id}`],
				['PATCH', `/api/articles/${article.id}?draft=true`],
				['POST', '/api/articles'],
				['POST', '/api/articles?draft=true'],
			] as const) {
				const gallery = [image.id, privee]
				const corps = methode === 'POST' ? { title: 'Fictif', slug: 'fictif', gallery } : { gallery }
				const { statut, texte } = await appelerRest(methode, chemin, { enTetes, corps })
				expect([chemin, statut]).toEqual([chemin, 400])
				expect(texte).toContain('jamais la photo d’une maquilleuse')
			}
		}
		await expect(ecrireArticle({ slug: 'import-fictif', gallery: [privee] })).rejects.toMatchObject({ status: 400 })

		// What a published article would have opened: her photo stays out of reach of the public.
		const payload = await payloadDeTest()
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual([image.id])
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
		expect((await appelerRest('GET', `/api/media/${privee}`)).statut).toBe(404)
	})

	test('une photo d’article qu’un admin donne ensuite à une maquilleuse n’est plus ouverte par l’article', async () => {
		const photo = await mediaDuType('image/png')
		await ecrireArticle({ slug: 'un-article-fictif', gallery: [photo.id] })
		const [maquilleuse, autre, redaction, admin] = [
			await creerCompte('maquilleuse'),
			await creerCompte('maquilleuse'),
			await creerCompte('redaction'),
			await creerCompte('admin'),
		]
		const lecturePar = async (enTetes: Record<string, string> = {}) =>
			(await appelerRest('GET', `/api/media/${photo.id}`, { enTetes })).statut
		expect(await lecturePar()).toBe(200)

		const don = await appelerRest('PATCH', `/api/media/${photo.id}`, {
			enTetes: admin.session.enTetes,
			corps: { owner: maquilleuse.id },
		})
		expect(don.statut).toBe(200)
		// Her profile is a draft: her photo is private, published article or not. The newsroom loses it too.
		expect(await lecturePar()).toBe(404)
		expect(await lecturePar(autre.session.enTetes)).toBe(404)
		expect(await lecturePar(redaction.session.enTetes)).toBe(404)
		expect(await lecturePar(maquilleuse.session.enTetes)).toBe(200)
		expect(await lecturePar(admin.session.enTetes)).toBe(200)
		const payload = await payloadDeTest()
		await expect(payload.findByID({ collection: 'media', id: photo.id, overrideAccess: false })).rejects.toMatchObject({
			status: 404,
		})
	})

	test('la liste des médias reste fermée au public ; la rédaction ne liste que les siens, jamais les photos d’une maquilleuse', async () => {
		const photo = await mediaDuType('image/png')
		await ecrireArticle({ slug: 'un-article-fictif', gallery: [photo.id] })
		const [redaction, maquilleuse] = [await creerCompte('redaction'), await creerCompte('maquilleuse')]
		const sienne = await appelerRest('POST', '/api/media?depth=0', {
			enTetes: maquilleuse.session.enTetes,
			formulaire: formulaireAvecFichier(fichierPourFormulaire()),
		})
		expect(sienne.statut).toBe(201)

		expect((await appelerRest('GET', '/api/media')).statut).toBe(403)
		const liste = await appelerRest('GET', '/api/media?depth=0', { enTetes: redaction.session.enTetes })
		expect(liste.statut).toBe(200)
		expect((liste.corps as { docs: Media[] }).docs.map(({ id }) => id)).toEqual([photo.id])
		const deLaMaquilleuse = (sienne.corps as { doc: Media }).doc.id
		expect(
			(await appelerRest('GET', `/api/media/${deLaMaquilleuse}`, { enTetes: redaction.session.enTetes })).statut
		).toBe(404)
		const modification = await appelerRest('PATCH', `/api/media/${deLaMaquilleuse}`, {
			enTetes: redaction.session.enTetes,
			corps: { alt: 'Texte de la rédaction' },
		})
		expect([403, 404]).toContain(modification.statut)
	})
})
