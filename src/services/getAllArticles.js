async function fetchAPI(url) {
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

export const getAllArticles = async () => {
	const articles = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/artdicles`
	)

	const talents = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/talents`
	)

	return {
		articles: articles?.data,
		talents: talents?.data,
	}
}
