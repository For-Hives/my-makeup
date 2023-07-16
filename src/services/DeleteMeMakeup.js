import { toast } from 'react-toastify'

/**
 * PATCH /api/makeup-artistes/{id}
 * @param session
 */
export function DeleteMeMakeup(session) {
	fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`, {
		method: 'DELETE',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${session.jwt}`,
		},
	})
		.then(response => {
			toast('Votre compte a bien été supprimé', {
				type: 'success',
				icon: '⛔',
				toastId: 'toast-alert',
			})
		})
		.catch(err =>
			toast('Une erreur est survenue, veuillez réessayer plus tard', {
				type: 'error',
				icon: '⛔',
				toastId: 'toast-alert',
			})
		)
}
