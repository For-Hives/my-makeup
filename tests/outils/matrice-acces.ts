/**
 * The access matrix: who may do what, collection by collection, operation by operation, played
 * twice, through the REST API and through the Local API with the rules active
 * (`overrideAccess: false`), as plan 01 §5 P3 asks. The lines live in
 * tests/integration/payload-acces.test.ts; this file plays them.
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
import { CONTEXTE_SANS_PROFIL } from '@/collections/Profiles'
import { PROFILS_PUBLIES } from '@/lib/acces'
import { STATUT_INITIAL, STATUT_PUBLIE } from '@/lib/profile/statut'
import { creerCompte, DOMAINE_DES_COMPTES, motDePasseAleatoire, type TypeAvecSession } from './fabrique-comptes'
import { payloadDeTest } from './payload-test'
import { fichierPourFormulaire, fichierPourPayload, nomDePhoto } from './photos'
import { appelerRest, formulaireAvecFichier } from './rest'

/** The two ways in: the REST API, and the Local API with the rules active. */
export const VOIES = ['rest', 'locale'] as const
export type Voie = (typeof VOIES)[number]

/** Who sends the request. Each role but `anonyme` is an account of the cast. */
export const ROLES = ['anonyme', 'admin', 'redaction', 'maquilleuse', 'autreMaquilleuse', 'sansProfil'] as const
export type Role = (typeof ROLES)[number]
type RoleAvecCompte = Exclude<Role, 'anonyme'>

/** The type of account the factory makes for each role. */
const TYPE_DU_ROLE: Record<RoleAvecCompte, TypeAvecSession> = {
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
	'payload-locked-documents',
] as const
export type CollectionDeLaMatrice = (typeof COLLECTIONS)[number]

/**
 * The editorial collections (src/collections/editor.ts): written by the newsroom, read by the
 * public when published. Nobody owns their documents.
 */
export const COLLECTIONS_EDITORIALES = ['talents', 'articles'] as const satisfies readonly CollectionDeLaMatrice[]
export type CollectionEditoriale = (typeof COLLECTIONS_EDITORIALES)[number]

/** The state of a document of an editorial collection, which names it in a line. */
export const ETATS = ['publie', 'brouillon'] as const
export type Etat = (typeof ETATS)[number]

const estEditoriale = (collection: CollectionDeLaMatrice): collection is CollectionEditoriale =>
	(COLLECTIONS_EDITORIALES as readonly string[]).includes(collection)

const estUnEtat = (document: RoleAvecCompte | Etat): document is Etat => (ETATS as readonly string[]).includes(document)

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

