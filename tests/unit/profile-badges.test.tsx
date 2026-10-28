/**
 * Badges du 28/10/2026: the badges « Super maquilleuse » and « Vérifiée ». The words and the tier (src/lib/profile/badges.ts), the
 * badge on a card and in the head of a profile, the bonus of order of the directory (stable, a profile without badge
 * stays), the draw of « Mise en avant » and the texts of the admin. Made-up profiles, no database.
 */

import { describe, expect, test } from 'bun:test'
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { Profiles } from '@/collections/Profiles'
import { ProfileCard, ProfileRowCard } from '@/components/art/ProfileCard'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { ResultCard } from '@/components/search/ResultCard'
import {
	badgeTier,
	SUPER_ADMIN_DESCRIPTION,
	SUPER_LABEL,
	VERIFIED_ADMIN_DESCRIPTION,
	VERIFIED_LABEL,
} from '@/lib/profile/badges'
import { paginate } from '@/lib/search/pagination'
import { buildSearchView } from '@/lib/search/view'
import { featuredCandidates } from '@/services/public/featured'
import {
	type ProfileCard as Card,
	type DirectoryProfile,
	publicProfileOf,
	readDirectory,
} from '@/services/public/profiles'

const card = (extra: Partial<Card> = {}): Card => ({
	slug: 'une',
	pid: 1 as never,
	nom: 'Une Maquilleuse',
	specialite: 'Mariage',
	lieu: 'Annecy',
	superMaquilleuse: false,
	photo: null,
	...extra,
})

describe('badges : les mots et le palier', () => {
	test('un palier par case : super 2, vérifiée 1, rien 0, et seul « vrai » compte', () => {
		expect(badgeTier({ superArtist: true, verified: true })).toBe(2)
		expect(badgeTier({ superArtist: true })).toBe(2)
		expect(badgeTier({ verified: true })).toBe(1)
		expect(badgeTier({})).toBe(0)
		expect(badgeTier({ superArtist: 'true', verified: 1 })).toBe(0)
		expect(badgeTier({ superArtist: false, verified: false })).toBe(0)
	})
})

