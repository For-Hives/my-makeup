import { afterEach, describe, expect, test } from 'bun:test'
import type { ProfileStatus } from '@/lib/profile/status'
import type { Profile } from '@/payload-types'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * What the public reads of the profiles, and what only an admin writes on them (ticket 021; plan
 * 02 §7.3, I01 and I03; U53 and U55 through the real API).
 */

afterEach(emptyBase)

/** What an admin decided about a profile, and what the import wrote: none of it is public. */
const RESERVE = {
	reason: 'Motif fictif du masquage',
	verified: true,
	verifiedAt: '2026-10-01T00:00:00.000Z',
	siret: '12345678901234',
	internalNote: 'Note interne fictive',
	score: 7.5,
	legacyUsername: 'Ancien Pseudo Fictif',
	strapiId: 4242,
} as const

/**
 * What anyone but the owner and an admin reads of a published profile: its identity, its networks
 * (ticket 042), its photos (ticket 043), its lists (ticket 040), its zone (ticket 041), its state (ticket 044), the badge
 * of the search and Payload's dates. A new public field of the profile is added here on purpose.
 */
const PUBLIC_KEYS = [
	'active',
	'artistName',
	'available',
	'city',
	'completeness',
	'courses',
	'createdAt',
	'description',
	'experiences',
	'firstName',
	'fullyEmpty',
	'gallery',
	'homeService',
	'id',
	'languages',
	'lastName',
	'mainPicture',
	'networks',
	'publishable',
	'radiusKm',
	'serviceOffers',
	'skills',
	'slug',
	'specialty',
	'superArtist',
	'updatedAt',
]

/** The identifier of the old site is unique: each profile of a test gets its own. */
let lastStrapiId: number = RESERVE.strapiId

/** The account of a makeup artist, with her profile in this status and every reserved field filled. */
async function artistWithProfile(statut: ProfileStatus) {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }))
		.docs
	if (!profile) throw new Error('La fabrique n’a pas créé de profil.')
	lastStrapiId += 1
	const filled = await payload.update({
		collection: 'profiles',
		id: profile.id,
		data: {
			...RESERVE,
			strapiId: lastStrapiId,
			status: statut,
			firstName: 'Prénom',
			lastName: 'Fictif',
			superArtist: true,
		},
	})
	return { compte: account, profil: filled }
}

/** The profile as the database holds it, read without access control. */
async function stored(id: number): Promise<Profile> {
	const payload = await testPayload()
	return payload.findByID({ collection: 'profiles', id, depth: 0 })
}

const identifiers = (corps: unknown) => (corps as { docs: { id: number }[] }).docs.map(({ id }) => id)

describe('Lecture anonyme : seuls les profils publiés sortent (I01, U53)', () => {
	test('par REST et par l’API locale, un profil publié sur trois', async () => {
		const [published, draft, hidden] = await Promise.all([
			artistWithProfile('published'),
			artistWithProfile('draft'),
			artistWithProfile('hidden'),
		])
		const payload = await testPayload()

		const rest = await callRest('GET', '/api/profiles?limit=100&depth=0')
		const locale = await payload.find({ collection: 'profiles', depth: 0, overrideAccess: false })

		expect(rest.statut).toBe(200)
		expect(identifiers(rest.corps)).toEqual([published.profil.id])
		expect(locale.docs.map(({ id }) => id)).toEqual([published.profil.id])
		for (const cache of [draft, hidden])
			expect((await callRest('GET', `/api/profiles/${cache.profil.id}`)).statut).toBe(404)
	})
})

describe('Instantané des clés : aucun champ réservé, ni compte relié, ni strapiId', () => {
	test('un profil publié lu par un anonyme, à toutes les profondeurs, en liste et seul', async () => {
		const { profil: profile } = await artistWithProfile('published')

		for (const path of [
			`/api/profiles/${profile.id}?depth=0`,
			`/api/profiles/${profile.id}?depth=2`,
			'/api/profiles?depth=1',
		]) {
			const { statut: status, corps, texte: text } = await callRest('GET', path)
			expect(status).toBe(200)
			const document = 'docs' in (corps as object) ? (corps as { docs: object[] }).docs[0] : corps
			expect(Object.keys(document as object).sort()).toEqual(PUBLIC_KEYS)
			for (const value of [RESERVE.internalNote, RESERVE.siret, RESERVE.reason, RESERVE.legacyUsername])
				expect(text).not.toContain(value)
		}
	})

	test('lu par une autre maquilleuse ou par redaction : les mêmes clés', async () => {
		const { profil: profile } = await artistWithProfile('published')
		const [other, editor] = await Promise.all([createAccount('maquilleuse'), createAccount('redaction')])

		for (const reader of [other, editor]) {
			const { statut: status, corps } = await callRest('GET', `/api/profiles/${profile.id}?depth=0`, {
				enTetes: reader.session.enTetes,
			})
			expect(status).toBe(200)
			expect(Object.keys(corps as object).sort()).toEqual(PUBLIC_KEYS)
		}
	})

	test('la propriétaire lit son statut, son motif, sa vérification et son SIRET, jamais la note interne ni le score', async () => {
		const { compte: account, profil: profile } = await artistWithProfile('hidden')

		const { statut: status, corps } = await callRest('GET', `/api/profiles/${profile.id}?depth=0`, {
			enTetes: account.session.enTetes,
		})

		expect(status).toBe(200)
		expect(corps).toMatchObject({
			status: 'hidden',
			reason: RESERVE.reason,
			verified: true,
			verifiedAt: RESERVE.verifiedAt,
			siret: RESERVE.siret,
			pro: Number(account.id),
			legacyUsername: RESERVE.legacyUsername,
			strapiId: profile.strapiId,
		})
		expect(corps).not.toHaveProperty('internalNote')
		expect(corps).not.toHaveProperty('score')
	})

	test('l’admin lit tout', async () => {
		const { profil: profile } = await artistWithProfile('published')
		const admin = await createAccount('admin')

		const { corps } = await callRest('GET', `/api/profiles/${profile.id}?depth=0`, { enTetes: admin.session.enTetes })

		expect(corps).toMatchObject({ ...RESERVE, strapiId: profile.strapiId, status: 'published', superArtist: true })
	})
})

