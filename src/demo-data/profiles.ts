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

import { GALLERY_MAX } from '../lib/media'
import { parsePrice } from '../lib/price'
import { EMAIL_MAX_LENGTH, LINK_MAX_LENGTH, PHONE_MAX_LENGTH } from '../lib/profile/contact-details'
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH } from '../lib/profile/lists'
import type { ProfileStatus } from '../lib/profile/status'
import { RADIUS_BOUNDS_KM } from '../lib/profile/zone'
import type { Profile } from '../payload-types'

/** The photos of the set, in ./photos/: 400 × 400, WebP, under 30 KB each. */
export const DEMO_PHOTOS = [
	'photo-1.webp',
	'photo-2.webp',
	'photo-3.webp',
	'photo-4.webp',
	'photo-5.webp',
	'photo-6.webp',
] as const

export type DemoPhoto = (typeof DEMO_PHOTOS)[number]

/** The heaviest a photo of the set may be, in bytes (plan 02 §4.2: « 6 webp < 30 Ko »). */
export const PHOTO_MAX_WEIGHT = 30_000

/** Where the accounts of the set receive their mail: reserved for tests (RFC 6761), nothing is ever delivered. */
export const DEMO_DOMAIN = 'example.test'

/** The fields the server writes itself, at the creation or at every save: never in the set. */
type ServerFields =
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
export type ProfileData = Partial<Omit<Profile, ServerFields>>

/** What the server must compute and store for a profile of the set (ticket 044). */
export interface ExpectedState {
	/** Computed from the name of the account at the creation (src/lib/slug.ts). */
	readonly slug: string
	/** Criteria met, out of 13. */
	readonly completeness: number
	readonly active: boolean
	readonly publishable: boolean
	readonly fullyEmpty: boolean
	readonly status: ProfileStatus
}

export interface DemoProfile {
	/** Its number in the table of plan 02 §6. */
	readonly numero: number
	/** Its name in the set: the address of its account and the names of its photos are made from it. */
	readonly cle: string
	/** What this type is there to test. */
	readonly sertA: string
	/** The made-up makeup artist it belongs to. Her account is created with it, confirmed. */
	readonly compte: { readonly email: string; readonly nom: string }
	readonly profil: ProfileData
	/** Its photos, by file: each one becomes a media of its own, owned by her account. */
	readonly photos: { readonly principale: DemoPhoto | null; readonly galerie: readonly DemoPhoto[] }
	readonly attendu: ExpectedState
}

/** The address of the account of a profile of the set. */
export const profileUrl = (cle: string): string => `jeu-profil-${cle}@${DEMO_DOMAIN}`

/** The date the made-up makeup artists of the set agreed to show their contact details. */
export const DEMO_CONSENT = '2026-09-01T08:00:00.000Z'

/** The date the verified profile was verified by an admin. */
export const DEMO_VERIFICATION = '2026-09-15T12:00:00.000Z'

/** Communes of the official list (geo.api.gouv.fr, 14/10/2026), the centre rounded as the server keeps it. */
const CITIES = {
	annecy: { name: 'Annecy', inseeCode: '74010', latitude: 45.9, longitude: 6.13, postalCodes: ['74000'] as string[] },
	annemasse: {
		name: 'Annemasse',
		inseeCode: '74012',
		latitude: 46.19,
		longitude: 6.25,
		postalCodes: ['74100'] as string[],
	},
	thonon: {
		name: 'Thonon-les-Bains',
		inseeCode: '74281',
		latitude: 46.37,
		longitude: 6.48,
		postalCodes: ['74200'] as string[],
	},
	nantes: {
		name: 'Nantes',
		inseeCode: '44109',
		latitude: 47.24,
		longitude: -1.56,
		postalCodes: ['44000', '44100', '44200', '44300'] as string[],
	},
	// The longest name of the official list: 45 characters.
	laPlusLongue: {
		name: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson',
		inseeCode: '51513',
		latitude: 48.61,
		longitude: 4.64,
		postalCodes: ['51290'] as string[],
	},
	// Two fictional communes that share one fictional postal code (ticket 259): a code that does not
	// name one commune. They exist only in the set and in the fake list of the bench
	// (tests/support/fake-cities/provider.ts); neither is a commune of France.
	valbrume: {
		name: 'Valbrume',
		inseeCode: '74990',
		latitude: 45.95,
		longitude: 6.4,
		postalCodes: ['74990'] as string[],
	},
	hautcombe: {
		name: 'Hautcombe',
		inseeCode: '74991',
		latitude: 45.97,
		longitude: 6.43,
		postalCodes: ['74990'] as string[],
	},
} as const

