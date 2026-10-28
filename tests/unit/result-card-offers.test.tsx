import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultCard } from '@/components/search/ResultCard'
import { ResultList } from '@/components/search/ResultList'
import { formatFromShort } from '@/lib/price'
import { CARD_FIELDS, listProfiles, type ProfileCard } from '@/services/public/profiles'

/**
 * The richer card of the results (ticket 303): her first two offers as chips and « dès 150 € » (the lowest
 * amount), and nothing else. Made-up values only.
 */

const NBSP = ' '

const CARD: ProfileCard = {
	slug: 'zoe-fictive',
	pid: 1 as never,
	nom: 'Zoé Fictive',
	specialite: 'Mariage',
	lieu: 'Annecy et 30 km autour',
	superMaquilleuse: false,
	photo: { url: 'https://photos.example.test/media/abc.webp', width: 400, height: 400 },
}

const render = (carte: ProfileCard, rang: number | undefined = 1) =>
	renderToStaticMarkup(<ResultCard carte={carte} prioritaire={false} rang={rang} />)

/** A Payload that answers one profile with the offers given, and records what it was asked. */
function payloadWith(serviceOffers: unknown) {
	const readings: Record<string, unknown>[] = []
	const payload = {
		find: async (options: Record<string, unknown>) => {
			readings.push(options)
			if (options.collection === 'media') return { docs: [] }
			// « Vérifiée », read apart (issue 1170): nobody has ticked it here.
			if ((options.select as Record<string, unknown>)?.verified === true) return { docs: [] }
			if ((options.select as Record<string, unknown>)?.strapiId === true) return { docs: [{ id: 1, strapiId: 42 }] }
			return {
				docs: [
					{
						id: 1,
						slug: 'zoe-fictive',
						firstName: 'Zoé',
						lastName: 'Fictive',
						specialty: 'Mariage',
						city: { name: 'Annecy', inseeCode: '74010' },
						mainPicture: null,
						serviceOffers,
					},
				],
				page: 1,
				totalDocs: 1,
				hasNextPage: false,
			}
		},
	}
	return { payload: payload as unknown as Payload, readings }
}

describe('303 : la carte montre le prix de départ et deux prestations', () => {
	test('« dès 150 € » vient du plus petit montant, et deux puces au plus', async () => {
		const { payload } = payloadWith([
			{ name: 'Mariée', priceFrom: 200, description: 'Un texte privé', options: [{ name: 'Option', priceFrom: 10 }] },
			{ name: 'Essai', priceFrom: 150 },
			{ name: 'Soirée', priceFrom: 90_000 },
			{ name: 'Photo', priceFrom: null, priceText: 'Sur devis' },
		])
		const { cartes: cards } = await listProfiles(payload)
		expect(cards[0]?.startingPrice).toBe(150)
		expect(cards[0]?.offerNames).toEqual(['Mariée', 'Essai'])
		const html = render(cards[0] as ProfileCard)
		expect(html).toContain(`dès 150${NBSP}€`)
		expect(html).toContain('Mariée')
		expect(html).toContain('Essai')
		expect(html).not.toContain('Soirée')
		expect(html.match(/rounded-full/g)).toHaveLength(2)
	})

	test('sans prestation chiffrée : aucune mention de prix ni de « 0 € »', async () => {
		const { payload } = payloadWith([{ name: 'Mariée', priceFrom: null, priceText: 'Sur devis' }, { name: '  ' }])
		const { cartes: cards } = await listProfiles(payload)
		expect(cards[0]?.startingPrice).toBeUndefined()
		expect(cards[0]?.offerNames).toEqual(['Mariée'])
		const html = render(cards[0] as ProfileCard)
		expect(html).not.toContain('dès')
		expect(html).not.toContain('0 €')
		expect(html).not.toContain('€')
	})

	test('sans prestation : la carte garde ses clés d’avant', async () => {
		const { payload } = payloadWith([])
		const { cartes: cards } = await listProfiles(payload)
		expect(Object.keys(cards[0] ?? {}).sort()).toEqual([
			'lieu',
			'nom',
			'photo',
			'pid',
			'slug',
			'specialite',
			'superMaquilleuse',
		])
		const html = render(cards[0] as ProfileCard)
		expect(html).not.toContain('dès')
		expect(html).not.toContain('Prestations')
	})

	test('avec prestations : deux clés de plus, et ni description, ni texte de prix, ni option ne sort', async () => {
		const { payload } = payloadWith([
			{
				name: 'Mariée',
				priceFrom: 150,
				description: 'SECRET-DESC',
				priceText: 'SECRET-TEXT',
				options: [{ name: 'SECRET-OPT' }],
			},
		])
		const { cartes: cards } = await listProfiles(payload)
		expect(Object.keys(cards[0] ?? {}).sort()).toEqual([
			'lieu',
			'nom',
			'offerNames',
			'photo',
			'pid',
			'slug',
			'specialite',
			'startingPrice',
			'superMaquilleuse',
		])
		const text = JSON.stringify(cards) + render(cards[0] as ProfileCard)
		for (const forbidden of ['SECRET-DESC', 'SECRET-TEXT', 'SECRET-OPT']) expect(text).not.toContain(forbidden)
	})

	test('un profil sans contact garde son bandeau, avec le prix', () => {
		const html = render({ ...CARD, unreachable: true, startingPrice: 150, offerNames: ['Mariée'] })
		expect(html).toContain('Coordonnées pas encore indiquées')
		expect(html).toContain(`dès 150${NBSP}€`)
	})

	test('le montant s’écrit « dès 1 200 € » avec ses espaces insécables, et rien sans montant', () => {
		expect(formatFromShort(150)).toBe(`dès 150${NBSP}€`)
		expect(formatFromShort(1200)).toBe(`dès 1 200${NBSP}€`)
		expect(formatFromShort(null)).toBe('')
		expect(formatFromShort(0)).toBe('')
	})
})

describe('303 : champs publics, photo et mise en page', () => {
	test('CARD_FIELDS ne choisit que des champs publics, et des offres que leur nom et leur montant', () => {
		expect(Object.keys(CARD_FIELDS).sort()).toEqual([
			'artistName',
			'city',
			'countries',
			'firstName',
			'lastName',
			'mainPicture',
			'radiusKm',
			'serviceOffers',
			'slug',
			'specialty',
			'superArtist',
			'town',
			'zoneKind',
		])
		expect(CARD_FIELDS.serviceOffers).toEqual({ name: true, priceFrom: true })
	})

	test('la photo garde son texte alternatif ; la carte est une rangée de 140 px puis une colonne', () => {
		const html = render(CARD)
		expect(html).toContain('alt="Photo de Zoé Fictive"')
		expect(html).toContain('h-[140px]')
		expect(html).toContain('md:flex-col')
		expect(html).toContain('md:aspect-[4/3]')
	})

	test('une carte sans rang (hors recherche) ne mesure aucun clic', () => {
		expect(render(CARD, undefined)).toContain('href="/profil/zoe-fictive"')
	})

	test('les deux premières cartes de la page chargent tout de suite, pas les autres', () => {
		const cards = [1, 2, 3, 4].map(n => ({
			...CARD,
			slug: `p-${n}`,
			photo: { ...CARD.photo!, url: `https://photos.example.test/m/${n}.webp` },
		}))
		const html = renderToStaticMarkup(<ResultList cartes={cards} premiereDeLaPage />)
		const images = html.match(/<img[^>]*>/g) ?? []
		expect(images).toHaveLength(4)
		expect(images.map(image => image.includes('loading="lazy"'))).toEqual([false, false, true, true])
	})
})
