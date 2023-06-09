import React from 'react'
import Footer from '@/components/Global/Footer'
import Nav from '@/components/Global/Nav'
import ResponsiveTemporary from '@/components/Global/ResponsiveTemporary'
import Head from 'next/head'
import Image from 'next/image'
import Hero from '@/components/Global/Hero'
import CTA from '@/components/Global/CTA'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import Loader from '@/components/Global/Loader'
import { read } from 'to-vfile'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkHtml from 'remark-html'

/**
 * todo : add content
 * @param props
 * @constructor
 */
function Blog(props) {
	const [file, setFile] = React.useState(null)

	const { isLoading, isError, data, error } = useQuery({
		queryKey: ['articles'],
		queryFn: async () => {
			const res = await fetch(
				`${process.env.NEXT_PUBLIC_API_URL}api/articles`,
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

	async function test() {
		setFile(
			await unified()
				.use(remarkParse)
				.use(remarkHtml)
				.process(await read())
		)
	}

	React.useEffect(() => {
		if (!isLoading && !isError) {
			test()
		}
	}, [])

	React.useEffect(() => {
		if (!isLoading && !isError) {
			console.log(file)
		}
	}, [file])

	if (isLoading) return <Loader />

	if (error) return 'An error has occurred: ' + error.message

	const articles = data.data
	console.log(data)

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

export default Blog
