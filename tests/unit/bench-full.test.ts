import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DEMO_PROFILES } from '@/demo-data/profiles'
import { DATASET_TYPES } from '../fixtures/accounts'
import { ROOT } from '../support/bench'
import {
	ACCOUNT_NAMES,
	accountSearch,
	browserState,
	clientHeaders,
	SESSION_FOLDER,
	unknownAccountMessage,
} from '../support/bench-session'
import type { Session } from '../support/session'

/**
 * Ticket 052, without the bench: which account a name stands for, the two files a session is
 * written to, and what the commands of the bench promise. The commands themselves run on the
 * bench: tests/integration/banc-jeu-complet.test.ts.
 */

const read = (fichier: string) => readFileSync(path.join(ROOT, fichier), 'utf8')

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
		expect(accountSearch('admin')).toEqual({
			email: 'jeu-admin@example.test',
			collection: 'admins',
			nom: 'admin',
		})
		expect(accountSearch('maquilleuse-sans-profil')).toMatchObject({
			email: 'jeu-maquilleuse-sans-profil@example.test',
			collection: 'pros',
		})
	})

	test('chaque type du jeu fixe et chaque profil type a un nom', () => {
		expect(ACCOUNT_NAMES).toHaveLength(DATASET_TYPES.length + DEMO_PROFILES.length)
		for (const name of ACCOUNT_NAMES) expect(accountSearch(name), name).toBeDefined()
	})

	test('la maquilleuse d’un profil type', () => {
		expect(accountSearch('profil-reference')).toEqual({
			email: 'jeu-profil-reference@example.test',
			collection: 'pros',
			nom: 'profil-reference',
		})
	})

	test('une adresse est cherchée dans les deux collections, un nom inconnu est refusé', () => {
		expect(accountSearch(' Quelquun@Example.test ')).toMatchObject({ email: 'quelquun@example.test' })
		expect(accountSearch('Quelquun@Example.test')?.collection).toBeUndefined()
		expect(accountSearch('personne')).toBeUndefined()
		expect(accountSearch('profil-inconnu')).toBeUndefined()
	})

	test('le refus dit quels noms existent', () => {
		const message = unknownAccountMessage('personne')

		expect(message).toContain('« personne »')
		for (const name of ['admin', 'redaction', 'profil-reference']) expect(message).toContain(name)
	})
})

describe('Les deux fichiers d’une session', () => {
	test('l’état d’un navigateur donne à Playwright un cookie par hôte, sans adresse complète', () => {
		expect(browserState(SESSION)).toEqual({
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
		expect(clientHeaders(SESSION)).toBe('Cookie: payload-token=jeton-factice\nOrigin: http://localhost:3100\n')
	})

	test('les sessions s’écrivent dans un dossier que git ignore', () => {
		expect(SESSION_FOLDER).toBe('.banc/sessions')
		expect(read('.gitignore').split('\n')).toContain('/.banc/')
	})
})

describe('Les commandes du banc', () => {
	const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts

	test('les trois commandes du ticket sont des scripts du paquet, sans le .env de travail', () => {
		for (const name of ['bench:full', 'bench:reset', 'bench:session'])
			expect(scripts[name], name).toStartWith('bun --no-env-file scripts/bench.ts ')
	})

	test('le guide des agents et le guide du banc disent les quatre gestes', () => {
		for (const file of ['CLAUDE.md', 'docs/tests/banc.md'])
			for (const gesture of [
				'bun run bench:full',
				'bun run bench:reset',
				'bun run bench:session',
				'bun run bench:down',
			])
				expect(read(file), `${file} : ${gesture}`).toContain(gesture)
	})
})
