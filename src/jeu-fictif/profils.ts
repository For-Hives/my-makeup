/**
 * The twelve profile types of the fictional set (ticket 051; plan 02 §6): each one a made-up
 * makeup artist, her account and her profile, with photos, always the same. Together they cover
 * the cases the real site holds: a complete profile, a city nearby, a city far away, unavailable,
 * availability not given, entirely empty, active but not publishable, no public contact, an old
 * username with accents, verified, hidden by an admin, every text at its longest.
 *
 * Pure data, read by the loader (./chargement.ts), the tests and the tickets that build on the set
 * (the single bench command). Everything is made up:
 *
 * - accounts in `@example.test`, contact addresses and links on `example.test`;
 * - phone numbers in the range ARCEP keeps for fiction (06 39 98 …);
 * - photos made from the design illustrations of the repository (`dev-assets/illustration/`):
 *   drawn faces, no person, no place, no metadata (./photos/);
 * - communes of the official list, with their INSEE code and the centre of the commune: public
 *   reference data.
 *
 * What the set writes is what a makeup artist or an admin writes. What the server computes (the
 * slug, the state, the status, the département) is never written: `attendu` says what the server
 * must store, and the tests compare. The status is chosen only for the hidden profile
 * (`chosenStatus`, ticket 044): every other one follows the rule.
 *
 * Relative imports on purpose: like the collections, this file must load outside of Next.
 */

import { GALERIE_MAX } from '../lib/medias'
import { parsePrice } from '../lib/prix'
import { LONGUEUR_MAX_EMAIL, LONGUEUR_MAX_LIEN, LONGUEUR_MAX_TELEPHONE } from '../lib/profil/coordonnees'
import { LONGUEUR_DESCRIPTION, LONGUEUR_NOM } from '../lib/profil/listes'
import type { StatutDuProfil } from '../lib/profil/statut'
import { BORNES_DU_RAYON_KM } from '../lib/profil/zone'
import type { Profile } from '../payload-types'

/** The photos of the set, in ./photos/: 400 × 400, WebP, under 30 KB each. */
export const PHOTOS_DU_JEU = [
	'photo-1.webp',
	'photo-2.webp',
	'photo-3.webp',
	'photo-4.webp',
	'photo-5.webp',
	'photo-6.webp',
] as const

export type PhotoDuJeu = (typeof PHOTOS_DU_JEU)[number]

/** The heaviest a photo of the set may be, in bytes (plan 02 §4.2: « 6 webp < 30 Ko »). */
export const POIDS_MAX_D_UNE_PHOTO = 30_000

/** Where the accounts of the set receive their mail: reserved for tests (RFC 6761), nothing is ever delivered. */
export const DOMAINE_DU_JEU = 'example.test'

/** The fields the server writes itself, at the creation or at every save: never in the set. */
type ChampsDuServeur =
	| 'id'
	| 'pro'
	| 'slug'
	| 'mainPicture'
	| 'gallery'
	| 'status'
	| 'completeness'
	| 'active'
	| 'activeSince'
	| 'publishable'
	| 'publishableSince'
	| 'fullyEmpty'
	| 'fullyEmptySince'
	| 'createdAt'
	| 'updatedAt'

/** What the set writes on a profile: what a makeup artist or an admin writes. */
export type DonneesDuProfil = Partial<Omit<Profile, ChampsDuServeur>>

/** What the server must compute and store for a profile of the set (ticket 044). */
export interface EtatAttendu {
	/** Computed from the name of the account at the creation (src/lib/slug.ts). */
	readonly slug: string
	/** Criteria met, out of 13. */
	readonly completeness: number
	readonly active: boolean
	readonly publishable: boolean
	readonly fullyEmpty: boolean
	readonly status: StatutDuProfil
}

export interface ProfilDuJeu {
	/** Its number in the table of plan 02 §6. */
	readonly numero: number
	/** Its name in the set: the address of its account and the names of its photos are made from it. */
	readonly cle: string
	/** What this type is there to test. */
	readonly sertA: string
	/** The made-up makeup artist it belongs to. Her account is created with it, confirmed. */
	readonly compte: { readonly email: string; readonly nom: string }
	readonly profil: DonneesDuProfil
	/** Its photos, by file: each one becomes a media of its own, owned by her account. */
	readonly photos: { readonly principale: PhotoDuJeu | null; readonly galerie: readonly PhotoDuJeu[] }
	readonly attendu: EtatAttendu
}

