import fetchAPI from '@/services/fetchApi'

export const getAllArticles = async () => {
	const articles = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles`
	)

	return articles?.data
}
