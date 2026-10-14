/**
 * The report of a run of the import: numbers, identifiers of the old base and fingerprints, never
 * a value (docs/migration/SCHEMA.md, rule 8). No name, no email, no phone, no hash: a document is
 * named by its `strapiId`, and a set of documents by a SHA-256.
 *
 * The transformations made on purpose are counted by their reference: a key of the register of
 * intended changes (docs/migration/CHANGEMENTS-VOULUS.md) or a section of the frozen schema. A
 * difference that has no reference is a defect: the parity lists it.
 */

import type { GenreDeCible } from './cible'
import type { BilanDesCommunes } from './communes'
import type { BilanDesFichiers, PhotoNonReprise } from './medias'
import type { Bilan, CollectionImportee, Parite } from './moteur'
import { pariteComplete, sansEcartInexplique } from './moteur'
import type { EmpreinteDesTables } from './source'

export type Mode = 'a-blanc' | 'reel'

/** How the documents of a collection split: accounts per provider of the old site, and legacy hashes. */
export interface Repartition {
	fournisseurs: Record<string, number>
	hashHerites: number
}

/** What a run did, or would do, in one collection. */
export interface BilanDeCollection extends Bilan {
	/** Documents the source holds. */
	source: number
	/** `strapiId` of the documents of the target the source no longer gives: listed, never deleted. */
	enTrop: number[]
	/** `strapiId` of the documents of the source the import does not take: set aside by a decision. */
	ecartes?: number[]
	/** Accounts not confirmed at the source, taken confirmed. */
	nonConfirmes?: number[]
	/** What the run takes, split. */
	repartition?: Repartition
	/** The empty profiles the spam left without an account (SCHEMA.md §4.1): set aside, never taken. */
	spam?: number[]
	/** How many documents per status. */
	statuts?: Record<string, number>
	/** Profiles whose status, computed by the server, is not the one the source gives. */
	statutsDifferentsDeLaSource?: number[]
	/** The cities typed, become communes (ticket 063): in numbers and identifiers, never a text. */
	communes?: BilanDesCommunes
	/** The files of the source, adopted or not (ticket 058): in numbers and identifiers, never an address. */
	fichiers?: BilanDesFichiers
	/** Photos of the entries taken whose file is not adopted: reported, never invented (ticket 060). */
	photosNonReprises?: PhotoNonReprise[]
	/** Profiles with a link of a list that names no row (SCHEMA.md §7). */
	liensSansLigne?: number[]
}

/** The parity of a collection, and how the target splits, read again. */
export interface PariteDeCollection extends Parite {
	repartition?: Repartition
	statuts?: Record<string, number>
}

/** Why a run stopped before any write: the cases only a decision can settle (ticket 066). */
export interface Arret {
	/** Accounts that share one email without a decision, group by group, by identifier. */
	emailsPartages: number[][]
	/** Profiles of an account a decision sets aside, that no decision names (SCHEMA.md §11). */
	profilsDeComptesEcartes: number[]
	/** Profiles without an account in the source, out of the list of the spam (SCHEMA.md §4.1), that no decision names. */
	profilsSansCompte: number[]
}

export interface Rapport {
	mode: Mode
	cible: GenreDeCible
	/** Set when the run stopped before any write; nothing was written then. */
	arret: Arret | null
	/** The source, fingerprinted before and after the run by the read-only connection. */
	source: { avant: EmpreinteDesTables; apres: EmpreinteDesTables; inchangee: boolean }
	collections: Partial<Record<CollectionImportee, BilanDeCollection>>
	/** Transformations made on purpose, counted by reference. */
	ecarts: Record<string, number>
	/** Decisions of the table that name no case of the source: without effect. */
	decisionsSansObjet: number
	/** After a real run only: the target read again, collection by collection. */
	parite: Partial<Record<CollectionImportee, PariteDeCollection>> | null
}

