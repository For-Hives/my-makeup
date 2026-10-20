import { describe, expect, test } from 'bun:test'
import { initI18n } from '@payloadcms/translations'
import { type PayloadRequest, ValidationError } from 'payload'
import { ADMIN_SESSION_DURATION_S, Admins, closedSessions } from '@/collections/Admins'
import { Articles } from '@/collections/Articles'
import { AuthEvents } from '@/collections/AuthEvents'
import { ContactRequests } from '@/collections/ContactRequests'
import {
	EDITOR_ACCESS,
	EDITOR_VERSIONS,
	firstPublicationDate,
	publishedAtFieldDef,
	strapiIdFieldDef,
} from '@/collections/editor'
import {
	closedStorageFields,
	FILE_METADATA_FIELDS,
	fileMetadataSetByServer,
	Media,
	noUploadWithoutStorage,
	ownerOnUpload,
	toPublicUrl,
} from '@/collections/Media'
import { consentTrace, NO_PROFILE_CONTEXT, Profiles, profileOnAccountCreation } from '@/collections/Profiles'
import { accountWithoutProfileBeforeDeletion, firstClosedAccount, Pros } from '@/collections/Pros'
import { Talents } from '@/collections/Talents'
import {
	adminEditorOrArtist,
	adminEditorOrPublished,
	adminOnly,
	adminOrEditor,
	adminOrMediaOwner,
	adminOrOwner,
	adminOrSelf,
	EDITORIAL_MEDIA,
	fieldAdminOnly,
	fieldAdminOrEditor,
	hiddenExceptAdmin,
	isAdmin,
	isAdminOrEditor,
	isArtist,
	isEditor,
	mediaFieldAdminOrOwner,
	mediaRead,
	NO_DOCUMENT,
	neverAllowed,
	ONLY_PUBLISHED,
	PUBLISHED_PROFILES,
	possibleId,
	profileFieldAdminOrOwner,
	publishedProfileOrOwner,
} from '@/lib/access'
import {
	estUneImage,
	galerieDImages,
	IMAGES,
	imagesDeLaRedaction,
	MESSAGE_GALERIE_IMAGES,
	TYPES_D_IMAGE,
} from '@/lib/articles'
import { PAYLOAD_LANGUAGE } from '@/lib/payload-language'
import { validateProfilePhotos } from '@/lib/profile/photos'
import { PROFILE_STATUSES } from '@/lib/profile/status'

/**
 * The access rules, called as Payload calls them, without a database: who reaches what. The
 * access matrix plays the same rules through the real APIs (tests/integration/payload-acces.test.ts).
 */

type Utilisateur = PayloadRequest['user']

