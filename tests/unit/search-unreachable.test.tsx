import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultCard } from '@/components/search/ResultCard'
import { find, type SearchableProfile } from '@/lib/search/results'
import { readDirectory } from '@/services/public/profiles'

/**
 * Profiles with no way to be reached go last in their section (ticket 291): the order of the others
 * does not change, the count does not change, and the card says why. Made-up values only.
 */

const profile = (
	nom: string,
	ville: string,
	departement: string,
	unreachable = false,
	seDeplace = false
): SearchableProfile & { nom: string } => ({ nom, ville, departement, seDeplace, unreachable })

const names = (list: readonly { nom: string }[]): string[] => list.map(item => item.nom)

describe('291 : les profils sans contact passent en fin de section', () => {
	const DIRECTORY = [
		profile('a-sans', 'Annecy', '74', true),
		profile('b-ok', 'Annecy', '74'),
		profile('c-sans', 'Annecy-le-Vieux', '74', true),
		profile('d-ok', 'Annecy-le-Vieux', '74'),
		profile('e-sans', 'Thonon-les-Bains', '74', true),
		profile('f-ok', 'Thonon-les-Bains', '74'),
		profile('g-sans', 'Lyon', '69', true, true),
		profile('h-ok', 'Lyon', '69', false, true),
		profile('i-sans', 'Nantes', '44', true),
		profile('j-ok', 'Nantes', '44'),
	]

	test('par ville : dans chaque section, les joignables d’abord, dans leur ordre ; puis les autres, dans leur ordre', () => {
		const result = find(DIRECTORY, { search: '', city: 'Annecy' })
		expect(names(result.locaux)).toEqual(['b-ok', 'd-ok', 'a-sans', 'c-sans'])
		expect(result.sections.map(section => names(section.profils))).toEqual([
			['f-ok', 'e-sans'],
			['h-ok', 'g-sans'],
			['j-ok', 'i-sans'],
		])
	})

	test('sans ville : une seule liste, les joignables d’abord', () => {
		const result = find(DIRECTORY, { search: '', city: '' })
		expect(names(result.locaux)).toEqual([
			'b-ok',
			'd-ok',
			'f-ok',
			'h-ok',
			'j-ok',
			'a-sans',
			'c-sans',
			'e-sans',
			'g-sans',
			'i-sans',
		])
	})

	test('le nombre de profils d’une section ne change pas', () => {
		const result = find(DIRECTORY, { search: '', city: 'Annecy' })
		expect(result.locaux).toHaveLength(4)
		expect(result.sections.flatMap(section => section.profils)).toHaveLength(6)
	})

	test('un annuaire où tout le monde est joignable garde son ordre', () => {
		const all = DIRECTORY.map(item => ({ ...item, unreachable: false }))
		expect(names(find(all, { search: '', city: '' }).locaux)).toEqual(names(all))
	})
})

describe('291 : la carte', () => {
	const CARD = {
		slug: 'zoe',
		pid: 1 as never,
		nom: 'Zoé Fictive',
		specialite: null,
		lieu: 'Annecy',
		superMaquilleuse: false,
		photo: null,
	}

	test('sans contact : « Coordonnées pas encore indiquées »', () => {
		expect(
			renderToStaticMarkup(<ResultCard carte={{ ...CARD, sansContact: true }} prioritaire={false} rang={1} />)
		).toContain('Coordonnées pas encore indiquées')
	})

	test('joignable : pas de bandeau', () => {
		expect(renderToStaticMarkup(<ResultCard carte={CARD} prioritaire={false} rang={1} />)).not.toContain(
			'Coordonnées pas encore'
		)
	})
})

describe('291 : la lecture de l’annuaire', () => {
	const doc = (id: number, slug: string) => ({
		id,
		slug,
		firstName: 'Zoé',
		lastName: slug,
		specialty: 'Mariage',
		city: { name: 'Annecy', inseeCode: '74010', department: '74' },
		mainPicture: null,
	})
	const CONTACTS: Record<number, Record<string, unknown>> = {
		1: { networks: { instagram: 'zoe.fictive' } },
		2: { networks: {}, publicContact: true, contactDetails: { phone: '06 00 00 00 01' } },
		3: { networks: {}, publicContact: false, contactDetails: { phone: '06 00 00 00 02', email: 'a@example.test' } },
		4: { networks: {} },
	}
	const payload = {
		find: async (options: Record<string, unknown>) => {
			if (options.collection === 'media') return { docs: [] }
			const select = options.select as Record<string, unknown>
			if (select?.networks === true) {
				const ids = (options.where as { id: { in: number[] } }).id.in
				return { docs: ids.map(id => ({ id, ...CONTACTS[id] })) }
			}
			if (select?.strapiId === true) return { docs: [] }
			return { docs: [doc(1, 'a'), doc(2, 'b'), doc(3, 'c'), doc(4, 'd')], page: 1, totalDocs: 4, hasNextPage: false }
		},
	} as unknown as Payload

	test('un réseau, ou un téléphone montré, rend joignable ; des coordonnées fermées ou rien, non', async () => {
		const directory = await readDirectory(payload)
		expect(directory.map(item => item.unreachable)).toEqual([false, false, true, true])
		expect(directory.map(item => item.carte.sansContact)).toEqual([undefined, undefined, true, true])
	})

	test('aucune coordonnée ne sort de la lecture', async () => {
		const text = JSON.stringify(await readDirectory(payload))
		for (const forbidden of ['06 00', 'example.test', 'zoe.fictive']) expect(text).not.toContain(forbidden)
	})
})
