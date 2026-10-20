/**
 * The inventory of the fake Strapi source: each case of the real database it carries, in numbers.
 *
 * It is computed from rows and from the keys of the storage, whatever they come from: the rows
 * read back from the source by its read-only role (tests/outils/source-strapi.ts), or the rows of
 * the definition itself (donnees.ts). The two must give the same inventory, and both must give the
 * table of docs/tests/source-strapi.md.
 *
 * A profile is read with the rules of the v3 (src/lib/): its slug, its price, its city, its
 * completeness. No rule is written again here.
 */

import { parsePrice } from '@/lib/prix'
import { type ProfileFields, completeness, usableCity } from '@/lib/profile/completeness'
import { publicPlace } from '@/lib/profile/public-place'
import {
	DESCRIPTION_MAX_LENGTH,
	NAME_MAX_LENGTH,
	endMessage,
	textMessage,
	obtainMessage,
} from '@/lib/profile/lists'
import { attribuerSlugs, slugDeRepli, slugifier } from '@/lib/slug'
import {
	COMPTES_DE_FIXTURE,
	type Ligne,
	PROFILS_SANS_PROPRIETAIRE,
	TYPE_PROFIL,
	type Valeur,
	VILLES_HOMONYMES,
} from './donnees'
import type { NomDeTable } from './schema'

/** What the inventory reads. */
export interface EtatDeLaSource {
	lignes: Readonly<Record<NomDeTable, readonly Ligne[]>>
	/** The keys of the objects the storage holds. */
	objets: ReadonlySet<string>
	/** The public address of the storage: the URL of a file is this, « / », then the key of its object. */
	medias: string
}

export interface LigneDInventaire {
	groupe: string
	cas: string
	/** The same count on the real database, 13/10/2026; « — » when it was not measured that day. */
	reel: string
	nombre: number
}

/** A complete bcrypt hash: version, cost, 22 characters of salt and 31 of hash. */
export const HASH_BCRYPT_COMPLET = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

const TYPE_ARTICLE = 'api::article.article'
const TYPE_TALENT = 'api::talent.talent'

/** The table of each component type, as `component_type` names it in the link tables. */
const TABLE_DU_COMPOSANT: Readonly<Record<string, NomDeTable>> = {
	'makeupartists.skills': 'components_makeupartists_skills',
	'makeupartists.experiences': 'components_makeupartists_experiences',
	'makeupartists.courses': 'components_makeupartists_courses',
	'makeupartists.language': 'components_makeupartists_languages',
	'makeupartists.network': 'components_makeupartists_networks',
	'makeupartists.service-offers': 'components_makeupartists_service_offers',
	'service-offers.options': 'components_service_offers_options',
}

const TABLES_DE_LIENS: readonly NomDeTable[] = [
	'makeup_artistes_components',
	'components_makeupartists_service_offers_components',
]

const texte = (valeur: Valeur | undefined): string | null => (typeof valeur === 'string' ? valeur : null)
const nombre = (valeur: Valeur | undefined): number | null => {
	if (typeof valeur === 'number') return valeur
	return typeof valeur === 'string' && valeur.trim() !== '' && Number.isFinite(Number(valeur)) ? Number(valeur) : null
}
const rempli = (valeur: Valeur | undefined): boolean => (texte(valeur)?.trim() ?? '') !== ''
const idDe = (ligne: Ligne): number => nombre(ligne.id) ?? Number.NaN

/** How many values are carried by more than one row, and how many rows carry them. */
function doublons(valeurs: readonly (string | null)[]): { valeurs: number; lignes: number } {
	const comptes = new Map<string, number>()
	for (const valeur of valeurs) if (valeur) comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1)
	const multiples = [...comptes.values()].filter(n => n > 1)
	return { valeurs: multiples.length, lignes: multiples.reduce((somme, n) => somme + n, 0) }
}

