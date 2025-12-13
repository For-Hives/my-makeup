import { toast } from 'react-toastify'
import { authenticatedFetch } from './api'

/**
 * DELETE /api/me-makeup
 * @param session
 */
export async function DeleteMeMakeup(session) {
	const response = await authenticatedFetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`,
		session,
		{ method: 'DELETE' }
	)

	if (!response) {
		return null // Session expired, user is being redirected
	}

	if (response.ok) {
		toast('Votre compte a bien été supprimé', {
			type: 'success',
			icon: '⛔',
			toastId: 'toast-alert',
		})
	} else {
		toast('Une erreur est survenue, veuillez réessayer plus tard', {
			type: 'error',
			icon: '⛔',
			toastId: 'toast-alert',
		})
	}
}
