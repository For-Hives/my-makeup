/**
 * The countries a zone may name (plans/PLAN-ZONES.md §3.2 and §3.4; ticket 258): the 249 codes of
 * ISO 3166-1 alpha-2, less the twelve overseas codes that the official list of communes
 * (geo.api.gouv.fr) already holds as communes of France (RE, GP, MQ, GF, YT, PM, BL, MF, WF, PF,
 * NC, TF), so 237 countries, France included (for a list of several countries).
 *
 * Each country has its French name, its preposition (« en Belgique », « au Luxembourg », « aux
 * Pays-Bas », « à Malte ») and a few other names the import recognises (« Angleterre », « Hollande »,
 * « USA »). The flag is computed from the code.
 *
 * The names were written once from `Intl.DisplayNames('fr')` by a throwaway script kept out of the
 * repository, then read and frozen here: `Intl` changes with the version of ICU, and the server
 * and the browser would render a page differently. A few names were shortened by hand so that the
 * rule of the old site (`usableCity`, src/lib/profile/completeness.ts) reads each as a usable city,
 * « France » excepted. Where French has an article (« la Barbade », « la Grenade »), the
 * preposition is « à » alone: the four prepositions are all the list knows.
 *
 * Pure, no dependency: read by the rule of the profile and by the browser.
 */

/** The prepositions that place someone in a country: « en Italie », « au Maroc », « aux Pays-Bas », « à Malte ». */
export type Preposition = 'en' | 'au' | 'aux' | 'à'

export interface Country {
	/** ISO 3166-1 alpha-2, in capitals */
	readonly code: string
	/** The French name, as the public page writes it */
	readonly name: string
	readonly preposition: Preposition
	/** Other names the import recognises; never the name of another country */
	readonly aliases?: readonly string[]
}

/** France: part of a list of several countries, never a zone alone (a commune says it). */
export const FRANCE_CODE = 'FR'

/** The overseas codes left out: the official list of communes holds them (geo.api.gouv.fr). */
export const OVERSEAS_CODES: readonly string[] = [
	'RE',
	'GP',
	'MQ',
	'GF',
	'YT',
	'PM',
	'BL',
	'MF',
	'WF',
	'PF',
	'NC',
	'TF',
]

