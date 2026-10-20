/**
 * The check of a host (ticket 173, docs/tests/controle-hote.md): the check of the day of the switch,
 * and of its rehearsal. It reads, and only reads, every address of the frozen inventory on a given
 * host, then the sitemap, the robots file, the old authentication routes and the script of the
 * audience measurement, and writes a dated report of numbers and fingerprints.
 *
 *   CONTROLE_HOTE_CIBLE=https://v3.my-makeup.fr \
 *   CONTROLE_HOTE_ACCES_UTILISATEUR=… CONTROLE_HOTE_ACCES_MOT_DE_PASSE=… bun run bascule:controle
 *   CONTROLE_HOTE_CIBLE=http://127.0.0.1:3100 bun run bascule:controle    # the bench, a build of this machine
 *   CONTROLE_HOTE_CIBLE=https://my-makeup.fr bun run bascule:controle     # the live site, reads only
 *
 * - The addresses are those of the frozen table (src/lib/frozen-urls.ts) and of the inventory
 *   (docs/migration/urls-inventaire.json), checked like I45 (tests/outils/parite-urls.ts): the status
 *   the table promises, the single redirect, the same h1 as the old site. The profiles, talents and
 *   articles of the host are the ones its sitemap lists.
 * - Reads only, one request at a time, two per second at most (500 ms between two starts). Every
 *   request goes through scripts/bascule/garde-hote.ts. No cookie, no write, no event sent to the
 *   audience measurement: the file of its script is read, nothing else under `/u`.
 * - The report never writes the address of a real profile: a profile is « profil #xxxxxxxx », the
 *   first 8 digits of the SHA-256 of its path. Everything else is counts and fingerprints.
 * - Exit code: 0 all conform, 1 at least one address is not (or a 5xx), 2 the target is refused.
 *
 * No dependency, `fetch` only (and the Node modules of the repository's own tools): the CI runs it
 * without `bun install`, next to the secrets, and Playwright runs `controlerLHote` as it is.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import {
	bilan,
	type CasDeParite,
	casDuBanc,
	type DonneesDuJeu,
	type Resultat,
	type TitresDeLAncienSite,
	verifier,
} from '../../tests/outils/parite-urls'
import { creerLecteur, ecartLePlusCourt, HORLOGE_REELLE, type Horloge, type Lecteur } from '../../tests/sondes/lecteur'
import {
	CibleRefusee,
	cibleDuControle,
	garder,
	HOTE_TEMPORAIRE,
	type LectureGardee,
	RequeteInterdite,
	type Transport,
} from './garde-hote'

export { CibleRefusee, RequeteInterdite }

/** The variables the command reads. */
export type Variables = Partial<
	Record<
		| 'CONTROLE_HOTE_ACCES_MOT_DE_PASSE'
		| 'CONTROLE_HOTE_ACCES_UTILISATEUR'
		| 'CONTROLE_HOTE_CIBLE'
		| 'CONTROLE_HOTE_SORTIE',
		string
	>
>

export interface Reglages {
	cible: URL
	/** The `Authorization` header of the protected access: the temporary host only. */
	autorisation?: string
	/** Where to write the report as JSON, or nothing. */
	sortie?: string
}

/** The check cannot run as it is set: the message names the variable, never its value. */
export class ControleRefuse extends Error {
	override readonly name = 'ControleRefuse'
}

export const CHEMIN_DU_SITEMAP = '/sitemap.xml'
export const CHEMIN_DU_ROBOTS = '/robots.txt'
export const CHEMIN_DE_LA_SANTE = '/api/health'
export const CHEMIN_DU_SCRIPT = '/u/script.js'

/** The old authentication routes, which the v3 does not serve: each answers 404 to a GET. */
export const ANCIENNES_ROUTES: readonly string[] = [
	'/api/auth/signin',
	'/api/auth/signout',
	'/api/auth/session',
	'/api/auth/csrf',
	'/api/auth/providers',
	'/api/auth/callback/credentials',
	'/api/auth/callback/google',
	'/api/sendMail',
]

