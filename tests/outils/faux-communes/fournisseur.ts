/**
 * The fake list of the communes of the bench (CI of 15/10/2026): the two questions the space of the
 * makeup artist asks the official list (geo.api.gouv.fr, src/lib/espace/referentiel-communes.ts),
 * answered from a few communes of that list, so that the application of the end-to-end tests never
 * calls the Internet. The live list answered slowly or not at all from the machines of the CI, and
 * the tests that choose a commune failed with it.
 *
 *   GET /communes?nom=…          the communes whose name contains the text, accents and case aside
 *   GET /communes?codePostal=…   the communes of a postal code
 *   GET /communes/<code INSEE>   one commune, or 404 with a plain text, as the official list answers
 *   GET /_sante                  who answers (the probe of the bench)
 *
 * The communes are public reference data of the official list (names, INSEE codes, postal codes,
 * centres), never a personal one. Like the official list, `limit` bounds the answer and `fields` is
 * accepted; the fields are always the four the site asks for.
 *
 * Nothing of bun here: the unit test loads it under bun, the container runs ./serveur.ts.
 */

export const IDENTITE = 'faux-communes'

interface Commune {
	nom: string
	code: string
	codeDepartement: string
	codesPostaux: string[]
	/** [longitude, latitude], as the official list writes its centres. */
	centre: [number, number]
	/** What the official list orders by with `boost=population`. */
	population: number
}

/** The communes of the fictional set and of the profile factory, and a few that share a name. */
export const COMMUNES: readonly Commune[] = [
	{
		nom: 'Annecy',
		code: '74010',
		codeDepartement: '74',
		codesPostaux: ['74000'],
		centre: [6.1264, 45.9024],
		population: 131_000,
	},
	{
		nom: 'Annemasse',
		code: '74012',
		codeDepartement: '74',
		codesPostaux: ['74100'],
		centre: [6.2499, 46.1909],
		population: 37_000,
	},
	{
		nom: 'Thonon-les-Bains',
		code: '74281',
		codeDepartement: '74',
		codesPostaux: ['74200'],
		centre: [6.4818, 46.3627],
		population: 36_000,
	},
	{
		nom: 'Nantes',
		code: '44109',
		codeDepartement: '44',
		codesPostaux: ['44000', '44100', '44200', '44300'],
		centre: [-1.5603, 47.2382],
		population: 323_000,
	},
	{
		nom: 'Lyon',
		code: '69123',
		codeDepartement: '69',
		codesPostaux: ['69001', '69002', '69003'],
		centre: [4.8357, 45.764],
		population: 520_000,
	},
	{
		nom: 'Lille',
		code: '59350',
		codeDepartement: '59',
		codesPostaux: ['59000', '59160', '59260', '59777', '59800'],
		centre: [3.0465, 50.6311],
		population: 236_000,
	},
	{
		nom: 'Lillers',
		code: '62516',
		codeDepartement: '62',
		codesPostaux: ['62190'],
		centre: [2.4793, 50.5626],
		population: 10_000,
	},
	{
		nom: 'Lillebonne',
		code: '76384',
		codeDepartement: '76',
		codesPostaux: ['76170'],
		centre: [0.5491, 49.5229],
		population: 9_000,
	},
	{
		nom: 'Bordeaux',
		code: '33063',
		codeDepartement: '33',
		codesPostaux: ['33000', '33100', '33200', '33300', '33800'],
		centre: [-0.5792, 44.8378],
		population: 261_000,
	},
	{
		nom: 'Toulouse',
		code: '31555',
		codeDepartement: '31',
		codesPostaux: ['31000', '31100', '31200', '31300', '31400', '31500'],
		centre: [1.4442, 43.6047],
		population: 504_000,
	},
	{
		nom: 'Rennes',
		code: '35238',
		codeDepartement: '35',
		codesPostaux: ['35000', '35200', '35700'],
		centre: [-1.6778, 48.1173],
		population: 225_000,
	},
	{
		nom: 'Marseille',
		code: '13055',
		codeDepartement: '13',
		codesPostaux: ['13001', '13002', '13003'],
		centre: [5.3698, 43.2965],
		population: 873_000,
	},
	{
		nom: 'Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson',
		code: '51513',
		codeDepartement: '51',
		codesPostaux: ['51290'],
		centre: [4.6447, 48.6109],
		population: 600,
	},
]

const plier = (texte: string): string =>
	texte
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[\s'’-]+/g, ' ')
		.trim()

const enJson = ({ nom, code, codeDepartement, centre }: Commune) => ({
	nom,
	code,
	codeDepartement,
	centre: { type: 'Point', coordinates: centre },
})

const SANS_CACHE = { 'Cache-Control': 'no-store' }

/** The communes that answer a search, the closest name first, then the most populated, as the official list orders them. */
export function chercher(parametres: URLSearchParams): Commune[] {
	const limite = Math.max(0, Number(parametres.get('limit') ?? 50) || 50)
	const codePostal = parametres.get('codePostal')
	const nom = parametres.get('nom')
	const trouvees =
		codePostal !== null
			? COMMUNES.filter(({ codesPostaux }) => codesPostaux.includes(codePostal.trim()))
			: nom !== null && plier(nom) !== ''
				? COMMUNES.filter(commune => plier(commune.nom).includes(plier(nom)))
				: []
	const question = plier(nom ?? '')
	const rang = (commune: Commune) =>
		plier(commune.nom) === question ? 0 : plier(commune.nom).startsWith(question) ? 1 : 2
	return [...trouvees].sort((a, b) => rang(a) - rang(b) || b.population - a.population).slice(0, limite)
}

export function creerFaussesCommunes() {
	return {
		repondre(requete: Request): Response {
			const { pathname, searchParams } = new URL(requete.url)
			if (requete.method !== 'GET') return new Response('Not Found', { status: 404 })
			if (pathname === '/_sante') return Response.json({ service: IDENTITE }, { headers: SANS_CACHE })
			if (pathname === '/communes') return Response.json(chercher(searchParams).map(enJson), { headers: SANS_CACHE })
			const code = /^\/communes\/([^/]+)$/.exec(pathname)?.[1]
			const commune = code === undefined ? undefined : COMMUNES.find(une => une.code === decodeURIComponent(code))
			if (commune) return Response.json(enJson(commune), { headers: SANS_CACHE })
			return new Response('Not Found', { status: 404, headers: SANS_CACHE })
		},
	}
}
