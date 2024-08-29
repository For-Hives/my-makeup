import React from 'react'

import { useRouter } from 'next/router'
import { remark } from 'remark'
import html from 'remark-html'
import Head from 'next/head'
import Link from 'next/link'

import { convertToStringDate } from '@/services/utils'
import { Layout } from '@/components/Global/Layout'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

function ArrowLeftIcon(props) {
	return (
		<svg aria-hidden="true" fill="none" viewBox="0 0 16 16" {...props}>
			<path
				d="M7.25 11.25 3.75 8m0 0 3.5-3.25M3.75 8h8.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	)
}

export default function Article({ articleData }) {
	let router = useRouter()

	const meta = articleData.attributes

	return (
		<>
			<Head>
				<title>{meta?.seo_title ?? 'My-Makeup'}</title>
				<meta
					content={
						meta?.seo_description ??
						'Découvrez cet article passionnant de la part de My-Makeup'
					}
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link
					href={'https://my-makeup.fr/blog/' + meta?.slug}
					rel="canonical"
				/>
			</Head>
			<Nav />
			<main className={'relative'}>
				<div
					className={'relative mx-auto my-48 max-w-7xl px-4 md:px-8 2xl:px-0'}
				>
					<div className="mx-auto max-w-2xl">
						{
							<Link
								aria-label="Go back to articles"
								className="group mb-8 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md shadow-gray-800/5 ring-1 ring-gray-900/5 transition 2xl:absolute 2xl:-top-1.5 2xl:left-0 2xl:mt-0"
								href={'/blog'}
								type="button"
							>
								<ArrowLeftIcon className="h-4 w-4 stroke-gray-500 transition group-hover:stroke-gray-700" />
							</Link>
						}
						{meta && (
							<article>
								<header className="flex flex-col">
									<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 sm:text-4xl">
										{meta.title}
									</h1>
									<time
										className="order-first flex items-center text-base text-gray-700"
										dateTime={meta.updatedAt.toString()}
									>
										<span className="h-4 w-0.5 rounded-full bg-gray-200" />
										<span className="ml-3">
											{convertToStringDate(meta.updatedAt)}
										</span>
									</time>
								</header>
								<div className={'flex flex-col'}>
									<div className={'prose my-8 xl:prose-lg'}>
										<Layout value={meta.content.toString()} />
									</div>
									<p className={'flex items-center text-base text-gray-600'}>
										<span className="h-4 w-0.5 rounded-full bg-gray-200" />
										<span className="ml-3">Auteur.e : {meta.author}</span>
									</p>
								</div>
							</article>
						)}
					</div>
				</div>
				<CTA />
			</main>
			<Footer />
		</>
	)
}

export async function getStaticPaths() {
	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/articles`, {
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		method: 'GET',
	}).then(res => res.json())

	/**
	 * format the data for getStaticPaths
	 * @type {{params: {id: *}}[]}
	 */
	const paths = res?.data?.map(record => ({
		params: {
			id: record.attributes.slug,
		},
	}))
	return {
		fallback: 'blocking',
		paths,
	}
}

export async function getStaticProps({ params }) {
	let articleData = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles?filters[slug][$eq]=${params.id}`,
		{
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
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
