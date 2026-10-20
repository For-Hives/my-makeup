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
	benchEnvironment,
	commandPrefix,
	type Environment,
	type Instance,
	RefusedBench,
	readInstance,
	type Variables,
} from './bench'
import { checkBase } from './environment-guard'
import { benchStorage, deleteObject, dropObject, listObjects, type ObjectStorage, readObject } from './s3'
import { eraseBase, fillBase, prepareBase, type Run } from './source-strapi/creation'
import { type Line, type SourceDefinition, sourceDefinition } from './source-strapi/data'
import type { SourceState } from './source-strapi/inventory'
import { identifier, TABLE_NAMES, type TableName } from './source-strapi/schema'

export { FIXTURE_ACCOUNTS as COMPTES_DE_FIXTURE, type FixtureAccount as CompteDeFixture } from './source-strapi/data'
export {
	type InventoryLine as LigneDInventaire,
	inventory as inventaire,
	inventoryInMarkdown as inventaireEnMarkdown,
} from './source-strapi/inventory'

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
	stockage: ObjectStorage
	/** The public address of the bucket: the URL of each file starts with it. */
	medias: string
}

const SERVICE = 'la fausse base Strapi'

/** A database, a role, a password: written into SQL statements, so only plain characters. */
const BASE_NAME = /^[a-z][a-z0-9_]{0,50}_test$/
const ROLE_NAME = /^[a-z][a-z0-9_]{0,62}$/
const FAKE_PASSWORD = /^[A-Za-z0-9-]{8,100}$/

/** How many objects are sent or removed at once. */
const FRONT_OBJECTS = 10

/**
 * The source of the bench this process works on. Throws `BancRefuse` when the environment does not
 * point at it: no bench at all (a tool started by hand), or another one (a working `.env`, the
 * bench of a neighbour).
 *
 * `environnement` is what the bench instance says (.env.test, with its ports): given by a unit
 * test only, to check what is refused even when .env.test itself would say it.
 */
export function benchSource(
	variables: Variables = process.env,
	environnement: Environment = benchEnvironment(readInstance(variables))
): SourceStrapi {
	const instance = readInstance(variables)
	const names = ['DATABASE_URI', 'STRAPI_SOURCE_URI', 'S3_ENDPOINT', 'S3_BUCKET']
	const gap = names.find(nom => !variables[nom] || variables[nom] !== environnement[nom])
	if (gap !== undefined) {
		const prefix = commandPrefix(instance)
		throw new RefusedBench(
			[
				variables[gap]
					? `${gap} ne désigne pas le banc de test : ${SERVICE} n’est ni créée ni lue.`
					: `Aucun banc de test n’est réglé (${gap} manque) : ${SERVICE} n’est ni créée ni lue.`,
				`Démarre le banc par « ${prefix}bun run bench:up », puis crée la source par « ${prefix}bun run bench:source ».`,
			].join(' ')
		)
	}
	const maintenance = variables.DATABASE_URI ?? ''
	const reading = variables.STRAPI_SOURCE_URI ?? ''
	checkBase(maintenance)
	checkBase(reading, 'STRAPI_SOURCE_URI')
	const maintenanceValue = new URL(maintenance)
	const forReading = new URL(reading)
	const base = forReading.pathname.slice(1)
	const role = decodeURIComponent(forReading.username)
	const password = decodeURIComponent(forReading.password)
	if (maintenanceValue.host !== forReading.host)
		throw new RefusedBench('STRAPI_SOURCE_URI doit désigner le même serveur que DATABASE_URI : celui du banc.')
	if (!BASE_NAME.test(base) || base === maintenanceValue.pathname.slice(1))
		throw new RefusedBench('STRAPI_SOURCE_URI doit nommer une base à elle, en minuscules, qui finit par « _test ».')
	if (!ROLE_NAME.test(role) || role === decodeURIComponent(maintenanceValue.username) || !FAKE_PASSWORD.test(password))
		throw new RefusedBench(
			'STRAPI_SOURCE_URI doit porter un rôle à lui (minuscules, chiffres, « _ ») et un mot de passe factice (lettres, chiffres, « - »).'
		)
	const administration = new URL(maintenance)
	administration.pathname = `/${base}`
	const storage = benchStorage(variables)
	return {
		instance,
		maintenance,
		administration: administration.href,
		lecture: reading,
		base,
		role,
		stockage: storage,
		medias: `${storage.adresse}/${encodeURIComponent(storage.bucket)}`,
	}
}

