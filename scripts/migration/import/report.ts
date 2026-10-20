/**
 * The report of a run of the import: numbers, identifiers of the old base and fingerprints, never
 * a value (docs/migration/SCHEMA.md, rule 8). No name, no email, no phone, no hash: a document is
 * named by its `strapiId`, and a set of documents by a SHA-256.
 *
 * The transformations made on purpose are counted by their reference: a key of the register of
 * intended changes (docs/migration/CHANGEMENTS-VOULUS.md) or a section of the frozen schema. A
 * difference that has no reference is a defect: the parity lists it.
 */

import type { CitiesSummary } from './cities'
import type { ImportedCollection, Parity, Summary } from './engine'
import { parityComplete, withoutUnexplainedGap } from './engine'
import type { FilesSummary, PhotoNotCarriedOver } from './media'
import type { PriceSummary, RadiusToReview, SkippedProfileRow } from './profiles'
import type { TablesFingerprint } from './source'
import type { TargetKind } from './target'

export type Mode = 'dry-run' | 'real'

/** How the documents of a collection split: accounts per provider of the old site, and legacy hashes. */
export interface Distribution {
	providers: Record<string, number>
	legacyHashes: number
}

/** What a run did, or would do, in one collection. */
export interface CollectionSummary extends Summary {
	/** Documents the source holds. */
	source: number
	/** `strapiId` of the documents of the target the source no longer gives: listed, never deleted. */
	extra: number[]
	/** Documents of the target that hold no `strapiId` (pros, profils): added by hand, outside the import. */
	withoutOrigin?: number
	/** Kept accounts that took the legacy hash of an account set aside (ticket 066). */
	attachedHashes?: number[]
	/** Legacy hashes of accounts set aside that no kept account could take. */
	unattachedHashes?: number
	/** `strapiId` of the documents of the source the import does not take: set aside by a decision. */
	excluded?: number[]
	/** `strapiId` of the accounts of the source deleted in the v3, left out with their profile (`--target-in-service`). */
	deletedInV3?: number[]
	/** Accounts not confirmed at the source, taken confirmed. */
	unconfirmed?: number[]
	/** What the run takes, split. */
	distribution?: Distribution
	/** The empty profiles the spam left without an account (SCHEMA.md §4.1): set aside, never taken. */
	spam?: number[]
	/** How many documents per status. */
	statuses?: Record<string, number>
	/** Profiles whose status, computed by the server, is not the one the source gives. */
	statusesDifferingFromSource?: number[]
	/** The cities typed, become communes (ticket 063): in numbers and identifiers, never a text. */
	cities?: CitiesSummary
	/** The files of the source, adopted or not (ticket 058): in numbers and identifiers, never an address. */
	files?: FilesSummary
	/** Photos of the entries taken whose file is not adopted: reported, never invented (tickets 060, 061). */
	photosNotCarriedOver?: PhotoNotCarriedOver[]
	/** Profiles with a link of a list that names no row (SCHEMA.md §7). */
	linksWithoutRow?: number[]
	/** The prices read (ticket 062): in numbers and identifiers, never a text. */
	prices?: PriceSummary
	/** Contact details left out because the server would refuse them: profile and field, never the value (ticket 064). */
	contactDetailsToReview?: { profile: number; field: string }[]
	/** Radii above 200 km (register `rayon-200-km`): the field is left empty, the profile is taken (ticket 226). */
	radiiToReview?: RadiusToReview[]
	/** Profiles whose date of consent differs from the date this run asks for: the target keeps its own (ticket 227). */
	keptConsents?: number[]
	/** Rows of a list outside a bound of the v3, left out of their profile: profile, list and rank, never the text (ticket 226). */
	skippedRows?: SkippedProfileRow[]
}

/** The parity of a collection, and how the target splits, read again. */
export interface CollectionParity extends Parity {
	distribution?: Distribution
	statuses?: Record<string, number>
}

