// Public data of the fake Strapi (tests/regression/mock-api.mjs): the profile
// types of plans/02 §6 that the public pages and the sitemap must tell
// apart (1 to 10 and 12; 11 cannot exist in Strapi 4), plus a slug
// collision, an internal account and a description one character short;
// 3 talents and 2 articles. Made up from start to end: invented
// names, @example.test addresses, phone numbers of the range kept for
// fiction (06 39 98). `attendu` is not served: it says what the tests
// expect, written by hand (not computed by src/lib).

const DESCRIPTION_LONGUE =
	'Maquilleuse professionnelle diplômée, je prépare les mariées et leurs proches à domicile ou dans les lieux de réception. ' +
	'Essai en amont, produits adaptés aux peaux sensibles, retouches pendant la séance photo et conseils pour tenir toute la journée.'

const DESCRIPTION_199 = `${'Description fictive de cent quatre-vingt-dix-neuf caractères. '.repeat(4)}`.slice(0, 199)

const OFFRES = [
	{
		name: 'Mariée',
		description: 'Essai, jour J et retouches',
		price: 'à partir de 180 €',
		options: [{ name: 'Essai supplémentaire', description: 'Une heure', price: '60 €' }],
	},
	{
		name: 'Invitée',
		description: 'Maquillage de soirée',
		price: '45 €',
		options: [],
	},
	{
		name: 'Shooting',
		description: 'Studio ou extérieur',
		price: '90 €',
		options: [],
	},
]

// an offer typed with blank lines, as 9 profiles in production (UI-06):
// none of them may render an empty <p> or <h3>
const OFFRE_LIGNES_VIDES = {
	name: 'Shooting',
	description: 'Ligne 1\n\nLigne 2',
	price: '180 €\n\n',
	options: [],
}

// a postal address typed as the city (UI-11): street and number made up
export const ADRESSE_FICTIVE = '7 impasse des Essais Fictifs, 74200 Thonon-les-Bains, France'
// what of it must never be published
export const RUE_FICTIVE = ['impasse', 'Essais Fictifs', '7 impasse']
// a street glued to a made-up commune by a comma, no postal code: nothing
// of it can be published
export const RUE_COLLEE = 'Fictiville,impasse des Essais Fictifs'

const RESEAUX_COMPLETS = {
	instagram: '@studio.fictif',
	facebook: '',
	linkedin: '',
	youtube: '',
	website: 'https://studio.example.test',
	email: 'contact@example.test',
	phone: '06 39 98 00 01',
}

const RESEAUX_VIDES = {
	instagram: '',
	facebook: '',
	linkedin: '',
	youtube: '',
	website: '',
	email: '',
	phone: '',
}

// a complete profile, to which each type below changes one thing
const complet = ({ id, username, createdAt, ...champs }) => ({
	id,
	username,
	createdAt,
	updatedAt: `2026-09-${String(id % 28 || 1).padStart(2, '0')}T08:00:00.000Z`,
	first_name: 'Prénom',
	last_name: 'Fictif',
	company_artist_name: '',
	speciality: 'Maquillage mariée',
	city: 'Annecy',
	action_radius: 30,
	available: true,
	pro: false,
	description: DESCRIPTION_LONGUE,
	skills: [{ name: 'Mariée' }, { name: 'Soirée' }],
	language: [{ name: 'Français' }, { name: 'Anglais' }],
	courses: [
		{
			diploma: 'CAP esthétique',
			school: 'École fictive',
			date_graduation: '2015-06-30',
			course_description: 'Formation initiale',
		},
	],
	experiences: [
		{
			company: 'Studio Fictif',
			job_name: 'Maquilleuse',
			city: 'Annecy',
			date_start: '2016-01-01',
			date_end: null,
			description: 'Mariages et shootings',
		},
	],
	service_offers: OFFRES,
	network: RESEAUX_COMPLETS,
	main_picture: 1,
	image_gallery: [2, 3, 4, 5, 6, 7],
	...champs,
})