/** Everything the counts read, worked out once from the rows. */
function lire(etat: EtatDeLaSource) {
	const { lignes, objets, medias } = etat
	const comptes = lignes.up_users
	const profils = lignes.makeup_artistes
	const idsDesComptes = new Set(comptes.map(idDe))
	const idsDesProfils = new Set(profils.map(idDe))
	const liensDeComptes = lignes.makeup_artistes_user_links.filter(
		lien => idsDesProfils.has(nombre(lien.makeup_artiste_id) ?? -1) && idsDesComptes.has(nombre(lien.user_id) ?? -1)
	)
	const profilsRelies = new Set(liensDeComptes.map(lien => nombre(lien.makeup_artiste_id)))
	const comptesRelies = new Set(liensDeComptes.map(lien => nombre(lien.user_id)))

	const parId = new Map<NomDeTable, Map<number, Ligne>>()
	for (const table of Object.values(TABLE_DU_COMPOSANT))
		parId.set(table, new Map(lignes[table].map(ligne => [idDe(ligne), ligne])))

	// The rows of each list: link table, entry, field; ordered by `order`, as Strapi reads them.
	const listes = new Map<string, { liens: Ligne[]; lignes: Ligne[] }>()
	const lies = new Map<NomDeTable, Set<number>>()
	for (const tableDeLiens of TABLES_DE_LIENS)
		for (const lien of lignes[tableDeLiens]) {
			const table = TABLE_DU_COMPOSANT[texte(lien.component_type) ?? '']
			if (!table) continue
			const idDuComposant = nombre(lien.component_id) ?? -1
			lies.set(table, (lies.get(table) ?? new Set()).add(idDuComposant))
			const cle = `${tableDeLiens}|${nombre(lien.entity_id)}|${texte(lien.field)}`
			const liste = listes.get(cle) ?? { liens: [], lignes: [] }
			liste.liens.push(lien)
			listes.set(cle, liste)
		}
	for (const [cle, liste] of listes) {
		liste.liens.sort((a, b) => (nombre(a.order) ?? 0) - (nombre(b.order) ?? 0) || idDe(a) - idDe(b))
		liste.lignes = liste.liens.flatMap(lien => {
			const table = TABLE_DU_COMPOSANT[texte(lien.component_type) ?? '']
			const ligne = table ? parId.get(table)?.get(nombre(lien.component_id) ?? -1) : undefined
			return ligne ? [ligne] : []
		})
		listes.set(cle, liste)
	}
	const listeDe = (profil: number, champ: string): Ligne[] =>
		listes.get(`makeup_artistes_components|${profil}|${champ}`)?.lignes ?? []

	// File links: those that name an entry that still exists, and those whose entry is gone.
	const entreesVivantes = new Map<string, Set<number>>([
		[TYPE_PROFIL, idsDesProfils],
		[TYPE_ARTICLE, new Set(lignes.articles.map(idDe))],
		[TYPE_TALENT, new Set(lignes.talents.map(idDe))],
	])
	const vivant = (lien: Ligne): boolean =>
		entreesVivantes.get(texte(lien.related_type) ?? '')?.has(nombre(lien.related_id) ?? -1) ?? false
	const liensDeFichiers = lignes.files_related_morphs
	const liensVivants = liensDeFichiers.filter(vivant)
	const fichiers = new Map(lignes.files.map(fichier => [idDe(fichier), fichier]))
	const fichiersDesProfils = [
		...new Set(
			liensVivants.filter(lien => texte(lien.related_type) === TYPE_PROFIL).map(lien => nombre(lien.file_id) ?? -1)
		),
	].flatMap((id): Ligne[] => {
		const fichier = fichiers.get(id)
		return fichier ? [fichier] : []
	})
	const cleDe = (url: Valeur | undefined): string | null => {
		const adresse = texte(url)
		return adresse?.startsWith(`${medias}/`) ? adresse.slice(medias.length + 1) : null
	}

	const champsDuProfil = (profil: Ligne): ProfileFields => {
		const id = idDe(profil)
		const photos = (champ: string) =>
			liensVivants
				.filter(
					lien => nombre(lien.related_id) === id && texte(lien.related_type) === TYPE_PROFIL && lien.field === champ
				)
				.map(lien => ({ id: nombre(lien.file_id) }))
		const [principale] = photos('main_picture')
		const galerie = photos('image_gallery')
		const [reseau] = listeDe(id, 'network')
		return {
			first_name: texte(profil.first_name),
			last_name: texte(profil.last_name),
			speciality: texte(profil.speciality),
			company_artist_name: texte(profil.company_artist_name),
			city: texte(profil.city),
			description: texte(profil.description),
			main_picture: principale ?? null,
			image_gallery: galerie.length > 0 ? galerie : null,
			skills: listeDe(id, 'skills'),
			experiences: listeDe(id, 'experiences'),
			courses: listeDe(id, 'courses'),
			language: listeDe(id, 'language'),
			service_offers: listeDe(id, 'service_offers').map(offre => ({ price: texte(offre.price) })),
			network: reseau
				? Object.fromEntries(
						['youtube', 'instagram', 'facebook', 'website', 'linkedin', 'phone', 'email'].map(canal => [
							canal,
							texte(reseau[canal]),
						])
					)
				: null,
		}
	}
	const lectures = profils.map(profil => ({ profil, completude: completeness(champsDuProfil(profil)) }))

	return {
		...etat,
		comptes,
		profils,
		comptesRelies,
		profilsRelies,
		lies,
		listes,
		liensDeFichiers,
		liensVivants,
		fichiers: lignes.files,
		fichiersDesProfils,
		cleDe,
		lectures,
		objets,
	}
}

