import React from 'react'
import Nav from '@/components/Global/Nav'
import Footer from '@/components/Global/Footer'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Head from 'next/head'
import Image from 'next/image'
import Hero from '@/components/Global/Hero'
import { convertToStringDate } from '@/services/utils'
import Link from 'next/link'
import CTA from '@/components/Global/CTA'

/**
 * todo : add content
 * @param props
 * @constructor
 */
function Contact(props) {
	return (
		<>
			<Head>
				<title>Contact - My Makeup</title>
				<meta
					name="description"
					content="Contactez-nous pour toute question, suggestion ou collaboration ! L'équipe My Makeup est à votre écoute !"
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
					<Hero
						title={<>Contact</>}
						description={
							<>
								{
									"Une idée, une envie de collaborer, une question ? N'hésitez pas à nous contacter !"
								}
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

							<section
								className={'mx-auto mb-32 mt-16 flex max-w-7xl gap-32'}
							></section>
						</div>
					</section>
					<CTA />
				</main>
				<Footer />
			</div>
		</>
	)
}

export default Contact
