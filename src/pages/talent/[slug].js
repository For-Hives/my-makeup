import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import CTA from '@/components/Global/CTA'
import Hero from '@/components/Global/Hero'
import { remark } from 'remark'
import html from 'remark-html'
import { Layout } from '@/components/Global/Layout'
import { fetchPublicApi } from '@/services/publicApi'
import Seo from '@/components/Global/Seo'
import { retrograderTitres } from '@/lib/contenu'
import { seoTalent } from '@/lib/seo/meta'
import { urlDuSite } from '@/lib/seo/url'

/**
 * @param props
 * @constructor
 */
function Talent({ articleData }) {
	const meta = articleData.attributes
	return (
		<>
			<Seo seo={seoTalent({ talent: meta, site: urlDuSite() })} />
			<Nav />
			<main className={'relative'}>
				<Hero
					imgBackgroundSrc={'/assets/back/maquilleuse_europeenne_white.webp'}
					title={<>{meta.seo_title}</>}
					description={<>{meta.description}</>}
				/>
				<div
					className={'relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-0'}
				>
					<div className="mx-auto max-w-2xl">
						<article>
							<div className={'prose my-8 xl:prose-lg'}>
								<Layout value={meta.content.toString()} />
							</div>
							<h3 className={'flex items-center text-base text-gray-600'}>
								<span className="h-4 w-0.5 rounded-full bg-gray-200" />
								<span className="ml-3">{"L'équipe My-Makeup"}</span>
							</h3>
						</article>
					</div>
				</div>
				<CTA />
			</main>

			<Footer />
		</>
	)
}

export default Talent

export async function getStaticPaths() {
	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/talents`, {
		method: 'GET',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	}).then(res => res.json())

	/**
	 * format the data for getStaticPaths
	 * @type {{params: {id: *}}[]}
	 */
	const paths = res?.data?.map(record => ({
		params: {
			slug: record.attributes.slug,
		},
	}))
	return {
		paths,
		fallback: 'blocking',
	}
}

export async function getStaticProps({ params }) {
	// throws if the API is unreachable or answers an error (see fetchPublicApi)
	let articleData = await fetchPublicApi(
		`/api/talents?filters[slug][$eq]=${encodeURIComponent(params.slug)}`
	)

	articleData = articleData?.data?.[0]

	if (!articleData) {
		return {
			notFound: true,
			revalidate: 10,
		}
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
			// « # titre » of the content as h2: the hero title is the only h1
			content: retrograderTitres(processedContent.toString()),
		},
	}

	return {
		props: {
			articleData: newArticleData,
		},
		revalidate: 10,
	}
}
