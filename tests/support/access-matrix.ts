/**
 * The access matrix: who may do what, collection by collection, operation by operation, played
 * twice, through the REST API and through the Local API with the rules active
 * (`overrideAccess: false`), as plan 01 §5 P3 asks. The lines live in
 * tests/integration/payload-access.test.ts; this file plays them.
 *
 * A line names who acts (a role), on what (a collection, and the document of a role), how (an
 * operation, or the change of one field) and what must happen. Playing it gives what did happen,
 * in the same words, so that a test only compares two words:
 *
 *   { role: 'redaction', collection: 'admins', operation: 'lister', attendu: 'soi' }
 *
 * - `lister`: `refuse`, or what the list holds: `aucun` (empty), `soi` (exactly the documents of
 *   the actor), `publies` (exactly the documents of the cast the public reads; on an editorial
 *   collection: its published documents only, never its draft), `soiEtPublies` (exactly both),
 *   `sansProprietaire` (on `media`: exactly the photos of the articles of the cast, which belong to
 *   nobody), `tous` (every document of the cast).
 * - `lire`, `creer`, `supprimer`: `autorise` or `refuse`. A refusal is also checked in the
 *   database: nothing was created, the document is still there.
 * - `lire` with a field (`champ`): `visible` (the document read holds the field, with its stored
 *   value) or `absent` (the document is read, without the field), or `refuse`.
 * - `modifier`: `autorise` (the new value is stored), `refuse` (refused, nothing changed) or
 *   `ignore` (accepted, but the field kept its value: a field the actor may not write). The value
 *   is put back afterwards, so that a line never changes the cast for the next ones.
 * - Anything else is `incoherent`: refused but written anyway, or a list nobody expects.
 *
 * The cast is made once per file (`distribuer`): one account per role, by the account factory,
 * with their documents. A's profile is published, B's stays a draft, both by an admin: what the
 * public reads shows in the lines. A deletion that must succeed acts on a throwaway document of the same collection,
 * never on the cast.
 *
 * The documents of an editorial collection (talents, articles) belong to nobody: the cast holds
 * one published and one draft, which a line names by their state, `publie` or `brouillon`. Each
 * article of the cast has a photo in its gallery, a media that belongs to nobody: on `media`, the
 * same two words name the photo of the published article and the photo of the draft.
 */

import { randomUUID } from 'node:crypto'
import type { Payload, RequiredDataFromCollectionSlug, Where } from 'payload'
import { NO_PROFILE_CONTEXT } from '@/collections/Profiles'
import { PUBLISHED_PROFILES } from '@/lib/access'
import { INITIAL_STATUS, PUBLISHED_STATUS } from '@/lib/profile/status'
import { ACCOUNT_DOMAIN, createAccount, randomPassword, type TypeWithSession } from './account-factory'
import { testPayload } from './payload-test'
import { fileForForm, fileForPayload, photoName } from './photos'
import { callRest, formWithFile } from './rest'

/** The two ways in: the REST API, and the Local API with the rules active. */
export const STREETS = ['rest', 'locale'] as const
export type Street = (typeof STREETS)[number]

/** Who sends the request. Each role but `anonyme` is an account of the cast. */
export const ROLES = ['anonyme', 'admin', 'redaction', 'maquilleuse', 'autreMaquilleuse', 'sansProfil'] as const
export type Role = (typeof ROLES)[number]
type RoleWithAccount = Exclude<Role, 'anonyme'>

/** The type of account the factory makes for each role. */
const ROLE_TYPE: Record<RoleWithAccount, TypeWithSession> = {
	admin: 'admin',
	redaction: 'redaction',
	/** « A »: the makeup artist who owns the documents a line names `maquilleuse`. */
	maquilleuse: 'maquilleuse',
	/** « B »: another makeup artist, who owns nothing of A's. */
	autreMaquilleuse: 'maquilleuse',
	/** A makeup artist whose account has no profile. */
	sansProfil: 'maquilleuse-sans-profil',
}

/** The collections the matrix covers. */
export const COLLECTIONS = [
	'admins',
	'pros',
	'profiles',
	'media',
	'talents',
	'articles',
	'auth-events',
	'contact-requests',
	'deleted-accounts',
	'search-counts',
	'profile-views',
	'reminder-reports',
	'reminder-states',
	'payload-locked-documents',
] as const
export type MatrixCollection = (typeof COLLECTIONS)[number]

/**
 * The editorial collections (src/collections/editor.ts): written by the newsroom, read by the
 * public when published. Nobody owns their documents.
 */
