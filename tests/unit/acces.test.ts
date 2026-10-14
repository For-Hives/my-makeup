import { describe, expect, test } from 'bun:test'
import type { PayloadRequest } from 'payload'
import { Admins, DUREE_SESSION_ADMIN_S, premierCompteAdmin, sessionsFermees } from '@/collections/Admins'
import { CONTEXTE_SANS_PROFIL, consentementTrace, Profils } from '@/collections/Profils'
import { compteSansProfilAvantSuppression, Pros, premierCompteFerme } from '@/collections/Pros'
import {
	adminOuProprietaire,
	adminOuSoiMeme,
	adminSeulement,
	champAdminSeulement,
	champDuProfilAdminOuProprietaire,
	estAdmin,
	estMaquilleuse,
	estRedaction,
	jamais,
	PROFILS_PUBLIES,
	profilPublieOuProprietaire,
} from '@/lib/acces'
import { STATUTS_DU_PROFIL } from '@/lib/profil/statut'

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
/** « A », a makeup artist. */
const maquilleuse = { id: 7, collection: 'pros', email: 'a@example.test' } as unknown as Utilisateur

/** A field of a collection, by its name. */
const champ = (fields: readonly unknown[], nom: string) =>
	fields.find(f => typeof f === 'object' && f !== null && 'name' in f && f.name === nom) as
		| { access?: Record<string, unknown>; hidden?: boolean; unique?: boolean; type?: string }
		| undefined

/** What an access rule receives: only the request, and only its account. */
const appel = (user: Utilisateur | null) => ({ req: { user } as PayloadRequest })

