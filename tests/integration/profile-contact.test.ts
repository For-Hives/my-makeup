import { afterEach, describe, expect, test } from 'bun:test'
import type { Profile } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * The networks and the contact details of a profile, and the trace of the consent to show them
 * (ticket 042; plan 02 §7.3, I01 and I07; U59 through the real API).
 */

afterEach(emptyBase)

/** Made up: a number of the range kept for fiction, an address on a reserved domain. */
const CONTACT_DETAILS = { phone: '06 39 98 12 34', email: 'contact-fictif@example.test' }
const NETWORKS = {
	youtube: 'https://example.test/youtube/fictive',
	facebook: null,
	instagram: 'https://example.test/instagram/fictive',
	website: 'https://example.test',
	linkedin: null,
}

/** A makeup artist whose profile is published, with her networks and contact details, shown or not. */
async function publishedArtist(publicContact: boolean) {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }))
		.docs
	if (!profile) throw new Error('La fabrique n’a pas créé de profil.')
	await payload.update({ collection: 'profiles', id: profile.id, data: { status: 'published' } })
	const { statut: status } = await callRest('PATCH', `/api/profiles/${profile.id}`, {
		enTetes: account.session.enTetes,
		corps: { networks: NETWORKS, contactDetails: CONTACT_DETAILS, publicContact },
	})
	if (status !== 200) throw new Error(`Le profil n’a pas été rempli : ${status}.`)
	return { compte: account, id: profile.id }
}

/** The profile as the database holds it, read without access control. */
async function stored(id: number): Promise<Profile> {
	const payload = await testPayload()
	return payload.findByID({ collection: 'profiles', id, depth: 0 })
}

/** Everything that says how to reach her, or that she chose to be reached. */
const CLOSED = ['contactDetails', 'publicContact', 'consentedAt', 'consentSource']

/**
 * The messages of the fields a 400 refuses, in French. Payload wraps them in a general message of its
 * own, in French too (« Le champ suivant n’est pas valide : … »): Payload speaks French only
 * (src/lib/payload-language.ts, ticket 221; tests/integration/payload-french.test.ts).
 */
const fieldsMessages = (corps: unknown): string[] =>
	(corps as { errors: { data?: { errors?: { message: string }[] } }[] }).errors
		.flatMap(({ data }) => data?.errors ?? [])
		.map(({ message }) => message)

describe('Lecture REST anonyme : réseaux lus, coordonnées absentes même avec contactPublic vrai (I01)', () => {
	test('lue seule et en liste, la réponse a les réseaux et rien des coordonnées', async () => {
		const { id } = await publishedArtist(true)
		expect((await stored(id)).publicContact).toBe(true)

		for (const path of [`/api/profiles/${id}?depth=0`, '/api/profiles?depth=0']) {
			const { statut: status, corps, texte: text } = await callRest('GET', path)
			expect(status).toBe(200)
			const document = ('docs' in (corps as object) ? (corps as { docs: object[] }).docs[0] : corps) as object
			expect(document).toMatchObject({ networks: NETWORKS })
			for (const key of CLOSED) expect(document).not.toHaveProperty(key)
			expect(text).not.toContain(CONTACT_DETAILS.email)
			expect(text).not.toContain('39 98')
		}
	})

	test('la propriétaire lit ses coordonnées, son choix et la trace du consentement', async () => {
		const { compte: account, id } = await publishedArtist(true)

		const { corps } = await callRest('GET', `/api/profiles/${id}?depth=0`, { enTetes: account.session.enTetes })

		expect(corps).toMatchObject({ contactDetails: CONTACT_DETAILS, publicContact: true, consentSource: 'artist' })
		expect((corps as Profile).consentedAt).toBeString()
	})
})

describe('Un compte redaction est refusé sur les coordonnées (I07, U59)', () => {
	test('il lit le profil publié sans les coordonnées, et ne peut pas les écrire', async () => {
		const { id } = await publishedArtist(true)
		const editor = await createAccount('redaction')

		const read = await callRest('GET', `/api/profiles/${id}?depth=0`, { enTetes: editor.session.enTetes })
		const write = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: editor.session.enTetes,
			corps: { contactDetails: { phone: '06 39 98 00 00', email: 'autre@example.test' } },
		})

		expect(read.statut).toBe(200)
		for (const key of CLOSED) expect(read.corps).not.toHaveProperty(key)
		expect(write.statut).toBe(403)
		expect((await stored(id)).contactDetails).toEqual(CONTACT_DETAILS)
	})
})

