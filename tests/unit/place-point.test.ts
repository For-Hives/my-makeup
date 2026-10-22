import { describe, expect, test } from 'bun:test'
import type { CitiesSearch, OfficialCity } from '@/lib/dashboard/city-reference'
import { distanceKm } from '@/lib/search/geo-distance'
import { createPlaceResolver } from '@/lib/search/place-point'

/**
 * The place typed becomes a point, and two points a distance (ticket 293). Fictional referential: no
 * call leaves the machine.
 */

const commune = (
	nom: string,
	codeInsee: string,
	latitude: number,
	longitude: number,
	codes: string[]
): OfficialCity => ({
	nom,
	codeInsee,
	departement: '74',
	latitude,
	longitude,
	codesPostaux: codes,
})

const OLD_ANNECY = commune('Annecy-le-Vieux', '74999', 45.9183, 6.1445, ['74940'])
const ANNECY = commune('Annecy', '74010', 45.8992, 6.1294, ['74000'])
const NO_CENTER: OfficialCity = { ...commune('Sansgps', '74998', 0, 0, ['74500']), latitude: null, longitude: null }

/** A fake list that answers by name or by postal code, and counts its calls. */
function fakeList() {
	const calls: string[] = []
	const find = async (text: string): Promise<CitiesSearch> => {
		calls.push(text)
		const flat = text
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.replace(/-/g, ' ')
		if (text === '74940') return { genre: 'communes', communes: [OLD_ANNECY], codePostal: text }
		if (flat === 'annecy le vieux') return { genre: 'communes', communes: [ANNECY, OLD_ANNECY] }
		if (flat === 'annecy') return { genre: 'communes', communes: [OLD_ANNECY, ANNECY] }
		if (flat === 'sansgps') return { genre: 'communes', communes: [NO_CENTER] }
		return { genre: 'communes', communes: [] }
	}
	return { calls, find }
}

describe('293 : un lieu tapé devient un point', () => {
	test('« annecy le vieux », « Annecy-le-Vieux » et « 74940 » donnent le même point', async () => {
		const resolve = createPlaceResolver({ findCities: fakeList().find })
		const a = await resolve('annecy le vieux')
		const b = await resolve('Annecy-le-Vieux')
		const c = await resolve('74940')
		expect(a).toEqual({ genre: 'point', point: { latitude: 45.9183, longitude: 6.1445 }, label: 'Annecy-le-Vieux' })
		expect(b).toEqual(a)
		expect(c).toEqual(a)
	})

	test('un code postal écrit avec la commune, ou une commune suivie d’un département, est lu', async () => {
		const resolve = createPlaceResolver({ findCities: fakeList().find })
		expect(await resolve('74940 Annecy')).toMatchObject({ genre: 'point', label: 'Annecy-le-Vieux' })
		expect(await resolve('Annecy (74)')).toMatchObject({ genre: 'point', label: 'Annecy' })
	})

	test('le nom exact passe avant le premier de la liste', async () => {
		const resolve = createPlaceResolver({ findCities: fakeList().find })
		expect(await resolve('Annecy')).toMatchObject({ label: 'Annecy' })
	})

	test('un lieu inconnu, sans centre, un pays ou une région : « inconnu », sans exception', async () => {
		const list = fakeList()
		const resolve = createPlaceResolver({ findCities: list.find })
		expect(await resolve('Zzqqxx')).toEqual({ genre: 'unknown' })
		expect(await resolve('Sansgps')).toEqual({ genre: 'unknown' })
		expect(await resolve('Suisse')).toEqual({ genre: 'unknown' })
		expect(await resolve('France')).toEqual({ genre: 'unknown' })
		expect(await resolve('')).toEqual({ genre: 'unknown' })
		expect(list.calls).not.toContain('Suisse')
		expect(list.calls).not.toContain('France')
	})

	test('un nom de département n’est pas pris pour une commune voisine', async () => {
		const resolve = createPlaceResolver({
			findCities: async () => ({ genre: 'communes', communes: [ANNECY] }),
		})
		expect(await resolve('Haute-Savoie')).toEqual({ genre: 'unknown' })
	})
})

