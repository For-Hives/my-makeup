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

export type Mode = 'a-blanc' | 'reel'

/** How the documents of a collection split: accounts per provider of the old site, and legacy hashes. */
export interface Distribution {
	fournisseurs: Record<string, number>
	hashHerites: number
}

/** What a run did, or would do, in one collection. */
export interface CollectionSummary extends Summary {
	/** Documents the source holds. */
	source: number
	/** `strapiId` of the documents of the target the source no longer gives: listed, never deleted. */
	enTrop: number[]
	/** Documents of the target that hold no `strapiId` (pros, profils): added by hand, outside the import. */
	sansOrigine?: number
	/** Kept accounts that took the legacy hash of an account set aside (ticket 066). */
	hashRattaches?: number[]
	/** Legacy hashes of accounts set aside that no kept account could take. */
	hashNonRattaches?: number
	/** `strapiId` of the documents of the source the import does not take: set aside by a decision. */
	ecartes?: number[]
	/** `strapiId` of the accounts of the source deleted in the v3, left out with their profile (`--cible-en-service`). */
	supprimesDansLaV3?: number[]
	/** Accounts not confirmed at the source, taken confirmed. */
	nonConfirmes?: number[]
	/** What the run takes, split. */
	repartition?: Distribution
	/** The empty profiles the spam left without an account (SCHEMA.md §4.1): set aside, never taken. */
	spam?: number[]
	/** How many documents per status. */
	statuts?: Record<string, number>
	/** Profiles whose status, computed by the server, is not the one the source gives. */
	statutsDifferentsDeLaSource?: number[]
	/** The cities typed, become communes (ticket 063): in numbers and identifiers, never a text. */
	communes?: CitiesSummary
	/** The files of the source, adopted or not (ticket 058): in numbers and identifiers, never an address. */
	fichiers?: FilesSummary
	/** Photos of the entries taken whose file is not adopted: reported, never invented (tickets 060, 061). */
	photosNonReprises?: PhotoNotCarriedOver[]
	/** Profiles with a link of a list that names no row (SCHEMA.md §7). */
	liensSansLigne?: number[]
	/** The prices read (ticket 062): in numbers and identifiers, never a text. */
	prix?: PriceSummary
	/** Contact details left out because the server would refuse them: profile and field, never the value (ticket 064). */
	coordonneesARevoir?: { profil: number; champ: string }[]
	/** Radii above 200 km (register `rayon-200-km`): the field is left empty, the profile is taken (ticket 226). */
	rayonsARevoir?: RadiusToReview[]
	/** Profiles whose date of consent differs from the date this run asks for: the target keeps its own (ticket 227). */
	consentementsGardes?: number[]
	/** Rows of a list outside a bound of the v3, left out of their profile: profile, list and rank, never the text (ticket 226). */
	lignesLaissees?: SkippedProfileRow[]
}

/** The parity of a collection, and how the target splits, read again. */
export interface CollectionParity extends Parity {
	repartition?: Distribution
	statuts?: Record<string, number>
}

/** Why a run stopped before any write: the cases only a decision can settle (ticket 066). */
export interface Halt {
	/** Accounts that share one email without a decision, group by group, by identifier. */
	emailsPartages: number[][]
	/** Profiles of an account a decision sets aside, that no decision names (SCHEMA.md §11). */
	profilsDeComptesEcartes: number[]
	/** Profiles without an account in the source, out of the list of the spam (SCHEMA.md §4.1), that no decision names. */
	profilsSansCompte: number[]
}

export interface Report {
	mode: Mode
	cible: TargetKind
	/** Set when the run stopped before any write; nothing was written then. */
	arret: Halt | null
	/** The source, fingerprinted before and after the run by the read-only connection. */
	source: { avant: TablesFingerprint; apres: TablesFingerprint; inchangee: boolean }
	collections: Partial<Record<ImportedCollection, CollectionSummary>>
	/** Transformations made on purpose, counted by reference. */
	ecarts: Record<string, number>
	/** Decisions of the table that name no case of the source: without effect. */
	decisionsSansObjet: number
	/** After a real run only: the target read again, collection by collection. */
	parite: Partial<Record<ImportedCollection, CollectionParity>> | null
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
	if (rapport.arret) return 3
	if (!rapport.source.inchangee) return 4
	if (!Object.values(rapport.parite ?? {}).every(withoutUnexplainedGap)) return 4
	const refuses = Object.values(rapport.collections).some(bilan => bilan.refuses.length > 0)
	return refuses ? 5 : 0
}

