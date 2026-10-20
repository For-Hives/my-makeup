/**
 * The inventory of the fake Strapi source: each case of the real database it carries, in numbers.
 *
 * It is computed from rows and from the keys of the storage, whatever they come from: the rows
 * read back from the source by its read-only role (tests/support/source-strapi.ts), or the rows of
 * the definition itself (donnees.ts). The two must give the same inventory, and both must give the
 * table of docs/tests/source-strapi.md.
 *
 * A profile is read with the rules of the v3 (src/lib/): its slug, its price, its city, its
 * completeness. No rule is written again here.
 */

import { parsePrice } from '@/lib/price'
import { completeness, type ProfileFields, usableCity } from '@/lib/profile/completeness'
import { DESCRIPTION_MAX_LENGTH, endMessage, NAME_MAX_LENGTH, obtainMessage, textMessage } from '@/lib/profile/lists'
import { publicPlace } from '@/lib/profile/public-place'
import { assignSlugs, fallbackSlug, slugify } from '@/lib/slug'
import { CITY_HOMONYMS, FIXTURE_ACCOUNTS, type Line, PROFILES_WITHOUT_OWNER, TYPE_PROFILE, type Value } from './data'
import type { TableName } from './schema'

/** What the inventory reads. */
export interface SourceState {
	lignes: Readonly<Record<TableName, readonly Line[]>>
	/** The keys of the objects the storage holds. */
	objets: ReadonlySet<string>
	/** The public address of the storage: the URL of a file is this, « / », then the key of its object. */
	medias: string
}

export interface InventoryLine {
	groupe: string
	cas: string
	/** The same count on the real database, 13/10/2026; « — » when it was not measured that day. */
	reel: string
	nombre: number
}

/** A complete bcrypt hash: version, cost, 22 characters of salt and 31 of hash. */
export const HASH_BCRYPT_FULL = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

const TYPE_ARTICLE = 'api::article.article'
const TYPE_TALENT = 'api::talent.talent'

/** The table of each component type, as `component_type` names it in the link tables. */
const COMPONENT_TABLE: Readonly<Record<string, TableName>> = {
	'makeupartists.skills': 'components_makeupartists_skills',
	'makeupartists.experiences': 'components_makeupartists_experiences',
	'makeupartists.courses': 'components_makeupartists_courses',
	'makeupartists.language': 'components_makeupartists_languages',
	'makeupartists.network': 'components_makeupartists_networks',
	'makeupartists.service-offers': 'components_makeupartists_service_offers',
	'service-offers.options': 'components_service_offers_options',
}

const LINK_TABLES: readonly TableName[] = [
	'makeup_artistes_components',
	'components_makeupartists_service_offers_components',
]

const text = (valeur: Value | undefined): string | null => (typeof valeur === 'string' ? valeur : null)
const count = (valeur: Value | undefined): number | null => {
	if (typeof valeur === 'number') return valeur
	return typeof valeur === 'string' && valeur.trim() !== '' && Number.isFinite(Number(valeur)) ? Number(valeur) : null
}
const filled = (valeur: Value | undefined): boolean => (text(valeur)?.trim() ?? '') !== ''
const idOf = (ligne: Line): number => count(ligne.id) ?? Number.NaN

/** How many values are carried by more than one row, and how many rows carry them. */
function duplicates(valeurs: readonly (string | null)[]): { valeurs: number; lignes: number } {
	const accounts = new Map<string, number>()
	for (const value of valeurs) if (value) accounts.set(value, (accounts.get(value) ?? 0) + 1)
	const multiples = [...accounts.values()].filter(n => n > 1)
	return { valeurs: multiples.length, lignes: multiples.reduce((somme, n) => somme + n, 0) }
}

