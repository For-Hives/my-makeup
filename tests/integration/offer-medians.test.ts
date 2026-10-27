import { afterEach, describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { readOfferMedians } from '@/services/public/offer-medians'
import { emptyBase, testPayload } from '../support/payload-test'

afterEach(async () => {
	await emptyBase()
})

describe('le repère de prix : la médiane des prestations listées, jamais un profil', () => {
	async function listedWithOffer(
		payload: Payload,
		rank: number,
		name: string,
		priceFrom: number,
		status = 'published'
	) {
		const pro = await payload.create({
			collection: 'pros',
			data: {
				email: `repere-${rank}@example.test`,
				password: `Banc-${rank}-${crypto.randomUUID()}`,
				name: `Repère ${rank}`,
				_verified: true,
			},
			context: NO_PROFILE_CONTEXT,
			disableVerificationEmail: true,
		})
		await payload.create({
			collection: 'profiles',
			data: {
				pro: pro.id,
				slug: `repere-${rank}`,
				firstName: 'Repère',
				lastName: String(rank),
				serviceOffers: [{ name, priceText: String(priceFrom), priceFrom }],
				...(status === 'published' ? {} : { chosenStatus: status as 'hidden' }),
			},
		})
	}

	test('cinq prestations « mariée » : une médiane ; trois « soirée » : aucune ; un profil masqué ne compte pas', async () => {
		const payload = await testPayload()
		const bride = [100, 120, 140, 160, 200]
		for (const [rank, amount] of bride.entries())
			await listedWithOffer(payload, rank, 'Maquillage de la mariée', amount)
		for (const [rank, amount] of [50, 60, 70].entries())
			await listedWithOffer(payload, 10 + rank, 'Maquillage de soirée', amount)
		await listedWithOffer(payload, 20, 'Maquillage de la mariée', 5000, 'hidden')

		expect(await readOfferMedians(payload)).toEqual({ Mariée: 140, Soirée: null, Essai: null })
	})
})