/** Per collection, what a real run would write or find too many: the gap between the target and the source. */
export function targetGaps(
	rapport: Report
): { collection: ImportedCollection; crees: number; modifies: number; enTrop: number; sansOrigine: number }[] {
	return (Object.entries(rapport.collections) as [ImportedCollection, CollectionSummary][])
		.map(([collection, summary]) => ({
			collection,
			crees: summary.crees,
			modifies: summary.modifies,
			enTrop: summary.enTrop.length,
			sansOrigine: summary.sansOrigine ?? 0,
		}))
		.filter(({ crees, modifies, enTrop, sansOrigine }) => crees + modifies + enTrop + sansOrigine > 0)
}

/**
 * The exit code of a check (`--controle`): the one of a dry run, and 4 as well as soon as the
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
	if (rapport.arret) return 'Contrôle : sans conclusion, le passage s’est arrêté sur des cas à décider (code 3).'
	if (!rapport.source.inchangee) return 'Contrôle : sans conclusion, la source a changé pendant le passage (code 4).'
	const gaps = targetGaps(rapport)
	const refuses = Object.values(rapport.collections).reduce((total, bilan) => total + bilan.refuses.length, 0)
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
	const [one, several] = mode === 'reel' ? ['', ''] : [' annoncée', ' annoncées']
	const rows = [
		`${nom} : ${bilan.source} à la source ; ${plural(bilan.crees, `création${one}`, `créations${several}`)}, ` +
			`${plural(bilan.modifies, `mise à jour${one}`, `mises à jour${several}`)}, ` +
			`${plural(bilan.inchanges, 'inchangé', 'inchangés')}, ${plural(bilan.refuses.length, 'refusé', 'refusés')}`,
	]
	for (const refusal of bilan.refuses)
		rows.push(
			`  - refusé : ${refusal.strapiId} (${refusal.motif}${refusal.champs?.length ? ` : ${refusal.champs.join(', ')}` : ''})`
		)
	if (bilan.enTrop.length > 0) rows.push(`  - dans la cible, absents de la source, gardés : ${ids(bilan.enTrop)}`)
	if (bilan.ecartes?.length) rows.push(`  - écartés par la table de décision : ${ids(bilan.ecartes)}`)
	if (bilan.hashRattaches?.length)
		rows.push(
			`  - hash hérité d’un compte écarté, rattaché au compte gardé : ${ids(bilan.hashRattaches)}${bilan.hashNonRattaches ? ` ; ${plural(bilan.hashNonRattaches, 'hash écarté non rattaché', 'hash écartés non rattachés')}` : ''}`
		)
	else if (bilan.hashNonRattaches)
		rows.push(
			`  - ${plural(bilan.hashNonRattaches, 'hash écarté non rattaché', 'hash écartés non rattachés')} (le compte gardé a le sien, ou le prêt est refusé)`
		)
	if (bilan.supprimesDansLaV3?.length)
		rows.push(
			`  - supprimés dans la v3, ni repris ni leur profil : ${bilan.supprimesDansLaV3.length} (${ids(bilan.supprimesDansLaV3)})`
		)
	if (bilan.sansOrigine)
		rows.push(`  - dans la cible, sans identifiant de l’ancien site (ajoutés à la main) : ${bilan.sansOrigine}`)
	if (bilan.nonConfirmes?.length)
		rows.push(`  - non confirmés à la source, repris confirmés : ${ids(bilan.nonConfirmes)}`)
	if (bilan.repartition) rows.push(`  - ${distributionAsText(bilan.repartition)}`)
	if (bilan.spam?.length)
		rows.push(
			`  - écartés, profils vides laissés sans compte par le spam (SCHEMA.md §4.1) : ${bilan.spam.length} (${ids(bilan.spam)})`
		)
	if (bilan.fichiers) rows.push(...filesRows(bilan.fichiers))
	if (bilan.communes) rows.push(...citiesRows(bilan.communes))
	if (bilan.statuts) rows.push(`  - ${statusesAsText(bilan.statuts)}`)
	if (bilan.statutsDifferentsDeLaSource?.length)
		rows.push(
			`  - statut autre que celui que donne la source (section pas encore reprise, ou ville sans commune) : ${ids(bilan.statutsDifferentsDeLaSource)}`
		)
	if (bilan.photosNonReprises?.length)
		rows.push(
			`  - photos non reprises, leur fichier n’étant pas adopté : ${bilan.photosNonReprises
				.map(({ entree, fichier: file }) => `${entree} (fichier ${file})`)
				.join(', ')}`
		)
	if (bilan.liensSansLigne?.length)
		rows.push(`  - liens de liste qui ne nomment aucune ligne, signalés : ${ids(bilan.liensSansLigne)}`)
	if (bilan.prix) rows.push(...priceRows(bilan.prix))
	if (bilan.coordonneesARevoir?.length)
		rows.push(
			`  - coordonnées laissées de côté, que le serveur refuserait (à revoir à la main) : ${bilan.coordonneesARevoir
				.map(({ profil, champ }) => `${profil} (${champ})`)
				.join(', ')}`
		)
	if (bilan.consentementsGardes?.length)
		rows.push(
			`  - date de consentement déjà posée, gardée (la date demandée est autre) : ${bilan.consentementsGardes.length} (${ids(bilan.consentementsGardes)})`
		)
	if (bilan.rayonsARevoir?.length)
		rows.push(
			`  - rayon d’action au-dessus de 200 km, champ laissé vide, profil repris : ${bilan.rayonsARevoir.length} (${bilan.rayonsARevoir
				.map(({ profil, rayonKm }) => `${profil} : ${rayonKm} km`)
				.join(', ')})`
		)
	if (bilan.lignesLaissees?.length)
		rows.push(
			`  - lignes de liste hors des bornes de la v3, laissées de côté, reste du profil repris : ${bilan.lignesLaissees.length} (${bilan.lignesLaissees
				.map(({ profil, liste: list, rang, prestation }) =>
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
		`  - prix : ${prix.prix} (offres et options), ${prix.avecMontant} avec un montant, ${prix.textesLibres} en texte libre (texte gardé, montant vide), ${prix.sansTexte} sans texte ; ` +
			`${plural(prix.profilsAvecOffreChiffree, 'profil avec une offre chiffrée', 'profils avec une offre chiffrée')}, ` +
			`offre chiffrée perdue : ${ids(prix.offresChiffreesPerdues)}`,
	]
	if (prix.chiffresNonLus.length > 0)
		rows.push(`  - prix en texte avec des chiffres que la règle ne lit pas, texte gardé : ${ids(prix.chiffresNonLus)}`)
	return rows
}

function filesRows(fichiers: FilesSummary): string[] {
	const rows = [
		`  - fichiers : ${fichiers.designes} désignés par un profil ou un article repris ; ` +
			`désignés par aucun, donc non adoptés : ${fichiers.deEntreesNonPrises} liés à une entrée non reprise, ` +
			`${fichiers.deEntreesDisparues} à une entrée disparue, ${fichiers.sansLien} sans lien`,
	]
	if (fichiers.sansStockage)
		rows.push('  - aucun stockage des photos n’est donné à ce passage : aucun fichier n’est adopté')
	const byReason = new Map<string, number[]>()
	for (const { fichier: file, motif: reason } of fichiers.nonAdoptes)
		byReason.set(reason, [...(byReason.get(reason) ?? []), file])
	for (const [reason, list] of byReason) rows.push(`  - non adoptés (${reason}) : ${ids(list)}`)
	if (fichiers.introuvables.length > 0)
		rows.push(`  - 404 connus, adoptés sans objet dans le stockage : ${ids(fichiers.introuvables)}`)
	if (fichiers.nomsDifferents.length > 0)
		rows.push(`  - objet nommé autrement que hash suivi de ext : ${ids(fichiers.nomsDifferents)}`)
	if (fichiers.envoyesParUnAutreCompte.length > 0)
		rows.push(`  - envoyés par un autre compte que celui du profil : ${ids(fichiers.envoyesParUnAutreCompte)}`)
	return rows
}

/** A share in percent, the French way: « 81,8 % ». */
const percentage = (part: number | null): string =>
	part === null ? 'sans objet' : `${String(part).replace('.', ',')} %`

