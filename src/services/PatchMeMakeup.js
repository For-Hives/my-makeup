import { toast } from 'react-toastify'
import { authenticatedFetch } from './api'

/**
 * PATCH /api/makeup-artistes/{id}
 * @param session
 * @param data
 */
export async function patchMeMakeup(session, data) {
	const response = await authenticatedFetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`,
		session,
		{
			method: 'PATCH',
			body: JSON.stringify({ ...data }),
		}
	)

	if (!response) {
		return null // Session expired, user is being redirected
	}

	if (!response.ok) {
		toast('Une erreur est survenue, veuillez réessayer plus tard', {
			type: 'error',
			icon: '⛔',
			toastId: 'toast-alert',
		})
		return null
	}

	return response.json()
}
