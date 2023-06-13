import { toast } from 'react-toastify'

/**
 * PUT /api/makeup-artistes/{id}
 * @param session
 * @param data
 * @param queryClient
 */
export function patchMeMakeup(session, data, queryClient = null) {
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
		.then(res => {
			// 	invalidate the cache, to refresh the page and get the new data , with tanstack/react-query
			if (queryClient !== null) {
				queryClient.invalidateQueries('users/me-makeup')
			}
		})
		.catch(err =>
			toast('Une erreur est survenue, veuillez réessayer plus tard', {
				type: 'error',
				icon: '⛔',
			})
		)
}