export const COLLECTION_EDITORIAL = ['talents', 'articles'] as const satisfies readonly MatrixCollection[]
export type CollectionEditorial = (typeof COLLECTION_EDITORIAL)[number]

/** The state of a document of an editorial collection, which names it in a line. */
export const STATES = ['publie', 'brouillon'] as const
export type State = (typeof STATES)[number]

const isEditorial = (collection: MatrixCollection): collection is CollectionEditorial =>
	(COLLECTION_EDITORIAL as readonly string[]).includes(collection)

const isState = (document: RoleWithAccount | State): document is State =>
	(STATES as readonly string[]).includes(document)

export type Operation = 'lister' | 'lire' | 'creer' | 'modifier' | 'supprimer'
export type Issue =
	| 'autorise'
	| 'refuse'
	| 'ignore'
	| 'aucun'
	| 'soi'
	| 'publies'
	| 'soiEtPublies'
	| 'sansProprietaire'
	| 'tous'
	| 'visible'
	| 'absent'
	| 'incoherent'

export interface Line {
	role: Role
	collection: MatrixCollection
	operation: Operation
	/**
	 * The document the operation targets (`lire`, `modifier`, `supprimer`): named by the role that
	 * owns it, or, on an editorial collection, by its state. On `media`, a state names the photo of
	 * the article in that state.
	 */
	document?: RoleWithAccount | State
	/**
	 * `modifier`: the field to change and the value sent. Without them, the usual field of the
	 * collection. `{ compteDe: role }` stands for the account of that role, known once the cast is made.
	 * `lire`: the field whose presence in the document read the line checks (no value).
	 */
	champ?: string
	valeur?: unknown
	attendu: Issue
}

type Document = Record<string, unknown> & { id: number }

export interface Actor {
	role: Role
	/** For REST: the headers of the session; none for `anonyme`. */
	enTetes: Record<string, string>
	/** For the Local API: the account as Payload hands it to the rules; none for `anonyme`. */
	utilisateur?: Document & { collection: string }
	/** The documents this actor owns, by collection: its account, and later its profile. */
	documents: Partial<Record<MatrixCollection, number>>
}

/** The documents of the editorial collections, one per state. */
export type Contents = Record<CollectionEditorial, Record<State, number>>

/**
 * `contenus`: the documents of the editorial collections. `photosDesArticles`: the photo in the
 * gallery of each article of the cast, by the state of the article; a media nobody owns.
 */
export type Distribution = Record<Role, Actor> & {
	contenus: Contents
	photosDesArticles: Record<State, number>
	/** A row of the authentication journal (ticket 077): it belongs to nobody, only an admin reads it. */
	evenement: number
	/** A contact message (ticket 158): it belongs to nobody, only an admin reads it. */
	demande: number
	/** A deleted account of the old site (ticket 227): it belongs to nobody, only an admin reads it. */
	compteSupprime: number
	/** A row of the daily search counts (issue 1002): it belongs to nobody, only an admin reads it. */
	compteurDeRecherches: number
	/** A row of the counter of views (ticket 1001): it belongs to nobody, only an admin reads it. */
	vueDeProfil: number
	/** A row of the report of the reminders (issue 1006): it belongs to nobody, only an admin reads it. */
	rapportDeRelances: number
	/** A row of the state of the reminders of a profile (issue 1006): only an admin reads it. */
	etatDeRelances: number
}

/** A fresh address for each document a line creates or changes. */
const url = (prefixe: string) => `${prefixe}-${randomUUID()}@${ACCOUNT_DOMAIN}`

/** A fresh made-up name. */
const name = (prefixe: string) => `${prefixe} ${randomUUID().slice(0, 8)}`

/** The data of a makeup artist's account, address confirmed. */
const artistAccount = (prefixe: string) => ({
	email: url(prefixe),
	password: randomPassword(),
	nom: name('Maquilleuse'),
	_verified: true,
})

/** An account of a makeup artist made for one line, without a profile: what a profile is made for. */
const accountWithoutProfile = async (payload: Payload, prefixe: string): Promise<number> =>
	(
		await payload.create({
			collection: 'pros',
			data: artistAccount(prefixe),
			context: NO_PROFILE_CONTEXT,
			disableVerificationEmail: true,
		})
	).id

/** The profile of an account, if it has one. */
const profileOf = async (payload: Payload, compte: number): Promise<number | undefined> =>
	(await payload.find({ collection: 'profiles', depth: 0, limit: 1, where: { pro: { equals: compte } } })).docs[0]?.id

