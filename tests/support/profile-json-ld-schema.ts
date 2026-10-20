import { z } from 'zod'

/** The schema of the structured data of a profile page (SEO-26), strict: a key it does not know fails. Shared by U47-U50 and E65. */
const url = z.string().regex(/^https?:\/\/[^\s]+$/)
const textNotEmpty = z.string().min(1)

/** What the page promises search engines (SEO-26), strict: a key the schema does not know fails. */
const schemaOffer = z.strictObject({
	'@type': z.literal('Offer'),
	priceCurrency: z.literal('EUR').optional(),
	price: z.number().positive().optional(),
	priceSpecification: z
		.strictObject({
			'@type': z.literal('PriceSpecification'),
			minPrice: z.number().positive(),
			priceCurrency: z.literal('EUR'),
		})
		.optional(),
	itemOffered: z.strictObject({
		'@type': z.literal('Service'),
		name: textNotEmpty,
		description: textNotEmpty.optional(),
		serviceType: textNotEmpty.optional(),
		areaServed: z.strictObject({ '@type': z.literal('City'), name: textNotEmpty }).optional(),
		provider: z.strictObject({ '@id': url }),
	}),
})

const schemaPerson = z.strictObject({
	'@type': z.literal('Person'),
	'@id': url,
	name: textNotEmpty,
	url: url,
	image: url.optional(),
	jobTitle: textNotEmpty,
	description: textNotEmpty.optional(),
	areaServed: z.strictObject({ '@type': z.literal('City'), name: textNotEmpty }).optional(),
	knowsAbout: z.array(textNotEmpty).max(10).optional(),
	knowsLanguage: z.array(textNotEmpty).optional(),
	sameAs: z.array(url).optional(),
	makesOffer: z.array(schemaOffer).optional(),
})

const schemaThread = z.strictObject({
	'@type': z.literal('BreadcrumbList'),
	itemListElement: z.array(
		z.strictObject({
			'@type': z.literal('ListItem'),
			position: z.number().int().positive(),
			name: textNotEmpty,
			item: url,
		})
	),
})

const schemaPage = z.strictObject({
	'@type': z.literal('ProfilePage'),
	'@id': url,
	url: url,
	name: textNotEmpty,
	inLanguage: z.literal('fr-FR'),
	isPartOf: z.strictObject({ '@type': z.literal('WebSite'), name: textNotEmpty, url: url }),
	mainEntity: schemaPerson,
})

export const profileSchema = z.strictObject({
	'@context': z.literal('https://schema.org'),
	'@graph': z.union([z.tuple([schemaPage, schemaThread]), z.tuple([schemaThread])]),
})
