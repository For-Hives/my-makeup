import { expect, type Page, test } from '@playwright/test'
import { violationsGraves } from '../outils/axe'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'
import { fichierPourPayload } from '../outils/photos'
import { lireUnObjet } from '../outils/s3'

/**
 * She deletes her account from her space (ticket 141; plan 02 E33): a dialog that asks for her
 * password, a wrong one that deletes nothing, then the deletion: signed out, her public page is a
 * 404, her photo is in the bin of the storage, and she cannot sign in again. A held Enter sends one
 * request. All made-up people.
 *
 * The brake counts by client address: each test sends its own made-up address.
 */

const MOT_DE_PASSE = 'motdepasse-fictif-141'
const VILLE = { nom: 'Lille', codeInsee: '59350' } as const

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${150 + (++compteur % 50)}` })
)

/** An account with a profile that names a photo, and the session in the browser. */
async function maquilleuse(context: { addCookies: (c: never[]) => Promise<void> }) {
	const compte = await creerCompte('maquilleuse', { motDePasse: () => MOT_DE_PASSE })
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	const media = await payload.create({
		collection: 'media',
		data: { owner: Number(compte.id), alt: 'Photo principale' },
		file: fichierPourPayload(),
	})
	const profil = await payload.update({
		collection: 'profils',
		id: fiche.id,
		data: { prenom: 'Léa', nom: 'Fictive', specialite: 'Mariée', commune: VILLE, photoPrincipale: media.id },
	})
	await context.addCookies(compte.session.cookies as never[])
	return { compte, media, profil, slug: profil.slug ?? '' }
}

const existe = async (collection: 'pros' | 'profils' | 'media', id: number | string) =>
	(await (await payloadDeTest()).findByID({ collection, id, depth: 0, disableErrors: true, overrideAccess: true })) !==
	null

async function ouvrirLaFenetre(page: Page) {
	await page.goto('/auth/profil')
	await expect(page.getByTestId('zone-suppression')).toBeVisible()
	await page.getByTestId('zone-suppression').getByRole('button', { name: 'Supprimer mon compte' }).click()
	await expect(page.getByRole('dialog', { name: 'Supprimer mon compte' })).toBeVisible()
}

const champ = (page: Page) => page.getByLabel('Retape ton mot de passe pour confirmer')

test.describe('141 : supprimer mon compte', { tag: '@mobile' }, () => {
	test('E33 : un mauvais mot de passe ne supprime rien ; le bon : déconnexion, page publique en 404, reconnexion impossible', async ({
		context,
		page,
	}) => {
		const { compte, media, profil, slug } = await maquilleuse(context)
		expect((await page.request.get(`/profil/${slug}`)).status()).toBe(200)

		await ouvrirLaFenetre(page)
		await expect(page.getByRole('dialog')).toContainText('toutes tes photos seront supprimés pour toujours')
		await page.screenshot({ path: `test-results/essais/suppression-fenetre-${test.info().project.name}.png` })
		expect(await violationsGraves(page)).toEqual([])

		await champ(page).fill('pas-le-bon')
		await page.getByRole('button', { name: 'Supprimer définitivement mon compte' }).click()
		await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Ce n’est pas le bon mot de passe')
		await expect(page.getByRole('dialog')).toBeVisible()
		expect(await existe('pros', compte.id)).toBe(true)
		expect(await existe('profils', profil.id)).toBe(true)
		expect((await page.request.get(`/profil/${slug}`)).status()).toBe(200)

		await champ(page).fill(MOT_DE_PASSE)
		await page.getByRole('button', { name: 'Supprimer définitivement mon compte' }).click()

		await expect(page).toHaveURL(/\/$/)
		expect((await context.cookies()).filter(c => c.name === 'payload-token')).toEqual([])
		expect(await existe('pros', compte.id)).toBe(false)
		expect(await existe('profils', profil.id)).toBe(false)
		expect(await existe('media', media.id)).toBe(false)
		expect(await lireUnObjet(`media/${media.filename}`)).toBeUndefined()
		expect(await lireUnObjet(`deleted/media/${media.filename}`)).toBeDefined()
		expect((await page.request.get(`/profil/${slug}`)).status()).toBe(404)

		await page.goto('/auth/profil')
		await expect(page).toHaveURL(/\/auth\/signin/)
		await page.getByLabel('Adresse email').fill(compte.email)
		await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
		await page.getByRole('button', { name: 'Se connecter' }).click()
		await expect(page.getByTestId('erreur-connexion')).toHaveText('Email ou mot de passe incorrect.')
		await expect(page).toHaveURL(/\/auth\/signin(\?|$)/)
	})

	test('Entrée maintenue : une seule suppression', async ({ context, page }) => {
		const { compte } = await maquilleuse(context)
		const envois: string[] = []
		page.on('request', requete => {
			if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/auth/profil') envois.push(requete.url())
		})
		await ouvrirLaFenetre(page)
		await champ(page).fill(MOT_DE_PASSE)

		await champ(page).focus()
		await page.keyboard.down('Enter')
		for (let i = 0; i < 5; i++) await page.keyboard.down('Enter')
		await page.keyboard.up('Enter')

		await expect(page).toHaveURL(/\/$/)
		expect(envois).toHaveLength(1)
		expect(await existe('pros', compte.id)).toBe(false)
	})
})
