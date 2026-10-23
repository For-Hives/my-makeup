import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import { DEMO_ARTICLES, DEMO_TALENTS } from '../../src/demo-data/editorial'
import { profileUrl } from '../../src/demo-data/profiles'
import { BENCH_CONTENT, setBenchDataset } from '../fixtures/bench-dataset'
import { ROOT } from '../support/bench'
import { writeSession } from '../support/bench-session'
import { countDocuments, emptyBase, testPayload } from '../support/payload-test'
import { emptyStorage, listObjects } from '../support/s3'

/**
 * Ticket 052: the whole set of the bench, in one call and by the commands of the bench
 * (`bun run bench:reset`, `bun run bench:session`). Loaded twice it gives the same content;
 * the command that puts the bench back to its starting state takes seconds, not minutes; the
 * session it hands out is a real one and its token is never printed.
 */

let payload: Payload

const resetToZero = () => Promise.all([emptyBase(), emptyStorage()])

const countOf = async (collection: 'pros' | 'profiles' | 'admins' | 'talents' | 'articles'): Promise<number> =>
	(await payload.count({ collection, overrideAccess: true })).totalDocs

/** Profiles whose account is one of the twelve profile types: the way the admin panel counts them. */
const profilesTypes = async (): Promise<number> =>
	(
		await payload.count({
			collection: 'profiles',
			overrideAccess: true,
			where: { 'pro.email': { like: 'jeu-profil-' } },
		})
	).totalDocs

beforeAll(async () => {
	payload = await testPayload()
	await resetToZero()
})

afterAll(resetToZero)

describe('Le jeu complet du banc', () => {
	test('17 profils types, 3 talents, 3 articles dont un brouillon, et les comptes de chaque type', async () => {
		const summary = await setBenchDataset()

		expect(await profilesTypes()).toBe(BENCH_CONTENT.profilsTypes)
		expect(await countOf('talents')).toBe(BENCH_CONTENT.talents)
		expect(await countOf('articles')).toBe(BENCH_CONTENT.articles)
		const drafts = await payload.count({
			collection: 'articles',
			overrideAccess: true,
			where: { _status: { equals: 'draft' } },
		})
		expect(drafts.totalDocs).toBe(BENCH_CONTENT.brouillons)
		expect(await countOf('admins')).toBe(2)
		expect(summary.jeu.profils.crees).toHaveLength(17)
		expect(summary.jeu.redaction.talentsCrees).toEqual(DEMO_TALENTS.map(({ slug }) => slug))
		expect(summary.jeu.redaction.articlesCrees).toEqual(DEMO_ARTICLES.map(({ slug }) => slug))
	}, 60_000)

	test('chargé une seconde fois, il ne crée rien : ni doublon, ni second brouillon', async () => {
		const before = await countDocuments()
		const objects = await listObjects()

		const summary = await setBenchDataset()

		expect(await countDocuments()).toEqual(before)
		expect(await listObjects()).toEqual(objects)
		expect(summary.comptes.crees).toEqual([])
		expect(summary.jeu.profils.crees).toEqual([])
		expect(summary.jeu.redaction.talentsCrees).toEqual([])
		expect(summary.jeu.redaction.articlesCrees).toEqual([])
		expect(summary.jeu.redaction.presents).toHaveLength(6)
	}, 60_000)

	test('le brouillon n’est jamais lu par le public, les articles et talents publiés le sont', async () => {
		const read = await payload.find({ collection: 'articles', overrideAccess: false, user: null, depth: 0 })
		const slugs = read.docs.map(({ slug }) => slug).sort()

		expect(slugs).toEqual(
			DEMO_ARTICLES.filter(({ statut }) => statut === 'published')
				.map(({ slug }) => slug)
				.sort()
		)
		const talents = await payload.find({ collection: 'talents', overrideAccess: false, user: null, depth: 0 })
		expect(talents.totalDocs).toBe(DEMO_TALENTS.length)
	})
})

