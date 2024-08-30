import fetchAPI from '@/services/fetchApi'

export const getAllTalents = async () => {
	const talents = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/talents`
	)

	return talents?.data
}
