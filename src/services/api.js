import { signOut } from 'next-auth/react'
import { toast } from 'react-toastify'

/**
 * Makes an authenticated API request with automatic 401 handling.
 * If the token is expired/invalid, triggers logout and redirects to signin.
 *
 * @param {string} url - The API endpoint URL
 * @param {object} session - The NextAuth session object containing jwt
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response|null>} - The fetch response or null if unauthorized
 */
export async function authenticatedFetch(url, session, options = {}) {
	if (!session?.jwt) {
		toast('Votre session a expiré, veuillez vous reconnecter', {
			type: 'warning',
			icon: '🔒',
			toastId: 'session-expired',
		})
		signOut({ callbackUrl: '/auth/signin' })
		return null
	}

	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${session.jwt}`,
			...options.headers,
		},
	})

	if (response.status === 401) {
		toast('Votre session a expiré, veuillez vous reconnecter', {
			type: 'warning',
			icon: '🔒',
			toastId: 'session-expired',
		})
		signOut({ callbackUrl: '/auth/signin' })
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
	return fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${jwt}`,
			...options.headers,
		},
	})
}