/** The address of the account of a profile of the set. */
export const adresseDuProfil = (cle: string): string => `jeu-profil-${cle}@${DOMAINE_DU_JEU}`

/** The date the made-up makeup artists of the set agreed to show their contact details. */
export const CONSENTEMENT_DU_JEU = '2026-09-01T08:00:00.000Z'

/** The date the verified profile was verified by an admin. */
export const VERIFICATION_DU_JEU = '2026-09-15T12:00:00.000Z'

/** Communes of the official list (geo.api.gouv.fr, 14/10/2026), the centre rounded as the server keeps it. */
const COMMUNES = {
	annecy: { name: 'Annecy', inseeCode: '74010', latitude: 45.9, longitude: 6.13 },
	annemasse: { name: 'Annemasse', inseeCode: '74012', latitude: 46.19, longitude: 6.25 },
	thonon: { name: 'Thonon-les-Bains', inseeCode: '74281', latitude: 46.37, longitude: 6.48 },
	nantes: { name: 'Nantes', inseeCode: '44109', latitude: 47.24, longitude: -1.56 },
	// The longest name of the official list: 45 characters.
	laPlusLongue: {
		name: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson',
		inseeCode: '51513',
		latitude: 48.61,
		longitude: 4.64,
	},
} as const

/** A price as the space will store it: the text typed, and its amount by the single rule (src/lib/prix.ts). */
const prix = (texte: string) => parsePrice(texte)

/** A text of exactly `longueur` characters: `debut`, repeated. */
export function texteDeLongueur(debut: string, longueur: number): string {
	let texte = debut
	while (texte.length < longueur) texte = `${texte} ${debut}`
	return texte.slice(0, longueur).trimEnd().padEnd(longueur, '.')
}

/** The links of a profile that only shows a network, on `example.test`. */
const instagram = (pseudo: string) => ({ instagram: `https://instagram.example.test/${pseudo}` })

/** The contact details she shows, with the trace of her consent. */
const coordonneesPubliques = (telephone: string, email: string): DonneesDuProfil => ({
	contactDetails: { phone: telephone, email },
	publicContact: true,
	consentedAt: CONSENTEMENT_DU_JEU,
	consentSource: 'artist',
})

/** The lists of a complete profile: one row or more in each, as the space fills them. */
function listesCompletes(ville: string): DonneesDuProfil {
	return {
		competences: [
			{ nom: 'Maquillage longue tenue', description: 'Un teint qui tient de la cérémonie jusqu’au bout de la nuit.' },
			{ nom: 'Peaux sensibles', description: 'Produits choisis pour les peaux réactives.' },
		],
		langues: [{ nom: 'Français' }, { nom: 'Anglais' }],
		formations: [
			{
				diplome: 'CAP Esthétique, cosmétique, parfumerie',
				ecole: 'École fictive des métiers de la beauté',
				obtenuLe: '2016-06-30',
				description: 'Formation générale, avec un module de maquillage de jour et de soirée.',
			},
		],
		experiences: [
			{
				entreprise: 'Studio fictif du maquillage',
				poste: 'Maquilleuse',
				ville,
				debut: '2017-01-09',
				fin: '2020-12-31',
				description: 'Maquillage des mariées et des invitées, essais en studio.',
			},
			{ entreprise: 'À son compte', poste: 'Maquilleuse indépendante', ville, debut: '2021-01-04', fin: null },
		],
	}
}

/** Two offers with an amount: what makes a profile publishable, with the five other conditions. */
const OFFRES_CHIFFREES: DonneesDuProfil['prestations'] = [
	{
		nom: 'Maquillage de la mariée',
		description: 'Essai compris, et retouches avant la cérémonie.',
		...prix('À partir de 150 €'),
	},
	{ nom: 'Maquillage invitée', description: 'Pour la famille et les témoins.', ...prix('45 €') },
]