/** A talent with made-up content, in the state asked for: what the newsroom writes. */
const talent = (etat: State): RequiredDataFromCollectionSlug<'talents'> => ({
	title: name('Talent'),
	slug: `talent-${randomUUID()}`,
	description: 'Une page fictive de la matrice d’accès.',
	content: '## Un talent\n\nUne page fictive de la matrice d’accès.\n',
	_status: etat === 'publie' ? 'published' : 'draft',
})

/** An article with made-up content, in the state asked for, with these photos in its gallery. */
const article = (etat: State, gallery: number[] = []): RequiredDataFromCollectionSlug<'articles'> => ({
	title: name('Article'),
	slug: `article-${randomUUID()}`,
	author: 'Rédaction fictive',
	excerpt: 'Un article fictif de la matrice d’accès.',
	content: '## Un article\n\nUn article fictif de la matrice d’accès.\n',
	gallery,
	_status: etat === 'publie' ? 'published' : 'draft',
})

/** A row of the authentication journal, written by the server as it writes them. */
const event = async (payload: Payload): Promise<number> =>
	(
		await payload.create({
			collection: 'auth-events',
			data: { type: 'sign-in', code: 'ok', durationMs: 12, date: new Date().toISOString() },
		})
	).id

/** The data of a contact message, as the server writes it: made-up values only. */
const requestData = () => ({
	type: 'contact' as const,
	status: 'new' as const,
	mailStatus: 'sent' as const,
	firstName: 'Léa',
	lastName: name('Témoin'),
	email: url('demande'),
	phone: '01 99 00 12 34',
	message: 'Un message fictif de la matrice d’accès.',
})

/** A contact message, written by the server as it writes them: without access control. */
const request = async (payload: Payload): Promise<number> =>
	(await payload.create({ collection: 'contact-requests', data: requestData() })).id

/** The identifier of a deleted account, written by the server as it writes it: a made-up one, never reused. */
const deletedAccount = async (payload: Payload): Promise<number> =>
	(
		await payload.create({
			collection: 'deleted-accounts',
			data: { strapiId: 9_000_000 + Math.floor(Math.random() * 1_000_000_000), date: new Date().toISOString() },
		})
	).id

/** The data of a row of the daily search counts: a day far in the past (the pair day and département is unique). */
const searchCountData = () => ({
	day: new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 30_000) * 86_400_000).toISOString(),
	department: '74' as const,
	total: 3,
	withCity: 2,
	noResult: 1,
})

/** A row of the daily search counts, written by the server as it writes them: without access control. */
const searchCount = async (payload: Payload): Promise<number> =>
	(await payload.create({ collection: 'search-counts', data: searchCountData() })).id

/** A row of the counter of views, written by the server as it writes them: on the first profile, a day nobody reuses. */
const profileView = async (payload: Payload): Promise<number> => {
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, limit: 1, select: {} })
	const profile = docs[0]
	if (!profile) throw new Error('La matrice n’a aucun profil pour y compter des vues.')
	return (
		await payload.create({
			collection: 'profile-views',
			data: {
				profile: profile.id,
				day: `2020-01-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
				count: 1,
			},
		})
	).id
}

/** A row of the report of the reminders, written by the server as it writes them: a day nobody reuses. */
const reminderReport = async (payload: Payload): Promise<number> =>
	(
		await payload.create({
			collection: 'reminder-reports',
			data: {
				day: `2019-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
				incompleteCount: 0,
				inactiveCount: 0,
				sentCount: 0,
			},
		})
	).id

/** A row of the state of the reminders: on a profile that has none yet, as the server writes it. */
const reminderState = async (payload: Payload): Promise<number> => {
	const { docs } = await payload.find({ collection: 'profiles', depth: 0, limit: 1, select: {}, sort: '-id' })
	const profile = docs[0]
	if (!profile) throw new Error('La matrice n’a aucun profil pour y poser l’état des relances.')
	const taken = await payload.find({
		collection: 'reminder-states',
		depth: 0,
		limit: 1,
		where: { profile: { equals: profile.id } },
	})
	if (taken.docs[0]) return taken.docs[0].id
	return (
		await payload.create({
			collection: 'reminder-states',
			data: { profile: profile.id, lastSentAt: new Date().toISOString() },
		})
	).id
}

