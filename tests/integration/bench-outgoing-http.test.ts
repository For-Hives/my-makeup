import { describe, expect, test } from 'bun:test'
import { request } from 'node:http'
import { benchEnvironment, benchServices } from '../support/bench'
import { collectRefusal, UnmockedRequest } from '../support/outgoing-http'

/**
 * The outgoing HTTP bench, on the bench as it runs: the two services of the bench that speak
 * HTTP answer for real, and everything else is still refused.
 */
const { mails, stockage: storage } = benchServices(benchEnvironment())

/** The status a `node:http` request gets: the way out the S3 client of the application takes. */
const statusByNode = (adresse: string, methode: string): Promise<number | undefined> =>
	new Promise((resolve, reject) => {
		request(adresse, { method: methode }, reponse => {
			reponse.resume()
			reponse.on('end', () => resolve(reponse.statusCode))
		})
			.on('error', reject)
			.end()
	})

describe('Sur le banc démarré : ses services ne sont pas interceptés, tout autre hôte l’est', () => {
	test('le capteur de mails et le stockage d’objets répondent à fetch, sans aucune déclaration', async () => {
		const catcher = await fetch(`${mails.api}/api/v1/info`)
		const dashboard = await fetch(`${storage.adresse}/${storage.bucket}`, { method: 'HEAD' })

		expect(catcher.status).toBe(200)
		// Only the real Mailpit knows its own version.
		expect(Object.keys((await catcher.json()) as object)).toContain('Version')
		expect(dashboard.status).toBe(200)
		expect(collectRefusal()).toEqual([])
	})

	test('ils répondent aussi aux sorties que MSW ne voit pas : Bun.fetch et node:http', async () => {
		expect((await Bun.fetch(`${mails.api}/readyz`)).status).toBe(200)
		expect(await statusByNode(`${mails.api}/readyz`, 'GET')).toBe(200)
		expect(await statusByNode(`${storage.adresse}/${storage.bucket}`, 'HEAD')).toBe(200)
		expect(collectRefusal()).toEqual([])
	})

	test('un hôte qui n’est pas du banc est refusé ici comme dans les tests unitaires', async () => {
		const issue = await fetch('https://service-non-declare.example.test/etat').catch((erreur: unknown) => erreur)

		expect(issue).toBeInstanceOf(UnmockedRequest)
		expect(collectRefusal().map(({ hote }) => hote)).toEqual(['service-non-declare.example.test'])
	})
})
