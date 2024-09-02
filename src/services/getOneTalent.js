import fetchAPI from './fetchApi'

export const getOneTalent = async slug => {
	const talent = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/talents?filters[slug][$eq]=${slug}`
	)

	return talent
}