export interface Ligne {
	role: Role
	collection: CollectionDeLaMatrice
	operation: Operation
	/**
	 * The document the operation targets (`lire`, `modifier`, `supprimer`): named by the role that
	 * owns it, or, on an editorial collection, by its state. On `media`, a state names the photo of
	 * the article in that state.
	 */
	document?: RoleAvecCompte | Etat
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

export interface Acteur {
	role: Role
	/** For REST: the headers of the session; none for `anonyme`. */
	enTetes: Record<string, string>
	/** For the Local API: the account as Payload hands it to the rules; none for `anonyme`. */
	utilisateur?: Document & { collection: string }
	/** The documents this actor owns, by collection: its account, and later its profile. */
	documents: Partial<Record<CollectionDeLaMatrice, number>>
}

/** The documents of the editorial collections, one per state. */
export type Contenus = Record<CollectionEditoriale, Record<Etat, number>>

/**
 * `contenus`: the documents of the editorial collections. `photosDesArticles`: the photo in the
 * gallery of each article of the cast, by the state of the article; a media nobody owns.
 */
export type Distribution = Record<Role, Acteur> & {
	contenus: Contenus
	photosDesArticles: Record<Etat, number>
	/** A row of the authentication journal (ticket 077): it belongs to nobody, only an admin reads it. */
	evenement: number
	/** A contact message (ticket 158): it belongs to nobody, only an admin reads it. */
	demande: number
	/** A deleted account of the old site (ticket 227): it belongs to nobody, only an admin reads it. */
	compteSupprime: number
}

/** A fresh address for each document a line creates or changes. */
const adresse = (prefixe: string) => `${prefixe}-${randomUUID()}@${DOMAINE_DES_COMPTES}`

/** A fresh made-up name. */
const nom = (prefixe: string) => `${prefixe} ${randomUUID().slice(0, 8)}`

/** The data of a makeup artist's account, address confirmed. */
const compteDeMaquilleuse = (prefixe: string) => ({
	email: adresse(prefixe),
	password: motDePasseAleatoire(),
	nom: nom('Maquilleuse'),
	_verified: true,
})

/** An account of a makeup artist made for one line, without a profile: what a profile is made for. */
const compteSansProfil = async (payload: Payload, prefixe: string): Promise<number> =>
	(
		await payload.create({
			collection: 'pros',
			data: compteDeMaquilleuse(prefixe),
			context: CONTEXTE_SANS_PROFIL,
			disableVerificationEmail: true,
		})
	).id

/** The profile of an account, if it has one. */
const profilDe = async (payload: Payload, compte: number): Promise<number | undefined> =>
	(await payload.find({ collection: 'profiles', depth: 0, limit: 1, where: { pro: { equals: compte } } })).docs[0]?.id

/** A talent with made-up content, in the state asked for: what the newsroom writes. */
const talent = (etat: Etat): RequiredDataFromCollectionSlug<'talents'> => ({
	title: nom('Talent'),
	slug: `talent-${randomUUID()}`,
	description: 'Une page fictive de la matrice d’accès.',
	content: '## Un talent\n\nUne page fictive de la matrice d’accès.\n',
	_status: etat === 'publie' ? 'published' : 'draft',
})

/** An article with made-up content, in the state asked for, with these photos in its gallery. */
const article = (etat: Etat, gallery: number[] = []): RequiredDataFromCollectionSlug<'articles'> => ({
	title: nom('Article'),
	slug: `article-${randomUUID()}`,
	author: 'Rédaction fictive',
	excerpt: 'Un article fictif de la matrice d’accès.',
	content: '## Un article\n\nUn article fictif de la matrice d’accès.\n',
	gallery,
	_status: etat === 'publie' ? 'published' : 'draft',
})

/** A row of the authentication journal, written by the server as it writes them. */
const evenement = async (payload: Payload): Promise<number> =>
	(
		await payload.create({
			collection: 'auth-events',
			data: { type: 'sign-in', code: 'ok', durationMs: 12, date: new Date().toISOString() },
		})
	).id

/** The data of a contact message, as the server writes it: made-up values only. */
const donneesDeDemande = () => ({
	type: 'contact' as const,
	status: 'new' as const,
	mailStatus: 'sent' as const,
	firstName: 'Léa',
	lastName: nom('Témoin'),
	email: adresse('demande'),
	phone: '01 99 00 12 34',
	message: 'Un message fictif de la matrice d’accès.',
})

/** A contact message, written by the server as it writes them: without access control. */
const demande = async (payload: Payload): Promise<number> =>
	(await payload.create({ collection: 'contact-requests', data: donneesDeDemande() })).id

/** The identifier of a deleted account, written by the server as it writes it: a made-up one, never reused. */
const compteSupprime = async (payload: Payload): Promise<number> =>
	(
		await payload.create({
			collection: 'deleted-accounts',
			data: { strapiId: 9_000_000 + Math.floor(Math.random() * 1_000_000_000), date: new Date().toISOString() },
		})
	).id

/** What the matrix needs to know of a collection to play its lines. */
interface Portrait {
	/** The field a line changes when it names none, and a new value for it. */
	champ: string
	nouvelleValeur: () => unknown
	/** The data a line sends to create a document. */
	donneesDeCreation: (acteur: Acteur, payload: Payload) => Promise<Record<string, unknown>>
	/** A document made for one line to delete, owned by the actor when the collection has owners. */
	jetable: (payload: Payload, acteur: Acteur) => Promise<number>
	/** True for a collection of files: a creation sends a photo with its data (tests/outils/photos.ts). */
	fichier?: true
	/** Which documents the public reads, when the collection has some: a list may hold exactly them (`publies`). */
	publics?: Where
}

const PORTRAITS: Record<CollectionDeLaMatrice, Portrait> = {
	admins: {
		champ: 'email',
		nouvelleValeur: () => adresse('modifie'),
		donneesDeCreation: () =>
			Promise.resolve({ email: adresse('cree'), password: motDePasseAleatoire(), role: 'editor' }),
		jetable: async payload =>
			(
				await payload.create({
					collection: 'admins',
					data: { email: adresse('jetable'), password: motDePasseAleatoire(), role: 'editor' },
				})
			).id,
	},
	pros: {
		champ: 'name',
		nouvelleValeur: () => nom('Renommée'),
		donneesDeCreation: () => Promise.resolve(compteDeMaquilleuse('cree')),
		// Without a profile: an account that still has one is not deleted (its profile goes first).
		jetable: payload => compteSansProfil(payload, 'jetable'),
	},
	profiles: {
		champ: 'firstName',
		nouvelleValeur: () => nom('Prénom'),
		// A profile for the actor's own account when it has none, else for a new account without one.
		donneesDeCreation: async (acteur, payload) => ({
			pro:
				acteur.utilisateur?.collection === 'pros' && acteur.documents.profiles === undefined
					? acteur.utilisateur.id
					: await compteSansProfil(payload, 'cree'),
		}),
		jetable: async payload =>
			(
				await payload.create({
					collection: 'profiles',
					// The slug is not given: the collection computes it.
					data: { pro: await compteSansProfil(payload, 'jetable') } as RequiredDataFromCollectionSlug<'profiles'>,
				})
			).id,
		publics: PROFILS_PUBLIES,
	},
	media: {
		champ: 'alt',
		nouvelleValeur: () => nom('Texte alternatif'),
		donneesDeCreation: () => Promise.resolve({ alt: nom('Envoyée') }),
		jetable: (payload, acteur) =>
			mediaDe(payload, acteur.utilisateur?.collection === 'pros' ? acteur.utilisateur.id : undefined),
		fichier: true,
	},
	'auth-events': {
		champ: 'durationMs',
		nouvelleValeur: () => 999,
		donneesDeCreation: () => Promise.resolve({ type: 'sign-in', code: 'ok', durationMs: 1 }),
		jetable: evenement,
	},
	'deleted-accounts': {
		champ: 'strapiId',
		nouvelleValeur: () => 1,
		donneesDeCreation: () => Promise.resolve({ strapiId: 8_000_000 + Math.floor(Math.random() * 1_000_000_000) }),
		jetable: compteSupprime,
	},
	// Contact messages (ticket 158): the server writes them, an admin reads them, nobody else reaches them.
	'contact-requests': {
		champ: 'status',
		nouvelleValeur: () => 'forwarded',
		donneesDeCreation: () => Promise.resolve(donneesDeDemande()),
		jetable: demande,
	},
	talents: {
		champ: 'title',
		nouvelleValeur: () => nom('Titre'),
		// Created published: creating and publishing in one request.
		donneesDeCreation: () => Promise.resolve(talent('publie')),
		jetable: async payload => (await payload.create({ collection: 'talents', data: talent('publie') })).id,
	},
	articles: {
		champ: 'title',
		nouvelleValeur: () => nom('Titre'),
		// Created published: creating and publishing in one request.
		donneesDeCreation: () => Promise.resolve(article('publie')),
		jetable: async payload => (await payload.create({ collection: 'articles', data: article('publie') })).id,
	},
	// Payload's editing locks (ticket 094): a lock names a global, so that no document of the cast is
	// involved, and the account that holds it, always an admin of the cast.
	'payload-locked-documents': {
		champ: 'globalSlug',
		nouvelleValeur: () => nom('verrou-modifie'),
		donneesDeCreation: async (_acteur, payload) => ({
			globalSlug: nom('verrou-cree'),
			user: { relationTo: 'admins', value: await premierAdmin(payload) },
		}),
		jetable: async payload => (await creerUnVerrou(payload, await premierAdmin(payload))).id,
	},
}

/** An admin of the cast: the account a lock of the matrix is in the name of. */
const premierAdmin = async (payload: Payload): Promise<number> => {
	const { docs } = await payload.find({ collection: 'admins', depth: 0, limit: 1, sort: 'id' })
	const admin = docs[0]
	if (!admin) throw new Error('La distribution n’a aucun compte admin.')
	return admin.id
}

/** A lock in the name of this admin, written without access control. */
const creerUnVerrou = (payload: Payload, admin: number) =>
	payload.create({
		collection: 'payload-locked-documents',
		data: { globalSlug: nom('verrou'), user: { relationTo: 'admins', value: admin } },
	})

/** A media sent for this account (a photo with its owner), or for nobody, as for an article. */
async function mediaDe(payload: Payload, proprietaire: number | undefined): Promise<number> {
	const data = proprietaire === undefined ? {} : { owner: proprietaire }
	return (await payload.create({ collection: 'media', data, file: fichierPourPayload(nomDePhoto('distribution')) })).id
}

/**
 * One document per state, in each editorial collection, written without access control. Each
 * article has a photo of its own in its gallery, sent by nobody, as the newsroom sends them.
 */
async function creerLesContenus(payload: Payload): Promise<Pick<Distribution, 'contenus' | 'photosDesArticles'>> {
	const talentDe = async (etat: Etat) => (await payload.create({ collection: 'talents', data: talent(etat) })).id
	const photosDesArticles = { publie: await mediaDe(payload, undefined), brouillon: await mediaDe(payload, undefined) }
	const articleDe = async (etat: Etat) =>
		(await payload.create({ collection: 'articles', data: article(etat, [photosDesArticles[etat]]) })).id
	return {
		contenus: {
			talents: { publie: await talentDe('publie'), brouillon: await talentDe('brouillon') },
			articles: { publie: await articleDe('publie'), brouillon: await articleDe('brouillon') },
		},
		photosDesArticles,
	}
}

/** Makes the cast: one account per role, through the account factory, with their documents. */
export async function distribuer(): Promise<Distribution> {
	const payload = await payloadDeTest()
	const avecCompte = ROLES.filter((role): role is RoleAvecCompte => role !== 'anonyme')
	const acteurs = await Promise.all(
		avecCompte.map(async (role): Promise<Acteur> => {
			const compte = await creerCompte(TYPE_DU_ROLE[role])
			const id = Number(compte.id)
			const utilisateur = {
				...((await payload.findByID({ collection: compte.collection, id, depth: 0 })) as unknown as Document),
				collection: compte.collection,
			}
			const profil = compte.collection === 'pros' ? await profilDe(payload, id) : undefined
			const documents = { [compte.collection]: id, ...(profil === undefined ? {} : { profiles: profil }) }
			return { role, enTetes: compte.session.enTetes, utilisateur, documents }
		})
	)
	const anonyme: Acteur = { role: 'anonyme', enTetes: {}, documents: {} }
	const entrees = [['anonyme', anonyme], ...acteurs.map(acteur => [acteur.role, acteur])]
	const parRole = Object.fromEntries(entrees) as Record<Role, Acteur>
	// A's profile is published by an admin; B's stays a draft, held there by an admin: with a photo,
	// the rule of ticket 044 would publish it. Both statuses are chosen, so that no line moves them.
	// Each of them has a photo of her own, the main photo of her profile (ticket 043).
	for (const role of ['maquilleuse', 'autreMaquilleuse'] as const) {
		const acteur = parRole[role]
		const profil = acteur.documents.profiles
		if (profil === undefined) throw new Error(`La distribution n’a pas de profil pour « ${role} ».`)
		acteur.documents.media = await mediaDe(payload, acteur.documents.pros)
		const statutChoisi = role === 'maquilleuse' ? STATUT_PUBLIE : STATUT_INITIAL
		await payload.update({
			collection: 'profiles',
			id: profil,
			data: { chosenStatus: statutChoisi, mainPicture: acteur.documents.media },
		})
	}
	// One lock for each account of the admin panel, in its own name.
	for (const role of ['admin', 'redaction'] as const) {
		const compte = parRole[role].documents.admins
		if (compte === undefined) throw new Error(`La distribution n’a pas de compte pour « ${role} ».`)
		parRole[role].documents['payload-locked-documents'] = (await creerUnVerrou(payload, compte)).id
	}
	return {
		...parRole,
		...(await creerLesContenus(payload)),
		evenement: await evenement(payload),
		demande: await demande(payload),
		compteSupprime: await compteSupprime(payload),
	}
}

/** What one request gave: allowed (with what it returned) or refused. */
type Reponse = { autorise: true; corps: unknown } | { autorise: false }

interface Demande {
	collection: CollectionDeLaMatrice
	operation: Operation
	id?: number
	donnees?: Record<string, unknown>
}

/** An error of the Local API that is a refusal: 403 (forbidden) or 404 (out of reach). */
const estUnRefus = (erreur: unknown): boolean => {
	const statut = (erreur as { status?: unknown })?.status
	return statut === 403 || statut === 404
}

async function parRest(acteur: Acteur, { collection, operation, id, donnees }: Demande): Promise<Reponse> {
	// A creation in a collection of files sends a photo, in a form, as the site does.
	const formulaire =
		operation === 'creer' && PORTRAITS[collection].fichier
			? formulaireAvecFichier(fichierPourFormulaire(), donnees)
			: undefined
	const options = formulaire ? { enTetes: acteur.enTetes, formulaire } : { enTetes: acteur.enTetes, corps: donnees }
	const appel = {
		lister: () => appelerRest('GET', `/api/${collection}?limit=100&depth=0`, options),
		lire: () => appelerRest('GET', `/api/${collection}/${id}?depth=0`, options),
		creer: () => appelerRest('POST', `/api/${collection}?depth=0`, options),
		modifier: () => appelerRest('PATCH', `/api/${collection}/${id}?depth=0`, options),
		supprimer: () => appelerRest('DELETE', `/api/${collection}/${id}`, options),
	}[operation]
	const { statut, corps, texte } = await appel()
	if (statut >= 200 && statut < 300) return { autorise: true, corps }
	if ([401, 403, 404].includes(statut)) return { autorise: false }
	throw new Error(`REST ${operation} ${collection} : réponse ${statut} inattendue : ${texte}`)
}

async function parApiLocale(acteur: Acteur, { collection, operation, id, donnees }: Demande): Promise<Reponse> {
	const payload = await payloadDeTest()
	const regles = { collection, depth: 0, overrideAccess: false, user: acteur.utilisateur } as const
	const cible = id ?? -1
	// A line sends what it wants: the collection checks the data, not the compiler.
	const creer = payload.create.bind(payload) as unknown as (
		options: typeof regles & { data: Record<string, unknown>; disableVerificationEmail: boolean; file?: unknown }
	) => Promise<unknown>
	const fichier = PORTRAITS[collection].fichier ? { file: fichierPourPayload() } : {}
	try {
		const corps = await {
			lister: () => payload.find({ ...regles, limit: 100 }),
			lire: () => payload.findByID({ ...regles, id: cible }),
			creer: () => creer({ ...regles, data: donnees ?? {}, disableVerificationEmail: true, ...fichier }),
			modifier: () => payload.update({ ...regles, id: cible, data: donnees ?? {} }),
			supprimer: () => payload.delete({ ...regles, id: cible }),
		}[operation]()
		return { autorise: true, corps }
	} catch (erreur) {
		if (estUnRefus(erreur)) return { autorise: false }
		throw erreur
	}
}

const demander = (voie: Voie, acteur: Acteur, demande: Demande): Promise<Reponse> =>
	voie === 'rest' ? parRest(acteur, demande) : parApiLocale(acteur, demande)

/** The stored document, read without access control: what the database really holds. */
const stocke = async (collection: CollectionDeLaMatrice, id: number): Promise<Document | undefined> => {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection, depth: 0, limit: 1, where: { id: { equals: id } } })
	return docs[0] as Document | undefined
}