describe('Activer contactPublic pose la date du serveur ; la maquilleuse ne peut pas l’écrire', () => {
	test('la date est celle de la sauvegarde, la source celle du compte ; ce qu’elle envoie est ignoré', async () => {
		const { compte: account, id } = await publishedArtist(false)
		expect(await stored(id)).toMatchObject({ publicContact: false, consentedAt: null, consentSource: null })

		const before = Date.now()
		const activation = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: account.session.enTetes,
			corps: { publicContact: true, consentedAt: '2020-01-01T00:00:00.000Z', consentSource: 'import' },
		})
		const after = Date.now()

		expect(activation.statut).toBe(200)
		const active = await stored(id)
		expect(active.consentSource).toBe('artist')
		const date = Date.parse(active.consentedAt ?? '')
		expect(date).toBeGreaterThanOrEqual(before - 1000)
		expect(date).toBeLessThanOrEqual(after + 1000)

		// A later save that sends another date changes nothing of the trace.
		await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: account.session.enTetes,
			corps: { firstName: 'Autre Prénom', consentedAt: '2021-01-01T00:00:00.000Z', consentSource: 'admin' },
		})
		expect(await stored(id)).toMatchObject({
			firstName: 'Autre Prénom',
			consentedAt: active.consentedAt,
			consentSource: 'artist',
		})

		// Switched off: no consent left.
		await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: account.session.enTetes,
			corps: { publicContact: false },
		})
		expect(await stored(id)).toMatchObject({ publicContact: false, consentedAt: null, consentSource: null })
	})

	test('activé par un admin : la source « admin »', async () => {
		const { id } = await publishedArtist(false)
		const admin = await createAccount('admin')

		const { statut: status } = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: admin.session.enTetes,
			corps: { publicContact: true, consentSource: 'artist' },
		})

		expect(status).toBe(200)
		expect((await stored(id)).consentSource).toBe('admin')
	})

	test('l’import, sans compte, garde la date de la bascule et sa source', async () => {
		const account = await createAccount('maquilleuse')
		const payload = await testPayload()
		const [profile] = (await payload.find({ collection: 'profiles', where: { pro: { equals: account.id } } })).docs
		const cutover = '2027-02-01T06:00:00.000Z'

		await payload.update({
			collection: 'profiles',
			id: profile?.id ?? -1,
			data: { publicContact: true, consentedAt: cutover, consentSource: 'import' },
		})

		expect(await stored(profile?.id ?? -1)).toMatchObject({ consentedAt: cutover, consentSource: 'import' })
	})
})

describe('Un groupe envoyé à null vaut un groupe vide, jamais un 500 (ticket 224)', () => {
	test.each([
		['reseaux', { networks: null }],
		['coordonnees', { contactDetails: null }],
		['les deux', { networks: null, contactDetails: null }],
	])('%s à null, par REST : 200 et le groupe est vidé', async (_cas, corps) => {
		const { compte: account, id } = await publishedArtist(false)

		const response = await callRest('PATCH', `/api/profiles/${id}`, { enTetes: account.session.enTetes, corps })

		expect(response.statut).toBe(200)
		const profile = await stored(id)
		if ('reseaux' in corps) expect(Object.values(profile.networks ?? {}).filter(Boolean)).toEqual([])
		if ('coordonnees' in corps) expect(Object.values(profile.contactDetails ?? {}).filter(Boolean)).toEqual([])
	})

	test('par l’API locale aussi', async () => {
		const { id } = await publishedArtist(false)
		const payload = await testPayload()

		await payload.update({
			collection: 'profiles',
			id,
			data: { networks: null, contactDetails: null } as never,
			overrideAccess: true,
		})

		const profile = await stored(id)
		expect(Object.values(profile.networks ?? {}).filter(Boolean)).toEqual([])
		expect(Object.values(profile.contactDetails ?? {}).filter(Boolean)).toEqual([])
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
		const { compte: account, id } = await publishedArtist(false)

		const { statut: status, corps } = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: account.session.enTetes,
			corps: { contactDetails: { ...CONTACT_DETAILS, ...coordonnees } },
		})

		expect(status).toBe(400)
		expect(fieldsMessages(corps)).toEqual([message])
		expect((await stored(id)).contactDetails).toEqual(CONTACT_DETAILS)
	})
})

describe('Un lien de réseau ne nomme que http ou https : la page publique en fait un lien', () => {
	test.each([
		['instagram', 'javascript:alert(document.cookie)'],
		['website', 'data:text/html,<script>alert(1)</script>'],
		['facebook', ' JavaScript:alert(1)'],
	])('%s = %s : 400, le message du champ, rien d’écrit', async (reseau, lien) => {
		const { compte: account, id } = await publishedArtist(false)

		const { statut: status, corps } = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: account.session.enTetes,
			corps: { networks: { ...NETWORKS, [reseau]: lien } },
		})

		expect(status).toBe(400)
		expect(fieldsMessages(corps)).toEqual(['Ce lien doit commencer par http:// ou https://.'])
		expect((await stored(id)).networks).toEqual(NETWORKS)
	})

	test('un lien sans protocole, comme un pseudo, reste accepté', async () => {
		const { compte: account, id } = await publishedArtist(false)
		const networks = { ...NETWORKS, instagram: '@pseudo_fictif', website: 'www.example.test' }

		const { statut: status } = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: account.session.enTetes,
			corps: { networks: networks },
		})

		expect(status).toBe(200)
		expect((await stored(id)).networks).toEqual(networks)
	})
})