const admin = { id: 1, collection: 'admins', role: 'admin', email: 'admin@example.test' } as unknown as Utilisateur
const redaction = {
	id: 2,
	collection: 'admins',
	role: 'editor',
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

/**
 * Identifiers no document can have, as a rule receives them: REST hands it `parseFloat` of the
 * address (`abc` gives NaN, `1e999` Infinity), the Local API what its caller gives.
 */
export const IDENTIFIANTS_IMPOSSIBLES = [
	Number.NaN,
	Number.POSITIVE_INFINITY,
	1.5,
	0,
	-1,
	2_147_483_648,
	99_999_999_999,
	'abc',
	'1e999',
	'99999999999',
	'1.5',
	'-1',
	'',
]

describe('Un identifiant possible : ce qu’une règle passe à la base', () => {
	test('un entier de 1 au plus grand entier de 32 bits, en nombre ou en chiffres', () => {
		expect([1, 12, 2_147_483_647, '1', '12', '007', '2147483647'].map(possibleId)).toEqual(Array(7).fill(true))
		expect(IDENTIFIANTS_IMPOSSIBLES.map(possibleId)).toEqual(Array(IDENTIFIANTS_IMPOSSIBLES.length).fill(false))
	})
})

describe('Un identifiant impossible : refusé par chaque règle, avant la base (ticket 048)', () => {
	const REGLES = {
		adminSeulement: adminOnly,
		'adminOuSoiMeme(admins)': adminOrSelf('admins'),
		'adminOuSoiMeme(pros)': adminOrSelf('pros'),
		adminOuProprietaire: adminOrOwner,
		profilPublieOuProprietaire: publishedProfileOrOwner,
		adminOuProprietaireDuMedia: adminOrMediaOwner,
		adminOuRedaction: adminOrEditor,
		adminRedactionOuPublies: adminEditorOrPublished,
	}

	test('pour chaque compte, anonyme compris : refusé, sans condition à passer à la base', () => {
		for (const [nom, regle] of Object.entries(REGLES))
			for (const user of [null, admin, redaction, maquilleuse])
				for (const id of IDENTIFIANTS_IMPOSSIBLES)
					expect([nom, id, regle({ req: { user } as PayloadRequest, id } as never)]).toEqual([nom, id, false])
	})

	test('un identifiant possible, ou aucun (une liste, une création) : la règle décide comme avant', () => {
		for (const id of [12, '12', undefined]) {
			expect(adminOnly({ req: { user: admin } as PayloadRequest, id } as never)).toBe(true)
			expect(adminOrEditor({ req: { user: redaction } as PayloadRequest, id } as never)).toBe(true)
			expect(adminEditorOrPublished({ req: { user: null } as PayloadRequest, id } as never)).toEqual(ONLY_PUBLISHED)
			expect(adminOrSelf('pros')({ req: { user: maquilleuse } as PayloadRequest, id } as never)).toEqual({
				id: { equals: 7 },
			})
			expect(adminOrOwner({ req: { user: maquilleuse } as PayloadRequest, id } as never)).toEqual({
				pro: { equals: 7 },
			})
		}
	})
})

describe('U59 : le panneau de la rédaction ne montre que les articles, les talents et les médias', () => {
	test('seul un admin voit les collections masquées', () => {
		expect([admin, redaction, maquilleuse, null].map(user => hiddenExceptAdmin({ user }))).toEqual([
			false,
			true,
			true,
			true,
		])
	})

	test('les comptes, les profils, les maquilleuses, les demandes et le journal sont masqués à la rédaction', () => {
		for (const collection of [Admins, Profiles, Pros, ContactRequests, AuthEvents])
			expect(collection.admin?.hidden, collection.slug).toBe(hiddenExceptAdmin)
	})

	test('les articles, les talents et les médias restent dans le menu de la rédaction', () => {
		for (const collection of [Articles, Talents, Media])
			expect(collection.admin?.hidden, collection.slug).toBeUndefined()
	})
})

describe('Les rôles', () => {
	test('admin et redaction sont deux comptes de la collection admins', () => {
		expect([admin, redaction, autreCollection, null].map(isAdmin)).toEqual([true, false, false, false])
		expect([admin, redaction, autreCollection, null].map(isEditor)).toEqual([false, true, false, false])
	})

	test('une maquilleuse est un compte de la collection pros', () => {
		expect([admin, redaction, maquilleuse, null].map(isArtist)).toEqual([false, false, true, false])
	})

	test('un rôle inconnu n’ouvre rien', () => {
		const inconnu = { ...admin, role: 'superadmin' } as unknown as Utilisateur
		expect(isAdmin(inconnu)).toBe(false)
		expect(isEditor(inconnu)).toBe(false)
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
			expect(regle).toBe(adminOnly)
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
		expect(role).toMatchObject({ type: 'select', required: true, defaultValue: 'editor' })
		expect((role as { options: { value: string }[] }).options.map(({ value }) => value)).toEqual(['admin', 'editor'])
		const acces = (role as { access: Record<string, (args: unknown) => boolean> }).access
		expect([admin, redaction, null].map(user => acces.update?.(appel(user)))).toEqual([true, false, false])
		expect([admin, redaction, null].map(user => acces.create?.(appel(user)))).toEqual([true, false, false])
	})

	test('l’écran du premier compte est fermé sur admins comme sur pros, et rien ne force plus le rôle (ticket 094)', () => {
		expect(Admins.endpoints).toContain(firstClosedAccount)
		expect(Pros.endpoints).toContain(firstClosedAccount)
		expect(() => firstClosedAccount.handler({ t: (cle: string) => cle } as never)).toThrow()
		const role = Admins.fields.find(champ => 'name' in champ && champ.name === 'role')
		// Once Payload has sanitized the configuration the field may carry empty hook lists: none holds a hook.
		expect(Object.values((role as { hooks?: Record<string, unknown[]> }).hooks ?? {}).flat()).toEqual([])
	})

	test('la connexion est freinée par adresse, et une connexion réussie rend sa place (ticket 094)', () => {
		expect(Admins.hooks?.beforeOperation).toHaveLength(1)
		expect(Admins.hooks?.afterLogin).toHaveLength(1)
	})

	test('une session dure 8 heures', () => {
		expect(ADMIN_SESSION_DURATION_S).toBe(28_800)
		expect(Admins.auth).toMatchObject({ tokenExpiration: 28_800 })
	})

	test('les sessions d’un compte ne sortent jamais, pas même pour ce compte', () => {
		// Found by its name: once the configuration is loaded, Payload has merged it with its own field.
		const sessions = Admins.fields.find(champ => 'name' in champ && champ.name === 'sessions')
		expect(sessions).toMatchObject({ type: 'array', access: { read: neverAllowed } })
		expect(closedSessions).toMatchObject({ name: 'sessions', access: { read: neverAllowed } })
		expect(neverAllowed(appel(admin) as never)).toBe(false)
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
		for (const regle of [regles.create, regles.delete, regles.unlock]) expect(regle).toBe(adminOnly)
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
			access: { read: neverAllowed, create: neverAllowed, update: neverAllowed },
		})
	})

	test('bloqué et vérifié : admin seulement ; fournisseur d’origine et strapiId : jamais par une API', () => {
		for (const nom of ['blocked', '_verified'])
			expect(champ(Pros.fields, nom)?.access).toMatchObject({
				create: fieldAdminOnly,
				update: fieldAdminOnly,
			})
		for (const nom of ['legacyProvider', 'strapiId'])
			expect(champ(Pros.fields, nom)?.access).toMatchObject({ create: neverAllowed, update: neverAllowed })
		expect(champ(Pros.fields, 'strapiId')?.unique).toBe(true)
	})

	test('la confirmation de l’adresse est active dans le schéma lui-même : `_verified` existe', () => {
		// `true` as written, `{}` once Payload has loaded the configuration: on either way.
		const verify = typeof Pros.auth === 'object' ? Pros.auth.verify : undefined
		expect(verify === true || (typeof verify === 'object' && verify !== null)).toBe(true)
	})

	test('l’écran du premier compte est fermé : la route refuse avant de rien créer', () => {
		expect(firstClosedAccount).toMatchObject({ path: '/first-register', method: 'post' })
		expect(() => firstClosedAccount.handler({ t: (cle: string) => cle } as never)).toThrow()
		expect(Pros.endpoints).toContain(firstClosedAccount)
	})
})