const egaux = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The identifiers a list answered, sorted. */
const identifiants = (corps: unknown): number[] =>
	((corps as { docs?: { id: number }[] }).docs ?? []).map(({ id }) => id).sort((a, b) => a - b)

/**
 * The document a line names in its collection: the one of a role, or, on an editorial collection,
 * the one of a state; on `media`, a state names the photo of the article in that state.
 */
function documentDe(distribution: Distribution, ligne: Ligne): number {
	const { collection, document } = ligne
	if (collection === 'auth-events') return distribution.evenement
	if (collection === 'contact-requests') return distribution.demande
	if (collection === 'deleted-accounts') return distribution.compteSupprime
	const deLEtat = (etat: Etat) =>
		estEditoriale(collection)
			? distribution.contenus[collection][etat]
			: collection === 'media'
				? distribution.photosDesArticles[etat]
				: undefined
	const id =
		document === undefined
			? undefined
			: estUnEtat(document)
				? deLEtat(document)
				: distribution[document].documents[collection]
	if (id === undefined)
		throw new Error(`Ligne mal formée : aucun document « ${ligne.document} » dans « ${ligne.collection} ».`)
	return id
}

/** The documents of the cast the public reads in this collection, sorted: none when it has no public documents. */
async function publicsDe(collection: CollectionDeLaMatrice, distribues: number[]): Promise<number[]> {
	const publics = PORTRAITS[collection].publics
	if (!publics) return []
	const payload = await payloadDeTest()
	const { docs } = await payload.find({
		collection,
		depth: 0,
		pagination: false,
		where: { and: [{ id: { in: distribues } }, publics] },
	})
	return identifiants({ docs })
}

