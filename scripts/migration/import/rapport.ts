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
import type { Bilan, CollectionImportee, Parite } from './moteur'
import { pariteComplete } from './moteur'
import type { EmpreinteDesTables } from './source'

export type Mode = 'a-blanc' | 'reel'

/** What a run did, or would do, in one collection. */
export interface BilanDeCollection extends Bilan {
	/** Documents the source holds. */
	source: number
	/** `strapiId` of the documents of the target the source no longer gives: listed, never deleted. */
	enTrop: number[]
}

export interface Rapport {
	mode: Mode
	cible: GenreDeCible
	/** The source, fingerprinted before and after the run by the read-only connection. */
	source: { avant: EmpreinteDesTables; apres: EmpreinteDesTables; inchangee: boolean }
	collections: Partial<Record<CollectionImportee, BilanDeCollection>>
	/** Transformations made on purpose, counted by reference. */
	ecarts: Record<string, number>
	/** After a real run only: the target read again, collection by collection. */
	parite: Partial<Record<CollectionImportee, Parite>> | null
}

/** The order the import writes the collections in, and their names in the report. */
export const NOMS_DES_COLLECTIONS: Readonly<Record<CollectionImportee, string>> = {
	pros: 'Comptes',
	profils: 'Profils',
	talents: 'Talents',
}

/** True when a run left the source as it was and, for a real run, reached a complete parity. */
export function importReussi(rapport: Rapport): boolean {
	if (!rapport.source.inchangee) return false
	if (rapport.mode === 'a-blanc') return true
	return Object.values(rapport.parite ?? {}).every(pariteComplete)
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
	return lignes
}

function ligneDeParite(nom: string, p: Parite): string[] {
	const lignes = [
		`${nom} : ${p.egaux} sur ${p.attendus} égaux, ${pariteComplete(p) ? 'parité complète' : 'parité incomplète'} ` +
			`(empreinte ${p.empreinteCible.slice(0, 12)}…)`,
	]
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
			: `Écarts voulus, à lire dans le registre : ${ecarts.map(([reference, n]) => `${reference} ${n}`).join(' ; ')}.`
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
