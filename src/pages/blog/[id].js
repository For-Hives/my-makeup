import { getArticleIdList, getArticlesDetails } from '../../../lib/articles'
import Head from 'next/head'
import Nav from '@components/Global/Nav'
import Image from 'next/image'
import Router from 'next/router'
import React from 'react'
import Footer from '@components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Hero from '@/components/Global/Hero'
import Link from 'next/link'
import CTA from '@/components/Global/CTA'
import { useQuery } from '@tanstack/react-query'

export default function Article({ articleData }) {
	return (
		<>
			<Head>
				<title>My Makeup</title>
				<meta
					name="description"
					content="L'actualité de My-Makeup, ce que nous faisons pour améliorer votre quotidien !
					Et les nouveautés qui arrivent bientôt !"
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
					<section className={'relative py-20'}>
						<div className="mx-auto max-w-7xl">
							<div className="mx-auto mb-10">
								<h2 className="text-start text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl">
									Gardez votre projet beauté en tête, on s&apos;occupe du reste
								</h2>
								<p className="mt-6 w-1/2 text-start text-lg text-slate-700">
									Trouvez les meilleures maquilleuses, planifiez votre projet,
									payez et recevez des paiements, le tout dans une solution
									unifiée. Oui, vous avez bien lu.
								</p>
							</div>

							<section className={'mx-auto flex max-w-7xl gap-32'}>
								<div className={'w-1/2'}>
									<div className={'flex flex-col gap-2'}>
										{articles &&
											articles.map(article => (
												<div key={article.id}>
													{/*<p>{article.attributes.updatedAt.date}</p>*/}
													<h2
														className={'mb-4 text-xl font-bold text-slate-700'}
													>
														{article.attributes.title}
													</h2>
													{/*<div*/}
													{/*	className={'text-sm text-slate-500'}*/}
													{/*	dangerouslySetInnerHTML={article.attributes.content}*/}
													{/*/>*/}
													<Link
														className={''}
														href={`/blog/${article.attributes.slug}`}
													>
														Read article {'>'}
													</Link>
												</div>
											))}
									</div>
								</div>
								<div className={'flex w-1/2 items-center justify-center'}>
									<Image
										className={
											'h-[500px] w-full rounded-2xl object-cover object-top'
										}
										src={'/assets/maquilleuse_project.webp'}
										alt={'illustration'}
										width={'500'}
										height={'350'}
									/>
								</div>
							</section>
						</div>
					</section>

					<CTA />
				</main>
				<Footer />
			</div>
		</>
	)
}

export async function getStaticPaths() {
	const pb = initPocketBase()
	const res = await pb.collection('albums_ids').getFullList()
	/**
	 * format the data for getStaticPaths
	 * @type {{params: {id: *}}[]}
	 */
	const paths = res.map(record => ({
		params: {
			id: record.id,
		},
	}))
	return {
		paths,
		fallback: false,
	}
}

export async function getStaticProps({ params }) {
	// const pb = initPocketBase()
	const { isLoading, isError, data, error } = useQuery({
		queryKey: ['article', params.id],
		queryFn: async () => {
			const res = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}api/article/${params.id}`,
				{
					method: 'GET',
					headers: {
						// 	token
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
				}
			)
			return res.json()
		},
	})

	const record = await pb.collection('albums').getOne(params.id)
	const albumData = await getArticlesDetails(params.id)

	if (!albumData) {
		return {
			props: { hasError: true },
		}
	}
	return {
		props: {
			albumData,
		},
	}
}
