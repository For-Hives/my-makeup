/**
 * The parity of the addresses (ticket 072; plan 02 I45): for each frozen address, the status the
 * table promises and the same h1 as the old site. The cases, the h1 of the old site (as hashes) and
 * the checks are here; tests/e2e/url-parity.spec.ts runs them against the application of the bench.
 *
 * Two lists of cases:
 * - on the bench: the clear addresses of the frozen inventory, the examples of the table, and the
 *   fictional set (profiles, talents, articles) for the families that depend on the data;
 * - on demand, on the imported copy: the private list of the measuring tool
 *   (`PARITE_URLS_LISTE=<baseline csv>`), which holds real profile addresses. Those are never written
 *   anywhere: a profile is shown as « profil #n », and only the number of addresses per family is
 *   printed.
 *
 * The h1 of the old site is compared as the SHA-256 the measuring tool computed (the text itself
 * stays out of the repository's test output). The h1 text is read exactly as that tool reads it
 * (`texteDe` and `sansScripts`, plans/outils/migration/src/inventaire-urls.ts): a different way of
 * reading it would never match.
 *
 * Nothing here opens a connection: `verifier` is given a function that fetches.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
	anonymousStatus,
	FROZEN_URL_FAMILIES,
	type FrozenUrlFamily,
	familiesFor,
	familiesMeasured,
	SITE_ORIGIN,
	splitAddress,
} from '../../src/lib/frozen-urls'
import { indexNowKey } from '../../src/lib/seo/indexnow'

/* ------------------------------------------------------------------------------------------
 * Reading the h1 like the measuring tool
 * ---------------------------------------------------------------------------------------- */

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(texte: string): string {
	return texte.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (brut, nom: string) => {
		if (nom.startsWith('#')) {
			const code =
				nom[1] === 'x' || nom[1] === 'X' ? Number.parseInt(nom.slice(2), 16) : Number.parseInt(nom.slice(1), 10)
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : brut
		}
		return ENTITIES[nom.toLowerCase()] ?? brut
	})
}

const withoutScripts = (html: string): string =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
		.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')