function citiesRows(communes: CitiesSummary): string[] {
	const rows = [
		`  - communes : ${communes.rattachees} sur ${plural(communes.villesRenseignees, 'ville renseignée', 'villes renseignées')} ` +
			`(${percentage(communes.part)}, cible 90 %) ; profils non vides avec une commune : ` +
			`${communes.profilsNonVidesAvecCommune} sur ${communes.profilsNonVides}`,
	]
	if (communes.aRevoir.length > 0)
		rows.push(`  - villes à revoir, zone vide (liste de revue privée, --revue) : ${ids(communes.aRevoir)}`)
	if (communes.adresses.length > 0)
		rows.push(`  - adresses postales, dont seule la commune est reprise : ${ids(communes.adresses)}`)
	if (communes.decidees.length > 0)
		rows.push(`  - villes tranchées par la table de décision : ${ids(communes.decidees)}`)
	return rows
}

const statusesAsText = (statuts: Record<string, number>): string =>
	`par statut : ${
		Object.entries(statuts)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([statut, nombre]) => `${statut} ${nombre}`)
			.join(', ') || 'aucun'
	}`

function distributionAsText({ fournisseurs, hashHerites }: Distribution): string {
	const byProvider = Object.entries(fournisseurs)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([fournisseur, nombre]) => `${fournisseur} ${nombre}`)
		.join(', ')
	return `par fournisseur : ${byProvider || 'aucun'} ; ${plural(hashHerites, 'hash hérité', 'hash hérités')}`
}

