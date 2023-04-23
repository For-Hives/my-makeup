export async function fetchApi(path) {
	const response = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}${path ? path : '/'}`,
		{
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	)
	return await response.json()
}
