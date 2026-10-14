/**
 * The headers of the authentication pages and of the space (U71): `private, no-store` keeps a page
 * that carries someone's name out of every cache; the robots header says « not for a search
 * engine » even for a response that is not HTML.
 */
export const enTetesEspace = (): { key: string; value: string }[] => [
	{ key: 'Cache-Control', value: 'private, no-store' },
	{ key: 'X-Robots-Tag', value: 'noindex, nofollow' },
]