describe('Statut, vérifié et score envoyés par la maquilleuse restent inchangés (I03, U55)', () => {
	test('la modification passe pour son identité, les champs réservés gardent leur valeur', async () => {
		const { compte: account, profil: profile } = await artistWithProfile('draft')
		const other = await createAccount('maquilleuse-sans-profil')
		const before = await stored(profile.id)

		const { statut: status } = await callRest('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: account.session.enTetes,
			corps: {
				firstName: 'Nouveau Prénom',
				status: 'published',
				verified: false,
				verifiedAt: '2026-10-14T00:00:00.000Z',
				score: 99,
				reason: 'Envoyé par la maquilleuse',
				siret: '98765432109876',
				internalNote: 'Envoyée par la maquilleuse',
				superArtist: false,
				pro: Number(other.id),
			},
		})

		expect(status).toBe(200)
		const after = await stored(profile.id)
		expect(after.firstName).toBe('Nouveau Prénom')
		const reserves = [
			'status',
			'verified',
			'verifiedAt',
			'score',
			'reason',
			'siret',
			'internalNote',
			'superArtist',
			'pro',
		] as const
		for (const field of reserves) expect([field, after[field]]).toEqual([field, before[field]])
	})

	test('un SIRET mal formé est refusé en français, même pour un admin', async () => {
		const { profil: profile } = await artistWithProfile('published')
		const admin = await createAccount('admin')

		const { statut: status, texte: text } = await callRest('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: admin.session.enTetes,
			corps: { siret: '123 456 789' },
		})

		expect(status).toBe(400)
		expect(text).toContain('Le SIRET compte 14 chiffres, sans espace.')
		expect((await stored(profile.id)).siret).toBe(RESERVE.siret)
	})
})

describe('L’admin masque un profil : la lecture anonyme suivante ne le rend plus', () => {
	test('lu par son identifiant et dans la liste avant ; introuvable et absent de la liste après', async () => {
		const { profil: profile } = await artistWithProfile('published')
		const admin = await createAccount('admin')
		expect((await callRest('GET', `/api/profiles/${profile.id}`)).statut).toBe(200)

		const hiding = await callRest('PATCH', `/api/profiles/${profile.id}`, {
			enTetes: admin.session.enTetes,
			corps: { chosenStatus: 'hidden', reason: 'Masqué pour le test' },
		})

		expect(hiding.statut).toBe(200)
		expect((await callRest('GET', `/api/profiles/${profile.id}`)).statut).toBe(404)
		expect(identifiers((await callRest('GET', '/api/profiles?depth=0')).corps)).toEqual([])
	})
})

/** Addresses a robot tries: none names an identifier a profile or a media can have. */
const MALFORMED_IDENTIFIERS = ['abc', 'wp-login.php', '1e999', '99999999999', '1.5']

describe('Un identifiant de profil mal formé : refusé avant la base, jamais une erreur 500', () => {
	test('par REST pour l’anonyme, une maquilleuse et l’admin ; par l’API locale avec les règles actives', async () => {
		const [artist, admin] = await Promise.all([createAccount('maquilleuse'), createAccount('admin')])
		const payload = await testPayload()

		for (const headers of [{}, artist.session.enTetes, admin.session.enTetes])
			for (const id of MALFORMED_IDENTIFIERS)
				expect([id, (await callRest('GET', `/api/profiles/${id}`, { enTetes: headers })).statut]).toEqual([id, 403])
		for (const id of MALFORMED_IDENTIFIERS)
			await expect(payload.findByID({ collection: 'profiles', id, overrideAccess: false })).rejects.toMatchObject({
				status: 403,
			})
	})
})
