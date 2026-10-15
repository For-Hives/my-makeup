/**
 * The weekly statistics (ticket 149; plan 04 §3.6): what GET /api/stats/weekly answers to the
 * weekly report of the owner. Aggregates only: counts, and the slugs of the profiles a visitor can
 * see, which are public addresses already. No name, no email, no phone, no account identifier.
 *
 * Three pieces, none of which reads the database or the request:
 * - `StatsHebdo`, the schema of the answer, strict: an unknown key is refused. The report tool
 *   (plans/mesures/outil) has no dependency and cannot import it; it validates the same shape by
 *   hand, and both sides test the published example (docs/mesure/stats-hebdo.exemple.json).
 * - `lirePeriode`, the period asked for.
 * - `agregerStats`, the counts, from the profiles and the account dates the caller read.
 *
 * Optional keys came later (169: contact messages, sign-ins, inherited hashes; 212 and 213 next):
 * a reader that knows `version: 1` must keep working on an answer that has fewer of them.
 *
 * Relative imports on purpose, like the rest of src/lib: no `next` import.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { CODES_EVENEMENT, TYPES_EVENEMENT } from './auth/journal'
import { ETATS_DU_MAIL, STATUTS_DE_DEMANDE } from './contact/etats'
import { completude } from './profil/completude'
import { champsDuProfil, type DocumentDuProfil } from './profil/etat'

/** A published profile has this status; the rest is a draft or hidden. */
const STATUT_PUBLIE = 'publie'

export const VERSION_STATS = 1

/** 28 days: the window of the cohort of chiffre 6, before the week. */
const JOURS_DE_LA_COHORTE = 28
/** 90 days: « modified recently ». */
const JOURS_DE_FRAICHEUR = 90
/** The longest period the route answers for. */
export const PERIODE_MAX_JOURS = 92

const JOUR_MS = 86_400_000

const compte = z.number().int().nonnegative()
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)

export const StatsHebdo = z.strictObject({
	version: z.literal(VERSION_STATS),
	/** The period asked for, `debut` included, `fin` excluded, as UTC instants. */
	periode: z.strictObject({ debut: instant, fin: instant }),
	genereLe: instant,
	comptes: z.strictObject({
		total: compte,
		/** Created in the period. */
		nouveaux: compte,
	}),
	profils: z.strictObject({
		total: compte,
		/** None of the six conditions: counted apart, and inside `total`. */
		entierementVides: compte,
		/** Main photo, usable city and speciality. */
		actifs: compte,
		/** The six conditions AND shown on the site: a hidden or draft profile is not counted. */
		publiables: compte,
		/** Hidden by an admin. */
		masques: compte,
		/** At least 11 criteria out of 13. */
		complets11: compte,
		/** 2 criteria out of 13, or fewer. */
		quasiVides: compte,
		/** No contact channel. */
		sansCanal: compte,
		/** Modified in the 90 days before the end of the period. */
		modifies90j: compte,
		/** Created in the period. */
		crees: compte,
	}),
	/** The profiles created in the 28 days before the period, and how many are active today. */
	cohorte: z.strictObject({ profils: compte, actifs: compte }),
	/** The profiles created in the period, one by one: no name, only the state. */
	inscriptions: z.array(
		z.strictObject({
			creeLe: jour,
			completude: z.number().int().min(0).max(13),
			actif: z.boolean(),
			publiable: z.boolean(),
		})
	),
	/** The only detail that is given on a profile, and only for those a visitor can see. */
	publiables: z.strictObject({
		/** Count by department code; `inconnu` when the commune has none. */
		parDepartement: z.record(z.string(), compte),
		slugs: z.array(z.string()),
	}),
	/** Ticket 169. The contact messages received in the period: counts by status and by mail state. */
	contact: z
		.strictObject({
			total: compte,
			parStatut: z.record(z.string(), compte),
			parEtatMail: z.record(z.string(), compte),
		})
		.optional(),
	/**
	 * Ticket 169. The authentication events of the period, from the journal (no IP, no email: the
	 * journal holds none). `connexions` is the `connexion` events alone.
	 */
	auth: z
		.strictObject({
			parType: z.record(z.string(), compte),
			connexions: z.strictObject({
				total: compte,
				parCode: z.record(z.string(), compte),
				/** 95th percentile of the duration of a sign-in, in ms (nearest rank); null without any duration. */
				dureeP95Ms: compte.nullable(),
			}),
		})
		.optional(),
	/**
	 * Ticket 169, for the follow-up M6 of plan 01 §2.4. A snapshot of today, not of the period:
	 * the hashes of the old site still stored, and the accounts that never had a password of their
	 * own, by provider of the old site.
	 */
	herites: z
		.strictObject({
			hashRestants: compte,
			/**
			 * Accounts of a provider other than `local` with no inherited hash, by `legacyProvider` (`google`,
			 * `facebook`, `autre`). Payload keeps no mark of a password set later (reset link): those stay counted.
			 */
			sansMotDePasseParFournisseur: z.record(z.string(), compte),
		})
		.optional(),
})