/** Everything a complete profile holds: the six conditions of a publishable profile, and the 13 criteria. */
function profilComplet(identite: {
	firstName: string
	lastName: string
	artistName: string
	specialty: string
	city: (typeof COMMUNES)[keyof typeof COMMUNES]
	description: string
	pseudo: string
}): DonneesDuProfil {
	const { pseudo, city, ...reste } = identite
	return {
		...reste,
		city,
		radiusKm: 30,
		homeService: true,
		available: true,
		prestations: OFFRES_CHIFFREES,
		networks: instagram(pseudo),
		...listesCompletes(city.name),
	}
}

/** A state of the set: what the rule gives each kind of profile. */
const PUBLIE_COMPLET = {
	completeness: 13,
	active: true,
	publishable: true,
	fullyEmpty: false,
	status: 'published',
} as const satisfies Omit<EtatAttendu, 'slug'>

/** The longest texts of the profile with every text at its longest. */
const LONGUE_DESCRIPTION =
	'Maquilleuse de mariage, de soirée, de mode et de cinéma, je travaille partout où l’on me demande, du lever du jour jusqu’au bout de la nuit, avec une trousse complète et des produits choisis pour chaque peau.'
const PRENOM_LE_PLUS_LONG = texteDeLongueur('Marie-Apolline-Joséphine-Bérénice-Eugénie-Héloïse', LONGUEUR_NOM)
const NOM_LE_PLUS_LONG = texteDeLongueur('Delaunay-Vasseur de La Roche-Fontenelle des Prés-Hauts', LONGUEUR_NOM)
const lienLePlusLong = (reseau: string) => {
	const debut = `https://${reseau}.${DOMAINE_DU_JEU}/`
	return `${debut}${'textes-maximaux-'.repeat(LONGUEUR_MAX_LIEN).slice(0, LONGUEUR_MAX_LIEN - debut.length)}`
}
/** 64 characters before the « @ », the most an address takes; 200 in all. */
const EMAIL_LE_PLUS_LONG = `${'contact-textes-maximaux-'.padEnd(64, 'm')}@${'m'.repeat(61)}.${'m'.repeat(60)}.${DOMAINE_DU_JEU}`
const TELEPHONE_LE_PLUS_LONG = '+33 (0)6 39 98 10 12'

const prestationLaPlusLongue = (numero: number) => ({
	nom: texteDeLongueur(`Prestation ${numero} : maquillage complet de la mariée et de son cortège`, LONGUEUR_NOM),
	description: texteDeLongueur(LONGUE_DESCRIPTION, LONGUEUR_DESCRIPTION),
	...prix(texteDeLongueur('À partir de 10 000 €, essai, déplacement et retouches compris', LONGUEUR_NOM)),
	options: [1, 2].map(option => ({
		nom: texteDeLongueur(`Option ${option} : retouches jusqu’à la fin de la soirée`, LONGUEUR_NOM),
		description: texteDeLongueur(LONGUE_DESCRIPTION, LONGUEUR_DESCRIPTION),
		...prix(texteDeLongueur('Sur devis, selon le nombre de personnes et le lieu', LONGUEUR_NOM)),
	})),
})