describe('La collection profils (ticket 020)', () => {
	const regles = Profiles.access ?? {}

	test('modifier : son seul profil pour une maquilleuse, tout pour admin, rien pour les autres (U54)', () => {
		const regle = regles.update
		expect(regle).toBe(adminOrOwner)
		expect(regle?.(appel(maquilleuse) as never)).toEqual({ pro: { equals: 7 } })
		expect(regle?.(appel(admin) as never)).toBe(true)
		expect(regle?.(appel(redaction) as never)).toBe(false)
		expect(regle?.(appel(null) as never)).toBe(false)
	})

	test('lire : les profils publiés pour l’anonyme et redaction (U53), plus le sien pour une maquilleuse, tout pour admin', () => {
		const regle = regles.read
		expect(regle).toBe(publishedProfileOrOwner)
		expect(PUBLISHED_PROFILES).toEqual({ status: { equals: 'published' } })
		expect(regle?.(appel(null) as never)).toEqual({ status: { equals: 'published' } })
		expect(regle?.(appel(redaction) as never)).toEqual({ status: { equals: 'published' } })
		expect(regle?.(appel(maquilleuse) as never)).toEqual({
			or: [{ pro: { equals: 7 } }, { status: { equals: 'published' } }],
		})
		expect(regle?.(appel(admin) as never)).toBe(true)
	})

	test('lire un profil par un identifiant qu’aucun document ne peut porter : refusé à tous, avant la base', () => {
		for (const id of IDENTIFIANTS_IMPOSSIBLES)
			for (const user of [null, redaction, maquilleuse, admin])
				expect([id, publishedProfileOrOwner({ req: { user } as PayloadRequest, id } as never)]).toEqual([id, false])
		// A possible identifier keeps the rule of the role.
		expect(publishedProfileOrOwner({ req: { user: null } as PayloadRequest, id: 12 } as never)).toEqual(
			PUBLISHED_PROFILES
		)
		expect(publishedProfileOrOwner({ req: { user: admin } as PayloadRequest, id: '12' } as never)).toBe(true)
	})

	test('les champs réservés : statut, motif, vérifiée et SIRET, lus par admin et la propriétaire seulement', () => {
		// Read as Payload reads a field of a document: the request, and the document itself.
		const lire = (user: Utilisateur | null, doc: Record<string, unknown>) =>
			profileFieldAdminOrOwner({ req: { user } as PayloadRequest, doc } as never)
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

		for (const nom of ['status', 'reason', 'verified', 'verifiedAt', 'siret', 'pro', 'legacyUsername', 'strapiId'])
			expect(champ(Profiles.fields, nom)?.access?.read).toBe(profileFieldAdminOrOwner)
		for (const nom of ['internalNote', 'score']) expect(champ(Profiles.fields, nom)?.access?.read).toBe(fieldAdminOnly)
		// The badge of the search is public.
		expect(champ(Profiles.fields, 'superArtist')?.access?.read).toBeUndefined()
	})

	test('choix du statut, motif, vérifiée, SIRET, note interne, score, badge et compte : seul admin les écrit (U55)', () => {
		for (const nom of [
			'chosenStatus',
			'reason',
			'verified',
			'verifiedAt',
			'siret',
			'internalNote',
			'score',
			'superArtist',
			'pro',
		]) {
			const acces = champ(Profiles.fields, nom)?.access as Record<string, (args: unknown) => boolean>
			expect([admin, redaction, maquilleuse, null].map(user => acces.update?.(appel(user)))).toEqual([
				true,
				false,
				false,
				false,
			])
			expect(acces.create as unknown).toBe(fieldAdminOnly)
		}
		// The status itself is computed by the server from that choice (ticket 044): no API writes it.
		const statut = champ(Profiles.fields, 'status')?.access as Record<string, (args: unknown) => boolean>
		for (const operation of ['create', 'update'])
			expect([admin, redaction, maquilleuse, null].map(user => statut[operation]?.(appel(user)))).toEqual([
				false,
				false,
				false,
				false,
			])
	})

	test('le statut : brouillon, publié ou masqué ; un profil neuf est un brouillon', () => {
		expect(PROFILE_STATUSES).toEqual(['draft', 'published', 'hidden'])
		const statut = champ(Profiles.fields, 'status') as { defaultValue?: unknown; options?: { value: string }[] }
		// Not `required`: a profile created without one, by the server or a test, gets the default.
		expect(statut).toMatchObject({ type: 'select', defaultValue: 'draft' })
		expect(statut.options?.map(({ value }) => value)).toEqual(['draft', 'published', 'hidden'])
	})

	test('les coordonnées et le choix de les montrer : lus par admin et la propriétaire seulement, jamais par redaction (U59)', () => {
		for (const nom of ['contactDetails', 'publicContact', 'consentedAt', 'consentSource'])
			expect(champ(Profiles.fields, nom)?.access?.read).toBe(profileFieldAdminOrOwner)
		expect(profileFieldAdminOrOwner({ req: { user: redaction } as PayloadRequest, doc: { pro: 2 } } as never)).toBe(
			false
		)
		// The networks are public.
		expect(champ(Profiles.fields, 'networks')?.access?.read).toBeUndefined()
	})

	test('la date et la source du consentement : jamais écrites par une API, posées par le serveur', () => {
		for (const nom of ['consentedAt', 'consentSource'])
			expect(champ(Profiles.fields, nom)?.access).toMatchObject({ create: neverAllowed, update: neverAllowed })
		expect(Profiles.hooks?.beforeChange).toContain(consentTrace)
	})

	test('créer et supprimer un profil : admin seulement ; le serveur le crée avec le compte', () => {
		expect(regles.create).toBe(adminOnly)
		expect(regles.delete).toBe(adminOnly)
		// The profile creation, then the erasing of the old-site hash after a new password (ticket 087).
		expect(Pros.hooks?.afterChange).toContain(profileOnAccountCreation)
		expect(Pros.hooks?.afterChange?.length).toBe(3)
		expect(NO_PROFILE_CONTEXT).toEqual({ profilAutomatique: false })
	})

	test('un seul compte par profil, un seul profil par compte, un slug unique', () => {
		expect(champ(Profiles.fields, 'pro')).toMatchObject({ type: 'relationship', required: true, unique: true })
		expect(champ(Profiles.fields, 'slug')).toMatchObject({ type: 'text', required: true, unique: true })
	})

	test('le compte : admin seulement ; slug, strapiId et ancien nom d’utilisateur : jamais par une API', () => {
		expect(champ(Profiles.fields, 'pro')?.access).toMatchObject({
			create: fieldAdminOnly,
			update: fieldAdminOnly,
		})
		for (const nom of ['slug', 'strapiId', 'legacyUsername'])
			expect(champ(Profiles.fields, nom)?.access).toMatchObject({ create: neverAllowed, update: neverAllowed })
	})

	test('un compte qui a encore un profil n’est pas supprimé', () => {
		expect(Pros.hooks?.beforeDelete).toContain(accountWithoutProfileBeforeDeletion)
	})
})

