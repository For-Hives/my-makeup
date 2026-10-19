import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Payload } from 'payload'
import { adresseDuProfil } from '../../src/jeu-fictif/profils'
import { ARTICLES_DU_JEU, TALENTS_DU_JEU } from '../../src/jeu-fictif/redaction'
import { CONTENU_DU_BANC, poserLeJeuDuBanc } from '../fixtures/jeu-du-banc'
import { RACINE } from '../outils/banc'
import { ecrireLaSession } from '../outils/banc-session'
import { compterLesDocuments, payloadDeTest, viderLaBase } from '../outils/payload-test'
import { listerLesObjets, viderLeStockage } from '../outils/s3'

/**
 * Ticket 052: the whole set of the bench, in one call and by the commands of the bench
 * (`bun run banc:reinitialiser`, `bun run banc:session`). Loaded twice it gives the same content;
 * the command that puts the bench back to its starting state takes seconds, not minutes; the
 * session it hands out is a real one and its token is never printed.
 */

let payload: Payload

const remettreAZero = () => Promise.all([viderLaBase(), viderLeStockage()])

const nombreDe = async (collection: 'pros' | 'profiles' | 'admins' | 'talents' | 'articles'): Promise<number> =>
	(await payload.count({ collection, overrideAccess: true })).totalDocs

/** Profiles whose account is one of the twelve profile types: the way the admin panel counts them. */
const profilsTypes = async (): Promise<number> =>
	(
		await payload.count({
			collection: 'profiles',
			overrideAccess: true,
			where: { 'pro.email': { like: 'jeu-profil-' } },
		})
	).totalDocs

beforeAll(async () => {
	payload = await payloadDeTest()
	await remettreAZero()
})

afterAll(remettreAZero)

describe('Le jeu complet du banc', () => {
	test('12 profils types, 3 talents, 3 articles dont un brouillon, et les comptes de chaque type', async () => {
		const bilan = await poserLeJeuDuBanc()

		expect(await profilsTypes()).toBe(CONTENU_DU_BANC.profilsTypes)
		expect(await nombreDe('talents')).toBe(CONTENU_DU_BANC.talents)
		expect(await nombreDe('articles')).toBe(CONTENU_DU_BANC.articles)
		const brouillons = await payload.count({
			collection: 'articles',
			overrideAccess: true,
			where: { _status: { equals: 'draft' } },
		})
		expect(brouillons.totalDocs).toBe(CONTENU_DU_BANC.brouillons)
		expect(await nombreDe('admins')).toBe(2)
		expect(bilan.jeu.profils.crees).toHaveLength(12)
		expect(bilan.jeu.redaction.talentsCrees).toEqual(TALENTS_DU_JEU.map(({ slug }) => slug))
		expect(bilan.jeu.redaction.articlesCrees).toEqual(ARTICLES_DU_JEU.map(({ slug }) => slug))
	}, 60_000)

	test('chargé une seconde fois, il ne crée rien : ni doublon, ni second brouillon', async () => {
		const avant = await compterLesDocuments()
		const objets = await listerLesObjets()

		const bilan = await poserLeJeuDuBanc()

		expect(await compterLesDocuments()).toEqual(avant)
		expect(await listerLesObjets()).toEqual(objets)
		expect(bilan.comptes.crees).toEqual([])
		expect(bilan.jeu.profils.crees).toEqual([])
		expect(bilan.jeu.redaction.talentsCrees).toEqual([])
		expect(bilan.jeu.redaction.articlesCrees).toEqual([])
		expect(bilan.jeu.redaction.presents).toHaveLength(6)
	}, 60_000)

	test('le brouillon n’est jamais lu par le public, les articles et talents publiés le sont', async () => {
		const lus = await payload.find({ collection: 'articles', overrideAccess: false, user: null, depth: 0 })
		const slugs = lus.docs.map(({ slug }) => slug).sort()

		expect(slugs).toEqual(
			ARTICLES_DU_JEU.filter(({ statut }) => statut === 'published')
				.map(({ slug }) => slug)
				.sort()
		)
		const talents = await payload.find({ collection: 'talents', overrideAccess: false, user: null, depth: 0 })
		expect(talents.totalDocs).toBe(TALENTS_DU_JEU.length)
	})
})

