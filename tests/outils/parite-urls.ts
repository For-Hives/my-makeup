/**
 * The parity of the addresses (ticket 072; plan 02 I45): for each frozen address, the status the
 * table promises and the same h1 as the old site. The cases, the h1 of the old site (as hashes) and
 * the checks are here; tests/e2e/parite-urls.spec.ts runs them against the application of the bench.
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
import { cleIndexNow } from '../../src/lib/seo/indexnow'
import {
	anonymousStatus,
	FROZEN_URL_FAMILIES,
	type FrozenUrlFamily,
	familiesFor,
	familiesMeasured,
	SITE_ORIGIN,
	splitAddress,
} from '../../src/lib/urls-gelees'

/* ------------------------------------------------------------------------------------------
 * Reading the h1 like the measuring tool
 * ---------------------------------------------------------------------------------------- */

const ENTITES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decoderEntites(texte: string): string {
	return texte.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (brut, nom: string) => {
		if (nom.startsWith('#')) {
			const code =
				nom[1] === 'x' || nom[1] === 'X' ? Number.parseInt(nom.slice(2), 16) : Number.parseInt(nom.slice(1), 10)
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : brut
		}
		return ENTITES[nom.toLowerCase()] ?? brut
	})
}

const sansScripts = (html: string): string =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
		.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')