describe('La collection talents (ticket 022) : la rédaction écrit, le public lit ce qui est publié (U59)', () => {
	const regles = Talents.access ?? {}
	const tousLesComptes = [admin, redaction, maquilleuse, autreCollection, null]

	test('admin et redaction forment la rédaction ; une maquilleuse et un anonyme n’en sont pas', () => {
		expect(tousLesComptes.map(isAdminOrEditor)).toEqual([true, true, false, false, false])
	})

	test('lire : tout pour la rédaction, brouillons compris ; les talents publiés seulement pour les autres', () => {
		expect(regles.read).toBe(adminEditorOrPublished)
		expect(ONLY_PUBLISHED).toEqual({ _status: { equals: 'published' } })
		expect(tousLesComptes.map(user => regles.read?.(appel(user) as never))).toEqual([
			true,
			true,
			ONLY_PUBLISHED,
			ONLY_PUBLISHED,
			ONLY_PUBLISHED,
		])
	})

	test('créer, modifier (donc publier), supprimer, lire les versions : la rédaction seulement', () => {
		for (const regle of [regles.create, regles.update, regles.delete, regles.readVersions]) {
			expect(regle).toBe(adminOrEditor)
			expect(tousLesComptes.map(user => regle?.(appel(user) as never))).toEqual([true, true, false, false, false])
		}
	})

	test('ce sont les règles de la rédaction, que les articles reprendront, avec les brouillons', () => {
		// Loading the Payload configuration (tests/unit/payload-config.test.ts, in the same process,
		// sometimes first) gives the collection a completed copy of its rules and completes the
		// versions in place: the rules and the drafts are compared, not the objects as written.
		expect(Talents.access).toMatchObject(EDITOR_ACCESS)
		expect(Talents.versions).toBe(EDITOR_VERSIONS)
		expect(EDITOR_VERSIONS.drafts).toBeTruthy()
	})

	test('un slug unique, requis pour publier ; un titre requis pour publier', () => {
		expect(champ(Talents.fields, 'slug')).toMatchObject({ type: 'text', required: true, unique: true })
		expect(champ(Talents.fields, 'title')).toMatchObject({ type: 'text', required: true })
	})

	test('strapiId : écrit par l’import seulement, lu par la rédaction seulement', () => {
		expect(champ(Talents.fields, 'strapiId')).toBe(strapiIdFieldDef as never)
		expect(strapiIdFieldDef).toMatchObject({
			type: 'number',
			unique: true,
			access: { read: fieldAdminOrEditor, create: neverAllowed, update: neverAllowed },
		})
		expect(tousLesComptes.map(user => fieldAdminOrEditor(appel(user) as never))).toEqual([
			true,
			true,
			false,
			false,
			false,
		])
	})

	test('la date de publication n’est écrite par aucune API', () => {
		expect(champ(Talents.fields, 'publishedAt')?.access).toMatchObject({ create: neverAllowed, update: neverAllowed })
	})
})