/** What the matrix needs to know of a collection to play its lines. */
interface Portrait {
	/** The field a line changes when it names none, and a new value for it. */
	champ: string
	nouvelleValeur: () => unknown
	/** The data a line sends to create a document. */
	donneesDeCreation: (acteur: Actor, payload: Payload) => Promise<Record<string, unknown>>
	/** A document made for one line to delete, owned by the actor when the collection has owners. */
	jetable: (payload: Payload, acteur: Actor) => Promise<number>
	/** True for a collection of files: a creation sends a photo with its data (tests/support/photos.ts). */
	fichier?: true
	/** Which documents the public reads, when the collection has some: a list may hold exactly them (`publies`). */
	publics?: Where
}

const PORTRAITS: Record<MatrixCollection, Portrait> = {
	admins: {
		champ: 'email',
		nouvelleValeur: () => url('modifie'),
		donneesDeCreation: () => Promise.resolve({ email: url('cree'), password: randomPassword(), role: 'editor' }),
		jetable: async payload =>
			(
				await payload.create({
					collection: 'admins',
					data: { email: url('jetable'), password: randomPassword(), role: 'editor' },
				})
			).id,
	},
	pros: {
		champ: 'name',
		nouvelleValeur: () => name('Renommée'),
		donneesDeCreation: () => Promise.resolve(artistAccount('cree')),
		// Without a profile: an account that still has one is not deleted (its profile goes first).
		jetable: payload => accountWithoutProfile(payload, 'jetable'),
	},
	profiles: {
		champ: 'firstName',
		nouvelleValeur: () => name('Prénom'),
		// A profile for the actor's own account when it has none, else for a new account without one.
		donneesDeCreation: async (acteur, payload) => ({
			pro:
				acteur.utilisateur?.collection === 'pros' && acteur.documents.profiles === undefined
					? acteur.utilisateur.id
					: await accountWithoutProfile(payload, 'cree'),
		}),
		jetable: async payload =>
			(
				await payload.create({
					collection: 'profiles',
					// The slug is not given: the collection computes it.
					data: { pro: await accountWithoutProfile(payload, 'jetable') } as RequiredDataFromCollectionSlug<'profiles'>,
				})
			).id,
		publics: PUBLISHED_PROFILES,
	},
	media: {
		champ: 'alt',
		nouvelleValeur: () => name('Texte alternatif'),
		donneesDeCreation: () => Promise.resolve({ alt: name('Envoyée') }),
		jetable: (payload, acteur) =>
			mediaOf(payload, acteur.utilisateur?.collection === 'pros' ? acteur.utilisateur.id : undefined),
		fichier: true,
	},
	'auth-events': {
		champ: 'durationMs',
		nouvelleValeur: () => 999,
		donneesDeCreation: () => Promise.resolve({ type: 'sign-in', code: 'ok', durationMs: 1 }),
		jetable: event,
	},
	'search-counts': {
		champ: 'total',
		nouvelleValeur: () => 999,
		donneesDeCreation: () => Promise.resolve(searchCountData()),
		jetable: searchCount,
	},
	'deleted-accounts': {
		champ: 'strapiId',
		nouvelleValeur: () => 1,
		donneesDeCreation: () => Promise.resolve({ strapiId: 8_000_000 + Math.floor(Math.random() * 1_000_000_000) }),
		jetable: deletedAccount,
	},
	'profile-views': {
		champ: 'count',
		nouvelleValeur: () => 999,
		donneesDeCreation: () => Promise.resolve({ day: '2020-02-01', count: 1 }),
		jetable: profileView,
	},
	'reminder-reports': {
		champ: 'sentCount',
		nouvelleValeur: () => 999,
		donneesDeCreation: () =>
			Promise.resolve({
				day: `2018-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`,
				incompleteCount: 0,
				inactiveCount: 0,
				sentCount: 0,
			}),
		jetable: reminderReport,
	},
	'reminder-states': {
		champ: 'lastSentAt',
		nouvelleValeur: () => new Date().toISOString(),
		donneesDeCreation: () => Promise.resolve({ lastSentAt: new Date().toISOString() }),
		jetable: reminderState,
	},
	// Contact messages (ticket 158): the server writes them, an admin reads them, nobody else reaches them.
	'contact-requests': {
		champ: 'status',
		nouvelleValeur: () => 'forwarded',
		donneesDeCreation: () => Promise.resolve(requestData()),
		jetable: request,
	},
	talents: {
		champ: 'title',
		nouvelleValeur: () => name('Titre'),
		// Created published: creating and publishing in one request.
		donneesDeCreation: () => Promise.resolve(talent('publie')),
		jetable: async payload => (await payload.create({ collection: 'talents', data: talent('publie') })).id,
	},
	articles: {
		champ: 'title',
		nouvelleValeur: () => name('Titre'),
		// Created published: creating and publishing in one request.
		donneesDeCreation: () => Promise.resolve(article('publie')),
		jetable: async payload => (await payload.create({ collection: 'articles', data: article('publie') })).id,
	},
	// Payload's editing locks (ticket 094): a lock names a global, so that no document of the cast is
	// involved, and the account that holds it, always an admin of the cast.
	'payload-locked-documents': {
		champ: 'globalSlug',
		nouvelleValeur: () => name('verrou-modifie'),
		donneesDeCreation: async (_acteur, payload) => ({
			globalSlug: name('verrou-cree'),
			user: { relationTo: 'admins', value: await firstAdmin(payload) },
		}),
		jetable: async payload => (await createLock(payload, await firstAdmin(payload))).id,
	},
}

