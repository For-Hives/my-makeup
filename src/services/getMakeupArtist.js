import fetchAPI from './fetchApi'

export const getMakeupArtist = async ({ search, city }) => {
	let makeupArtist

	if (city) {
		makeupArtist = await fetchAPI(
			`${process.env.NEXT_PUBLIC_API_URL}/api/searching?search=${search}&city=${city}`
		)
	}

	makeupArtist = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/searching?search=${search}`
	)

	return makeupArtist
}