/** A price as the space will store it: the text typed, and its amount by the single rule (src/lib/price.ts). */
const price = (texte: string) => parsePrice(texte)

/** A text of exactly `longueur` characters: `debut`, repeated. */
export function textOfLength(debut: string, longueur: number): string {
	let text = debut
	while (text.length < longueur) text = `${text} ${debut}`
	return text.slice(0, longueur).trimEnd().padEnd(longueur, '.')
}

/** The links of a profile that only shows a network, on `example.test`. */
const instagram = (pseudo: string) => ({ instagram: `https://instagram.example.test/${pseudo}` })

/** The contact details she shows, with the trace of her consent. */
const publicContactDetails = (telephone: string, email: string): ProfileData => ({
	contactDetails: { phone: telephone, email },
	publicContact: true,
	consentedAt: DEMO_CONSENT,
	consentSource: 'artist',
})

/** The lists of a complete profile: one row or more in each, as the space fills them. */
function fullLists(ville: string): ProfileData {
	return {
		skills: [
			{ name: 'Maquillage longue tenue', description: 'Un teint qui tient de la cérémonie jusqu’au bout de la nuit.' },
			{ name: 'Peaux sensibles', description: 'Produits choisis pour les peaux réactives.' },
		],
		languages: [{ name: 'Français' }, { name: 'Anglais' }],
		courses: [
			{
				diploma: 'CAP Esthétique, cosmétique, parfumerie',
				school: 'École fictive des métiers de la beauté',
				graduatedAt: '2016-06-30',
				description: 'Formation générale, avec un module de maquillage de jour et de soirée.',
			},
		],
		experiences: [
			{
				company: 'Studio fictif du maquillage',
				jobTitle: 'Maquilleuse',
				city: ville,
				startDate: '2017-01-09',
				endDate: '2020-12-31',
				description: 'Maquillage des mariées et des invitées, essais en studio.',
			},
			{
				company: 'À son compte',
				jobTitle: 'Maquilleuse indépendante',
				city: ville,
				startDate: '2021-01-04',
				endDate: null,
			},
		],
	}
}

/** Two offers with an amount: what makes a profile publishable, with the five other conditions. */
const PRICED_OFFERS: ProfileData['serviceOffers'] = [
	{
		name: 'Maquillage de la mariée',
		description: 'Essai compris, et retouches avant la cérémonie.',
		...price('À partir de 150 €'),
	},
	{ name: 'Maquillage invitée', description: 'Pour la famille et les témoins.', ...price('45 €') },
]

/** Everything a complete profile holds: the six conditions of a publishable profile, and the 13 criteria. */
function completeProfile(identite: {
	firstName: string
	lastName: string
	artistName: string
	specialty: string
	city: (typeof CITIES)[keyof typeof CITIES]
	description: string
	pseudo: string
}): ProfileData {
	const { pseudo, city, ...rest } = identite
	return {
		...rest,
		city,
		radiusKm: 30,
		homeService: true,
		available: true,
		serviceOffers: PRICED_OFFERS,
		networks: instagram(pseudo),
		...fullLists(city.name),
	}
}

/** A state of the set: what the rule gives each kind of profile. */
const PUBLISHED_COMPLETE = {
	completeness: 13,
	active: true,
	publishable: true,
	fullyEmpty: false,
	status: 'published',
} as const satisfies Omit<ExpectedState, 'slug'>

