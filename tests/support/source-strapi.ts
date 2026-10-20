/**
 * The fake Strapi source of the bench: a PostgreSQL database with the tables of the old API that
 * the import reads, its pictures in the object storage, and a role that can only read it
 * (docs/tests/source-strapi.md).
 *
 *   await creerLaSourceStrapi()              creates it, or creates it again: same rows, same objects
 *   await empreinteDeLaSource()              its fingerprint: tables and objects, read by the read-only role
 *   inventaire(await lireLaSource())         each case it carries, in numbers
 *   const sql = ouvrirLaSource()             a read-only connection, as the import opens it
 *   await effacerLaSourceStrapi()            drops the database, the role and the objects
 *
 * The source lives in the PostgreSQL of the bench, next to the database of the application, in
 * its own database (`STRAPI_SOURCE_URI` of .env.test). Its objects are in the bucket of the bench,
 * where the application reads its pictures: the import adopts them without copying them.
 *
 * Every tool works on the bench instance this process was started for, and no other: the
 * variables must be exactly those of that instance, local, with a database name ending in
 * « _test ». A hash or an email is never printed: errors name a variable, never a value.
 */

import { createHash } from 'node:crypto'
import { SQL } from 'bun'
import {
	BancRefuse,
	type Environnement,
	environnementDuBanc,
	type Instance,
	lireInstance,
	prefixeDeCommande,
	type Variables,
} from './bench'
import { verifierBase } from './environment-guard'
import { deposerUnObjet, lireUnObjet, listerLesObjets, type Stockage, stockageDuBanc, supprimerUnObjet } from './s3'
import { type Executer, effacerLaBase, preparerLaBase, remplirLaBase } from './source-strapi/creation'
import { type DefinitionDeLaSource, definitionDeLaSource, type Ligne } from './source-strapi/data'
import type { EtatDeLaSource } from './source-strapi/inventory'
import { identifiant, NOMS_DES_TABLES, type NomDeTable } from './source-strapi/schema'

export { COMPTES_DE_FIXTURE, type CompteDeFixture } from './source-strapi/data'
export { inventaire, inventaireEnMarkdown, type LigneDInventaire } from './source-strapi/inventory'

/** The fake source of one bench instance: where it lives, and who may read it. */
export interface SourceStrapi {
	instance: Instance
	/** The database of the bench, as its owner: the source database is created and dropped from there. */
	maintenance: string
	/** The source database, as the owner of the bench: its tables are created and filled from there. */
	administration: string
	/** The source database, as the read-only role: `STRAPI_SOURCE_URI`. */
	lecture: string
	base: string
	role: string
	stockage: Stockage
	/** The public address of the bucket: the URL of each file starts with it. */
	medias: string
}

const SERVICE = 'la fausse base Strapi'

/** A database, a role, a password: written into SQL statements, so only plain characters. */
const NOM_DE_BASE = /^[a-z][a-z0-9_]{0,50}_test$/
const NOM_DE_ROLE = /^[a-z][a-z0-9_]{0,62}$/
const MOT_DE_PASSE_FACTICE = /^[A-Za-z0-9-]{8,100}$/

/** How many objects are sent or removed at once. */
const OBJETS_DE_FRONT = 10

/**
 * The source of the bench this process works on. Throws `BancRefuse` when the environment does not
 * point at it: no bench at all (a tool started by hand), or another one (a working `.env`, the
 * bench of a neighbour).
 *
 * `environnement` is what the bench instance says (.env.test, with its ports): given by a unit
 * test only, to check what is refused even when .env.test itself would say it.
 */
export function sourceDuBanc(
	variables: Variables = process.env,
	environnement: Environnement = environnementDuBanc(lireInstance(variables))
): SourceStrapi {
	const instance = lireInstance(variables)
	const noms = ['DATABASE_URI', 'STRAPI_SOURCE_URI', 'S3_ENDPOINT', 'S3_BUCKET']
	const ecart = noms.find(nom => !variables[nom] || variables[nom] !== environnement[nom])
	if (ecart !== undefined) {
		const prefixe = prefixeDeCommande(instance)
		throw new BancRefuse(
			[
				variables[ecart]
					? `${ecart} ne désigne pas le banc de test : ${SERVICE} n’est ni créée ni lue.`
					: `Aucun banc de test n’est réglé (${ecart} manque) : ${SERVICE} n’est ni créée ni lue.`,
				`Démarre le banc par « ${prefixe}bun run banc:up », puis crée la source par « ${prefixe}bun run banc:source ».`,
			].join(' ')
		)
	}
	const maintenance = variables.DATABASE_URI ?? ''
	const lecture = variables.STRAPI_SOURCE_URI ?? ''
	verifierBase(maintenance)
	verifierBase(lecture, 'STRAPI_SOURCE_URI')
	const deMaintenance = new URL(maintenance)
	const deLecture = new URL(lecture)
	const base = deLecture.pathname.slice(1)
	const role = decodeURIComponent(deLecture.username)
	const motDePasse = decodeURIComponent(deLecture.password)
	if (deMaintenance.host !== deLecture.host)
		throw new BancRefuse('STRAPI_SOURCE_URI doit désigner le même serveur que DATABASE_URI : celui du banc.')
	if (!NOM_DE_BASE.test(base) || base === deMaintenance.pathname.slice(1))
		throw new BancRefuse('STRAPI_SOURCE_URI doit nommer une base à elle, en minuscules, qui finit par « _test ».')
	if (
		!NOM_DE_ROLE.test(role) ||
		role === decodeURIComponent(deMaintenance.username) ||
		!MOT_DE_PASSE_FACTICE.test(motDePasse)
	)
		throw new BancRefuse(
			'STRAPI_SOURCE_URI doit porter un rôle à lui (minuscules, chiffres, « _ ») et un mot de passe factice (lettres, chiffres, « - »).'
		)
	const administration = new URL(maintenance)
	administration.pathname = `/${base}`
	const stockage = stockageDuBanc(variables)
	return {
		instance,
		maintenance,
		administration: administration.href,
		lecture,
		base,
		role,
		stockage,
		medias: `${stockage.adresse}/${encodeURIComponent(stockage.bucket)}`,
	}
}