async function lister(voie: Voie, acteur: Acteur, ligne: Ligne, distribution: Distribution): Promise<Issue> {
	const reponse = await demander(voie, acteur, ligne)
	if (!reponse.autorise) return 'refuse'
	const { collection } = ligne
	const vus = identifiants(reponse.corps)
	const siens = [acteur.documents[collection]].filter((id): id is number => id !== undefined)
	const contenus = estEditoriale(collection) ? Object.values(distribution.contenus[collection]) : []
	// The photos of the articles: the media of the cast that belong to nobody.
	const sansProprietaire =
		collection === 'media' ? Object.values(distribution.photosDesArticles).sort((a, b) => a - b) : []
	const distribues = [
		...ROLES.flatMap(role => distribution[role].documents[collection] ?? []),
		...contenus,
		...sansProprietaire,
		...(collection === 'auth-events' ? [distribution.evenement] : []),
		...(collection === 'contact-requests' ? [distribution.demande] : []),
		...(collection === 'deleted-accounts' ? [distribution.compteSupprime] : []),
	]
	const publics = await publicsDe(collection, distribues)
	const siensEtPublics = [...new Set([...siens, ...publics])].sort((a, b) => a - b)
	if (vus.length === 0) return 'aucun'
	if (egaux(vus, siens)) return 'soi'
	if (egaux(vus, publics)) return 'publies'
	if (egaux(vus, siensEtPublics)) return 'soiEtPublies'
	if (sansProprietaire.length > 0 && egaux(vus, sansProprietaire)) return 'sansProprietaire'
	if (distribues.every(id => vus.includes(id))) return 'tous'
	if (estEditoriale(collection) && vus.includes(distribution.contenus[collection].publie))
		return (await seulementPublies(collection, vus)) ? 'publies' : 'incoherent'
	return 'incoherent'
}