/** An admin of the cast: the account a lock of the matrix is in the name of. */
const firstAdmin = async (payload: Payload): Promise<number> => {
	const { docs } = await payload.find({ collection: 'admins', depth: 0, limit: 1, sort: 'id' })
	const admin = docs[0]
	if (!admin) throw new Error('La distribution n’a aucun compte admin.')
	return admin.id
}

/** A lock in the name of this admin, written without access control. */
const createLock = (payload: Payload, admin: number) =>
	payload.create({
		collection: 'payload-locked-documents',
		data: { globalSlug: name('verrou'), user: { relationTo: 'admins', value: admin } },
	})

/** A media sent for this account (a photo with its owner), or for nobody, as for an article. */
async function mediaOf(payload: Payload, proprietaire: number | undefined): Promise<number> {
	const data = proprietaire === undefined ? {} : { owner: proprietaire }
	return (await payload.create({ collection: 'media', data, file: fileForPayload(photoName('distribution')) })).id
}

/**
 * One document per state, in each editorial collection, written without access control. Each
 * article has a photo of its own in its gallery, sent by nobody, as the newsroom sends them.
 */
async function createContents(payload: Payload): Promise<Pick<Distribution, 'contenus' | 'photosDesArticles'>> {
	const talentOf = async (etat: State) => (await payload.create({ collection: 'talents', data: talent(etat) })).id
	const articlesPhotos = { publie: await mediaOf(payload, undefined), brouillon: await mediaOf(payload, undefined) }
	const articleOf = async (etat: State) =>
		(await payload.create({ collection: 'articles', data: article(etat, [articlesPhotos[etat]]) })).id
	return {
		contenus: {
			talents: { publie: await talentOf('publie'), brouillon: await talentOf('brouillon') },
			articles: { publie: await articleOf('publie'), brouillon: await articleOf('brouillon') },
		},
		photosDesArticles: articlesPhotos,
	}
}

/** Makes the cast: one account per role, through the account factory, with their documents. */
export async function distribute(): Promise<Distribution> {
	const payload = await testPayload()
	const withAccount = ROLES.filter((role): role is RoleWithAccount => role !== 'anonyme')
	const actors = await Promise.all(
		withAccount.map(async (role): Promise<Actor> => {
			const account = await createAccount(ROLE_TYPE[role])
			const id = Number(account.id)
			const user = {
				...((await payload.findByID({ collection: account.collection, id, depth: 0 })) as unknown as Document),
				collection: account.collection,
			}
			const profile = account.collection === 'pros' ? await profileOf(payload, id) : undefined
			const documents = { [account.collection]: id, ...(profile === undefined ? {} : { profiles: profile }) }
			return { role, enTetes: account.session.enTetes, utilisateur: user, documents }
		})
	)
	const anonymous: Actor = { role: 'anonyme', enTetes: {}, documents: {} }
	const entries = [['anonyme', anonymous], ...actors.map(acteur => [acteur.role, acteur])]
	const byRole = Object.fromEntries(entries) as Record<Role, Actor>
	// A's profile is published by an admin; B's stays a draft, held there by an admin: with a photo,
	// the rule of ticket 044 would publish it. Both statuses are chosen, so that no line moves them.
	// Each of them has a photo of her own, the main photo of her profile (ticket 043).
	for (const role of ['maquilleuse', 'autreMaquilleuse'] as const) {
		const actor = byRole[role]
		const profile = actor.documents.profiles
		if (profile === undefined) throw new Error(`La distribution n’a pas de profil pour « ${role} ».`)
		actor.documents.media = await mediaOf(payload, actor.documents.pros)
		const pickedStatus = role === 'maquilleuse' ? PUBLISHED_STATUS : INITIAL_STATUS
		await payload.update({
			collection: 'profiles',
			id: profile,
			data: { chosenStatus: pickedStatus, mainPicture: actor.documents.media },
		})
	}
	// One lock for each account of the admin panel, in its own name.
	for (const role of ['admin', 'redaction'] as const) {
		const account = byRole[role].documents.admins
		if (account === undefined) throw new Error(`La distribution n’a pas de compte pour « ${role} ».`)
		byRole[role].documents['payload-locked-documents'] = (await createLock(payload, account)).id
	}
	return {
		...byRole,
		...(await createContents(payload)),
		evenement: await event(payload),
		demande: await request(payload),
		compteSupprime: await deletedAccount(payload),
		compteurDeRecherches: await searchCount(payload),
		vueDeProfil: await profileView(payload),
		rapportDeRelances: await reminderReport(payload),
		etatDeRelances: await reminderState(payload),
	}
}

