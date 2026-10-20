import { afterEach, describe, expect, test } from 'bun:test'
import type { Profile } from '@/payload-types'
import { creerCompte } from '../outils/fabrique-comptes'
import { payloadDeTest, viderLaBase } from '../outils/payload-test'
import { appelerRest } from '../outils/rest'

/**
 * The networks and the contact details of a profile, and the trace of the consent to show them
 * (ticket 042; plan 02 §7.3, I01 and I07; U59 through the real API).
 */

afterEach(viderLaBase)

/** Made up: a number of the range kept for fiction, an address on a reserved domain. */
const COORDONNEES = { phone: '06 39 98 12 34', email: 'contact-fictif@example.test' }
const RESEAUX = {
	youtube: 'https://example.test/youtube/fictive',
	facebook: null,
	instagram: 'https://example.test/instagram/fictive',
	website: 'https://example.test',
	linkedin: null,
}

/** A makeup artist whose profile is published, with her networks and contact details, shown or not. */
async function maquilleusePubliee(publicContact: boolean) {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('La fabrique n’a pas créé de profil.')
	await payload.update({ collection: 'profiles', id: profil.id, data: { status: 'published' } })
	const { statut } = await appelerRest('PATCH', `/api/profiles/${profil.id}`, {
		enTetes: compte.session.enTetes,
		corps: { networks: RESEAUX, contactDetails: COORDONNEES, publicContact },
	})
	if (statut !== 200) throw new Error(`Le profil n’a pas été rempli : ${statut}.`)
	return { compte, id: profil.id }
}

/** The profile as the database holds it, read without access control. */
async function stocke(id: number): Promise<Profile> {
	const payload = await payloadDeTest()
	return payload.findByID({ collection: 'profiles', id, depth: 0 })
}

/** Everything that says how to reach her, or that she chose to be reached. */
const FERME = ['contactDetails', 'publicContact', 'consentedAt', 'consentSource']

/**
 * The messages of the fields a 400 refuses, in French. Payload wraps them in a general message of its
 * own, in French too (« Le champ suivant n’est pas valide : … »): Payload speaks French only
 * (src/lib/payload-language.ts, ticket 221; tests/integration/payload-francais.test.ts).
 */
const messagesDesChamps = (corps: unknown): string[] =>
	(corps as { errors: { data?: { errors?: { message: string }[] } }[] }).errors
		.flatMap(({ data }) => data?.errors ?? [])
		.map(({ message }) => message)

describe('Lecture REST anonyme : réseaux lus, coordonnées absentes même avec contactPublic vrai (I01)', () => {
	test('lue seule et en liste, la réponse a les réseaux et rien des coordonnées', async () => {
		const { id } = await maquilleusePubliee(true)
		expect((await stocke(id)).publicContact).toBe(true)

		for (const chemin of [`/api/profiles/${id}?depth=0`, '/api/profiles?depth=0']) {
			const { statut, corps, texte } = await appelerRest('GET', chemin)
			expect(statut).toBe(200)
			const document = ('docs' in (corps as object) ? (corps as { docs: object[] }).docs[0] : corps) as object
			expect(document).toMatchObject({ networks: RESEAUX })
			for (const cle of FERME) expect(document).not.toHaveProperty(cle)
			expect(texte).not.toContain(COORDONNEES.email)
			expect(texte).not.toContain('39 98')
		}
	})

	test('la propriétaire lit ses coordonnées, son choix et la trace du consentement', async () => {
		const { compte, id } = await maquilleusePubliee(true)

		const { corps } = await appelerRest('GET', `/api/profiles/${id}?depth=0`, { enTetes: compte.session.enTetes })

		expect(corps).toMatchObject({ contactDetails: COORDONNEES, publicContact: true, consentSource: 'artist' })
		expect((corps as Profile).consentedAt).toBeString()
	})
})

describe('Un compte redaction est refusé sur les coordonnées (I07, U59)', () => {
	test('il lit le profil publié sans les coordonnées, et ne peut pas les écrire', async () => {
		const { id } = await maquilleusePubliee(true)
		const redaction = await creerCompte('redaction')

		const lecture = await appelerRest('GET', `/api/profiles/${id}?depth=0`, { enTetes: redaction.session.enTetes })
		const ecriture = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: redaction.session.enTetes,
			corps: { contactDetails: { phone: '06 39 98 00 00', email: 'autre@example.test' } },
		})

		expect(lecture.statut).toBe(200)
		for (const cle of FERME) expect(lecture.corps).not.toHaveProperty(cle)
		expect(ecriture.statut).toBe(403)
		expect((await stocke(id)).contactDetails).toEqual(COORDONNEES)
	})
})

