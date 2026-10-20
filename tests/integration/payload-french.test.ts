import { afterEach, describe, expect, test } from 'bun:test'
import { createAccount } from '../support/account-factory'
import { emptyBase, testPayload } from '../support/payload-test'
import { callRest } from '../support/rest'

/**
 * Payload answers in French only (ticket 221): the envelope of a refusal, its own refusals and its
 * default messages, by REST as by the Local API, whatever language the request asks for. The
 * setting is src/lib/payload-language.ts; the admin panel is checked in a browser
 * (tests/e2e/administration-french.spec.ts).
 */

afterEach(emptyBase)

/** The start of the envelope of a refusal, in Payload's French. */
const ENVELOPE = 'Le champ suivant n’est pas valide'

/** One character more than a phone number of contact may hold (20). Made up. */
const PHONE_TOO_LONG = '06 39 98 12 34 00 000'

/** One character more than a first name may hold (70). */
const FIRST_NAME_TOO_LONG = 'Prénom'.padEnd(71, 'e')

interface Refusal {
	errors: { message: string; data?: { errors?: { message: string; path: string }[] } }[]
}

/** The messages of the fields a 400 refuses. */
const fieldsMessages = (corps: unknown): string[] =>
	(corps as Refusal).errors.flatMap(({ data }) => data?.errors ?? []).map(({ message }) => message)

/** A makeup artist with her empty profile and her session. */
async function artist() {
	const account = await createAccount('maquilleuse')
	const payload = await testPayload()
	const [profile] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: account.id } } }))
		.docs
	if (!profile) throw new Error('La fabrique devait créer le profil de la maquilleuse.')
	return { compte: account, id: profile.id }
}

describe('REST : l’enveloppe d’un refus est en français, même pour une requête qui demande l’anglais', () => {
	test('un téléphone de 21 caractères : 400, « Le champ suivant n’est pas valide », jamais « The following »', async () => {
		expect(PHONE_TOO_LONG).toHaveLength(21)
		const { compte: account, id } = await artist()

		const languages: Record<string, string>[] = [
			{},
			{ 'Accept-Language': 'en' },
			{ 'Accept-Language': 'en-US,en;q=0.9' },
		]
		for (const language of languages) {
			const {
				statut: status,
				corps,
				texte: text,
			} = await callRest('PATCH', `/api/profiles/${id}`, {
				enTetes: { ...account.session.enTetes, ...language },
				corps: { contactDetails: { phone: PHONE_TOO_LONG } },
			})

			expect([language, status]).toEqual([language, 400])
			expect((corps as Refusal).errors[0]?.message).toStartWith(ENVELOPE)
			expect(text).not.toContain('The following')
		}
		// The cookie of the admin panel's language asks for English too: French all the same.
		const { corps } = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: { ...account.session.enTetes, Cookie: `${account.session.enTetes.Cookie}; payload-lng=en` },
			corps: { contactDetails: { phone: PHONE_TOO_LONG } },
		})
		expect((corps as Refusal).errors[0]?.message).toStartWith(ENVELOPE)
	})

	test('un prénom de 71 caractères : le message du champ est le message de Payload, en français', async () => {
		expect(FIRST_NAME_TOO_LONG).toHaveLength(71)
		const { compte: account, id } = await artist()

		const {
			statut: status,
			corps,
			texte: text,
		} = await callRest('PATCH', `/api/profiles/${id}`, {
			enTetes: { ...account.session.enTetes, 'Accept-Language': 'en' },
			corps: { firstName: FIRST_NAME_TOO_LONG },
		})

		expect(status).toBe(400)
		expect((corps as Refusal).errors[0]?.message).toStartWith(ENVELOPE)
		expect(fieldsMessages(corps)).toEqual([
			'Cette valeur doit être inférieure à la longueur maximale de 70 caractères.',
		])
		expect(text).not.toContain('This value must be shorter')
		expect((await (await testPayload()).findByID({ collection: 'profiles', id, depth: 0 })).firstName).not.toBe(
			FIRST_NAME_TOO_LONG
		)
	})

	test('POST anonyme sur /api/pros/first-register : « Vous n’êtes pas autorisé à effectuer cette action. »', async () => {
		const languages: Record<string, string>[] = [{}, { 'Accept-Language': 'en' }]
		for (const language of languages) {
			const { statut: status, corps } = await callRest('POST', '/api/pros/first-register', {
				enTetes: language,
				corps: { email: `anonyme-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() },
			})

			expect([language, status]).toEqual([language, 403])
			expect((corps as Refusal).errors.map(({ message }) => message)).toEqual([
				'Vous n’êtes pas autorisé à effectuer cette action.',
			])
		}
	})
})

describe('API locale, règles actives : la même écriture lève une erreur en français', () => {
	test('la propriétaire enregistre un téléphone de 21 caractères : le message de l’erreur est en français', async () => {
		const { compte: account, id } = await artist()
		const payload = await testPayload()
		const owner = {
			...(await payload.findByID({ collection: 'pros', id: Number(account.id) })),
			collection: 'pros' as const,
		}

		const refusal = await payload
			.update({
				collection: 'profiles',
				id,
				data: { contactDetails: { phone: PHONE_TOO_LONG } },
				overrideAccess: false,
				user: owner,
			})
			.then(
				() => undefined,
				(erreur: unknown) => erreur
			)

		expect(refusal).toMatchObject({ status: 400 })
		expect((refusal as Error).message).toStartWith(ENVELOPE)
		expect((refusal as Error).message).not.toContain('The following')
	})
})
