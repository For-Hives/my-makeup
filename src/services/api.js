export async function fetchApi() {
	const response = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/${path}`,
		{
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	)
	return await response.json()
}

export function fetchUsersMe(jwt) {
	return fetch(`${process.env.NEXT_PUBLIC_API_URL}api/users/me`, {
		method: 'GET',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${jwt}`,
		},
	}).then(res => res.data)
}

export function fetchMakeupArtistes(jwt) {
	return fetch(`${process.env.NEXT_PUBLIC_API_URL}api/makeup-artistes`, {
		method: 'GET',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
			Authorization: `Bearer ${jwt}`,
		},
	}).then(res => res.data)
}