/** What one request gave: allowed (with what it returned) or refused. */
type Reply = { autorise: true; corps: unknown } | { autorise: false }

interface Ask {
	collection: MatrixCollection
	operation: Operation
	id?: number
	donnees?: Record<string, unknown>
}

/** An error of the Local API that is a refusal: 403 (forbidden) or 404 (out of reach). */
const isRefusal = (erreur: unknown): boolean => {
	const status = (erreur as { status?: unknown })?.status
	return status === 403 || status === 404
}

async function byRest(acteur: Actor, { collection, operation, id, donnees: dataValue }: Ask): Promise<Reply> {
	// A creation in a collection of files sends a photo, in a form, as the site does.
	const form =
		operation === 'creer' && PORTRAITS[collection].fichier ? formWithFile(fileForForm(), dataValue) : undefined
	const options = form ? { enTetes: acteur.enTetes, formulaire: form } : { enTetes: acteur.enTetes, corps: dataValue }
	const call = {
		lister: () => callRest('GET', `/api/${collection}?limit=100&depth=0`, options),
		lire: () => callRest('GET', `/api/${collection}/${id}?depth=0`, options),
		creer: () => callRest('POST', `/api/${collection}?depth=0`, options),
		modifier: () => callRest('PATCH', `/api/${collection}/${id}?depth=0`, options),
		supprimer: () => callRest('DELETE', `/api/${collection}/${id}`, options),
	}[operation]
	const { statut: status, corps, texte: text } = await call()
	if (status >= 200 && status < 300) return { autorise: true, corps }
	if ([401, 403, 404].includes(status)) return { autorise: false }
	throw new Error(`REST ${operation} ${collection} : réponse ${status} inattendue : ${text}`)
}

async function byApiLocal(acteur: Actor, { collection, operation, id, donnees: dataValue }: Ask): Promise<Reply> {
	const payload = await testPayload()
	const rules = { collection, depth: 0, overrideAccess: false, user: acteur.utilisateur } as const
	const target = id ?? -1
	// A line sends what it wants: the collection checks the data, not the compiler.
	const create = payload.create.bind(payload) as unknown as (
		options: typeof rules & { data: Record<string, unknown>; disableVerificationEmail: boolean; file?: unknown }
	) => Promise<unknown>
	const file = PORTRAITS[collection].fichier ? { file: fileForPayload() } : {}
	try {
		const corps = await {
			lister: () => payload.find({ ...rules, limit: 100 }),
			lire: () => payload.findByID({ ...rules, id: target }),
			creer: () => create({ ...rules, data: dataValue ?? {}, disableVerificationEmail: true, ...file }),
			modifier: () => payload.update({ ...rules, id: target, data: dataValue ?? {} }),
			supprimer: () => payload.delete({ ...rules, id: target }),
		}[operation]()
		return { autorise: true, corps }
	} catch (error) {
		if (isRefusal(error)) return { autorise: false }
		throw error
	}
}

const makeRequest = (voie: Street, acteur: Actor, demande: Ask): Promise<Reply> =>
	voie === 'rest' ? byRest(acteur, demande) : byApiLocal(acteur, demande)

/** The stored document, read without access control: what the database really holds. */
const stored = async (collection: MatrixCollection, id: number): Promise<Document | undefined> => {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection, depth: 0, limit: 1, where: { id: { equals: id } } })
	return docs[0] as Document | undefined
}

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The identifiers a list answered, sorted. */
const identifiers = (corps: unknown): number[] =>
	((corps as { docs?: { id: number }[] }).docs ?? []).map(({ id }) => id).sort((a, b) => a - b)

/**
 * The document a line names in its collection: the one of a role, or, on an editorial collection,
 * the one of a state; on `media`, a state names the photo of the article in that state.
 */
