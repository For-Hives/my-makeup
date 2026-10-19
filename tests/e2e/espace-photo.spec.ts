import { expect, type Page, test } from '@playwright/test'
import { MESSAGES_PHOTO } from '@/lib/espace/photo'
import { violationsGraves } from '../outils/axe'
import { type CompteDeTest, creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest } from '../outils/payload-test'
import { photoDeHuitMo } from '../outils/photo-de-8-mo'
import { fichierPourPayload } from '../outils/photos'
import { lireUnObjet } from '../outils/s3'

/**
 * The main photo in her space (ticket 134; plan 02 E36, I24, U03): reduced in the browser before
 * it leaves, sent only at « Enregistrer », replaced with the former one in the bin, refused with a
 * message before anything is sent. A photo of 8 MiB is made up for the test (tests/outils/photo-de-8-mo.ts).
 *
 * The brake of the sign-in counts by client address: each test sends its own made-up address.
 */

/**
 * A commune of the official list, far from the cities the search specs look at (Annecy, Nantes,
 * Annemasse…): the city a profile needs to be active, without crowding their lists.
 */
const VILLE = { nom: 'Lille', codeInsee: '59350' } as const

/** The accounts a test made: their active, published profiles would crowd the lists of the search specs. */
const creees: number[] = []

test.afterEach(async () => {
	const payload = await payloadDeTest()
	for (const compte of creees.splice(0)) {
		const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte } } })
		for (const { id } of docs) await payload.delete({ collection: 'profiles', id }).catch(() => undefined)
		await payload.delete({ collection: 'pros', id: compte }).catch(() => undefined)
	}
})

let compteur = 0
test.beforeEach(({ context }) =>
	context.setExtraHTTPHeaders({ 'x-forwarded-for': `192.0.2.${100 + (++compteur % 50)}` })
)

type Maquilleuse = CompteDeTest<'maquilleuse'>

/** A makeup artist whose profile is published, with or without a photo already (a former one). */
async function maquilleuse(
	context: { addCookies: (c: Maquilleuse['session']['cookies']) => Promise<void> },
	avecPhoto = false
): Promise<{ compte: Maquilleuse; ancienne: number | null; slug: string }> {
	const compte = await creerCompte('maquilleuse')
	creees.push(Number(compte.id))
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const [fiche] = docs
	if (!fiche) throw new Error('pas de profil')
	let ancienne: number | null = null
	if (avecPhoto) {
		const media = await payload.create({
			collection: 'media',
			data: { owner: Number(compte.id), alt: 'Photo principale' },
			file: fichierPourPayload(),
		})
		ancienne = media.id
	}
	const profil = await payload.update({
		collection: 'profiles',
		id: fiche.id,
		data: {
			prenom: 'Léa',
			nom: 'Fictive',
			specialite: 'Mariée',
			commune: VILLE,
			...(ancienne === null ? {} : { photoPrincipale: ancienne }),
		},
	})
	await context.addCookies(compte.session.cookies)
	return { compte, ancienne, slug: profil.slug ?? '' }
}

async function profilStocke(compte: Maquilleuse) {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } })
	const profil = docs[0]
	if (!profil) throw new Error('pas de profil')
	return profil
}

/** The media of this account only: the two projects share the bench and run side by side. */
const nombreDeMedias = async (compte: Maquilleuse) =>
	(await (await payloadDeTest()).count({ collection: 'media', where: { owner: { equals: compte.id } } })).totalDocs
const modifier = (page: Page) => page.getByRole('button', { name: 'Modifier ma photo principale' })
const dialogue = (page: Page) => page.getByRole('dialog', { name: 'Modifier ma photo principale' })

async function ouvrir(page: Page) {
	if (test.info().project.name === 'mobile') await modifier(page).tap()
	else await modifier(page).click()
	await expect(dialogue(page)).toBeVisible()
}

/** The requests that send a photo to the server. */
function envois(page: Page): string[] {
	const liste: string[] = []
	page.on('request', requete => {
		if (requete.method() === 'POST' && new URL(requete.url()).pathname === '/api/media') liste.push(requete.url())
	})
	return liste
}

