import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { Cta } from '@/components/blocks/Cta'
import { ArticleList } from '@/components/blog/ArticleList'
import { body, display } from '@/components/direct-edit/fonts'
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

/** The order of the load-in (src/app/(front)/globals.css, `.enter*`): 0, 1, 2. */
const enterOrder = (index: 0 | 1 | 2) => ({ '--enter-i': index }) as CSSProperties

export default async function BlogPage() {
	const articles = await cachedArticles()
	return (
		<main className={`${display.variable} ${body.variable} relative font-body`}>
			<section className="relative px-4 pt-14 pb-16 md:px-8 md:pt-24 md:pb-24 2xl:px-0">
				<div className="mx-auto max-w-7xl">
					<header className="max-w-3xl">
						<p className="enter text-gray-700 text-xs uppercase tracking-[0.14em]" style={enterOrder(0)}>
							Le blog de My-Makeup
						</p>
						<h1
							className="enter-mask mt-4 text-balance font-display font-medium text-5xl text-gray-900 leading-none tracking-tight md:text-7xl"
							style={enterOrder(1)}
						>
							Blog & News
						</h1>
						<p className="enter mt-6 max-w-[60ch] text-gray-700 text-lg leading-8" style={enterOrder(2)}>
							Des conseils pour préparer votre mariage, prendre soin de votre peau et suivre les tendances, et les
							nouveautés de My-Makeup, pour trouver la maquilleuse qui vous correspond.
						</p>
					</header>
					<div className="mt-12 md:mt-16">
						<ArticleList articles={articles} />
					</div>
				</div>
			</section>
			<Cta />
		</main>
	)
}