/** Why a run stopped before any write: the cases only a decision can settle (ticket 066). */
export interface Halt {
	/** Accounts that share one email without a decision, group by group, by identifier. */
	sharedEmails: number[][]
	/** Profiles of an account a decision sets aside, that no decision names (SCHEMA.md §11). */
	profilesOfExcludedAccounts: number[]
	/** Profiles without an account in the source, out of the list of the spam (SCHEMA.md §4.1), that no decision names. */
	profilesWithoutAccount: number[]
}

export interface Report {
	mode: Mode
	target: TargetKind
	/** Set when the run stopped before any write; nothing was written then. */
	halt: Halt | null
	/** The source, fingerprinted before and after the run by the read-only connection. */
	source: { before: TablesFingerprint; after: TablesFingerprint; unchanged: boolean }
	collections: Partial<Record<ImportedCollection, CollectionSummary>>
	/** Transformations made on purpose, counted by reference. */
	gaps: Record<string, number>
	/** Decisions of the table that name no case of the source: without effect. */
	pointlessDecisions: number
	/** After a real run only: the target read again, collection by collection. */
	parity: Partial<Record<ImportedCollection, CollectionParity>> | null
}

/** The order the import writes the collections in, and their names in the report. */
export const COLLECTIONS_NAMES: Readonly<Record<ImportedCollection, string>> = {
	pros: 'Comptes',
	media: 'Médias',
	profiles: 'Profils',
	articles: 'Articles',
	talents: 'Talents',
}

/**
 * The exit code of the command for a run (docs/migration/IMPORT.md, « Codes de sortie »):
 *
 * - 3: stopped before any write, on cases only a decision settles;
 * - 4: the source changed during the run, or the target differs from the source by more than the
 *   refused documents: something the report cannot explain;
 * - 5: documents refused, before the write or by Payload: listed, they wait for a decision, and
 *   the parity of a real run is incomplete by them;
 * - 0: done, nothing refused and, for a real run, a complete parity.
 */
export function exitCode(rapport: Report): 0 | 3 | 4 | 5 {
	if (rapport.halt) return 3
	if (!rapport.source.unchanged) return 4
	if (!Object.values(rapport.parity ?? {}).every(withoutUnexplainedGap)) return 4
	const refuses = Object.values(rapport.collections).some(bilan => bilan.refused.length > 0)
	return refuses ? 5 : 0
}

/** Per collection, what a real run would write or find too many: the gap between the target and the source. */
export function targetGaps(
	rapport: Report
): { collection: ImportedCollection; crees: number; modifies: number; enTrop: number; sansOrigine: number }[] {
	return (Object.entries(rapport.collections) as [ImportedCollection, CollectionSummary][])
		.map(([collection, summary]) => ({
			collection,
			crees: summary.created,
			modifies: summary.updated,
			enTrop: summary.extra.length,
			sansOrigine: summary.withoutOrigin ?? 0,
		}))
		.filter(({ crees, modifies, enTrop, sansOrigine }) => crees + modifies + enTrop + sansOrigine > 0)
}

/**
 * The exit code of a check (`--check`): the one of a dry run, and 4 as well as soon as the
 * target is not the source: an account removed or an email changed by hand shows as a creation or
 * an update that a real run would make, a document added by hand as one too many.
 */
export function checkExitCode(rapport: Report): 0 | 3 | 4 | 5 {
	const code = exitCode(rapport)
	return code === 0 && targetGaps(rapport).length > 0 ? 4 : code
}

