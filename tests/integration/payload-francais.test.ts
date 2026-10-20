import { afterEach, describe, expect, test } from 'bun:test'
import { creerCompte } from '../support/account-factory'
import { payloadDeTest, viderLaBase } from '../support/payload-test'
import { appelerRest } from '../support/rest'

/**
 * Payload answers in French only (ticket 221): the envelope of a refusal, its own refusals and its
 * default messages, by REST as by the Local API, whatever language the request asks for. The
 * setting is src/lib/payload-language.ts; the admin panel is checked in a browser
 * (tests/e2e/administration-francais.spec.ts).
 */

afterEach(viderLaBase)

/** The start of the envelope of a refusal, in Payload's French. */
const ENVELOPPE = 'Le champ suivant n’est pas valide'

/** One character more than a phone number of contact may hold (20). Made up. */
const TELEPHONE_TROP_LONG = '06 39 98 12 34 00 000'

/** One character more than a first name may hold (70). */
const PRENOM_TROP_LONG = 'Prénom'.padEnd(71, 'e')

interface Refus {
	errors: { message: string; data?: { errors?: { message: string; path: string }[] } }[]
}

/** The messages of the fields a 400 refuses. */
const messagesDesChamps = (corps: unknown): string[] =>
	(corps as Refus).errors.flatMap(({ data }) => data?.errors ?? []).map(({ message }) => message)

/** A makeup artist with her empty profile and her session. */
async function maquilleuse() {
	const compte = await creerCompte('maquilleuse')
	const payload = await payloadDeTest()
	const [profil] = (await payload.find({ collection: 'profiles', depth: 0, where: { pro: { equals: compte.id } } }))
		.docs
	if (!profil) throw new Error('La fabrique devait créer le profil de la maquilleuse.')
	return { compte, id: profil.id }
}

describe('REST : l’enveloppe d’un refus est en français, même pour une requête qui demande l’anglais', () => {
	test('un téléphone de 21 caractères : 400, « Le champ suivant n’est pas valide », jamais « The following »', async () => {
		expect(TELEPHONE_TROP_LONG).toHaveLength(21)
		const { compte, id } = await maquilleuse()

		const langues: Record<string, string>[] = [{}, { 'Accept-Language': 'en' }, { 'Accept-Language': 'en-US,en;q=0.9' }]
		for (const langue of langues) {
			const { statut, corps, texte } = await appelerRest('PATCH', `/api/profiles/${id}`, {
				enTetes: { ...compte.session.enTetes, ...langue },
				corps: { contactDetails: { phone: TELEPHONE_TROP_LONG } },
			})

			expect([langue, statut]).toEqual([langue, 400])
			expect((corps as Refus).errors[0]?.message).toStartWith(ENVELOPPE)
			expect(texte).not.toContain('The following')
		}
		// The cookie of the admin panel's language asks for English too: French all the same.
		const { corps } = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: { ...compte.session.enTetes, Cookie: `${compte.session.enTetes.Cookie}; payload-lng=en` },
			corps: { contactDetails: { phone: TELEPHONE_TROP_LONG } },
		})
		expect((corps as Refus).errors[0]?.message).toStartWith(ENVELOPPE)
	})

	test('un prénom de 71 caractères : le message du champ est le message de Payload, en français', async () => {
		expect(PRENOM_TROP_LONG).toHaveLength(71)
		const { compte, id } = await maquilleuse()

		const { statut, corps, texte } = await appelerRest('PATCH', `/api/profiles/${id}`, {
			enTetes: { ...compte.session.enTetes, 'Accept-Language': 'en' },
			corps: { firstName: PRENOM_TROP_LONG },
		})

		expect(statut).toBe(400)
		expect((corps as Refus).errors[0]?.message).toStartWith(ENVELOPPE)
		expect(messagesDesChamps(corps)).toEqual([
			'Cette valeur doit être inférieure à la longueur maximale de 70 caractères.',
		])
		expect(texte).not.toContain('This value must be shorter')
		expect((await (await payloadDeTest()).findByID({ collection: 'profiles', id, depth: 0 })).firstName).not.toBe(
			PRENOM_TROP_LONG
		)
	})

	test('POST anonyme sur /api/pros/first-register : « Vous n’êtes pas autorisé à effectuer cette action. »', async () => {
		const langues: Record<string, string>[] = [{}, { 'Accept-Language': 'en' }]
		for (const langue of langues) {
			const { statut, corps } = await appelerRest('POST', '/api/pros/first-register', {
				enTetes: langue,
				corps: { email: `anonyme-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() },
			})

			expect([langue, statut]).toEqual([langue, 403])
			expect((corps as Refus).errors.map(({ message }) => message)).toEqual([
				'Vous n’êtes pas autorisé à effectuer cette action.',
			])
		}
	})
})

describe('API locale, règles actives : la même écriture lève une erreur en français', () => {
	test('la propriétaire enregistre un téléphone de 21 caractères : le message de l’erreur est en français', async () => {
		const { compte, id } = await maquilleuse()
		const payload = await payloadDeTest()
		const proprietaire = {
			...(await payload.findByID({ collection: 'pros', id: Number(compte.id) })),
			collection: 'pros' as const,
		}

		const refus = await payload
			.update({
				collection: 'profiles',
				id,
				data: { contactDetails: { phone: TELEPHONE_TROP_LONG } },
				overrideAccess: false,
				user: proprietaire,
			})
			.then(
				() => undefined,
				(erreur: unknown) => erreur
			)

		expect(refus).toMatchObject({ status: 400 })
		expect((refus as Error).message).toStartWith(ENVELOPPE)
		expect((refus as Error).message).not.toContain('The following')
	})
})
