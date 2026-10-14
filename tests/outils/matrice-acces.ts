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
 *   `tous` (every document of the cast).
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
 * The documents of an editorial collection (talents) belong to nobody: the cast holds one
 * published and one draft, which a line names by their state, `publie` or `brouillon`.
 */

import { randomUUID } from 'node:crypto'
import type { Payload, RequiredDataFromCollectionSlug, Where } from 'payload'
import { CONTEXTE_SANS_PROFIL } from '@/collections/Profils'
import { PROFILS_PUBLIES } from '@/lib/acces'
import { STATUT_INITIAL, STATUT_PUBLIE } from '@/lib/profil/statut'
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
export const COLLECTIONS = ['admins', 'pros', 'profils', 'media', 'talents'] as const
export type CollectionDeLaMatrice = (typeof COLLECTIONS)[number]

/**
 * The editorial collections (src/collections/redaction.ts): written by the newsroom, read by the
 * public when published. Nobody owns their documents.
 */
export const COLLECTIONS_EDITORIALES = ['talents'] as const satisfies readonly CollectionDeLaMatrice[]
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
	 * owns it, or, on an editorial collection, by its state.
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

export type Distribution = Record<Role, Acteur> & { contenus: Contenus }

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
	(await payload.find({ collection: 'profils', depth: 0, limit: 1, where: { pro: { equals: compte } } })).docs[0]?.id

/** A talent with made-up content, in the state asked for: what the newsroom writes. */
const talent = (etat: Etat): RequiredDataFromCollectionSlug<'talents'> => ({
	title: nom('Talent'),
	slug: `talent-${randomUUID()}`,
	description: 'Une page fictive de la matrice d’accès.',
	content: '## Un talent\n\nUne page fictive de la matrice d’accès.\n',
	_status: etat === 'publie' ? 'published' : 'draft',
})

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
			Promise.resolve({ email: adresse('cree'), password: motDePasseAleatoire(), role: 'redaction' }),
		jetable: async payload =>
			(
				await payload.create({
					collection: 'admins',
					data: { email: adresse('jetable'), password: motDePasseAleatoire(), role: 'redaction' },
				})
			).id,
	},
	pros: {
		champ: 'nom',
		nouvelleValeur: () => nom('Renommée'),
		donneesDeCreation: () => Promise.resolve(compteDeMaquilleuse('cree')),
		// Without a profile: an account that still has one is not deleted (its profile goes first).
		jetable: payload => compteSansProfil(payload, 'jetable'),
	},
	profils: {
		champ: 'prenom',
		nouvelleValeur: () => nom('Prénom'),
		// A profile for the actor's own account when it has none, else for a new account without one.
		donneesDeCreation: async (acteur, payload) => ({
			pro:
				acteur.utilisateur?.collection === 'pros' && acteur.documents.profils === undefined
					? acteur.utilisateur.id
					: await compteSansProfil(payload, 'cree'),
		}),
		jetable: async payload =>
			(
				await payload.create({
					collection: 'profils',
					// The slug is not given: the collection computes it.
					data: { pro: await compteSansProfil(payload, 'jetable') } as RequiredDataFromCollectionSlug<'profils'>,
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
	talents: {
		champ: 'title',
		nouvelleValeur: () => nom('Titre'),
		// Created published: creating and publishing in one request.
		donneesDeCreation: () => Promise.resolve(talent('publie')),
		jetable: async payload => (await payload.create({ collection: 'talents', data: talent('publie') })).id,
	},
}

/** A media sent for this account (a photo with its owner), or for nobody, as for an article. */
async function mediaDe(payload: Payload, proprietaire: number | undefined): Promise<number> {
	const data = proprietaire === undefined ? {} : { owner: proprietaire }
	return (await payload.create({ collection: 'media', data, file: fichierPourPayload(nomDePhoto('distribution')) })).id
}

/** One document per state, in each editorial collection, written without access control. */
async function creerLesContenus(payload: Payload): Promise<Contenus> {
	const creer = async (etat: Etat) => (await payload.create({ collection: 'talents', data: talent(etat) })).id
	return { talents: { publie: await creer('publie'), brouillon: await creer('brouillon') } }
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
			const documents = { [compte.collection]: id, ...(profil === undefined ? {} : { profils: profil }) }
			return { role, enTetes: compte.session.enTetes, utilisateur, documents }
		})
	)
	const anonyme: Acteur = { role: 'anonyme', enTetes: {}, documents: {} }
	const entrees = [['anonyme', anonyme], ...acteurs.map(acteur => [acteur.role, acteur])]
	const parRole = Object.fromEntries(entrees) as Record<Role, Acteur>
	// A's profile is published by an admin; B's stays a draft, held there by an admin: with a photo,
	// the rule of ticket 044 would publish it. Both statuses are fixed, so that no line moves them.
	// Each of them has a photo of her own, the main photo of her profile (ticket 043).
	for (const role of ['maquilleuse', 'autreMaquilleuse'] as const) {
		const acteur = parRole[role]
		const profil = acteur.documents.profils
		if (profil === undefined) throw new Error(`La distribution n’a pas de profil pour « ${role} ».`)
		acteur.documents.media = await mediaDe(payload, acteur.documents.pros)
		const statut = role === 'maquilleuse' ? { statut: STATUT_PUBLIE } : { statut: STATUT_INITIAL, statutFixe: true }
		await payload.update({
			collection: 'profils',
			id: profil,
			data: { ...statut, photoPrincipale: acteur.documents.media },
		})
	}
	return { ...parRole, contenus: await creerLesContenus(payload) }
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

/** The document a line names in its collection: the one of a role, or, on an editorial collection, the one of a state. */
function documentDe(distribution: Distribution, ligne: Ligne): number {
	const { collection, document } = ligne
	const id =
		document === undefined
			? undefined
			: estUnEtat(document)
				? estEditoriale(collection)
					? distribution.contenus[collection][document]
					: undefined
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
	const distribues = [...ROLES.flatMap(role => distribution[role].documents[collection] ?? []), ...contenus]
	const publics = await publicsDe(collection, distribues)
	const siensEtPublics = [...new Set([...siens, ...publics])].sort((a, b) => a - b)
	if (vus.length === 0) return 'aucun'
	if (egaux(vus, siens)) return 'soi'
	if (egaux(vus, publics)) return 'publies'
	if (egaux(vus, siensEtPublics)) return 'soiEtPublies'
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

async function modifier(voie: Voie, acteur: Acteur, ligne: Ligne, distribution: Distribution): Promise<Issue> {
	const portrait = PORTRAITS[ligne.collection]
	const id = documentDe(distribution, ligne)
	const champ = ligne.champ ?? portrait.champ
	const valeur = ligne.champ ? valeurDe(ligne.valeur, distribution) : portrait.nouvelleValeur()
	const avant = (await stocke(ligne.collection, id))?.[champ]
	const reponse = await demander(voie, acteur, { ...ligne, id, donnees: { [champ]: valeur } })
	const apres = (await stocke(ligne.collection, id))?.[champ]
	if (!egaux(apres, avant)) {
		// Put the cast back as it was, whatever the line found.
		const payload = await payloadDeTest()
		await payload.update({ collection: ligne.collection, id, data: { [champ]: avant } })
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
