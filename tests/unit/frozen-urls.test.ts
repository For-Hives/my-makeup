/**
 * The frozen URLs (docs/migration/URLS.md): the table says what every family of addresses
 * of the old site answers after the switch, without a duplicate and without a chain of
 * redirects, and the document says the same thing as the table.
 *
 * Unit tests: files of the repository only, no network, no database.
 */

import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	applyBlocks,
	blocksOf,
	DOCUMENT_PATH,
	FROZEN_INVENTORY,
	frenchDate,
	inventoryFamily,
	renderBlocks,
	SECTIONS,
	statusCell,
} from '../../scripts/migration/urls-doc'
import {
	anonymousStatus,
	FROZEN_URL_FAMILIES,
	type FrozenStatus,
	type FrozenUrlFamily,
	familiesFor,
	familiesMeasured,
	patternShape,
	redirects,
	SITE_ORIGIN,
	splitAddress,
	UNFROZEN_PREFIXES,
	UNWANTED_404_OF_2026_10_09,
} from '../../src/lib/frozen-urls'

const ROOT = join(import.meta.dir, '../..')
const PUBLIC = join(ROOT, 'public')

const ids = (families: readonly FrozenUrlFamily[]): string[] => families.map(family => family.id)

const familyById = (id: string): FrozenUrlFamily => {
	const family = FROZEN_URL_FAMILIES.find(candidate => candidate.id === id)
	if (!family) throw new Error(`No family « ${id} » in the table`)
	return family
}

/** Keys of the patterns a family answers: origin and shape, the names of the parameters left out. */
const patternKeys = (family: FrozenUrlFamily): string[] =>
	(family.origins ?? [SITE_ORIGIN]).flatMap(origin =>
		family.patterns.map(pattern => `${origin}${patternShape(pattern)}`)
	)

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('reading an address', () => {
	test('a path of the site keeps its double slash: it is not read as a host', () => {
		expect(splitAddress('//blog')).toEqual({ origin: SITE_ORIGIN, path: '//blog', search: '' })
	})

	test('an absolute address gives its origin, its path and its query', () => {
		expect(splitAddress('HTTP://www.My-Makeup.fr/search?city=Annecy#haut')).toEqual({
			origin: 'http://www.my-makeup.fr',
			path: '/search',
			search: '?city=Annecy',
		})
		expect(splitAddress('https://my-makeup.fr').path).toBe('/')
	})

	test('the closest pattern wins: a named address before a parameter, a parameter before the rest', () => {
		expect(ids(familiesFor('/robots.txt'))).toEqual(['robots'])
		expect(ids(familiesFor('/llms.txt'))).toEqual(['llms-txt'])
		expect(ids(familiesFor('/0123456789abcdef0123456789abcdef.txt'))).toEqual(['verification-indexnow'])
		expect(ids(familiesFor('/pas-une-cle.txt'))).toEqual(['adresse-inconnue'])
		expect(ids(familiesFor('/u/script.js'))).toEqual(['mesure-script'])
		expect(ids(familiesFor('/u/api/send'))).toEqual(['mesure-envoi'])
		expect(ids(familiesFor('/u/api'))).toEqual(['mesure-autre'])
		expect(ids(familiesFor('/api/health'))).toEqual(['sante'])
		expect(ids(familiesFor('/maquilleuse'))).toEqual(['historiques'])
		expect(ids(familiesFor('/maquilleuse/partenariats'))).toEqual(['pages-fixes'])
		expect(ids(familiesFor('/maquilleuse/partenaires'))).toEqual(['historiques'])
		expect(ids(familiesFor('/profil'))).toEqual(['historiques'])
		expect(ids(familiesFor('/auth'))).toEqual(['espace-racine'])
		expect(ids(familiesFor('/auth/inconnu'))).toEqual(['adresse-inconnue'])
	})

	test('the case counts, like on the old site', () => {
		expect(ids(familiesFor('/Blog'))).toEqual(['adresse-inconnue'])
		expect(ids(familiesFor('/blog'))).toEqual(['blog'])
	})

	test('the query never changes the family', () => {
		expect(ids(familiesFor('/search?search=mariage&city=Paris'))).toEqual(['recherche'])
		expect(ids(familiesFor('/auth/error?error=erreur-inconnue'))).toEqual(['espace-erreur'])
	})

	test('a profile address in the slug format is never an old name, and the reverse', () => {
		expect(ids(familiesFor('/profil/zoe-lefevre'))).toEqual(['profil', 'profil-non-repris', 'slug-inconnu'])
		expect(ids(familiesFor('/profil/zo%C3%A9%20lef%C3%A8vre'))).toEqual([
			'profil-ancien-nom',
			'profil-non-repris',
			'slug-inconnu',
		])
		expect(ids(familiesFor('/profil/zoe-lefevre/photos'))).toEqual(['adresse-inconnue'])
	})

	test('the host is read first, then the shape of the path, then the pattern', () => {
		expect(ids(familiesFor('http://my-makeup.fr//blog/'))).toEqual(['http'])
		expect(ids(familiesFor('https://www.my-makeup.fr/blog'))).toEqual(['www'])
		expect(ids(familiesFor('https://api.my-makeup.fr/api/articles'))).toEqual(['ancienne-api'])
		expect(ids(familiesFor('//blog/'))).toEqual(['double-barre'])
		expect(ids(familiesFor('/blog/'))).toEqual(['barre-finale'])
		expect(ids(familiesFor('/search/?city=Annecy'))).toEqual(['barre-finale'])
		expect(ids(familiesFor('/'))).toEqual(['accueil'])
	})

	test('the table says nothing of another site, of the back office, of the API of Payload, of the build files', () => {
		expect(familiesFor('https://example.org/blog')).toEqual([])
		for (const address of ['/admin', '/admin/collections/pros', '/api', '/api/pros/login', '/_next/static/x.js'])
			expect(familiesFor(address)).toEqual([])
		expect(familiesFor('//api/health')).toEqual([])
		expect(familiesFor('/api/health/')).toEqual([])
		expect(UNFROZEN_PREFIXES).toEqual(['/admin', '/api', '/_next'])
	})

	test('the status measured on the old site picks the family among those that share a pattern', () => {
		expect(ids(familiesMeasured('/talent/maquillage-mariee', 200))).toEqual(['talent'])
		expect(ids(familiesMeasured('/talent/inexistant-inventaire-zz9', 404))).toEqual(['slug-inconnu'])
		// A profile that is not taken over answers like any other today: only the register tells.
		expect(ids(familiesMeasured('/profil/zoe-lefevre', 200))).toEqual(['profil', 'profil-non-repris'])
	})
})

