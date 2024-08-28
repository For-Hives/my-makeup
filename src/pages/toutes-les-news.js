import React from 'react'

import Head from 'next/head'
import Link from 'next/link'

import { convertToStringDate } from '@/services/utils'
import Footer from '@/components/Global/Footer'
import Hero from '@/components/Global/Hero'
import Nav from '@/components/Global/Nav'
import CTA from '@/components/Global/CTA'

/**
 * @param props
 * @constructor
 */
function ToutesLesNews({ articles }) {
	return (
		<>
			<Head>
				<title>My-Makeup tous les articles !</title>
				<meta
					content="Toute l'actualité de My-Makeup, c'est ici que vous trouverez toutes les dernières news !
					Et les nouveautés qui arrivent bientôt !"
					name="description"
				/>
				{/*	seo tag canonical link */}
				<link href={'https://my-makeup.fr/toutes-les-news'} rel="canonical" />
			</Head>
			<Nav />
			<main className={'relative'}>
				<Hero
					description={
						<>
							Les actualités de My-Makeup, ce que nous faisons pour améliorer
							votre quotidien ! Et les nouveautés qui arrivent bientôt !
						</>
					}
					isCTALoginDisplayed={false}
					isSearchDisplayed={false}
					isSimpleVersionDisplayed={true}
					title={<>Toutes nos news & articles</>}
				/>
				<section className={'relative px-4 py-20 md:px-8 2xl:px-0'}>
					<div className="mx-auto max-w-7xl">
						<div className="mx-auto mb-10">
							<h2 className="w-full text-start text-4xl font-bold tracking-tight text-gray-900 sm:text-4xl md:w-1/2">
								Nos articles & actualités !
							</h2>
							<p className="mt-6 w-1/2 text-start text-lg text-gray-700">
								{
									"My-Makeup, plus qu'une plateforme de mise en relation, une équipe de passionnés à votre service !"
								}
							</p>
						</div>

						<section
							className={
								'mx-auto mb-16 mt-16 flex max-w-7xl gap-16 md:mb-32 md:gap-32'
							}
						>
							<div className={'w-full'}>
								<div
									className={
										'grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4'
									}
								>
									{articles ? (
										articles.map(article => (
											<div className={'flex flex-col gap-2'} key={article.id}>
												<div
													className={'relative pl-2 text-base text-gray-700'}
												>
													{convertToStringDate(article.attributes.updatedAt)}
													<div
														className={
															'absolute left-0 top-0 h-full w-0.5 bg-gray-300'
														}
													></div>
												</div>
												<h2 className={'text-lg font-semibold text-gray-900'}>
													{article.attributes.title}
												</h2>
												<p className={'text-sm text-gray-700'}>
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
										<p>No articles</p>
									)}
								</div>
							</div>
						</section>
					</div>
				</section>

				<CTA />
			</main>
			<Footer />
		</>
	)
}

export default ToutesLesNews

export async function getServerSideProps() {
	const res = await fetch(
		`${process.env.NEXT_PUBLIC_API_URL}/api/articles?sort[publishedAt]=desc`,
		{
			headers: {
				// 	token
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			method: 'GET',
		}
	)
	const data = await res.json()

	return {
		props: {
			articles: data.data,
		},
	}
}