describe('La collection articles (ticket 046) : les règles des talents (U59)', () => {
	const regles = Articles.access ?? {}
	const tousLesComptes = [admin, redaction, maquilleuse, autreCollection, null]

	test('lire : tout pour la rédaction, brouillons compris ; les articles publiés seulement pour les autres', () => {
		expect(regles.read).toBe(adminEditorOrPublished)
		expect(tousLesComptes.map(user => regles.read?.(appel(user) as never))).toEqual([
			true,
			true,
			ONLY_PUBLISHED,
			ONLY_PUBLISHED,
			ONLY_PUBLISHED,
		])
	})

	test('créer, modifier (donc publier), supprimer, lire les versions : la rédaction seulement', () => {
		for (const regle of [regles.create, regles.update, regles.delete, regles.readVersions])
			expect(tousLesComptes.map(user => regle?.(appel(user) as never))).toEqual([true, true, false, false, false])
	})

	test('les règles et les brouillons de la rédaction, comme les talents', () => {
		// The rules and the drafts are compared, not the objects as written: loading the Payload
		// configuration in the same process completes them in place (see the talents).
		expect(Articles.access).toMatchObject(EDITOR_ACCESS)
		expect(Articles.versions).toBe(EDITOR_VERSIONS)
		// Beside the refresh of its pages (ticket 047, tests/unit/revalidation.test.ts).
		expect(Articles.hooks?.beforeChange).toContain(firstPublicationDate)
	})

	test('les champs de l’ancien site : titre et slug requis pour publier, le slug sous /blog, SEO bornés à 70 et 155', () => {
		expect(champ(Articles.fields, 'title')).toMatchObject({ type: 'text', required: true })
		expect(champ(Articles.fields, 'slug')).toMatchObject({
			type: 'text',
			required: true,
			unique: true,
			admin: { description: expect.stringContaining('/blog/<adresse>') },
		})
		expect(champ(Articles.fields, 'seo_title')).toMatchObject({ type: 'text', maxLength: 70 })
		expect(champ(Articles.fields, 'seo_description')).toMatchObject({ type: 'textarea', maxLength: 155 })
		expect(champ(Articles.fields, 'excerpt')).toMatchObject({ type: 'textarea' })
		expect(champ(Articles.fields, 'author')).toMatchObject({ type: 'text' })
		// Markdown without the 40 000 characters of `text` and `textarea`.
		expect(champ(Articles.fields, 'content')).toMatchObject({ type: 'code' })
		expect(champ(Articles.fields, 'content')).not.toHaveProperty('maxLength')
	})

	test('strapiId : écrit par l’import, lu par la rédaction ; la date de publication n’est écrite par aucune API', () => {
		expect(champ(Articles.fields, 'strapiId')).toBe(strapiIdFieldDef as never)
		expect(champ(Articles.fields, 'publishedAt')).toBe(publishedAtFieldDef as never)
	})

	test('la galerie : des médias, plusieurs, des images de la rédaction seulement, brouillons compris', async () => {
		expect(champ(Articles.fields, 'gallery')).toMatchObject({
			type: 'upload',
			hasMany: true,
			filterOptions: imagesDeLaRedaction,
			hooks: { beforeChange: [galerieDImages] },
		})
		expect(IMAGES).toEqual({ mimeType: { in: [...TYPES_D_IMAGE] } })
		const offertes = (user: Utilisateur) => imagesDeLaRedaction({ req: { user } } as never)
		// The admin panel offers `admin` the images that belong to nobody: never the photo of a makeup artist.
		expect(offertes(admin)).toEqual({ and: [IMAGES, { owner: { exists: false } }] })
		// `editor` only reads those (its read rule), and may not filter on the owner, a field it does not read.
		expect(offertes(redaction)).toEqual(IMAGES)
		expect(await mediaRead({ req: { user: redaction } as PayloadRequest } as never)).toEqual(EDITORIAL_MEDIA)
	})
})

describe('La galerie d’un article ne prend que des images de la rédaction (ticket 046)', () => {
	/** Payload’s translations in the one language the site gives them (src/lib/payload-language.ts). */
	const enFrancais = initI18n({ config: PAYLOAD_LANGUAGE, context: 'api', language: 'fr' })

	/**
	 * The hook as Payload calls it: on the field of the gallery, with a request in French and a
	 * database that holds these media, their types and their owners.
	 */
	function enregistrer(valeur: unknown, media: { id: number; mimeType: string | null; owner?: number | null }[]) {
		const recherches: unknown[] = []
		const payload = {
			find: (options: { where: unknown }) => {
				recherches.push(options.where)
				return Promise.resolve({ docs: media })
			},
		}
		const resultat = enFrancais.then(({ t }) =>
			galerieDImages({
				field: champ(Articles.fields, 'gallery'),
				value: valeur,
				req: { payload, t } as unknown as PayloadRequest,
			} as never)
		)
		return { resultat, recherches }
	}

	test('un refus a une enveloppe en français, qui nomme le champ : jamais « The following field is invalid »', async () => {
		const { resultat } = enregistrer([1], [{ id: 1, mimeType: 'application/pdf' }])

		const refus = await resultat.then(
			() => undefined,
			(erreur: unknown) => erreur
		)
		expect(refus).toBeInstanceOf(ValidationError)
		// Payload's French puts a no-break space before the colon.
		expect((refus as ValidationError).message).toBe('Le champ suivant n’est pas valide\u00a0: Galerie')
		expect((refus as ValidationError).data.errors).toEqual([
			{ label: 'Galerie', message: MESSAGE_GALERIE_IMAGES, path: 'gallery' },
		])
	})

	test('JPEG, PNG, WebP, GIF et AVIF sont des images ; un PDF, une vidéo, un SVG, rien du tout n’en sont pas', () => {
		for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
			expect([type, estUneImage(type)]).toEqual([type, true])
		for (const type of [
			'application/pdf',
			'video/mp4',
			'image/svg+xml',
			'image/heic',
			'text/html',
			'',
			null,
			undefined,
		])
			expect([type, estUneImage(type)]).toEqual([type, false])
	})

	test('une galerie d’images est gardée telle quelle, dans son ordre ; une galerie vide ne demande rien', async () => {
		const images = enregistrer(
			[2, { id: 1 }],
			[
				{ id: 1, mimeType: 'image/png' },
				{ id: 2, mimeType: 'image/webp' },
			]
		)
		expect(await images.resultat).toEqual([2, { id: 1 }])
		expect(images.recherches).toEqual([{ id: { in: [2, 1] } }])
		for (const sansGalerie of [[], null, undefined]) {
			const vide = enregistrer(sansGalerie, [])
			expect(await vide.resultat).toEqual(sansGalerie)
			expect(vide.recherches).toEqual([])
		}
	})

	test('un PDF, ou un média qui n’existe pas : refusé, avec le message en français sur le champ', async () => {
		for (const [valeur, media] of [
			[
				[1, 3],
				[
					{ id: 1, mimeType: 'image/png' },
					{ id: 3, mimeType: 'application/pdf' },
				],
			],
			[[4], []],
		] as const)
			await expect(enregistrer(valeur, [...media]).resultat).rejects.toMatchObject({
				status: 400,
				data: { errors: [{ message: MESSAGE_GALERIE_IMAGES, path: 'gallery' }] },
			})
	})

	test('la photo d’une maquilleuse : refusée, même si c’est une image ; le même message, pour ne rien dire d’elle', async () => {
		const { resultat } = enregistrer(
			[1, 2],
			[
				{ id: 1, mimeType: 'image/png', owner: null },
				{ id: 2, mimeType: 'image/png', owner: 7 },
			]
		)
		await expect(resultat).rejects.toMatchObject({
			status: 400,
			data: { errors: [{ message: MESSAGE_GALERIE_IMAGES, path: 'gallery' }] },
		})
		expect(MESSAGE_GALERIE_IMAGES).toContain('jamais la photo d’une maquilleuse')
	})

	test('un identifiant qu’aucun média ne peut porter, ou une entrée qui n’en nomme aucun : refusé, sans requête', async () => {
		const image = { id: 1, mimeType: 'image/png', owner: null }
		for (const entree of [...IDENTIFIANTS_IMPOSSIBLES, { id: 'x' }, { id: 1.5 }, null, {}, true, [1]]) {
			const { resultat, recherches } = enregistrer([1, entree], [image])
			await expect(resultat).rejects.toMatchObject({ status: 400 })
			expect([entree, recherches]).toEqual([entree, []])
		}
		const seul = enregistrer('abc', [image])
		await expect(seul.resultat).rejects.toMatchObject({ status: 400 })
		expect(seul.recherches).toEqual([])
	})
})