/** Runs `travail` on a connection of its own, always closed after. */
async function avec<T>(adresse: string, travail: (sql: SQL) => Promise<T>): Promise<T> {
	const sql = new SQL({ url: adresse, max: 1 })
	try {
		return await travail(sql)
	} finally {
		await sql.close()
	}
}

/**
 * A connection to the source as the read-only role, as the import opens it. The caller closes it
 * (`await sql.close()`). Any write is refused by PostgreSQL.
 */
export function ouvrirLaSource(source: SourceStrapi = sourceDuBanc()): SQL {
	return new SQL({ url: source.lecture, max: 1 })
}

/** Runs the statements of ./source-strapi/creation.ts on a connection of bun. */
const executerAvec =
	(sql: Pick<SQL, 'unsafe'>): Executer =>
	async (texte, parametres) =>
		parametres === undefined ? [...(await sql.unsafe(texte))] : [...(await sql.unsafe(texte, [...parametres]))]

/** The keys of every object the files of the source name: originals and derived formats. */
function clesNommees(fichiers: readonly Ligne[], medias: string): string[] {
	const cles = new Set<string>()
	const ajouter = (url: unknown) => {
		if (typeof url === 'string' && url.startsWith(`${medias}/`)) cles.add(url.slice(medias.length + 1))
	}
	for (const fichier of fichiers) {
		ajouter(fichier.url)
		const formats = fichier.formats
		if (formats && typeof formats === 'object')
			for (const format of Object.values(formats)) ajouter((format as { url?: unknown } | null)?.url)
	}
	return [...cles].sort()
}

async function parPaquets<T>(elements: readonly T[], travail: (element: T) => Promise<unknown>): Promise<void> {
	for (let debut = 0; debut < elements.length; debut += OBJETS_DE_FRONT)
		await Promise.all(elements.slice(debut, debut + OBJETS_DE_FRONT).map(travail))
}

/**
 * Creates the source, or creates it again from nothing: database, tables, rows, hashes, read-only
 * role, objects. Two calls give the same source, and the same fingerprint.
 */
export async function creerLaSourceStrapi(source: SourceStrapi = sourceDuBanc()): Promise<DefinitionDeLaSource> {
	const definition = definitionDeLaSource(source.medias)
	const motDePasse = decodeURIComponent(new URL(source.lecture).password)

	await avec(source.maintenance, sql =>
		preparerLaBase(executerAvec(sql), { base: source.base, role: source.role, motDePasse })
	)
	await avec(source.administration, sql =>
		sql.begin(transaction => remplirLaBase(executerAvec(transaction), definition, source.role))
	)

	// The objects: those of the definition, and none of those it leaves missing on purpose.
	const presentes = new Set(definition.objets.map(objet => objet.cle))
	const manquantes = clesNommees(definition.lignes.files, source.medias).filter(cle => !presentes.has(cle))
	await parPaquets(manquantes, cle => supprimerUnObjet(cle, { stockage: source.stockage }))
	await parPaquets(definition.objets, objet =>
		deposerUnObjet(objet.cle, objet.octets, { stockage: source.stockage, type: objet.type })
	)
	return definition
}

/** Drops the source: database, role and the objects its files name. Nothing else of the bench is touched. */
export async function effacerLaSourceStrapi(source: SourceStrapi = sourceDuBanc()): Promise<void> {
	await avec(source.maintenance, sql => effacerLaBase(executerAvec(sql), { base: source.base, role: source.role }))
	const { lignes, objets } = definitionDeLaSource(source.medias)
	const cles = new Set([...clesNommees(lignes.files, source.medias), ...objets.map(objet => objet.cle)])
	await parPaquets([...cles], cle => supprimerUnObjet(cle, { stockage: source.stockage }))
}

