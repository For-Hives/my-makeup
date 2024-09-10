import { remark } from 'remark'
import html from 'remark-html'

import fetchAPI from '@/services/fetchApi'

const getOneArticle = async id => {
	const article = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles?filters[slug][$eq]=${id}`
	)

	return article
}

export default getOneArticle
