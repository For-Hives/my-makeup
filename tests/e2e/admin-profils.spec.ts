import { expect, test } from '@playwright/test'
import { lirePhotoDuJeu, poserLeProfil } from '../../src/jeu-fictif/chargement'
import { PROFILS_DU_JEU, type ProfilDuJeu } from '../../src/jeu-fictif/profils'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'

/**
 * E53 and E56 without the journal (plan 02 §7.4; tickets 165 and 166): the admin opens every
 * collection of the panel without a console error or a 500, finds profiles with the filters of the
 * list, hides one from its sheet and the public page answers 404 within a minute; publishing it
 * again brings it back. Large screen only: the bench is shared, so the test counts what belongs to
 * the set of the bench, never a total.
 */

const COLLECTIONS = ['admins', 'pros', 'profils', 'media', 'articles', 'talents', 'demandes', 'auth-evenements', 'comptes-supprimes']
const UNE_MINUTE = 60_000

/** A profile of its own, of one of the types of the fictional set, under a name no other test reads. */
async function poserUnProfil(cle: string, suffixe: string) {
	const modele = PROFILS_DU_JEU.find(autre => autre.cle === cle)
	if (!modele) throw new Error(`Le profil type « ${cle} » du jeu fictif manque.`)
	const type: ProfilDuJeu = {
		...modele,
		cle: `essai-admin-${cle}-${suffixe}`,
		compte: { email: `essai-admin-${cle}-${suffixe}@example.test`, nom: `Essai Admin ${suffixe} ${cle}` },
		photos: { principale: modele.photos.principale, galerie: [] },
	}
	const pose = await poserLeProfil(await payloadDeTest(), type, lirePhotoDuJeu, false)
	return { id: pose.profil, pro: pose.compte, slug: pose.slug }
}

/** Takes the profiles of a test away, with their accounts and photos. */
async function retirer(suffixe: string): Promise<void> {
	const payload = await payloadDeTest()
	const comptes = await payload.find({
		collection: 'pros',
		depth: 0,
		limit: 50,
		pagination: false,
		where: { email: { like: `essai-admin-` } },
	})
	for (const { id, email } of comptes.docs) {
		if (!email.includes(`-${suffixe}@`)) continue
		await payload.delete({ collection: 'media', where: { owner: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'profils', where: { pro: { equals: id } } }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id }).catch(() => undefined)
	}
}

/** The cookies of the session of a made-up admin. */
async function sessionDAdmin() {
	return (await creerCompte('admin')).session.cookies
}

const unSuffixe = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`

test.describe('L’admin retrouve, corrige et masque un profil', () => {
	test('E53 : chaque collection s’ouvre sans erreur ; la liste des profils se filtre', async ({ context, page }) => {
		test.setTimeout(180_000)
		const suffixe = unSuffixe()
		await context.addCookies(await sessionDAdmin())
		try {
			// A reference profile (publishable), an empty one and one active but not publishable.
			await Promise.all(['reference', 'vide', 'actif-non-publiable'].map(cle => poserUnProfil(cle, suffixe)))
			const siens = `where[and][1][pro.email][like]=-${suffixe}@`

			const erreurs: string[] = []
			page.on('console', message => {
				if (message.type() === 'error') erreurs.push(message.text())
			})
			page.on('response', reponse => {
				if (reponse.status() >= 500) erreurs.push(`${reponse.status()} ${reponse.url()}`)
			})

			for (const collection of COLLECTIONS) {
				const reponse = await page.goto(`/admin/collections/${collection}`)
				expect(reponse?.status(), collection).toBeLessThan(500)
				await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
				await expect(
					page.locator('.collection-list, .table, tbody, .collection-list__no-results').first()
				).toBeVisible()
			}

			// The columns of the list: the address, the commune, the completeness, publishable, the status.
			await page.goto(`/admin/collections/profils?limit=100&where[and][0][statut][exists]=true&${siens}`)
			const entete = page.locator('thead')
			for (const colonne of ['Adresse du profil', 'Commune', 'Complétude', 'Publiable', 'Statut'])
				await expect(entete).toContainText(colonne)
			await expect(page.locator('tbody tr')).toHaveCount(3)

			// The filters of the panel, as its address holds them.
			const filtre = (champ: string, valeur: string) =>
				`/admin/collections/profils?limit=100&where[and][0][${champ}][equals]=${valeur}&${siens}`
			await page.goto(filtre('publiable', 'false'))
			await expect(page.locator('tbody tr')).toHaveCount(2)
			await page.goto(filtre('entierementVide', 'true'))
			await expect(page.locator('tbody tr')).toHaveCount(1)
			await page.goto(filtre('statut', 'publie'))
			await expect(page.locator('tbody tr')).toHaveCount(2)
			await page.goto(filtre('statut', 'brouillon'))
			await expect(page.locator('tbody tr')).toHaveCount(1)

			expect(erreurs).toEqual([])
		} finally {
			await retirer(suffixe)
		}
	})

	test('E56 : masquer depuis la fiche donne un 404 public en moins d’une minute, republier le remet en ligne', async ({
		context,
		page,
		request,
	}) => {
		test.setTimeout(150_000)
		const suffixe = unSuffixe()
		const payload = await payloadDeTest()
		await context.addCookies(await sessionDAdmin())
		const profil = await poserUnProfil('reference', suffixe)
		const slug = profil.slug
		const statutDeLaPage = async () => (await request.get(`/profil/${slug}`)).status()
		const enregistrerAvec = async (choix: string) => {
			await page.goto(`/admin/collections/profils/${profil.id}`)
			// The form hydrates after it shows: a click that comes too early opens nothing, so it is made again.
			await expect(async () => {
				await page.locator('#field-statutChoisi .rs__control').click()
				await page.getByRole('option', { name: choix }).first().click({ timeout: 2_000 })
			}).toPass({ timeout: 20_000 })
			await page.locator('#action-save').click()
			await expect(page.getByText('Mis à jour avec succès').first()).toBeVisible()
		}

		try {
			expect(await statutDeLaPage()).toBe(200)
			await enregistrerAvec('Masqué')
			await expect.poll(statutDeLaPage, { timeout: UNE_MINUTE }).toBe(404)
			expect((await payload.findByID({ collection: 'profils', id: profil.id, depth: 0 })).statut).toBe('masque')

			await enregistrerAvec('Automatique')
			await expect.poll(statutDeLaPage, { timeout: UNE_MINUTE }).toBe(200)
			const sitemap = await (await request.get('/sitemap.xml')).text()
			expect(sitemap).toContain(`/profil/${slug}`)
		} finally {
			await retirer(suffixe)
		}
	})
})
