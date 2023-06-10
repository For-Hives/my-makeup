import { getArticleIdList, getArticlesDetails } from '../../../lib/articles'
import Head from 'next/head'
import Nav from '@/components/Global/Nav'
import Image from 'next/image'
import Router, { useRouter } from 'next/router'
import React from 'react'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import CTA from '@/components/Global/CTA'
import { convertToStringDate } from '@/services/utils'
import Link from 'next/link'

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

	console.log('----------- log ------------')
	console.log('articleData', articleData)

	const meta = articleData

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
					<div className="mx-auto max-w-2xl">
						{
							<Link
								type="button"
								href={'/blog'}
								aria-label="Go back to articles"
								className="group mb-8 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md shadow-zinc-800/5 ring-1 ring-zinc-900/5 transition dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0 dark:ring-white/10 dark:hover:border-zinc-700 dark:hover:ring-white/20 lg:absolute lg:-left-5 lg:-mt-2 lg:mb-0 xl:-top-1.5 xl:left-0 xl:mt-0"
							>
								<ArrowLeftIcon className="h-4 w-4 stroke-zinc-500 transition group-hover:stroke-zinc-700 dark:stroke-zinc-500 dark:group-hover:stroke-zinc-400" />
							</Link>
						}
						{meta && (
							<article>
								<header className="flex flex-col">
									<h1 className="mt-6 text-4xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100 sm:text-5xl">
										{meta.title}
									</h1>
									<time
										dateTime={meta.updatedAt}
										className="order-first flex items-center text-base text-zinc-400 dark:text-zinc-500"
									>
										<span className="h-4 w-0.5 rounded-full bg-zinc-200 dark:bg-zinc-500" />
										<span className="ml-3">
											{convertToStringDate(meta.updatedAt)}
										</span>
									</time>
								</header>
								{/*<div className="prose mt-8 xl:prose-xl">{meta.content}</div>*/}
							</article>
						)}
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
			data: record.id,
		},
	}))
	return {
		paths,
		fallback: false,
	}
}

export async function getStaticProps({ params }) {
	const res = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}api/article/${params.data}`,
		{
			method: 'GET',
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
		}
	)
	console.log('----------- log ------------')
	console.log('params', params)

	console.log('----------- log ------------')
	console.log(
		'\t\t`${process.env.NEXT_PUBLIC_API_URL}api/article/${params.id}`,\n',
		`${process.env.NEXT_PUBLIC_API_URL}api/article/${params.id}`
	)
	const articleData = await getArticlesDetails(params.id)

	if (!articleData) {
		return {
			props: { hasError: true },
		}
	}
	return {
		props: {
			articleData,
		},
	}
}