/** The countries, by French name. */
export const COUNTRIES: readonly Country[] = [
	{ code: 'AF', name: 'Afghanistan', preposition: 'en' },
	{ code: 'ZA', name: 'Afrique du Sud', preposition: 'en' },
	{ code: 'AL', name: 'Albanie', preposition: 'en' },
	{ code: 'DZ', name: 'Algérie', preposition: 'en' },
	{ code: 'DE', name: 'Allemagne', preposition: 'en', aliases: ['Deutschland'] },
	{ code: 'AD', name: 'Andorre', preposition: 'en' },
	{ code: 'AO', name: 'Angola', preposition: 'en' },
	{ code: 'AI', name: 'Anguilla', preposition: 'à' },
	{ code: 'AQ', name: 'Antarctique', preposition: 'en' },
	{ code: 'AG', name: 'Antigua-et-Barbuda', preposition: 'à' },
	{ code: 'SA', name: 'Arabie saoudite', preposition: 'en' },
	{ code: 'AR', name: 'Argentine', preposition: 'en' },
	{ code: 'AM', name: 'Arménie', preposition: 'en' },
	{ code: 'AW', name: 'Aruba', preposition: 'à' },
	{ code: 'AU', name: 'Australie', preposition: 'en' },
	{ code: 'AT', name: 'Autriche', preposition: 'en' },
	{ code: 'AZ', name: 'Azerbaïdjan', preposition: 'en' },
	{ code: 'BS', name: 'Bahamas', preposition: 'aux' },
	{ code: 'BH', name: 'Bahreïn', preposition: 'au' },
	{ code: 'BD', name: 'Bangladesh', preposition: 'au' },
	{ code: 'BB', name: 'Barbade', preposition: 'à' },
	{ code: 'BE', name: 'Belgique', preposition: 'en' },
	{ code: 'BZ', name: 'Belize', preposition: 'au' },
	{ code: 'BJ', name: 'Bénin', preposition: 'au' },
	{ code: 'BM', name: 'Bermudes', preposition: 'aux' },
	{ code: 'BT', name: 'Bhoutan', preposition: 'au' },
	{ code: 'BY', name: 'Biélorussie', preposition: 'en', aliases: ['Bélarus'] },
	{ code: 'BO', name: 'Bolivie', preposition: 'en' },
	{ code: 'BA', name: 'Bosnie-Herzégovine', preposition: 'en' },
	{ code: 'BW', name: 'Botswana', preposition: 'au' },
	{ code: 'BV', name: 'Bouvet (île)', preposition: 'à' },
	{ code: 'BR', name: 'Brésil', preposition: 'au' },
	{ code: 'BN', name: 'Brunei', preposition: 'au' },
	{ code: 'BG', name: 'Bulgarie', preposition: 'en' },
	{ code: 'BF', name: 'Burkina Faso', preposition: 'au' },
	{ code: 'BI', name: 'Burundi', preposition: 'au' },
	{ code: 'KH', name: 'Cambodge', preposition: 'au' },
	{ code: 'CM', name: 'Cameroun', preposition: 'au' },
	{ code: 'CA', name: 'Canada', preposition: 'au' },
	{ code: 'CV', name: 'Cap-Vert', preposition: 'au', aliases: ['Cabo Verde'] },
	{ code: 'CL', name: 'Chili', preposition: 'au' },
	{ code: 'CN', name: 'Chine', preposition: 'en' },
	{ code: 'CX', name: 'Christmas (île)', preposition: 'à' },
	{ code: 'CY', name: 'Chypre', preposition: 'à' },
	{ code: 'CO', name: 'Colombie', preposition: 'en' },
	{ code: 'KM', name: 'Comores', preposition: 'aux' },
	{ code: 'CG', name: 'Congo-Brazzaville', preposition: 'au' },
	{ code: 'CD', name: 'Congo-Kinshasa', preposition: 'au', aliases: ['RDC'] },
	{ code: 'KP', name: 'Corée du Nord', preposition: 'en' },
	{ code: 'KR', name: 'Corée du Sud', preposition: 'en' },
	{ code: 'CR', name: 'Costa Rica', preposition: 'au' },
	{ code: 'CI', name: 'Côte d’Ivoire', preposition: 'en', aliases: ["Cote d'Ivoire"] },
	{ code: 'HR', name: 'Croatie', preposition: 'en' },
	{ code: 'CU', name: 'Cuba', preposition: 'à' },
	{ code: 'CW', name: 'Curaçao', preposition: 'à' },
	{ code: 'DK', name: 'Danemark', preposition: 'au' },
	{ code: 'DJ', name: 'Djibouti', preposition: 'en' },
	{ code: 'DM', name: 'Dominique', preposition: 'en' },
	{ code: 'EG', name: 'Égypte', preposition: 'en' },
	{ code: 'AE', name: 'Émirats arabes unis', preposition: 'aux', aliases: ['Émirats', 'Dubaï', 'Emirats arabes unis'] },
	{ code: 'EC', name: 'Équateur', preposition: 'en' },
	{ code: 'ER', name: 'Érythrée', preposition: 'en' },
	{ code: 'ES', name: 'Espagne', preposition: 'en' },
	{ code: 'EE', name: 'Estonie', preposition: 'en' },
	{ code: 'SZ', name: 'Eswatini', preposition: 'en', aliases: ['Swaziland'] },
	{ code: 'US', name: 'États-Unis', preposition: 'aux', aliases: ['USA', 'États Unis', 'Etats-Unis'] },
	{ code: 'ET', name: 'Éthiopie', preposition: 'en' },
	{ code: 'FJ', name: 'Fidji', preposition: 'aux' },
	{ code: 'FI', name: 'Finlande', preposition: 'en' },
	{ code: 'FR', name: 'France', preposition: 'en' },
	{ code: 'GA', name: 'Gabon', preposition: 'au' },
	{ code: 'GM', name: 'Gambie', preposition: 'en' },
	{ code: 'GE', name: 'Géorgie', preposition: 'en' },
	{ code: 'GS', name: 'Géorgie du Sud-et-Sandwich du Sud', preposition: 'en' },
	{ code: 'GH', name: 'Ghana', preposition: 'au' },
	{ code: 'GI', name: 'Gibraltar', preposition: 'à' },
	{ code: 'GR', name: 'Grèce', preposition: 'en' },
	{ code: 'GD', name: 'Grenade', preposition: 'à' },
	{ code: 'GL', name: 'Groenland', preposition: 'au' },
	{ code: 'GU', name: 'Guam', preposition: 'à' },
	{ code: 'GT', name: 'Guatemala', preposition: 'au' },
	{ code: 'GG', name: 'Guernesey', preposition: 'à' },
	{ code: 'GN', name: 'Guinée', preposition: 'en' },
	{ code: 'GQ', name: 'Guinée équatoriale', preposition: 'en' },
	{ code: 'GW', name: 'Guinée-Bissau', preposition: 'en' },
	{ code: 'GY', name: 'Guyana', preposition: 'au' },
	{ code: 'HT', name: 'Haïti', preposition: 'en' },
	{ code: 'HN', name: 'Honduras', preposition: 'au' },
	{ code: 'HK', name: 'Hong Kong', preposition: 'à', aliases: ['Hong-Kong'] },
	{ code: 'HU', name: 'Hongrie', preposition: 'en' },
	{ code: 'AX', name: 'Îles Åland', preposition: 'aux' },
	{ code: 'KY', name: 'Îles Caïmans', preposition: 'aux' },
	{ code: 'CC', name: 'Îles Cocos', preposition: 'aux' },
	{ code: 'CK', name: 'Îles Cook', preposition: 'aux' },
	{ code: 'FO', name: 'Îles Féroé', preposition: 'aux' },
	{ code: 'HM', name: 'Îles Heard-et-MacDonald', preposition: 'aux' },
	{ code: 'FK', name: 'Îles Malouines', preposition: 'aux' },
	{ code: 'MP', name: 'Îles Mariannes du Nord', preposition: 'aux' },
	{ code: 'MH', name: 'Îles Marshall', preposition: 'aux' },
	{ code: 'UM', name: 'Îles mineures éloignées des États-Unis', preposition: 'aux' },
	{ code: 'PN', name: 'Îles Pitcairn', preposition: 'aux' },
	{ code: 'SB', name: 'Îles Salomon', preposition: 'aux' },
	{ code: 'TC', name: 'Îles Turques-et-Caïques', preposition: 'aux' },
	{ code: 'VG', name: 'Îles Vierges britanniques', preposition: 'aux' },
	{ code: 'VI', name: 'Îles Vierges des États-Unis', preposition: 'aux' },
	{ code: 'IN', name: 'Inde', preposition: 'en' },
	{ code: 'ID', name: 'Indonésie', preposition: 'en' },
	{ code: 'IQ', name: 'Irak', preposition: 'en' },
	{ code: 'IR', name: 'Iran', preposition: 'en' },
	{ code: 'IE', name: 'Irlande', preposition: 'en' },
	{ code: 'IS', name: 'Islande', preposition: 'en' },
	{ code: 'IL', name: 'Israël', preposition: 'en' },
	{ code: 'IT', name: 'Italie', preposition: 'en' },
	{ code: 'JM', name: 'Jamaïque', preposition: 'en' },
	{ code: 'JP', name: 'Japon', preposition: 'au' },
	{ code: 'JE', name: 'Jersey', preposition: 'à' },
	{ code: 'JO', name: 'Jordanie', preposition: 'en' },
	{ code: 'KZ', name: 'Kazakhstan', preposition: 'au' },
	{ code: 'KE', name: 'Kenya', preposition: 'au' },
	{ code: 'KG', name: 'Kirghizstan', preposition: 'au' },
	{ code: 'KI', name: 'Kiribati', preposition: 'aux' },
	{ code: 'KW', name: 'Koweït', preposition: 'au' },
	{ code: 'LA', name: 'Laos', preposition: 'au' },
	{ code: 'LS', name: 'Lesotho', preposition: 'au' },
	{ code: 'LV', name: 'Lettonie', preposition: 'en' },
	{ code: 'LB', name: 'Liban', preposition: 'au' },
	{ code: 'LR', name: 'Liberia', preposition: 'au' },
	{ code: 'LY', name: 'Libye', preposition: 'en' },
	{ code: 'LI', name: 'Liechtenstein', preposition: 'au' },
	{ code: 'LT', name: 'Lituanie', preposition: 'en' },
	{ code: 'LU', name: 'Luxembourg', preposition: 'au' },
	{ code: 'MO', name: 'Macao', preposition: 'à' },
	{ code: 'MK', name: 'Macédoine du Nord', preposition: 'en', aliases: ['Macédoine'] },
	{ code: 'MG', name: 'Madagascar', preposition: 'à' },
	{ code: 'MY', name: 'Malaisie', preposition: 'en' },
	{ code: 'MW', name: 'Malawi', preposition: 'au' },
	{ code: 'MV', name: 'Maldives', preposition: 'aux' },
	{ code: 'ML', name: 'Mali', preposition: 'au' },
	{ code: 'MT', name: 'Malte', preposition: 'à' },
	{ code: 'IM', name: 'Man (île de)', preposition: 'à' },
	{ code: 'MA', name: 'Maroc', preposition: 'au' },
	{ code: 'MU', name: 'Maurice', preposition: 'à' },
	{ code: 'MR', name: 'Mauritanie', preposition: 'en' },
	{ code: 'MX', name: 'Mexique', preposition: 'au' },
	{ code: 'FM', name: 'Micronésie', preposition: 'en' },
	{ code: 'MD', name: 'Moldavie', preposition: 'en' },
	{ code: 'MC', name: 'Monaco', preposition: 'à' },
	{ code: 'MN', name: 'Mongolie', preposition: 'en' },
	{ code: 'ME', name: 'Monténégro', preposition: 'au' },
	{ code: 'MS', name: 'Montserrat', preposition: 'à' },
	{ code: 'MZ', name: 'Mozambique', preposition: 'au' },
	{ code: 'MM', name: 'Myanmar (Birmanie)', preposition: 'au', aliases: ['Birmanie', 'Myanmar'] },
	{ code: 'NA', name: 'Namibie', preposition: 'en' },
	{ code: 'NR', name: 'Nauru', preposition: 'à' },
	{ code: 'NP', name: 'Népal', preposition: 'au' },
	{ code: 'NI', name: 'Nicaragua', preposition: 'au' },
	{ code: 'NE', name: 'Niger', preposition: 'au' },
	{ code: 'NG', name: 'Nigeria', preposition: 'au' },
	{ code: 'NU', name: 'Niue', preposition: 'à' },
	{ code: 'NF', name: 'Norfolk (île)', preposition: 'à' },
	{ code: 'NO', name: 'Norvège', preposition: 'en' },
	{ code: 'NZ', name: 'Nouvelle-Zélande', preposition: 'en' },
	{ code: 'OM', name: 'Oman', preposition: 'à' },
	{ code: 'UG', name: 'Ouganda', preposition: 'en' },
	{ code: 'UZ', name: 'Ouzbékistan', preposition: 'en' },
	{ code: 'PK', name: 'Pakistan', preposition: 'au' },
	{ code: 'PW', name: 'Palaos', preposition: 'aux' },
	{ code: 'PA', name: 'Panama', preposition: 'au' },
	{ code: 'PG', name: 'Papouasie-Nouvelle-Guinée', preposition: 'en' },
	{ code: 'PY', name: 'Paraguay', preposition: 'au' },
	{ code: 'NL', name: 'Pays-Bas', preposition: 'aux', aliases: ['Hollande', 'Pays Bas'] },
	{ code: 'BQ', name: 'Pays-Bas caribéens', preposition: 'aux' },
	{ code: 'PE', name: 'Pérou', preposition: 'au' },
	{ code: 'PH', name: 'Philippines', preposition: 'aux' },
	{ code: 'PL', name: 'Pologne', preposition: 'en' },
	{ code: 'PR', name: 'Porto Rico', preposition: 'à' },
	{ code: 'PT', name: 'Portugal', preposition: 'au' },
	{ code: 'QA', name: 'Qatar', preposition: 'au' },
	{ code: 'CF', name: 'République centrafricaine', preposition: 'en' },
	{ code: 'DO', name: 'République dominicaine', preposition: 'en' },
	{ code: 'RO', name: 'Roumanie', preposition: 'en' },
	{
		code: 'GB',
		name: 'Royaume-Uni',
		preposition: 'au',
		aliases: ['Angleterre', 'Écosse', 'Pays de Galles', 'Irlande du Nord', 'Grande-Bretagne', 'UK', 'Royaume Uni'],
	},
	{ code: 'RU', name: 'Russie', preposition: 'en' },
	{ code: 'RW', name: 'Rwanda', preposition: 'au' },
	{ code: 'EH', name: 'Sahara occidental', preposition: 'au' },
	{ code: 'KN', name: 'Saint-Christophe-et-Niévès', preposition: 'à' },
	{ code: 'SM', name: 'Saint-Marin', preposition: 'à' },
	{ code: 'VC', name: 'Saint-Vincent-et-les Grenadines', preposition: 'à' },
	{ code: 'SH', name: 'Sainte-Hélène', preposition: 'à' },
	{ code: 'LC', name: 'Sainte-Lucie', preposition: 'à' },
	{ code: 'SV', name: 'Salvador', preposition: 'au' },
	{ code: 'WS', name: 'Samoa', preposition: 'aux' },
	{ code: 'AS', name: 'Samoa américaines', preposition: 'aux' },
	{ code: 'ST', name: 'Sao Tomé-et-Principe', preposition: 'à' },
	{ code: 'SN', name: 'Sénégal', preposition: 'au' },
	{ code: 'RS', name: 'Serbie', preposition: 'en' },
	{ code: 'SC', name: 'Seychelles', preposition: 'aux' },
	{ code: 'SL', name: 'Sierra Leone', preposition: 'en' },
	{ code: 'SG', name: 'Singapour', preposition: 'à' },
	{ code: 'SX', name: 'Sint-Maarten', preposition: 'à', aliases: ['Saint-Martin (partie néerlandaise)'] },
	{ code: 'SK', name: 'Slovaquie', preposition: 'en' },
	{ code: 'SI', name: 'Slovénie', preposition: 'en' },
	{ code: 'SO', name: 'Somalie', preposition: 'en' },
	{ code: 'SD', name: 'Soudan', preposition: 'au' },
	{ code: 'SS', name: 'Soudan du Sud', preposition: 'au' },
	{ code: 'LK', name: 'Sri Lanka', preposition: 'au', aliases: ['Ceylan'] },
	{ code: 'SE', name: 'Suède', preposition: 'en' },
	{ code: 'CH', name: 'Suisse', preposition: 'en', aliases: ['Confédération helvétique'] },
	{ code: 'SR', name: 'Suriname', preposition: 'au' },
	{ code: 'SJ', name: 'Svalbard et Jan Mayen', preposition: 'au' },
	{ code: 'SY', name: 'Syrie', preposition: 'en' },
	{ code: 'TJ', name: 'Tadjikistan', preposition: 'au' },
	{ code: 'TW', name: 'Taïwan', preposition: 'à' },
	{ code: 'TZ', name: 'Tanzanie', preposition: 'en' },
	{ code: 'TD', name: 'Tchad', preposition: 'au' },
	{ code: 'CZ', name: 'Tchéquie', preposition: 'en', aliases: ['République tchèque'] },
	{ code: 'IO', name: 'Territoire britannique de l’océan Indien', preposition: 'au' },
	{ code: 'PS', name: 'Territoires palestiniens', preposition: 'aux', aliases: ['Palestine'] },
	{ code: 'TH', name: 'Thaïlande', preposition: 'en' },
	{ code: 'TL', name: 'Timor oriental', preposition: 'au', aliases: ['Timor-Leste'] },
	{ code: 'TG', name: 'Togo', preposition: 'au' },
	{ code: 'TK', name: 'Tokelau', preposition: 'aux' },
	{ code: 'TO', name: 'Tonga', preposition: 'aux' },
	{ code: 'TT', name: 'Trinité-et-Tobago', preposition: 'en' },
	{ code: 'TN', name: 'Tunisie', preposition: 'en' },
	{ code: 'TM', name: 'Turkménistan', preposition: 'au' },
	{ code: 'TR', name: 'Turquie', preposition: 'en', aliases: ['Türkiye'] },
	{ code: 'TV', name: 'Tuvalu', preposition: 'à' },
	{ code: 'UA', name: 'Ukraine', preposition: 'en' },
	{ code: 'UY', name: 'Uruguay', preposition: 'en' },
	{ code: 'VU', name: 'Vanuatu', preposition: 'au' },
	{ code: 'VA', name: 'Vatican', preposition: 'au', aliases: ['Cité du Vatican', 'État de la Cité du Vatican'] },
	{ code: 'VE', name: 'Venezuela', preposition: 'au' },
	{ code: 'VN', name: 'Viêt Nam', preposition: 'au', aliases: ['Vietnam'] },
	{ code: 'YE', name: 'Yémen', preposition: 'au' },
	{ code: 'ZM', name: 'Zambie', preposition: 'en' },
	{ code: 'ZW', name: 'Zimbabwe', preposition: 'au' },
]

