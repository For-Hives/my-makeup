import { remark } from 'remark'
import html from 'remark-html'

import fetchAPI from '@/services/fetchApi'

const getOneArticle = async id => {
	const article = await fetchAPI(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles?filters[slug][$eq]=${id}`
	)

	const articleData = article?.data?.[0]

	if (!articleData) {
		return null
	}

	// Convert Markdown to HTML
	const processedContent = await remark()
		.use(html)
		.process(articleData.attributes.content)

	// replace the img by Image from next

	const newArticleData = {
		...articleData,
		attributes: {
			...articleData.attributes,
			content: processedContent.toString(),
		},
	}

	return newArticleData
}

export default getOneArticle
