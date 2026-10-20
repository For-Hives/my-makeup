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

const MOT_DE_PASSE = 'un-mot-de-passe-fictif-094'

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
	const faux = (existe = false) => {
		const ecrits: { email: string; password: string; role: string }[] = []
		const comptes: Accounts = {
			existe: () => Promise.resolve(existe),
			creer: data => {
				ecrits.push(data)
				return Promise.resolve({ id: 7 })
			},
		}
		return { comptes, ecrits }
	}
	const demande = { email: 'a@example.test', role: 'admin' } as const

	test('une saisie répétée à l’identique crée le compte avec le rôle demandé', async () => {
		const { comptes, ecrits } = faux()

		const issue = await createAccount(comptes, demande, MOT_DE_PASSE, MOT_DE_PASSE)

		expect(issue).toEqual({ id: 7, role: 'admin' })
		expect(ecrits).toEqual([{ email: 'a@example.test', password: MOT_DE_PASSE, role: 'admin' }])
	})

	test('deux saisies différentes, un mot de passe trop court, une adresse déjà prise : rien n’est écrit', async () => {
		for (const [existe, un, deux, message] of [
			[false, MOT_DE_PASSE, `${MOT_DE_PASSE}x`, 'diffèrent'],
			[false, 'court', 'court', 'moins de 12'],
			[true, MOT_DE_PASSE, MOT_DE_PASSE, 'déjà cette adresse'],
		] as const) {
			const { comptes, ecrits } = faux(existe)

			const echec = createAccount(comptes, demande, un, deux)

			await expect(echec).rejects.toBeInstanceOf(CreationRefused)
			await expect(echec).rejects.toThrow(message)
			await expect(echec).rejects.not.toThrow(MOT_DE_PASSE)
			expect(ecrits).toEqual([])
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
	const lancer = async (argv: string[], entree: string, env: Record<string, string> = {}) => {
		const processus = Bun.spawn(['bun', '--no-env-file', 'scripts/admin/create-admin.ts', ...argv], {
			env: { PATH: process.env.PATH ?? '', ...env },
			stdin: new Blob([entree]),
			stdout: 'pipe',
			stderr: 'pipe',
		})
		const [sortie, erreur, code] = await Promise.all([
			new Response(processus.stdout).text(),
			new Response(processus.stderr).text(),
			processus.exited,
		])
		return { sortie, erreur, code }
	}

	test('un mot de passe donné en option : 2, usage affiché, le mot de passe n’est jamais écrit', async () => {
		const { erreur, code } = await lancer(['a@example.test', '--password=secret-fictif-094'], '')

		expect(code).toBe(2)
		expect(erreur).toContain('Usage')
		expect(erreur).not.toContain('secret-fictif-094')
	})

	test('un mot de passe qui arrive par un tube est refusé : il se tape dans un terminal', async () => {
		const { sortie, erreur, code } = await lancer(['a@example.test'], `${MOT_DE_PASSE}\n${MOT_DE_PASSE}\n`, {
			DATABASE_URI: 'postgres://utilisateur@127.0.0.1:1/base_fictive',
		})

		expect(code).toBe(1)
		expect(erreur).toContain('dans un terminal')
		expect(sortie + erreur).not.toContain(MOT_DE_PASSE)
	})

	test('une base qui n’est pas sur ce poste est refusée sans --remote-target, avant toute saisie', async () => {
		const { erreur, code } = await lancer(['a@example.test'], '', {
			DATABASE_URI: 'postgres://utilisateur@base.example.test:5432/base_fictive',
		})

		expect(code).toBe(1)
		expect(erreur).toContain('--remote-target')
	})

	test('sans DATABASE_URI : refusé, rien n’est écrit', async () => {
		const { erreur, code } = await lancer(['a@example.test'], '')

		expect(code).toBe(1)
		expect(erreur).toContain('DATABASE_URI manque')
	})
})
