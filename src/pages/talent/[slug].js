import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import CTA from '@/components/Global/CTA'
import Head from 'next/head'
import Hero from '@/components/Global/Hero'
import { remark } from 'remark'
import html from 'remark-html'
import { useRouter } from 'next/router'
import { Layout } from '@/components/Global/Layout'

/**
 * @param props
 * @constructor
 */
function Talent({ articleData }) {
	let router = useRouter()

	const meta = articleData.attributes
	return (
		<>
			<Head>
				<title>{meta?.title ?? 'My-Makeup'}</title>
				<meta
					name="description"
					content={
						meta?.seo_description ??
						'Découvrez cet article passionnant de la part de My-Makeup'
					}
				/>
				{/*	seo tag canonical link */}
				<link
					rel="canonical"
					href={'https://my-makeup.fr/talent/' + meta?.slug}
				/>
			</Head>

			<Nav />

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
							<h3 className={'flex items-center text-base text-gray-400'}>
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
	let articleData = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/talents?filters[slug][$eq]=${params.slug}`,
		{
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	).then(res => res.json())

	articleData = articleData?.data?.[0]

	if (!articleData) {
		return {
			props: { hasError: true },
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
			content: processedContent.toString(),
		},
	}

	return {
		props: {
			articleData: newArticleData,
		},
		revalidate: 10,
	}
}
