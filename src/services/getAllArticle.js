import fetchAPI from '@/services/fetchApi'

const getAllArticle = async () => {
	const articles = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles`
	)

	return articles?.data
}

export default getAllArticle
