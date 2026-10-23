/**
 * The fake list of the communes of the bench (CI of 15/10/2026): the two questions the space of the
 * makeup artist asks the official list (geo.api.gouv.fr, src/lib/dashboard/city-reference.ts),
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
 * Nothing of bun here: the unit test loads it under bun, the container runs ./server.ts.
 */

export const IDENTITY = 'fake-cities'

interface City {
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
export const CITIES: readonly City[] = [
	{
		nom: 'Annecy',
		code: '74010',
		codeDepartement: '74',
		codesPostaux: ['74000'],
		centre: [6.1264, 45.9024],
		population: 131_000,
	},
	{
		nom: 'Annecy-le-Vieux',
		code: '74011',
		codeDepartement: '74',
		codesPostaux: ['74940'],
		centre: [6.1445, 45.9183],
		population: 21_000,
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
	// Two fictional communes that share one fictional postal code (ticket 259): a code that does not
	// name one commune. Neither is a commune of France.
	{
		nom: 'Valbrume',
		code: '74990',
		codeDepartement: '74',
		codesPostaux: ['74990'],
		centre: [6.4, 45.95],
		population: 1_200,
	},
	{
		nom: 'Hautcombe',
		code: '74991',
		codeDepartement: '74',
		codesPostaux: ['74990'],
		centre: [6.43, 45.97],
		population: 800,
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

const fold = (texte: string): string =>
	texte
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[\s'’-]+/g, ' ')
		.trim()

const inJson = ({ nom: name, code, codeDepartement, codesPostaux, centre }: City) => ({
	nom: name,
	code,
	codeDepartement,
	codesPostaux,
	centre: { type: 'Point', coordinates: centre },
})

const WITHOUT_CACHE = { 'Cache-Control': 'no-store' }

/** The communes that answer a search, the closest name first, then the most populated, as the official list orders them. */
export function find(parametres: URLSearchParams): City[] {
	const limit = Math.max(0, Number(parametres.get('limit') ?? 50) || 50)
	const codePostal = parametres.get('codePostal')
	const name = parametres.get('nom')
	const found =
		codePostal !== null
			? CITIES.filter(({ codesPostaux }) => codesPostaux.includes(codePostal.trim()))
			: name !== null && fold(name) !== ''
				? CITIES.filter(commune => fold(commune.nom).includes(fold(name)))
				: []
	const question = fold(name ?? '')
	const rank = (commune: City) => (fold(commune.nom) === question ? 0 : fold(commune.nom).startsWith(question) ? 1 : 2)
	return [...found].sort((a, b) => rank(a) - rank(b) || b.population - a.population).slice(0, limit)
}

export function createFakeCities() {
	return {
		repondre(requete: Request): Response {
			const { pathname, searchParams } = new URL(requete.url)
			if (requete.method !== 'GET') return new Response('Not Found', { status: 404 })
			if (pathname === '/_sante') return Response.json({ service: IDENTITY }, { headers: WITHOUT_CACHE })
			if (pathname === '/communes') return Response.json(find(searchParams).map(inJson), { headers: WITHOUT_CACHE })
			const code = /^\/communes\/([^/]+)$/.exec(pathname)?.[1]
			const city = code === undefined ? undefined : CITIES.find(une => une.code === decodeURIComponent(code))
			if (city) return Response.json(inJson(city), { headers: WITHOUT_CACHE })
			return new Response('Not Found', { status: 404, headers: WITHOUT_CACHE })
		},
	}
}
