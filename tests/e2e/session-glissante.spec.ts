import { expect, test } from '@playwright/test'
import { getFieldsToSign, jwtSign } from 'payload'
import { expirationDuJeton } from '@/lib/auth/sliding-session'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * The sliding session (ticket 079; plan 02 E14): a makeup artist who visits her space with less
 * than 7 days left has her session renewed, once per visit; a public page never renews it.
 * The server's clock cannot be moved from a browser, so the session is signed for 5 days, as one
 * would be after nine days of silence.
 */

const JOUR = 86_400
const REFRESH = '/api/pros/refresh-token'

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++compteur % 80)}` })
)

/** A session of a new makeup artist whose token ends in `jours` days instead of 14. */
async function sessionQuiFinitDans(jours: number) {
	const compte = await creerCompte('maquilleuse')
	const cookie = compte.session.cookies[0]
	if (!cookie) throw new Error('pas de cookie')
	const sid = /"sid":"([^"]+)"/.exec(Buffer.from(cookie.value.split('.')[1] ?? '', 'base64url').toString())?.[1]
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection: 'pros',
		where: { email: { equals: compte.email } },
		limit: 1,
		overrideAccess: true,
	})
	const doc = docs[0]
	if (!doc || !sid) throw new Error('compte ou session introuvable')
	const { token } = await jwtSign({
		fieldsToSign: getFieldsToSign({
			collectionConfig: payload.collections.pros.config,
			email: compte.email,
			sid,
			user: { ...doc, collection: 'pros' } as never,
		}),
		secret: payload.secret,
		tokenExpiration: jours * JOUR,
	})
	return { cookie: { ...cookie, value: token, expires: Math.floor(Date.now() / 1000) + jours * JOUR }, compte }
}

test.describe('E14 : une activité régulière prolonge la session', { tag: '@lent' }, () => {
	test('une visite de l’espace avec moins de 7 jours renouvelle la session une fois, pour 14 jours', async ({
		context,
		page,
	}) => {
		const { cookie } = await sessionQuiFinitDans(5)
		await context.addCookies([cookie])
		const demandes: string[] = []
		page.on('request', requete => {
			if (requete.url().includes(REFRESH)) demandes.push(requete.method())
		})

		const [reponse] = await Promise.all([
			page.waitForResponse(r => r.url().includes(REFRESH)),
			page.goto('/auth/profil'),
		])
		expect(reponse.status()).toBe(200)
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()

		const apres = (await context.cookies()).find(c => c.name === 'payload-token')
		const exp = expirationDuJeton(apres?.value) ?? 0
		expect(exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(13 * JOUR)
		expect(apres?.httpOnly).toBe(true)

		// The session now has 14 days left: a second visit asks for nothing.
		await page.reload()
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()
		expect(demandes).toEqual(['POST'])
	})

	test('une session toute neuve ne demande aucun renouvellement', async ({ context, page }) => {
		const compte = await creerCompte('maquilleuse')
		await context.addCookies(compte.session.cookies)
		const demandes: string[] = []
		page.on('request', requete => {
			if (requete.url().includes(REFRESH)) demandes.push(requete.method())
		})

		await page.goto('/auth/profil')
		await expect(page.getByRole('heading', { name: 'Mon espace' })).toBeVisible()

		expect(demandes).toEqual([])
	})

	test('une page publique ne renouvelle rien, même avec une session qui touche à sa fin', async ({ context, page }) => {
		const { cookie } = await sessionQuiFinitDans(2)
		await context.addCookies([cookie])
		const demandes: string[] = []
		page.on('request', requete => {
			if (requete.url().includes(REFRESH)) demandes.push(requete.method())
		})

		await page.goto('/')
		await expect(page.locator('main')).toBeVisible()

		expect(demandes).toEqual([])
		expect((await context.cookies()).find(c => c.name === 'payload-token')?.value).toBe(cookie.value)
	})
})