/** The order the import writes the collections in, and their names in the report. */
export const NOMS_DES_COLLECTIONS: Readonly<Record<CollectionImportee, string>> = {
	pros: 'Comptes',
	media: 'Médias',
	profils: 'Profils',
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
export function codeDeSortie(rapport: Rapport): 0 | 3 | 4 | 5 {
	if (rapport.arret) return 3
	if (!rapport.source.inchangee) return 4
	if (!Object.values(rapport.parite ?? {}).every(sansEcartInexplique)) return 4
	const refuses = Object.values(rapport.collections).some(bilan => bilan.refuses.length > 0)
	return refuses ? 5 : 0
}

const ids = (liste: readonly number[]): string => (liste.length === 0 ? 'aucun' : liste.join(', '))

const pluriel = (nombre: number, singulier: string, pluriel: string): string =>
	`${nombre} ${nombre > 1 ? pluriel : singulier}`

function ligneDeBilan(nom: string, bilan: BilanDeCollection, mode: Mode): string[] {
	const [un, plusieurs] = mode === 'reel' ? ['', ''] : [' annoncée', ' annoncées']
	const lignes = [
		`${nom} : ${bilan.source} à la source ; ${pluriel(bilan.crees, `création${un}`, `créations${plusieurs}`)}, ` +
			`${pluriel(bilan.modifies, `mise à jour${un}`, `mises à jour${plusieurs}`)}, ` +
			`${pluriel(bilan.inchanges, 'inchangé', 'inchangés')}, ${pluriel(bilan.refuses.length, 'refusé', 'refusés')}`,
	]
	for (const refus of bilan.refuses)
		lignes.push(
			`  - refusé : ${refus.strapiId} (${refus.motif}${refus.champs?.length ? ` : ${refus.champs.join(', ')}` : ''})`
		)
	if (bilan.enTrop.length > 0) lignes.push(`  - dans la cible, absents de la source, gardés : ${ids(bilan.enTrop)}`)
	if (bilan.ecartes?.length) lignes.push(`  - écartés par la table de décision : ${ids(bilan.ecartes)}`)
	if (bilan.nonConfirmes?.length)
		lignes.push(`  - non confirmés à la source, repris confirmés : ${ids(bilan.nonConfirmes)}`)
	if (bilan.repartition) lignes.push(`  - ${repartitionEnTexte(bilan.repartition)}`)
	if (bilan.spam?.length)
		lignes.push(
			`  - écartés, profils vides laissés sans compte par le spam (SCHEMA.md §4.1) : ${bilan.spam.length} (${ids(bilan.spam)})`
		)
	if (bilan.fichiers) lignes.push(...lignesDesFichiers(bilan.fichiers))
	if (bilan.communes) lignes.push(...lignesDesCommunes(bilan.communes))
	if (bilan.statuts) lignes.push(`  - ${statutsEnTexte(bilan.statuts)}`)
	if (bilan.statutsDifferentsDeLaSource?.length)
		lignes.push(
			`  - statut autre que celui que donne la source (section pas encore reprise, ou ville sans commune) : ${ids(bilan.statutsDifferentsDeLaSource)}`
		)
	if (bilan.photosNonReprises?.length)
		lignes.push(
			`  - photos non reprises, leur fichier n’étant pas adopté : ${bilan.photosNonReprises
				.map(({ entree, fichier }) => `${entree} (fichier ${fichier})`)
				.join(', ')}`
		)
	if (bilan.liensSansLigne?.length)
		lignes.push(`  - liens de liste qui ne nomment aucune ligne, signalés : ${ids(bilan.liensSansLigne)}`)
	return lignes
}

function lignesDesFichiers(fichiers: BilanDesFichiers): string[] {
	const lignes = [
		`  - fichiers : ${fichiers.designes} désignés par un profil ou un article repris ; ` +
			`désignés par aucun, donc non adoptés : ${fichiers.deEntreesNonPrises} liés à une entrée non reprise, ` +
			`${fichiers.deEntreesDisparues} à une entrée disparue, ${fichiers.sansLien} sans lien`,
	]
	if (fichiers.sansStockage)
		lignes.push('  - aucun stockage des photos n’est donné à ce passage : aucun fichier n’est adopté')
	const parMotif = new Map<string, number[]>()
	for (const { fichier, motif } of fichiers.nonAdoptes) parMotif.set(motif, [...(parMotif.get(motif) ?? []), fichier])
	for (const [motif, liste] of parMotif) lignes.push(`  - non adoptés (${motif}) : ${ids(liste)}`)
	if (fichiers.introuvables.length > 0)
		lignes.push(`  - 404 connus, adoptés sans objet dans le stockage : ${ids(fichiers.introuvables)}`)
	if (fichiers.nomsDifferents.length > 0)
		lignes.push(`  - objet nommé autrement que hash suivi de ext : ${ids(fichiers.nomsDifferents)}`)
	if (fichiers.envoyesParUnAutreCompte.length > 0)
		lignes.push(`  - envoyés par un autre compte que celui du profil : ${ids(fichiers.envoyesParUnAutreCompte)}`)
	return lignes
}

/** A share in percent, the French way: « 81,8 % ». */
const pourcentage = (part: number | null): string =>
	part === null ? 'sans objet' : `${String(part).replace('.', ',')} %`

function lignesDesCommunes(communes: BilanDesCommunes): string[] {
	const lignes = [
		`  - communes : ${communes.rattachees} sur ${pluriel(communes.villesRenseignees, 'ville renseignée', 'villes renseignées')} ` +
			`(${pourcentage(communes.part)}, cible 90 %) ; profils non vides avec une commune : ` +
			`${communes.profilsNonVidesAvecCommune} sur ${communes.profilsNonVides}`,
	]
	if (communes.aRevoir.length > 0)
		lignes.push(`  - villes à revoir, zone vide (liste de revue privée, --revue) : ${ids(communes.aRevoir)}`)
	if (communes.adresses.length > 0)
		lignes.push(`  - adresses postales, dont seule la commune est reprise : ${ids(communes.adresses)}`)
	if (communes.decidees.length > 0)
		lignes.push(`  - villes tranchées par la table de décision : ${ids(communes.decidees)}`)
	return lignes
}

const statutsEnTexte = (statuts: Record<string, number>): string =>
	`par statut : ${
		Object.entries(statuts)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([statut, nombre]) => `${statut} ${nombre}`)
			.join(', ') || 'aucun'
	}`

function repartitionEnTexte({ fournisseurs, hashHerites }: Repartition): string {
	const parFournisseur = Object.entries(fournisseurs)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([fournisseur, nombre]) => `${fournisseur} ${nombre}`)
		.join(', ')
	return `par fournisseur : ${parFournisseur || 'aucun'} ; ${pluriel(hashHerites, 'hash hérité', 'hash hérités')}`
}