/** Everything the counts read, worked out once from the rows. */
function read(etat: SourceState) {
	const { lignes: lines, objets: objects, medias: media } = etat
	const accounts = lines.up_users
	const profiles = lines.makeup_artistes
	const accountIds = new Set(accounts.map(idOf))
	const profileIds = new Set(profiles.map(idOf))
	const accountLinks = lines.makeup_artistes_user_links.filter(
		lien => profileIds.has(count(lien.makeup_artiste_id) ?? -1) && accountIds.has(count(lien.user_id) ?? -1)
	)
	const linkedProfiles = new Set(accountLinks.map(lien => count(lien.makeup_artiste_id)))
	const linkedAccounts = new Set(accountLinks.map(lien => count(lien.user_id)))

	const byId = new Map<TableName, Map<number, Line>>()
	for (const table of Object.values(COMPONENT_TABLE))
		byId.set(table, new Map(lines[table].map(ligne => [idOf(ligne), ligne])))

	// The rows of each list: link table, entry, field; ordered by `order`, as Strapi reads them.
	const lists = new Map<string, { liens: Line[]; lignes: Line[] }>()
	const lies = new Map<TableName, Set<number>>()
	for (const linkTable of LINK_TABLES)
		for (const link of lines[linkTable]) {
			const table = COMPONENT_TABLE[text(link.component_type) ?? '']
			if (!table) continue
			const componentId = count(link.component_id) ?? -1
			lies.set(table, (lies.get(table) ?? new Set()).add(componentId))
			const key = `${linkTable}|${count(link.entity_id)}|${text(link.field)}`
			const list = lists.get(key) ?? { liens: [], lignes: [] }
			list.liens.push(link)
			lists.set(key, list)
		}
	for (const [key, list] of lists) {
		list.liens.sort((a, b) => (count(a.order) ?? 0) - (count(b.order) ?? 0) || idOf(a) - idOf(b))
		list.lignes = list.liens.flatMap(lien => {
			const table = COMPONENT_TABLE[text(lien.component_type) ?? '']
			const line = table ? byId.get(table)?.get(count(lien.component_id) ?? -1) : undefined
			return line ? [line] : []
		})
		lists.set(key, list)
	}
	const listOf = (profil: number, champ: string): Line[] =>
		lists.get(`makeup_artistes_components|${profil}|${champ}`)?.lignes ?? []

	// File links: those that name an entry that still exists, and those whose entry is gone.
	const liveEntries = new Map<string, Set<number>>([
		[TYPE_PROFILE, profileIds],
		[TYPE_ARTICLE, new Set(lines.articles.map(idOf))],
		[TYPE_TALENT, new Set(lines.talents.map(idOf))],
	])
	const live = (lien: Line): boolean =>
		liveEntries.get(text(lien.related_type) ?? '')?.has(count(lien.related_id) ?? -1) ?? false
	const fileLinks = lines.files_related_morphs
	const liveLinks = fileLinks.filter(live)
	const files = new Map(lines.files.map(fichier => [idOf(fichier), fichier]))
	const profileFiles = [
		...new Set(
			liveLinks.filter(lien => text(lien.related_type) === TYPE_PROFILE).map(lien => count(lien.file_id) ?? -1)
		),
	].flatMap((id): Line[] => {
		const file = files.get(id)
		return file ? [file] : []
	})
	const keyOf = (url: Value | undefined): string | null => {
		const address = text(url)
		return address?.startsWith(`${media}/`) ? address.slice(media.length + 1) : null
	}

	const profileFields = (profil: Line): ProfileFields => {
		const id = idOf(profil)
		const photos = (champ: string) =>
			liveLinks
				.filter(
					lien => count(lien.related_id) === id && text(lien.related_type) === TYPE_PROFILE && lien.field === champ
				)
				.map(lien => ({ id: count(lien.file_id) }))
		const [main] = photos('main_picture')
		const gallery = photos('image_gallery')
		const [network] = listOf(id, 'network')
		return {
			first_name: text(profil.first_name),
			last_name: text(profil.last_name),
			speciality: text(profil.speciality),
			company_artist_name: text(profil.company_artist_name),
			city: text(profil.city),
			description: text(profil.description),
			main_picture: main ?? null,
			image_gallery: gallery.length > 0 ? gallery : null,
			skills: listOf(id, 'skills'),
			experiences: listOf(id, 'experiences'),
			courses: listOf(id, 'courses'),
			language: listOf(id, 'language'),
			service_offers: listOf(id, 'service_offers').map(offre => ({ price: text(offre.price) })),
			network: network
				? Object.fromEntries(
						['youtube', 'instagram', 'facebook', 'website', 'linkedin', 'phone', 'email'].map(canal => [
							canal,
							text(network[canal]),
						])
					)
				: null,
		}
	}
	const readings = profiles.map(profil => ({ profil, completude: completeness(profileFields(profil)) }))

	return {
		...etat,
		comptes: accounts,
		profils: profiles,
		comptesRelies: linkedAccounts,
		profilsRelies: linkedProfiles,
		lies,
		listes: lists,
		liensDeFichiers: fileLinks,
		liensVivants: liveLinks,
		fichiers: lines.files,
		fichiersDesProfils: profileFiles,
		cleDe: keyOf,
		lectures: readings,
		objets: objects,
	}
}