/** What a check says about the target, in French, by collection and in numbers only. */
export function checkAsText(rapport: Report): string {
	// A run that stopped, lost a document or saw the source move compared nothing: it cannot say "same".
	if (rapport.halt) return 'Contrôle : sans conclusion, le passage s’est arrêté sur des cas à décider (code 3).'
	if (!rapport.source.unchanged) return 'Contrôle : sans conclusion, la source a changé pendant le passage (code 4).'
	const gaps = targetGaps(rapport)
	const refuses = Object.values(rapport.collections).reduce((total, bilan) => total + bilan.refused.length, 0)
	if (gaps.length === 0 && refuses > 0)
		return `Contrôle : sans conclusion complète, ${plural(refuses, 'document refusé', 'documents refusés')} attend une décision (code 5).`
	if (gaps.length === 0) return 'Contrôle : la cible est la source (0 création, 0 mise à jour, 0 document en trop).'
	return [
		'Contrôle : la cible n’est PAS la source.',
		...gaps.map(
			({ collection, crees, modifies, enTrop, sansOrigine }) =>
				`  - ${COLLECTIONS_NAMES[collection]} : ${plural(crees, 'création', 'créations')} à faire, ${plural(modifies, 'mise à jour', 'mises à jour')} à faire, ${plural(enTrop, 'document en trop', 'documents en trop')}, ${plural(sansOrigine, 'document sans origine', 'documents sans origine')}`
		),
	].join('\n')
}

const ids = (liste: readonly number[]): string => (liste.length === 0 ? 'aucun' : liste.join(', '))

const plural = (nombre: number, singulier: string, pluriel: string): string =>
	`${nombre} ${nombre > 1 ? pluriel : singulier}`

function summaryRow(nom: string, bilan: CollectionSummary, mode: Mode): string[] {
	const [one, several] = mode === 'real' ? ['', ''] : [' annoncée', ' annoncées']
	const rows = [
		`${nom} : ${bilan.source} à la source ; ${plural(bilan.created, `création${one}`, `créations${several}`)}, ` +
			`${plural(bilan.updated, `mise à jour${one}`, `mises à jour${several}`)}, ` +
			`${plural(bilan.unchanged, 'inchangé', 'inchangés')}, ${plural(bilan.refused.length, 'refusé', 'refusés')}`,
	]
	for (const refusal of bilan.refused)
		rows.push(
			`  - refusé : ${refusal.strapiId} (${refusal.reason}${refusal.fields?.length ? ` : ${refusal.fields.join(', ')}` : ''})`
		)
	if (bilan.extra.length > 0) rows.push(`  - dans la cible, absents de la source, gardés : ${ids(bilan.extra)}`)
	if (bilan.excluded?.length) rows.push(`  - écartés par la table de décision : ${ids(bilan.excluded)}`)
	if (bilan.attachedHashes?.length)
		rows.push(
			`  - hash hérité d’un compte écarté, rattaché au compte gardé : ${ids(bilan.attachedHashes)}${bilan.unattachedHashes ? ` ; ${plural(bilan.unattachedHashes, 'hash écarté non rattaché', 'hash écartés non rattachés')}` : ''}`
		)
	else if (bilan.unattachedHashes)
		rows.push(
			`  - ${plural(bilan.unattachedHashes, 'hash écarté non rattaché', 'hash écartés non rattachés')} (le compte gardé a le sien, ou le prêt est refusé)`
		)
	if (bilan.deletedInV3?.length)
		rows.push(
			`  - supprimés dans la v3, ni repris ni leur profil : ${bilan.deletedInV3.length} (${ids(bilan.deletedInV3)})`
		)
	if (bilan.withoutOrigin)
		rows.push(`  - dans la cible, sans identifiant de l’ancien site (ajoutés à la main) : ${bilan.withoutOrigin}`)
	if (bilan.unconfirmed?.length)
		rows.push(`  - non confirmés à la source, repris confirmés : ${ids(bilan.unconfirmed)}`)
	if (bilan.distribution) rows.push(`  - ${distributionAsText(bilan.distribution)}`)
	if (bilan.spam?.length)
		rows.push(
			`  - écartés, profils vides laissés sans compte par le spam (SCHEMA.md §4.1) : ${bilan.spam.length} (${ids(bilan.spam)})`
		)
	if (bilan.files) rows.push(...filesRows(bilan.files))
	if (bilan.cities) rows.push(...citiesRows(bilan.cities))
	if (bilan.statuses) rows.push(`  - ${statusesAsText(bilan.statuses)}`)
	if (bilan.statusesDifferingFromSource?.length)
		rows.push(
			`  - statut autre que celui que donne la source (section pas encore reprise, ou ville sans commune) : ${ids(bilan.statusesDifferingFromSource)}`
		)
	if (bilan.photosNotCarriedOver?.length)
		rows.push(
			`  - photos non reprises, leur fichier n’étant pas adopté : ${bilan.photosNotCarriedOver
				.map(({ entry: entree, file }) => `${entree} (fichier ${file})`)
				.join(', ')}`
		)
	if (bilan.linksWithoutRow?.length)
		rows.push(`  - liens de liste qui ne nomment aucune ligne, signalés : ${ids(bilan.linksWithoutRow)}`)
	if (bilan.prices) rows.push(...priceRows(bilan.prices))
	if (bilan.contactDetailsToReview?.length)
		rows.push(
			`  - coordonnées laissées de côté, que le serveur refuserait (à revoir à la main) : ${bilan.contactDetailsToReview
				.map(({ profile: profil, field: champ }) => `${profil} (${champ})`)
				.join(', ')}`
		)
	if (bilan.keptConsents?.length)
		rows.push(
			`  - date de consentement déjà posée, gardée (la date demandée est autre) : ${bilan.keptConsents.length} (${ids(bilan.keptConsents)})`
		)
	if (bilan.radiiToReview?.length)
		rows.push(
			`  - rayon d’action au-dessus de 200 km, champ laissé vide, profil repris : ${bilan.radiiToReview.length} (${bilan.radiiToReview
				.map(({ profile: profil, radiusKm: rayonKm }) => `${profil} : ${rayonKm} km`)
				.join(', ')})`
		)
	if (bilan.skippedRows?.length)
		rows.push(
			`  - lignes de liste hors des bornes de la v3, laissées de côté, reste du profil repris : ${bilan.skippedRows.length} (${bilan.skippedRows
				.map(({ profile: profil, liste: list, rang, prestation }) =>
					prestation === undefined
						? `${profil} : ${list} n° ${rang}`
						: `${profil} : ${list} n° ${rang} de la prestation n° ${prestation}`
				)
				.join(', ')})`
		)
	return rows
}