const texteDe = (fragment: string): string =>
	decoderEntites(fragment.replace(/<[^>]*>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim()

export const sha256 = (texte: string): string => createHash('sha256').update(texte).digest('hex')

/** The texts of the h1 of a page of HTML. */
export const titresPrincipaux = (html: string): string[] =>
	[...sansScripts(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map(m => texteDe(m[1] ?? ''))

/** The `<title>` of a page of HTML, entities decoded. */
export const titreDeLOnglet = (html: string): string =>
	texteDe(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(sansScripts(html))?.[1] ?? '')

/** The length the title of the tab of a talent is written to (ticket 108; Bing asks for 50 to 60 characters). */
export const TITRE_DE_TALENT_MIN = 50
export const TITRE_DE_TALENT_MAX = 60

/**
 * What is wrong with the title of the tab of a page of a talent once the newsroom has written it (ticket
 * 108): 50 to 60 characters, and not the h1. A title the newsroom did not write is the short one, with the
 * brand after it, and fails the first test.
 */
export function defautsDuTitreDeTalent(html: string): string[] {
	const titre = titreDeLOnglet(html)
	const defauts: string[] = []
	if (titre.length < TITRE_DE_TALENT_MIN || titre.length > TITRE_DE_TALENT_MAX)
		defauts.push(
			`titre de l’onglet de ${titre.length} caractères au lieu de ${TITRE_DE_TALENT_MIN} à ${TITRE_DE_TALENT_MAX}`
		)
	if (titresPrincipaux(html).includes(titre)) defauts.push('titre de l’onglet identique au h1')
	return defauts
}

/** What the old site's measuring tool keeps of the h1 of a page: their number, and the hash of their texts. */
export function empreinteDesTitres(html: string): { n: number; sha: string | null } {
	const titres = titresPrincipaux(html)
	return { n: titres.length, sha: titres.length > 0 ? sha256(titres.join('\n')) : null }
}

/* ------------------------------------------------------------------------------------------
 * What the old site's h1 were: the fixture
 * ---------------------------------------------------------------------------------------- */

/** The h1 of the old site for the clear addresses of the inventory: their number and their hash. */
export type TitresDeLAncienSite = Readonly<Record<string, { n: number; sha: string | null }>>

/** The answer expected for the h1 of a page. */
export type AttenteDuTitre = { mode: 'hash'; sha: string } | { mode: 'un' } | { mode: 'aucun' }

/* ------------------------------------------------------------------------------------------
 * The cases
 * ---------------------------------------------------------------------------------------- */

export interface CasDeParite {
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
	titre: AttenteDuTitre | 'non-verifie'
	/** The title of the tab must be the one the newsroom wrote (50 to 60 characters, not the h1): the imported talents. */
	titreDeLOngletRequis?: true
	/** A real profile: no address of it is written in any message. */
	masque?: true
	/** A difference we know about and do not hide: the case is reported, not counted green or red. */
	ecartConnu?: string
}

/** The families the hosting answers for (domains, TLS): nothing the application can show. */
/** The addresses of the frozen inventory (docs/migration/urls-inventaire.json), read as a file: Playwright runs under Node. */
interface InventaireGele {
	addresses: { address: string; first: number }[]
	complements: { address?: string; family: string | null; first: number }[]
}

const FROZEN_INVENTORY: InventaireGele = JSON.parse(
	readFileSync(new URL('../../docs/migration/urls-inventaire.json', import.meta.url), 'utf8')
)

/** The one family of an inventory address: the candidate measured with its first status. */
function inventoryFamily(entree: { address: string; first: number }): FrozenUrlFamily {
	const trouvees = familiesMeasured(entree.address, entree.first)
	const [famille] = trouvees
	if (!famille || trouvees.length !== 1)
		throw new Error(`${entree.address} (${entree.first}) : ${trouvees.length} familles au lieu d'une`)
	return famille
}

/**
 * The table writes the key file of IndexNow with a key of zeros: the real key is the variable INDEXNOW_KEY
 * (ticket 219), the one the application under test is given. Without it the address stays the one of zeros,
 * which answers 404.
 */
function adresseDeLaCleIndexNow(adresse: string): string {
	if (!/^\/0{32}\.txt$/.test(adresse)) return adresse
	const cle = cleIndexNow()
	return cle ? `/${cle}.txt` : adresse
}

const FAMILLES_DE_L_HEBERGEMENT = new Set(
	FROZEN_URL_FAMILIES.filter(({ servedBy }) => servedBy === 'hebergement').map(({ id }) => id)
)

const ECART_DOUBLE_BARRE =
	'Next répond lui-même à `//` par un 308, avant que le site ne lise l’adresse : pas de 301, et deux sauts si la destination redirige encore.'

const familleParId = (id: string): FrozenUrlFamily => {
	const famille = FROZEN_URL_FAMILIES.find(candidate => candidate.id === id)
	if (!famille) throw new Error(`Famille inconnue de la table des adresses gelées : ${id}`)
	return famille
}

/** The family of an address that answers `statut`, when the table tells it. */
function familleDe(adresse: string, statut: number): string | undefined {
	return (familiesMeasured(adresse, statut)[0] ?? familiesFor(adresse)[0])?.id
}

const sansOrigine = (adresse: string): string => splitAddress(adresse).path + splitAddress(adresse).search

/** The expectation for the h1 of the page an address ends on. */
export function attenteDuTitre(
	adresseFinale: string,
	statutFinal: number,
	anciens: TitresDeLAncienSite
): AttenteDuTitre {
	const chemin = splitAddress(adresseFinale).path
	// A search page used to be the same empty shell whatever the search: its h1 now says what was searched (CHANGEMENTS-VOULUS).
	if (chemin === '/search' && splitAddress(adresseFinale).search !== '') return { mode: 'un' }
	const ancien = anciens[adresseFinale]
	if (ancien?.n === 1 && ancien.sha) return { mode: 'hash', sha: ancien.sha }
	if (ancien && ancien.n === 0) return { mode: 'aucun' }
	if (statutFinal === 404) {
		const page404 = anciens['/page-inexistante-audit-zz']
		if (page404?.sha) return { mode: 'hash', sha: page404.sha }
	}
	// An address with two h1 on the old site (several fixed pages) must have one: « 1 h1 par page » (plan 01 §3.5).
	return { mode: 'un' }
}

function casDepuisUneFamille(
	famille: FrozenUrlFamily,
	exemple: { from: string; to?: string },
	anciens: TitresDeLAncienSite
): CasDeParite {
	const direct = anonymousStatus(famille)
	const redirige = direct === 301 || direct === 307 || direct === 308
	const vers = redirige && exemple.to ? sansOrigine(exemple.to) : undefined
	const statutFinal = redirige ? 200 : direct
	const statuts = [direct, ...(famille.rule === 'double-slash' ? [308] : (famille.alsoAccepted ?? []))]
	const finale = vers ?? exemple.from
	const verifiable =
		!/\.(txt|xml|js|webp|jpg|png|json)$/i.test(splitAddress(finale).path) && !finale.startsWith('/api/')
	return {
		adresse: exemple.from,
		etiquette: exemple.from,
		famille: famille.id,
		statuts,
		...(vers ? { vers, familleFinale: familleDe(vers, statutFinal) } : {}),
		statutFinal,
		titre: verifiable ? attenteDuTitre(finale, statutFinal, anciens) : 'non-verifie',
		...(famille.rule === 'double-slash' ? { ecartConnu: ECART_DOUBLE_BARRE } : {}),
	}
}

/** The made-up pages that the cases of the families depending on the data use. */
export interface DonneesDuJeu {
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
export function casDuBanc(anciens: TitresDeLAncienSite, jeu: DonneesDuJeu): CasDeParite[] {
	const cas = new Map<string, CasDeParite>()
	const ajouter = (c: CasDeParite): void => {
		if (!cas.has(c.adresse)) cas.set(c.adresse, c)
	}
	const slugsDesTalents = new Set(jeu.talents)
	// What the bench cannot hold: the real articles and talents of the site (the import carries them).
	const slugsDesProfils = new Set([...jeu.profilsVisibles, ...jeu.profilsMasques])
	const dependDesDonnees = (adresse: string): boolean => {
		// A repeated slash in front (`//profil/…`) is the same address once it is normalised.
		const [, premier, slug] = splitAddress(adresse).path.replace(/^\/+/, '/').split('/')
		// A real profile of the site: the bench holds the profiles of its own set only (ticket 104).
		if (premier === 'profil' && slug) return !slugsDesProfils.has(slugEcrit(slug))
		if (premier === 'blog' && slug) return !/^inexistant-/.test(slug)
		if (premier === 'talent' && slug) return !slugsDesTalents.has(slug) && !/^inexistant-/.test(slug)
		return false
	}
	const inventaire = [
		...FROZEN_INVENTORY.addresses,
		...FROZEN_INVENTORY.complements.flatMap(complement =>
			complement.address && complement.family ? [{ address: complement.address, first: complement.first }] : []
		),
	]
	for (const entree of inventaire) {
		if (splitAddress(entree.address).origin !== SITE_ORIGIN) continue
		if (dependDesDonnees(entree.address)) continue
		let famille: FrozenUrlFamily
		try {
			famille = inventoryFamily(entree)
		} catch {
			continue
		}
		if (FAMILLES_DE_L_HEBERGEMENT.has(famille.id)) continue
		const exemple = famille.examples.find(({ from }) => from === entree.address)
		ajouter(casDepuisUneFamille(famille, exemple ?? { from: entree.address }, anciens))
	}
	for (const famille of FROZEN_URL_FAMILIES) {
		if (FAMILLES_DE_L_HEBERGEMENT.has(famille.id)) continue
		for (const exemple of famille.examples) {
			if (splitAddress(exemple.from).origin !== SITE_ORIGIN) continue
			// Their data is the real one of the site: the cases below say the same with the set.
			if (famille.kind === 'profil' || dependDesDonnees(exemple.from)) continue
			ajouter(casDepuisUneFamille(famille, { ...exemple, from: adresseDeLaCleIndexNow(exemple.from) }, anciens))
		}
	}
	const profil = familleParId('profil')
	const inconnu = familleParId('slug-inconnu')
	for (const slug of jeu.profilsVisibles) ajouter(casDepuisUneFamille(profil, { from: `/profil/${slug}` }, anciens))
	for (const slug of jeu.profilsMasques) ajouter(casDepuisUneFamille(inconnu, { from: `/profil/${slug}` }, anciens))
	if (jeu.ancienNom)
		ajouter(
			casDepuisUneFamille(
				familleParId('profil-ancien-nom'),
				{ from: `/profil/${jeu.ancienNom.ecrit}`, to: `/profil/${jeu.ancienNom.slug}` },
				anciens
			)
		)
	for (const slug of jeu.talents)
		ajouter(casDepuisUneFamille(familleParId('talent'), { from: `/talent/${slug}` }, anciens))
	for (const slug of jeu.articlesPublies)
		ajouter(casDepuisUneFamille(familleParId('article'), { from: `/blog/${slug}` }, anciens))
	for (const slug of jeu.articlesBrouillons)
		ajouter(casDepuisUneFamille(familleParId('slug-inconnu'), { from: `/blog/${slug}` }, anciens))
	return [...cas.values()]
}

/* ------------------------------------------------------------------------------------------
 * The private list: the imported copy
 * ---------------------------------------------------------------------------------------- */

/** Splits a CSV (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes) into records. */
export function lireLeCsv(texte: string): Record<string, string>[] {
	const lignes: string[][] = []
	let champ = ''
	let ligne: string[] = []
	let guillemets = false
	for (let i = 0; i < texte.length; i++) {
		const c = texte[i]
		if (guillemets) {
			if (c === '"' && texte[i + 1] === '"') {
				champ += '"'
				i++
			} else if (c === '"') guillemets = false
			else champ += c
		} else if (c === '"') guillemets = true
		else if (c === ',') {
			ligne.push(champ)
			champ = ''
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && texte[i + 1] === '\n') i++
			ligne.push(champ)
			champ = ''
			if (ligne.some(valeur => valeur !== '')) lignes.push(ligne)
			ligne = []
		} else champ += c
	}
	if (champ !== '' || ligne.length > 0) {
		ligne.push(champ)
		lignes.push(ligne)
	}
	const [entetes = [], ...corps] = lignes
	return corps.map(valeurs => Object.fromEntries(entetes.map((nom, i) => [nom, valeurs[i] ?? ''])))
}

/** A path segment as it was written, decoded when it can be. */
const slugEcrit = (segment: string): string => {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

const estUneAdresseDeProfil = (chemin: string): boolean => /^\/{1,2}profil\/[^/]+/.test(chemin)

/**
 * The cases of the imported copy, from the private list of the measuring tool (its baseline CSV).
 * A real profile shows as « profil #n »: its address is read to be requested, never to be written.
 */
export function casDeLaListePrivee(csv: string): CasDeParite[] {
	const cas: CasDeParite[] = []
	let numero = 0
	for (const ligne of lireLeCsv(csv)) {
		const adresse = (ligne.chemin ?? '') + (ligne.url?.includes('?') ? `?${ligne.url.split('?')[1]}` : '')
		const premier = Number(ligne.statut_initial)
		if (!adresse || !Number.isFinite(premier) || !ligne.url?.startsWith(SITE_ORIGIN)) continue
		const familles = familiesMeasured(adresse, premier)
		const [famille] = familles
		if (!famille || FAMILLES_DE_L_HEBERGEMENT.has(famille.id)) continue
		const profil = estUneAdresseDeProfil(adresse)
		if (profil) numero++
		// The 13 empty profiles of the spam answer 404 and are not told apart from the others by the list.
		const ambigu = familles.length > 1
		const direct = anonymousStatus(famille)
		const redirige = direct === 301 || direct === 307 || direct === 308
		const sha = ligne.h1_sha256 || null
		const n = Number(ligne.h1_nb)
		cas.push({
			adresse,
			etiquette: profil ? `profil #${numero}` : adresse,
			...(profil || estUneAdresseDeProfil(sansOrigine(ligne.url_finale ?? '')) ? { masque: true as const } : {}),
			famille: famille.id,
			statuts: [...new Set([direct, ...(ambigu ? familles.map(anonymousStatus) : (famille.alsoAccepted ?? []))])],
			...(redirige && ligne.url_finale
				? { vers: sansOrigine(ligne.url_finale), familleFinale: familleDe(sansOrigine(ligne.url_finale), 200) }
				: {}),
			statutFinal: redirige ? 200 : direct,
			titre:
				ligne.type !== 'html'
					? 'non-verifie'
					: n === 1 && sha && !(splitAddress(adresse).path === '/search' && splitAddress(adresse).search !== '')
						? { mode: 'hash', sha }
						: { mode: 'un' },
			...(famille.rule === 'double-slash' ? { ecartConnu: ECART_DOUBLE_BARRE } : {}),
			// A talent of the imported copy: its tab is titled by the newsroom (ticket 108).
			...(famille.id === 'talent' && !redirige && direct === 200 ? { titreDeLOngletRequis: true as const } : {}),
		})
	}
	return cas
}

/** Reads the private list the run points at (`PARITE_URLS_LISTE`), or `null` for a run on the bench set. */
export function listePrivee(variables: Record<string, string | undefined> = process.env): CasDeParite[] | null {
	const chemin = variables.PARITE_URLS_LISTE
	return chemin ? casDeLaListePrivee(readFileSync(chemin, 'utf8')) : null
}

/* ------------------------------------------------------------------------------------------
 * The check
 * ---------------------------------------------------------------------------------------- */

/** What one request gave back. */
export interface Reponse {
	status: number
	location: string | null
	contentType: string | null
	corps: () => Promise<string>
}

/** Requests an address once, without following a redirect. */
export type Chercher = (adresse: string) => Promise<Reponse>

/**
 * `defauts`: what is wrong with the address itself (its status, where its redirect goes).
 * `destination`: what is wrong with the page a right redirect ends on. It belongs to the family of that
 * page, which may not be delivered yet.
 */
export type Resultat =
	| { etat: 'vert'; destination: string[] }
	| { etat: 'rouge'; defauts: string[]; destination: string[] }
	| { etat: 'ecart'; raison: string; defauts: string[]; destination: string[] }

const estUnePageHtml = (reponse: Reponse): boolean => (reponse.contentType ?? '').includes('text/html')

async function verifierLeTitre(cas: CasDeParite, reponse: Reponse): Promise<string[]> {
	if (cas.titre === 'non-verifie' || !estUnePageHtml(reponse)) return []
	const attente = cas.titre
	const html = await reponse.corps()
	const { n, sha } = empreinteDesTitres(html)
	if (attente.mode === 'aucun') return n === 0 ? [] : [`${n} h1 au lieu de 0`]
	if (n !== 1) return [`${n} h1 au lieu d'un seul`]
	if (attente.mode === 'hash' && sha !== attente.sha) return ['h1 différent de celui de l’ancien site']
	return cas.titreDeLOngletRequis && reponse.status === 200 ? defautsDuTitreDeTalent(html) : []
}

/** The path and query a Location header goes to (the host is the one of the run). */
const destinationDe = (location: string): string => {
	const lue = splitAddress(/^https?:\/\//i.test(location) ? location : `${SITE_ORIGIN}${location}`)
	return lue.path + lue.search
}

/** Checks one case: the first status, the single redirect, the status and the h1 of the page it ends on. */
export async function verifier(cas: CasDeParite, chercher: Chercher): Promise<Resultat> {
	const defauts: string[] = []
	const destination: string[] = []
	const premiere = await chercher(cas.adresse)
	let ecart: string | null = null
	if (!cas.statuts.includes(premiere.status)) {
		defauts.push(`statut ${premiere.status} au lieu de ${cas.statuts.join(' ou ')}`)
	} else if (cas.vers !== undefined) {
		if (premiere.location === null || destinationDe(premiere.location) !== cas.vers) {
			const reel = premiere.location === null ? 'aucune destination' : destinationDe(premiere.location)
			const defaut = `destination ${reel} au lieu de ${cas.vers}`
			// The one hop we cannot make: reported, neither green nor red.
			if (cas.ecartConnu && premiere.location !== null) ecart = `${cas.ecartConnu} (${defaut})`
			else defauts.push(defaut)
		} else {
			const finale = await chercher(cas.vers)
			if (finale.status !== cas.statutFinal)
				destination.push(`la destination répond ${finale.status} au lieu de ${cas.statutFinal}`)
			else destination.push(...(await verifierLeTitre(cas, finale)))
		}
	} else {
		defauts.push(...(await verifierLeTitre(cas, premiere)))
	}
	const dire = (textes: string[]): string[] => (cas.masque ? textes.map(masquer) : textes)
	if (defauts.length > 0) return { etat: 'rouge', defauts: dire(defauts), destination: dire(destination) }
	if (ecart !== null) return { etat: 'ecart', raison: dire([ecart])[0] ?? '', defauts, destination: dire(destination) }
	if (cas.ecartConnu && premiere.status !== cas.statuts[0])
		return { etat: 'ecart', raison: cas.ecartConnu, defauts, destination: dire(destination) }
	return { etat: 'vert', destination: dire(destination) }
}

/** An address of a real profile never reaches a message. */
const masquer = (texte: string): string => texte.replace(/\/{1,2}profil\/[^\s;)]+/g, '/profil/…')

/* ------------------------------------------------------------------------------------------
 * The report: by type, the green addresses and the ones to come
 * ---------------------------------------------------------------------------------------- */

export interface LigneDuBilan {
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
export function bilan(
	resultats: ReadonlyArray<{ cas: CasDeParite; resultat: Resultat }>,
	livrees: ReadonlySet<string>
): LigneDuBilan[] {
	const lignes = new Map<string, LigneDuBilan>()
	const ligneDe = (famille: string): LigneDuBilan => {
		const ligne = lignes.get(famille) ?? { famille, vertes: 0, aVenir: 0, ecarts: 0, regressions: [] }
		lignes.set(famille, ligne)
		return ligne
	}
	for (const { cas, resultat } of resultats) {
		const ligne = ligneDe(cas.famille)
		if (resultat.etat === 'vert') ligne.vertes++
		else if (resultat.etat === 'ecart') ligne.ecarts++
		else if (livrees.has(cas.famille)) ligne.regressions.push(`${cas.etiquette} : ${resultat.defauts.join(' ; ')}`)
		else ligne.aVenir++
		// The page a redirect ends on is the business of its own family: a defect there fails the run only
		// when that family is delivered.
		if (resultat.destination.length > 0 && cas.familleFinale && livrees.has(cas.familleFinale))
			ligneDe(cas.familleFinale).regressions.push(
				`${cas.etiquette} ${cas.vers ? `→ ${cas.masque ? masquer(cas.vers) : cas.vers}` : ''} : ${resultat.destination.join(' ; ')}`
			)
	}
	return [...lignes.values()].sort((a, b) => a.famille.localeCompare(b.famille))
}

/** « accueil : 1 verte », « article : 0 verte, 3 à venir ». */
export function ecrireLeBilan(lignes: readonly LigneDuBilan[], livrees: ReadonlySet<string>): string {
	const pluriel = (n: number, mot: string): string => `${n} ${mot}${n > 1 && mot === 'verte' ? 's' : ''}`
	return lignes
		.map(({ famille, vertes, aVenir, ecarts, regressions }) =>
			[
				`I45 ${famille.padEnd(24)} ${pluriel(vertes, 'verte')}`,
				aVenir > 0 ? `${aVenir} à venir` : '',
				ecarts > 0 ? `${ecarts} écart${ecarts > 1 ? 's' : ''} connu${ecarts > 1 ? 's' : ''}` : '',
				regressions.length > 0 ? `${regressions.length} en échec` : '',
				livrees.has(famille) ? '(livrée)' : '',
			]
				.filter(Boolean)
				.join(', ')
		)
		.join('\n')
}
