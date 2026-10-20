import { expect, test } from '@playwright/test'
import { createAccount } from '../support/account-factory'

/**
 * E55 (plan 02 §7.4; ticket 164): an account of the newsroom (`editor`) sees the articles, the
 * talents and their images in the admin panel, and nothing else; it publishes and unpublishes, and
 * the public page follows at once; it never changes its own role. The documents are made up and
 * taken away at the end.
 */

const suffixe = Date.now().toString(36)
const COLLECTIONS_FERMEES = ['contact-requests', 'profiles', 'pros', 'admins', 'auth-events'] as const

test.describe.configure({ mode: 'serial' })

test.describe('E55 : la rédaction ne voit que les articles, les talents et leurs images', { tag: '@mobile' }, () => {
	test('le menu de l’administration ne propose que trois collections, et les autres s’ouvrent sur rien', async ({
		context,
		page,
	}) => {
		await createAccount('admin')
		const redaction = await createAccount('redaction')
		await context.addCookies(redaction.session.cookies)

		await page.goto('/admin')
		const collections = await page
			.locator('a[href^="/admin/collections/"]')
			.evaluateAll(liens => [...new Set(liens.map(lien => lien.getAttribute('href')?.split('/')[3] ?? ''))])
		expect(collections.sort()).toEqual(['articles', 'media', 'talents'])
		await expect(page.locator('body')).not.toContainText(/message de contact|coordonn/i)

		for (const collection of COLLECTIONS_FERMEES) {
			await page.goto(`/admin/collections/${collection}`)
			await expect(page.locator('table')).toHaveCount(0)
			await expect(page.locator(`a[href^="/admin/collections/${collection}/"]`)).toHaveCount(0)
		}

		// Its own account stays reachable although the list of the accounts is hidden.
		await page.goto('/admin/account')
		await expect(page.locator('input[name="email"]')).toHaveValue(redaction.email)
	})

	test('une liste de l’API ne rend ni les demandes ni les coordonnées', async ({ request }) => {
		await createAccount('admin')
		const { session } = await createAccount('redaction')

		for (const collection of ['contact-requests', 'pros', 'admins'] as const) {
			const reponse = await request.get(`/api/${collection}?limit=50`, { headers: session.enTetes })
			if (collection === 'admins') {
				const corps = (await reponse.json()) as { docs: { role: string }[] }
				expect(corps.docs.every(compte => compte.role === 'editor')).toBe(true)
			} else expect(reponse.status()).toBe(403)
		}
		const profils = await request.get('/api/profiles?limit=50&depth=0', { headers: session.enTetes })
		const texte = await profils.text()
		expect(texte).not.toMatch(/"(telephone|phone|email|siret|internalNote)"\s*:\s*"[^"]/)
	})

	for (const [collection, chemin] of [
		['articles', 'blog'],
		['talents', 'talent'],
	] as const) {
		test(`un ${collection === 'articles' ? 'article' : 'talent'} publié est sur le site, dépublié il répond 404`, async ({
			request,
		}) => {
			await createAccount('admin')
			const { session } = await createAccount('redaction')
			const slug = `essai-redaction-${collection}-${suffixe}`
			const cree = await request.post(`/api/${collection}`, {
				headers: session.enTetes,
				data: {
					title: `Essai rédaction ${suffixe}`,
					slug,
					description: 'Une présentation fictive.',
					excerpt: 'Un extrait fictif.',
					content: '## Un essai\n\nUn texte fictif pour la rédaction.\n',
					_status: 'draft',
				},
			})
			expect(cree.status()).toBe(201)
			const id = ((await cree.json()) as { doc: { id: number } }).doc.id
			try {
				expect((await request.get(`/${chemin}/${slug}`)).status()).toBe(404)

				const publie = await request.patch(`/api/${collection}/${id}`, {
					headers: session.enTetes,
					data: { _status: 'published' },
				})
				expect(publie.ok()).toBe(true)
				expect((await request.get(`/${chemin}/${slug}`)).status()).toBe(200)

				const depublie = await request.patch(`/api/${collection}/${id}`, {
					headers: session.enTetes,
					data: { _status: 'draft' },
				})
				expect(depublie.ok()).toBe(true)
				expect((await request.get(`/${chemin}/${slug}`)).status()).toBe(404)
			} finally {
				await request.delete(`/api/${collection}/${id}`, { headers: session.enTetes })
			}
		})
	}

	test('elle ne change pas son rôle', async ({ request }) => {
		await createAccount('admin')
		const { session, id } = await createAccount('redaction')

		const reponse = await request.patch(`/api/admins/${id}`, { headers: session.enTetes, data: { role: 'admin' } })
		expect(reponse.ok()).toBe(true)
		const moi = (await (await request.get('/api/admins/me', { headers: session.enTetes })).json()) as {
			user: { role: string }
		}
		expect(moi.user.role).toBe('editor')
	})
})
