import { describe, expect, test } from 'bun:test'
import { benchEnvironment, benchServices } from '../support/bench'
import { fakeGoogle, SCENARIOS } from '../support/fake-google'

/**
 * The fake Google as it runs: the container `bun run bench:up` started, asked over HTTP from this
 * machine, through the environment the integration command gave to this process.
 */
const services = benchServices(benchEnvironment())

/** One sign-in may take this long, from the authorization request to the profile. */
const ROUND_TRIP_MAX_MS = 5000

describe('Test coquille : un aller-retour complet avec le faux Google du banc', () => {
	test('ce lancement est réglé sur le faux Google de son instance, avec le client factice du banc', () => {
		const google = fakeGoogle()

		expect(google.emetteur).toBe(services.google.adresse)
		expect(process.env.GOOGLE_OIDC_ISSUER).toBe(services.google.adresse)
		expect(google.clientId).toBe(services.google.clientId)
		expect(google.secret).toContain('factice')
	})

	test('email vérifié : demande, code, jetons, signature, profil, en moins de 5 secondes', async () => {
		const google = fakeGoogle()
		const choice = google.choisir({ email: 'lea.martin@example.test', prenom: 'Léa', nomDeFamille: 'Martin' })

		const result = await google.allerRetour(choice)

		if (result.issue !== 'connecte') throw new Error(`issue inattendue : ${result.issue}`)
		expect(result.revendications).toMatchObject({
			iss: services.google.adresse,
			aud: services.google.clientId,
			sub: choice.choix.identite.sub,
			email: 'lea.martin@example.test',
			email_verified: true,
			name: 'Léa Martin',
		})
		expect(result.profil.email).toBe('lea.martin@example.test')
		expect(result.dureeMs).toBeLessThan(ROUND_TRIP_MAX_MS)
	})

	test('les quatre scénarios se choisissent un par un, chacun en moins de 5 secondes', async () => {
		const google = fakeGoogle()
		const issues: Record<string, unknown> = {}

		for (const scenario of SCENARIOS) {
			const result = await google.allerRetour(google.choisir({ scenario, email: `${scenario}@example.test` }))
			expect(result.dureeMs).toBeLessThan(ROUND_TRIP_MAX_MS)
			issues[scenario] =
				result.issue === 'connecte'
					? { issue: result.issue, verifie: result.revendications.email_verified }
					: result.issue === 'refus'
						? { issue: result.issue, erreur: result.erreur }
						: { issue: result.issue, statut: result.statut }
		}

		expect(issues).toEqual({
			'email-verifie': { issue: 'connecte', verifie: true },
			'email-non-verifie': { issue: 'connecte', verifie: false },
			refus: { issue: 'refus', erreur: 'access_denied' },
			panne: { issue: 'panne', statut: 503 },
		})
	})

	test('premier et second passage : la même personne revient sous le même identifiant Google', async () => {
		const google = fakeGoogle()
		const choice = google.choisir({ email: 'zoe.lefevre@example.test' })

		const [first, second] = [await google.allerRetour(choice), await google.allerRetour(choice)]

		if (first.issue !== 'connecte' || second.issue !== 'connecte') throw new Error('connexion attendue')
		expect(second.revendications.sub).toBe(first.revendications.sub)
		expect(second.revendications.email).toBe(first.revendications.email ?? '')
	})

	test('un navigateur reçoit le choix par un cookie du fournisseur, à son adresse', async () => {
		const google = fakeGoogle()
		const [cookie] = google.choisir({ scenario: 'refus' }).cookies
		const request = new URL(`${google.emetteur}/o/oauth2/v2/auth`)
		request.search = new URLSearchParams({
			client_id: google.clientId,
			redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/retour-du-faux-google`,
			response_type: 'code',
			scope: 'openid email',
			state: 'etat-du-navigateur',
		}).toString()

		// What a browser sends once `context.addCookies()` has taken this cookie.
		const response = await fetch(request, {
			headers: { Cookie: `${cookie?.name}=${cookie?.value}` },
			redirect: 'manual',
		})

		expect(cookie?.url).toBe(services.google.adresse)
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe(
			`${process.env.NEXT_PUBLIC_SITE_URL}/retour-du-faux-google?error=access_denied&state=etat-du-navigateur`
		)
	})

	test('il refuse un autre client que celui du banc, et un retour ailleurs que sur ce poste', async () => {
		const google = fakeGoogle()
		const request = (parametres: Record<string, string>) => {
			const url = new URL(`${google.emetteur}/o/oauth2/v2/auth`)
			url.search = new URLSearchParams({ response_type: 'code', scope: 'openid', ...parametres }).toString()
			return fetch(url, { redirect: 'manual' })
		}

		const unknown = await request({ client_id: 'client-factice-inconnu', redirect_uri: 'http://localhost:3100/retour' })
		const elsewhere = await request({ client_id: google.clientId, redirect_uri: 'https://exemple.test/retour' })

		expect([unknown.status, unknown.headers.has('location')]).toEqual([401, false])
		expect([elsewhere.status, elsewhere.headers.has('location')]).toEqual([400, false])
	})
})
