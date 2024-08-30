export default async function fetchAPI(url) {
	try {
		const res = await fetch(url, {
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
		})
		return res.json()
	} catch (error) {
		console.error(`🚀 ~ fetchAPI ~ ${url} ~ res:`, error)
	}
}