function priceRows(prix: PriceSummary): string[] {
	const rows = [
		`  - prix : ${prix.prices} (offres et options), ${prix.withAmount} avec un montant, ${prix.freeTexts} en texte libre (texte gardé, montant vide), ${prix.withoutText} sans texte ; ` +
			`${plural(prix.profilesWithPricedOffer, 'profil avec une offre chiffrée', 'profils avec une offre chiffrée')}, ` +
			`offre chiffrée perdue : ${ids(prix.lostPricedOffers)}`,
	]
	if (prix.unreadDigits.length > 0)
		rows.push(`  - prix en texte avec des chiffres que la règle ne lit pas, texte gardé : ${ids(prix.unreadDigits)}`)
	return rows
}

function filesRows(fichiers: FilesSummary): string[] {
	const rows = [
		`  - fichiers : ${fichiers.pointed} désignés par un profil ou un article repris ; ` +
			`désignés par aucun, donc non adoptés : ${fichiers.ofEntriesNotTaken} liés à une entrée non reprise, ` +
			`${fichiers.ofVanishedEntries} à une entrée disparue, ${fichiers.withoutLink} sans lien`,
	]
	if (fichiers.withoutStorage)
		rows.push('  - aucun stockage des photos n’est donné à ce passage : aucun fichier n’est adopté')
	const byReason = new Map<string, number[]>()
	for (const { file, reason } of fichiers.notAdopted) byReason.set(reason, [...(byReason.get(reason) ?? []), file])
	for (const [reason, list] of byReason) rows.push(`  - non adoptés (${reason}) : ${ids(list)}`)
	if (fichiers.notFound.length > 0)
		rows.push(`  - 404 connus, adoptés sans objet dans le stockage : ${ids(fichiers.notFound)}`)
	if (fichiers.differentNames.length > 0)
		rows.push(`  - objet nommé autrement que hash suivi de ext : ${ids(fichiers.differentNames)}`)
	if (fichiers.uploadedByAnotherAccount.length > 0)
		rows.push(`  - envoyés par un autre compte que celui du profil : ${ids(fichiers.uploadedByAnotherAccount)}`)
	return rows
}

