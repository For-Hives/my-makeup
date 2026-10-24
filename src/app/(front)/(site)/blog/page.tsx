import type { Metadata } from 'next'
import { Cta } from '@/components/blocks/Cta'
import { ArticleList } from '@/components/blog/ArticleList'
import { pageMetadata } from '@/lib/seo/metadata'
import { cachedArticles } from '@/services/public/cached'

// Rendered at each request: the build runs without a database. The articles are read through the cache
// of Next, tagged `articles`: a save of an article in the admin panel refreshes the list (tickets 047 and 117), and a
// visit of a page that did not change reads nothing in the database.
export const dynamic = 'force-dynamic'

// `/toutes-les-news` redirects here (ticket 072): the list shows every published article, not the
// last three of the old page.
export const metadata: Metadata = pageMetadata({
	titre: 'Blog de My-Makeup',
	description:
		"L'actualité de My-Makeup, ce que nous faisons pour améliorer votre quotidien ! Et les nouveautés qui arrivent bientôt !",
	repli: "L'actualité de My-Makeup : conseils, nouveautés et articles pour trouver la maquilleuse qui vous correspond.",
	chemin: '/blog',
})

export default async function BlogPage() {
	const articles = await cachedArticles()
	return (
		<main className="relative">
			<section className="relative px-4 py-20 md:px-8 2xl:px-0">
				<div className="mx-auto max-w-7xl">
					<div className="reveal mx-auto mb-10">
						<h1 className="enter-mask w-full text-start font-bold text-4xl text-gray-900 tracking-tight">
							Blog & News
						</h1>
						<p className="mt-6 w-full text-start text-gray-700 text-lg md:w-2/3">
							Des conseils pour préparer votre mariage, prendre soin de votre peau et suivre les tendances, et les
							nouveautés de My-Makeup, pour trouver la maquilleuse qui vous correspond.
						</p>
					</div>
					<ArticleList articles={articles} />
				</div>
			</section>
			<Cta />
		</main>
	)
}