export type StatsHebdo = z.infer<typeof StatsHebdo>

/** The period asked for, as instants; `fin` is excluded. */
export interface Periode {
	debut: Date
	fin: Date
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

function lireInstant(valeur: string | null): Date | undefined {
	if (valeur === null || !ISO_UTC.test(valeur)) return undefined
	const date = new Date(valeur)
	return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * `from` and `to` of the query: two ISO 8601 instants with their offset, `from` before `to`, at
 * most 92 days apart. Anything else is refused (400): no default period.
 */
export function lirePeriode(parametres: URLSearchParams): Periode | undefined {
	if (parametres.getAll('from').length !== 1 || parametres.getAll('to').length !== 1) return undefined
	const debut = lireInstant(parametres.get('from'))
	const fin = lireInstant(parametres.get('to'))
	if (!debut || !fin || debut >= fin) return undefined
	if (fin.getTime() - debut.getTime() > PERIODE_MAX_JOURS * JOUR_MS) return undefined
	return { debut, fin }
}

/** What the aggregation reads of a profile. */
export interface ProfilPourStats extends DocumentDuProfil {
	slug?: string | null
	createdAt: string
	updatedAt: string
	statut?: string | null
	completude?: number | null
	actif?: boolean | null
	publiable?: boolean | null
	entierementVide?: boolean | null
	commune?: { nom?: string | null; codeInsee?: string | null; departement?: string | null } | null
}

const PARIS = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Paris',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
})

/** The day of an instant in Paris, `AAAA-MM-JJ`. */
export function jourParis(date: Date): string {
	return PARIS.format(date)
}

const dans = (date: Date, debut: Date, fin: Date): boolean => date >= debut && date < fin

/**
 * The counts. `maintenant` caps the end of the freshness window, so a period in the future does
 * not widen it.
 */
export function agregerStats({
	profils,
	datesDesComptes,
	periode,
	maintenant,
}: {
	profils: readonly ProfilPourStats[]
	datesDesComptes: readonly string[]
	periode: Periode
	maintenant: Date
}): StatsHebdo {
	const finFraicheur = new Date(Math.min(periode.fin.getTime(), maintenant.getTime()))
	const debutFraicheur = new Date(finFraicheur.getTime() - JOURS_DE_FRAICHEUR * JOUR_MS)
	const debutCohorte = new Date(periode.debut.getTime() - JOURS_DE_LA_COHORTE * JOUR_MS)

	const resume = {
		total: profils.length,
		entierementVides: 0,
		actifs: 0,
		publiables: 0,
		masques: 0,
		complets11: 0,
		quasiVides: 0,
		sansCanal: 0,
		modifies90j: 0,
		crees: 0,
	}
	const cohorte = { profils: 0, actifs: 0 }
	const inscriptions: StatsHebdo['inscriptions'] = []
	const parDepartement: Record<string, number> = {}
	const slugs: string[] = []

	for (const profil of profils) {
		const lecture = completude(champsDuProfil(profil))
		const creeLe = new Date(profil.createdAt)
		const actif = profil.actif === true
		const publiable = profil.publiable === true
		const score = typeof profil.completude === 'number' ? profil.completude : lecture.score
		if (profil.entierementVide === true) resume.entierementVides++
		if (actif) resume.actifs++
		if (profil.statut === 'masque') resume.masques++
		if (score >= 11) resume.complets11++
		if (score <= 2) resume.quasiVides++
		if (lecture.manquants.includes('reseaux')) resume.sansCanal++
		if (dans(new Date(profil.updatedAt), debutFraicheur, finFraicheur)) resume.modifies90j++
		if (dans(creeLe, periode.debut, periode.fin)) {
			resume.crees++
			inscriptions.push({ creeLe: jourParis(creeLe), completude: score, actif, publiable })
		}
		if (dans(creeLe, debutCohorte, periode.debut)) {
			cohorte.profils++
			if (actif) cohorte.actifs++
		}
		if (publiable && profil.statut === STATUT_PUBLIE && typeof profil.slug === 'string') {
			resume.publiables++
			slugs.push(profil.slug)
			const departement = profil.commune?.departement || 'inconnu'
			parDepartement[departement] = (parDepartement[departement] ?? 0) + 1
		}
	}

	return {
		version: VERSION_STATS,
		periode: { debut: periode.debut.toISOString(), fin: periode.fin.toISOString() },
		genereLe: maintenant.toISOString(),
		comptes: {
			total: datesDesComptes.length,
			nouveaux: datesDesComptes.filter(date => dans(new Date(date), periode.debut, periode.fin)).length,
		},
		profils: resume,
		cohorte,
		inscriptions: inscriptions.sort((a, b) => a.creeLe.localeCompare(b.creeLe) || a.completude - b.completude),
		publiables: {
			parDepartement: Object.fromEntries(Object.entries(parDepartement).sort(([a], [b]) => a.localeCompare(b))),
			slugs: slugs.sort(),
		},
	}
}