describe('La collection media (ticket 043)', () => {
	const regles = Media.access ?? {}

	/**
	 * What the read rule receives: the request, with a database that answers how many published
	 * documents hold the media: `rattache` for every collection, or by collection.
	 */
	function lecture(
		user: Utilisateur | null,
		id: number | undefined,
		rattache: boolean | Partial<Record<'profiles' | 'articles', boolean>>
	) {
		const appels: unknown[] = []
		const payload = {
			count: (options: { collection: 'profiles' | 'articles' }) => {
				appels.push(options)
				const oui = typeof rattache === 'boolean' ? rattache : (rattache[options.collection] ?? false)
				return Promise.resolve({ totalDocs: oui ? 1 : 0 })
			},
		}
		const resultat = mediaRead({ req: { user, payload } as unknown as PayloadRequest, id } as never)
		return { resultat, appels }
	}

	test('lister : refusé à l’anonyme ; ses médias pour une maquilleuse ; ceux de la rédaction pour redaction ; tout pour admin (U56)', async () => {
		expect(regles.read).toBe(mediaRead)
		expect(await lecture(null, undefined, true).resultat).toBe(false)
		// The photos of the articles: those nobody owns (ticket 046).
		expect(EDITORIAL_MEDIA).toEqual({ owner: { exists: false } })
		expect(await lecture(redaction, undefined, true).resultat).toEqual(EDITORIAL_MEDIA)
		expect(await lecture(maquilleuse, undefined, true).resultat).toEqual({ owner: { equals: 7 } })
		expect(await lecture(admin, undefined, false).resultat).toBe(true)
	})

	test('lire un média : lu s’il est rattaché à un profil publié, introuvable sinon (U56, I04)', async () => {
		const publie = lecture(null, 12, true)
		expect(await publie.resultat).toBe(true)
		expect(publie.appels).toEqual([
			expect.objectContaining({
				collection: 'profiles',
				overrideAccess: true,
				where: {
					and: [PUBLISHED_PROFILES, { or: [{ mainPicture: { equals: 12 } }, { gallery: { in: [12] } }] }],
				},
			}),
		])
		expect(await lecture(null, 12, false).resultat).toEqual(NO_DOCUMENT)
		// The newsroom also reads its own photos, attached or not.
		expect(await lecture(redaction, 12, false).resultat).toEqual(EDITORIAL_MEDIA)
		// Her own media, attached or not.
		expect(await lecture(maquilleuse, 12, false).resultat).toEqual({ owner: { equals: 7 } })
	})

	test('lire un média : lu s’il est une photo de la rédaction dans la galerie d’un article publié, introuvable sinon (ticket 046)', async () => {
		const dUnArticle = lecture(null, 12, { articles: true })
		// Only if it belongs to nobody: an article never opens the photo of a makeup artist.
		expect(await dUnArticle.resultat).toEqual(EDITORIAL_MEDIA)
		expect(dUnArticle.appels).toEqual([
			expect.objectContaining({ collection: 'profiles' }),
			expect.objectContaining({
				collection: 'articles',
				overrideAccess: true,
				// The published version of the article: a draft never opens its photos.
				where: { and: [ONLY_PUBLISHED, { gallery: { in: [12] } }] },
			}),
		])
		expect(await lecture(redaction, 12, { articles: true }).resultat).toEqual(EDITORIAL_MEDIA)
		// A makeup artist: the photos of the newsroom of a published article, and her own.
		expect(await lecture(maquilleuse, 12, { articles: true }).resultat).toEqual({
			or: [{ owner: { equals: 7 } }, EDITORIAL_MEDIA],
		})
		expect(await lecture(null, 12, { articles: false, profiles: false }).resultat).toEqual(NO_DOCUMENT)
	})

	test('lire, modifier ou supprimer un média par un identifiant qu’aucun document ne peut porter : refusé à tous, sans requête', async () => {
		for (const id of IDENTIFIANTS_IMPOSSIBLES)
			for (const user of [null, redaction, maquilleuse, admin]) {
				const { resultat, appels } = lecture(user, id as never, true)
				expect([id, await resultat]).toEqual([id, false])
				expect(appels).toEqual([])
				expect([id, adminOrMediaOwner({ req: { user } as PayloadRequest, id } as never)]).toEqual([id, false])
			}
	})

	test('la route de fichier de Payload : une redirection vers l’adresse publique, jamais le disque', async () => {
		const base = 'https://photos.example.test'
		const recherches: unknown[] = []
		const requete = (trouve: unknown) =>
			({
				t: (cle: string) => cle,
				payload: {
					db: {
						findOne: (options: { where: unknown }) => {
							recherches.push(options.where)
							return Promise.resolve(trouve)
						},
					},
				},
			}) as unknown as PayloadRequest
		const gestionnaire = toPublicUrl(base)
		const servir = async (...args: Parameters<typeof gestionnaire>) => (await gestionnaire(...args)) as Response
		const params = { collection: 'media', filename: 'photo.png' }

		// Her own media, handed by Payload once the rule found it.
		const sienne = await servir(requete(null), {
			doc: { id: 3, prefix: 'media', filename: 'photo.png' } as never,
			params,
		})
		expect([sienne.status, sienne.headers.get('location')]).toEqual([302, `${base}/media/photo.png`])
		expect(recherches).toEqual([])
		// For admin, Payload hands nothing: the media is looked for by its name, and its prefix when given.
		const trouvee = await servir(requete({ id: 4, prefix: '', filename: 'photo.png' }), {
			doc: undefined as never,
			params: { ...params, prefix: '' },
		})
		expect(trouvee.headers.get('location')).toBe(`${base}/photo.png`)
		expect(recherches).toEqual([{ and: [{ filename: { equals: 'photo.png' } }, { prefix: { equals: '' } }] }])
		// A name no media has.
		await expect(servir(requete(null), { doc: undefined as never, params })).rejects.toMatchObject({ status: 404 })
		expect(Media.upload).toMatchObject({ disableLocalStorage: true })
	})

	test('envoyer : une maquilleuse, admin ou redaction ; modifier et supprimer : sa propriétaire, admin, ou redaction pour les photos de la rédaction', () => {
		expect(regles.create).toBe(adminEditorOrArtist)
		expect([admin, redaction, maquilleuse, null].map(user => adminEditorOrArtist(appel(user) as never))).toEqual([
			true,
			true,
			true,
			false,
		])
		for (const regle of [regles.update, regles.delete]) {
			expect(regle).toBe(adminOrMediaOwner)
			expect(regle?.(appel(maquilleuse) as never)).toEqual({ owner: { equals: 7 } })
			expect(regle?.(appel(admin) as never)).toBe(true)
			expect(regle?.(appel(redaction) as never)).toEqual(EDITORIAL_MEDIA)
			expect(regle?.(appel(null) as never)).toBe(false)
		}
	})

	test('le propriétaire : posé par le serveur à l’envoi, lu par lui et admin, écrit par admin seulement', () => {
		const envoi = (user: Utilisateur | null, operation: string) =>
			ownerOnUpload({ data: { owner: 99, alt: 'x' }, operation, req: { user } } as never)
		expect(envoi(maquilleuse, 'create')).toEqual({ owner: 7, alt: 'x' })
		expect(envoi(admin, 'create')).toEqual({ owner: 99, alt: 'x' })
		expect(envoi(maquilleuse, 'update')).toEqual({ owner: 99, alt: 'x' })
		expect(champ(Media.fields, 'owner')?.access).toMatchObject({
			read: mediaFieldAdminOrOwner,
			create: fieldAdminOnly,
			update: fieldAdminOnly,
		})
		const lire = (user: Utilisateur | null, doc: Record<string, unknown>) =>
			mediaFieldAdminOrOwner({ req: { user } as PayloadRequest, doc } as never)
		expect([lire(maquilleuse, { owner: 7 }), lire(maquilleuse, { owner: 8 }), lire(null, { owner: 7 })]).toEqual([
			true,
			false,
			false,
		])
	})

	test('l’objet d’un média : ses coordonnées sont écrites par le serveur, jamais par une requête', () => {
		const data = Object.fromEntries([...FILE_METADATA_FIELDS.map(cle => [cle, 'envoyé']), ['alt', 'gardé']])
		const args = fileMetadataSetByServer({ args: { data }, operation: 'update', req: { user: maquilleuse } } as never)
		expect((args as { data: unknown }).data).toEqual({ alt: 'gardé' })
		// The server, without a session (the import), writes them.
		const serveur = { data: { prefix: '', filename: 'a.jpg' } }
		expect(fileMetadataSetByServer({ args: serveur, operation: 'create', req: {} } as never) as unknown).toEqual(
			serveur
		)

		const config = closedStorageFields({
			collections: [
				{
					slug: 'media',
					fields: [
						{ name: '_objectKey', type: 'text' },
						{ name: 'prefix', type: 'text' },
					],
				},
			],
		} as never)
		for (const field of (config as { collections: { fields: { access?: unknown }[] }[] }).collections[0]?.fields ?? [])
			expect(field.access).toEqual({ create: neverAllowed, update: neverAllowed })
	})

	test('sans stockage, aucune photo n’est reçue', () => {
		expect(() =>
			noUploadWithoutStorage({ args: {}, operation: 'create', req: { file: { name: 'a.png' } } } as never)
		).toThrow('Le stockage des photos n’est pas configuré')
		const args = { data: { alt: 'x' } }
		expect(noUploadWithoutStorage({ args, operation: 'update', req: {} } as never) as unknown).toBe(args)
	})

	test('le strapiId et les formats de l’ancien site : lus par admin seulement, jamais écrits par une API', () => {
		for (const nom of ['strapiId', 'strapiFormats'])
			expect(champ(Media.fields, nom)?.access).toMatchObject({
				read: fieldAdminOnly,
				create: neverAllowed,
				update: neverAllowed,
			})
	})
})

