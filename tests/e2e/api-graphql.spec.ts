import { expect, test } from '@playwright/test'

/**
 * I05 over HTTP (plan 02 §7.3): the application, built and served, answers 404 to both GraphQL
 * addresses, whatever the method. tests/unit/payload-config.test.ts calls the two route handlers
 * directly; only a request to the running application proves which handler Next sends them to.
 *
 * No page is opened: the request goes through Playwright's HTTP client, to a path of the target.
 */
test.describe('L’API servie par l’application : GraphQL est coupé (I05)', () => {
	test('/api/graphql et /api/graphql-playground répondent 404, sans rien lire', async ({ request }) => {
		const requete = await request.post('/api/graphql', { data: { query: '{ __typename }' } })
		expect(requete.status()).toBe(404)
		expect(await requete.text()).toBe('')

		expect((await request.get('/api/graphql')).status()).toBe(404)
		expect((await request.get('/api/graphql-playground')).status()).toBe(404)
	})
})