export const PROFILS_PUBLICS = [
	// 1 + 9: complete, reference (SEO, JSON-LD), old username with accent and
	// space → 308 to zoe-lefevre; its third offer has blank lines
	complet({
		id: 101,
		username: 'Zoé Lefèvre',
		createdAt: '2023-02-01T10:00:00.000Z',
		first_name: 'Zoé',
		last_name: 'Lefèvre',
		company_artist_name: 'Zoé Make-up',
		service_offers: [...OFFRES.slice(0, 2), OFFRE_LIGNES_VIDES],
		attendu: { slug: 'zoe-lefevre', publiable: true },
	}),
	// 2: complete, email as only channel (hidden by the lists of the API)
	complet({
		id: 102,
		username: 'camille-annemasse',
		createdAt: '2023-03-01T10:00:00.000Z',
		first_name: 'Camille',
		last_name: 'Fictive',
		city: 'Annemasse',
		network: { ...RESEAUX_VIDES, email: 'camille@example.test' },
		attendu: { slug: 'camille-annemasse', publiable: true },
	}),
	// 3: complete, Nantes, capitals in the username
	complet({
		id: 103,
		username: 'LeaNantes',
		createdAt: '2023-04-01T10:00:00.000Z',
		first_name: 'Léa',
		last_name: 'Nantaise',
		city: 'Nantes',
		attendu: { slug: 'leanantes', publiable: true },
	}),
	// 4: complete, not available (out of the search, still indexed)
	complet({
		id: 104,
		username: 'ines-indispo',
		createdAt: '2023-05-01T10:00:00.000Z',
		first_name: 'Inès',
		available: false,
		attendu: { slug: 'ines-indispo', publiable: true },
	}),
	// 5: available never set (47 in production)
	complet({
		id: 105,
		username: 'jade-sans-reponse',
		createdAt: '2023-06-01T10:00:00.000Z',
		first_name: 'Jade',
		available: null,
		action_radius: null,
		attendu: { slug: 'jade-sans-reponse', publiable: true },
	}),
	// 6: empty shell
	{
		id: 106,
		username: 'coquille-vide',
		createdAt: '2023-07-01T10:00:00.000Z',
		updatedAt: '2023-07-01T10:00:00.000Z',
		first_name: 'Coquille',
		last_name: null,
		company_artist_name: null,
		speciality: null,
		city: null,
		action_radius: null,
		available: null,
		pro: false,
		description: null,
		skills: [],
		language: [],
		courses: [],
		experiences: [],
		service_offers: [],
		network: null,
		main_picture: null,
		image_gallery: [],
		attendu: { slug: 'coquille-vide', publiable: false },
	},
	// 7: actif, but no offer with a price
	complet({
		id: 107,
		username: 'manon-sur-devis',
		createdAt: '2023-08-01T10:00:00.000Z',
		first_name: 'Manon',
		service_offers: [{ name: 'Mariée', description: '', price: 'Sur devis', options: [] }],
		attendu: { slug: 'manon-sur-devis', publiable: false },
	}),
	// 8: no public channel (the quote form is off in the tests)
	complet({
		id: 108,
		username: 'lucie-sans-contact',
		createdAt: '2023-09-01T10:00:00.000Z',
		first_name: 'Lucie',
		network: RESEAUX_VIDES,
		attendu: { slug: 'lucie-sans-contact', publiable: false },
	}),
	// 10: verified. Strapi 4 only has `pro` (locked since S42), shown as the
	// « Pro » badge of the search. Type 11 (hidden by the admin) has no
	// field in Strapi 4 (draftAndPublish false, no status): it comes with
	// the v3 (statut, verifie).
	complet({
		id: 113,
		username: 'rose-verifiee',
		createdAt: '2024-08-01T10:00:00.000Z',
		first_name: 'Rose',
		pro: true,
		attendu: { slug: 'rose-verifiee', publiable: true },
	}),
	// collision with 1, created later → -2
	complet({
		id: 109,
		username: 'ZOE LEFEVRE',
		createdAt: '2024-05-01T10:00:00.000Z',
		first_name: 'Zoe',
		last_name: 'Lefevre',
		city: 'Lyon',
		attendu: { slug: 'zoe-lefevre-2', publiable: true },
	}),
	// internal account: never publiable
	complet({
		id: 110,
		username: 'equipe-my-makeup',
		createdAt: '2022-01-01T10:00:00.000Z',
		first_name: 'Équipe',
		speciality: 'CEO My Makeup',
		attendu: { slug: 'equipe-my-makeup', publiable: false },
	}),
	// 12: texts at their maximum lengths (schema.json of the API)
	complet({
		id: 111,
		username: 'Textes Max',
		createdAt: '2024-06-01T10:00:00.000Z',
		first_name: 'Maximilienne'.padEnd(70, 'e'),
		last_name: 'Longuenom'.padEnd(70, 'm'),
		company_artist_name: 'Studio'.padEnd(70, 'o'),
		speciality: 'Maquillage'.padEnd(70, 'x'),
		city: 'Saint-Julien-en-Genevois',
		description: `${DESCRIPTION_LONGUE} `.repeat(10).slice(0, 2000),
		attendu: { slug: 'textes-max', publiable: true },
	}),
	// description of 199 characters: one short
	complet({
		id: 112,
		username: 'nina-199',
		createdAt: '2024-07-01T10:00:00.000Z',
		first_name: 'Nina',
		description: DESCRIPTION_199,
		attendu: { slug: 'nina-199', publiable: false },
	}),
	// UI-11: complete, a postal address typed as the city (made up):
	// publiable by its commune, the street published nowhere. Not available,
	// so it stays out of the search and its counts.
	complet({
		id: 114,
		username: 'adele-adresse',
		createdAt: '2024-09-01T10:00:00.000Z',
		first_name: 'Adèle',
		last_name: 'Fictive',
		city: ADRESSE_FICTIVE,
		available: false,
		attendu: {
			slug: 'adele-adresse',
			publiable: true,
			ville: 'Thonon-les-Bains (74)',
			commune: 'Thonon-les-Bains',
		},
	}),
	// UI-11: complete, a code of département then free text as the city: no
	// street number, shown as typed, and no usable city (as before UI-11), so
	// noindex and out of the sitemap. Not available, out of the search.
	complet({
		id: 115,
		username: 'lea-alentours',
		createdAt: '2024-09-02T10:00:00.000Z',
		first_name: 'Léa',
		last_name: 'Fictive',
		city: '74 et alentours',
		available: false,
		attendu: { slug: 'lea-alentours', publiable: false },
	}),
	// UI-11: complete, a street glued to the commune by a comma, without a
	// space nor a postal code: no usable city (as before UI-11), so noindex
	// and out of the sitemap, and the street published nowhere. Not
	// available, out of the search.
	complet({
		id: 116,
		username: 'ines-virgule',
		createdAt: '2024-09-03T10:00:00.000Z',
		first_name: 'Inès',
		last_name: 'Fictive',
		city: RUE_COLLEE,
		available: false,
		attendu: { slug: 'ines-virgule', publiable: false },
	}),
	// UI-06: partly filled, its empty cards left out: no language, an
	// experience with neither company nor job, no network (so noindex),
	// no skill and no gallery. Not available, out of the search.
	complet({
		id: 117,
		username: 'margot-partielle',
		createdAt: '2024-09-04T10:00:00.000Z',
		first_name: 'Margot',
		last_name: 'Partielle',
		city: 'Lyon',
		available: false,
		skills: [],
		language: [],
		experiences: [
			{
				company: '',
				job_name: '',
				city: 'Lyon',
				date_start: '2019-01-01',
				date_end: null,
				description: 'Sans entreprise ni poste',
			},
		],
		network: null,
		image_gallery: [],
		attendu: {
			slug: 'margot-partielle',
			publiable: false,
			sections: [
				'Localisation & département',
				'Formations & diplômes',
				'Vous en quelques mots',
				'Service(s) proposé(s)',
			],
		},
	}),
]