/** Reads the variables, or `CibleRefusee` / `ControleRefuse` with what to fix. */
export function lireLesReglages(variables: Variables): Reglages {
	const brute = variables.CONTROLE_HOTE_CIBLE?.trim()
	if (!brute) throw new CibleRefusee('CONTROLE_HOTE_CIBLE manque : l’hôte à contrôler, comme https://my-makeup.fr.')
	const cible = cibleDuControle(brute)
	const utilisateur = variables.CONTROLE_HOTE_ACCES_UTILISATEUR ?? ''
	const motDePasse = variables.CONTROLE_HOTE_ACCES_MOT_DE_PASSE ?? ''
	// The protected access of the temporary host is optional (it may be off), but never half given, and
	// never sent anywhere else: an access given for another host is a mistake, not something to drop.
	if ((utilisateur === '') !== (motDePasse === ''))
		throw new ControleRefuse(
			'CONTROLE_HOTE_ACCES_UTILISATEUR et CONTROLE_HOTE_ACCES_MOT_DE_PASSE vont ensemble : donne les deux, ou aucun.'
		)
	if (utilisateur !== '' && cible.hostname !== HOTE_TEMPORAIRE)
		throw new ControleRefuse(
			`CONTROLE_HOTE_ACCES_UTILISATEUR et CONTROLE_HOTE_ACCES_MOT_DE_PASSE ne servent que pour https://${HOTE_TEMPORAIRE} : ils ne partent jamais vers un autre hôte.`
		)
	const autorisation = utilisateur !== '' ? `Basic ${btoa(`${utilisateur}:${motDePasse}`)}` : undefined
	const sortie = variables.CONTROLE_HOTE_SORTIE?.trim()
	return { cible, ...(autorisation ? { autorisation } : {}), ...(sortie ? { sortie } : {}) }
}

/* ------------------------------------------------------------------------------------------
 * Small readers
 * ---------------------------------------------------------------------------------------- */

const sha256 = (texte: string): string => createHash('sha256').update(texte).digest('hex')

/** The 8 first digits of a fingerprint: how a profile, a body or a report is named. */
const court = (texte: string): string => sha256(texte).slice(0, 8)

const chemin = (loc: string): string | undefined => {
	if (!URL.canParse(loc)) return undefined
	const url = new URL(loc)
	return url.pathname + url.search
}

/** The paths of the `<loc>` of a sitemap. */
export function adressesDuSitemap(xml: string): string[] {
	const noms: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
	return [...xml.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].flatMap(([, loc]) => {
		const lu = chemin((loc ?? '').replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, e => noms[e] ?? e))
		return lu ? [lu] : []
	})
}

const decoder = (segment: string): string => {
	try {
		return decodeURIComponent(segment)
	} catch {
		return segment
	}
}

/** The profiles, talents and articles that a sitemap lists: the made-up set of the host. */
export function jeuDuSitemap(chemins: readonly string[]): DonneesDuJeu {
	const apres = (prefixe: string): string[] =>
		chemins.flatMap(c => {
			const [, premier, slug, reste] = c.split('?', 1)[0]?.split('/') ?? []
			return `/${premier}/` === prefixe && slug && reste === undefined ? [decoder(slug)] : []
		})
	return {
		profilsVisibles: apres('/profil/'),
		profilsMasques: [],
		ancienNom: null,
		talents: apres('/talent/'),
		articlesPublies: apres('/blog/'),
		articlesBrouillons: [],
	}
}

/* ------------------------------------------------------------------------------------------
 * The report
 * ---------------------------------------------------------------------------------------- */

export type Verdict = 'conforme' | 'non-conforme'

export interface Section {
	titre: string
	conforme: boolean
	/** One line each, in French. Numbers and fingerprints, never the address of a real profile. */
	constats: string[]
}

export interface Rapport {
	date: string
	hote: string
	/** The `version` of /api/health, or null. */
	version: string | null
	verdict: Verdict
	adresses: {
		controlees: number
		conformes: number
		ecartsConnus: number
		enEchec: number
		aVenir: number
		nonLues: number
	}
	/** Answers 5xx met on any request of the run. */
	reponses5xx: number
	requetes: number
	/** The shortest gap between two starts, in milliseconds. */
	ecartMinimalMs: number | null
	/** Fingerprint of the list « address, state » of the inventory part. */
	empreinte: string
	sections: Section[]
	/** What is not conform, one line each. */
	defauts: string[]
}

export interface Outils {
	/** What reaches the host: `fetch` for a run. */
	transport?: Transport
	horloge?: Horloge
	/** Milliseconds between two request starts. */
	intervalleMs?: number
	/** The date of the report. */
	maintenant?: () => Date
	/** The old site's h1, as hashes (tests/fixtures/parite-urls-h1.json). */
	anciens?: TitresDeLAncienSite
	/**
	 * Families of the inventory that are not delivered yet in the code under test: their failures are
	 * counted « à venir » and do not make the report non conform. A run on the day of the switch gives
	 * none: every family must conform.
	 */
	aVenir?: ReadonlySet<string>
}

