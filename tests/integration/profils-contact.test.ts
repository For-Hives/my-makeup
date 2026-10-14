import { afterEach, describe, expect, test } from 'bun:test'
import type { Profil } from '@/payload-types'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The networks and the contact details of a profile, and the trace of the consent to show them
 * (ticket 042; plan 02 §7.3, I01 and I07; U59 through the real API).
 */

afterEach(viderLaBase)

/** Made up: a number of the range kept for fiction, an address on a reserved domain. */
const COORDONNEES = { telephone: '06 39 98 12 34', email: 'contact-fictif@example.test' }
const RESEAUX = {
	youtube: 'https://example.test/youtube/fictive',
	facebook: null,
	instagram: 'https://example.test/instagram/fictive',
	siteWeb: 'https://example.test',
	linkedin: null,
}

/** A makeup artist whose profile is published, with her networks and contact details, shown or not. */
async function maquilleusePubliee(contactPublic: boolean) {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profils', depth: 0, where: { pro: { equals: compte.id } } })).docs
	if (!profil) throw new Error('La fabrique n’a pas créé de profil.')
	await payload.update({ collection: 'profils', id: profil.id, data: { statut: 'publie' } })
	const { statut } = await appelerRest('PATCH', `/api/profils/${profil.id}`, {
		enTetes: compte.session.enTetes,
		corps: { reseaux: RESEAUX, coordonnees: COORDONNEES, contactPublic },
	})
	if (statut !== 200) throw new Error(`Le profil n’a pas été rempli : ${statut}.`)
	return { compte, id: profil.id }
}

/** The profile as the database holds it, read without access control. */
async function stocke(id: number): Promise<Profil> {
	const payload = await payloadDeTest()
	return payload.findByID({ collection: 'profils', id, depth: 0 })
}

/** Everything that says how to reach her, or that she chose to be reached. */
const FERME = ['coordonnees', 'contactPublic', 'consentiLe', 'sourceConsentement']

/**
 * The messages of the fields a 400 refuses, in French. Payload wraps them in a general message of its
 * own, in English (« The following field is invalid: … »): Payload's own language is still the default.
 */
const messagesDesChamps = (corps: unknown): string[] =>
	(corps as { errors: { data?: { errors?: { message: string }[] } }[] }).errors
		.flatMap(({ data }) => data?.errors ?? [])
		.map(({ message }) => message)

describe('Lecture REST anonyme : réseaux lus, coordonnées absentes même avec contactPublic vrai (I01)', () => {
	test('lue seule et en liste, la réponse a les réseaux et rien des coordonnées', async () => {
		const { id } = await maquilleusePubliee(true)
		expect((await stocke(id)).contactPublic).toBe(true)

		for (const chemin of [`/api/profils/${id}?depth=0`, '/api/profils?depth=0']) {
			const { statut, corps, texte } = await appelerRest('GET', chemin)
			expect(statut).toBe(200)
			const document = ('docs' in (corps as object) ? (corps as { docs: object[] }).docs[0] : corps) as object
			expect(document).toMatchObject({ reseaux: RESEAUX })
			for (const cle of FERME) expect(document).not.toHaveProperty(cle)
			expect(texte).not.toContain(COORDONNEES.email)
			expect(texte).not.toContain('39 98')
		}
	})

	test('la propriétaire lit ses coordonnées, son choix et la trace du consentement', async () => {
		const { compte, id } = await maquilleusePubliee(true)

		const { corps } = await appelerRest('GET', `/api/profils/${id}?depth=0`, { enTetes: compte.session.enTetes })

		expect(corps).toMatchObject({ coordonnees: COORDONNEES, contactPublic: true, sourceConsentement: 'maquilleuse' })
		expect((corps as Profil).consentiLe).toBeString()
	})
})

describe('Un compte redaction est refusé sur les coordonnées (I07, U59)', () => {
	test('il lit le profil publié sans les coordonnées, et ne peut pas les écrire', async () => {
		const { id } = await maquilleusePubliee(true)
		const redaction = await creerCompte('redaction')

		const lecture = await appelerRest('GET', `/api/profils/${id}?depth=0`, { enTetes: redaction.session.enTetes })
		const ecriture = await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: redaction.session.enTetes,
			corps: { coordonnees: { telephone: '06 39 98 00 00', email: 'autre@example.test' } },
		})

		expect(lecture.statut).toBe(200)
		for (const cle of FERME) expect(lecture.corps).not.toHaveProperty(cle)
		expect(ecriture.statut).toBe(403)
		expect((await stocke(id)).coordonnees).toEqual(COORDONNEES)
	})
})