describe('293 : le référentiel lent ou en panne', () => {
	test('en panne : « inconnu », et rien n’est gardé', async () => {
		let calls = 0
		const resolve = createPlaceResolver({
			findCities: async () => {
				calls += 1
				return { genre: 'panne' }
			},
		})
		expect(await resolve('Annecy')).toEqual({ genre: 'unknown' })
		expect(await resolve('Annecy')).toEqual({ genre: 'unknown' })
		expect(calls).toBe(2)
	})

	test('qui lève une exception : « inconnu »', async () => {
		const resolve = createPlaceResolver({
			findCities: async () => {
				throw new Error('boom')
			},
		})
		expect(await resolve('Annecy')).toEqual({ genre: 'unknown' })
	})

	test('qui ne répond pas dans le délai : « inconnu » à temps', async () => {
		const resolve = createPlaceResolver({ findCities: () => new Promise<CitiesSearch>(() => {}), delayMs: 20 })
		const start = performance.now()
		expect(await resolve('Annecy')).toEqual({ genre: 'unknown' })
		expect(performance.now() - start).toBeLessThan(500)
	})
})

describe('293 : le cache', () => {
	test('un second appel identique n’appelle pas le référentiel (même sans accents ni tirets)', async () => {
		const list = fakeList()
		const resolve = createPlaceResolver({ findCities: list.find })
		await resolve('Annecy-le-Vieux')
		await resolve('annecy le vieux')
		await resolve('ANNECY-LE-VIEUX')
		expect(list.calls).toHaveLength(1)
	})

	test('un lieu inconnu est gardé aussi, mais moins longtemps', async () => {
		const list = fakeList()
		let now = 0
		const resolve = createPlaceResolver({ findCities: list.find, now: () => now })
		await resolve('Zzqqxx')
		await resolve('Zzqqxx')
		expect(list.calls).toHaveLength(1)
		now += 61 * 60 * 1000
		await resolve('Zzqqxx')
		expect(list.calls).toHaveLength(2)
	})

	test('la durée est bornée : après un jour, on redemande', async () => {
		const list = fakeList()
		let now = 0
		const resolve = createPlaceResolver({ findCities: list.find, now: () => now })
		await resolve('Annecy')
		now += 23 * 60 * 60 * 1000
		await resolve('Annecy')
		expect(list.calls).toHaveLength(1)
		now += 2 * 60 * 60 * 1000
		await resolve('Annecy')
		expect(list.calls).toHaveLength(2)
	})

	test('la taille est bornée : la plus ancienne sort', async () => {
		const list = fakeList()
		const resolve = createPlaceResolver({ findCities: list.find, maxEntries: 2 })
		await resolve('Annecy')
		await resolve('Sansgps')
		await resolve('Zzqqxx')
		expect(list.calls).toHaveLength(3)
		await resolve('Zzqqxx')
		await resolve('Sansgps')
		expect(list.calls).toHaveLength(3)
		await resolve('Annecy')
		expect(list.calls).toHaveLength(4)
	})
})

describe('293 : la distance à vol d’oiseau', () => {
	// A degree of latitude along a meridian is 6371 km × π / 180 = 111,19 km, computed by hand.
	test('un degré de latitude fait 111,2 km, un degré de longitude à l’équateur aussi', () => {
		expect(distanceKm({ latitude: 45, longitude: 6 }, { latitude: 46, longitude: 6 })).toBeCloseTo(111.2, 0)
		expect(distanceKm({ latitude: 0, longitude: 10 }, { latitude: 0, longitude: 11 })).toBeCloseTo(111.2, 0)
	})

	test('un point à lui-même : zéro ; dans les deux sens : la même valeur', () => {
		const annecy = { latitude: 45.8992, longitude: 6.1294 }
		const lyon = { latitude: 45.764, longitude: 4.8357 }
		expect(distanceKm(annecy, annecy)).toBe(0)
		expect(distanceKm(annecy, lyon)).toBe(distanceKm(lyon, annecy))
	})

	test('Paris–Lyon : 392 km à 1 km près (valeur publiée des deux centres)', () => {
		const paris = { latitude: 48.8566, longitude: 2.3522 }
		const lyon = { latitude: 45.764, longitude: 4.8357 }
		expect(Math.abs(distanceKm(paris, lyon) - 392)).toBeLessThan(1)
	})

	test('Annecy–Annecy-le-Vieux : environ 2,4 km', () => {
		// 0,0191° de latitude = 2,12 km ; 0,0151° de longitude × cos 45,9° = 1,17 km ; racine de la somme des carrés = 2,42 km.
		expect(
			Math.abs(distanceKm({ latitude: 45.8992, longitude: 6.1294 }, { latitude: 45.9183, longitude: 6.1445 }) - 2.42)
		).toBeLessThan(1)
	})
})