/** A share in percent, the French way: « 81,8 % ». */
const percentage = (part: number | null): string =>
	part === null ? 'sans objet' : `${String(part).replace('.', ',')} %`

function citiesRows(communes: CitiesSummary): string[] {
	const rows = [
		`  - communes : ${communes.attached} sur ${plural(communes.filledCities, 'ville renseignée', 'villes renseignées')} ` +
			`(${percentage(communes.part)}, cible 90 %) ; profils non vides avec une commune : ` +
			`${communes.nonEmptyProfilesWithCity} sur ${communes.nonEmptyProfiles}`,
	]
	if (communes.toReview.length > 0)
		rows.push(`  - villes à revoir, zone vide (liste de revue privée, --review) : ${ids(communes.toReview)}`)
	if (communes.addresses.length > 0)
		rows.push(`  - adresses postales, dont seule la commune est reprise : ${ids(communes.addresses)}`)
	if (communes.decided.length > 0) rows.push(`  - villes tranchées par la table de décision : ${ids(communes.decided)}`)
	return rows
}

const statusesAsText = (statuts: Record<string, number>): string =>
	`par statut : ${
		Object.entries(statuts)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([statut, nombre]) => `${statut} ${nombre}`)
			.join(', ') || 'aucun'
	}`

function distributionAsText({ providers: fournisseurs, legacyHashes: hashHerites }: Distribution): string {
	const byProvider = Object.entries(fournisseurs)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([fournisseur, nombre]) => `${fournisseur} ${nombre}`)
		.join(', ')
	return `par fournisseur : ${byProvider || 'aucun'} ; ${plural(hashHerites, 'hash hérité', 'hash hérités')}`
}

function haltRows({
	sharedEmails: emailsPartages,
	profilesOfExcludedAccounts: profilsDeComptesEcartes,
	profilesWithoutAccount: profilsSansCompte,
}: Halt): string[] {
	const rows = ['Import arrêté avant toute écriture : rien n’est écrit.']
	if (emailsPartages.length > 0)
		rows.push(
			`- Des comptes de l’ancien site portent le même email, et la table de décision ne dit pas lequel garder. Groupes, par identifiant : ${emailsPartages.map(groupe => `[${groupe.join(', ')}]`).join(' ; ')}.`,
			'  Une décision par groupe, dans la table donnée par --decisions (docs/migration/IMPORT.md).'
		)
	if (profilsDeComptesEcartes.length > 0)
		rows.push(
			`- Des profils appartiennent à un compte que la table de décision écarte, et elle ne dit pas quoi en faire. Profils, par identifiant : ${ids(profilsDeComptesEcartes)}.`,
			'  Une décision par profil, dans la table donnée par --decisions (docs/migration/IMPORT.md).'
		)
	if (profilsSansCompte.length > 0)
		rows.push(
			`- Des profils n’ont aucun compte dans la source et ne sont pas parmi les 13 profils du spam (SCHEMA.md §4.1). Profils, par identifiant : ${ids(profilsSansCompte)}.`,
			'  Un profil sans compte ne se reprend pas : une décision par profil, dans la table donnée par --decisions (docs/migration/IMPORT.md).'
		)
	return [...rows, '']
}

