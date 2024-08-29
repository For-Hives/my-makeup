import { toast } from 'react-toastify'

/**
 * PATCH /api/makeup-artistes/{id}
 * @param session
 * @param data
 */
export function patchMeMakeup(session, data) {
	fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me-makeup`, {
		headers: {
			Authorization: `Bearer ${session.jwt}`,
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			...data,
		}),
		method: 'PATCH',
	})
		.then(response => {
			return response.json()
		})
		.catch(err =>
			toast('Une erreur est survenue, veuillez réessayer plus tard', {
				toastId: 'toast-alert',
				type: 'error',
				icon: '⛔',
			})
		)
}
