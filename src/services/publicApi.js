/**
 * Server-side GET on the public API, for getStaticProps.
 *
 * Network errors and non-2xx answers are thrown on purpose: during an ISR
 * revalidation Next.js then keeps serving the last generated page instead of
 * caching a 404 while the API is down. An empty result is not an error, the
 * caller decides to return `{ notFound: true }`.
 *
 * @param {string} path - API path with its query string, e.g. `/api/talents?…`
 * @returns {Promise<object>} - The parsed JSON body
 */
export async function fetchPublicApi(path) {
	const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	})

	if (!response.ok) {
		throw new Error(`GET ${path} failed with HTTP ${response.status}`)
	}

	return response.json()
}