function lignesDArret({ emailsPartages, profilsDeComptesEcartes, profilsSansCompte }: Arret): string[] {
	const lignes = ['Import arrêté avant toute écriture : rien n’est écrit.']
	if (emailsPartages.length > 0)
		lignes.push(
			`- Des comptes de l’ancien site portent le même email, et la table de décision ne dit pas lequel garder. Groupes, par identifiant : ${emailsPartages.map(groupe => `[${groupe.join(', ')}]`).join(' ; ')}.`,
			'  Une décision par groupe, dans la table donnée par --decisions (docs/migration/IMPORT.md).'
		)
	if (profilsDeComptesEcartes.length > 0)
		lignes.push(
			`- Des profils appartiennent à un compte que la table de décision écarte, et elle ne dit pas quoi en faire. Profils, par identifiant : ${ids(profilsDeComptesEcartes)}.`,
			'  Une décision par profil, dans la table donnée par --decisions (docs/migration/IMPORT.md).'
		)
	if (profilsSansCompte.length > 0)
		lignes.push(
			`- Des profils n’ont aucun compte dans la source et ne sont pas parmi les 13 profils du spam (SCHEMA.md §4.1). Profils, par identifiant : ${ids(profilsSansCompte)}.`,
			'  Un profil sans compte ne se reprend pas : une décision par profil, dans la table donnée par --decisions (docs/migration/IMPORT.md).'
		)
	return [...lignes, '']
}

