/**
 * PUT /api/makeup-artistes/{id}
 * @param queryClient
 * @param user
 * @param session
 * @param data
 * @param data_blob
 */
export function putMakeupArtisteViaId(
	queryClient,
	user,
	session,
	data,
	data_blob = { id: null }
) {
	fetch(`${process.env.NEXT_PUBLIC_API_URL}api/makeup-artistes/${user.id}`, {
		method: 'PUT',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${session.jwt}`,
		},
		body: JSON.stringify({
			data: {
				last_name: data.last_name,
				first_name: data.first_name,
				speciality: data.speciality,
				city: data.city,
				action_radius: data.action_radius,
				score: data.score,
				available: data.available,
				skills: data.skills,
				description: data.description,
				network: data.network,
				user: data.user,
				experiences: data.experiences,
				courses: data.courses,
				service_offers: data.service_offers,
				image_gallery: data.image_gallery,
				main_picture: data_blob.id ?? data.main_picture,
				language: data.language,
				phone: data.phone,
			},
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