/** The longest texts of the profile with every text at its longest. */
const LONG_DESCRIPTION =
	'Maquilleuse de mariage, de soirée, de mode et de cinéma, je travaille partout où l’on me demande, du lever du jour jusqu’au bout de la nuit, avec une trousse complète et des produits choisis pour chaque peau.'
const LONGEST_FIRST_NAME = textOfLength('Marie-Apolline-Joséphine-Bérénice-Eugénie-Héloïse', NAME_MAX_LENGTH)
const LONGEST_NAME = textOfLength('Delaunay-Vasseur de La Roche-Fontenelle des Prés-Hauts', NAME_MAX_LENGTH)
const longestLink = (reseau: string) => {
	const start = `https://${reseau}.${DEMO_DOMAIN}/`
	return `${start}${'textes-maximaux-'.repeat(LINK_MAX_LENGTH).slice(0, LINK_MAX_LENGTH - start.length)}`
}
/** 64 characters before the « @ », the most an address takes; 200 in all. */
const LONGEST_EMAIL = `${'contact-textes-maximaux-'.padEnd(64, 'm')}@${'m'.repeat(61)}.${'m'.repeat(60)}.${DEMO_DOMAIN}`
const LONGEST_PHONE = '+33 (0)6 39 98 10 12'

const longestServiceOffer = (numero: number) => ({
	name: textOfLength(`Prestation ${numero} : maquillage complet de la mariée et de son cortège`, NAME_MAX_LENGTH),
	description: textOfLength(LONG_DESCRIPTION, DESCRIPTION_MAX_LENGTH),
	...price(textOfLength('À partir de 10 000 €, essai, déplacement et retouches compris', NAME_MAX_LENGTH)),
	options: [1, 2].map(option => ({
		name: textOfLength(`Option ${option} : retouches jusqu’à la fin de la soirée`, NAME_MAX_LENGTH),
		description: textOfLength(LONG_DESCRIPTION, DESCRIPTION_MAX_LENGTH),
		...price(textOfLength('Sur devis, selon le nombre de personnes et le lieu', NAME_MAX_LENGTH)),
	})),
})

