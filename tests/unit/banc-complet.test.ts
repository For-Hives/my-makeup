import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DEMO_PROFILES } from '@/demo-data/profiles'
import { TYPES_DU_JEU } from '../fixtures/comptes'
import { RACINE } from '../outils/banc'
import {
	DOSSIER_DES_SESSIONS,
	entetesDeClient,
	etatDeNavigateur,
	messageCompteInconnu,
	NOMS_DES_COMPTES,
	rechercheDuCompte,
} from '../outils/banc-session'
import type { Session } from '../outils/session'

/**
 * Ticket 052, without the bench: which account a name stands for, the two files a session is
 * written to, and what the commands of the bench promise. The commands themselves run on the
 * bench: tests/integration/banc-jeu-complet.test.ts.
 */

const lire = (fichier: string) => readFileSync(path.join(RACINE, fichier), 'utf8')

const SESSION: Session = {
	enTetes: { Cookie: 'payload-token=jeton-factice', Origin: 'http://localhost:3100' },
	cookies: [
		{
			name: 'payload-token',
			value: 'jeton-factice',
			url: 'http://localhost:3100',
			expires: 1_800_000_000,
			httpOnly: true,
			secure: false,
			sameSite: 'Lax',
		},
	],
	expire: new Date(1_800_000_000_000),
}

describe('Quel compte désigne un nom', () => {
	test('un type du jeu fixe retrouve son adresse et sa collection', () => {
		expect(rechercheDuCompte('admin')).toEqual({
			email: 'jeu-admin@example.test',
			collection: 'admins',
			nom: 'admin',
		})
		expect(rechercheDuCompte('maquilleuse-sans-profil')).toMatchObject({
			email: 'jeu-maquilleuse-sans-profil@example.test',
			collection: 'pros',
		})
	})

	test('chaque type du jeu fixe et chaque profil type a un nom', () => {
		expect(NOMS_DES_COMPTES).toHaveLength(TYPES_DU_JEU.length + DEMO_PROFILES.length)
		for (const nom of NOMS_DES_COMPTES) expect(rechercheDuCompte(nom), nom).toBeDefined()
	})

	test('la maquilleuse d’un profil type', () => {
		expect(rechercheDuCompte('profil-reference')).toEqual({
			email: 'jeu-profil-reference@example.test',
			collection: 'pros',
			nom: 'profil-reference',
		})
	})

	test('une adresse est cherchée dans les deux collections, un nom inconnu est refusé', () => {
		expect(rechercheDuCompte(' Quelquun@Example.test ')).toMatchObject({ email: 'quelquun@example.test' })
		expect(rechercheDuCompte('Quelquun@Example.test')?.collection).toBeUndefined()
		expect(rechercheDuCompte('personne')).toBeUndefined()
		expect(rechercheDuCompte('profil-inconnu')).toBeUndefined()
	})

	test('le refus dit quels noms existent', () => {
		const message = messageCompteInconnu('personne')

		expect(message).toContain('« personne »')
		for (const nom of ['admin', 'redaction', 'profil-reference']) expect(message).toContain(nom)
	})
})

describe('Les deux fichiers d’une session', () => {
	test('l’état d’un navigateur donne à Playwright un cookie par hôte, sans adresse complète', () => {
		expect(etatDeNavigateur(SESSION)).toEqual({
			cookies: [
				{
					name: 'payload-token',
					value: 'jeton-factice',
					expires: 1_800_000_000,
					httpOnly: true,
					secure: false,
					sameSite: 'Lax',
					domain: 'localhost',
					path: '/',
				},
			],
			origins: [],
		})
	})

	test('les en-têtes se lisent par « curl -H @fichier » : une ligne par en-tête, le cookie et l’origine', () => {
		expect(entetesDeClient(SESSION)).toBe('Cookie: payload-token=jeton-factice\nOrigin: http://localhost:3100\n')
	})

	test('les sessions s’écrivent dans un dossier que git ignore', () => {
		expect(DOSSIER_DES_SESSIONS).toBe('.banc/sessions')
		expect(lire('.gitignore').split('\n')).toContain('/.banc/')
	})
})

describe('Les commandes du banc', () => {
	const scripts = (JSON.parse(lire('package.json')) as { scripts: Record<string, string> }).scripts

	test('les trois commandes du ticket sont des scripts du paquet, sans le .env de travail', () => {
		for (const nom of ['banc:complet', 'banc:reinitialiser', 'banc:session'])
			expect(scripts[nom], nom).toStartWith('bun --no-env-file scripts/banc.ts ')
	})

	test('le guide des agents et le guide du banc disent les quatre gestes', () => {
		for (const fichier of ['CLAUDE.md', 'docs/tests/banc.md'])
			for (const geste of [
				'bun run banc:complet',
				'bun run banc:reinitialiser',
				'bun run banc:session',
				'bun run banc:down',
			])
				expect(lire(fichier), `${fichier} : ${geste}`).toContain(geste)
	})
})
