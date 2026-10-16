import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { getFieldsToSign, jwtSign } from 'payload'
import { finDeVieDuCookie } from '@/lib/auth/etat-session'
import { expirationDuJeton, PLAFOND_DE_SESSION_S } from '@/lib/auth/session-glissante'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The sliding session of a makeup artist (ticket 079; plan 02 I16): a renewal is accepted on day 13,
 * refused on day 91, and no token ever ends after day 90. The clock is simulated; the session is a
 * real one, recorded on the account.
 */

const JOUR_MS = 86_400_000
const REFRESH = '/api/pros/refresh-token'

afterEach(async () => {
	setSystemTime()
	await viderLaBase()
})

const jetonDuCookie = (enTetes: Headers): string =>
	/^payload-token=([^;]+)/.exec(enTetes.get('set-cookie') ?? '')?.[1] ?? ''
const entetesAvec = (jeton: string, origine: string) => ({ Cookie: `payload-token=${jeton}`, Origin: origine })

describe('I16 : session glissante de 14 jours, plafonnée à 90', () => {
	test('un rafraîchissement à J+13 est accepté, un autre à J+91 est refusé', async () => {
		const debut = Date.now()
		const { session } = await creerCompte('maquilleuse')
		const { Origin } = session.enTetes

		setSystemTime(new Date(debut + 13 * JOUR_MS))
		const accepte = await appelerRest('POST', REFRESH, { enTetes: session.enTetes })
		expect(accepte.statut).toBe(200)
		const jeton = jetonDuCookie(accepte.enTetes)
		expect(expirationDuJeton(jeton)).toBe(Math.floor((debut + 27 * JOUR_MS) / 1000))
		// removeTokenFromResponses: the body does not carry the new token.
		expect(accepte.texte).not.toContain(jeton)

		// Day 91 with the ORIGINAL token: it ended on day 14, nothing opens.
		setSystemTime(new Date(debut + 91 * JOUR_MS))
		expect((await appelerRest('POST', REFRESH, { enTetes: session.enTetes })).statut).toBe(403)
		expect((await appelerRest('POST', REFRESH, { enTetes: entetesAvec(jeton, Origin) })).statut).toBe(403)
	})

	test('ticket 223 : le cookie du renouvellement finit comme celui de la connexion, 90 jours après son jeton', async () => {
		const debut = Date.now()
		const { session } = await creerCompte('maquilleuse')
		setSystemTime(new Date(debut + 13 * JOUR_MS))

		const reponse = await appelerRest('POST', REFRESH, { enTetes: session.enTetes })
		expect(reponse.statut).toBe(200)

		// One cookie only: Payload's own is not added to ours.
		const cookies = reponse.enTetes.getSetCookie()
		expect(cookies).toHaveLength(1)
		const ligne = cookies[0] ?? ''
		const jeton = jetonDuCookie(reponse.enTetes)
		const fin = expirationDuJeton(jeton)
		expect(fin).not.toBeNull()
		const expires = /Expires=([^;]+)/i.exec(ligne)?.[1]
		expect(new Date(expires ?? '').getTime()).toBe(finDeVieDuCookie(fin ?? 0).getTime())
		// The cookie outlives its token (the message « session expirée »), and keeps the attributes of the sign-in.
		expect(new Date(expires ?? '').getTime()).toBeGreaterThan((fin ?? 0) * 1000)
		expect(ligne).toMatch(/HttpOnly/i)
		expect(ligne).toMatch(/SameSite=Lax/i)
		expect(ligne).toMatch(/Path=\//)
		// The body still carries no token.
		expect(reponse.texte).not.toContain(jeton)
		expect(reponse.corps).not.toHaveProperty('refreshedToken')
	})

	test('une visite tous les 13 jours prolonge la session, mais aucun jeton ne finit après J+90', async () => {
		const debut = Date.now()
		const { session } = await creerCompte('maquilleuse')
		const plafond = Math.floor((debut + PLAFOND_DE_SESSION_S * 1000) / 1000)
		let enTetes = session.enTetes
		let derniere = 0

		for (const jour of [13, 26, 39, 52, 65, 78, 89]) {
			setSystemTime(new Date(debut + jour * JOUR_MS))
			const reponse = await appelerRest('POST', REFRESH, { enTetes })
			expect(reponse.statut, `jour ${jour}`).toBe(200)
			const jeton = jetonDuCookie(reponse.enTetes)
			derniere = expirationDuJeton(jeton) ?? 0
			expect(derniere, `jour ${jour}`).toBeLessThanOrEqual(plafond + 1)
			enTetes = entetesAvec(jeton, session.enTetes.Origin)
		}
		// Day 89: only one day is left under the ceiling, the new token lasts one day, not 14.
		expect(derniere).toBeGreaterThanOrEqual(plafond - 5)

		// Day 91: the last token has ended, and the session has no more life.
		setSystemTime(new Date(debut + 91 * JOUR_MS))
		expect((await appelerRest('POST', REFRESH, { enTetes })).statut).toBe(403)
	})

	test('un jeton plus long que le plafond est refusé au rafraîchissement dès J+90, en français', async () => {
		const debut = Date.now()
		const { session, email } = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const config = payload.collections.pros.config
		const sid = /"sid":"([^"]+)"/.exec(
			Buffer.from(session.cookies[0]?.value.split('.')[1] ?? '', 'base64url').toString()
		)?.[1]
		const { docs } = await payload.find({
			collection: 'pros',
			where: { email: { equals: email } },
			limit: 1,
			overrideAccess: true,
		})
		const compte = docs[0]
		if (!compte || !sid) throw new Error('compte ou session introuvable')
		// A token signed for 120 days, as one signed before this code could be.
		const { token } = await jwtSign({
			fieldsToSign: getFieldsToSign({
				collectionConfig: config,
				email,
				sid,
				user: { ...compte, collection: 'pros' } as never,
			}),
			secret: payload.secret,
			tokenExpiration: 120 * 86_400,
		})

		setSystemTime(new Date(debut + 89 * JOUR_MS))
		expect((await appelerRest('POST', REFRESH, { enTetes: entetesAvec(token, session.enTetes.Origin) })).statut).toBe(
			200
		)

		setSystemTime(new Date(debut + 91 * JOUR_MS))
		const refuse = await appelerRest('POST', REFRESH, { enTetes: entetesAvec(token, session.enTetes.Origin) })
		expect(refuse.statut).toBe(403)
		expect(refuse.texte).toContain('durée maximale')
		expect(refuse.enTetes.get('set-cookie')).toBeNull()
	})
})