describe('Les commandes du banc', () => {
	/** A command of the bench, as a person runs it: its own process, the environment of the bench. */
	async function commande(...ligne: string[]) {
		const debut = performance.now()
		const enfant = Bun.spawn([process.execPath, '--no-env-file', 'scripts/banc.ts', ...ligne], {
			cwd: RACINE,
			env: process.env,
			stdin: 'ignore',
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [code, sortie, erreurs] = await Promise.all([
			enfant.exited,
			new Response(enfant.stdout).text(),
			new Response(enfant.stderr).text(),
		])
		return { code, sortie, erreurs, secondes: (performance.now() - debut) / 1000 }
	}

	test('banc:reinitialiser remet le banc à son état de départ en moins de 30 secondes, deux fois de suite à l’identique', async () => {
		await remettreAZero()
		const premiere = await commande('reinitialiser')
		expect(premiere.code, premiere.erreurs).toBe(0)
		expect(premiere.secondes).toBeLessThan(30)
		const profils = await nombreDe('profiles')
		const identifiants = (
			await payload.find({ collection: 'profiles', depth: 0, sort: 'id', pagination: false })
		).docs.map(({ id, slug }) => `${id}:${slug}`)

		const seconde = await commande('reinitialiser')

		expect(seconde.code, seconde.erreurs).toBe(0)
		expect(seconde.secondes).toBeLessThan(30)
		expect(await profilsTypes()).toBe(12)
		expect(await nombreDe('talents')).toBe(3)
		expect(await nombreDe('articles')).toBe(3)
		expect(await nombreDe('profiles')).toBe(profils)
		expect(
			(await payload.find({ collection: 'profiles', depth: 0, sort: 'id', pagination: false })).docs.map(
				({ id, slug }) => `${id}:${slug}`
			)
		).toEqual(identifiants)
		expect(seconde.sortie).toContain('12 profils types')
		expect(seconde.sortie).toContain('3 talents, 3 articles dont un brouillon')
	}, 120_000)

	/** The headers file as `curl -H @fichier` reads it: one « Nom: valeur » per line. */
	async function enTetesDuFichier(fichier: string): Promise<Headers> {
		const entetes = new Headers()
		for (const ligne of (await readFile(fichier, 'utf8')).split('\n').filter(Boolean)) {
			const [nom, ...valeur] = ligne.split(': ')
			entetes.set(nom ?? '', valeur.join(': '))
		}
		return entetes
	}

	describe('banc:session', () => {
		let dossier: string

		beforeAll(async () => {
			dossier = await mkdtemp(path.join(tmpdir(), 'banc-session-'))
		})
		afterAll(() => rm(dossier, { recursive: true, force: true }))

		test('une session de chaque côté : l’admin et une maquilleuse sont reconnus par Payload, le jeton va dans un fichier privé', async () => {
			const admin = await ecrireLaSession(payload, 'admin', { dossier, instance: 'essai' })
			const maquilleuse = await ecrireLaSession(payload, 'profil-reference', { dossier, instance: 'essai' })

			const reconnu = await payload.auth({ headers: await enTetesDuFichier(admin.entetes) })
			expect(reconnu.user?.collection).toBe('admins')
			expect(reconnu.user?.email).toBe('jeu-admin@example.test')
			const reconnue = await payload.auth({ headers: await enTetesDuFichier(maquilleuse.entetes) })
			expect(reconnue.user?.collection).toBe('pros')
			expect(reconnue.user?.email).toBe(adresseDuProfil('reference'))
			// Readable by its owner only.
			expect((await stat(admin.entetes)).mode & 0o077).toBe(0)
			expect((await stat(admin.etatDeNavigateur)).mode & 0o077).toBe(0)
			const etat = JSON.parse(await readFile(admin.etatDeNavigateur, 'utf8')) as { cookies: { name: string }[] }
			expect(etat.cookies.map(({ name }) => name)).toEqual(['payload-token'])
		})

		test('la commande n’affiche jamais le jeton, et refuse un compte inconnu en disant lesquels existent', async () => {
			const ok = await commande('session', 'redaction')
			expect(ok.code, ok.erreurs).toBe(0)
			expect(ok.sortie).toContain('Session de jeu-redaction@example.test')
			expect(ok.sortie).toContain('Le jeton n’est pas affiché')
			// A signed token starts with « eyJ »: neither the output nor the errors may hold one.
			expect(ok.sortie + ok.erreurs).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/)
			const fichier = path.join(RACINE, '.banc/sessions')
			expect(ok.sortie).toContain(fichier)

			const inconnu = await commande('session', 'personne')
			expect(inconnu.code).toBe(1)
			expect(inconnu.erreurs).toContain('Le banc ne connaît pas de compte « personne »')
			expect(inconnu.erreurs).toContain('profil-reference')
		}, 60_000)
	})
})