describe('badges : le badge sur les cartes', () => {
	const kinds = {
		grille: (c: Card) => renderToStaticMarkup(<ProfileCard profile={c} />),
		ligne: (c: Card) => renderToStaticMarkup(<ProfileRowCard profile={c} />),
		recherche: (c: Card) => renderToStaticMarkup(<ResultCard carte={c} prioritaire={false} />),
	}
	for (const [name, render] of Object.entries(kinds)) {
		test(`${name} : aucun badge sans la case`, () => {
			const html = render(card())
			expect(html).not.toContain(SUPER_LABEL)
			expect(html).not.toContain(VERIFIED_LABEL)
			expect(html).not.toContain('data-badge')
		})
		test(`${name} : « Super maquilleuse » seul, en texte`, () => {
			const html = render(card({ superMaquilleuse: true }))
			expect(html).toContain(`>${SUPER_LABEL}<`)
			expect(html).not.toContain(VERIFIED_LABEL)
		})
		test(`${name} : « Vérifiée » seul, en texte`, () => {
			const html = render(card({ verified: true }))
			expect(html).toContain(VERIFIED_LABEL)
			expect(html).not.toContain(SUPER_LABEL)
		})
		test(`${name} : les deux ensemble, « Super maquilleuse » lu en premier`, () => {
			const html = render(card({ superMaquilleuse: true, verified: true }))
			expect(html.indexOf(SUPER_LABEL)).toBeGreaterThan(-1)
			expect(html.indexOf(VERIFIED_LABEL)).toBeGreaterThan(html.indexOf(SUPER_LABEL))
		})
	}
	test('le badge est posé sur la photo, donc la carte ne change pas de hauteur', () => {
		const html = renderToStaticMarkup(<ProfileCard profile={card({ superMaquilleuse: true })} />)
		expect(html).toMatch(/absolute[^"]*bottom-3[^"]*"><span data-badge="super"/)
	})
	test('« Activité vérifiée » reste un autre badge, sans les deux nouveaux', () => {
		const html = renderToStaticMarkup(<ProfileCard profile={card({ activityVerified: true })} />)
		expect(html).toContain('Activité vérifiée')
		expect(html).not.toContain('data-badge')
	})
})

describe('badges : le badge dans l’en-tête d’un profil', () => {
	const base = {
		firstName: 'Une',
		lastName: 'Maquilleuse',
		slug: 'une',
		specialty: 'Mariage',
		available: true,
		status: 'published',
		publishable: true,
		indexable: true,
	} as never
	const read = (extra: object, verified?: boolean) =>
		publicProfileOf({ ...(base as object), ...extra } as never, {
			photo: null,
			galerie: [],
			coordonnees: null,
			verified,
		})
	test('la page lit les deux cases et n’en pose aucune par défaut', () => {
		const none = read({})
		expect(none.superMaquilleuse).toBeUndefined()
		expect(none.verified).toBeUndefined()
		expect(read({ superArtist: true }, true)).toMatchObject({ superMaquilleuse: true, verified: true })
		expect(read({ superArtist: false }, false).superMaquilleuse).toBeUndefined()
	})
	test('les badges et le lien vers leur légende', () => {
		const html = renderToStaticMarkup(<ProfileHeader profil={read({ superArtist: true }, true)} />)
		expect(html).toContain(SUPER_LABEL)
		expect(html).toContain(VERIFIED_LABEL)
		expect(html).toContain('href="/classement#badges"')
		expect(renderToStaticMarkup(<ProfileHeader profil={read({})} />)).not.toContain('/classement#badges')
	})
})

describe('badges : le léger coup de pouce dans l’ordre', () => {
	const doc = (id: number, slug: string, extra: object = {}) => ({
		id,
		slug,
		firstName: slug,
		lastName: 'X',
		updatedAt: '2026-10-01T00:00:00.000Z',
		...extra,
	})
	/** A directory read of four profiles, already in the order of the database (most complete first). */
	const read = async () => {
		const docs = [
			doc(1, 'a-rien'),
			doc(2, 'b-verifiee', {}),
			doc(3, 'c-super', { superArtist: true }),
			doc(4, 'd-rien'),
		]
		const verified = new Set([2])
		const payload = {
			find: async (options: { collection: string; where?: { and?: { id?: unknown; verified?: unknown }[] } }) => {
				if (options.collection !== 'profiles') return { docs: [], page: 1, totalDocs: 0, hasNextPage: false }
				const asksVerified = options.where?.and?.some(clause => 'verified' in clause)
				const found = asksVerified ? docs.filter(({ id }) => verified.has(id)) : docs
				return { docs: found, page: 1, totalDocs: found.length, hasNextPage: false }
			},
		} as unknown as Payload
		return readDirectory(payload)
	}

	test('la lecture met « Super maquilleuse », puis « Vérifiée », puis les autres, sans en perdre un seul', async () => {
		const directory = await read()
		expect(directory.map(profile => profile.carte.slug)).toEqual(['c-super', 'b-verifiee', 'a-rien', 'd-rien'])
		expect(directory.map(profile => profile.badgeTier)).toEqual([2, 1, 0, 0])
		expect(directory[1]?.carte.verified).toBe(true)
		expect(directory[0]?.carte.superMaquilleuse).toBe(true)
	})

	test('stable et déterministe : deux lectures donnent le même ordre, et l’ordre de la base départage un palier', async () => {
		const first = (await read()).map(profile => profile.carte.slug)
		const second = (await read()).map(profile => profile.carte.slug)
		expect(second).toEqual(first)
		expect(first.slice(2)).toEqual(['a-rien', 'd-rien'])
	})

	test('un profil sans badge reste trouvable, et la pagination coupe la même liste sans doublon', async () => {
		const directory = await read()
		const view = buildSearchView(directory, { search: '', city: '' }, { genre: 'unknown' })
		const all = view.places.locaux.map(profile => profile.carte.slug)
		expect(all.toSorted()).toEqual(['a-rien', 'b-verifiee', 'c-super', 'd-rien'])
		const many = Array.from({ length: 45 }, (_, i) => i)
		const pages = [1, 2, 3].flatMap(page => paginate(many, page).elements)
		expect(pages).toEqual(many)
	})
})

describe('badges : « Mise en avant » favorise les super maquilleuses sans casser la réserve « Vérifiée »', () => {
	const entry = (slug: string, flags: { verified?: boolean; super?: boolean }): DirectoryProfile =>
		({
			carte: card({ slug, nom: slug, superMaquilleuse: flags.super === true }),
			verified: flags.verified === true,
			publishable: true,
			unreachable: false,
		}) as unknown as DirectoryProfile

	test('seuls les profils « Vérifiée » sont candidats, les super maquilleuses d’abord', () => {
		const directory = [
			entry('a', { verified: true }),
			entry('b', { verified: true, super: true }),
			entry('c', { super: true }),
		]
		expect(featuredCandidates(directory, 24).map(c => c.slug)).toEqual(['b', 'a'])
	})

	test('au-delà du plafond, les super maquilleuses sont gardées en premier', () => {
		const directory = Array.from({ length: 40 }, (_, i) => entry(`p${i}`, { verified: true, super: i === 39 }))
		const kept = featuredCandidates(directory, 24, () => 0.3)
		expect(kept).toHaveLength(24)
		expect(kept[0]?.slug).toBe('p39')
	})
})

describe('badges : les cases de l’administration disent la vérité', () => {
	const description = (name: string) =>
		(Profiles.fields.find(field => 'name' in field && field.name === name) as { admin: { description: string } }).admin
			.description
	test('les deux descriptions sont celles de la source, en français simple, et gardent leurs libellés', () => {
		expect(description('superArtist')).toBe(SUPER_ADMIN_DESCRIPTION)
		expect(description('verified')).toBe(VERIFIED_ADMIN_DESCRIPTION)
		const label = (name: string) =>
			(Profiles.fields.find(field => 'name' in field && field.name === name) as { label: string }).label
		expect(label('superArtist')).toBe(SUPER_LABEL)
		expect(label('verified')).toBe(VERIFIED_LABEL)
	})
	test('elles disent le badge, le bonus de tri, la Mise en avant et que la case est publique', () => {
		for (const text of [SUPER_ADMIN_DESCRIPTION, VERIFIED_ADMIN_DESCRIPTION]) {
			expect(text).toContain('badge')
			expect(text).toContain('jamais un filtre')
			expect(text).toContain('Public')
		}
		expect(VERIFIED_ADMIN_DESCRIPTION).toContain('Mise en avant')
		expect(VERIFIED_ADMIN_DESCRIPTION).toContain('relu par l’équipe')
		expect(SUPER_ADMIN_DESCRIPTION).toContain('Mise en avant')
	})
})
