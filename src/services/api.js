export async function fetchApi(path, options = {}) {
	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
	}
	const response = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/${path}`,
		{
			...options,
			headers,
		}
	)
	return await response.json()
}