type Lecture = ReturnType<typeof lire>

type Cas = readonly [groupe: string, cas: string, reel: string, compter: (lecture: Lecture) => number]

const prix = (l: Lecture) =>
	[...l.lignes.components_makeupartists_service_offers, ...l.lignes.components_service_offers_options].map(ligne =>
		parsePrice(ligne.price)
	)

const lignesIdentiques = (lignes: readonly Ligne[]): number => {
	const vues = lignes.map(({ id: _id, ...reste }) => JSON.stringify(reste))
	return vues.length - new Set(vues).size
}

const C = 'Comptes'
const P = 'Profils'
const L = 'Listes'
const F = 'Fichiers'
const A = 'Articles et talents'

/** Every case, in the order of the table of docs/tests/source-strapi.md. */
export const CAS: readonly Cas[] = [
	[C, 'Comptes', '91', l => l.comptes.length],
	[C, 'Comptes `local`', '42', l => l.comptes.filter(c => c.provider === 'local').length],
	[C, 'Comptes `google`', '40', l => l.comptes.filter(c => c.provider === 'google').length],
	[C, 'Comptes `facebook`', '9', l => l.comptes.filter(c => c.provider === 'facebook').length],
	[
		C,
		'Comptes avec un hash bcrypt complet',
		'43',
		l => l.comptes.filter(c => HASH_BCRYPT_COMPLET.test(texte(c.password) ?? '')).length,
	],
	[
		C,
		'… dont des comptes `google`',
		'1',
		l => l.comptes.filter(c => c.provider === 'google' && HASH_BCRYPT_COMPLET.test(texte(c.password) ?? '')).length,
	],
	[
		C,
		'… dont des comptes de fixture, au mot de passe connu',
		'—',
		l =>
			l.comptes.filter(
				c => COMPTES_DE_FIXTURE.some(f => f.strapiId === idDe(c)) && HASH_BCRYPT_COMPLET.test(texte(c.password) ?? '')
			).length,
	],
	[C, 'Comptes sans mot de passe', '48', l => l.comptes.filter(c => !rempli(c.password)).length],
	[C, 'Comptes confirmés', '91', l => l.comptes.filter(c => c.confirmed === true).length],
	[C, 'Comptes bloqués', '0', l => l.comptes.filter(c => c.blocked === true).length],
	[
		C,
		'Adresses email portées par plusieurs comptes',
		'1',
		l => doublons(l.comptes.map(c => texte(c.email)?.trim().toLowerCase() ?? null)).valeurs,
	],
	[
		C,
		'… comptes qui portent ces adresses',
		'4',
		l => doublons(l.comptes.map(c => texte(c.email)?.trim().toLowerCase() ?? null)).lignes,
	],
	[
		C,
		'Emails avec des majuscules ou des espaces de bord',
		'—',
		l => l.comptes.filter(c => (texte(c.email) ?? '') !== (texte(c.email) ?? '').trim().toLowerCase()).length,
	],
	[
		C,
		'Noms (`username`) portés par plusieurs comptes',
		'2',
		l => doublons(l.comptes.map(c => texte(c.username))).valeurs,
	],
	[C, '… comptes qui portent ces noms', '4', l => doublons(l.comptes.map(c => texte(c.username))).lignes],
	[C, 'Comptes sans profil', '3', l => l.comptes.filter(c => !l.comptesRelies.has(idDe(c))).length],

	[P, 'Profils', '101', l => l.profils.length],
	[P, 'Profils reliés à un compte', '88', l => l.profilsRelies.size],
	[
		P,
		'Profils sans compte, dans la liste des 13 écartés',
		'13',
		l =>
			l.profils.filter(
				p => !l.profilsRelies.has(idDe(p)) && (PROFILS_SANS_PROPRIETAIRE as readonly number[]).includes(idDe(p))
			).length,
	],
	[
		P,
		'Profils sans compte, hors de cette liste',
		'0',
		l =>
			l.profils.filter(
				p => !l.profilsRelies.has(idDe(p)) && !(PROFILS_SANS_PROPRIETAIRE as readonly number[]).includes(idDe(p))
			).length,
	],
	[
		P,
		'Profils entièrement vides reliés à un compte',
		'26',
		l =>
			l.lectures.filter(({ profil, completude }) => l.profilsRelies.has(idDe(profil)) && completude.entierementVide)
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
		l => l.profils.filter(p => !rempli(p.username) || slugifier(p.username) !== p.username).length,
	],
	[
		P,
		'Slugs de profil en collision (suffixe `-2`)',
		'0',
		l =>
			attribuerSlugs(
				l.profils.map(p => ({ id: idDe(p), username: texte(p.username), createdAt: String(p.created_at) }))
			).filter(p => p.slug !== (slugifier(p.username) || slugDeRepli(p.id))).length,
	],
	[
		P,
		'Rayon d’action au-dessus de 200 km',
		'—',
		l => l.profils.filter(p => (nombre(p.action_radius) ?? 0) > 200).length,
	],
	[P, 'Ville vide ou nulle', '—', l => l.profils.filter(p => !rempli(p.city)).length],
	[P, 'Ville lue comme une adresse postale', '—', l => l.profils.filter(p => publicPlace(p.city).adresse).length],
	[
		P,
		'Ville qui n’est pas une commune exploitable (pays, texte libre)',
		'—',
		l => l.profils.filter(p => rempli(p.city) && !usableCity(p.city)).length,
	],
	[
		P,
		'Ville homonyme de plusieurs communes',
		'—',
		l => l.profils.filter(p => VILLES_HOMONYMES.includes(texte(p.city)?.trim() ?? '')).length,
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
			Object.values(TABLE_DU_COMPOSANT).reduce(
				(somme, table) => somme + l.lignes[table].filter(ligne => !l.lies.get(table)?.has(idDe(ligne))).length,
				0
			),
	],
	[
		L,
		'Lignes identiques dans une même liste',
		'—',
		l => [...l.listes.values()].reduce((somme, liste) => somme + lignesIdentiques(liste.lignes), 0),
	],
	[
		L,
		'Listes rangées par `order` dans un autre ordre que leurs liens',
		'—',
		l =>
			[...l.listes.values()].filter(({ liens }) =>
				liens.some((lien, rang) => rang > 0 && idDe(lien) < idDe(liens[rang - 1] ?? lien))
			).length,
	],
	[
		L,
		'Réseaux avec un téléphone ou un email de contact',
		'—',
		l => l.lignes.components_makeupartists_networks.filter(r => rempli(r.phone) || rempli(r.email)).length,
	],
	[
		L,
		'Prix écrits sans nombre lisible (prestations et options)',
		'—',
		l => prix(l).filter(p => p.priceText !== null && p.priceFrom === null).length,
	],
	[L, 'Prix vides ou nuls (prestations et options)', '—', l => prix(l).filter(p => p.priceText === null).length],
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
		l => l.liensVivants.filter(lien => lien.related_type === TYPE_PROFIL && lien.field === 'main_picture').length,
	],
	[
		F,
		'… dans une galerie',
		'200',
		l => l.liensVivants.filter(lien => lien.related_type === TYPE_PROFIL && lien.field === 'image_gallery').length,
	],
	[
		F,
		'… qui ne sont pas des images',
		'1',
		l => l.fichiersDesProfils.filter(f => !(texte(f.mime) ?? '').startsWith('image/')).length,
	],
	[
		F,
		'… dont l’objet manque dans le stockage',
		'1',
		l =>
			l.fichiersDesProfils.filter(f => {
				const cle = l.cleDe(f.url)
				return cle === null || !l.objets.has(cle)
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
		l => l.fichiers.filter(f => !l.liensDeFichiers.some(lien => nombre(lien.file_id) === idDe(f))).length,
	],
	[F, 'Fichiers avec `uploaded_by` rempli', '—', l => l.fichiers.filter(f => nombre(f.uploaded_by) !== null).length],

	[A, 'Articles', '10', l => l.lignes.articles.length],
	[A, 'Articles publiés', '10', l => l.lignes.articles.filter(a => a.published_at !== null).length],
	[A, 'Talents', '14', l => l.lignes.talents.length],
	[A, 'Talents publiés', '14', l => l.lignes.talents.filter(t => t.published_at !== null).length],
]

/** The inventory of a state of the source, case by case. */
export function inventaire(etat: EtatDeLaSource): LigneDInventaire[] {
	const lecture = lire(etat)
	return CAS.map(([groupe, cas, reel, compter]) => ({ groupe, cas, reel, nombre: compter(lecture) }))
}

/** The inventory as the Markdown table of docs/tests/source-strapi.md. */
export function inventaireEnMarkdown(lignes: readonly LigneDInventaire[]): string {
	return [
		'| Groupe | Cas | Base réelle, 13/10/2026 | Fausse base |',
		'|---|---|---|---|',
		...lignes.map(({ groupe, cas, reel, nombre }) => `| ${groupe} | ${cas} | ${reel} | ${nombre} |`),
	].join('\n')
}
