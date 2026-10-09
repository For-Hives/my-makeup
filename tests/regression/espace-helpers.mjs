import { randomBytes, randomInt } from 'node:crypto'
import { expect } from '@playwright/test'
import sharp from 'sharp'
import { COMPTE_TEST } from './mock-api.mjs'
import { API, etat, piloter } from './outils-strapi.mjs'

const MO = 1024 * 1024

const dialogue = page => page.getByTestId('modal-panel')

async function remplir(page, valeurs) {
	for (const [cy, valeur] of Object.entries(valeurs)) {
		// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
		await dialogue(page).getByTestId(cy).fill(valeur)
	}
	await valeursDeLaModale(page, valeurs)
}

async function valeursDeLaModale(page, valeurs) {
	for (const [cy, valeur] of Object.entries(valeurs)) {
		// biome-ignore lint/performance/noAwaitInLoops: These steps intentionally run in order against shared server or browser state.
		await expect(dialogue(page).getByTestId(cy), cy).toHaveValue(valeur)
	}
}

async function sauver(page, cy) {
	await page.getByTestId(cy).click()
	await expect(dialogue(page)).toBeHidden()
}

const barreDeCompletion = page => page.getByTestId('completion-pourcentage-profil')

function erreursDeLaPage(page) {
	const erreurs = []
	page.on('pageerror', erreur => erreurs.push(erreur.message))
	return erreurs
}

const OFFRE_AVEC_OPTION = {
	name: 'Offre A',
	price: '100',
	description: 'Description de l’offre A',
	options: [{ name: 'Option 1', price: '10', description: 'Option de test' }],
}

const EXPERIENCE = (company, date_start) => ({
	company,
	job_name: 'Maquilleuse',
	city: 'Annecy',
	date_start,
	date_end: null,
	description: 'Expérience de test',
})

async function photoDeTelephone() {
	const largeur = 4000
	const hauteur = 3000
	const amplitude = 20
	const brut = Buffer.alloc(largeur * hauteur * 3)
	for (let y = 0; y < hauteur; y++) {
		for (let x = 0; x < largeur; x++) {
			const i = y * largeur + x
			const n = randomInt(-amplitude, amplitude + 1)
			const borne = v => Math.min(255, Math.max(0, v | 0))
			brut[i * 3] = borne((x * 255) / largeur + n)
			brut[i * 3 + 1] = borne((y * 255) / hauteur + n)
			brut[i * 3 + 2] = borne(128 + 60 * Math.sin(x / 90) * Math.cos(y / 70) + n)
		}
	}
	const buffer = await sharp(brut, {
		raw: { width: largeur, height: hauteur, channels: 3 },
	})
		.jpeg({ quality: 99 })
		.toBuffer()
	return { name: 'IMG_2040.JPG', mimeType: 'image/jpeg', buffer }
}

async function petitePng(background = { r: 200, g: 120, b: 160 }) {
	const buffer = await sharp({
		create: { width: 1200, height: 1200, channels: 3, background },
	})
		.png()
		.toBuffer()
	return { name: 'portrait.png', mimeType: 'image/png', buffer }
}

const AUTRE_COULEUR = { r: 90, g: 160, b: 210 }

async function petiteWebp(n) {
	const buffer = await sharp({
		create: {
			width: 900,
			height: 600,
			channels: 3,
			background: { r: (40 + 20 * n) % 256, g: 120, b: (200 - 15 * n) % 256 },
		},
	})
		.webp()
		.toBuffer()
	const nom = `${String(n + 1).padStart(3, '0')}-portfolio.webp`
	return { name: nom, mimeType: 'image/webp', buffer }
}

const apercuProfil = page => dialogue(page).getByAltText('photo de profil')

async function choisirPhotoProfil(page, photo) {
	const source = () => apercuProfil(page).evaluateAll(images => images[0]?.getAttribute('src') ?? '')
	const avant = await source()
	await page.getByTestId('file-main-upload').setInputFiles(photo)
	await expect
		.poll(async () => {
			const apres = await source()
			return apres.startsWith('blob:') && apres !== avant
		})
		.toBe(true)
	await expect(page.getByTestId('photo-error')).toHaveCount(0)
}

async function ajouterAuPortfolio(page, photo) {
	await page.getByTestId('file-upload-portefolio').setInputFiles(photo)
	await expect(page.getByTestId('portfolio-preview')).toBeVisible()
	await page.getByTestId('add-button-portefolio').click()
}

function corpsDesPatchs(page) {
	const corps = []
	page.on('request', requete => {
		if (requete.method() === 'PATCH' && new URL(requete.url()).pathname === '/api/me-makeup')
			corps.push(requete.postDataJSON())
	})
	return corps
}

const fichiersStockes = (n, proprietaire = null) => piloter('/__fichiers', { n, proprietaire })

const idsFichiers = async () => (await etat()).fichiers.map(f => f.id)

const balayer = () => piloter('/__balayer', {})

async function sauverAilleurs(champs) {
	const { jwt } = await (
		await fetch(`${API}/api/auth/local`, {
			method: 'POST',
			body: JSON.stringify({
				identifier: COMPTE_TEST.email,
				password: COMPTE_TEST.password,
			}),
		})
	).json()
	const reponse = await fetch(`${API}/api/me-makeup`, {
		method: 'PATCH',
		headers: { authorization: `Bearer ${jwt}` },
		body: JSON.stringify(champs),
	})
	expect(reponse.status).toBe(200)
}

const MESSAGE_PHOTO_REFUSEE =
	"Choisis à nouveau ta photo : elle n'a pas été acceptée, et tes modifications n'ont pas été enregistrées."

const MESSAGE_PHOTO_RETIREE =
	"Une de tes photos a été retirée depuis un autre onglet ou appareil : tes modifications n'ont pas été enregistrées. Recharge la page puis réessaie."

const HEIC = {
	name: 'IMG_0001.HEIC',
	mimeType: 'image/heic',
	buffer: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), randomBytes(3 * MO)]),
}

const photoTropLourde = () => ({
	name: 'enorme.jpg',
	mimeType: 'image/jpeg',
	buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(25 * MO - 3)]),
})

const MESSAGE_PHOTO_TROP_LOURDE = 'Cette photo pèse plus de 25 Mo : choisis-en une plus légère.'

const SPECIALITE_65 = 'Maquilleur professionnel et coiffeur professionnel pour le cinéma'

export {
	AUTRE_COULEUR,
	ajouterAuPortfolio,
	apercuProfil,
	balayer,
	barreDeCompletion,
	choisirPhotoProfil,
	corpsDesPatchs,
	dialogue,
	EXPERIENCE,
	erreursDeLaPage,
	fichiersStockes,
	HEIC,
	idsFichiers,
	MESSAGE_PHOTO_REFUSEE,
	MESSAGE_PHOTO_RETIREE,
	MESSAGE_PHOTO_TROP_LOURDE,
	MO,
	OFFRE_AVEC_OPTION,
	petitePng,
	petiteWebp,
	photoDeTelephone,
	photoTropLourde,
	remplir,
	SPECIALITE_65,
	sauver,
	sauverAilleurs,
	valeursDeLaModale,
}