describe('Activer contactPublic pose la date du serveur ; la maquilleuse ne peut pas l’écrire', () => {
	test('la date est celle de la sauvegarde, la source celle du compte ; ce qu’elle envoie est ignoré', async () => {
		const { compte, id } = await maquilleusePubliee(false)
		expect(await stocke(id)).toMatchObject({ contactPublic: false, consentiLe: null, sourceConsentement: null })

		const avant = Date.now()
		const activation = await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { contactPublic: true, consentiLe: '2020-01-01T00:00:00.000Z', sourceConsentement: 'import' },
		})
		const apres = Date.now()

		expect(activation.statut).toBe(200)
		const active = await stocke(id)
		expect(active.sourceConsentement).toBe('maquilleuse')
		const date = Date.parse(active.consentiLe ?? '')
		expect(date).toBeGreaterThanOrEqual(avant - 1000)
		expect(date).toBeLessThanOrEqual(apres + 1000)

		// A later save that sends another date changes nothing of the trace.
		await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { prenom: 'Autre Prénom', consentiLe: '2021-01-01T00:00:00.000Z', sourceConsentement: 'admin' },
		})
		expect(await stocke(id)).toMatchObject({
			prenom: 'Autre Prénom',
			consentiLe: active.consentiLe,
			sourceConsentement: 'maquilleuse',
		})

		// Switched off: no consent left.
		await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { contactPublic: false },
		})
		expect(await stocke(id)).toMatchObject({ contactPublic: false, consentiLe: null, sourceConsentement: null })
	})

	test('activé par un admin : la source « admin »', async () => {
		const { id } = await maquilleusePubliee(false)
		const admin = await creerCompte('admin')

		const { statut } = await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: admin.session.enTetes,
			corps: { contactPublic: true, sourceConsentement: 'maquilleuse' },
		})

		expect(statut).toBe(200)
		expect((await stocke(id)).sourceConsentement).toBe('admin')
	})

	test('l’import, sans compte, garde la date de la bascule et sa source', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const [profil] = (await payload.find({ collection: 'profils', where: { pro: { equals: compte.id } } })).docs
		const bascule = '2027-02-01T06:00:00.000Z'

		await payload.update({
			collection: 'profils',
			id: profil?.id ?? -1,
			data: { contactPublic: true, consentiLe: bascule, sourceConsentement: 'import' },
		})

		expect(await stocke(profil?.id ?? -1)).toMatchObject({ consentiLe: bascule, sourceConsentement: 'import' })
	})
})

describe('Téléphone de plus de 20 caractères ou email mal formé : refus en français', () => {
	test.each([
		[
			'un téléphone de 21 caractères',
			{ telephone: '0'.repeat(21) },
			'Le numéro de téléphone ne doit pas dépasser 20 caractères.',
		],
		['un email mal formé', { email: 'contact-sans-arobase.example.test' }, 'Veuillez entrer un email valide.'],
	])('%s : 400, le message du champ, rien d’écrit', async (_cas, coordonnees, message) => {
		const { compte, id } = await maquilleusePubliee(false)

		const { statut, corps } = await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { coordonnees: { ...COORDONNEES, ...coordonnees } },
		})

		expect(statut).toBe(400)
		expect(messagesDesChamps(corps)).toEqual([message])
		expect((await stocke(id)).coordonnees).toEqual(COORDONNEES)
	})
})

describe('Un lien de réseau ne nomme que http ou https : la page publique en fait un lien', () => {
	test.each([
		['instagram', 'javascript:alert(document.cookie)'],
		['siteWeb', 'data:text/html,<script>alert(1)</script>'],
		['facebook', ' JavaScript:alert(1)'],
	])('%s = %s : 400, le message du champ, rien d’écrit', async (reseau, lien) => {
		const { compte, id } = await maquilleusePubliee(false)

		const { statut, corps } = await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { reseaux: { ...RESEAUX, [reseau]: lien } },
		})

		expect(statut).toBe(400)
		expect(messagesDesChamps(corps)).toEqual(['Ce lien doit commencer par http:// ou https://.'])
		expect((await stocke(id)).reseaux).toEqual(RESEAUX)
	})

	test('un lien sans protocole, comme un pseudo, reste accepté', async () => {
		const { compte, id } = await maquilleusePubliee(false)
		const reseaux = { ...RESEAUX, instagram: '@pseudo_fictif', siteWeb: 'www.example.test' }

		const { statut } = await appelerRest('PATCH', `/api/profils/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { reseaux },
		})

		expect(statut).toBe(200)
		expect((await stocke(id)).reseaux).toEqual(reseaux)
	})
})
