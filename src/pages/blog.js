import React from 'react'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'
import Head from 'next/head'
import Image from 'next/image'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import Link from 'next/link'
import { convertToStringDate } from '@/services/utils'

/**
 * @param props
 * @constructor
 */
function Blog({ articles }) {
	// take only the first 3 articles
	const lastArticles = articles.slice(0, 3)

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
					<Hero
						title={<>Blog & News</>}
						description={
							<>
								Les actualités de My-Makeup, ce que nous faisons pour améliorer
								votre quotidien ! Et les nouveautés qui arrivent bientôt !
							</>
						}
					/>
					<section className={'relative py-20'}>
						<div className="mx-auto max-w-7xl">
							<div className="mx-auto mb-10">
								<h2 className="w-1/2 text-start text-4xl font-bold tracking-tight text-slate-900 sm:text-4xl">
									Nos derniers articles & actualités !
								</h2>
								<p className="mt-6 w-1/2 text-start text-lg text-slate-700">
									{
										"My Makeup, plus qu'une plateforme de mise en relation, une équipe de passionnés à votre service !"
									}
								</p>
							</div>

							<section className={'mx-auto mb-32 mt-16 flex max-w-7xl gap-32'}>
								<div className={'w-1/2'}>
									<div className={'flex flex-col gap-16'}>
										{articles ? (
											lastArticles.map(article => (
												<div className={'flex flex-col gap-2'} key={article.id}>
													<div
														className={'relative pl-2 text-base text-slate-400'}
													>
														{convertToStringDate(article.attributes.updatedAt)}
														<div
															className={
																'absolute left-0 top-0 h-full w-0.5 bg-slate-300'
															}
														></div>
													</div>
													<h2
														className={'text-lg font-semibold text-slate-900'}
													>
														{article.attributes.title}
													</h2>
													<p className={'text-sm text-slate-700'}>
														{article.attributes.excerpt}
													</p>
													<Link
														className={
															'flex items-center font-medium text-indigo-900'
														}
														href={`/blog/${article.attributes.slug}`}
													>
														{"Lire l'article"}
														<span className="material-icons-round text-base text-indigo-900">
															chevron_right
														</span>
													</Link>
												</div>
											))
										) : (
											<p>{"Il n'y a pas d'articles"}</p>
										)}
									</div>
								</div>
								<div
									className={'flex w-1/2 flex-col items-center justify-center'}
								>
									<Image
										className={
											'h-[500px] w-full rounded-2xl object-cover object-top'
										}
										src={'/assets/maquilleuse_project.webp'}
										alt={'illustration'}
										width={'500'}
										height={'350'}
									/>
									<div className={'mt-8 flex w-full justify-end'}>
										<Link
											href={'/toutes-les-news'}
											className={'btn-primary flex items-center font-medium'}
										>
											Voir toutes les news & articles
											<span className="material-icons-round text-base">
												chevron_right
											</span>
										</Link>
									</div>
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

export default Blog

export async function getServerSideProps() {
	const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}api/articles`, {
		method: 'GET',
		headers: {
			// 	token
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	})
	const data = await res.json()

	return {
		props: {
			articles: data.data,
		},
	}
}