function haltRows({ emailsPartages, profilsDeComptesEcartes, profilsSansCompte }: Halt): string[] {
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
	const refuses = p.refuses.length > 0 ? `${plural(p.refuses.length, 'refusé', 'refusés')} (${ids(p.refuses)})` : ''
	if (withoutUnexplainedGap(p)) return `parité incomplète : ${refuses}`
	return `parité incomplète${refuses ? ` : ${refuses}, et d’autres écarts` : ''}`
}

function parityRow(nom: string, p: CollectionParity, sansOrigine = 0): string[] {
	// A document added by hand is not in the comparison by `strapiId`: it still breaks the parity.
	const state = sansOrigine > 0 && parityComplete(p) ? 'parité incomplète' : parityState(p)
	const rows = [`${nom} : ${p.egaux} sur ${p.attendus} égaux, ${state}, empreinte ${p.empreinteCible.slice(0, 12)}…`]
	if (sansOrigine > 0)
		rows.push(
			`  - dans la cible, ${plural(sansOrigine, 'document sans identifiant de l’ancien site (ajouté à la main)', 'documents sans identifiant de l’ancien site (ajoutés à la main)')}`
		)
	if (p.repartition) rows.push(`  - dans la cible, ${distributionAsText(p.repartition)}`)
	if (p.statuts) rows.push(`  - dans la cible, ${statusesAsText(p.statuts)}`)
	if (p.differents.length > 0) rows.push(`  - différents : ${ids(p.differents)}`)
	if (p.manquants.length > 0) rows.push(`  - manquants : ${ids(p.manquants)}`)
	if (p.enTrop.length > 0) rows.push(`  - en trop : ${ids(p.enTrop)}`)
	return rows
}

/** The report, as the command prints it, in French. */
export function reportAsText(rapport: Report): string {
	const rows = [
		rapport.mode === 'reel' ? 'Import réel.' : 'Import à blanc : rien n’est écrit. Pour écrire, relance avec --reel.',
		`Cible : ${rapport.cible === 'locale' ? 'une base de ce poste' : 'une base distante (--cible-distante)'}.`,
		'',
		...(rapport.arret ? haltRows(rapport.arret) : []),
	]
	for (const [collection, name] of Object.entries(COLLECTIONS_NAMES)) {
		const summary = rapport.collections[collection as ImportedCollection]
		if (summary) rows.push(...summaryRow(name, summary, rapport.mode))
	}
	const gaps = Object.entries(rapport.ecarts).sort(([a], [b]) => a.localeCompare(b))
	rows.push(
		'',
		gaps.length === 0
			? 'Écarts voulus : aucun.'
			: `Écarts voulus, à lire contre le registre ou le schéma : ${gaps.map(([reference, n]) => `${reference} ${n}`).join(' ; ')}.`
	)
	if (rapport.decisionsSansObjet > 0)
		rows.push(
			`${plural(rapport.decisionsSansObjet, 'décision de la table ne nomme', 'décisions de la table ne nomment')} aucun cas de la source : sans effet.`
		)
	if (rapport.parite) {
		rows.push('', 'Parité, la cible relue :')
		for (const [collection, name] of Object.entries(COLLECTIONS_NAMES)) {
			const p = rapport.parite[collection as ImportedCollection]
			if (p) rows.push(...parityRow(name, p, rapport.collections[collection as ImportedCollection]?.sansOrigine ?? 0))
		}
	}
	const tables = Object.values(rapport.source.apres)
	rows.push(
		'',
		`Source : ${plural(tables.length, 'table lue', 'tables lues')}, ${tables.reduce((n, t) => n + t.lignes, 0)} lignes, ` +
			(rapport.source.inchangee ? 'inchangée par l’import.' : 'CHANGÉE pendant l’import.')
	)
	return rows.join('\n')
}