/** Whether every one of these documents is published, read in the database without access control. */
async function seulementPublies(collection: CollectionEditoriale, ids: number[]): Promise<boolean> {
	const payload = await payloadDeTest()
	const { docs } = await payload.find({ collection, depth: 0, limit: ids.length, where: { id: { in: ids } } })
	return docs.length === ids.length && docs.every(({ _status }) => _status === 'published')
}

async function lire(voie: Voie, acteur: Acteur, ligne: Ligne, distribution: Distribution): Promise<Issue> {
	const id = documentDe(distribution, ligne)
	const reponse = await demander(voie, acteur, { ...ligne, id })
	if (!reponse.autorise) return 'refuse'
	const corps = reponse.corps as Record<string, unknown>
	if (corps.id !== id) return 'incoherent'
	if (ligne.champ === undefined) return 'autorise'
	// Payload strips a field its reader may not read; a field it keeps holds the stored value.
	if (!(ligne.champ in corps)) return 'absent'
	return egaux(corps[ligne.champ], (await stocke(ligne.collection, id))?.[ligne.champ]) ? 'visible' : 'incoherent'
}

async function creer(voie: Voie, acteur: Acteur, ligne: Ligne): Promise<Issue> {
	const payload = await payloadDeTest()
	const donnees = await PORTRAITS[ligne.collection].donneesDeCreation(acteur, payload)
	const avant = (await payload.count({ collection: ligne.collection })).totalDocs
	const reponse = await demander(voie, acteur, { ...ligne, donnees })
	const apres = (await payload.count({ collection: ligne.collection })).totalDocs
	if (reponse.autorise) return apres > avant ? 'autorise' : 'incoherent'
	return apres === avant ? 'refuse' : 'incoherent'
}

