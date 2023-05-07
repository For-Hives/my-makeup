/**
 * PUT /api/makeup-artistes/{id}
 * @param queryClient
 * @param user
 * @param session
 * @param data
 */
export function patchMeMakeup(queryClient, user, session, data) {
	console.log('patchMeMakeup')
	console.log('data', data)
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
			console.log(response)
			return response.json()
		})
		.then(res => {
			console.log(res)
			// 	invalidate the cache, to refresh the page and get the new data , with tanstack/react-query
			queryClient.invalidateQueries('users/me-makeup')
		})
		.catch(err => {
			console.log(err)
		})
}