/** How a parity reads: complete, incomplete by its refused documents only, or incomplete. */
function etatDeLaParite(p: Parite): string {
	if (pariteComplete(p)) return 'parité complète'
	const refuses = p.refuses.length > 0 ? `${pluriel(p.refuses.length, 'refusé', 'refusés')} (${ids(p.refuses)})` : ''
	if (sansEcartInexplique(p)) return `parité incomplète : ${refuses}`
	return `parité incomplète${refuses ? ` : ${refuses}, et d’autres écarts` : ''}`
}

function ligneDeParite(nom: string, p: PariteDeCollection): string[] {
	const lignes = [
		`${nom} : ${p.egaux} sur ${p.attendus} égaux, ${etatDeLaParite(p)}, empreinte ${p.empreinteCible.slice(0, 12)}…`,
	]
	if (p.repartition) lignes.push(`  - dans la cible, ${repartitionEnTexte(p.repartition)}`)
	if (p.statuts) lignes.push(`  - dans la cible, ${statutsEnTexte(p.statuts)}`)
	if (p.differents.length > 0) lignes.push(`  - différents : ${ids(p.differents)}`)
	if (p.manquants.length > 0) lignes.push(`  - manquants : ${ids(p.manquants)}`)
	if (p.enTrop.length > 0) lignes.push(`  - en trop : ${ids(p.enTrop)}`)
	return lignes
}

/** The report, as the command prints it, in French. */
export function rapportEnTexte(rapport: Rapport): string {
	const lignes = [
		rapport.mode === 'reel' ? 'Import réel.' : 'Import à blanc : rien n’est écrit. Pour écrire, relance avec --reel.',
		`Cible : ${rapport.cible === 'locale' ? 'une base de ce poste' : 'une base distante (--cible-distante)'}.`,
		'',
		...(rapport.arret ? lignesDArret(rapport.arret) : []),
	]
	for (const [collection, nom] of Object.entries(NOMS_DES_COLLECTIONS)) {
		const bilan = rapport.collections[collection as CollectionImportee]
		if (bilan) lignes.push(...ligneDeBilan(nom, bilan, rapport.mode))
	}
	const ecarts = Object.entries(rapport.ecarts).sort(([a], [b]) => a.localeCompare(b))
	lignes.push(
		'',
		ecarts.length === 0
			? 'Écarts voulus : aucun.'
			: `Écarts voulus, à lire contre le registre ou le schéma : ${ecarts.map(([reference, n]) => `${reference} ${n}`).join(' ; ')}.`
	)
	if (rapport.decisionsSansObjet > 0)
		lignes.push(
			`${pluriel(rapport.decisionsSansObjet, 'décision de la table ne nomme', 'décisions de la table ne nomment')} aucun cas de la source : sans effet.`
		)
	if (rapport.parite) {
		lignes.push('', 'Parité, la cible relue :')
		for (const [collection, nom] of Object.entries(NOMS_DES_COLLECTIONS)) {
			const p = rapport.parite[collection as CollectionImportee]
			if (p) lignes.push(...ligneDeParite(nom, p))
		}
	}
	const tables = Object.values(rapport.source.apres)
	lignes.push(
		'',
		`Source : ${pluriel(tables.length, 'table lue', 'tables lues')}, ${tables.reduce((n, t) => n + t.lignes, 0)} lignes, ` +
			(rapport.source.inchangee ? 'inchangée par l’import.' : 'CHANGÉE pendant l’import.')
	)
	return lignes.join('\n')
}