/** Every row of the source, read by the read-only role, and the keys the bucket holds. */
export async function lireLaSource(source: SourceStrapi = sourceDuBanc()): Promise<EtatDeLaSource> {
	const lues = await avec(source.lecture, async sql => {
		const tables: Partial<Record<NomDeTable, Ligne[]>> = {}
		for (const table of NOMS_DES_TABLES)
			tables[table] = [...(await sql.unsafe(`SELECT * FROM ${identifiant(table)} ORDER BY id`))] as Ligne[]
		return tables as Record<NomDeTable, Ligne[]>
	})
	const objets = new Set((await listerLesObjets('', { stockage: source.stockage })).map(objet => objet.cle))
	return { lignes: lues, objets, medias: source.medias }
}

/** The fingerprint of the source: its schema, each table, each object its files name. */
export interface EmpreinteDeLaSource {
	/** SHA-256 of all that follows. */
	empreinte: string
	/** Table → number of rows and SHA-256 of the rows. */
	tables: Record<string, { lignes: number; empreinte: string }>
	schema: string
	objets: { cles: number; presents: number; empreinte: string }
	/** The large objects of the database (`pg_largeobject_metadata`): they live outside the tables (ticket 227). */
	grandsObjets: { nombre: number; empreinte: string }
}

const sha256 = (contenu: string | Uint8Array): string => createHash('sha256').update(contenu).digest('hex')

/**
 * Computes the fingerprint by the read-only role. Every table of the schema `public` counts, the
 * ones the source did not create included; each row is serialised and hashed by PostgreSQL, and
 * no value leaves it. Each object named by a file counts by its content and its type, or as
 * missing. Nothing is written anywhere.
 */
export async function empreinteDeLaSource(source: SourceStrapi = sourceDuBanc()): Promise<EmpreinteDeLaSource> {
	const { schema, tables, fichiers, grandsObjets } = await avec(source.lecture, async sql => {
		const colonnes = (await sql.unsafe(`
			SELECT c.relname AS table, a.attnum AS rang, a.attname AS colonne, format_type(a.atttypid, a.atttypmod) AS type
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
			WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
			ORDER BY c.relname COLLATE "C", a.attnum
		`)) as { table: string; rang: number; colonne: string; type: string }[]
		const noms = [...new Set(colonnes.map(colonne => colonne.table))]
		const empreintes: Record<string, { lignes: number; empreinte: string }> = {}
		for (const nom of noms) {
			const [ligne] = (await sql.unsafe(`
				SELECT count(*)::int AS lignes,
					coalesce(encode(sha256(convert_to(string_agg(h, E'\\n' ORDER BY h COLLATE "C"), 'UTF8')), 'hex'), '') AS empreinte
				FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text, 'UTF8')), 'hex') AS h FROM public.${identifiant(nom)} t) s
			`)) as { lignes: number; empreinte: string }[]
			empreintes[nom] = { lignes: ligne?.lignes ?? 0, empreinte: ligne?.empreinte ?? '' }
		}
		// Large objects are not in any table: their identifier and owner are all the role can read of them.
		const [grands] = (await sql.unsafe(`
			SELECT count(*)::int AS nombre,
				coalesce(encode(sha256(convert_to(string_agg(oid::text || ':' || lomowner::text, ',' ORDER BY oid), 'UTF8')), 'hex'), '') AS empreinte
			FROM pg_catalog.pg_largeobject_metadata
		`)) as { nombre: number; empreinte: string }[]
		const lignesDesFichiers = noms.includes('files')
			? ([...(await sql.unsafe('SELECT url, formats FROM files ORDER BY id'))] as Ligne[])
			: []
		return {
			schema: sha256(colonnes.map(c => `${c.table}\t${c.rang}\t${c.colonne}\t${c.type}`).join('\n')),
			tables: empreintes,
			fichiers: lignesDesFichiers,
			grandsObjets: { nombre: grands?.nombre ?? 0, empreinte: grands?.empreinte ?? '' },
		}
	})

	const cles = clesNommees(fichiers, source.medias)
	const lignesDesObjets: string[] = []
	for (const cle of cles) {
		const objet = await lireUnObjet(cle, { stockage: source.stockage })
		lignesDesObjets.push(`${cle}\t${objet ? `${sha256(objet.octets)}\t${objet.type}` : 'absent'}`)
	}
	const objets = {
		cles: cles.length,
		presents: lignesDesObjets.filter(ligne => !ligne.endsWith('\tabsent')).length,
		empreinte: sha256(lignesDesObjets.join('\n')),
	}
	return {
		empreinte: sha256(JSON.stringify({ schema, tables, objets, grandsObjets })),
		tables,
		schema,
		objets,
		grandsObjets,
	}
}