/** The twelve profile types of plan 02 §6, in its order: an empty bench gives them the same identifiers every time. */
export const PROFILS_DU_JEU: readonly ProfilDuJeu[] = [
	{
		numero: 1,
		cle: 'reference',
		sertA:
			'Référence : complet, disponible, Annecy, mariage, trois offres chiffrées, six photos ; il publie téléphone et email (SEO, performance, visuel).',
		compte: { email: adresseDuProfil('reference'), nom: 'Inès Morel' },
		profil: {
			firstName: 'Inès',
			lastName: 'Morel',
			artistName: 'Inès Morel Maquillage',
			specialty: 'Maquillage mariage',
			city: COMMUNES.annecy,
			radiusKm: 30,
			homeService: true,
			available: true,
			description:
				'Maquilleuse professionnelle installée à Annecy depuis dix ans, je prépare les mariées du lac et des montagnes alentour. Je viens chez vous le jour J, avec un maquillage pensé pour tenir de la cérémonie jusqu’à la fin de la soirée, en photo comme à l’œil nu.',
			prestations: [
				{
					nom: 'Maquillage de la mariée',
					description: 'Le jour J, chez vous ou sur le lieu de la cérémonie, retouches comprises.',
					...prix('À partir de 180 €'),
					options: [{ nom: 'Retouches jusqu’au dîner', description: 'Je reste jusqu’au repas.', ...prix('60 €') }],
				},
				{
					nom: 'Essai maquillage',
					description: 'Une séance pour choisir ensemble le maquillage du jour J.',
					...prix('60 €'),
				},
				{
					nom: 'Maquillage des invitées',
					description: 'Pour la famille et les témoins, le matin du mariage.',
					...prix('À partir de 45 €'),
				},
			],
			competences: [
				{ nom: 'Maquillage longue tenue', description: 'Un teint qui tient de la cérémonie jusqu’au bout de la nuit.' },
				{ nom: 'Peaux sensibles', description: 'Produits choisis pour les peaux réactives.' },
				{ nom: 'Coiffure de mariée', description: 'Chignons et ondulations, en accord avec le maquillage.' },
			],
			langues: [{ nom: 'Français' }, { nom: 'Anglais' }, { nom: 'Italien' }],
			formations: [
				{
					diplome: 'CAP Esthétique, cosmétique, parfumerie',
					ecole: 'École fictive des métiers de la beauté',
					obtenuLe: '2014-06-30',
					description: 'Formation générale, avec un module de maquillage de jour et de soirée.',
				},
				{
					diplome: 'Certificat de maquillage professionnel',
					ecole: 'Atelier fictif du maquillage',
					obtenuLe: '2015-11-15',
					description: null,
				},
			],
			experiences: [
				{
					entreprise: 'Institut fictif du Lac',
					poste: 'Esthéticienne maquilleuse',
					ville: 'Annecy',
					debut: '2015-09-01',
					fin: '2018-08-31',
					description: 'Soins, maquillage de jour et préparation des mariées.',
				},
				{
					entreprise: 'Inès Morel Maquillage',
					poste: 'Maquilleuse indépendante',
					ville: 'Annecy',
					debut: '2018-09-03',
					fin: null,
					description: null,
				},
			],
			networks: { instagram: 'https://instagram.example.test/ines.morel', website: 'https://ines-morel.example.test' },
			...coordonneesPubliques('06 39 98 10 01', 'contact@ines-morel.example.test'),
		},
		photos: {
			principale: 'photo-1.webp',
			galerie: ['photo-1.webp', 'photo-2.webp', 'photo-3.webp', 'photo-4.webp', 'photo-5.webp', 'photo-6.webp'],
		},
		attendu: { slug: 'ines-morel', ...PUBLIE_COMPLET },
	},
	{
		numero: 2,
		cle: 'ville-voisine',
		sertA: 'Complet, à Annemasse, ville voisine d’Annecy : la recherche par zone, le JSON-LD.',
		compte: { email: adresseDuProfil('ville-voisine'), nom: 'Léa Garnier' },
		profil: profilComplet({
			firstName: 'Léa',
			lastName: 'Garnier',
			artistName: 'Léa Garnier Beauté',
			specialty: 'Maquillage mariage et soirée',
			city: COMMUNES.annemasse,
			description:
				'Je maquille les mariées et leurs invitées entre Annemasse, le Chablais et le pays de Gex. Teint lumineux, regard travaillé, je prends le temps d’un essai pour que le jour J se passe sans surprise, et je me déplace avec tout mon matériel.',
			pseudo: 'lea.garnier',
		}),
		photos: { principale: 'photo-2.webp', galerie: ['photo-3.webp'] },
		attendu: { slug: 'lea-garnier', ...PUBLIE_COMPLET },
	},
	{
		numero: 3,
		cle: 'ville-eloignee',
		sertA: 'Complet, à Nantes, loin d’Annecy : une recherche par ville hors de la zone ne le trouve pas.',
		compte: { email: adresseDuProfil('ville-eloignee'), nom: 'Chloé Bertin' },
		profil: profilComplet({
			firstName: 'Chloé',
			lastName: 'Bertin',
			artistName: 'Chloé Bertin Make-up',
			specialty: 'Maquillage événementiel',
			city: COMMUNES.nantes,
			description:
				'Maquilleuse à Nantes, je travaille pour les mariages, les séances photo et les soirées d’entreprise. J’aime les maquillages naturels comme les looks plus audacieux, et je m’adapte à chaque peau, à chaque lumière et à chaque tenue.',
			pseudo: 'chloe.bertin',
		}),
		photos: { principale: 'photo-3.webp', galerie: ['photo-4.webp'] },
		attendu: { slug: 'chloe-bertin', ...PUBLIE_COMPLET },
	},
	{
		numero: 4,
		cle: 'indisponible',
		sertA: 'Complet, publié, mais indisponible : la recherche l’exclut.',
		compte: { email: adresseDuProfil('indisponible'), nom: 'Manon Faure' },
		profil: {
			...profilComplet({
				firstName: 'Manon',
				lastName: 'Faure',
				artistName: 'Manon Faure Maquillage',
				specialty: 'Maquillage mariage',
				city: COMMUNES.annecy,
				description:
					'Maquilleuse à Annecy, je suis en pause pour quelques mois et je ne prends plus de nouvelles dates pour l’instant. Mon portfolio reste en ligne : vous y trouverez mes mariées de l’été dernier et les séances photo de l’hiver.',
				pseudo: 'manon.faure',
			}),
			available: false,
		},
		photos: { principale: 'photo-4.webp', galerie: ['photo-5.webp'] },
		attendu: { slug: 'manon-faure', ...PUBLIE_COMPLET },
	},
	{
		numero: 5,
		cle: 'disponibilite-inconnue',
		sertA: 'Complet, disponibilité non renseignée (nulle) : comptée comme disponible, comme sur l’ancien site.',
		compte: { email: adresseDuProfil('disponibilite-inconnue'), nom: 'Jade Roussel' },
		profil: {
			...profilComplet({
				firstName: 'Jade',
				lastName: 'Roussel',
				artistName: 'Jade Roussel Make-up',
				specialty: 'Maquillage mariage',
				city: COMMUNES.annecy,
				description:
					'Je maquille à Annecy et dans toute la Haute-Savoie depuis six ans : mariées, invitées, séances photo et spectacles. Je travaille avec des produits de qualité professionnelle et je prends soin des peaux sensibles comme des peaux mixtes.',
				pseudo: 'jade.roussel',
			}),
			available: null,
		},
		photos: { principale: 'photo-5.webp', galerie: ['photo-6.webp'] },
		attendu: { slug: 'jade-roussel', ...PUBLIE_COMPLET },
	},
	{
		numero: 6,
		cle: 'vide',
		sertA: 'Coquille vide, telle que l’inscription la crée : brouillon, noindex, absente de la recherche.',
		compte: { email: adresseDuProfil('vide'), nom: 'Nina Perret' },
		profil: {},
		photos: { principale: null, galerie: [] },
		attendu: {
			slug: 'nina-perret',
			completeness: 0,
			active: false,
			publishable: false,
			fullyEmpty: true,
			status: 'draft',
		},
	},
	{
		numero: 7,
		cle: 'actif-non-publiable',
		sertA: 'Actif mais pas publiable : ses offres sont « sur devis », sans prix chiffré (les seuils).',
		compte: { email: adresseDuProfil('actif-non-publiable'), nom: 'Clara Dumas' },
		profil: {
			...profilComplet({
				firstName: 'Clara',
				lastName: 'Dumas',
				artistName: 'Clara Dumas Maquillage',
				specialty: 'Maquillage mariage',
				city: COMMUNES.annecy,
				description:
					'Maquilleuse à Annecy, je compose chaque maquillage avec vous : mariage, soirée ou séance photo. Chaque demande est différente, alors je préfère en parler avant de donner un prix, selon le lieu, l’heure et le nombre de personnes à maquiller.',
				pseudo: 'clara.dumas',
			}),
			prestations: [
				{ nom: 'Maquillage de la mariée', description: 'Essai compris.', ...prix('Sur devis') },
				{ nom: 'Maquillage de groupe', description: 'Pour le cortège.', ...prix('Selon le nombre de personnes') },
			],
		},
		photos: { principale: 'photo-6.webp', galerie: ['photo-1.webp'] },
		attendu: { slug: 'clara-dumas', ...PUBLIE_COMPLET, publishable: false },
	},
	{
		numero: 8,
		cle: 'sans-contact-public',
		sertA:
			'Aucun moyen de contact public : ni réseau, ni coordonnées montrées (enregistrées mais fermées). Le devis est le seul canal.',
		compte: { email: adresseDuProfil('sans-contact-public'), nom: 'Louise Girard' },
		profil: {
			...profilComplet({
				firstName: 'Louise',
				lastName: 'Girard',
				artistName: 'Louise Girard Beauté',
				specialty: 'Maquillage mariage',
				city: COMMUNES.annecy,
				description:
					'Maquilleuse à Annecy, je prépare les mariées et leurs proches, chez elles ou sur le lieu de la fête. Pour me joindre, passez par la demande de devis : je vous réponds avec une proposition adaptée à votre journée et à votre budget.',
				pseudo: 'louise.girard',
			}),
			networks: {},
			contactDetails: { phone: '06 39 98 10 08', email: 'contact@louise-girard.example.test' },
			publicContact: false,
		},
		photos: { principale: 'photo-2.webp', galerie: ['photo-4.webp'] },
		attendu: { slug: 'louise-girard', ...PUBLIE_COMPLET, completeness: 12, publishable: false },
	},
	{
		numero: 9,
		cle: 'ancien-nom-accentue',
		sertA: 'Ancien nom d’utilisateur « zoé lefèvre » : le slug zoe-lefevre, la redirection 308, l’encodage.',
		compte: { email: adresseDuProfil('ancien-nom-accentue'), nom: 'Zoé Lefèvre' },
		profil: {
			...profilComplet({
				firstName: 'Zoé',
				lastName: 'Lefèvre',
				artistName: 'Zoé Lefèvre Maquillage',
				specialty: 'Maquillage mariage',
				city: COMMUNES.thonon,
				description:
					'Maquilleuse au bord du Léman depuis 2019, j’accompagne les mariées de Thonon, d’Évian et du Chablais. J’aime les maquillages lumineux et naturels, qui révèlent sans transformer, et je me déplace jusqu’à vous avec tout mon matériel.',
				pseudo: 'zoe.lefevre',
			}),
			legacyUsername: 'zoé lefèvre',
		},
		photos: { principale: 'photo-3.webp', galerie: ['photo-5.webp'] },
		attendu: { slug: 'zoe-lefevre', ...PUBLIE_COMPLET },
	},
	{
		numero: 10,
		cle: 'verifiee',
		sertA: 'Vérifiée par un admin, avec le badge des cartes : le badge.',
		compte: { email: adresseDuProfil('verifiee'), nom: 'Emma Chevalier' },
		profil: {
			...profilComplet({
				firstName: 'Emma',
				lastName: 'Chevalier',
				artistName: 'Emma Chevalier Make-up',
				specialty: 'Maquillage mariage',
				city: COMMUNES.annecy,
				description:
					'Maquilleuse diplômée, installée à Annecy, je travaille pour les mariages, les tournages et les défilés. Mon activité a été vérifiée : je vous accompagne de l’essai au jour J, avec un maquillage qui tient et qui vous ressemble.',
				pseudo: 'emma.chevalier',
			}),
			verified: true,
			verifiedAt: VERIFICATION_DU_JEU,
			superArtist: true,
		},
		photos: { principale: 'photo-4.webp', galerie: ['photo-6.webp'] },
		attendu: { slug: 'emma-chevalier', ...PUBLIE_COMPLET },
	},
	{
		numero: 11,
		cle: 'masquee',
		sertA: 'Complet et publiable, masqué par un admin : 404, absent de la recherche et du sitemap.',
		compte: { email: adresseDuProfil('masquee'), nom: 'Alice Fontaine' },
		profil: {
			...profilComplet({
				firstName: 'Alice',
				lastName: 'Fontaine',
				artistName: 'Alice Fontaine Maquillage',
				specialty: 'Maquillage mariage',
				city: COMMUNES.annecy,
				description:
					'Maquilleuse à Annecy, je travaille surtout pour les mariages d’été au bord du lac et pour les séances photo en montagne. Je vous propose un essai chez vous, puis le maquillage du jour J, avec des retouches jusqu’au début de la soirée.',
				pseudo: 'alice.fontaine',
			}),
			chosenStatus: 'hidden',
			reason: 'Masqué le temps de vérifier les photos du portfolio.',
		},
		photos: { principale: 'photo-5.webp', galerie: ['photo-2.webp'] },
		attendu: { slug: 'alice-fontaine', ...PUBLIE_COMPLET, status: 'hidden' },
	},
	{
		numero: 12,
		cle: 'textes-maximaux',
		sertA: 'Chaque texte à sa longueur maximale, le rayon et la galerie au plus : la mise en page.',
		compte: { email: adresseDuProfil('textes-maximaux'), nom: `${PRENOM_LE_PLUS_LONG} ${NOM_LE_PLUS_LONG}` },
		profil: {
			firstName: PRENOM_LE_PLUS_LONG,
			lastName: NOM_LE_PLUS_LONG,
			artistName: texteDeLongueur('Maison de maquillage des mariées du lac et des montagnes', LONGUEUR_NOM),
			specialty: texteDeLongueur('Maquillage mariage, soirée, mode, cinéma et effets spéciaux', LONGUEUR_NOM),
			city: COMMUNES.laPlusLongue,
			radiusKm: BORNES_DU_RAYON_KM.max,
			homeService: true,
			available: true,
			description: texteDeLongueur(LONGUE_DESCRIPTION, LONGUEUR_DESCRIPTION),
			prestations: [1, 2, 3].map(prestationLaPlusLongue),
			competences: [1, 2, 3].map(numero => ({
				nom: texteDeLongueur(`Compétence ${numero} : maquillage longue tenue pour peaux sensibles`, LONGUEUR_NOM),
				description: texteDeLongueur(LONGUE_DESCRIPTION, LONGUEUR_DESCRIPTION),
			})),
			langues: [1, 2, 3].map(numero => ({
				nom: texteDeLongueur(`Langue ${numero} : français, anglais, italien, espagnol, allemand`, LONGUEUR_NOM),
			})),
			formations: [1, 2, 3].map(numero => ({
				diplome: texteDeLongueur(`Diplôme ${numero} : certificat de maquillage artistique et de scène`, LONGUEUR_NOM),
				ecole: texteDeLongueur('École fictive supérieure des métiers du maquillage et de la beauté', LONGUEUR_NOM),
				obtenuLe: `201${numero}-06-30`,
				description: texteDeLongueur(LONGUE_DESCRIPTION, LONGUEUR_DESCRIPTION),
			})),
			experiences: [1, 2, 3].map(numero => ({
				entreprise: texteDeLongueur(`Entreprise ${numero} : studio fictif de maquillage et de coiffure`, LONGUEUR_NOM),
				poste: texteDeLongueur('Maquilleuse principale, cheffe d’équipe maquillage et coiffure', LONGUEUR_NOM),
				ville: texteDeLongueur('Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson', LONGUEUR_NOM),
				debut: `201${numero}-01-02`,
				fin: `201${numero + 1}-12-31`,
				description: texteDeLongueur(LONGUE_DESCRIPTION, LONGUEUR_DESCRIPTION),
			})),
			networks: {
				youtube: lienLePlusLong('youtube'),
				facebook: lienLePlusLong('facebook'),
				instagram: lienLePlusLong('instagram'),
				website: lienLePlusLong('www'),
				linkedin: lienLePlusLong('linkedin'),
			},
			...coordonneesPubliques(TELEPHONE_LE_PLUS_LONG, EMAIL_LE_PLUS_LONG),
		},
		photos: {
			principale: 'photo-6.webp',
			galerie: Array.from(
				{ length: GALERIE_MAX },
				(_, rang) => PHOTOS_DU_JEU[rang % PHOTOS_DU_JEU.length] ?? 'photo-1.webp'
			),
		},
		attendu: {
			slug: 'marie-apolline-josephine-berenice-eugenie-heloise-marie-apolline-josep',
			...PUBLIE_COMPLET,
		},
	},
]

/** The longest values of the profile with every text at its longest, for the checks of its lengths. */
export const LONGUEURS_DU_JEU = {
	email: { valeur: EMAIL_LE_PLUS_LONG, maximum: LONGUEUR_MAX_EMAIL },
	telephone: { valeur: TELEPHONE_LE_PLUS_LONG, maximum: LONGUEUR_MAX_TELEPHONE },
} as const