describe('Activer contactPublic pose la date du serveur ; la maquilleuse ne peut pas l’écrire', () => {
	test('la date est celle de la sauvegarde, la source celle du compte ; ce qu’elle envoie est ignoré', async () => {
		const { compte, id } = await maquilleusePubliee(false)
		expect(await stocke(id)).toMatchObject({ publicContact: false, consentedAt: null, consentSource: null })

		const avant = Date.now()
		const activation = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { publicContact: true, consentedAt: '2020-01-01T00:00:00.000Z', consentSource: 'import' },
		})
		const apres = Date.now()

		expect(activation.statut).toBe(200)
		const active = await stocke(id)
		expect(active.consentSource).toBe('artist')
		const date = Date.parse(active.consentedAt ?? '')
		expect(date).toBeGreaterThanOrEqual(avant - 1000)
		expect(date).toBeLessThanOrEqual(apres + 1000)

		// A later save that sends another date changes nothing of the trace.
		await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { firstName: 'Autre Prénom', consentedAt: '2021-01-01T00:00:00.000Z', consentSource: 'admin' },
		})
		expect(await stocke(id)).toMatchObject({
			firstName: 'Autre Prénom',
			consentedAt: active.consentedAt,
			consentSource: 'artist',
		})

		// Switched off: no consent left.
		await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { publicContact: false },
		})
		expect(await stocke(id)).toMatchObject({ publicContact: false, consentedAt: null, consentSource: null })
	})

	test('activé par un admin : la source « admin »', async () => {
		const { id } = await maquilleusePubliee(false)
		const admin = await creerCompte('admin')

		const { statut } = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: admin.session.enTetes,
			corps: { publicContact: true, consentSource: 'artist' },
		})

		expect(statut).toBe(200)
		expect((await stocke(id)).consentSource).toBe('admin')
	})

	test('l’import, sans compte, garde la date de la bascule et sa source', async () => {
		const compte = await creerCompte('maquilleuse')
		const payload = await payloadDeTest()
		const [profil] = (await payload.find({ collection: 'profiles', where: { pro: { equals: compte.id } } })).docs
		const bascule = '2027-02-01T06:00:00.000Z'

		await payload.update({
			collection: 'profiles',
			id: profil?.id ?? -1,
			data: { publicContact: true, consentedAt: bascule, consentSource: 'import' },
		})

		expect(await stocke(profil?.id ?? -1)).toMatchObject({ consentedAt: bascule, consentSource: 'import' })
	})
})

describe('Un groupe envoyé à null vaut un groupe vide, jamais un 500 (ticket 224)', () => {
	test.each([
		['reseaux', { networks: null }],
		['coordonnees', { contactDetails: null }],
		['les deux', { networks: null, contactDetails: null }],
	])('%s à null, par REST : 200 et le groupe est vidé', async (_cas, corps) => {
		const { compte, id } = await maquilleusePubliee(false)

		const reponse = await appelerRest('PATCH', `/api/profiles/${id}`, { enTetes: compte.session.enTetes, corps })

		expect(reponse.statut).toBe(200)
		const profil = await stocke(id)
		if ('reseaux' in corps) expect(Object.values(profil.networks ?? {}).filter(Boolean)).toEqual([])
		if ('coordonnees' in corps) expect(Object.values(profil.contactDetails ?? {}).filter(Boolean)).toEqual([])
	})

	test('par l’API locale aussi', async () => {
		const { id } = await maquilleusePubliee(false)
		const payload = await payloadDeTest()

		await payload.update({
			collection: 'profiles',
			id,
			data: { networks: null, contactDetails: null } as never,
			overrideAccess: true,
		})

		const profil = await stocke(id)
		expect(Object.values(profil.networks ?? {}).filter(Boolean)).toEqual([])
		expect(Object.values(profil.contactDetails ?? {}).filter(Boolean)).toEqual([])
	})
})

describe('Téléphone de plus de 20 caractères ou email mal formé : refus en français', () => {
	test.each([
		[
			'un téléphone de 21 caractères',
			{ phone: '0'.repeat(21) },
			'Le numéro de téléphone ne doit pas dépasser 20 caractères.',
		],
		['un email mal formé', { email: 'contact-sans-arobase.example.test' }, 'Veuillez entrer un email valide.'],
	])('%s : 400, le message du champ, rien d’écrit', async (_cas, coordonnees, message) => {
		const { compte, id } = await maquilleusePubliee(false)

		const { statut, corps } = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { contactDetails: { ...COORDONNEES, ...coordonnees } },
		})

		expect(statut).toBe(400)
		expect(messagesDesChamps(corps)).toEqual([message])
		expect((await stocke(id)).contactDetails).toEqual(COORDONNEES)
	})
})

describe('Un lien de réseau ne nomme que http ou https : la page publique en fait un lien', () => {
	test.each([
		['instagram', 'javascript:alert(document.cookie)'],
		['website', 'data:text/html,<script>alert(1)</script>'],
		['facebook', ' JavaScript:alert(1)'],
	])('%s = %s : 400, le message du champ, rien d’écrit', async (reseau, lien) => {
		const { compte, id } = await maquilleusePubliee(false)

		const { statut, corps } = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { networks: { ...RESEAUX, [reseau]: lien } },
		})

		expect(statut).toBe(400)
		expect(messagesDesChamps(corps)).toEqual(['Ce lien doit commencer par http:// ou https://.'])
		expect((await stocke(id)).networks).toEqual(RESEAUX)
	})

	test('un lien sans protocole, comme un pseudo, reste accepté', async () => {
		const { compte, id } = await maquilleusePubliee(false)
		const reseaux = { ...RESEAUX, instagram: '@pseudo_fictif', website: 'www.example.test' }

		const { statut } = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: compte.session.enTetes,
			corps: { networks: reseaux },
		})

		expect(statut).toBe(200)
		expect((await stocke(id)).networks).toEqual(reseaux)
	})
})