describe('Les rôles', () => {
	test('admin et redaction sont deux comptes de la collection admins', () => {
		expect([admin, redaction, autreCollection, null].map(estAdmin)).toEqual([true, false, false, false])
		expect([admin, redaction, autreCollection, null].map(estRedaction)).toEqual([false, true, false, false])
	})

	test('une maquilleuse est un compte de la collection pros', () => {
		expect([admin, redaction, maquilleuse, null].map(estMaquilleuse)).toEqual([false, false, true, false])
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

describe('La collection pros (ticket 019)', () => {
	const regles = Pros.access ?? {}

	test('lire et modifier : son seul compte pour une maquilleuse, tout pour admin, rien pour les autres (U57)', () => {
		for (const regle of [regles.read, regles.update]) {
			expect(regle?.(appel(maquilleuse) as never)).toEqual({ id: { equals: 7 } })
			expect(regle?.(appel(admin) as never)).toBe(true)
			expect(regle?.(appel(redaction) as never)).toBe(false)
			expect(regle?.(appel(null) as never)).toBe(false)
		}
	})

	test('créer, supprimer, déverrouiller : admin seulement ; personne n’ouvre le back-office par ce compte', () => {
		for (const regle of [regles.create, regles.delete, regles.unlock]) expect(regle).toBe(adminSeulement)
		expect([admin, redaction, maquilleuse, null].map(user => regles.admin?.(appel(user) as never))).toEqual([
			false,
			false,
			false,
			false,
		])
	})

	test('le hash de l’ancien site n’est jamais lu ni écrit par une API, et Payload le retire de toute lecture (U57)', () => {
		expect(champ(Pros.fields, 'legacyBcrypt')).toMatchObject({
			type: 'text',
			hidden: true,
			access: { read: jamais, create: jamais, update: jamais },
		})
	})

	test('bloqué et vérifié : admin seulement ; fournisseur d’origine et strapiId : jamais par une API', () => {
		for (const nom of ['bloque', '_verified'])
			expect(champ(Pros.fields, nom)?.access).toMatchObject({
				create: champAdminSeulement,
				update: champAdminSeulement,
			})
		for (const nom of ['legacyProvider', 'strapiId'])
			expect(champ(Pros.fields, nom)?.access).toMatchObject({ create: jamais, update: jamais })
		expect(champ(Pros.fields, 'strapiId')?.unique).toBe(true)
	})

	test('la confirmation de l’adresse est active dans le schéma lui-même : `_verified` existe', () => {
		// `true` as written, `{}` once Payload has loaded the configuration: on either way.
		const verify = typeof Pros.auth === 'object' ? Pros.auth.verify : undefined
		expect(verify === true || (typeof verify === 'object' && verify !== null)).toBe(true)
	})

	test('l’écran du premier compte est fermé : la route refuse avant de rien créer', () => {
		expect(premierCompteFerme).toMatchObject({ path: '/first-register', method: 'post' })
		expect(() => premierCompteFerme.handler({ t: (cle: string) => cle } as never)).toThrow()
		expect(Pros.endpoints).toContain(premierCompteFerme)
	})
})

describe('La collection profils (ticket 020)', () => {
	const regles = Profils.access ?? {}

	test('modifier : son seul profil pour une maquilleuse, tout pour admin, rien pour les autres (U54)', () => {
		const regle = regles.update
		expect(regle).toBe(adminOuProprietaire)
		expect(regle?.(appel(maquilleuse) as never)).toEqual({ pro: { equals: 7 } })
		expect(regle?.(appel(admin) as never)).toBe(true)
		expect(regle?.(appel(redaction) as never)).toBe(false)
		expect(regle?.(appel(null) as never)).toBe(false)
	})

	test('lire : les profils publiés pour l’anonyme et redaction (U53), plus le sien pour une maquilleuse, tout pour admin', () => {
		const regle = regles.read
		expect(regle).toBe(profilPublieOuProprietaire)
		expect(PROFILS_PUBLIES).toEqual({ statut: { equals: 'publie' } })
		expect(regle?.(appel(null) as never)).toEqual({ statut: { equals: 'publie' } })
		expect(regle?.(appel(redaction) as never)).toEqual({ statut: { equals: 'publie' } })
		expect(regle?.(appel(maquilleuse) as never)).toEqual({
			or: [{ pro: { equals: 7 } }, { statut: { equals: 'publie' } }],
		})
		expect(regle?.(appel(admin) as never)).toBe(true)
	})

	test('les champs réservés : statut, motif, vérifiée et SIRET, lus par admin et la propriétaire seulement', () => {
		// Read as Payload reads a field of a document: the request, and the document itself.
		const lire = (user: Utilisateur | null, doc: Record<string, unknown>) =>
			champDuProfilAdminOuProprietaire({ req: { user } as PayloadRequest, doc } as never)
		expect(lire(admin, { pro: 9 })).toBe(true)
		expect(lire(maquilleuse, { pro: 7 })).toBe(true)
		// The account populated, as a read at depth 1 gives it.
		expect(lire(maquilleuse, { pro: { id: 7 } })).toBe(true)
		expect(lire(maquilleuse, { pro: 9 })).toBe(false)
		// Same number, other collection: an account of the admin panel is not the owner.
		expect(lire({ ...redaction, id: 7 } as unknown as Utilisateur, { pro: 7 })).toBe(false)
		expect(lire(null, { pro: 7 })).toBe(false)
		// The account already stripped from the answer: the reader is not the owner.
		expect(lire(maquilleuse, {})).toBe(false)

		for (const nom of ['statut', 'motif', 'verifie', 'verifieLe', 'siret', 'pro', 'legacyUsername', 'strapiId'])
			expect(champ(Profils.fields, nom)?.access?.read).toBe(champDuProfilAdminOuProprietaire)
		for (const nom of ['noteInterne', 'score'])
			expect(champ(Profils.fields, nom)?.access?.read).toBe(champAdminSeulement)
		// The badge of the search is public.
		expect(champ(Profils.fields, 'superMaquilleuse')?.access?.read).toBeUndefined()
	})

	test('statut, motif, vérifiée, SIRET, note interne, score, badge et compte : seul admin les écrit (U55)', () => {
		for (const nom of [
			'statut',
			'motif',
			'verifie',
			'verifieLe',
			'siret',
			'noteInterne',
			'score',
			'superMaquilleuse',
			'pro',
		]) {
			const acces = champ(Profils.fields, nom)?.access as Record<string, (args: unknown) => boolean>
			expect([admin, redaction, maquilleuse, null].map(user => acces.update?.(appel(user)))).toEqual([
				true,
				false,
				false,
				false,
			])
			expect(acces.create as unknown).toBe(champAdminSeulement)
		}
	})

	test('le statut : brouillon, publié ou masqué ; un profil neuf est un brouillon', () => {
		expect(STATUTS_DU_PROFIL).toEqual(['brouillon', 'publie', 'masque'])
		const statut = champ(Profils.fields, 'statut') as { defaultValue?: unknown; options?: { value: string }[] }
		// Not `required`: a profile created without one, by the server or a test, gets the default.
		expect(statut).toMatchObject({ type: 'select', defaultValue: 'brouillon' })
		expect(statut.options?.map(({ value }) => value)).toEqual(['brouillon', 'publie', 'masque'])
	})

	test('les coordonnées et le choix de les montrer : lus par admin et la propriétaire seulement, jamais par redaction (U59)', () => {
		for (const nom of ['coordonnees', 'contactPublic', 'consentiLe', 'sourceConsentement'])
			expect(champ(Profils.fields, nom)?.access?.read).toBe(champDuProfilAdminOuProprietaire)
		expect(
			champDuProfilAdminOuProprietaire({ req: { user: redaction } as PayloadRequest, doc: { pro: 2 } } as never)
		).toBe(false)
		// The networks are public.
		expect(champ(Profils.fields, 'reseaux')?.access).toBeUndefined()
	})

	test('la date et la source du consentement : jamais écrites par une API, posées par le serveur', () => {
		for (const nom of ['consentiLe', 'sourceConsentement'])
			expect(champ(Profils.fields, nom)?.access).toMatchObject({ create: jamais, update: jamais })
		expect(Profils.hooks?.beforeChange).toContain(consentementTrace)
	})

	test('créer et supprimer un profil : admin seulement ; le serveur le crée avec le compte', () => {
		expect(regles.create).toBe(adminSeulement)
		expect(regles.delete).toBe(adminSeulement)
		expect(Pros.hooks?.afterChange?.length).toBe(1)
		expect(CONTEXTE_SANS_PROFIL).toEqual({ profilAutomatique: false })
	})

	test('un seul compte par profil, un seul profil par compte, un slug unique', () => {
		expect(champ(Profils.fields, 'pro')).toMatchObject({ type: 'relationship', required: true, unique: true })
		expect(champ(Profils.fields, 'slug')).toMatchObject({ type: 'text', required: true, unique: true })
	})

	test('le compte : admin seulement ; slug, strapiId et ancien nom d’utilisateur : jamais par une API', () => {
		expect(champ(Profils.fields, 'pro')?.access).toMatchObject({
			create: champAdminSeulement,
			update: champAdminSeulement,
		})
		for (const nom of ['slug', 'strapiId', 'legacyUsername'])
			expect(champ(Profils.fields, nom)?.access).toMatchObject({ create: jamais, update: jamais })
	})

	test('un compte qui a encore un profil n’est pas supprimé', () => {
		expect(Pros.hooks?.beforeDelete).toContain(compteSansProfilAvantSuppression)
	})
})

describe('Les règles réutilisables', () => {
	test('adminOuSoiMeme compare la collection avant le numéro', () => {
		const surAdmins = adminOuSoiMeme('admins')
		// Same number as the admin, other collection: nothing.
		expect(surAdmins(appel({ ...autreCollection, id: 2 } as unknown as Utilisateur) as never)).toBe(false)
		expect(surAdmins(appel(redaction) as never)).toEqual({ id: { equals: 2 } })
		const surPros = adminOuSoiMeme('pros')
		expect(surPros(appel({ ...redaction, id: 7 } as unknown as Utilisateur) as never)).toBe(false)
	})
})
