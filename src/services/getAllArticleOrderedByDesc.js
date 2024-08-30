import fetchAPI from '@/services/fetchApi'

const getAllArticleOrderedByDesc = async () => {
	const articles = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles?sort[publishedAt]=desc`
	)

	return articles?.data
}

export default getAllArticleOrderedByDesc