/** The closed lists, as counters at zero: a count that is zero is in the answer, not missing from it. */
const compteurs = (cles: readonly string[]): Record<string, number> => Object.fromEntries(cles.map(cle => [cle, 0]))

/** Adds one to a counter that is in the list; a key outside it is ignored. */
function ajouter(compteur: Record<string, number>, cle: unknown): boolean {
	if (typeof cle !== 'string' || !Object.hasOwn(compteur, cle)) return false
	compteur[cle] = (compteur[cle] ?? 0) + 1
	return true
}

/** What the count of the messages reads of a row of `demandes`: two closed lists, nothing typed by a visitor. */
export interface DemandePourStats {
	statut?: string | null
	etatMail?: string | null
}

/** Contact messages received in the period (the caller read them): counts by status and by mail state. */
export function agregerContact(demandes: readonly DemandePourStats[]): NonNullable<StatsHebdo['contact']> {
	const parStatut = compteurs(STATUTS_DE_DEMANDE)
	const parEtatMail = compteurs(ETATS_DU_MAIL)
	for (const { statut, etatMail } of demandes) {
		ajouter(parStatut, statut)
		ajouter(parEtatMail, etatMail)
	}
	return { total: demandes.length, parStatut, parEtatMail }
}

/** What the count of the sign-ins reads of a row of the journal. */
export interface EvenementPourStats {
	type?: string | null
	code?: string | null
	dureeMs?: number | null
}

/** Nearest-rank percentile of a list of durations; null for an empty list. */
export function centile(valeurs: readonly number[], p: number): number | null {
	if (valeurs.length === 0) return null
	const tries = [...valeurs].sort((a, b) => a - b)
	return tries[Math.max(0, Math.ceil(p * tries.length) - 1)] ?? null
}

/** Authentication events of the period (the caller read them): by kind, and the sign-ins by outcome with their 95th percentile. */
export function agregerAuth(evenements: readonly EvenementPourStats[]): NonNullable<StatsHebdo['auth']> {
	const parType = compteurs(TYPES_EVENEMENT)
	const parCode = compteurs(CODES_EVENEMENT)
	const durees: number[] = []
	let total = 0
	for (const { type, code, dureeMs } of evenements) {
		if (!ajouter(parType, type) || type !== 'connexion') continue
		total++
		ajouter(parCode, code)
		if (typeof dureeMs === 'number') durees.push(dureeMs)
	}
	const p95 = centile(durees, 0.95)
	return { parType, connexions: { total, parCode, dureeP95Ms: p95 === null ? null : Math.round(p95) } }
}

/**
 * The providers of the old site whose accounts the report counts without a password; any other value
 * but `local` is `autre`. A `local` account has no place here: it had a password on the old site, so
 * once its hash is gone it has signed in and has a password of Payload's.
 */
export const FOURNISSEURS_HERITES = ['google', 'facebook', 'autre'] as const

/** The token of an `Authorization: Bearer` header, or nothing. */
export function jetonDeLEntete(entete: string | null): string | undefined {
	const [schema, jeton, ...reste] = (entete ?? '').split(' ')
	return schema === 'Bearer' && jeton && reste.length === 0 ? jeton : undefined
}

/** True when the header carries exactly the token of the service. Constant time; false without a configured token. */
export function jetonValide(entete: string | null, attendu: string | undefined): boolean {
	const recu = jetonDeLEntete(entete)
	if (!attendu || !recu) return false
	const empreinte = (texte: string) => createHash('sha256').update(texte).digest()
	return timingSafeEqual(empreinte(recu), empreinte(attendu))
}