/** How a parity reads: complete, incomplete by its refused documents only, or incomplete. */
function parityState(p: Parity): string {
	if (parityComplete(p)) return 'parité complète'
	const refuses = p.refused.length > 0 ? `${plural(p.refused.length, 'refusé', 'refusés')} (${ids(p.refused)})` : ''
	if (withoutUnexplainedGap(p)) return `parité incomplète : ${refuses}`
	return `parité incomplète${refuses ? ` : ${refuses}, et d’autres écarts` : ''}`
}

function parityRow(nom: string, p: CollectionParity, sansOrigine = 0): string[] {
	// A document added by hand is not in the comparison by `strapiId`: it still breaks the parity.
	const state = sansOrigine > 0 && parityComplete(p) ? 'parité incomplète' : parityState(p)
	const rows = [`${nom} : ${p.equal} sur ${p.expected} égaux, ${state}, empreinte ${p.targetFingerprint.slice(0, 12)}…`]
	if (sansOrigine > 0)
		rows.push(
			`  - dans la cible, ${plural(sansOrigine, 'document sans identifiant de l’ancien site (ajouté à la main)', 'documents sans identifiant de l’ancien site (ajoutés à la main)')}`
		)
	if (p.distribution) rows.push(`  - dans la cible, ${distributionAsText(p.distribution)}`)
	if (p.statuses) rows.push(`  - dans la cible, ${statusesAsText(p.statuses)}`)
	if (p.different.length > 0) rows.push(`  - différents : ${ids(p.different)}`)
	if (p.missing.length > 0) rows.push(`  - manquants : ${ids(p.missing)}`)
	if (p.extra.length > 0) rows.push(`  - en trop : ${ids(p.extra)}`)
	return rows
}

/** The report, as the command prints it, in French. */
export function reportAsText(rapport: Report): string {
	const rows = [
		rapport.mode === 'real' ? 'Import réel.' : 'Import à blanc : rien n’est écrit. Pour écrire, relance avec --real.',
		`Cible : ${rapport.target === 'local' ? 'une base de ce poste' : 'une base distante (--remote-target)'}.`,
		'',
		...(rapport.halt ? haltRows(rapport.halt) : []),
	]
	for (const [collection, name] of Object.entries(COLLECTIONS_NAMES)) {
		const summary = rapport.collections[collection as ImportedCollection]
		if (summary) rows.push(...summaryRow(name, summary, rapport.mode))
	}
	const gaps = Object.entries(rapport.gaps).sort(([a], [b]) => a.localeCompare(b))
	rows.push(
		'',
		gaps.length === 0
			? 'Écarts voulus : aucun.'
			: `Écarts voulus, à lire contre le registre ou le schéma : ${gaps.map(([reference, n]) => `${reference} ${n}`).join(' ; ')}.`
	)
	if (rapport.pointlessDecisions > 0)
		rows.push(
			`${plural(rapport.pointlessDecisions, 'décision de la table ne nomme', 'décisions de la table ne nomment')} aucun cas de la source : sans effet.`
		)
	if (rapport.parity) {
		rows.push('', 'Parité, la cible relue :')
		for (const [collection, name] of Object.entries(COLLECTIONS_NAMES)) {
			const p = rapport.parity[collection as ImportedCollection]
			if (p) rows.push(...parityRow(name, p, rapport.collections[collection as ImportedCollection]?.withoutOrigin ?? 0))
		}
	}
	const tables = Object.values(rapport.source.after)
	rows.push(
		'',
		`Source : ${plural(tables.length, 'table lue', 'tables lues')}, ${tables.reduce((n, t) => n + t.rows, 0)} lignes, ` +
			(rapport.source.unchanged ? 'inchangée par l’import.' : 'CHANGÉE pendant l’import.')
	)
	return rows.join('\n')
}
