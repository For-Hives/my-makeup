import { toast } from 'react-toastify'

/**
 * PUT /api/makeup-artistes/{id}
 * @param session
 * @param data
 */
export function patchMeMakeup(session, data) {
	fetch(`${process.env.NEXT_PUBLIC_API_URL}api/me-makeup`, {
		method: 'PATCH',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${session.jwt}`,
		},
		body: JSON.stringify({
			...data,
		}),
	})
		.then(response => {
			return response.json()
		})
		.catch(err =>
			toast('Une erreur est survenue, veuillez réessayer plus tard', {
				type: 'error',
				icon: '⛔',
			})
		)
}