const textOf = (fragment: string): string =>
	decodeEntities(fragment.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim()

export const sha256 = (texte: string): string => createHash('sha256').update(texte).digest('hex')

/** The texts of the h1 of a page of HTML. */
export const mainTitles = (html: string): string[] =>
	[...withoutScripts(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map(m => textOf(m[1] ?? ''))

/** The `<title>` of a page of HTML, entities decoded. */
export const tabTitle = (html: string): string =>
	textOf(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(withoutScripts(html))?.[1] ?? '')

/** The length the title of the tab of a talent is written to (ticket 108; Bing asks for 50 to 60 characters). */
export const TALENT_TITLE_MIN = 50
export const TALENT_TITLE_MAX = 60

/**
 * What is wrong with the title of the tab of a page of a talent once the newsroom has written it (ticket
 * 108): 50 to 60 characters, and not the h1. A title the newsroom did not write is the short one, with the
 * brand after it, and fails the first test.
 */
export function talentTitleDefaults(html: string): string[] {
	const title = tabTitle(html)
	const defaults: string[] = []
	if (title.length < TALENT_TITLE_MIN || title.length > TALENT_TITLE_MAX)
		defaults.push(
			`titre de l’onglet de ${title.length} caractères au lieu de ${TALENT_TITLE_MIN} à ${TALENT_TITLE_MAX}`
		)
	if (mainTitles(html).includes(title)) defaults.push('titre de l’onglet identique au h1')
	return defaults
}

/** What the old site's measuring tool keeps of the h1 of a page: their number, and the hash of their texts. */
export function titleFingerprint(html: string): { n: number; sha: string | null } {
	const titles = mainTitles(html)
	return { n: titles.length, sha: titles.length > 0 ? sha256(titles.join('\n')) : null }
}

/* ------------------------------------------------------------------------------------------
 * What the old site's h1 were: the fixture
 * ---------------------------------------------------------------------------------------- */

/** The h1 of the old site for the clear addresses of the inventory: their number and their hash. */
export type OldSiteTitles = Readonly<Record<string, { n: number; sha: string | null }>>

/** The answer expected for the h1 of a page. */
export type TitleWaiting = { mode: 'hash'; sha: string } | { mode: 'un' } | { mode: 'aucun' }

/* ------------------------------------------------------------------------------------------
 * The cases
 * ---------------------------------------------------------------------------------------- */

export interface ParityCase {
	/** Requested path, with its query. */
	adresse: string
	/** What the report and a failure say: the address, or « profil #n » for a real one. */
	etiquette: string
	/** The id of the family in the frozen table. */
	famille: string
	/** First statuses accepted. */
	statuts: readonly number[]
	/** Where the single redirect lands, when there is one. */
	vers?: string
	/** The status the destination answers. */
	statutFinal: number
	/** The family of the page the redirect ends on. */
	familleFinale?: string
	titre: TitleWaiting | 'non-verifie'
	/** The title of the tab must be the one the newsroom wrote (50 to 60 characters, not the h1): the imported talents. */
	titreDeLOngletRequis?: true
	/** The path a 200 answer must name as its canonical (family `double-barre`: the address without its repeated slashes). */
	canonique?: string
	/** A real profile: no address of it is written in any message. */
	masque?: true
	/** A difference we know about and do not hide: the case is reported, not counted green or red. */
	ecartConnu?: string
}

/** The families the hosting answers for (domains, TLS): nothing the application can show. */
/** The addresses of the frozen inventory (docs/migration/urls-inventaire.json), read as a file: Playwright runs under Node. */
interface FrozenInventory {
	addresses: { address: string; first: number }[]
	complements: { address?: string; family: string | null; first: number }[]
}

const FROZEN_INVENTORY: FrozenInventory = JSON.parse(
	readFileSync(new URL('../../docs/migration/urls-inventaire.json', import.meta.url), 'utf8')
)

/** The one family of an inventory address: the candidate measured with its first status. */
function inventoryFamily(entree: { address: string; first: number }): FrozenUrlFamily {
	const found = familiesMeasured(entree.address, entree.first)
	const [family] = found
	if (!family || found.length !== 1)
		throw new Error(`${entree.address} (${entree.first}) : ${found.length} familles au lieu d'une`)
	return family
}

/**
 * The table writes the key file of IndexNow with a key of zeros: the real key is the variable INDEXNOW_KEY
 * (ticket 219), the one the application under test is given. Without it the address stays the one of zeros,
 * which answers 404.
 */
function keyIndexNowUrl(adresse: string): string {
	if (!/^\/0{32}\.txt$/.test(adresse)) return adresse
	const key = indexNowKey()
	return key ? `/${key}.txt` : adresse
}

const HOSTING_FAMILIES = new Set(
	FROZEN_URL_FAMILIES.filter(({ servedBy }) => servedBy === 'hebergement').map(({ id }) => id)
)

const GAP_DOUBLE_BAR =
	'Derrière Traefik, `//` est nettoyé avant l’application : la page répond 200 avec le canonical du chemin propre, sans redirection (hors Traefik, Next répond lui-même un 308, et deux sauts si la destination redirige encore).'

/** The path and query of an address with its repeated slashes collapsed: what its canonical must say. */
const collapsedPath = (adresse: string): string => {
	const read = splitAddress(adresse)
	return (read.path.replace(/\/{2,}/g, '/') || '/') + read.search
}

/** The first statuses a case of the family `double-barre` accepts: 301, 308 and the 200 of a proxy that cleans the path. */
const DOUBLE_BAR_STATUSES: readonly number[] = [301, 308, 200]

/** The href of the canonical link of a page of HTML, or `null` when it has none. */
export function canonicalOf(html: string): string | null {
	for (const tag of withoutScripts(html).matchAll(/<link\b[^>]*>/gi)) {
		if (!/\brel\s*=\s*["']?canonical["']?/i.test(tag[0])) continue
		const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[0])
		return decodeEntities(href?.[1] ?? href?.[2] ?? '') || null
	}
	return null
}

const familyById = (id: string): FrozenUrlFamily => {
	const family = FROZEN_URL_FAMILIES.find(candidate => candidate.id === id)
	if (!family) throw new Error(`Famille inconnue de la table des adresses gelées : ${id}`)
	return family
}

/** The family of an address that answers `statut`, when the table tells it. */
function familyOf(adresse: string, statut: number): string | undefined {
	return (familiesMeasured(adresse, statut)[0] ?? familiesFor(adresse)[0])?.id
}

const withoutOrigin = (adresse: string): string => splitAddress(adresse).path + splitAddress(adresse).search

/** Pages of the space whose h1 was rewritten in the v3 (register line `espace-titres-tutoiement`). */
const REWRITTEN_DASHBOARD_TITLES: readonly string[] = [
	'/auth/signin',
	'/auth/signup',
	'/auth/verification-wall',
	'/auth/verification-complete',
]

/** The expectation for the h1 of the page an address ends on. */
export function titleWaiting(adresseFinale: string, statutFinal: number, anciens: OldSiteTitles): TitleWaiting {
	const path = splitAddress(adresseFinale).path
	// A search page used to be the same empty shell whatever the search: its h1 now says what was searched (CHANGEMENTS-VOULUS).
	if (path === '/search' && splitAddress(adresseFinale).search !== '') return { mode: 'un' }
	// The four pages of the sign-in and of the confirmation say « tu » and drop « sur My-Makeup »: one h1, and the text of the old site is not compared (CHANGEMENTS-VOULUS, `espace-titres-tutoiement`).
	if (REWRITTEN_DASHBOARD_TITLES.includes(path)) return { mode: 'un' }
	const old = anciens[adresseFinale]
	if (old?.n === 1 && old.sha) return { mode: 'hash', sha: old.sha }
	if (old && old.n === 0) return { mode: 'aucun' }
	if (statutFinal === 404) {
		const page404 = anciens['/page-inexistante-audit-zz']
		if (page404?.sha) return { mode: 'hash', sha: page404.sha }
	}
	// An address with two h1 on the old site (several fixed pages) must have one: « 1 h1 par page » (plan 01 §3.5).
	return { mode: 'un' }
}

function caseSinceFamily(
	famille: FrozenUrlFamily,
	exemple: { from: string; to?: string },
	anciens: OldSiteTitles
): ParityCase {
	const direct = anonymousStatus(famille)
	const redirected = direct === 301 || direct === 307 || direct === 308
	const to = redirected && exemple.to ? withoutOrigin(exemple.to) : undefined
	const statusFinal = redirected ? 200 : direct
	const statuses = famille.rule === 'double-slash' ? DOUBLE_BAR_STATUSES : [direct, ...(famille.alsoAccepted ?? [])]
	const finale = to ?? exemple.from
	const verifiable =
		!/\.(txt|xml|js|webp|jpg|png|json)$/i.test(splitAddress(finale).path) && !finale.startsWith('/api/')
	return {
		adresse: exemple.from,
		etiquette: exemple.from,
		famille: famille.id,
		statuts: statuses,
		...(to ? { vers: to, familleFinale: familyOf(to, statusFinal) } : {}),
		statutFinal: statusFinal,
		titre: verifiable ? titleWaiting(finale, statusFinal, anciens) : 'non-verifie',
		...(famille.rule === 'double-slash' ? { ecartConnu: GAP_DOUBLE_BAR, canonique: collapsedPath(exemple.from) } : {}),
	}
}

/** The made-up pages that the cases of the families depending on the data use. */
export interface DatasetData {
	/** `/profil/<slug>` that answer 200, and those that answer 404 (hidden). */
	profilsVisibles: readonly string[]
	profilsMasques: readonly string[]
	/** The old username of a profile, as it is written in an address, and the slug it goes to. */
	ancienNom: { ecrit: string; slug: string } | null
	/** `/talent/<slug>` of published talents. */
	talents: readonly string[]
	/** `/blog/<slug>` of a published article, and of a draft (which answers 404). */
	articlesPublies: readonly string[]
	articlesBrouillons: readonly string[]
}

/**
 * The cases of the bench: the clear addresses of the frozen inventory whose answer does not depend
 * on the data, the examples of the table, and made-up pages for the ones that do.
 */
export function benchCase(anciens: OldSiteTitles, jeu: DatasetData): ParityCase[] {
	const testCase = new Map<string, ParityCase>()
	const add = (c: ParityCase): void => {
		if (!testCase.has(c.adresse)) testCase.set(c.adresse, c)
	}
	const talentsSlugs = new Set(jeu.talents)
	// What the bench cannot hold: the real articles and talents of the site (the import carries them).
	const profileSlugs = new Set([...jeu.profilsVisibles, ...jeu.profilsMasques])
	const dependsData = (adresse: string): boolean => {
		// A repeated slash in front (`//profil/…`) is the same address once it is normalised.
		const [, first, slug] = splitAddress(adresse).path.replace(/^\/+/, '/').split('/')
		// A real profile of the site: the bench holds the profiles of its own set only (ticket 104).
		if (first === 'profil' && slug) return !profileSlugs.has(slugWritten(slug))
		if (first === 'blog' && slug) return !/^inexistant-/.test(slug)
		if (first === 'talent' && slug) return !talentsSlugs.has(slug) && !/^inexistant-/.test(slug)
		return false
	}
	const inventory = [
		...FROZEN_INVENTORY.addresses,
		...FROZEN_INVENTORY.complements.flatMap(complement =>
			complement.address && complement.family ? [{ address: complement.address, first: complement.first }] : []
		),
	]
	for (const entry of inventory) {
		if (splitAddress(entry.address).origin !== SITE_ORIGIN) continue
		if (dependsData(entry.address)) continue
		let family: FrozenUrlFamily
		try {
			family = inventoryFamily(entry)
		} catch {
			continue
		}
		if (HOSTING_FAMILIES.has(family.id)) continue
		const example = family.examples.find(({ from }) => from === entry.address)
		add(caseSinceFamily(family, example ?? { from: entry.address }, anciens))
	}
	for (const family of FROZEN_URL_FAMILIES) {
		if (HOSTING_FAMILIES.has(family.id)) continue
		for (const example of family.examples) {
			if (splitAddress(example.from).origin !== SITE_ORIGIN) continue
			// Their data is the real one of the site: the cases below say the same with the set.
			if (family.kind === 'profil' || dependsData(example.from)) continue
			add(caseSinceFamily(family, { ...example, from: keyIndexNowUrl(example.from) }, anciens))
		}
	}
	const profile = familyById('profil')
	const unknown = familyById('slug-inconnu')
	for (const slug of jeu.profilsVisibles) add(caseSinceFamily(profile, { from: `/profil/${slug}` }, anciens))
	for (const slug of jeu.profilsMasques) add(caseSinceFamily(unknown, { from: `/profil/${slug}` }, anciens))
	if (jeu.ancienNom)
		add(
			caseSinceFamily(
				familyById('profil-ancien-nom'),
				{ from: `/profil/${jeu.ancienNom.ecrit}`, to: `/profil/${jeu.ancienNom.slug}` },
				anciens
			)
		)
	for (const slug of jeu.talents) add(caseSinceFamily(familyById('talent'), { from: `/talent/${slug}` }, anciens))
	for (const slug of jeu.articlesPublies)
		add(caseSinceFamily(familyById('article'), { from: `/blog/${slug}` }, anciens))
	for (const slug of jeu.articlesBrouillons)
		add(caseSinceFamily(familyById('slug-inconnu'), { from: `/blog/${slug}` }, anciens))
	return [...testCase.values()]
}

/* ------------------------------------------------------------------------------------------
 * The private list: the imported copy
 * ---------------------------------------------------------------------------------------- */

/** Splits a CSV (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes) into records. */
export function readCsv(texte: string): Record<string, string>[] {
	const lines: string[][] = []
	let field = ''
	let line: string[] = []
	let quotes = false
	for (let i = 0; i < texte.length; i++) {
		const c = texte[i]
		if (quotes) {
			if (c === '"' && texte[i + 1] === '"') {
				field += '"'
				i++
			} else if (c === '"') quotes = false
			else field += c
		} else if (c === '"') quotes = true
		else if (c === ',') {
			line.push(field)
			field = ''
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && texte[i + 1] === '\n') i++
			line.push(field)
			field = ''
			if (line.some(valeur => valeur !== '')) lines.push(line)
			line = []
		} else field += c
	}
	if (field !== '' || line.length > 0) {
		line.push(field)
		lines.push(line)
	}
	const [headers = [], ...corps] = lines
	return corps.map(valeurs => Object.fromEntries(headers.map((nom, i) => [nom, valeurs[i] ?? ''])))
}

/** A path segment as it was written, decoded when it can be. */
const slugWritten = (segment: string): string => {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

const isProfileUrl = (chemin: string): boolean => /^\/{1,2}profil\/[^/]+/.test(chemin)

/**
 * The cases of the imported copy, from the private list of the measuring tool (its baseline CSV).
 * A real profile shows as « profil #n »: its address is read to be requested, never to be written.
 */
export function privateListCase(csv: string): ParityCase[] {
	const testCase: ParityCase[] = []
	let number = 0
	for (const line of readCsv(csv)) {
		const url = (line.chemin ?? '') + (line.url?.includes('?') ? `?${line.url.split('?')[1]}` : '')
		const first = Number(line.statut_initial)
		if (!url || !Number.isFinite(first) || !line.url?.startsWith(SITE_ORIGIN)) continue
		const families = familiesMeasured(url, first)
		const [family] = families
		if (!family || HOSTING_FAMILIES.has(family.id)) continue
		const profile = isProfileUrl(url)
		if (profile) number++
		// The 13 empty profiles of the spam answer 404 and are not told apart from the others by the list.
		const ambiguous = families.length > 1
		const direct = anonymousStatus(family)
		const redirected = direct === 301 || direct === 307 || direct === 308
		const sha = line.h1_sha256 || null
		const n = Number(line.h1_nb)
		testCase.push({
			adresse: url,
			etiquette: profile ? `profil #${number}` : url,
			...(profile || isProfileUrl(withoutOrigin(line.url_finale ?? '')) ? { masque: true as const } : {}),
			famille: family.id,
			statuts: [
				...new Set(
					family.rule === 'double-slash'
						? DOUBLE_BAR_STATUSES
						: [direct, ...(ambiguous ? families.map(anonymousStatus) : (family.alsoAccepted ?? []))]
				),
			],
			...(redirected && line.url_finale
				? { vers: withoutOrigin(line.url_finale), familleFinale: familyOf(withoutOrigin(line.url_finale), 200) }
				: {}),
			statutFinal: redirected ? 200 : direct,
			titre:
				line.type !== 'html'
					? 'non-verifie'
					: n === 1 && sha && !(splitAddress(url).path === '/search' && splitAddress(url).search !== '')
						? { mode: 'hash', sha }
						: { mode: 'un' },
			...(family.rule === 'double-slash' ? { ecartConnu: GAP_DOUBLE_BAR, canonique: collapsedPath(url) } : {}),
			// A talent of the imported copy: its tab is titled by the newsroom (ticket 108).
			...(family.id === 'talent' && !redirected && direct === 200 ? { titreDeLOngletRequis: true as const } : {}),
		})
	}
	return testCase
}

/** Reads the private list the run points at (`PARITE_URLS_LISTE`), or `null` for a run on the bench set. */
export function privateList(variables: Record<string, string | undefined> = process.env): ParityCase[] | null {
	const path = variables.PARITE_URLS_LISTE
	return path ? privateListCase(readFileSync(path, 'utf8')) : null
}

/* ------------------------------------------------------------------------------------------
 * The check
 * ---------------------------------------------------------------------------------------- */

/** What one request gave back. */
export interface Reply {
	status: number
	location: string | null
	contentType: string | null
	corps: () => Promise<string>
}

/** Requests an address once, without following a redirect. */
export type Find = (adresse: string) => Promise<Reply>

/**
 * `defauts`: what is wrong with the address itself (its status, where its redirect goes).
 * `destination`: what is wrong with the page a right redirect ends on. It belongs to the family of that
 * page, which may not be delivered yet.
 */
export type Result =
	| { etat: 'vert'; destination: string[] }
	| { etat: 'rouge'; defauts: string[]; destination: string[] }
	| { etat: 'ecart'; raison: string; defauts: string[]; destination: string[] }

const isPageHtml = (reponse: Reply): boolean => (reponse.contentType ?? '').includes('text/html')

async function checkTitle(cas: ParityCase, reponse: Reply): Promise<string[]> {
	if (cas.titre === 'non-verifie' || !isPageHtml(reponse)) return []
	const waiting = cas.titre
	const html = await reponse.corps()
	const { n, sha } = titleFingerprint(html)
	if (waiting.mode === 'aucun') return n === 0 ? [] : [`${n} h1 au lieu de 0`]
	if (n !== 1) return [`${n} h1 au lieu d'un seul`]
	if (waiting.mode === 'hash' && sha !== waiting.sha) return ['h1 différent de celui de l’ancien site']
	return cas.titreDeLOngletRequis && reponse.status === 200 ? talentTitleDefaults(html) : []
}

/** The path and query a Location header goes to (the host is the one of the run). */
const destinationOf = (location: string): string => {
	const read = splitAddress(/^https?:\/\//i.test(location) ? location : `${SITE_ORIGIN}${location}`)
	return read.path + read.search
}

/** Checks one case: the first status, the single redirect, the status and the h1 of the page it ends on. */
export async function check(cas: ParityCase, chercher: Find): Promise<Result> {
	const defaults: string[] = []
	const destination: string[] = []
	const firstOne = await chercher(cas.adresse)
	let gap: string | null = null
	if (!cas.statuts.includes(firstOne.status)) {
		defaults.push(`statut ${firstOne.status} au lieu de ${cas.statuts.join(' ou ')}`)
	} else if (cas.canonique !== undefined && firstOne.status === 200) {
		// A proxy (Traefik) cleans `//` before the application: the page answers 200, and its canonical must be the clean path.
		const html = isPageHtml(firstOne) ? await firstOne.corps() : ''
		const canonical = canonicalOf(html)
		if (canonical === null)
			defaults.push('200 sans canonical, au lieu d’un canonical sur le chemin sans barre en double')
		else if (destinationOf(canonical) !== cas.canonique)
			defaults.push(`canonical ${destinationOf(canonical)} au lieu de ${cas.canonique}`)
		else {
			defaults.push(...(await checkTitle(cas, firstOne)))
			gap = cas.ecartConnu ?? null
		}
	} else if (cas.vers !== undefined) {
		if (firstOne.location === null || destinationOf(firstOne.location) !== cas.vers) {
			const real = firstOne.location === null ? 'aucune destination' : destinationOf(firstOne.location)
			const defaultValue = `destination ${real} au lieu de ${cas.vers}`
			// The one hop we cannot make: reported, neither green nor red.
			if (cas.ecartConnu && firstOne.location !== null) gap = `${cas.ecartConnu} (${defaultValue})`
			else defaults.push(defaultValue)
		} else {
			const finale = await chercher(cas.vers)
			if (finale.status !== cas.statutFinal)
				destination.push(`la destination répond ${finale.status} au lieu de ${cas.statutFinal}`)
			else destination.push(...(await checkTitle(cas, finale)))
		}
	} else {
		defaults.push(...(await checkTitle(cas, firstOne)))
	}
	const say = (textes: string[]): string[] => (cas.masque ? textes.map(hide) : textes)
	if (defaults.length > 0) return { etat: 'rouge', defauts: say(defaults), destination: say(destination) }
	if (gap !== null)
		return { etat: 'ecart', raison: say([gap])[0] ?? '', defauts: defaults, destination: say(destination) }
	return { etat: 'vert', destination: say(destination) }
}

/** An address of a real profile never reaches a message. */
const hide = (texte: string): string => texte.replace(/\/{1,2}profil\/[^\s;)]+/g, '/profil/…')

/* ------------------------------------------------------------------------------------------
 * The report: by type, the green addresses and the ones to come
 * ---------------------------------------------------------------------------------------- */

export interface SummaryLine {
	famille: string
	vertes: number
	aVenir: number
	ecarts: number
	/** Failures of a family that is delivered: the run fails on them. */
	regressions: string[]
}

/**
 * The report of a run. A family not in `livrees` is « à venir » for each address that fails; a family
 * in `livrees` fails the run on each one. A family that is not delivered and answers right is green:
 * nothing forces the list to be updated the day another ticket delivers it.
 */
export function summary(
	resultats: ReadonlyArray<{ cas: ParityCase; resultat: Result }>,
	livrees: ReadonlySet<string>
): SummaryLine[] {
	const lines = new Map<string, SummaryLine>()
	const lineOf = (famille: string): SummaryLine => {
		const line = lines.get(famille) ?? { famille, vertes: 0, aVenir: 0, ecarts: 0, regressions: [] }
		lines.set(famille, line)
		return line
	}
	for (const { cas: testCase, resultat: result } of resultats) {
		const line = lineOf(testCase.famille)
		if (result.etat === 'vert') line.vertes++
		else if (result.etat === 'ecart') line.ecarts++
		else if (livrees.has(testCase.famille))
			line.regressions.push(`${testCase.etiquette} : ${result.defauts.join(' ; ')}`)
		else line.aVenir++
		// The page a redirect ends on is the business of its own family: a defect there fails the run only
		// when that family is delivered.
		if (result.destination.length > 0 && testCase.familleFinale && livrees.has(testCase.familleFinale))
			lineOf(testCase.familleFinale).regressions.push(
				`${testCase.etiquette} ${testCase.vers ? `→ ${testCase.masque ? hide(testCase.vers) : testCase.vers}` : ''} : ${result.destination.join(' ; ')}`
			)
	}
	return [...lines.values()].sort((a, b) => a.famille.localeCompare(b.famille))
}

/** « accueil : 1 verte », « article : 0 verte, 3 à venir ». */
export function writeSummary(lignes: readonly SummaryLine[], livrees: ReadonlySet<string>): string {
	const plural = (n: number, mot: string): string => `${n} ${mot}${n > 1 && mot === 'verte' ? 's' : ''}`
	return lignes
		.map(({ famille: family, vertes, aVenir, ecarts, regressions }) =>
			[
				`I45 ${family.padEnd(24)} ${plural(vertes, 'verte')}`,
				aVenir > 0 ? `${aVenir} à venir` : '',
				ecarts > 0 ? `${ecarts} écart${ecarts > 1 ? 's' : ''} connu${ecarts > 1 ? 's' : ''}` : '',
				regressions.length > 0 ? `${regressions.length} en échec` : '',
				livrees.has(family) ? '(livrée)' : '',
			]
				.filter(Boolean)
				.join(', ')
		)
		.join('\n')
}
