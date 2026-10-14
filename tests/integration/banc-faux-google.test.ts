import { describe, expect, test } from 'bun:test'
import { environnementDuBanc, servicesDuBanc } from '../outils/banc'
import { fauxGoogle, SCENARIOS } from '../outils/faux-google'

/**
 * The fake Google as it runs: the container `bun run banc:up` started, asked over HTTP from this
 * machine, through the environment the integration command gave to this process.
 */
const services = servicesDuBanc(environnementDuBanc())

/** One sign-in may take this long, from the authorization request to the profile. */
const ALLER_RETOUR_MAX_MS = 5000

describe('Test coquille : un aller-retour complet avec le faux Google du banc', () => {
	test('ce lancement est réglé sur le faux Google de son instance, avec le client factice du banc', () => {
		const google = fauxGoogle()

		expect(google.emetteur).toBe(services.google.adresse)
		expect(process.env.GOOGLE_OIDC_ISSUER).toBe(services.google.adresse)
		expect(google.clientId).toBe(services.google.clientId)
		expect(google.secret).toContain('factice')
	})

	test('email vérifié : demande, code, jetons, signature, profil, en moins de 5 secondes', async () => {
		const google = fauxGoogle()
		const choix = google.choisir({ email: 'lea.martin@example.test', prenom: 'Léa', nomDeFamille: 'Martin' })

		const resultat = await google.allerRetour(choix)

		if (resultat.issue !== 'connecte') throw new Error(`issue inattendue : ${resultat.issue}`)
		expect(resultat.revendications).toMatchObject({
			iss: services.google.adresse,
			aud: services.google.clientId,
			sub: choix.choix.identite.sub,
			email: 'lea.martin@example.test',
			email_verified: true,
			name: 'Léa Martin',
		})
		expect(resultat.profil.email).toBe('lea.martin@example.test')
		expect(resultat.dureeMs).toBeLessThan(ALLER_RETOUR_MAX_MS)
	})

	test('les quatre scénarios se choisissent un par un, chacun en moins de 5 secondes', async () => {
		const google = fauxGoogle()
		const issues: Record<string, unknown> = {}

		for (const scenario of SCENARIOS) {
			const resultat = await google.allerRetour(google.choisir({ scenario, email: `${scenario}@example.test` }))
			expect(resultat.dureeMs).toBeLessThan(ALLER_RETOUR_MAX_MS)
			issues[scenario] =
				resultat.issue === 'connecte'
					? { issue: resultat.issue, verifie: resultat.revendications.email_verified }
					: resultat.issue === 'refus'
						? { issue: resultat.issue, erreur: resultat.erreur }
						: { issue: resultat.issue, statut: resultat.statut }
		}

		expect(issues).toEqual({
			'email-verifie': { issue: 'connecte', verifie: true },
			'email-non-verifie': { issue: 'connecte', verifie: false },
			refus: { issue: 'refus', erreur: 'access_denied' },
			panne: { issue: 'panne', statut: 503 },
		})
	})

	test('premier et second passage : la même personne revient sous le même identifiant Google', async () => {
		const google = fauxGoogle()
		const choix = google.choisir({ email: 'zoe.lefevre@example.test' })

		const [premier, second] = [await google.allerRetour(choix), await google.allerRetour(choix)]

		if (premier.issue !== 'connecte' || second.issue !== 'connecte') throw new Error('connexion attendue')
		expect(second.revendications.sub).toBe(premier.revendications.sub)
		expect(second.revendications.email).toBe(premier.revendications.email ?? '')
	})

	test('un navigateur reçoit le choix par un cookie du fournisseur, à son adresse', async () => {
		const google = fauxGoogle()
		const [cookie] = google.choisir({ scenario: 'refus' }).cookies
		const demande = new URL(`${google.emetteur}/o/oauth2/v2/auth`)
		demande.search = new URLSearchParams({
			client_id: google.clientId,
			redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/retour-du-faux-google`,
			response_type: 'code',
			scope: 'openid email',
			state: 'etat-du-navigateur',
		}).toString()

		// What a browser sends once `context.addCookies()` has taken this cookie.
		const reponse = await fetch(demande, {
			headers: { Cookie: `${cookie?.name}=${cookie?.value}` },
			redirect: 'manual',
		})

		expect(cookie?.url).toBe(services.google.adresse)
		expect(reponse.status).toBe(302)
		expect(reponse.headers.get('location')).toBe(
			`${process.env.NEXT_PUBLIC_SITE_URL}/retour-du-faux-google?error=access_denied&state=etat-du-navigateur`
		)
	})

	test('il refuse un autre client que celui du banc, et un retour ailleurs que sur ce poste', async () => {
		const google = fauxGoogle()
		const demande = (parametres: Record<string, string>) => {
			const url = new URL(`${google.emetteur}/o/oauth2/v2/auth`)
			url.search = new URLSearchParams({ response_type: 'code', scope: 'openid', ...parametres }).toString()
			return fetch(url, { redirect: 'manual' })
		}

		const inconnu = await demande({ client_id: 'client-factice-inconnu', redirect_uri: 'http://localhost:3100/retour' })
		const ailleurs = await demande({ client_id: google.clientId, redirect_uri: 'https://exemple.test/retour' })

		expect([inconnu.status, inconnu.headers.has('location')]).toEqual([401, false])
		expect([ailleurs.status, ailleurs.headers.has('location')]).toEqual([400, false])
	})
})