const MESSAGE_REFUS =
	"Choisis à nouveau ta photo : elle n'a pas été acceptée, et tes modifications n'ont pas été enregistrées."

describe('Les photos d’un profil (ticket 043)', () => {
	/** The validation as Payload calls it, with a database that holds these media and their owners. */
	function valider(valeur: unknown, pro: unknown, media: { id: number; owner: unknown }[], avant?: unknown) {
		const payload = { find: () => Promise.resolve({ docs: media }) }
		return validateProfilePhotos(valeur, {
			data: { pro },
			previousValue: avant,
			req: { payload } as unknown as PayloadRequest,
		})
	}

	test('une photo que le profil a déjà reste, même d’un autre compte : seules les photos rattachées par la sauvegarde sont vérifiées', async () => {
		const autre = [{ id: 3, owner: 8 }]
		expect(await valider([3], 7, autre, [3])).toBe(true)
		expect(await valider(3, 7, autre, 3)).toBe(true)
		expect(await valider([3], 7, autre, [])).not.toBe(true)
	})

	test('une photo principale et une galerie, vers media ; la galerie garde l’ordre, 10 au plus', () => {
		expect(champ(Profiles.fields, 'mainPicture')).toMatchObject({ type: 'upload' })
		expect(champ(Profiles.fields, 'gallery')).toMatchObject({ type: 'upload', hasMany: true, maxRows: 10 })
	})

	test('ses propres photos passent, celles d’un autre compte sont refusées en français', async () => {
		const siennes = [
			{ id: 1, owner: 7 },
			{ id: 2, owner: { id: 7 } },
		]
		expect(await valider([1, 2], 7, siennes)).toBe(true)
		expect(await valider(1, { id: 7 }, siennes)).toBe(true)
		expect(await valider(null, 7, [])).toBe(true)
		expect(await valider([1, 3], 7, [...siennes, { id: 3, owner: 8 }])).toBe(
			"Choisis à nouveau ta photo : elle n'a pas été acceptée, et tes modifications n'ont pas été enregistrées."
		)
		// A media that does not exist, or that has no owner (an article's), is refused too.
		expect(await valider([4], 7, [])).not.toBe(true)
		expect(await valider([5], 7, [{ id: 5, owner: null }])).not.toBe(true)
	})

	test('133 : un identifiant impossible est refusé avant toute requête, un `find` espion n’est jamais appelé', async () => {
		let appels = 0
		const payload = {
			find: () => {
				appels++
				return Promise.resolve({ docs: [] })
			},
		}
		const valider133 = (valeur: unknown, hasMany: boolean) =>
			validateProfilePhotos(valeur, { data: { pro: 7 }, hasMany, req: { payload } as unknown as PayloadRequest })
		for (const id of IDENTIFIANTS_IMPOSSIBLES) {
			expect([id, await valider133(id, false)]).toEqual([id, MESSAGE_REFUS])
			expect([id, await valider133([id], true)]).toEqual([id, MESSAGE_REFUS])
		}
		expect(appels).toBe(0)
	})

	test('133 : une entrée qui ne nomme aucun identifiant est refusée au lieu d’être ignorée', async () => {
		const payload = { find: () => Promise.resolve({ docs: [{ id: 5, owner: 7 }] }) }
		const valider133 = (valeur: unknown, hasMany: boolean) =>
			validateProfilePhotos(valeur, { data: { pro: 7 }, hasMany, req: { payload } as unknown as PayloadRequest })
		for (const entree of [true, {}, { relationTo: 'media', value: 5 }, [[5]]])
			expect([entree, await valider133(entree, false)]).toEqual([entree, MESSAGE_REFUS])
		expect(await valider133([5], false)).toBe(MESSAGE_REFUS)
		expect(await valider133([5, true], true)).toBe(MESSAGE_REFUS)
		expect(await valider133([5, {}], true)).toBe(MESSAGE_REFUS)
		// The valid forms keep their behaviour: digits or number, a populated document, an empty value.
		expect(await valider133([5], true)).toBe(true)
		expect(await valider133('5', false)).toBe(true)
		expect(await valider133(5, false)).toBe(true)
		expect(await valider133({ id: 5 }, false)).toBe(true)
		expect(await valider133(null, false)).toBe(true)
		expect(await valider133([], true)).toBe(true)
	})

	test('11 photos : refusé, avec le message de l’ancien site', async () => {
		const onze = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, owner: 7 }))
		expect(
			await valider(
				onze.map(({ id }) => id),
				7,
				onze
			)
		).toBe('Ton portfolio contient déjà 10 photos : retires-en une pour en ajouter une autre.')
		expect(
			await valider(
				onze.slice(0, 10).map(({ id }) => id),
				7,
				onze
			)
		).toBe(true)
	})
})

describe('Les règles réutilisables', () => {
	test('adminOuSoiMeme compare la collection avant le numéro', () => {
		const surAdmins = adminOrSelf('admins')
		// Same number as the admin, other collection: nothing.
		expect(surAdmins(appel({ ...autreCollection, id: 2 } as unknown as Utilisateur) as never)).toBe(false)
		expect(surAdmins(appel(redaction) as never)).toEqual({ id: { equals: 2 } })
		const surPros = adminOrSelf('pros')
		expect(surPros(appel({ ...redaction, id: 7 } as unknown as Utilisateur) as never)).toBe(false)
	})
})
