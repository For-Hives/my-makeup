import fetchAPI from '@/services/fetchApi'

const getAllTalent = async () => {
	const talents = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/talents`
	)

	return talents?.data
}

export default getAllTalent