function documentOf(distribution: Distribution, ligne: Line): number {
	const { collection, document } = ligne
	if (collection === 'auth-events') return distribution.evenement
	if (collection === 'contact-requests') return distribution.demande
	if (collection === 'deleted-accounts') return distribution.compteSupprime
	if (collection === 'search-counts') return distribution.compteurDeRecherches
	if (collection === 'profile-views') return distribution.vueDeProfil
	if (collection === 'reminder-reports') return distribution.rapportDeRelances
	if (collection === 'reminder-states') return distribution.etatDeRelances
	const state = (etat: State) =>
		isEditorial(collection)
			? distribution.contenus[collection][etat]
			: collection === 'media'
				? distribution.photosDesArticles[etat]
				: undefined
	const id =
		document === undefined
			? undefined
			: isState(document)
				? state(document)
				: distribution[document].documents[collection]
	if (id === undefined)
		throw new Error(`Ligne mal formée : aucun document « ${ligne.document} » dans « ${ligne.collection} ».`)
	return id
}

/** The documents of the cast the public reads in this collection, sorted: none when it has no public documents. */
async function publicOf(collection: MatrixCollection, distribues: number[]): Promise<number[]> {
	const publicOnes = PORTRAITS[collection].publics
	if (!publicOnes) return []
	const payload = await testPayload()
	const { docs } = await payload.find({
		collection,
		depth: 0,
		pagination: false,
		where: { and: [{ id: { in: distribues } }, publicOnes] },
	})
	return identifiers({ docs })
}

async function list(voie: Street, acteur: Actor, ligne: Line, distribution: Distribution): Promise<Issue> {
	const response = await makeRequest(voie, acteur, ligne)
	if (!response.autorise) return 'refuse'
	const { collection } = ligne
	const seen = identifiers(response.corps)
	const own = [acteur.documents[collection]].filter((id): id is number => id !== undefined)
	const contents = isEditorial(collection) ? Object.values(distribution.contenus[collection]) : []
	// The photos of the articles: the media of the cast that belong to nobody.
	const withoutOwner = collection === 'media' ? Object.values(distribution.photosDesArticles).sort((a, b) => a - b) : []
	const distributed = [
		...ROLES.flatMap(role => distribution[role].documents[collection] ?? []),
		...contents,
		...withoutOwner,
		...(collection === 'auth-events' ? [distribution.evenement] : []),
		...(collection === 'contact-requests' ? [distribution.demande] : []),
		...(collection === 'deleted-accounts' ? [distribution.compteSupprime] : []),
		...(collection === 'search-counts' ? [distribution.compteurDeRecherches] : []),
		...(collection === 'profile-views' ? [distribution.vueDeProfil] : []),
		...(collection === 'reminder-reports' ? [distribution.rapportDeRelances] : []),
		...(collection === 'reminder-states' ? [distribution.etatDeRelances] : []),
	]
	const publicOnes = await publicOf(collection, distributed)
	const ownAndPublic = [...new Set([...own, ...publicOnes])].sort((a, b) => a - b)
	if (seen.length === 0) return 'aucun'
	if (equal(seen, own)) return 'soi'
	if (equal(seen, publicOnes)) return 'publies'
	if (equal(seen, ownAndPublic)) return 'soiEtPublies'
	if (withoutOwner.length > 0 && equal(seen, withoutOwner)) return 'sansProprietaire'
	if (distributed.every(id => seen.includes(id))) return 'tous'
	if (isEditorial(collection) && seen.includes(distribution.contenus[collection].publie))
		return (await publishedOnly(collection, seen)) ? 'publies' : 'incoherent'
	return 'incoherent'
}

/** Whether every one of these documents is published, read in the database without access control. */
async function publishedOnly(collection: CollectionEditorial, ids: number[]): Promise<boolean> {
	const payload = await testPayload()
	const { docs } = await payload.find({ collection, depth: 0, limit: ids.length, where: { id: { in: ids } } })
	return docs.length === ids.length && docs.every(({ _status }) => _status === 'published')
}

async function read(voie: Street, acteur: Actor, ligne: Line, distribution: Distribution): Promise<Issue> {
	const id = documentOf(distribution, ligne)
	const response = await makeRequest(voie, acteur, { ...ligne, id })
	if (!response.autorise) return 'refuse'
	const corps = response.corps as Record<string, unknown>
	if (corps.id !== id) return 'incoherent'
	if (ligne.champ === undefined) return 'autorise'
	// Payload strips a field its reader may not read; a field it keeps holds the stored value.
	if (!(ligne.champ in corps)) return 'absent'
	return equal(corps[ligne.champ], (await stored(ligne.collection, id))?.[ligne.champ]) ? 'visible' : 'incoherent'
}