/** A value of a line, with `{ compteDe: role }` replaced by the account of that role. */
function valeurDe(valeur: unknown, distribution: Distribution): unknown {
	if (typeof valeur !== 'object' || valeur === null || !('compteDe' in valeur)) return valeur
	return distribution[(valeur as { compteDe: RoleAvecCompte }).compteDe].documents.pros
}

/** The sessions stored on an account of the makeup artists, as the database holds them. */
async function sessionsDuCompte(collection: string, id: number): Promise<unknown[] | undefined> {
	if (collection !== 'pros') return undefined
	const payload = await payloadDeTest()
	const ligne = await payload.db.findOne<{ id: number; sessions?: unknown[] }>({
		collection: 'pros',
		where: { id: { equals: id } },
	})
	return ligne?.sessions
}

async function modifier(voie: Voie, acteur: Acteur, ligne: Ligne, distribution: Distribution): Promise<Issue> {
	const portrait = PORTRAITS[ligne.collection]
	const id = documentDe(distribution, ligne)
	const champ = ligne.champ ?? portrait.champ
	const valeur = ligne.champ ? valeurDe(ligne.valeur, distribution) : portrait.nouvelleValeur()
	const avant = (await stocke(ligne.collection, id))?.[champ]
	const sessions = await sessionsDuCompte(ligne.collection, id)
	const reponse = await demander(voie, acteur, { ...ligne, id, donnees: { [champ]: valeur } })
	const apres = (await stocke(ligne.collection, id))?.[champ]
	if (!egaux(apres, avant)) {
		// Put the cast back as it was, whatever the line found.
		const payload = await payloadDeTest()
		await payload.update({ collection: ligne.collection, id, data: { [champ]: avant } })
		// Blocking an account closes its sessions (ticket 089): the cast gets its own back.
		if (sessions !== undefined)
			await payload.db.updateOne({ collection: 'pros', id, data: { sessions }, returning: false })
	}
	if (reponse.autorise && egaux(apres, valeur) && !egaux(avant, valeur)) return 'autorise'
	if (reponse.autorise && egaux(apres, avant)) return 'ignore'
	if (!reponse.autorise && egaux(apres, avant)) return 'refuse'
	return 'incoherent'
}

