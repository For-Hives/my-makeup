import { remark } from 'remark'
import html from 'remark-html'

export function toCapitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1)
}

export function toDateLongMonthYear(date) {
	return new Date(date).toLocaleDateString('fr-FR', {
		year: 'numeric',
		month: 'long',
	})
}

export function convertToStringDate(date) {
	// convert article.attributes.updatedAt to a date string like September 17, 2021 (base : 2023-06-10T09:20:48.754Z)
	const dateObject = new Date(date)
	const options = { year: 'numeric', day: 'numeric', month: 'long' }
	return dateObject.toLocaleDateString('fr-FR', options)
}

export function convertStringToKebabCase(str) {
	// Normalize the string to Unicode NFD form
	const normalizedStr = str.normalize('NFD')

	// Remove accents using a regular expression
	const withoutAccents = normalizedStr.replace(/[\u0300-\u036f]/g, '')

	// Replace spaces with '-' and convert to lowercase
	return withoutAccents.replace(/\s+/g, '-').toLowerCase()
}

export const convertMarkdownToHtml = async responseData => {
	responseData = responseData?.data?.[0]

	if (!responseData) {
		return null
	}

	// Convert Markdown to HTML
	const processedContent = await remark()
		.use(html)
		.process(responseData.attributes.content)

	// replace the img by Image from next

	const newresponseData = {
		...responseData,
		attributes: {
			...responseData.attributes,
			content: processedContent.toString(),
		},
	}

	return newresponseData
}
