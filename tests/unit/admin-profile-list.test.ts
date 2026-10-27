import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { Profiles } from '../../src/collections/Profiles'
import { adminProfileName, adminProfileZone, NO_NAME_LABEL, NO_ZONE_LABEL } from '../../src/lib/profile/admin-list'
import { type ChooseCityDeps, chooseReviewCity } from '../../src/lib/profile/choose-city'

/**
 * Ticket 308 (audit UX no. 25, reduced): what the list of profiles of the admin panel shows of a person, and
 * the choice of a commune of a review by a button. No database: the Local API is a small fake that keeps the
 * writes it receives.
 */

describe('la colonne de nom de la liste des profils', () => {
	test('un profil à l’étranger montre son nom, et son pays dans la colonne de zone, jamais « <Pas de Nom> »', () => {
		const abroad = {
			firstName: 'Camille',
			lastName: 'Roy',
			zoneKind: 'countries',
			countries: ['BE'],
			town: 'Bruxelles',
		}
		expect(adminProfileName(abroad)).toBe('Camille Roy')
		expect(adminProfileZone(abroad)).toBe('Bruxelles (Belgique)')
		expect(adminProfileName(abroad)).not.toContain('Pas de Nom')
	})

	test('le nom d’artiste prend le relais, puis une phrase, jamais un champ vide ni « null »', () => {
		expect(adminProfileName({ artistName: 'Studio Lune' })).toBe('Studio Lune')
		expect(adminProfileName({ firstName: 'null', lastName: ' ', artistName: null })).toBe(NO_NAME_LABEL)
		expect(adminProfileName({})).toBe(NO_NAME_LABEL)
	})

	test('une commune se lit avec son rayon, comme sur la page publique', () => {
		expect(adminProfileZone({ city: { name: 'Annecy' }, radiusKm: 30, zoneKind: 'city' })).toBe(
			'Annecy et 30 km autour'
		)
	})

	test('sans zone : une phrase, et « à revoir » quand l’import a laissé une revue', () => {
		expect(adminProfileZone({})).toBe(NO_ZONE_LABEL)
		expect(adminProfileZone({ zoneReview: { reason: 'sharedPostalCode', postalCode: '74990' } })).toBe(
			'Zone à revoir (code postal 74990)'
		)
		expect(adminProfileZone({ zoneReview: { reason: 'notFound' } })).toBe('Zone à revoir')
	})

	test('la liste met la vignette et le nom en premier, puis la zone', () => {
		expect(Profiles.admin?.defaultColumns?.slice(0, 2)).toEqual(['listName', 'listZone'])
	})
})

const REVIEW = {
	reason: 'sharedPostalCode',
	postalCode: '74990',
	candidates: [
		{ inseeCode: '74990', name: 'Valbrume', department: '74' },
		{ inseeCode: '74991', name: 'Hautcombe', department: '74' },
	],
}
const VALBRUME = {
	genre: 'commune',
	commune: {
		nom: 'Valbrume',
		codeInsee: '74990',
		departement: '74',
		latitude: 45.9,
		longitude: 6.1,
		codesPostaux: ['74990'],
	},
} as const

/** A Local API that holds one profile and records what is written to it. */
function fakeWorld(review: unknown = REVIEW) {
	const writes: Record<string, unknown>[] = []
	const payload = {
		findByID: async () => ({ id: 7, zoneReview: review }),
		update: async (args: { data: Record<string, unknown>; overrideAccess: boolean }) => {
			writes.push(args as never)
			return { id: 7 }
		},
	} as unknown as Payload
	return { payload, writes }
}
const ADMIN = { id: 1, collection: 'admins', role: 'admin' } as never

