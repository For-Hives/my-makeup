import Link from 'next/link'

import { convertMarkdownToHtml, convertToStringDate } from '@/services/utils'
import ArrowLeftIcon from '@/components/Icons/ArrowLeftIcon'
import getAllArticle from '@/services/getAllArticle'
import getOneArticle from '@/services/getOneArticle'
import { Layout } from '@/components/Global/Layout'
import Footer from '@/components/Global/Footer'
import CTA from '@/components/Global/CTA'
import Nav from '@/components/Global/Nav'

export const dynamicParams = false
export const revalidate = 10

export const generateStaticParams = async () => {
	const articleList = await getAllArticle()

	const pathList = articleList?.map(record => ({
		id: record.attributes.slug,
	}))

	return pathList || []
}

export const generateMetadata = async ({ params }) => {
	const article = await getOneArticle(params.id)

	const meta = article?.attributes
	return {
		description:
			meta?.seo_description ??
			'Découvrez cet article passionnant de la part de My-Makeup',
		// seo tag canonical link
		alternates: {
			canonical: 'https://my-makeup.fr/blog/' + meta?.slug,
		},
		title: meta?.seo_title ?? 'My-Makeup',
	}
}

const BlogArticle = async ({ params }) => {
	const { id } = params
	const article = await getOneArticle(id)
	const articleWithConvertedContent = await convertMarkdownToHtml(article)
	const articleAttributes = articleWithConvertedContent?.attributes

	return (
		<>
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
						{articleAttributes && (
							<article>
								<header className="flex flex-col">
									<h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-800 sm:text-4xl">
										{articleAttributes.title}
									</h1>
									<time
										className="order-first flex items-center text-base text-gray-700"
										dateTime={articleAttributes.updatedAt.toString()}
									>
										<span className="h-4 w-0.5 rounded-full bg-gray-200" />
										<span className="ml-3">
											{convertToStringDate(articleAttributes.updatedAt)}
										</span>
									</time>
								</header>
								<div className={'flex flex-col'}>
									<div className={'prose my-8 xl:prose-lg'}>
										<Layout value={articleAttributes.content.toString()} />
									</div>
									<p className={'flex items-center text-base text-gray-600'}>
										<span className="h-4 w-0.5 rounded-full bg-gray-200" />
										<span className="ml-3">
											Auteur.e : {articleAttributes.author}
										</span>
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

export default BlogArticle
