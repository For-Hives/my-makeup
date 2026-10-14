import { describe, expect, test } from 'bun:test'
import type { PayloadRequest } from 'payload'
import { Admins, DUREE_SESSION_ADMIN_S, premierCompteAdmin, sessionsFermees } from '@/collections/Admins'
import { adminOuSoiMeme, adminSeulement, estAdmin, estRedaction, jamais } from '@/lib/acces'

/**
 * The access rules, called as Payload calls them, without a database: who reaches what. The
 * access matrix plays the same rules through the real APIs (tests/integration/payload-acces.test.ts).
 */

type Utilisateur = PayloadRequest['user']

const admin = { id: 1, collection: 'admins', role: 'admin', email: 'admin@example.test' } as unknown as Utilisateur
const redaction = {
	id: 2,
	collection: 'admins',
	role: 'redaction',
	email: 'redac@example.test',
} as unknown as Utilisateur
/** An account of another collection with the same number as the admin: the collection decides, never the number. */
const autreCollection = { id: 1, collection: 'pros', email: 'pro@example.test' } as unknown as Utilisateur

/** What an access rule receives: only the request, and only its account. */
const appel = (user: Utilisateur | null) => ({ req: { user } as PayloadRequest })

describe('Les rôles', () => {
	test('admin et redaction sont deux comptes de la collection admins', () => {
		expect([admin, redaction, autreCollection, null].map(estAdmin)).toEqual([true, false, false, false])
		expect([admin, redaction, autreCollection, null].map(estRedaction)).toEqual([false, true, false, false])
	})

	test('un rôle inconnu n’ouvre rien', () => {
		const inconnu = { ...admin, role: 'superadmin' } as unknown as Utilisateur
		expect(estAdmin(inconnu)).toBe(false)
		expect(estRedaction(inconnu)).toBe(false)
	})
})

describe('La collection admins (ticket 018)', () => {
	const regles = Admins.access ?? {}

	test('lire et modifier : tout pour admin, son seul compte pour redaction, rien pour les autres', () => {
		for (const regle of [regles.read, regles.update]) {
			expect(regle?.(appel(admin) as never)).toBe(true)
			expect(regle?.(appel(redaction) as never)).toEqual({ id: { equals: 2 } })
			expect(regle?.(appel(autreCollection) as never)).toBe(false)
			expect(regle?.(appel(null) as never)).toBe(false)
		}
	})

	test('créer, supprimer, déverrouiller : admin seulement', () => {
		for (const regle of [regles.create, regles.delete, regles.unlock]) {
			expect(regle).toBe(adminSeulement)
			expect([admin, redaction, autreCollection, null].map(user => regle?.(appel(user) as never))).toEqual([
				true,
				false,
				false,
				false,
			])
		}
	})

	test('le rôle : redaction par défaut, admin ou redaction, et seul un admin l’écrit', () => {
		const role = Admins.fields.find(champ => 'name' in champ && champ.name === 'role')
		expect(role).toMatchObject({ type: 'select', required: true, defaultValue: 'redaction' })
		expect((role as { options: { value: string }[] }).options.map(({ value }) => value)).toEqual(['admin', 'redaction'])
		const acces = (role as { access: Record<string, (args: unknown) => boolean> }).access
		expect([admin, redaction, null].map(user => acces.update?.(appel(user)))).toEqual([true, false, false])
		expect([admin, redaction, null].map(user => acces.create?.(appel(user)))).toEqual([true, false, false])
	})

	test('le premier compte, créé sans session par l’écran du premier compte, est un admin', () => {
		const hook = (operation: string, payloadAPI: string, user: Utilisateur | null, value: string) =>
			premierCompteAdmin({ operation, req: { payloadAPI, user }, value } as never)

		expect(hook('create', 'REST', null, 'redaction')).toBe('admin')
		// Anywhere else, the role stays the one given: an admin creating an account, the Local API, a change.
		expect(hook('create', 'REST', admin, 'redaction')).toBe('redaction')
		expect(hook('create', 'local', null, 'redaction')).toBe('redaction')
		expect(hook('update', 'REST', null, 'redaction')).toBe('redaction')
	})

	test('une session dure 8 heures', () => {
		expect(DUREE_SESSION_ADMIN_S).toBe(28_800)
		expect(Admins.auth).toMatchObject({ tokenExpiration: 28_800 })
	})

	test('les sessions d’un compte ne sortent jamais, pas même pour ce compte', () => {
		// Found by its name: once the configuration is loaded, Payload has merged it with its own field.
		const sessions = Admins.fields.find(champ => 'name' in champ && champ.name === 'sessions')
		expect(sessions).toMatchObject({ type: 'array', access: { read: jamais } })
		expect(sessionsFermees).toMatchObject({ name: 'sessions', access: { read: jamais } })
		expect(jamais(appel(admin) as never)).toBe(false)
	})
})

describe('Les règles réutilisables', () => {
	test('adminOuSoiMeme compare la collection avant le numéro', () => {
		const surAdmins = adminOuSoiMeme('admins')
		// Same number as the admin, other collection: nothing.
		expect(surAdmins(appel({ ...autreCollection, id: 2 } as unknown as Utilisateur) as never)).toBe(false)
		expect(surAdmins(appel(redaction) as never)).toEqual({ id: { equals: 2 } })
	})
})