async function create(voie: Street, acteur: Actor, ligne: Line): Promise<Issue> {
	const payload = await testPayload()
	const dataValue = await PORTRAITS[ligne.collection].donneesDeCreation(acteur, payload)
	const before = (await payload.count({ collection: ligne.collection })).totalDocs
	const response = await makeRequest(voie, acteur, { ...ligne, donnees: dataValue })
	const after = (await payload.count({ collection: ligne.collection })).totalDocs
	if (response.autorise) return after > before ? 'autorise' : 'incoherent'
	return after === before ? 'refuse' : 'incoherent'
}

/** A value of a line, with `{ compteDe: role }` replaced by the account of that role. */
function valueFrom(valeur: unknown, distribution: Distribution): unknown {
	if (typeof valeur !== 'object' || valeur === null || !('compteDe' in valeur)) return valeur
	return distribution[(valeur as { compteDe: RoleWithAccount }).compteDe].documents.pros
}

/** The sessions stored on an account of the makeup artists, as the database holds them. */
async function accountSessions(collection: string, id: number): Promise<unknown[] | undefined> {
	if (collection !== 'pros') return undefined
	const payload = await testPayload()
	const line = await payload.db.findOne<{ id: number; sessions?: unknown[] }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	return line?.sessions
}

async function update(voie: Street, acteur: Actor, ligne: Line, distribution: Distribution): Promise<Issue> {
	const portrait = PORTRAITS[ligne.collection]
	const id = documentOf(distribution, ligne)
	const field = ligne.champ ?? portrait.champ
	const value = ligne.champ ? valueFrom(ligne.valeur, distribution) : portrait.nouvelleValeur()
	const before = (await stored(ligne.collection, id))?.[field]
	const sessions = await accountSessions(ligne.collection, id)
	const response = await makeRequest(voie, acteur, { ...ligne, id, donnees: { [field]: value } })
	const after = (await stored(ligne.collection, id))?.[field]
	if (!equal(after, before)) {
		// Put the cast back as it was, whatever the line found.
		const payload = await testPayload()
		await payload.update({ collection: ligne.collection, id, data: { [field]: before } })
		// Blocking an account closes its sessions (ticket 089): the cast gets its own back.
		if (sessions !== undefined)
			await payload.db.updateOne({ collection: 'pros', id, data: { sessions }, returning: false })
	}
	if (response.autorise && equal(after, value) && !equal(before, value)) return 'autorise'
	if (response.autorise && equal(after, before)) return 'ignore'
	if (!response.autorise && equal(after, before)) return 'refuse'
	return 'incoherent'
}

async function remove(voie: Street, acteur: Actor, ligne: Line, distribution: Distribution): Promise<Issue> {
	const payload = await testPayload()
	// A deletion that must succeed acts on a throwaway document: the cast stays whole.
	const id =
		ligne.attendu === 'autorise'
			? await PORTRAITS[ligne.collection].jetable(payload, acteur)
			: documentOf(distribution, ligne)
	const response = await makeRequest(voie, acteur, { ...ligne, id })
	const rest = (await stored(ligne.collection, id)) !== undefined
	if (response.autorise) return rest ? 'incoherent' : 'autorise'
	return rest ? 'refuse' : 'incoherent'
}

/** Plays one line of the matrix through one way in, and says what happened. */
export function run(ligne: Line, voie: Street, distribution: Distribution): Promise<Issue> {
	const actor = distribution[ligne.role]
	switch (ligne.operation) {
		case 'lister':
			return list(voie, actor, ligne, distribution)
		case 'lire':
			return read(voie, actor, ligne, distribution)
		case 'creer':
			return create(voie, actor, ligne)
		case 'modifier':
			return update(voie, actor, ligne, distribution)
		case 'supprimer':
			return remove(voie, actor, ligne, distribution)
	}
}

/** The name of a line in the test report: who, what, on which document, what must happen. */
export function describeName(ligne: Line, voie: Street): string {
	const document = ligne.document ? ` le document de « ${ligne.document} »` : ''
	const value = ligne.operation === 'modifier' ? ` = ${JSON.stringify(ligne.valeur)}` : ''
	const field = ligne.champ ? ` (${ligne.champ}${value})` : ''
	const by = voie === 'rest' ? 'REST' : 'API locale'
	return `${ligne.collection} · ${ligne.role} · ${ligne.operation}${document}${field} → ${ligne.attendu} · ${by}`
}
