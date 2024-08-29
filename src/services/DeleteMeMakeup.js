import { toast } from 'react-toastify'

/**
 * PATCH /api/makeup-artistes/{id}
 * @param session
 */
export function DeleteMeMakeup(session) {
	fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`, {
		headers: {
			Authorization: `Bearer ${session.jwt}`,
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		method: 'DELETE',
	})
		.then(response => {
			toast('Votre compte a bien été supprimé', {
				toastId: 'toast-alert',
				type: 'success',
				icon: '⛔',
			})
		})
		.catch(err =>
			toast('Une erreur est survenue, veuillez réessayer plus tard', {
				toastId: 'toast-alert',
				type: 'error',
				icon: '⛔',
			})
		)
}