/** Runs `travail` on a connection of its own, always closed after. */
async function withValue<T>(adresse: string, travail: (sql: SQL) => Promise<T>): Promise<T> {
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
export function openSource(source: SourceStrapi = benchSource()): SQL {
	return new SQL({ url: source.lecture, max: 1 })
}

/** Runs the statements of ./source-strapi/creation.ts on a connection of bun. */
const runWith =
	(sql: Pick<SQL, 'unsafe'>): Run =>
	async (texte, parametres) =>
		parametres === undefined ? [...(await sql.unsafe(texte))] : [...(await sql.unsafe(texte, [...parametres]))]

/** The keys of every object the files of the source name: originals and derived formats. */
function namedKeys(fichiers: readonly Line[], medias: string): string[] {
	const keys = new Set<string>()
	const add = (url: unknown) => {
		if (typeof url === 'string' && url.startsWith(`${medias}/`)) keys.add(url.slice(medias.length + 1))
	}
	for (const file of fichiers) {
		add(file.url)
		const formats = file.formats
		if (formats && typeof formats === 'object')
			for (const format of Object.values(formats)) add((format as { url?: unknown } | null)?.url)
	}
	return [...keys].sort()
}

async function byBatches<T>(elements: readonly T[], travail: (element: T) => Promise<unknown>): Promise<void> {
	for (let startedAt = 0; startedAt < elements.length; startedAt += FRONT_OBJECTS)
		await Promise.all(elements.slice(startedAt, startedAt + FRONT_OBJECTS).map(travail))
}

/**
 * Creates the source, or creates it again from nothing: database, tables, rows, hashes, read-only
 * role, objects. Two calls give the same source, and the same fingerprint.
 */
export async function createSourceStrapi(source: SourceStrapi = benchSource()): Promise<SourceDefinition> {
	const definition = sourceDefinition(source.medias)
	const password = decodeURIComponent(new URL(source.lecture).password)

	await withValue(source.maintenance, sql =>
		prepareBase(runWith(sql), { base: source.base, role: source.role, motDePasse: password })
	)
	await withValue(source.administration, sql =>
		sql.begin(transaction => fillBase(runWith(transaction), definition, source.role))
	)

	// The objects: those of the definition, and none of those it leaves missing on purpose.
	const present = new Set(definition.objets.map(objet => objet.cle))
	const missing = namedKeys(definition.lignes.files, source.medias).filter(cle => !present.has(cle))
	await byBatches(missing, cle => deleteObject(cle, { stockage: source.stockage }))
	await byBatches(definition.objets, objet =>
		dropObject(objet.cle, objet.octets, { stockage: source.stockage, type: objet.type })
	)
	return definition
}

/** Drops the source: database, role and the objects its files name. Nothing else of the bench is touched. */
export async function eraseSourceStrapi(source: SourceStrapi = benchSource()): Promise<void> {
	await withValue(source.maintenance, sql => eraseBase(runWith(sql), { base: source.base, role: source.role }))
	const { lignes: lines, objets: objects } = sourceDefinition(source.medias)
	const keys = new Set([...namedKeys(lines.files, source.medias), ...objects.map(objet => objet.cle)])
	await byBatches([...keys], cle => deleteObject(cle, { stockage: source.stockage }))
}

/** Every row of the source, read by the read-only role, and the keys the bucket holds. */
export async function readSource(source: SourceStrapi = benchSource()): Promise<SourceState> {
	const read = await withValue(source.lecture, async sql => {
		const tables: Partial<Record<TableName, Line[]>> = {}
		for (const table of TABLE_NAMES)
			tables[table] = [...(await sql.unsafe(`SELECT * FROM ${identifier(table)} ORDER BY id`))] as Line[]
		return tables as Record<TableName, Line[]>
	})
	const objects = new Set((await listObjects('', { stockage: source.stockage })).map(objet => objet.cle))
	return { lignes: read, objets: objects, medias: source.medias }
}

/** The fingerprint of the source: its schema, each table, each object its files name. */
export interface SourceFingerprint {
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
export async function sourceFingerprint(source: SourceStrapi = benchSource()): Promise<SourceFingerprint> {
	const {
		schema,
		tables,
		fichiers: files,
		grandsObjets: largeObjects,
	} = await withValue(source.lecture, async sql => {
		const columns = (await sql.unsafe(`
			SELECT c.relname AS table, a.attnum AS rang, a.attname AS colonne, format_type(a.atttypid, a.atttypmod) AS type
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
			WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
			ORDER BY c.relname COLLATE "C", a.attnum
		`)) as { table: string; rang: number; colonne: string; type: string }[]
		const names = [...new Set(columns.map(colonne => colonne.table))]
		const fingerprints: Record<string, { lignes: number; empreinte: string }> = {}
		for (const name of names) {
			const [line] = (await sql.unsafe(`
				SELECT count(*)::int AS lignes,
					coalesce(encode(sha256(convert_to(string_agg(h, E'\\n' ORDER BY h COLLATE "C"), 'UTF8')), 'hex'), '') AS empreinte
				FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text, 'UTF8')), 'hex') AS h FROM public.${identifier(name)} t) s
			`)) as { lignes: number; empreinte: string }[]
			fingerprints[name] = { lignes: line?.lignes ?? 0, empreinte: line?.empreinte ?? '' }
		}
		// Large objects are not in any table: their identifier and owner are all the role can read of them.
		const [large] = (await sql.unsafe(`
			SELECT count(*)::int AS nombre,
				coalesce(encode(sha256(convert_to(string_agg(oid::text || ':' || lomowner::text, ',' ORDER BY oid), 'UTF8')), 'hex'), '') AS empreinte
			FROM pg_catalog.pg_largeobject_metadata
		`)) as { nombre: number; empreinte: string }[]
		const fileLines = names.includes('files')
			? ([...(await sql.unsafe('SELECT url, formats FROM files ORDER BY id'))] as Line[])
			: []
		return {
			schema: sha256(columns.map(c => `${c.table}\t${c.rang}\t${c.colonne}\t${c.type}`).join('\n')),
			tables: fingerprints,
			fichiers: fileLines,
			grandsObjets: { nombre: large?.nombre ?? 0, empreinte: large?.empreinte ?? '' },
		}
	})

	const keys = namedKeys(files, source.medias)
	const objectLines: string[] = []
	for (const key of keys) {
		const object = await readObject(key, { stockage: source.stockage })
		objectLines.push(`${key}\t${object ? `${sha256(object.octets)}\t${object.type}` : 'absent'}`)
	}
	const objects = {
		cles: keys.length,
		presents: objectLines.filter(ligne => !ligne.endsWith('\tabsent')).length,
		empreinte: sha256(objectLines.join('\n')),
	}
	return {
		empreinte: sha256(JSON.stringify({ schema, tables, objets: objects, grandsObjets: largeObjects })),
		tables,
		schema,
		objets: objects,
		grandsObjets: largeObjects,
	}
}
