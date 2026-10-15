import { z } from 'zod'

/** The schema of the structured data of a profile page (SEO-26), strict: a key it does not know fails. Shared by U47-U50 and E65. */
const adresse = z.string().regex(/^https?:\/\/[^\s]+$/)
const texteNonVide = z.string().min(1)

/** What the page promises search engines (SEO-26), strict: a key the schema does not know fails. */
const schemaOffre = z.strictObject({
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
		name: texteNonVide,
		description: texteNonVide.optional(),
		serviceType: texteNonVide.optional(),
		areaServed: z.strictObject({ '@type': z.literal('City'), name: texteNonVide }).optional(),
		provider: z.strictObject({ '@id': adresse }),
	}),
})

const schemaPersonne = z.strictObject({
	'@type': z.literal('Person'),
	'@id': adresse,
	name: texteNonVide,
	url: adresse,
	image: adresse.optional(),
	jobTitle: texteNonVide,
	description: texteNonVide.optional(),
	areaServed: z.strictObject({ '@type': z.literal('City'), name: texteNonVide }).optional(),
	knowsAbout: z.array(texteNonVide).max(10).optional(),
	knowsLanguage: z.array(texteNonVide).optional(),
	sameAs: z.array(adresse).optional(),
	makesOffer: z.array(schemaOffre).optional(),
})

const schemaFil = z.strictObject({
	'@type': z.literal('BreadcrumbList'),
	itemListElement: z.array(
		z.strictObject({
			'@type': z.literal('ListItem'),
			position: z.number().int().positive(),
			name: texteNonVide,
			item: adresse,
		})
	),
})

const schemaPage = z.strictObject({
	'@type': z.literal('ProfilePage'),
	'@id': adresse,
	url: adresse,
	name: texteNonVide,
	inLanguage: z.literal('fr-FR'),
	isPartOf: z.strictObject({ '@type': z.literal('WebSite'), name: texteNonVide, url: adresse }),
	mainEntity: schemaPersonne,
})

export const schemaDuProfil = z.strictObject({
	'@context': z.literal('https://schema.org'),
	'@graph': z.union([z.tuple([schemaPage, schemaFil]), z.tuple([schemaFil])]),
})
