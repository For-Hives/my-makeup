import { afterEach, describe, expect, test } from 'bun:test'
import type { RequiredDataFromCollectionSlug } from 'payload'
import type { Article, Media } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { fileForForm, fileForPayload, photoName } from '../support/photos'
import { callRest, formWithFile } from '../support/rest'
import { emptyStorage } from '../support/s3'

/**
 * The articles of the blog (ticket 046): the public reads what is published, and nothing else;
 * the newsroom writes; the content comes back as it was written, whatever its length; the gallery
 * holds images only, and its photos are public only with a published article. The access matrix
 * plays who may do what (tests/integration/payload-access.test.ts); this file looks at what each
 * reading and each save gives.
 */

afterEach(async () => {
	await Promise.all([emptyBase(), emptyStorage()])
})

/** An article as the import writes it: through the Local API, without access control. */
async function writeArticle(donnees: Partial<RequiredDataFromCollectionSlug<'articles'>> & { slug: string }) {
	const payload = await testPayload()
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

interface List {
	docs: Article[]
	totalDocs: number
}

/** A REST read, with its status and its body. */
async function read(chemin: string, enTetes: Record<string, string> = {}) {
	const { statut: status, corps } = await callRest('GET', chemin, { enTetes })
	return { statut: status, corps: corps as List & Partial<Article> }
}

/** The slugs a REST list gives. */
const slugsOf = (corps: List) => corps.docs.map(({ slug }) => slug).sort()

/** A media written by the server, as the newsroom or the import would hold it: a file of this type. */
async function typeMedia(type: 'image/png' | 'application/pdf'): Promise<Media> {
	const payload = await testPayload()
	const file = type === 'image/png' ? fileForPayload(photoName('article')) : undefined
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
function markdownOf(longueur: number): string {
	const paragraph =
		'## Un titre fictif\r\n\r\nUn paragraphe avec é, è, à, ç, œ, « guillemets » et 💄,\tune tabulation,  ' +
		'des espaces en fin de ligne  \n<script>alert(1)</script> \\échappé\\ $' +
		'{pas une variable} `code`.\n\n'
	const text = paragraph.repeat(Math.ceil(longueur / paragraph.length) + 1)
	// Cut on a whole character: an emoji is two code units, never split.
	let end = longueur
	while (text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end -= 1
	return text.slice(0, end) + 'x'.repeat(longueur - end)
}

describe('Article publié lu par un anonyme, brouillon introuvable', () => {
	test('la liste, la lecture par identifiant et la recherche par slug ne rendent que l’article publié', async () => {
		const published = await writeArticle({ slug: 'essai-maquillage-fictif' })
		const draft = await writeArticle({ slug: 'article-en-cours', _status: 'draft' })

		const list = await read('/api/articles?depth=0')
		expect(list.statut).toBe(200)
		expect(slugsOf(list.corps)).toEqual(['essai-maquillage-fictif'])

		expect((await read(`/api/articles/${published.id}`)).corps.title).toBe('Article essai-maquillage-fictif')
		expect((await read(`/api/articles/${draft.id}`)).statut).toBe(404)

		// What the page of an article will ask: the article of a slug.
		expect((await read('/api/articles?where[slug][equals]=essai-maquillage-fictif')).corps.totalDocs).toBe(1)
		expect((await read('/api/articles?where[slug][equals]=article-en-cours')).corps.totalDocs).toBe(0)
	})

	test('demander les brouillons (?draft=true) ne rend rien de plus, ni à un anonyme ni à une maquilleuse', async () => {
		const draft = await writeArticle({ slug: 'article-en-cours', _status: 'draft' })
		await writeArticle({ slug: 'essai-maquillage-fictif' })
		const artist = await createAccount('maquilleuse')

		for (const headers of [{}, artist.session.enTetes]) {
			expect(slugsOf((await read('/api/articles?draft=true', headers)).corps)).toEqual(['essai-maquillage-fictif'])
			expect((await read(`/api/articles/${draft.id}?draft=true`, headers)).statut).toBe(404)
			expect((await read('/api/articles/versions', headers)).statut).toBe(403)
		}
	})

	test('par l’API locale avec les règles actives, sans compte : de même', async () => {
		const draft = await writeArticle({ slug: 'article-en-cours', _status: 'draft' })
		await writeArticle({ slug: 'essai-maquillage-fictif' })
		const payload = await testPayload()

		const { docs } = await payload.find({ collection: 'articles', overrideAccess: false, draft: true })
		expect(docs.map(({ slug }) => slug)).toEqual(['essai-maquillage-fictif'])
		await expect(
			payload.findByID({ collection: 'articles', id: draft.id, overrideAccess: false })
		).rejects.toMatchObject({ status: 404 })
	})

	test('l’identifiant de l’ancien site ne sort que pour la rédaction', async () => {
		const published = await writeArticle({ slug: 'essai-maquillage-fictif', strapiId: 4 })
		const editor = await createAccount('redaction')

		expect(Object.keys((await read(`/api/articles/${published.id}`)).corps)).not.toContain('strapiId')
		expect((await read(`/api/articles/${published.id}`, editor.session.enTetes)).corps.strapiId).toBe(4)
	})
})

describe('Redaction crée et publie ; maquilleuse et anonyme refusés (U59)', () => {
	const newArticle = {
		title: 'Un article fictif',
		slug: 'un-article-fictif',
		author: 'Rédaction fictive',
		excerpt: 'Un extrait fictif.',
		seo_title: 'Un article fictif',
		seo_description: 'Une description fictive.',
		content: '## Un article\n\nFictif.\n',
	}

	test('la rédaction écrit un brouillon, le public ne le voit pas ; publié, il le lit, avec sa date de publication', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		const created = await callRest('POST', '/api/articles?draft=true', { enTetes: headers, corps: newArticle })
		expect(created.statut).toBe(201)
		const id = (created.corps as { doc: Article }).doc.id
		expect((await read(`/api/articles/${id}`)).statut).toBe(404)

		const published = await callRest('PATCH', `/api/articles/${id}`, {
			enTetes: headers,
			corps: { _status: 'published' },
		})
		expect(published.statut).toBe(200)
		const fetched = await read(`/api/articles/${id}`)
		expect(fetched.statut).toBe(200)
		expect(fetched.corps).toMatchObject({ ...newArticle, _status: 'published' })
		expect(Date.now() - Date.parse(String(fetched.corps.publishedAt))).toBeLessThan(60_000)

		// Unpublished: out of reach again.
		await callRest('PATCH', `/api/articles/${id}`, { enTetes: headers, corps: { _status: 'draft' } })
		expect((await read(`/api/articles/${id}`)).statut).toBe(404)
	})

	test('une maquilleuse et un anonyme ne créent ni ne publient : refusés, rien n’est écrit', async () => {
		const artist = await createAccount('maquilleuse')
		const draft = await writeArticle({ slug: 'article-en-cours', _status: 'draft' })
		const payload = await testPayload()

		for (const headers of [{}, artist.session.enTetes]) {
			for (const path of ['/api/articles', '/api/articles?draft=true'])
				expect((await callRest('POST', path, { enTetes: headers, corps: newArticle })).statut).toBe(403)
			const publication = await callRest('PATCH', `/api/articles/${draft.id}`, {
				enTetes: headers,
				corps: { _status: 'published' },
			})
			expect([403, 404]).toContain(publication.statut)
		}
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
		expect((await payload.findByID({ collection: 'articles', id: draft.id }))._status).toBe('draft')
	})

	test('un slug déjà pris, ou qui n’a pas la forme d’une adresse, est refusé à la publication', async () => {
		await writeArticle({ slug: 'un-article-fictif' })
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		const duplicate = await callRest('POST', '/api/articles', {
			enTetes: headers,
			corps: { ...newArticle, _status: 'published' },
		})
		expect(duplicate.statut).toBe(400)
		const badlyShape = await callRest('POST', '/api/articles', {
			enTetes: headers,
			corps: { ...newArticle, slug: 'Un Article Fictif', _status: 'published' },
		})
		expect(badlyShape.statut).toBe(400)
		expect(badlyShape.texte).toContain('« un-article-fictif »')
		const payload = await testPayload()
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
	})

	test('un titre pour les moteurs de plus de 70 caractères, une description de plus de 155 : refusés', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		for (const corps of [
			{ ...newArticle, seo_title: 't'.repeat(71) },
			{ ...newArticle, seo_description: 'd'.repeat(156) },
		])
			expect(
				(await callRest('POST', '/api/articles', { enTetes: headers, corps: { ...corps, _status: 'published' } }))
					.statut
			).toBe(400)
		const just = { ...newArticle, seo_title: 't'.repeat(70), seo_description: 'd'.repeat(155) }
		expect(
			(await callRest('POST', '/api/articles', { enTetes: headers, corps: { ...just, _status: 'published' } })).statut
		).toBe(201)
	})
})

describe('Contenu de 60 000 caractères relu à l’identique ; PDF refusé dans la galerie', () => {
	test('écrit par la rédaction, relu par le public : le même texte, caractère pour caractère', async () => {
		const content = markdownOf(60_000)
		expect(content.length).toBe(60_000)
		const editor = await createAccount('redaction')

		const created = await callRest('POST', '/api/articles', {
			enTetes: editor.session.enTetes,
			corps: { title: 'Un long article', slug: 'un-long-article', content: content, _status: 'published' },
		})
		expect(created.statut).toBe(201)
		const id = (created.corps as { doc: Article }).doc.id

		expect((await read(`/api/articles/${id}`)).corps.content).toBe(content)
		expect((await read('/api/articles')).corps.docs[0]?.content).toBe(content)
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'articles', id })).content).toBe(content)
	})

	test('écrit par l’import (API locale) : de même, et 200 000 caractères passent aussi', async () => {
		for (const length of [60_000, 200_000]) {
			const content = markdownOf(length)
			const article = await writeArticle({ slug: `long-${length}`, content: content })
			expect((await read(`/api/articles/${article.id}`)).corps.content).toBe(content)
		}
	})

	test('un PDF dans la galerie : refusé, publié comme en brouillon, par REST comme par l’API locale ; rien ne change', async () => {
		const [image, pdf] = [await typeMedia('image/png'), await typeMedia('application/pdf')]
		const article = await writeArticle({ slug: 'un-article-fictif', gallery: [image.id] })
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		for (const path of [`/api/articles/${article.id}`, `/api/articles/${article.id}?draft=true`]) {
			const {
				statut: status,
				corps,
				texte: text,
			} = await callRest('PATCH', path, {
				enTetes: headers,
				corps: { gallery: [image.id, pdf.id] },
			})
			expect(status).toBe(400)
			expect(text).toContain('La galerie d’un article ne prend que des images')
			// The envelope is in French too (ticket 221), with a no-break space before the colon.
			expect((corps as { errors: { message: string }[] }).errors[0]?.message).toBe(
				'Le champ suivant n’est pas valide\u00a0: Galerie'
			)
		}
		const creation = await callRest('POST', '/api/articles?draft=true', {
			enTetes: headers,
			corps: { title: 'Avec un PDF', slug: 'avec-un-pdf', gallery: [pdf.id] },
		})
		expect(creation.statut).toBe(400)

		const payload = await testPayload()
		// The import too: the Local API, without access control, refuses it.
		await expect(writeArticle({ slug: 'import-avec-un-pdf', gallery: [pdf.id] })).rejects.toMatchObject({
			status: 400,
		})
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual([image.id])
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
	})

	test('un identifiant qu’aucun média ne peut porter : refusé avec le message, jamais une erreur du serveur', async () => {
		const image = await typeMedia('image/png')
		const article = await writeArticle({ slug: 'un-article-fictif', gallery: [image.id] })
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		for (const impossible of ['abc', '99999999999', 99_999_999_999, 1.5, -1, '', { id: 'x' }]) {
			const gallery = [image.id, impossible]
			for (const [method, path] of [
				['PATCH', `/api/articles/${article.id}`],
				['PATCH', `/api/articles/${article.id}?draft=true`],
				['POST', '/api/articles'],
				['POST', '/api/articles?draft=true'],
			] as const) {
				const corps = method === 'POST' ? { title: 'Fictif', slug: 'fictif', gallery } : { gallery }
				const { statut: status, texte: text } = await callRest(method, path, { enTetes: headers, corps })
				expect([impossible, path, status]).toEqual([impossible, path, 400])
				expect(text).toContain('La galerie d’un article ne prend que des images')
			}
			// The import too: a validation error, never a failed query.
			await expect(writeArticle({ slug: 'import-fictif', gallery: gallery as never })).rejects.toMatchObject({
				status: 400,
			})
		}
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual([image.id])
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
	})

	test('des images, dans l’ordre donné : enregistrées, et l’ordre est gardé', async () => {
		const images = [await typeMedia('image/png'), await typeMedia('image/png'), await typeMedia('image/png')]
		const article = await writeArticle({ slug: 'un-article-fictif' })
		const editor = await createAccount('redaction')
		const order = images.map(({ id }) => id).reverse()

		const { statut: status } = await callRest('PATCH', `/api/articles/${article.id}`, {
			enTetes: editor.session.enTetes,
			corps: { gallery: order },
		})
		expect(status).toBe(200)
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual(order)
	})
})