const BY_CODE: ReadonlyMap<string, Country> = new Map(COUNTRIES.map(country => [country.code, country]))

/** Lower case, no accents, hyphens and apostrophes as spaces: how a typed name is compared. */
export function countryKey(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'-]/g, ' ').replace(/\s+/g, ' ').trim()
}

const BY_NAME: ReadonlyMap<string, Country> = new Map(
	COUNTRIES.flatMap(country =>
		[country.name, ...(country.aliases ?? [])].map(name => [countryKey(name), country] as const)
	)
)

/** A code as the collection stores it: without spaces around, in capitals; anything else as it came. */
export function normalizedCountryCode(code: unknown): unknown {
	return typeof code === 'string' ? code.trim().toUpperCase() : code
}

/** The country of a code in capitals, or undefined. */
export function countryByCode(code: unknown): Country | undefined {
	return typeof code === 'string' ? BY_CODE.get(code) : undefined
}

/** Whether a text is the code of a country of the list, in capitals. */
export function isCountryCode(code: unknown): code is string {
	return countryByCode(code) !== undefined
}

/** The country a name or another name of it designates (« Hollande » → the Netherlands), or undefined. */
export function countryByName(name: unknown): Country | undefined {
	return typeof name === 'string' ? BY_NAME.get(countryKey(name)) : undefined
}

/** The flag of a country: its two regional indicator letters, computed from the code. */
export function flag(code: string): string {
	return [...code.toUpperCase()].map(letter => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65)).join('')
}

/** « en Belgique », « au Luxembourg », « aux Pays-Bas », « à Malte »; the code itself for an unknown one. */
export function inCountry(code: string): string {
	const country = countryByCode(code)
	return country ? `${country.preposition} ${country.name}` : code
}
