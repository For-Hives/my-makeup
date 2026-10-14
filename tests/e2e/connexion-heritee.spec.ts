import { expect, test } from '@playwright/test'
import { creerCompte, MOT_DE_PASSE_HERITE_DE_FIXTURE } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * An account of the old site signs in with its usual password (tickets 087 and 088; plan 02 E73):
 * the form, then the hash of Payload in the database, and the old one gone.
 */

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++compteur % 50)}` })
)

async function hashDe(id: number | string) {
	const ligne = await (await payloadDeTest()).db.findOne<{ id: number; legacyBcrypt?: string | null; hash?: string }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	if (!ligne) throw new Error('le compte n’est pas en base')
	return ligne
}

test.describe('Compte de l’ancien site', () => {
	test('E73 : le mot de passe habituel ouvre l’espace, puis le hash hérité est remplacé par celui de Payload', async ({
		context,
		page,
	}) => {
		const compte = await creerCompte('reprise-avec-hash')
		const avant = await hashDe(compte.id)
		expect(avant.legacyBcrypt).toMatch(/^\$2a\$10\$/)

		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(compte.email)
		await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE_HERITE_DE_FIXTURE)
		await page.getByRole('button', { name: 'Se connecter' }).click()

		await expect(page).toHaveURL(/\/auth\/profil$/)
		expect((await context.cookies()).map(c => c.name)).toEqual(['payload-token'])
		const apres = await hashDe(compte.id)
		expect(apres.legacyBcrypt ?? null).toBeNull()
		expect(apres.hash).not.toBe(avant.hash)
	})

	test('un mauvais mot de passe : le message générique, et le hash hérité reste', async ({ page }) => {
		const compte = await creerCompte('reprise-avec-hash')
		const avant = await hashDe(compte.id)

		await page.goto('/auth/signin')
		await page.getByLabel('Adresse email').fill(compte.email)
		await page.getByLabel('Mot de passe').fill('pas-le-bon')
		await page.getByRole('button', { name: 'Se connecter' }).click()

		await expect(page.getByTestId('erreur-connexion')).toHaveText('Email ou mot de passe incorrect.')
		expect(await hashDe(compte.id)).toEqual(avant)
	})
})
