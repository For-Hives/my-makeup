import { afterAll, expect, test } from 'bun:test'
import { request } from 'node:https'
import { HttpResponse, http, simuler } from '../outils/http-sortant'

// Not a test of the suite: nothing in its name makes bun or Playwright pick it up.
// tests/unit/banc-http-sortant.test.ts runs it in a child `bun test` and reads the verdict of
// each test below. All but the first one must fail, though every one of their assertions holds.

/** A careless client: whatever goes wrong with the service, it carries on. */
async function appeler(adresse: string): Promise<string> {
	try {
		return `réponse ${(await fetch(adresse)).status}`
	} catch {
		return 'service indisponible'
	}
}

test('TEMOIN service déclaré', async () => {
	simuler(http.get('https://declare.example.test/etat', () => HttpResponse.json({ ok: true })))

	expect(await appeler('https://declare.example.test/etat')).toBe('réponse 200')
})

test('TEMOIN service déclaré par le test d’avant seulement', async () => {
	expect(await appeler('https://declare.example.test/etat')).toBe('service indisponible')
})

test('TEMOIN hôte non déclaré, erreur avalée', async () => {
	expect(await appeler('https://non-declare.example.test/etat?jeton=secret-du-temoin')).toBe('service indisponible')
})

test('TEMOIN hôte non déclaré, appelé sans fetch', async () => {
	const issue = await new Promise<string>(resolve => {
		request('https://par-node.example.test/etat', reponse => resolve(`réponse ${reponse.statusCode}`))
			.on('error', () => resolve('service indisponible'))
			.end()
	})

	expect(issue).toBe('service indisponible')
})

afterAll(async () => {
	await appeler('https://hors-test.example.test/etat')
})