type Reading = ReturnType<typeof read>

type Case = readonly [groupe: string, cas: string, reel: string, compter: (lecture: Reading) => number]

const price = (l: Reading) =>
	[...l.lignes.components_makeupartists_service_offers, ...l.lignes.components_service_offers_options].map(ligne =>
		parsePrice(ligne.price)
	)

const identicalLines = (lignes: readonly Line[]): number => {
	const seen = lignes.map(({ id: _id, ...reste }) => JSON.stringify(reste))
	return seen.length - new Set(seen).size
}

const C = 'Comptes'
const P = 'Profils'
const L = 'Listes'
const F = 'Fichiers'
const A = 'Articles et talents'

/** Every case, in the order of the table of docs/tests/source-strapi.md. */
export const CASE: readonly Case[] = [
	[C, 'Comptes', '91', l => l.comptes.length],
	[C, 'Comptes `local`', '42', l => l.comptes.filter(c => c.provider === 'local').length],
	[C, 'Comptes `google`', '40', l => l.comptes.filter(c => c.provider === 'google').length],
	[C, 'Comptes `facebook`', '9', l => l.comptes.filter(c => c.provider === 'facebook').length],
	[
		C,
		'Comptes avec un hash bcrypt complet',
		'43',
		l => l.comptes.filter(c => HASH_BCRYPT_FULL.test(text(c.password) ?? '')).length,
	],
	[
		C,
		'… dont des comptes `google`',
		'1',
		l => l.comptes.filter(c => c.provider === 'google' && HASH_BCRYPT_FULL.test(text(c.password) ?? '')).length,
	],
	[
		C,
		'… dont des comptes de fixture, au mot de passe connu',
		'—',
		l =>
			l.comptes.filter(
				c => FIXTURE_ACCOUNTS.some(f => f.strapiId === idOf(c)) && HASH_BCRYPT_FULL.test(text(c.password) ?? '')
			).length,
	],
	[C, 'Comptes sans mot de passe', '48', l => l.comptes.filter(c => !filled(c.password)).length],
	[C, 'Comptes confirmés', '91', l => l.comptes.filter(c => c.confirmed === true).length],
	[C, 'Comptes bloqués', '0', l => l.comptes.filter(c => c.blocked === true).length],
	[
		C,
		'Adresses email portées par plusieurs comptes',
		'1',
		l => duplicates(l.comptes.map(c => text(c.email)?.trim().toLowerCase() ?? null)).valeurs,
	],
	[
		C,
		'… comptes qui portent ces adresses',
		'4',
		l => duplicates(l.comptes.map(c => text(c.email)?.trim().toLowerCase() ?? null)).lignes,
	],
	[
		C,
		'Emails avec des majuscules ou des espaces de bord',
		'—',
		l => l.comptes.filter(c => (text(c.email) ?? '') !== (text(c.email) ?? '').trim().toLowerCase()).length,
	],
	[
		C,
		'Noms (`username`) portés par plusieurs comptes',
		'2',
		l => duplicates(l.comptes.map(c => text(c.username))).valeurs,
	],
	[C, '… comptes qui portent ces noms', '4', l => duplicates(l.comptes.map(c => text(c.username))).lignes],
	[C, 'Comptes sans profil', '3', l => l.comptes.filter(c => !l.comptesRelies.has(idOf(c))).length],

	[P, 'Profils', '101', l => l.profils.length],
	[P, 'Profils reliés à un compte', '88', l => l.profilsRelies.size],
	[
		P,
		'Profils sans compte, dans la liste des 13 écartés',
		'13',
		l =>
			l.profils.filter(
				p => !l.profilsRelies.has(idOf(p)) && (PROFILES_WITHOUT_OWNER as readonly number[]).includes(idOf(p))
			).length,
	],
	[
		P,
		'Profils sans compte, hors de cette liste',
		'0',
		l =>
			l.profils.filter(
				p => !l.profilsRelies.has(idOf(p)) && !(PROFILES_WITHOUT_OWNER as readonly number[]).includes(idOf(p))
			).length,
	],
	[
		P,
		'Profils entièrement vides reliés à un compte',
		'26',
		l =>
			l.lectures.filter(({ profil, completude }) => l.profilsRelies.has(idOf(profil)) && completude.entierementVide)
				.length,
	],
	[P, 'Profils actifs', '41', l => l.lectures.filter(({ completude }) => completude.actif).length],
	[P, 'Profils publiables', '15', l => l.lectures.filter(({ completude }) => completude.publiable).length],
	[P, '`available` vrai', '48', l => l.profils.filter(p => p.available === true).length],
	[P, '`available` faux', '5', l => l.profils.filter(p => p.available === false).length],
	[P, '`available` nul', '48', l => l.profils.filter(p => p.available === null || p.available === undefined).length],
	[P, '`pro` vrai (badge « Super maquilleuse »)', '1', l => l.profils.filter(p => p.pro === true).length],
	[
		P,
		'`username` qui n’est pas déjà son slug',
		'73',
		l => l.profils.filter(p => !filled(p.username) || slugify(p.username) !== p.username).length,
	],
	[
		P,
		'Slugs de profil en collision (suffixe `-2`)',
		'0',
		l =>
			assignSlugs(
				l.profils.map(p => ({ id: idOf(p), username: text(p.username), createdAt: String(p.created_at) }))
			).filter(p => p.slug !== (slugify(p.username) || fallbackSlug(p.id))).length,
	],
	[
		P,
		'Rayon d’action au-dessus de 200 km',
		'—',
		l => l.profils.filter(p => (count(p.action_radius) ?? 0) > 200).length,
	],
	[P, 'Ville vide ou nulle', '—', l => l.profils.filter(p => !filled(p.city)).length],
	[P, 'Ville lue comme une adresse postale', '—', l => l.profils.filter(p => publicPlace(p.city).adresse).length],
	[
		P,
		'Ville qui n’est pas une commune exploitable (pays, texte libre)',
		'—',
		l => l.profils.filter(p => filled(p.city) && !usableCity(p.city)).length,
	],
	[
		P,
		'Ville homonyme de plusieurs communes',
		'—',
		l => l.profils.filter(p => CITY_HOMONYMS.includes(text(p.city)?.trim() ?? '')).length,
	],

	[L, 'Compétences', '200', l => l.lignes.components_makeupartists_skills.length],
	[L, 'Expériences', '57', l => l.lignes.components_makeupartists_experiences.length],
	[L, 'Formations', '47', l => l.lignes.components_makeupartists_courses.length],
	[L, 'Langues', '65', l => l.lignes.components_makeupartists_languages.length],
	[L, 'Réseaux', '101', l => l.lignes.components_makeupartists_networks.length],
	[L, 'Prestations', '118', l => l.lignes.components_makeupartists_service_offers.length],
	[L, 'Options de prestation', '23', l => l.lignes.components_service_offers_options.length],
	[
		L,
		'Lignes de liste qu’aucun lien ne rattache',
		'3',
		l =>
			Object.values(COMPONENT_TABLE).reduce(
				(somme, table) => somme + l.lignes[table].filter(ligne => !l.lies.get(table)?.has(idOf(ligne))).length,
				0
			),
	],
	[
		L,
		'Lignes identiques dans une même liste',
		'—',
		l => [...l.listes.values()].reduce((somme, liste) => somme + identicalLines(liste.lignes), 0),
	],
	[
		L,
		'Listes rangées par `order` dans un autre ordre que leurs liens',
		'—',
		l =>
			[...l.listes.values()].filter(({ liens }) =>
				liens.some((lien, rang) => rang > 0 && idOf(lien) < idOf(liens[rang - 1] ?? lien))
			).length,
	],
	[
		L,
		'Réseaux avec un téléphone ou un email de contact',
		'—',
		l => l.lignes.components_makeupartists_networks.filter(r => filled(r.phone) || filled(r.email)).length,
	],
	[
		L,
		'Prix écrits sans nombre lisible (prestations et options)',
		'—',
		l => price(l).filter(p => p.priceText !== null && p.priceFrom === null).length,
	],
	[L, 'Prix vides ou nuls (prestations et options)', '—', l => price(l).filter(p => p.priceText === null).length],
	[
		L,
		'Expériences dont la fin précède le début (hors des bornes de la v3)',
		'—',
		l =>
			l.lignes.components_makeupartists_experiences.filter(e => endMessage(e.date_end, e.date_start) !== null).length,
	],
	[
		L,
		'Formations obtenues plus d’un an après le jour (hors des bornes de la v3)',
		'—',
		l =>
			l.lignes.components_makeupartists_courses.filter(f => obtainMessage(f.date_graduation, new Date()) !== null)
				.length,
	],
	[
		L,
		'Options dont le nom dépasse 70 caractères (hors des bornes de la v3)',
		'—',
		l => l.lignes.components_service_offers_options.filter(o => textMessage(o.name, NAME_MAX_LENGTH) !== null).length,
	],
	[
		L,
		'Prestations dont la description dépasse 2 000 caractères (hors des bornes de la v3)',
		'—',
		l =>
			l.lignes.components_makeupartists_service_offers.filter(
				p => textMessage(p.description, DESCRIPTION_MAX_LENGTH) !== null
			).length,
	],

	[F, 'Fichiers', '574', l => l.fichiers.length],
	[F, 'Fichiers désignés par un profil', '249', l => l.fichiersDesProfils.length],
	[
		F,
		'… comme photo principale',
		'49',
		l => l.liensVivants.filter(lien => lien.related_type === TYPE_PROFILE && lien.field === 'main_picture').length,
	],
	[
		F,
		'… dans une galerie',
		'200',
		l => l.liensVivants.filter(lien => lien.related_type === TYPE_PROFILE && lien.field === 'image_gallery').length,
	],
	[
		F,
		'… qui ne sont pas des images',
		'1',
		l => l.fichiersDesProfils.filter(f => !(text(f.mime) ?? '').startsWith('image/')).length,
	],
	[
		F,
		'… dont l’objet manque dans le stockage',
		'1',
		l =>
			l.fichiersDesProfils.filter(f => {
				const key = l.cleDe(f.url)
				return key === null || !l.objets.has(key)
			}).length,
	],
	[
		F,
		'Formats dérivés des fichiers désignés',
		'242',
		l =>
			l.fichiersDesProfils.reduce(
				(somme, f) => somme + (f.formats && typeof f.formats === 'object' ? Object.keys(f.formats).length : 0),
				0
			),
	],
	[
		F,
		'Fichiers désignés par un article',
		'0',
		l => l.liensVivants.filter(lien => lien.related_type === TYPE_ARTICLE).length,
	],
	[
		F,
		'Fichiers à la racine du stockage',
		'134',
		l => l.fichiers.filter(f => !(l.cleDe(f.url) ?? '/').includes('/')).length,
	],
	[
		F,
		'Fichiers sous le préfixe `1/`',
		'440',
		l => l.fichiers.filter(f => (l.cleDe(f.url) ?? '').startsWith('1/')).length,
	],
	[F, 'Liens de fichier vers une entrée disparue', '7', l => l.liensDeFichiers.length - l.liensVivants.length],
	[
		F,
		'Fichiers sans aucun lien',
		'318',
		l => l.fichiers.filter(f => !l.liensDeFichiers.some(lien => count(lien.file_id) === idOf(f))).length,
	],
	[F, 'Fichiers avec `uploaded_by` rempli', '—', l => l.fichiers.filter(f => count(f.uploaded_by) !== null).length],

	[A, 'Articles', '10', l => l.lignes.articles.length],
	[A, 'Articles publiés', '10', l => l.lignes.articles.filter(a => a.published_at !== null).length],
	[A, 'Talents', '14', l => l.lignes.talents.length],
	[A, 'Talents publiés', '14', l => l.lignes.talents.filter(t => t.published_at !== null).length],
]

/** The inventory of a state of the source, case by case. */
export function inventory(etat: SourceState): InventoryLine[] {
	const reading = read(etat)
	return CASE.map(([groupe, cas, reel, compter]) => ({ groupe, cas, reel, nombre: compter(reading) }))
}

/** The inventory as the Markdown table of docs/tests/source-strapi.md. */
export function inventoryInMarkdown(lignes: readonly InventoryLine[]): string {
	return [
		'| Groupe | Cas | Base réelle, 13/10/2026 | Fausse base |',
		'|---|---|---|---|',
		...lignes.map(({ groupe, cas, reel, nombre: count }) => `| ${groupe} | ${cas} | ${reel} | ${count} |`),
	].join('\n')
}