async function supprimer(voie: Voie, acteur: Acteur, ligne: Ligne, distribution: Distribution): Promise<Issue> {
	const payload = await payloadDeTest()
	// A deletion that must succeed acts on a throwaway document: the cast stays whole.
	const id =
		ligne.attendu === 'autorise'
			? await PORTRAITS[ligne.collection].jetable(payload, acteur)
			: documentDe(distribution, ligne)
	const reponse = await demander(voie, acteur, { ...ligne, id })
	const reste = (await stocke(ligne.collection, id)) !== undefined
	if (reponse.autorise) return reste ? 'incoherent' : 'autorise'
	return reste ? 'refuse' : 'incoherent'
}

/** Plays one line of the matrix through one way in, and says what happened. */
export function jouer(ligne: Ligne, voie: Voie, distribution: Distribution): Promise<Issue> {
	const acteur = distribution[ligne.role]
	switch (ligne.operation) {
		case 'lister':
			return lister(voie, acteur, ligne, distribution)
		case 'lire':
			return lire(voie, acteur, ligne, distribution)
		case 'creer':
			return creer(voie, acteur, ligne)
		case 'modifier':
			return modifier(voie, acteur, ligne, distribution)
		case 'supprimer':
			return supprimer(voie, acteur, ligne, distribution)
	}
}

/** The name of a line in the test report: who, what, on which document, what must happen. */
export function nommer(ligne: Ligne, voie: Voie): string {
	const document = ligne.document ? ` le document de « ${ligne.document} »` : ''
	const valeur = ligne.operation === 'modifier' ? ` = ${JSON.stringify(ligne.valeur)}` : ''
	const champ = ligne.champ ? ` (${ligne.champ}${valeur})` : ''
	const par = voie === 'rest' ? 'REST' : 'API locale'
	return `${ligne.collection} · ${ligne.role} · ${ligne.operation}${document}${champ} → ${ligne.attendu} · ${par}`
}