describe('Média d’un article publié lisible, d’un brouillon non', () => {
	/** A photo sent by the newsroom through REST, as the admin panel sends it. */
	async function sendByEditor(enTetes: Record<string, string>): Promise<Media> {
		const {
			statut: status,
			corps,
			texte: text,
		} = await callRest('POST', '/api/media?depth=0', {
			enTetes,
			formulaire: formWithFile(fileForForm(photoName('article')), { alt: 'Photo fictive' }),
		})
		if (status !== 201) throw new Error(`L’envoi de la photo a échoué : ${status} ${text}`)
		return (corps as { doc: Media }).doc
	}

	test('la rédaction envoie une photo : elle n’appartient à personne, et le public ne la lit qu’une fois l’article publié', async () => {
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes
		const photo = await sendByEditor(headers)
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'media', id: photo.id, depth: 0 })).owner ?? null).toBeNull()

		const created = await callRest('POST', '/api/articles?draft=true', {
			enTetes: headers,
			corps: { title: 'Un article fictif', slug: 'un-article-fictif', gallery: [photo.id] },
		})
		expect(created.statut).toBe(201)
		const id = (created.corps as { doc: Article }).doc.id

		// A draft: its photo is out of reach for the public, read by the newsroom.
		expect((await callRest('GET', `/api/media/${photo.id}`)).statut).toBe(404)
		expect((await callRest('GET', `/api/media/${photo.id}`, { enTetes: headers })).statut).toBe(200)

		await callRest('PATCH', `/api/articles/${id}`, { enTetes: headers, corps: { _status: 'published' } })
		const readValue = await callRest('GET', `/api/media/${photo.id}?depth=0`)
		expect(readValue.statut).toBe(200)
		expect(readValue.corps).toMatchObject({ id: photo.id, url: photo.url })

		// Unpublished: out of reach again.
		await callRest('PATCH', `/api/articles/${id}`, { enTetes: headers, corps: { _status: 'draft' } })
		expect((await callRest('GET', `/api/media/${photo.id}`)).statut).toBe(404)
	})

	test('une photo qu’un brouillon ajoute à un article publié reste introuvable jusqu’à la publication', async () => {
		const [first, ajoutee] = [await typeMedia('image/png'), await typeMedia('image/png')]
		const article = await writeArticle({ slug: 'un-article-fictif', gallery: [first.id] })
		const editor = await createAccount('redaction')
		const headers = editor.session.enTetes

		const draft = await callRest('PATCH', `/api/articles/${article.id}?draft=true`, {
			enTetes: headers,
			corps: { gallery: [first.id, ajoutee.id] },
		})
		expect(draft.statut).toBe(200)
		expect((await callRest('GET', `/api/media/${first.id}`)).statut).toBe(200)
		expect((await callRest('GET', `/api/media/${ajoutee.id}`)).statut).toBe(404)

		await callRest('PATCH', `/api/articles/${article.id}`, { enTetes: headers, corps: { _status: 'published' } })
		expect((await callRest('GET', `/api/media/${ajoutee.id}`)).statut).toBe(200)
	})

	test('la photo d’une maquilleuse n’entre dans aucune galerie : refusée à la rédaction, à un admin et à l’import ; elle reste privée', async () => {
		const artist = await createAccount('maquilleuse')
		const upload = await callRest('POST', '/api/media?depth=0', {
			enTetes: artist.session.enTetes,
			formulaire: formWithFile(fileForForm()),
		})
		expect(upload.statut).toBe(201)
		const privateValue = (upload.corps as { doc: Media }).doc.id
		const image = await typeMedia('image/png')
		const article = await writeArticle({ slug: 'un-article-fictif', gallery: [image.id] })
		const [editor, admin] = [await createAccount('redaction'), await createAccount('admin')]

		for (const headers of [editor.session.enTetes, admin.session.enTetes]) {
			for (const [method, path] of [
				['PATCH', `/api/articles/${article.id}`],
				['PATCH', `/api/articles/${article.id}?draft=true`],
				['POST', '/api/articles'],
				['POST', '/api/articles?draft=true'],
			] as const) {
				const gallery = [image.id, privateValue]
				const corps = method === 'POST' ? { title: 'Fictif', slug: 'fictif', gallery } : { gallery }
				const { statut: status, texte: text } = await callRest(method, path, { enTetes: headers, corps })
				expect([path, status]).toEqual([path, 400])
				expect(text).toContain('jamais la photo d’une maquilleuse')
			}
		}
		await expect(writeArticle({ slug: 'import-fictif', gallery: [privateValue] })).rejects.toMatchObject({
			status: 400,
		})

		// What a published article would have opened: her photo stays out of reach of the public.
		const payload = await testPayload()
		expect((await payload.findByID({ collection: 'articles', id: article.id, depth: 0 })).gallery).toEqual([image.id])
		expect((await payload.count({ collection: 'articles' })).totalDocs).toBe(1)
		expect((await callRest('GET', `/api/media/${privateValue}`)).statut).toBe(404)
	})

	test('une photo d’article qu’un admin donne ensuite à une maquilleuse n’est plus ouverte par l’article', async () => {
		const photo = await typeMedia('image/png')
		await writeArticle({ slug: 'un-article-fictif', gallery: [photo.id] })
		const [artist, other, editor, admin] = [
			await createAccount('maquilleuse'),
			await createAccount('maquilleuse'),
			await createAccount('redaction'),
			await createAccount('admin'),
		]
		const readBy = async (enTetes: Record<string, string> = {}) =>
			(await callRest('GET', `/api/media/${photo.id}`, { enTetes })).statut
		expect(await readBy()).toBe(200)

		const don = await callRest('PATCH', `/api/media/${photo.id}`, {
			enTetes: admin.session.enTetes,
			corps: { owner: artist.id },
		})
		expect(don.statut).toBe(200)
		// Her profile is a draft: her photo is private, published article or not. The newsroom loses it too.
		expect(await readBy()).toBe(404)
		expect(await readBy(other.session.enTetes)).toBe(404)
		expect(await readBy(editor.session.enTetes)).toBe(404)
		expect(await readBy(artist.session.enTetes)).toBe(200)
		expect(await readBy(admin.session.enTetes)).toBe(200)
		const payload = await testPayload()
		await expect(payload.findByID({ collection: 'media', id: photo.id, overrideAccess: false })).rejects.toMatchObject({
			status: 404,
		})
	})

	test('la liste des médias reste fermée au public ; la rédaction ne liste que les siens, jamais les photos d’une maquilleuse', async () => {
		const photo = await typeMedia('image/png')
		await writeArticle({ slug: 'un-article-fictif', gallery: [photo.id] })
		const [editor, artist] = [await createAccount('redaction'), await createAccount('maquilleuse')]
		const hers = await callRest('POST', '/api/media?depth=0', {
			enTetes: artist.session.enTetes,
			formulaire: formWithFile(fileForForm()),
		})
		expect(hers.statut).toBe(201)

		expect((await callRest('GET', '/api/media')).statut).toBe(403)
		const list = await callRest('GET', '/api/media?depth=0', { enTetes: editor.session.enTetes })
		expect(list.statut).toBe(200)
		expect((list.corps as { docs: Media[] }).docs.map(({ id }) => id)).toEqual([photo.id])
		const ofArtist = (hers.corps as { doc: Media }).doc.id
		expect((await callRest('GET', `/api/media/${ofArtist}`, { enTetes: editor.session.enTetes })).statut).toBe(404)
		const modification = await callRest('PATCH', `/api/media/${ofArtist}`, {
			enTetes: editor.session.enTetes,
			corps: { alt: 'Texte de la rédaction' },
		})
		expect([403, 404]).toContain(modification.statut)
	})
})
