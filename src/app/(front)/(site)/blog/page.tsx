import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import { ArchImage } from '@/components/art/ArchImage'
import { GlowBlob, LineDrawing, MakeupObject } from '@/components/art/graphics'
import { MarqueeBanner } from '@/components/art/MarqueeBanner'
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

/** The topics the lede above names: the banner repeats them, nothing more. */
const TOPICS = [
	'Préparer son mariage',
	'Prendre soin de sa peau',
	'Suivre les tendances',
	'Les nouveautés de My-Makeup',
]

export default async function BlogPage() {
	const articles = await cachedArticles()
	return (
		<main className={`${display.variable} ${body.variable} relative bg-art-paper font-body text-ink`}>
			<section className="relative overflow-hidden px-4 pt-14 pb-16 md:px-8 md:pt-24 md:pb-24 2xl:px-0">
				<GlowBlob size="lg" tone="rose" className="-top-40 -right-56" />
				<GlowBlob size="md" tone="indigo" className="-bottom-72 -left-64 opacity-40" />
				<div className="relative mx-auto max-w-7xl">
					<header className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-20">
						<div className="max-w-3xl">
							<p
								className="enter inline-flex items-center gap-2.5 font-semibold text-[13px] text-indigo-800 uppercase tracking-[0.14em]"
								style={enterOrder(0)}
							>
								<span aria-hidden="true" className="h-px w-11 bg-current" />
								Le blog de My-Makeup
							</p>
							<h1
								className="enter-mask mt-4 text-balance font-display font-medium text-5xl text-ink leading-none tracking-tight md:text-7xl"
								style={enterOrder(1)}
							>
								Blog &amp; News
							</h1>
							<p className="enter mt-6 max-w-[60ch] text-lg text-mute leading-8" style={enterOrder(2)}>
								Des conseils pour préparer votre mariage, prendre soin de votre peau et suivre les tendances, et les
								nouveautés de My-Makeup, pour trouver la maquilleuse qui vous correspond.
							</p>
						</div>
						<div aria-hidden="true" className="relative hidden lg:block">
							<ArchImage tint="blush" band="band" mark="plus">
								<span className="absolute inset-[18%_20%_10%] block text-indigo-900">
									<MakeupObject name="brush" />
								</span>
							</ArchImage>
							<span className="absolute -bottom-6 -left-12 block h-24 w-24 text-art-line">
								<LineDrawing name="lips" />
							</span>
						</div>
					</header>
				</div>
			</section>
			<MarqueeBanner items={TOPICS} label="Les sujets du blog" variant="blush" />
			<section className="relative overflow-hidden px-4 py-16 md:px-8 md:py-24 2xl:px-0">
				<GlowBlob size="md" tone="blush" className="top-1/3 -right-72" />
				<div className="relative mx-auto max-w-7xl">
					<ArticleList articles={articles} />
				</div>
			</section>
			<Cta />
		</main>
	)
}