describe('le choix d’une commune de la revue par un bouton', () => {
	test('enregistre la commune de la liste officielle, comme le choix de la maquilleuse', async () => {
		const { payload, writes } = fakeWorld()
		const asked: string[] = []
		const deps: ChooseCityDeps = {
			ask: async code => {
				asked.push(code)
				return VALBRUME
			},
		}

		const result = await chooseReviewCity(payload, ADMIN, 7, '74990', deps)

		expect(result).toEqual({ ok: true })
		expect(asked).toEqual(['74990'])
		expect(writes).toHaveLength(1)
		expect(writes[0]).toMatchObject({
			id: 7,
			overrideAccess: false,
			data: {
				zoneKind: 'city',
				city: { name: 'Valbrume', inseeCode: '74990', latitude: 45.9, longitude: 6.1, postalCodes: ['74990'] },
			},
		})
		// The radius and « à domicile » are not hers to change here.
		expect(Object.keys((writes[0] as { data: object }).data).toSorted()).toEqual(['city', 'zoneKind'])
	})

	test('refuse une commune qui n’est pas dans la liste de la revue, sans rien demander ni écrire', async () => {
		const { payload, writes } = fakeWorld()
		const result = await chooseReviewCity(payload, ADMIN, 7, '75056', {
			ask: async () => {
				throw new Error('must not be asked')
			},
		})
		expect(result).toMatchObject({ ok: false, code: 'not-a-candidate' })
		expect(writes).toHaveLength(0)
	})

	test('refuse un profil sans revue de zone', async () => {
		const { payload, writes } = fakeWorld({ reason: null, postalCode: null, candidates: null })
		const result = await chooseReviewCity(payload, ADMIN, 7, '74990', { ask: async () => VALBRUME })
		expect(result).toMatchObject({ ok: false, code: 'not-a-candidate' })
		expect(writes).toHaveLength(0)
	})

	test('le service des communes en panne ou qui ne connaît pas le code : rien n’est écrit', async () => {
		for (const [answer, code] of [
			[{ genre: 'panne' }, 'service-down'],
			[{ genre: 'inconnue' }, 'unknown-city'],
		] as const) {
			const { payload, writes } = fakeWorld()
			const result = await chooseReviewCity(payload, ADMIN, 7, '74990', { ask: async () => answer })
			expect(result).toMatchObject({ ok: false, code })
			expect(writes).toHaveLength(0)
		}
	})
})

describe('la première colonne de la liste mène à la fiche', () => {
	const payload = { find: async () => ({ docs: [] }) } as unknown as Payload
	const links = (node: unknown): string[] => {
		const found: string[] = []
		const walk = (value: unknown): void => {
			if (Array.isArray(value)) {
				for (const item of value) walk(item)
				return
			}
			if (typeof value !== 'object' || value === null) return
			const element = value as { props?: { href?: unknown; children?: unknown } }
			if (typeof element.props?.href === 'string') found.push(element.props.href)
			walk(element.props?.children)
		}
		walk(node)
		return found
	}

	test('avec le lien demandé par Payload, la cellule enveloppe la photo et le nom dans un lien vers la fiche', async () => {
		const { ProfileName } = await import('../../src/components/admin/ProfileName')
		const cell = await ProfileName({
			payload,
			rowData: { id: 24, firstName: 'Julie', lastName: 'Perrin' },
			link: true,
			linkURL: '/admin/collections/profiles/24',
		} as never)
		expect(links(cell)).toEqual(['/admin/collections/profiles/24'])
	})

	test('sans adresse donnée, le lien se compose avec le numéro du profil', async () => {
		const { ProfileName } = await import('../../src/components/admin/ProfileName')
		const cell = await ProfileName({ payload, rowData: { id: 7 }, link: true } as never)
		expect(links(cell)).toEqual(['/admin/collections/profiles/7'])
	})

	test('sans lien demandé, rien n’est enveloppé', async () => {
		const { ProfileName } = await import('../../src/components/admin/ProfileName')
		const cell = await ProfileName({ payload, rowData: { id: 7 } } as never)
		expect(links(cell)).toEqual([])
	})
})