describe('Les commandes du banc', () => {
	/** A command of the bench, as a person runs it: its own process, the environment of the bench. */
	async function command(...ligne: string[]) {
		const start = performance.now()
		const child = Bun.spawn([process.execPath, '--no-env-file', 'scripts/bench.ts', ...ligne], {
			cwd: ROOT,
			env: process.env,
			stdin: 'ignore',
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, output, errors] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		])
		return { code, sortie: output, erreurs: errors, secondes: (performance.now() - start) / 1000 }
	}

	test('bench:reset remet le banc à son état de départ en moins de 30 secondes, deux fois de suite à l’identique', async () => {
		await resetToZero()
		const first = await command('reset')
		expect(first.code, first.erreurs).toBe(0)
		expect(first.secondes).toBeLessThan(30)
		const profiles = await countOf('profiles')
		const identifiers = (
			await payload.find({ collection: 'profiles', depth: 0, sort: 'id', pagination: false })
		).docs.map(({ id, slug }) => `${id}:${slug}`)

		const second = await command('reset')

		expect(second.code, second.erreurs).toBe(0)
		expect(second.secondes).toBeLessThan(30)
		expect(await profilesTypes()).toBe(17)
		expect(await countOf('talents')).toBe(3)
		expect(await countOf('articles')).toBe(3)
		expect(await countOf('profiles')).toBe(profiles)
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, sort: 'id', pagination: false })).docs.map(
				({ id, slug }) => `${id}:${slug}`
			)
		).toEqual(identifiers)
		expect(second.sortie).toContain('17 profils types')
		expect(second.sortie).toContain('3 talents, 3 articles dont un brouillon')
	}, 120_000)

	/** The headers file as `curl -H @fichier` reads it: one « Nom: valeur » per line. */
	async function fileHeaders(fichier: string): Promise<Headers> {
		const headers = new Headers()
		for (const line of (await readFile(fichier, 'utf8')).split('\n').filter(Boolean)) {
			const [itemName, ...value] = line.split(': ')
			headers.set(itemName ?? '', value.join(': '))
		}
		return headers
	}

	describe('bench:session', () => {
		let folder: string

		beforeAll(async () => {
			folder = await mkdtemp(path.join(tmpdir(), 'banc-session-'))
		})
		afterAll(() => rm(folder, { recursive: true, force: true }))

		test('une session de chaque côté : l’admin et une maquilleuse sont reconnus par Payload, le jeton va dans un fichier privé', async () => {
			const admin = await writeSession(payload, 'admin', { dossier: folder, instance: 'essai' })
			const artist = await writeSession(payload, 'profil-reference', { dossier: folder, instance: 'essai' })

			const recognized = await payload.auth({ headers: await fileHeaders(admin.entetes) })
			expect(recognized.user?.collection).toBe('admins')
			expect(recognized.user?.email).toBe('jeu-admin@example.test')
			const recognizedOne = await payload.auth({ headers: await fileHeaders(artist.entetes) })
			expect(recognizedOne.user?.collection).toBe('pros')
			expect(recognizedOne.user?.email).toBe(profileUrl('reference'))
			// Readable by its owner only.
			expect((await stat(admin.entetes)).mode & 0o077).toBe(0)
			expect((await stat(admin.etatDeNavigateur)).mode & 0o077).toBe(0)
			const state = JSON.parse(await readFile(admin.etatDeNavigateur, 'utf8')) as { cookies: { name: string }[] }
			expect(state.cookies.map(({ name }) => name)).toEqual(['payload-token'])
		})

		test('la commande n’affiche jamais le jeton, et refuse un compte inconnu en disant lesquels existent', async () => {
			const ok = await command('session', 'redaction')
			expect(ok.code, ok.erreurs).toBe(0)
			expect(ok.sortie).toContain('Session de jeu-redaction@example.test')
			expect(ok.sortie).toContain('Le jeton n’est pas affiché')
			// A signed token starts with « eyJ »: neither the output nor the errors may hold one.
			expect(ok.sortie + ok.erreurs).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/)
			const file = path.join(ROOT, '.banc/sessions')
			expect(ok.sortie).toContain(file)

			const unknown = await command('session', 'personne')
			expect(unknown.code).toBe(1)
			expect(unknown.erreurs).toContain('Le banc ne connaît pas de compte « personne »')
			expect(unknown.erreurs).toContain('profil-reference')
		}, 60_000)
	})
})