test.describe('134 : la photo principale', { tag: '@mobile' }, () => {
	test('E36 : une photo de 8 Mo est réduite avant l’envoi, enregistrée, visible après rechargement et sur le profil public', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte, slug } = await maquilleuse(context)
		const original = await photoDeHuitMo()
		expect(original.length).toBeGreaterThan(7.5 * 1024 * 1024)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page
			.getByLabel('Choisir une photo')
			.setInputFiles({ name: 'grosse.jpg', mimeType: 'image/jpeg', buffer: original })
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		expect(await violationsGraves(page)).toEqual([])
		const envoyes = envois(page)
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })
		await expect(page.getByRole('status').filter({ hasText: 'Ta photo principale est enregistrée.' })).toBeVisible()
		await expect(modifier(page)).toBeFocused()
		expect(envoyes).toHaveLength(1)

		// The object is the reduced file, under 1 MiB, though the server would have taken 8 MiB.
		const profil = await profilStocke(compte)
		expect(profil.actif).toBe(true)
		const payload = await payloadDeTest()
		const media = await payload.findByID({ collection: 'media', id: Number(profil.photoPrincipale), depth: 0 })
		expect(media.filesize ?? 0).toBeGreaterThan(0)
		expect(media.filesize ?? Number.POSITIVE_INFINITY).toBeLessThan(1024 * 1024)
		const objet = await lireUnObjet(`media/${media.filename}`)
		expect(objet?.octets.length ?? Number.POSITIVE_INFINITY).toBeLessThan(1024 * 1024)
		expect(Math.max(media.width ?? 0, media.height ?? 0)).toBeLessThanOrEqual(2000)

		await page.reload()
		await expect(page.getByTestId('carte-photo')).toContainText('Photo ajoutée')
		await ouvrir(page)
		await expect(page.getByRole('img', { name: 'Ta photo principale actuelle' })).toBeVisible()
		await page.keyboard.press('Escape')

		await page.goto(`/profil/${slug}`)
		const photo = page.getByRole('img', { name: /^Photo de / }).first()
		await expect(photo).toBeVisible()
		expect(await photo.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

		const dossier = process.env.CAPTURES_ESPACE
		if (dossier) await page.screenshot({ path: `${dossier}/photo-${test.info().project.name}.png` })
	})

	test('fermer sans valider n’envoie rien : aucun objet, aucun média', async ({ context, page }) => {
		const { compte } = await maquilleuse(context)
		const envoyes = envois(page)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByLabel('Choisir une photo').setInputFiles({
			name: 'a.jpg',
			mimeType: 'image/jpeg',
			buffer: await photoDeHuitMo(),
		})
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		await page.getByRole('button', { name: 'Fermer' }).click()
		await page.getByRole('button', { name: 'Abandonner mes modifications' }).click()

		await expect(dialogue(page)).toHaveCount(0)
		expect(envoyes).toHaveLength(0)
		expect(await nombreDeMedias(compte)).toBe(0)
		expect((await profilStocke(compte)).photoPrincipale ?? null).toBeNull()
	})

	test('I24 : remplacer la photo : l’ancien objet part en corbeille, la nouvelle est celle du profil', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte, ancienne } = await maquilleuse(context, true)
		const payload = await payloadDeTest()
		const vieille = await payload.findByID({ collection: 'media', id: Number(ancienne), depth: 0 })
		const cleAncienne = `media/${vieille.filename}`
		const octetsAvant = (await lireUnObjet(cleAncienne))?.octets
		expect(octetsAvant).toBeDefined()
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByLabel('Choisir une autre photo').setInputFiles({
			name: 'nouvelle.jpg',
			mimeType: 'image/jpeg',
			buffer: await photoDeHuitMo(),
		})
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		await page.getByRole('button', { name: 'Enregistrer' }).click()
		await expect(dialogue(page)).toHaveCount(0, { timeout: 60_000 })

		const profil = await profilStocke(compte)
		expect(profil.photoPrincipale).not.toBe(ancienne)
		expect(await lireUnObjet(cleAncienne)).toBeUndefined()
		expect((await lireUnObjet(`deleted/${cleAncienne}`))?.octets).toEqual(octetsAvant)
		expect(
			await payload.findByID({ collection: 'media', id: Number(ancienne), depth: 0, disableErrors: true })
		).toBeNull()
	})

	test('E36 : un PDF est refusé avec son message, avant tout envoi', async ({ context, page }) => {
		const { compte } = await maquilleuse(context)
		const envoyes = envois(page)
		await page.goto('/auth/profil')
		await ouvrir(page)

		await page.getByLabel('Choisir une photo').setInputFiles({
			name: 'cv.pdf',
			mimeType: 'application/pdf',
			buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'),
		})

		await expect(page.getByRole('alert').filter({ hasText: MESSAGES_PHOTO.type })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
		expect(envoyes).toHaveLength(0)
		expect(await nombreDeMedias(compte)).toBe(0)
		expect((await profilStocke(compte)).photoPrincipale ?? null).toBeNull()
	})

	test('U03 : coupure pendant l’envoi : l’ancienne photo reste en place, le profil reste actif', async ({
		context,
		page,
	}) => {
		test.setTimeout(120_000)
		const { compte, ancienne } = await maquilleuse(context, true)
		await page.goto('/auth/profil')
		await ouvrir(page)
		await page.route('**/api/media*', route => (route.request().method() === 'POST' ? route.abort() : route.continue()))

		await page.getByLabel('Choisir une autre photo').setInputFiles({
			name: 'nouvelle.jpg',
			mimeType: 'image/jpeg',
			buffer: await photoDeHuitMo(),
		})
		await expect(page.getByRole('img', { name: 'Aperçu de la photo choisie' })).toBeVisible({ timeout: 60_000 })
		await page.getByRole('button', { name: 'Enregistrer' }).click()

		await expect(page.getByRole('alert').filter({ hasText: MESSAGES_PHOTO['envoi-impossible'] })).toBeVisible()
		await expect(dialogue(page)).toBeVisible()
		const profil = await profilStocke(compte)
		expect(profil.photoPrincipale).toBe(ancienne)
		expect(profil.actif).toBe(true)
		expect(await nombreDeMedias(compte)).toBe(1)
	})
})
