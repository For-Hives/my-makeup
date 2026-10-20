import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	type Accounts,
	CreationRefused,
	createAccount,
	PASSWORD_MINIMUM_LENGTH,
	passwordRefusal,
	readArguments,
} from '../../scripts/admin/account'
import { apply } from '../../scripts/admin/keyboard'

/**
 * The operating procedure that creates an account of the admin panel (ticket 094): no password in an
 * argument, typed at the keyboard, an `admin` by default, nothing written on a refusal.
 */

const PASSWORD = 'un-mot-de-passe-fictif-094'

describe('Le script ne lit pas le .env de travail (ticket 233, L1)', () => {
	test('admin:create porte --no-env-file : DATABASE_URI vient de l’environnement du terminal, jamais du .env', () => {
		const { scripts } = JSON.parse(readFileSync(path.join(import.meta.dir, '../../package.json'), 'utf8')) as {
			scripts: Record<string, string>
		}
		expect(scripts['admin:create']).toBe('bun --no-env-file scripts/admin/create-admin.ts')
	})
})

describe('Les arguments de la commande', () => {
	test('une adresse seule donne un admin sur la base de ce poste', () => {
		expect(readArguments(['Equipe@Example.test'])).toEqual({
			email: 'equipe@example.test',
			role: 'admin',
			cibleDistante: false,
		})
	})

	test('le rôle et la cible distante se disent par des options', () => {
		expect(readArguments(['a@example.test', '--role=editor', '--remote-target'])).toEqual({
			email: 'a@example.test',
			role: 'editor',
			cibleDistante: true,
		})
	})

	test('aucune option ne donne le mot de passe : elle est refusée, comme toute option inconnue', () => {
		for (const argv of [
			['a@example.test', '--password=secret-fictif'],
			['a@example.test', '--mot-de-passe', 'secret-fictif'],
			['a@example.test', '-p', 'secret-fictif'],
			['a@example.test', 'secret-fictif'],
		])
			expect([argv, readArguments(argv)]).toEqual([argv, undefined])
	})

	test('pas d’adresse, une adresse mal formée, un rôle inconnu : refusés', () => {
		for (const argv of [
			[],
			['pas-une-adresse'],
			['a@example.test', '--role=superadmin'],
			['a@example.test', '--role='],
		])
			expect([argv, readArguments(argv)]).toEqual([argv, undefined])
	})
})

describe('Le mot de passe', () => {
	test('12 caractères au moins, 200 au plus, sans espace de bord, aucune règle de composition', () => {
		expect(passwordRefusal('a'.repeat(PASSWORD_MINIMUM_LENGTH - 1))).toContain('moins de 12')
		expect(passwordRefusal('a'.repeat(201))).toContain('plus de 200')
		expect(passwordRefusal(` ${'a'.repeat(12)}`)).toContain('espace')
		expect(passwordRefusal('a'.repeat(12))).toBeUndefined()
		expect(passwordRefusal('a'.repeat(200))).toBeUndefined()
	})

	test('le refus ne reprend jamais le mot de passe', () => {
		expect(passwordRefusal('court-fict')).not.toContain('court-fict')
	})
})

describe('La création', () => {
	const fake = (existe = false) => {
		const written: { email: string; password: string; role: string }[] = []
		const accounts: Accounts = {
			existe: () => Promise.resolve(existe),
			creer: data => {
				written.push(data)
				return Promise.resolve({ id: 7 })
			},
		}
		return { comptes: accounts, ecrits: written }
	}
	const request = { email: 'a@example.test', role: 'admin' } as const

	test('une saisie répétée à l’identique crée le compte avec le rôle demandé', async () => {
		const { comptes: accounts, ecrits: written } = fake()

		const issue = await createAccount(accounts, request, PASSWORD, PASSWORD)

		expect(issue).toEqual({ id: 7, role: 'admin' })
		expect(written).toEqual([{ email: 'a@example.test', password: PASSWORD, role: 'admin' }])
	})

	test('deux saisies différentes, un mot de passe trop court, une adresse déjà prise : rien n’est écrit', async () => {
		for (const [exists, one, two, message] of [
			[false, PASSWORD, `${PASSWORD}x`, 'diffèrent'],
			[false, 'court', 'court', 'moins de 12'],
			[true, PASSWORD, PASSWORD, 'déjà cette adresse'],
		] as const) {
			const { comptes: accounts, ecrits: written } = fake(exists)

			const failure = createAccount(accounts, request, one, two)

			await expect(failure).rejects.toBeInstanceOf(CreationRefused)
			await expect(failure).rejects.toThrow(message)
			await expect(failure).rejects.not.toThrow(PASSWORD)
			expect(written).toEqual([])
		}
	})
})

describe('La saisie au clavier', () => {
	test('les caractères s’ajoutent, Retour arrière en retire un, Entrée termine, Ctrl+C annule', () => {
		expect(apply('ab', 'c')).toEqual({ saisie: 'abc' })
		expect(apply('abc', '\u007f')).toEqual({ saisie: 'ab' })
		expect(apply('', '\u007f')).toEqual({ saisie: '' })
		// The line typed in the same chunk as Enter is kept: a pasted password arrives that way.
		expect(apply('ab', 'cd\r')).toEqual({ fin: true, saisie: 'abcd' })
		expect(apply('ab', '\u0003')).toEqual({ annule: true })
		expect(apply('ab', '\u001b')).toEqual({ saisie: 'ab' })
	})

	test('un mot de passe collé d’un coup, accents compris, arrive entier', () => {
		expect(apply('', 'été-fictif-é')).toEqual({ saisie: 'été-fictif-é' })
	})
})

describe('La commande elle-même', () => {
	const launch = async (argv: string[], entree: string, env: Record<string, string> = {}) => {
		const childProcess = Bun.spawn(['bun', '--no-env-file', 'scripts/admin/create-admin.ts', ...argv], {
			env: { PATH: process.env.PATH ?? '', ...env },
			stdin: new Blob([entree]),
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [output, error, code] = await Promise.all([
			new Response(childProcess.stdout).text(),
			new Response(childProcess.stderr).text(),
			childProcess.exited,
		])
		return { sortie: output, erreur: error, code }
	}

	test('un mot de passe donné en option : 2, usage affiché, le mot de passe n’est jamais écrit', async () => {
		const { erreur: error, code } = await launch(['a@example.test', '--password=secret-fictif-094'], '')

		expect(code).toBe(2)
		expect(error).toContain('Usage')
		expect(error).not.toContain('secret-fictif-094')
	})

	test('un mot de passe qui arrive par un tube est refusé : il se tape dans un terminal', async () => {
		const {
			sortie: output,
			erreur: error,
			code,
		} = await launch(['a@example.test'], `${PASSWORD}\n${PASSWORD}\n`, {
			DATABASE_URI: 'postgres://utilisateur@127.0.0.1:1/base_fictive',
		})

		expect(code).toBe(1)
		expect(error).toContain('dans un terminal')
		expect(output + error).not.toContain(PASSWORD)
	})

	test('une base qui n’est pas sur ce poste est refusée sans --remote-target, avant toute saisie', async () => {
		const { erreur: error, code } = await launch(['a@example.test'], '', {
			DATABASE_URI: 'postgres://utilisateur@base.example.test:5432/base_fictive',
		})

		expect(code).toBe(1)
		expect(error).toContain('--remote-target')
	})

	test('sans DATABASE_URI : refusé, rien n’est écrit', async () => {
		const { erreur: error, code } = await launch(['a@example.test'], '')

		expect(code).toBe(1)
		expect(error).toContain('DATABASE_URI manque')
	})
})
