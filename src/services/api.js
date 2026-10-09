import { getSession, signOut } from 'next-auth/react'
import { toast } from 'react-toastify'

// The sign-in page shows « Ta session a expiré » and counts `session_expired`
const PAGE_SESSION_EXPIREE = '/auth/signin?error=session-expiree'

function sessionExpiree() {
	toast('Ta session a expiré, reconnecte-toi', {
		type: 'warning',
		icon: '🔒',
		toastId: 'session-expired',
	})
	signOut({ callbackUrl: PAGE_SESSION_EXPIREE })
}

/**
 * Makes an authenticated API request with automatic 401 handling.
 * If the token is expired/invalid, triggers logout and redirects to signin.
 *
 * @param {string} url - The API endpoint URL
 * @param {object} session - The NextAuth session object containing jwt
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response|null>} - The fetch response or null if unauthorized
 * @throws {TypeError} when the API cannot be reached (network error)
 */
export async function authenticatedFetch(url, session, options = {}) {
	// The pages no longer send the session in their props: right after a page
	// load useSession() may still be loading, so ask for it before giving up.
	const jwt = session?.jwt ?? (await getSession())?.jwt
	if (!jwt) {
		sessionExpiree()
		return null
	}

	// a FormData body (uploads) sets its own multipart Content-Type
	const formulaire = typeof FormData !== 'undefined' && options.body instanceof FormData

	const response = await fetch(url, {
		...options,
		headers: {
			...(formulaire ? {} : { 'Content-Type': 'application/json' }),
			Accept: 'application/json',
			Authorization: `Bearer ${jwt}`,
			...options.headers,
		},
	})

	if (response.status === 401) {
		sessionExpiree()
		return null
	}

	return response
}

/**
 * Server-side authenticated fetch for use in getServerSideProps.
 * Does not trigger signOut (server-side can't do that), returns response for handling.
 *
 * @param {string} url - The API endpoint URL
 * @param {string} jwt - The JWT token from session
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response>} - The fetch response
 */
export async function serverAuthenticatedFetch(url, jwt, options = {}) {
	return await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${jwt}`,
			...options.headers,
		},
	})
}