export const TALENTS = [
	{
		id: 1,
		slug: 'maquillage-mariee',
		title: 'Maquillage mariée',
		seo_title: 'Maquilleuse pour votre mariage',
		description: 'Les maquilleuses qui préparent les mariées.',
		seo_description:
			'Trouvez une maquilleuse professionnelle pour votre mariage : essai, jour J, retouches et maquillage des invitées.',
		content: '# Le jour J\n\nUn texte fictif sur le maquillage des mariées.\n\n## L’essai\n\nToujours avant.',
		updatedAt: '2026-08-01T09:00:00.000Z',
	},
	{
		id: 2,
		slug: 'maquillage-fx',
		title: 'Maquillage effets spéciaux',
		seo_title: 'Maquillage effets spéciaux',
		description: 'Cinéma, théâtre, Halloween.',
		seo_description:
			'Maquillage effets spéciaux pour le cinéma, le théâtre et les événements : trouvez une maquilleuse FX professionnelle.',
		content: 'Un texte fictif sur les effets spéciaux.',
		updatedAt: '2026-08-02T09:00:00.000Z',
	},
	{
		id: 3,
		slug: 'maquillage-soiree',
		title: 'Maquillage soirée',
		seo_title: 'Maquillage de soirée',
		description: 'Pour un gala, une fête.',
		seo_description:
			'Maquillage de soirée à domicile pour un gala, une fête ou un anniversaire : les maquilleuses professionnelles près de chez vous.',
		content: 'Un texte fictif sur le maquillage de soirée.',
		updatedAt: '2026-08-03T09:00:00.000Z',
	},
]

export const ARTICLES = [
	{
		id: 1,
		slug: 'prix-maquillage-mariee',
		title: 'Le prix d’un maquillage de mariée',
		seo_title: 'Prix d’un maquillage de mariée',
		seo_description: 'Combien coûte un maquillage de mariée ? Essai, jour J, déplacement.',
		excerpt: 'Ce que comprend le prix.',
		content: '# Ce que comprend le prix\n\nUn article fictif.',
		author: 'Équipe fictive',
		galery: [],
		updatedAt: '2026-07-01T09:00:00.000Z',
	},
	{
		id: 2,
		slug: 'essai-maquillage',
		title: 'Pourquoi faire un essai',
		seo_title: 'Pourquoi faire un essai de maquillage',
		seo_description: 'L’essai de maquillage avant le mariage, à quoi il sert.',
		excerpt: 'À quoi sert l’essai.',
		content: 'Un autre article fictif.',
		author: 'Équipe fictive',
		galery: [],
		updatedAt: '2026-07-02T09:00:00.000Z',
	},
]