const anciensParDefaut = (): TitresDeLAncienSite =>
	JSON.parse(readFileSync(new URL('../../tests/fixtures/parite-urls-h1.json', import.meta.url), 'utf8'))

/** What went wrong with a request: its code, never its text. */
function raison(erreur: unknown): string {
	const cause = (erreur as { cause?: { code?: unknown } } | null)?.cause
	const code = typeof cause?.code === 'string' ? cause.code : (erreur as { name?: unknown } | null)?.name
	return typeof code === 'string' && /^[\w-]{1,40}$/.test(code) ? code : 'erreur'
}

/** The profile cases are named by a fingerprint. */
function masquerLesProfils(cas: CasDeParite[], profils: readonly string[]): CasDeParite[] {
	const adresses = new Set(profils.map(slug => `/profil/${slug}`))
	return cas.map(c =>
		adresses.has(c.adresse) ? { ...c, etiquette: `profil #${court(c.adresse)}`, masque: true as const } : c
	)
}

/** A sitemap address the inventory does not name: it answers 200 with one h1. */
const casDuSitemapSeul = (adresse: string): CasDeParite => ({
	adresse,
	etiquette: adresse,
	famille: 'adresse-du-sitemap',
	statuts: [200],
	statutFinal: 200,
	titre: { mode: 'un' },
})

/**
 * The whole check of a host. Never throws for a host that answers badly (that is a finding of the
 * report); throws `RequeteInterdite` when the guard stops a request, which is a bug of the check.
 */
