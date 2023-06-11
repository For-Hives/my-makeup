import Head from 'next/head'
import Nav from '@/components/Global/Nav'
import Image from 'next/image'
import { useRouter } from 'next/router'
import React from 'react'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import CTA from '@/components/Global/CTA'
import { convertToStringDate } from '@/services/utils'
import Link from 'next/link'
import { remark } from 'remark'
import html from 'remark-html'

function ArrowLeftIcon(props) {
	return (
		<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
			<path
				d="M7.25 11.25 3.75 8m0 0 3.5-3.25M3.75 8h8.5"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

export default function Article({ articleData }) {
	let router = useRouter()

	const meta = articleData.attributes

	console.log(articleData)

	return (
		<>
			<Head>
				<title>{meta?.seo_title ?? 'My Makeup'}</title>
				<meta
					name="description"
					content={
						meta?.seo_description ??
						'Découvrez cet article passionnant de la part de My Makeup'
					}
				/>
			</Head>
			<div className={'relative'}>
				<Image
					src={'/assets/coming-soon.svg'}
					alt={'Coming soon'}
					width={'80'}
					height={'80'}
					className={
						'fixed left-0 top-0 z-50 m-4 rounded-full bg-amber-300/75 p-2'
					}
				/>
				<Nav />
				<main className={'relative'}>
					<ResponsiveTemporary />
					<div className={'relative mx-auto my-48 max-w-7xl'}>
						<div className="mx-auto max-w-2xl">
							{
								<Link
									type="button"
									href={'/blog'}
									aria-label="Go back to articles"
									className="group mb-8 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md shadow-gray-800/5 ring-1 ring-gray-900/5 transition dark:border dark:border-gray-700/50 dark:bg-gray-800 dark:ring-0 dark:ring-white/10 dark:hover:border-gray-700 dark:hover:ring-white/20 lg:absolute lg:-left-5 lg:-mt-2 lg:mb-0 xl:-top-1.5 xl:left-0 xl:mt-0"
								>
									<ArrowLeftIcon className="h-4 w-4 stroke-gray-500 transition group-hover:stroke-gray-700 dark:stroke-gray-500 dark:group-hover:stroke-gray-400" />
								</Link>
							}
							{meta && (
								<article>
									<header className="flex flex-col">
										<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:text-4xl">
											{meta.title}
										</h1>
										<time
											dateTime={meta.updatedAt.toString()}
											className="order-first flex items-center text-base text-gray-400 dark:text-gray-500"
										>
											<span className="h-4 w-0.5 rounded-full bg-gray-200 dark:bg-gray-500" />
											<span className="ml-3">
												{convertToStringDate(meta.updatedAt)}
											</span>
										</time>
									</header>
									<div
										className="prose my-8 xl:prose-lg"
										dangerouslySetInnerHTML={{
											__html: meta.content.toString(),
										}}
									/>
									<h3 className={'flex items-center text-base text-gray-400'}>
										<span className="h-4 w-0.5 rounded-full bg-gray-200 dark:bg-gray-500" />
										<span className="ml-3">Auteur.e : {meta.author}</span>
									</h3>
								</article>
							)}
						</div>
					</div>
					<CTA />
				</main>
				<Footer />
			</div>
		</>
	)
}

export async function getStaticPaths() {
	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}api/articles`, {
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
			id: record.attributes.slug,
		},
	}))
	return {
		paths,
		fallback: false,
	}
}

export async function getStaticProps({ params }) {
	let articleData = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/articles?filters[slug][$eq]=${params.id}`,
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
	}
}
