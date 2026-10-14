import { describe, expect, test } from 'bun:test'
import { request } from 'node:http'
import { environnementDuBanc, servicesDuBanc } from '../outils/banc'
import { RequeteNonSimulee, releverLesRefus } from '../outils/http-sortant'

/**
 * The outgoing HTTP bench, on the bench as it runs: the two services of the bench that speak
 * HTTP answer for real, and everything else is still refused.
 */
const { mails, stockage } = servicesDuBanc(environnementDuBanc())

/** The status a `node:http` request gets: the way out the S3 client of the application takes. */
const statutParNode = (adresse: string, methode: string): Promise<number | undefined> =>
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
		const capteur = await fetch(`${mails.api}/api/v1/info`)
		const espace = await fetch(`${stockage.adresse}/${stockage.bucket}`, { method: 'HEAD' })

		expect(capteur.status).toBe(200)
		// Only the real Mailpit knows its own version.
		expect(Object.keys((await capteur.json()) as object)).toContain('Version')
		expect(espace.status).toBe(200)
		expect(releverLesRefus()).toEqual([])
	})

	test('ils répondent aussi aux sorties que MSW ne voit pas : Bun.fetch et node:http', async () => {
		expect((await Bun.fetch(`${mails.api}/readyz`)).status).toBe(200)
		expect(await statutParNode(`${mails.api}/readyz`, 'GET')).toBe(200)
		expect(await statutParNode(`${stockage.adresse}/${stockage.bucket}`, 'HEAD')).toBe(200)
		expect(releverLesRefus()).toEqual([])
	})

	test('un hôte qui n’est pas du banc est refusé ici comme dans les tests unitaires', async () => {
		const issue = await fetch('https://service-non-declare.example.test/etat').catch((erreur: unknown) => erreur)

		expect(issue).toBeInstanceOf(RequeteNonSimulee)
		expect(releverLesRefus().map(({ hote }) => hote)).toEqual(['service-non-declare.example.test'])
	})
})