export async function controlerLHote(reglages: Reglages, outils: Outils = {}): Promise<Rapport> {
	const { cible, autorisation } = reglages
	const lecture: LectureGardee = garder(cible, outils.transport, autorisation)
	const lecteur: Lecteur = creerLecteur({
		lecture: (adresse, init) => lecture(String(adresse), init),
		horloge: outils.horloge ?? HORLOGE_REELLE,
		...(outils.intervalleMs === undefined ? {} : { intervalleMs: outils.intervalleMs }),
	})
	const statuts: number[] = []
	const lire = async (adresse: string) => {
		const page = await lecteur.lire(adresse)
		statuts.push(page.statut)
		return page
	}
	const defauts: string[] = []
	const sections: Section[] = []

	// 1. The version served.
	let version: string | null = null
	try {
		const sante = await lire(CHEMIN_DE_LA_SANTE)
		if (sante.statut === 200) {
			const corps = JSON.parse(sante.corps) as { version?: unknown }
			version = typeof corps.version === 'string' ? corps.version : null
		}
	} catch {
		// Said by the 5xx count and by the case of /api/health below.
	}

	// 2. The sitemap.
	let adressesSitemap: string[] = []
	{
		const problemes: string[] = []
		const infos: string[] = []
		try {
			const page = await lire(CHEMIN_DU_SITEMAP)
			const xml = page.corps
			adressesSitemap = adressesDuSitemap(xml)
			const bienForme = /<urlset[\s>]/.test(xml) && /<\/urlset>/.test(xml)
			const type = (page.type ?? '').includes('xml')
			if (page.statut !== 200) problemes.push(`répond ${page.statut} au lieu de 200`)
			else {
				if (!type) problemes.push('le type de contenu n’est pas du XML')
				if (!bienForme) problemes.push('le document n’est pas un « urlset » complet')
				if (adressesSitemap.length === 0) problemes.push('aucune adresse')
			}
			const profils = jeuDuSitemap(adressesSitemap).profilsVisibles.length
			infos.push(`${adressesSitemap.length} adresses dont ${profils} profils, empreinte ${court(xml)}.`)
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) throw erreur
			problemes.push(`aucune réponse (${raison(erreur)})`)
		}
		sections.push({ titre: 'Sitemap', conforme: problemes.length === 0, constats: [...problemes, ...infos] })
		if (problemes.length > 0) defauts.push(`Sitemap : ${problemes.join(' ; ')}`)
	}

	// 3. The addresses of the inventory, and the ones of the sitemap.
	const jeu = jeuDuSitemap(adressesSitemap)
	let cas = masquerLesProfils(casDuBanc(outils.anciens ?? anciensParDefaut(), jeu), jeu.profilsVisibles)
	// The key file of IndexNow is named by the key of the host: unknown, the address cannot be read.
	// The operator gives it in INDEXNOW_KEY; without it, the address of the table (a key of zeros) is not read.
	const nonLues = cas.filter(c => c.famille === 'verification-indexnow' && /^\/0{32}\.txt$/.test(c.adresse))
	cas = cas.filter(c => !nonLues.includes(c))
	const connues = new Set(cas.map(c => c.adresse))
	for (const adresse of new Set(adressesSitemap)) if (!connues.has(adresse)) cas.push(casDuSitemapSeul(adresse))
	cas = [...cas]
	const resultats: { cas: CasDeParite; resultat: Resultat }[] = []
	for (const unCas of cas) {
		try {
			const resultat = await verifier(unCas, async adresse => {
				const page = await lire(adresse)
				return {
					status: page.statut,
					location: page.entetes.get('location'),
					contentType: page.type,
					corps: async () => page.corps,
				}
			})
			resultats.push({ cas: unCas, resultat })
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) throw erreur
			const defaut = `aucune réponse (${raison(erreur)})`
			resultats.push({ cas: unCas, resultat: { etat: 'rouge', defauts: [defaut], destination: [] } })
		}
	}
	// Every family counts, but the ones the caller says are not delivered yet.
	const aVenir = outils.aVenir ?? new Set<string>()
	const lignes = bilan(resultats, new Set(cas.map(c => c.famille).filter(famille => !aVenir.has(famille))))
	const enEchec = lignes.flatMap(({ regressions }) => regressions)
	const enAttente = lignes.reduce((total, { aVenir: n }) => total + n, 0)
	const conformes = resultats.filter(({ resultat }) => resultat.etat === 'vert').length
	const ecarts = resultats.filter(({ resultat }) => resultat.etat === 'ecart').length
	sections.push({
		titre: 'Adresses de l’inventaire',
		conforme: enEchec.length === 0,
		constats: [
			`${cas.length} adresses contrôlées : ${conformes} conformes, ${ecarts} écarts connus, ${enAttente} à venir, ${enEchec.length} en échec.`,
			...(nonLues.length > 0
				? [`${nonLues.length} adresse non lue : la clé IndexNow de l’hôte n’est pas donnée (INDEXNOW_KEY).`]
				: []),
			...lignes.map(
				l =>
					`${l.famille} : ${l.vertes} conformes${l.ecarts ? `, ${l.ecarts} écarts connus` : ''}${l.aVenir ? `, ${l.aVenir} à venir` : ''}${l.regressions.length ? `, ${l.regressions.length} en échec` : ''}`
			),
		],
	})
	defauts.push(...enEchec)
	const empreinte = court(
		resultats
			.map(({ cas: c, resultat }) => `${c.etiquette} ${resultat.etat}`)
			.sort()
			.join('\n')
	)

	// 4. The robots file.
	{
		const problemes: string[] = []
		const infos: string[] = []
		try {
			const page = await lire(CHEMIN_DU_ROBOTS)
			const texte = page.corps
			if (page.statut !== 200) problemes.push(`répond ${page.statut} au lieu de 200`)
			else {
				if (!(page.type ?? '').includes('text/plain')) problemes.push('le type de contenu n’est pas du texte brut')
				if (!/^User-agent:/im.test(texte)) problemes.push('aucune ligne « User-agent »')
				if (!/^Sitemap:\s*\S+\/sitemap\.xml\s*$/im.test(texte))
					problemes.push('aucune ligne « Sitemap » vers sitemap.xml')
				if (!/^Disallow:\s*\/api\/\s*$/im.test(texte)) problemes.push('l’API n’est pas interdite')
			}
			infos.push(`${texte.split('\n').filter(Boolean).length} lignes, empreinte ${court(texte)}.`)
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) throw erreur
			problemes.push(`aucune réponse (${raison(erreur)})`)
		}
		sections.push({ titre: 'Fichier robots', conforme: problemes.length === 0, constats: [...problemes, ...infos] })
		if (problemes.length > 0) defauts.push(`Fichier robots : ${problemes.join(' ; ')}`)
	}

	// 5. The old authentication routes.
	{
		const constats: string[] = []
		let en404 = 0
		for (const route of ANCIENNES_ROUTES) {
			try {
				const page = await lire(route)
				if (page.statut === 404) en404++
				else constats.push(`${route} répond ${page.statut} au lieu de 404`)
			} catch (erreur) {
				if (erreur instanceof RequeteInterdite) throw erreur
				constats.push(`${route} : aucune réponse (${raison(erreur)})`)
			}
		}
		const conforme = en404 === ANCIENNES_ROUTES.length
		sections.push({
			titre: 'Anciennes routes d’authentification',
			conforme,
			constats: [`${en404} sur ${ANCIENNES_ROUTES.length} répondent 404.`, ...constats],
		})
		if (!conforme) defauts.push(`Anciennes routes : ${constats.join(' ; ')}`)
	}

	// 6. The script of the audience measurement, served by the site (the file is read, no event is sent).
	{
		const problemes: string[] = []
		const infos: string[] = []
		try {
			const page = await lire(CHEMIN_DU_SCRIPT)
			if (page.statut !== 200) problemes.push(`répond ${page.statut} au lieu de 200`)
			else {
				if (!/javascript/i.test(page.type ?? '')) problemes.push('le type de contenu n’est pas du JavaScript')
				if (page.corps.length === 0) problemes.push('le fichier est vide')
				infos.push(`${new TextEncoder().encode(page.corps).length} octets, empreinte ${court(page.corps)}.`)
			}
		} catch (erreur) {
			if (erreur instanceof RequeteInterdite) throw erreur
			problemes.push(`aucune réponse (${raison(erreur)})`)
		}
		sections.push({ titre: 'Script de mesure', conforme: problemes.length === 0, constats: [...problemes, ...infos] })
		if (problemes.length > 0) defauts.push(`Script de mesure : ${problemes.join(' ; ')}`)
	}

	// 7. No 5xx anywhere.
	const cinqCents = statuts.filter(s => s >= 500).length
	sections.push({
		titre: 'Erreurs serveur',
		conforme: cinqCents === 0,
		constats: [`${cinqCents} réponse${cinqCents > 1 ? 's' : ''} 5xx sur ${statuts.length} requêtes.`],
	})
	if (cinqCents > 0) defauts.push(`${cinqCents} réponse(s) 5xx`)

	return {
		date: (outils.maintenant?.() ?? new Date()).toISOString(),
		hote: cible.host,
		version,
		verdict: defauts.length === 0 ? 'conforme' : 'non-conforme',
		adresses: {
			controlees: cas.length,
			conformes,
			ecartsConnus: ecarts,
			enEchec: enEchec.length,
			aVenir: enAttente,
			nonLues: nonLues.length,
		},
		reponses5xx: cinqCents,
		requetes: statuts.length,
		ecartMinimalMs: ecartLePlusCourt(lecteur.departs),
		empreinte,
		sections,
		defauts,
	}
}