/** The twelve profile types of plan 02 §6, in its order: an empty bench gives them the same identifiers every time. */
export const DEMO_PROFILES: readonly DemoProfile[] = [
	{
		numero: 1,
		cle: 'reference',
		sertA:
			'Référence : complet, disponible, Annecy, mariage, trois offres chiffrées, six photos ; il publie téléphone et email (SEO, performance, visuel).',
		compte: { email: profileUrl('reference'), nom: 'Inès Morel' },
		profil: {
			firstName: 'Inès',
			lastName: 'Morel',
			artistName: 'Inès Morel Maquillage',
			specialty: 'Maquillage mariage',
			city: CITIES.annecy,
			radiusKm: 30,
			homeService: true,
			available: true,
			description:
				'Maquilleuse professionnelle installée à Annecy depuis dix ans, je prépare les mariées du lac et des montagnes alentour. Je viens chez vous le jour J, avec un maquillage pensé pour tenir de la cérémonie jusqu’à la fin de la soirée, en photo comme à l’œil nu.',
			serviceOffers: [
				{
					name: 'Maquillage de la mariée',
					description: 'Le jour J, chez vous ou sur le lieu de la cérémonie, retouches comprises.',
					...price('À partir de 180 €'),
					options: [{ name: 'Retouches jusqu’au dîner', description: 'Je reste jusqu’au repas.', ...price('60 €') }],
				},
				{
					name: 'Essai maquillage',
					description: 'Une séance pour choisir ensemble le maquillage du jour J.',
					...price('60 €'),
				},
				{
					name: 'Maquillage des invitées',
					description: 'Pour la famille et les témoins, le matin du mariage.',
					...price('À partir de 45 €'),
				},
			],
			skills: [
				{
					name: 'Maquillage longue tenue',
					description: 'Un teint qui tient de la cérémonie jusqu’au bout de la nuit.',
				},
				{ name: 'Peaux sensibles', description: 'Produits choisis pour les peaux réactives.' },
				{ name: 'Coiffure de mariée', description: 'Chignons et ondulations, en accord avec le maquillage.' },
			],
			languages: [{ name: 'Français' }, { name: 'Anglais' }, { name: 'Italien' }],
			courses: [
				{
					diploma: 'CAP Esthétique, cosmétique, parfumerie',
					school: 'École fictive des métiers de la beauté',
					graduatedAt: '2014-06-30',
					description: 'Formation générale, avec un module de maquillage de jour et de soirée.',
				},
				{
					diploma: 'Certificat de maquillage professionnel',
					school: 'Atelier fictif du maquillage',
					graduatedAt: '2015-11-15',
					description: null,
				},
			],
			experiences: [
				{
					company: 'Institut fictif du Lac',
					jobTitle: 'Esthéticienne maquilleuse',
					city: 'Annecy',
					startDate: '2015-09-01',
					endDate: '2018-08-31',
					description: 'Soins, maquillage de jour et préparation des mariées.',
				},
				{
					company: 'Inès Morel Maquillage',
					jobTitle: 'Maquilleuse indépendante',
					city: 'Annecy',
					startDate: '2018-09-03',
					endDate: null,
					description: null,
				},
			],
			networks: { instagram: 'https://instagram.example.test/ines.morel', website: 'https://ines-morel.example.test' },
			...publicContactDetails('06 39 98 10 01', 'contact@ines-morel.example.test'),
		},
		photos: {
			principale: 'photo-1.webp',
			galerie: ['photo-1.webp', 'photo-2.webp', 'photo-3.webp', 'photo-4.webp', 'photo-5.webp', 'photo-6.webp'],
		},
		attendu: { slug: 'ines-morel', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 2,
		cle: 'ville-voisine',
		sertA: 'Complet, à Annemasse, ville voisine d’Annecy : la recherche par zone, le JSON-LD.',
		compte: { email: profileUrl('ville-voisine'), nom: 'Léa Garnier' },
		profil: completeProfile({
			firstName: 'Léa',
			lastName: 'Garnier',
			artistName: 'Léa Garnier Beauté',
			specialty: 'Maquillage mariage et soirée',
			city: CITIES.annemasse,
			description:
				'Je maquille les mariées et leurs invitées entre Annemasse, le Chablais et le pays de Gex. Teint lumineux, regard travaillé, je prends le temps d’un essai pour que le jour J se passe sans surprise, et je me déplace avec tout mon matériel.',
			pseudo: 'lea.garnier',
		}),
		photos: { principale: 'photo-2.webp', galerie: ['photo-3.webp'] },
		attendu: { slug: 'lea-garnier', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 3,
		cle: 'ville-eloignee',
		sertA: 'Complet, à Nantes, loin d’Annecy : une recherche par ville hors de la zone ne le trouve pas.',
		compte: { email: profileUrl('ville-eloignee'), nom: 'Chloé Bertin' },
		profil: completeProfile({
			firstName: 'Chloé',
			lastName: 'Bertin',
			artistName: 'Chloé Bertin Make-up',
			specialty: 'Maquillage événementiel',
			city: CITIES.nantes,
			description:
				'Maquilleuse à Nantes, je travaille pour les mariages, les séances photo et les soirées d’entreprise. J’aime les maquillages naturels comme les looks plus audacieux, et je m’adapte à chaque peau, à chaque lumière et à chaque tenue.',
			pseudo: 'chloe.bertin',
		}),
		photos: { principale: 'photo-3.webp', galerie: ['photo-4.webp'] },
		attendu: { slug: 'chloe-bertin', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 4,
		cle: 'indisponible',
		sertA: 'Complet, publié, mais indisponible : la recherche l’exclut.',
		compte: { email: profileUrl('indisponible'), nom: 'Manon Faure' },
		profil: {
			...completeProfile({
				firstName: 'Manon',
				lastName: 'Faure',
				artistName: 'Manon Faure Maquillage',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse à Annecy, je suis en pause pour quelques mois et je ne prends plus de nouvelles dates pour l’instant. Mon portfolio reste en ligne : vous y trouverez mes mariées de l’été dernier et les séances photo de l’hiver.',
				pseudo: 'manon.faure',
			}),
			available: false,
		},
		photos: { principale: 'photo-4.webp', galerie: ['photo-5.webp'] },
		attendu: { slug: 'manon-faure', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 5,
		cle: 'disponibilite-inconnue',
		sertA: 'Complet, disponibilité non renseignée (nulle) : comptée comme disponible, comme sur l’ancien site.',
		compte: { email: profileUrl('disponibilite-inconnue'), nom: 'Jade Roussel' },
		profil: {
			...completeProfile({
				firstName: 'Jade',
				lastName: 'Roussel',
				artistName: 'Jade Roussel Make-up',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Je maquille à Annecy et dans toute la Haute-Savoie depuis six ans : mariées, invitées, séances photo et spectacles. Je travaille avec des produits de qualité professionnelle et je prends soin des peaux sensibles comme des peaux mixtes.',
				pseudo: 'jade.roussel',
			}),
			available: null,
		},
		photos: { principale: 'photo-5.webp', galerie: ['photo-6.webp'] },
		attendu: { slug: 'jade-roussel', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 6,
		cle: 'vide',
		sertA: 'Coquille vide, telle que l’inscription la crée : brouillon, noindex, absente de la recherche.',
		compte: { email: profileUrl('vide'), nom: 'Nina Perret' },
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
		compte: { email: profileUrl('actif-non-publiable'), nom: 'Clara Dumas' },
		profil: {
			...completeProfile({
				firstName: 'Clara',
				lastName: 'Dumas',
				artistName: 'Clara Dumas Maquillage',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse à Annecy, je compose chaque maquillage avec vous : mariage, soirée ou séance photo. Chaque demande est différente, alors je préfère en parler avant de donner un prix, selon le lieu, l’heure et le nombre de personnes à maquiller.',
				pseudo: 'clara.dumas',
			}),
			serviceOffers: [
				{ name: 'Maquillage de la mariée', description: 'Essai compris.', ...price('Sur devis') },
				{ name: 'Maquillage de groupe', description: 'Pour le cortège.', ...price('Selon le nombre de personnes') },
			],
		},
		photos: { principale: 'photo-6.webp', galerie: ['photo-1.webp'] },
		attendu: { slug: 'clara-dumas', ...PUBLISHED_COMPLETE, publishable: false },
	},
	{
		numero: 8,
		cle: 'sans-contact-public',
		sertA:
			'Aucun moyen de contact public : ni réseau, ni coordonnées montrées (enregistrées mais fermées). Elle est rangée après les autres dans la recherche.',
		compte: { email: profileUrl('sans-contact-public'), nom: 'Louise Girard' },
		profil: {
			...completeProfile({
				firstName: 'Louise',
				lastName: 'Girard',
				artistName: 'Louise Girard Beauté',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse à Annecy, je prépare les mariées et leurs proches, chez elles ou sur le lieu de la fête. Je construis chaque maquillage avec vous, selon votre journée, votre teint et votre budget, avec un essai avant le grand jour.',
				pseudo: 'louise.girard',
			}),
			networks: {},
			contactDetails: { phone: '06 39 98 10 08', email: 'contact@louise-girard.example.test' },
			publicContact: false,
		},
		photos: { principale: 'photo-2.webp', galerie: ['photo-4.webp'] },
		attendu: { slug: 'louise-girard', ...PUBLISHED_COMPLETE, completeness: 12, publishable: false },
	},
	{
		numero: 9,
		cle: 'ancien-nom-accentue',
		sertA: 'Ancien nom d’utilisateur « zoé lefèvre » : le slug zoe-lefevre, la redirection 308, l’encodage.',
		compte: { email: profileUrl('ancien-nom-accentue'), nom: 'Zoé Lefèvre' },
		profil: {
			...completeProfile({
				firstName: 'Zoé',
				lastName: 'Lefèvre',
				artistName: 'Zoé Lefèvre Maquillage',
				specialty: 'Maquillage mariage',
				city: CITIES.thonon,
				description:
					'Maquilleuse au bord du Léman depuis 2019, j’accompagne les mariées de Thonon, d’Évian et du Chablais. J’aime les maquillages lumineux et naturels, qui révèlent sans transformer, et je me déplace jusqu’à vous avec tout mon matériel.',
				pseudo: 'zoe.lefevre',
			}),
			legacyUsername: 'zoé lefèvre',
		},
		photos: { principale: 'photo-3.webp', galerie: ['photo-5.webp'] },
		attendu: { slug: 'zoe-lefevre', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 10,
		cle: 'verifiee',
		sertA: 'Vérifiée par un admin, avec le badge des cartes : le badge.',
		compte: { email: profileUrl('verifiee'), nom: 'Emma Chevalier' },
		profil: {
			...completeProfile({
				firstName: 'Emma',
				lastName: 'Chevalier',
				artistName: 'Emma Chevalier Make-up',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse diplômée, installée à Annecy, je travaille pour les mariages, les tournages et les défilés. Mon activité a été vérifiée : je vous accompagne de l’essai au jour J, avec un maquillage qui tient et qui vous ressemble.',
				pseudo: 'emma.chevalier',
			}),
			verified: true,
			verifiedAt: DEMO_VERIFICATION,
			superArtist: true,
		},
		photos: { principale: 'photo-4.webp', galerie: ['photo-6.webp'] },
		attendu: { slug: 'emma-chevalier', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 11,
		cle: 'masquee',
		sertA: 'Complet et publiable, masqué par un admin : 404, absent de la recherche et du sitemap.',
		compte: { email: profileUrl('masquee'), nom: 'Alice Fontaine' },
		profil: {
			...completeProfile({
				firstName: 'Alice',
				lastName: 'Fontaine',
				artistName: 'Alice Fontaine Maquillage',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse à Annecy, je travaille surtout pour les mariages d’été au bord du lac et pour les séances photo en montagne. Je vous propose un essai chez vous, puis le maquillage du jour J, avec des retouches jusqu’au début de la soirée.',
				pseudo: 'alice.fontaine',
			}),
			chosenStatus: 'hidden',
			reason: 'Masqué le temps de vérifier les photos du portfolio.',
		},
		photos: { principale: 'photo-5.webp', galerie: ['photo-2.webp'] },
		attendu: { slug: 'alice-fontaine', ...PUBLISHED_COMPLETE, status: 'hidden' },
	},
	{
		numero: 12,
		cle: 'textes-maximaux',
		sertA: 'Chaque texte à sa longueur maximale, le rayon et la galerie au plus : la mise en page.',
		compte: { email: profileUrl('textes-maximaux'), nom: `${LONGEST_FIRST_NAME} ${LONGEST_NAME}` },
		profil: {
			firstName: LONGEST_FIRST_NAME,
			lastName: LONGEST_NAME,
			artistName: textOfLength('Maison de maquillage des mariées du lac et des montagnes', NAME_MAX_LENGTH),
			specialty: textOfLength('Maquillage mariage, soirée, mode, cinéma et effets spéciaux', NAME_MAX_LENGTH),
			city: CITIES.laPlusLongue,
			radiusKm: RADIUS_BOUNDS_KM.max,
			homeService: true,
			available: true,
			description: textOfLength(LONG_DESCRIPTION, DESCRIPTION_MAX_LENGTH),
			serviceOffers: [1, 2, 3].map(longestServiceOffer),
			skills: [1, 2, 3].map(numero => ({
				name: textOfLength(`Compétence ${numero} : maquillage longue tenue pour peaux sensibles`, NAME_MAX_LENGTH),
				description: textOfLength(LONG_DESCRIPTION, DESCRIPTION_MAX_LENGTH),
			})),
			languages: [1, 2, 3].map(numero => ({
				name: textOfLength(`Langue ${numero} : français, anglais, italien, espagnol, allemand`, NAME_MAX_LENGTH),
			})),
			courses: [1, 2, 3].map(numero => ({
				diploma: textOfLength(`Diplôme ${numero} : certificat de maquillage artistique et de scène`, NAME_MAX_LENGTH),
				school: textOfLength('École fictive supérieure des métiers du maquillage et de la beauté', NAME_MAX_LENGTH),
				graduatedAt: `201${numero}-06-30`,
				description: textOfLength(LONG_DESCRIPTION, DESCRIPTION_MAX_LENGTH),
			})),
			experiences: [1, 2, 3].map(numero => ({
				company: textOfLength(`Entreprise ${numero} : studio fictif de maquillage et de coiffure`, NAME_MAX_LENGTH),
				jobTitle: textOfLength('Maquilleuse principale, cheffe d’équipe maquillage et coiffure', NAME_MAX_LENGTH),
				city: textOfLength('Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson', NAME_MAX_LENGTH),
				startDate: `201${numero}-01-02`,
				endDate: `201${numero + 1}-12-31`,
				description: textOfLength(LONG_DESCRIPTION, DESCRIPTION_MAX_LENGTH),
			})),
			networks: {
				youtube: longestLink('youtube'),
				facebook: longestLink('facebook'),
				instagram: longestLink('instagram'),
				website: longestLink('www'),
				linkedin: longestLink('linkedin'),
			},
			...publicContactDetails(LONGEST_PHONE, LONGEST_EMAIL),
		},
		photos: {
			principale: 'photo-6.webp',
			galerie: Array.from(
				{ length: GALLERY_MAX },
				(_, rang) => DEMO_PHOTOS[rang % DEMO_PHOTOS.length] ?? 'photo-1.webp'
			),
		},
		attendu: {
			slug: 'marie-apolline-josephine-berenice-eugenie-heloise-marie-apolline-josep',
			...PUBLISHED_COMPLETE,
		},
	},
]

/**
 * The five profile types that carry the zones of tickets 258 to 260, after the twelve: two
 * communes that share a postal code, a zone of Belgium with a town, a zone of France and Italy, and
 * a zone left to review (a shared postal code, as the import leaves it). They are loaded on the
 * bench with the twelve (`LOADED_DEMO_PROFILES`) but kept apart: the pages and the search do not
 * read a zone of countries until tickets 263 and 264, and the twelve are what they are tested on.
 */
export const DEMO_ZONE_PROFILES: readonly DemoProfile[] = [
	{
		numero: 13,
		cle: 'code-postal-partage-a',
		sertA:
			'Complet, à Valbrume, commune fictive qui partage son code postal avec Hautcombe : un code postal sans commune unique.',
		compte: { email: profileUrl('code-postal-partage-a'), nom: 'Océane Colin' },
		profil: completeProfile({
			firstName: 'Océane',
			lastName: 'Colin',
			artistName: 'Océane Colin Maquillage',
			specialty: 'Maquillage mariage',
			city: CITIES.valbrume,
			description:
				'Maquilleuse à Valbrume, je prépare les mariées du haut pays : essai chez vous, maquillage du jour J et retouches. Je travaille avec des produits choisis pour tenir toute la journée, en photo comme à l’œil nu, et je me déplace avec tout mon matériel.',
			pseudo: 'oceane.colin',
		}),
		photos: { principale: 'photo-1.webp', galerie: ['photo-2.webp'] },
		attendu: { slug: 'oceane-colin', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 14,
		cle: 'code-postal-partage-b',
		sertA: 'Complet, à Hautcombe, l’autre commune fictive du même code postal.',
		compte: { email: profileUrl('code-postal-partage-b'), nom: 'Sofia Lambert' },
		profil: completeProfile({
			firstName: 'Sofia',
			lastName: 'Lambert',
			artistName: 'Sofia Lambert Beauté',
			specialty: 'Maquillage soirée',
			city: CITIES.hautcombe,
			description:
				'Maquilleuse à Hautcombe, je maquille pour les soirées, les séances photo et les mariages en montagne. Teint lumineux, regard travaillé : je prends le temps d’un essai pour que le jour J se passe sans surprise, avec des produits adaptés à chaque peau.',
			pseudo: 'sofia.lambert',
		}),
		photos: { principale: 'photo-3.webp', galerie: ['photo-4.webp'] },
		attendu: { slug: 'sofia-lambert', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 15,
		cle: 'zone-belgique',
		sertA:
			'Complet, zone de pays [BE] avec une ville (Bruxelles) : la règle lit le nom du pays, le texte de zone dit « Bruxelles (Belgique) ».',
		compte: { email: profileUrl('zone-belgique'), nom: 'Camille Renard' },
		profil: {
			...completeProfile({
				firstName: 'Camille',
				lastName: 'Renard',
				artistName: 'Camille Renard Make-up',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse installée à Bruxelles, je me déplace dans toute la Belgique pour les mariages, les soirées et les séances photo. Je propose un essai, puis le maquillage du jour J avec des retouches, et je travaille en français comme en anglais.',
				pseudo: 'camille.renard',
			}),
			city: {},
			radiusKm: null,
			zoneKind: 'countries',
			countries: ['BE'],
			town: 'Bruxelles',
		},
		photos: { principale: 'photo-5.webp', galerie: ['photo-6.webp'] },
		attendu: { slug: 'camille-renard', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 16,
		cle: 'zone-france-italie',
		sertA: 'Complet, zone de pays [FR, IT] : la France s’y dit avec l’Italie, la règle lit le premier pays étranger.',
		compte: { email: profileUrl('zone-france-italie'), nom: 'Elsa Marchand' },
		profil: {
			...completeProfile({
				firstName: 'Elsa',
				lastName: 'Marchand',
				artistName: 'Elsa Marchand Maquillage',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse entre la France et l’Italie, je me déplace des Alpes jusqu’au Piémont pour les mariages et les tournages. Je prépare chaque maquillage avec vous, de l’essai au jour J, en français, en italien et en anglais.',
				pseudo: 'elsa.marchand',
			}),
			city: {},
			radiusKm: null,
			zoneKind: 'countries',
			countries: ['FR', 'IT'],
		},
		photos: { principale: 'photo-6.webp', galerie: ['photo-1.webp'] },
		attendu: { slug: 'elsa-marchand', ...PUBLISHED_COMPLETE },
	},
	{
		numero: 17,
		cle: 'zone-a-revoir',
		sertA:
			'Zone à revoir : l’import n’a pas pu choisir entre deux communes du même code postal ; la zone est vide, la revue est privée.',
		compte: { email: profileUrl('zone-a-revoir'), nom: 'Julie Perrin' },
		profil: {
			...completeProfile({
				firstName: 'Julie',
				lastName: 'Perrin',
				artistName: 'Julie Perrin Maquillage',
				specialty: 'Maquillage mariage',
				city: CITIES.annecy,
				description:
					'Maquilleuse dans le haut pays, je prépare les mariées et leurs invitées chez elles ou sur le lieu de la fête. Je viens avec tout mon matériel et je prends le temps d’un essai pour que le jour J se passe sans surprise, avec des produits adaptés.',
				pseudo: 'julie.perrin',
			}),
			city: {},
			radiusKm: null,
			zoneReview: {
				reason: 'sharedPostalCode',
				postalCode: '74990',
				candidates: [
					{ inseeCode: '74990', name: 'Valbrume', department: '74' },
					{ inseeCode: '74991', name: 'Hautcombe', department: '74' },
				],
			},
		},
		photos: { principale: 'photo-2.webp', galerie: [] },
		attendu: {
			slug: 'julie-perrin',
			...PUBLISHED_COMPLETE,
			completeness: 11,
			active: false,
			publishable: false,
		},
	},
]

/** The profile types the bench loads: the twelve, then those of the zones (tickets 258 to 260). */
export const LOADED_DEMO_PROFILES: readonly DemoProfile[] = [...DEMO_PROFILES, ...DEMO_ZONE_PROFILES]

/** The longest values of the profile with every text at its longest, for the checks of its lengths. */
export const DEMO_LENGTHS = {
	email: { valeur: LONGEST_EMAIL, maximum: EMAIL_MAX_LENGTH },
	telephone: { valeur: LONGEST_PHONE, maximum: PHONE_MAX_LENGTH },
} as const