describe('the table of the frozen URLs', () => {
	test('every family has a stable key, a status, a wording and an example', () => {
		for (const family of FROZEN_URL_FAMILIES) {
			expect(family.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
			expect(family.statusToday.length).toBeGreaterThan(0)
			expect(family.today.trim()).not.toBe('')
			expect(family.after.trim()).not.toBe('')
			expect(family.examples.length).toBeGreaterThan(0)
			// A shape rule has no pattern; every other family has at least one.
			expect({ id: family.id, patterns: family.patterns.length > 0 }).toEqual({
				id: family.id,
				patterns: family.rule === undefined,
			})
		}
	})

	test('no duplicate: a key is used once', () => {
		expect(new Set(ids(FROZEN_URL_FAMILIES)).size).toBe(FROZEN_URL_FAMILIES.length)
	})

	test('no duplicate: a pattern belongs to one family, or to families that a condition on the data tells apart', () => {
		const byKey = new Map<string, FrozenUrlFamily[]>()
		for (const family of FROZEN_URL_FAMILIES) {
			const keys = patternKeys(family)
			// Inside a family too: the same pattern is never written twice.
			expect(new Set(keys).size).toBe(keys.length)
			for (const key of keys) byKey.set(key, [...(byKey.get(key) ?? []), family])
		}
		const untold: string[] = []
		for (const [key, sharing] of byKey) {
			if (sharing.length === 1) continue
			const conditions = sharing.map(family => family.when?.trim() ?? '')
			if (conditions.includes('') || new Set(conditions).size !== sharing.length) untold.push(key)
		}
		expect(untold).toEqual([])
		// The patterns that are shared on purpose: the pages whose slug only the database knows.
		expect([...byKey].filter(([, sharing]) => sharing.length > 1).map(([key]) => key)).toEqual([
			`${SITE_ORIGIN}/blog/<>`,
			`${SITE_ORIGIN}/talent/<>`,
			`${SITE_ORIGIN}/profil/<>`,
		])
	})

	test('no duplicate: each shape rule is written once', () => {
		for (const rule of ['double-slash', 'trailing-slash'])
			expect(FROZEN_URL_FAMILIES.filter(family => family.rule === rule)).toHaveLength(1)
	})

	test('every example falls in its own family, and only in families that share its pattern', () => {
		const lost: string[] = []
		const ambiguous: string[] = []
		for (const family of FROZEN_URL_FAMILIES) {
			const own = new Set(patternKeys(family))
			for (const example of family.examples) {
				const found = familiesFor(example.from)
				if (!found.includes(family)) lost.push(`${example.from} is not in ${family.id}`)
				for (const other of found)
					if (other !== family && !patternKeys(other).some(key => own.has(key)))
						ambiguous.push(`${example.from} is in ${family.id} and in ${other.id}`)
			}
		}
		expect(lost).toEqual([])
		expect(ambiguous).toEqual([])
	})

	test('a status of redirect comes with its destination, and only then', () => {
		for (const family of FROZEN_URL_FAMILIES) {
			const redirectStatus = [301, 307, 308].includes(family.status)
			expect({ id: family.id, redirect: family.redirect !== undefined }).toEqual({
				id: family.id,
				redirect: redirectStatus,
			})
			for (const example of family.examples)
				expect({ from: example.from, to: example.to !== undefined }).toEqual({
					from: example.from,
					to: redirects(family),
				})
		}
	})

	test('a moved address answers a permanent redirect; 307 only where the session decides', () => {
		for (const family of FROZEN_URL_FAMILIES.filter(redirects)) {
			const sessionDecides = family.kind === 'espace'
			expect({ id: family.id, status: anonymousStatus(family) === 307 }).toEqual({
				id: family.id,
				status: sessionDecides,
			})
		}
	})

	test('a second accepted status is only for what the hosting answers', () => {
		const withSecondStatus = FROZEN_URL_FAMILIES.filter(family => family.alsoAccepted !== undefined)
		expect(ids(withSecondStatus)).toEqual(['http', 'www'])
		expect(withSecondStatus.map(family => family.servedBy)).toEqual(['hebergement', 'hebergement'])
		expect(ids(FROZEN_URL_FAMILIES.filter(family => family.servedBy === 'hebergement'))).toEqual([
			'http',
			'www',
			'ancienne-api',
		])
	})

	test('every section of the document lists families, and every family is in one section', () => {
		const kinds = SECTIONS.flatMap(section => section.kinds)
		expect(new Set(kinds).size).toBe(kinds.length)
		for (const family of FROZEN_URL_FAMILIES) expect(kinds).toContain(family.kind)
		for (const section of SECTIONS)
			expect(FROZEN_URL_FAMILIES.some(family => section.kinds.includes(family.kind))).toBe(true)
	})
})

describe('no chain of redirects', () => {
	const arrives = (id: string | undefined): FrozenUrlFamily | undefined =>
		id === undefined ? undefined : familyById(id)

	test('the destination family of a redirect answers 200, with or without a session', () => {
		const destinations = FROZEN_URL_FAMILIES.flatMap(family => [
			{ id: family.id, to: family.redirect?.family },
			{ id: family.id, to: family.withoutSession?.redirect.family },
		]).filter(destination => destination.to !== undefined)
		expect(destinations.length).toBeGreaterThan(0)
		for (const destination of destinations) {
			const target = arrives(destination.to)
			expect({ ...destination, status: target?.status, redirects: target ? redirects(target) : true }).toEqual({
				...destination,
				status: 200,
				redirects: false,
			})
		}
	})

	test('a redirect that names no family depends on the address: the shape rules and the hosts only', () => {
		const unnamed = FROZEN_URL_FAMILIES.filter(family => family.redirect && family.redirect.family === undefined)
		expect(ids(unnamed)).toEqual(['double-barre', 'barre-finale', 'http', 'www'])
	})

	test('every redirected example lands, in one hop, on an address that does not redirect', () => {
		let checked = 0
		for (const family of FROZEN_URL_FAMILIES) {
			for (const example of family.examples) {
				if (example.to === undefined) continue
				checked += 1
				expect(example.to).not.toBe(example.from)
				const landing = familiesFor(example.to)
				expect({ from: example.from, to: example.to, known: landing.length > 0 }).toEqual({
					from: example.from,
					to: example.to,
					known: true,
				})
				expect({ from: example.from, to: example.to, redirecting: ids(landing.filter(redirects)) }).toEqual({
					from: example.from,
					to: example.to,
					redirecting: [],
				})
				// The landing page exists: an address is never redirected to a 404.
				expect(landing.some(landed => anonymousStatus(landed) === 200)).toBe(true)
			}
		}
		expect(checked).toBeGreaterThan(15)
	})

	test('an address with two defects gets one redirect, to the final destination', () => {
		const example = (id: string, from: string): string | undefined =>
			familyById(id).examples.find(candidate => candidate.from === from)?.to
		// `/toutes-les-news` is itself redirected: its malformed variants go straight to `/blog`.
		expect(example('double-barre', '//toutes-les-news')).toBe('/blog')
		expect(example('barre-finale', '/toutes-les-news/')).toBe('/blog')
		// The old chain of two hops from http://www is one hop after the switch.
		expect(example('www', 'http://www.my-makeup.fr/')).toBe('/')
	})

	test('a private page sends an anonymous visitor straight to the sign-in page, never through another redirect', () => {
		const privatePages = familyById('espace-prive')
		expect(privatePages.status).toBe(200)
		expect(privatePages.withoutSession?.status).toBe(307)
		expect(ids(familiesFor('/auth/signin?callbackUrl=%2Fauth%2Fprofil'))).toEqual(['espace-connexion'])
		expect(redirects(familyById('espace-connexion'))).toBe(false)
		// `/profil` moved to `/auth/profil` in 2023: a redirect there would make two hops.
		expect(familyById('historiques').patterns).toContain('/profil')
		expect(familyById('historiques').status).toBe(404)
	})
})

describe('every row of plan 01 §6.3 is in the table, with its expected status', () => {
	const PLAN_ROWS: ReadonlyArray<{ row: number; status: FrozenStatus; addresses: readonly string[] }> = [
		{ row: 1, status: 200, addresses: ['/profil/zoe-lefevre'] },
		{ row: 2, status: 308, addresses: ['/profil/zo%C3%A9%20lef%C3%A8vre', '/profil/Zoe-Lefevre'] },
		{ row: 3, status: 301, addresses: ['//profil/zoe-lefevre', '//blog', '/blog//article'] },
		{ row: 4, status: 200, addresses: ['/talent/maquillage-mariee', '/blog/prix-maquillage-mariee-2027'] },
		{ row: 5, status: 301, addresses: ['/toutes-les-news'] },
		{ row: 6, status: 200, addresses: ['/search?search=mariage&city=Annecy', '/search?specialite=mariage&page=2'] },
		{
			row: 7,
			status: 200,
			addresses: [
				'/auth/signin',
				'/auth/signup',
				'/auth/profil',
				'/auth/init-account',
				'/auth/mot-de-passe-oublie',
				'/auth/reinitialiser',
			],
		},
		{ row: 8, status: 200, addresses: ['/auth/verification-complete', '/auth/verification-wall'] },
		{ row: 9, status: 404, addresses: ['/api/auth/signin', '/api/auth/callback/google', '/api/sendMail'] },
		{ row: 10, status: 200, addresses: ['/mentions-legales'] },
		{
			row: 11,
			status: 404,
			addresses: ['/profil/slug-inconnu', '/talent/slug-inconnu', '/blog/slug-inconnu'],
		},
		{ row: 12, status: 301, addresses: ['https://api.my-makeup.fr/', 'https://api.my-makeup.fr/api/articles'] },
		{ row: 13, status: 200, addresses: ['/sitemap.xml', '/robots.txt', '/site-map'] },
	]

	test('the 13 rows, each once', () => {
		expect(PLAN_ROWS.map(planRow => planRow.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
		const carried = new Set(
			FROZEN_URL_FAMILIES.flatMap(family => (family.planRow === undefined ? [] : [family.planRow]))
		)
		expect([...carried].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
	})

	for (const { row, status, addresses } of PLAN_ROWS) {
		test(`row ${row}: ${status}`, () => {
			for (const address of addresses) {
				const carrying = familiesFor(address).filter(family => family.planRow === row)
				expect({ address, families: carrying.length }).toEqual({ address, families: 1 })
				expect({ address, status: carrying[0]?.status }).toEqual({ address, status })
			}
		})
	}

	test('rows 2, 3, 5 and 12 are redirects in one hop', () => {
		expect(familyById('profil-ancien-nom').redirect?.family).toBe('profil')
		expect(familyById('toutes-les-news').redirect?.family).toBe('blog')
		expect(familyById('ancienne-api').redirect?.family).toBe('accueil')
		expect(statusCell(familyById('double-barre'))).toBe('301 en un saut')
	})

	test('the technical addresses: health, /u, sitemap, robots', () => {
		const expected: ReadonlyArray<[string, FrozenStatus]> = [
			['/api/health', 200],
			['/u/script.js', 200],
			['/u/api/send', 405],
			['/u/autre-chemin', 404],
			['/u', 404],
			['/sitemap.xml', 200],
			['/robots.txt', 200],
			['/llms.txt', 200],
		]
		for (const [address, status] of expected) {
			const found = familiesFor(address)
			expect({ address, families: found.length }).toEqual({ address, families: 1 })
			expect({ address, status: found[0]?.status, kind: found[0]?.kind }).toEqual({
				address,
				status,
				kind: 'technique',
			})
		}
	})
})

describe('the 13 unwanted 404 of 2026-10-09, one by one', () => {
	const paths = UNWANTED_404_OF_2026_10_09.map(entry => entry.path)

	test('13 addresses, each once, each with what it was and why its 404 is kept', () => {
		expect(paths).toHaveLength(13)
		expect(new Set(paths).size).toBe(13)
		for (const entry of UNWANTED_404_OF_2026_10_09) {
			expect(entry.was.trim()).not.toBe('')
			expect(entry.reason.trim().length).toBeGreaterThan(20)
		}
	})

	test('they are the 404 of the inventory that nobody invented', () => {
		const invented = new Set(['slug-inconnu', 'adresse-inconnue'])
		const unwanted = FROZEN_INVENTORY.addresses
			.filter(entry => entry.first === 404 && !invented.has(inventoryFamily(entry).id))
			.map(entry => entry.address)
		expect([...unwanted].sort()).toEqual([...paths].sort())
	})

	test('each one is an expected 404 of the table, in one family, unless a ticket created the page since', () => {
		for (const entry of UNWANTED_404_OF_2026_10_09) {
			const { path } = entry
			const found = familiesFor(path)
			expect({ path, families: found.length }).toEqual({ path, families: 1 })
			expect({ path, status: found[0]?.status, kind: found[0]?.kind }).toEqual(
				entry.createdBy ? { path, status: 200, kind: 'technique' } : { path, status: 404, kind: 'historique' }
			)
		}
	})

	test('only the guide for the assistants was created since (ticket 1014)', () => {
		const created = UNWANTED_404_OF_2026_10_09.filter(entry => entry.createdBy)
		expect(created.map(entry => [entry.path, entry.createdBy])).toEqual([['/llms.txt', '1014']])
	})

	test('a page that took over is a page of the table that answers 200', () => {
		const successors = UNWANTED_404_OF_2026_10_09.flatMap(entry => (entry.successor ? [entry.successor] : []))
		expect(successors).toHaveLength(6)
		for (const successor of successors) {
			const found = familiesFor(successor)
			expect({ successor, families: found.length }).toEqual({ successor, families: 1 })
			expect({ successor, status: found[0]?.status }).toEqual({ successor, status: 200 })
		}
	})
})

describe('the frozen inventory', () => {
	test('207 addresses read on 2026-10-14, 206 on 2026-10-09', () => {
		const real = FROZEN_INVENTORY.profiles.reduce((sum, profile) => sum + profile.count, 0)
		expect(FROZEN_INVENTORY.total).toBe(207)
		expect(FROZEN_INVENTORY.previousTotal).toBe(206)
		expect(FROZEN_INVENTORY.addresses.length + real).toBe(FROZEN_INVENTORY.total)
		expect(frenchDate(FROZEN_INVENTORY.readAt)).toBe('14/10/2026 à 00:07 UTC')
	})

	test('an address is listed once', () => {
		const addresses = FROZEN_INVENTORY.addresses.map(entry => entry.address)
		expect(new Set(addresses).size).toBe(addresses.length)
	})

	test('every address has one family, the one its measured status agrees with', () => {
		const ambiguous: string[] = []
		for (const entry of FROZEN_INVENTORY.addresses) {
			const family = inventoryFamily(entry)
			expect(family.statusToday).toContain(entry.first)
			// Families that share a pattern apart, an address never falls in two patterns.
			const own = new Set(patternKeys(family))
			for (const other of familiesFor(entry.address))
				if (other !== family && !patternKeys(other).some(key => own.has(key)))
					ambiguous.push(`${entry.address} is in ${family.id} and in ${other.id}`)
		}
		expect(ambiguous).toEqual([])
	})

	test('no address answered a server error, and none ended anywhere else than on 200, 404 or 405', () => {
		for (const entry of FROZEN_INVENTORY.addresses) {
			expect(entry.first).toBeLessThan(500)
			expect([200, 404, 405]).toContain(entry.final)
		}
	})

	test('the profile addresses are numbers: each case has a family measured with its status', () => {
		expect(FROZEN_INVENTORY.profiles.map(profile => profile.count)).toEqual([15, 26, 13, 60, 1, 1])
		for (const profile of FROZEN_INVENTORY.profiles) {
			expect(familyById(profile.family).statusToday).toContain(profile.first)
			expect(profile.case).not.toMatch(/\/profil\/[^…<]/)
		}
	})

	test('the complementary readings fall in the family they name, or in none when the address is not frozen', () => {
		expect(FROZEN_INVENTORY.complements).toHaveLength(18)
		for (const entry of FROZEN_INVENTORY.complements) {
			if (entry.family === null) {
				expect(entry.address === undefined ? ['?'] : ids(familiesFor(entry.address))).toEqual([])
				continue
			}
			expect(familyById(entry.family).statusToday).toContain(entry.first)
			if (entry.address !== undefined)
				expect({ address: entry.address, families: ids(familiesMeasured(entry.address, entry.first)) }).toEqual({
					address: entry.address,
					families: [entry.family],
				})
		}
	})
})

describe('no real profile path in the repository', () => {
	/** The only profile segments written anywhere: patterns, and names nobody bears on the site. */
	const FICTIONAL = new Set([
		'<slug>',
		'<ancien-nom>',
		'…',
		'zoe-lefevre',
		'zo%C3%A9%20lef%C3%A8vre',
		'Zoe-Lefevre',
		'audit-inexistant-zz9',
		'profil-vide-non-repris',
	])
	const FILES = ['src/lib/frozen-urls.ts', 'docs/migration/urls-inventaire.json', 'docs/migration/URLS.md']

	for (const file of FILES) {
		test(file, () => {
			const text = readFileSync(join(ROOT, file), 'utf8')
			const segments = [...text.matchAll(/\/profil\/([^\s`'"|,;:)/]+)/g)].map(match => match[1] ?? '')
			expect(segments.length).toBeGreaterThan(0)
			expect(segments.filter(segment => !FICTIONAL.has(segment))).toEqual([])
		})
	}

	test('the inventory keeps no profile address but an invented one', () => {
		const profileAddresses = FROZEN_INVENTORY.addresses
			.map(entry => entry.address)
			.filter(address => address.includes('/profil/'))
		expect(profileAddresses).toEqual(['/profil/audit-inexistant-zz9'])
	})
})

describe('the verification files of the search engines', () => {
	const bing = familyById('verification-bing')
	const indexnow = familyById('verification-indexnow')

	test('both are expected in 200, with the bytes the old site serves', () => {
		for (const family of [bing, indexnow]) {
			expect(family.status).toBe(200)
			expect(family.sha256).toMatch(/^[0-9a-f]{64}$/)
		}
		expect(ids(FROZEN_URL_FAMILIES.filter(family => family.kind === 'verification'))).toEqual([
			'verification-bing',
			'verification-indexnow',
		])
		expect(ids(FROZEN_URL_FAMILIES.filter(family => family.sha256 !== undefined))).toEqual([
			'verification-bing',
			'verification-indexnow',
		])
	})

	test('/BingSiteAuth.xml is in public/ with the frozen content', () => {
		expect(ids(familiesFor('/BingSiteAuth.xml'))).toEqual(['verification-bing'])
		expect(sha256(join(PUBLIC, 'BingSiteAuth.xml'))).toBe(bing.sha256 ?? '')
	})

	test('the IndexNow key file is no file of public/ (ticket 219): its address is a frozen family, served from INDEXNOW_KEY', () => {
		expect(readdirSync(PUBLIC).filter(name => /^[0-9a-f]{32}\.txt$/.test(name))).toEqual([])
		expect(ids(familiesFor('/0123456789abcdef0123456789abcdef.txt'))).toEqual(['verification-indexnow'])
	})

	test('the table does not repeat the key', () => {
		const key = readFileSync(join(ROOT, '.env.exemple'), 'utf8').match(/^INDEXNOW_KEY=(.*)$/m)?.[1]
		// The example file holds the name of the variable and no value; nothing of the repository holds a real key.
		expect(key).toBe('')
		for (const file of ['src/lib/frozen-urls.ts', 'docs/migration/urls-inventaire.json', 'docs/migration/URLS.md'])
			expect(readFileSync(join(ROOT, file), 'utf8')).not.toMatch(/\b(?!0{32}\b)[0-9a-f]{32}\.txt/)
	})

	test('the old site read both files with the bytes of public/ on 2026-10-14', () => {
		const read = FROZEN_INVENTORY.complements.filter(entry => entry.family?.startsWith('verification-'))
		expect(read.map(entry => [entry.family, entry.first, entry.sameBytesAsRepository])).toEqual([
			['verification-bing', 200, true],
			['verification-indexnow', 200, true],
		])
	})

	test('the public files given as examples exist', () => {
		for (const example of familyById('fichiers-publics').examples)
			expect({ file: example.from, exists: existsSync(join(PUBLIC, example.from)) }).toEqual({
				file: example.from,
				exists: true,
			})
	})
})

describe('the document says what the table says', () => {
	const document = readFileSync(DOCUMENT_PATH, 'utf8')

	test('every table of the document is the one written from the table: bun scripts/migration/urls-doc.ts', () => {
		expect(applyBlocks(document, renderBlocks())).toBe(document)
	})

	test('every block is in the document, once', () => {
		expect([...blocksOf(document)].sort()).toEqual(Object.keys(renderBlocks()).sort())
	})

	test('every family, every one of the 13 addresses and every inventory address is written in it', () => {
		for (const family of FROZEN_URL_FAMILIES) expect(document).toContain(`| \`${family.id}\` |`)
		for (const entry of UNWANTED_404_OF_2026_10_09) expect(document).toContain(`| \`${entry.path}\` |`)
		for (const entry of FROZEN_INVENTORY.addresses) expect(document).toContain(`| \`${entry.address}\` |`)
		expect(document).toContain('**207 adresses**')
	})

	test('a block the document does not hold is an error, not a silent skip', () => {
		expect(() => applyBlocks(document, { 'bloc-absent': 'x' })).toThrow('bloc-absent')
	})

	test('a table that changed is seen', () => {
		const altered = document.replace('| `toutes-les-news` |', '| `toutes-les-nouvelles` |')
		expect(altered).not.toBe(document)
		expect(applyBlocks(altered, renderBlocks())).toBe(document)
	})
})