/** The report as the terminal shows it. */
export function ecrireLeRapport(rapport: Rapport): string {
	const lignes = [
		`Contrôle de l’hôte ${rapport.hote} le ${rapport.date}`,
		`Version servie : ${rapport.version ?? 'inconnue'}`,
		'',
	]
	for (const { titre, conforme, constats } of rapport.sections) {
		lignes.push(`${conforme ? 'CONFORME    ' : 'NON CONFORME'} ${titre}`)
		for (const constat of constats) lignes.push(`    ${constat}`)
	}
	lignes.push(
		'',
		`Requêtes : ${rapport.requetes}, écart le plus court entre deux départs : ${rapport.ecartMinimalMs ?? 'sans objet'} ms.`,
		`Empreinte des adresses : ${rapport.empreinte}`,
		`Verdict : ${rapport.verdict === 'conforme' ? 'CONFORME' : `NON CONFORME (${rapport.defauts.length} défaut${rapport.defauts.length > 1 ? 's' : ''})`}`
	)
	return lignes.join('\n')
}

/** The command: exit code 0, 1 or 2. */
export async function lancer(variables: Variables, ecrire: (ligne: string) => void = console.log): Promise<number> {
	let reglages: Reglages
	try {
		reglages = lireLesReglages(variables)
	} catch (erreur) {
		if (erreur instanceof CibleRefusee || erreur instanceof ControleRefuse) {
			ecrire(`Contrôle refusé : ${erreur.message}`)
			return 2
		}
		throw erreur
	}
	try {
		const rapport = await controlerLHote(reglages)
		ecrire(ecrireLeRapport(rapport))
		if (reglages.sortie) writeFileSync(reglages.sortie, `${JSON.stringify(rapport, null, 2)}\n`)
		return rapport.verdict === 'conforme' ? 0 : 1
	} catch (erreur) {
		ecrire(
			`Contrôle arrêté : ${erreur instanceof RequeteInterdite ? erreur.message : `une requête a échoué (${raison(erreur)})`}`
		)
		return 1
	}
}
