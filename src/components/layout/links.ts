/** The links of the shared template, taken from the site as it is online (ticket 068). */

export interface MenuLink {
	nom: string
	href: string
	description: string
}

export type NavEntry = { nom: string; href: string } | { nom: string; enfants: readonly MenuLink[] }

export const NAVIGATION: readonly NavEntry[] = [
	{
		nom: 'Particulier',
		enfants: [
			{
				nom: 'Pourquoi My-Makeup ?',
				href: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier',
				description:
					'My-Makeup est une plateforme de mise en relation entre les particuliers et les professionnels de la beauté.',
			},
			{
				nom: 'Trouver une maquilleuse',
				href: '/particulier/trouver-une-maquilleuse',
				description: 'Trouvez la maquilleuse qui vous correspond parmi les profils disponibles.',
			},
			{
				nom: 'Centraliser ses recherches',
				href: '/particulier/centraliser-ses-recherches',
				description: 'Centralisez vos recherches pour comparer et trouver la maquilleuse qui vous correspond.',
			},
			{
				nom: 'Explorer les profils',
				href: '/particulier/explorer-les-profils',
				description: 'Cherchez par mot-clé et par ville !',
			},
		],
	},
	{
		nom: 'Maquilleuse',
		enfants: [
			{
				nom: 'Pourquoi My-Makeup ?',
				href: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse',
				description:
					'Rejoignez la communauté My-Makeup pour développer votre activité, trouver de nouveaux clients et gagner en visibilité, gratuitement !',
			},
			{
				nom: 'Communauté & Partenariats',
				href: '/maquilleuse/partenariats',
				description: 'Une page gratuite pour présenter votre travail, et une équipe à votre écoute.',
			},
		],
	},
	{
		nom: 'Solutions',
		enfants: [
			{
				nom: 'Pour les particuliers',
				href: '/solutions/pour-les-particuliers',
				description: "Trouvez la maquilleuse de vos rêves, n'a jamais été aussi simple !",
			},
			{
				nom: 'Pour les maquilleuses',
				href: '/solutions/pour-les-maquilleuses',
				description: 'Présentez votre travail et faites-vous connaître des particuliers, gratuitement.',
			},
		],
	},
	{ nom: 'Blog', href: '/blog' },
]

/**
 * The name of the group of the bar whose pages hold `path`, or `null` (issue 1137). The bar rings that group with the
 * sketched ellipse, as it does a plain entry on its own page. Derived from `NAVIGATION`: a page added to a group is
 * covered without a second list. A trailing slash is ignored; only an exact address counts.
 */
export function currentGroup(path: string): string | null {
	const clean = path.length > 1 ? path.replace(/\/+$/, '') : path
	for (const entry of NAVIGATION) {
		if ('enfants' in entry && entry.enfants.some(child => child.href === clean)) return entry.nom
	}
	return null
}

export const SEARCH_LINK = { nom: 'Trouver une maquilleuse', href: '/search' }
export const SIGN_IN_LINK = { nom: 'Me connecter', href: '/auth/signin' }
/** What the navigation shows instead of the sign-in link when a makeup artist is signed in (ticket 078). */
export const DASHBOARD_LINK = { nom: 'Mon espace', href: '/auth/profil' }

export interface FooterColumn {
	titre: string
	liens: readonly { nom: string; href: string }[]
}

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
	{
		titre: 'Particuliers',
		liens: [
			{ nom: 'Pourquoi My-Makeup ?', href: '/pourquoi-utiliser-my-makeup-en-tant-que-particulier' },
			{ nom: 'Trouver une maquilleuse', href: '/particulier/trouver-une-maquilleuse' },
			{ nom: 'Centraliser ses recherches', href: '/particulier/centraliser-ses-recherches' },
			{ nom: 'Explorer les profils', href: '/particulier/explorer-les-profils' },
		],
	},
	{
		titre: 'Maquilleuses',
		liens: [
			{ nom: 'Pourquoi My-Makeup ?', href: '/pourquoi-rejoindre-my-makeup-en-tant-que-maquilleuse' },
			{ nom: 'Communautés & Partenariats', href: '/maquilleuse/partenariats' },
		],
	},
	{
		titre: 'Ressources',
		liens: [
			{ nom: 'Solution pour les particuliers', href: '/solutions/pour-les-particuliers' },
			{ nom: 'Solution pour les maquilleuses', href: '/solutions/pour-les-maquilleuses' },
			{ nom: 'Blog', href: '/blog' },
		],
	},
	{
		titre: 'My-Makeup',
		liens: [
			{ nom: 'À propos de My-Makeup', href: '/a-propos' },
			{ nom: 'Contact', href: '/contact' },
			{ nom: 'Mentions légales', href: '/mentions-legales' },
			{ nom: "Conditions générales d'utilisation", href: '/cgu' },
			{ nom: 'Politique de confidentialité', href: '/politique-de-confidentialite' },
			{ nom: 'Plan du site', href: '/site-map' },
		],
	},
]

export const NETWORKS = [
	{
		nom: 'Instagram My-Makeup',
		href: 'https://www.instagram.com/forhives.my_makeup.fr/',
		icone: '/assets/brand/037-instagram.svg',
	},
	{
		nom: 'Linkedin My-Makeup',
		href: 'https://www.linkedin.com/company/forhives-my-makeup/',
		icone: '/assets/brand/030-linkedin.svg',
	},
	{ nom: 'Mail My-Makeup', href: 'mailto:contact@my-makeup.fr', icon: 'mail' },
	{
		nom: 'Facebook My-Makeup',
		href: 'https://facebook.com/forhives.my.makeup',
		icone: '/assets/brand/006-facebook.svg',
	},
] as const

/** Every address of the site the template links to. */
export function internalPaths(): string[] {
	const paths = new Set<string>([SEARCH_LINK.href, SIGN_IN_LINK.href, '/'])
	for (const entry of NAVIGATION) {
		if ('href' in entry) paths.add(entry.href)
		else for (const child of entry.enfants) paths.add(child.href)
	}
	for (const column of FOOTER_COLUMNS) for (const link of column.liens) paths.add(link.href)
	return [...paths]
}
