import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { type CSSProperties, cache } from 'react'
import { BlogPanel } from '@/components/art/BlogCard'
import { GlowBlob } from '@/components/art/graphics'
import { Pill } from '@/components/art/Pill'
import { Cta } from '@/components/blocks/Cta'
import { ArticleBody } from '@/components/blog/ArticleBody'
import { ArticleOutline } from '@/components/blog/ArticleOutline'
import { ArticleShare } from '@/components/blog/ArticleShare'
import { articleDate } from '@/components/blog/article-date'
import { RelatedArticles, relatedArticles } from '@/components/blog/RelatedArticles'
import { body, display } from '@/components/direct-edit/fonts'
import { ProfileGrid } from '@/components/static-pages/ProfileGrid'
import { outlineOf, readingMinutes } from '@/lib/article-reading'
import { markdownToDocument } from '@/lib/markdown'
import { articleStructuredData, breadcrumbStructuredData, SITE_NAME, serializeJsonLd } from '@/lib/seo/json-ld'
import { editorialMetadata } from '@/lib/seo/metadata'
import { canonicalUrl } from '@/lib/seo/url'
import { cachedArticle, cachedArticles, cachedProfileBlock } from '@/services/public/cached'
import { ARTICLE_BLOCK_SIZE } from '@/services/public/profile-block'

// The HTML is kept in the cache of Next (ticket 269). Nothing is rendered at build, which runs without a
// database: no address is generated ahead (`generateStaticParams`), the page is rendered at its first visit,
// then served from the cache. A save of the document refreshes it by its path and by its tag `article:<slug>`
// (src/lib/revalidate.ts); the hour is the backstop of the reads of the data (src/services/public/cached.ts).
// Nothing in this page or in the layout of the site reads a cookie or a header: that is what keeps it cacheable.
export const revalidate = 3600
export const dynamicParams = true
export function generateStaticParams(): { slug: string }[] {
	return []
}

/** The page and its metadata read the same article: once per request. */
const readArticle = cache(async (slug: string) => cachedArticle(await getPayload({ config }), slug))

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
	const { slug } = await params
	const article = await readArticle(slug)
	// The page answers 404 below; its own metadata are those of the 404 page.
	if (!article) return {}
	return editorialMetadata({
		titre: article.titreSeo || article.titre,
		descriptionRedigee: article.descriptionSeo,
		autres: [article.extrait, article.contenu],
		repli: `${article.titre} : un article du blog de ${SITE_NAME} sur le maquillage et les maquilleuses professionnelles.`,
		chemin: `/blog/${article.slug}`,
		typeDePartage: 'article',
	})
}

/** The makeup artists under the article. A failed read leaves the page without its block, never a 500. */
async function readBlock() {
	try {
		return await cachedProfileBlock('', ARTICLE_BLOCK_SIZE)
	} catch {
		return []
	}
}

/** The other articles under this one. A failed read leaves the page without its block, never a 500. */
async function readRelated(slug: string) {
	try {
		return relatedArticles(await cachedArticles(), slug)
	} catch {
		return []
	}
}

/** The order of the load-in (src/app/(front)/globals.css, `.enter*`): 0, 1, 2. */
const enterOrder = (index: 0 | 1 | 2) => ({ '--enter-i': index }) as CSSProperties

/**
 * The page of an article of the blog, rendered by the server (ticket 106, redone in issue 1103): its title is
 * the only h1, its markdown is turned into sanitized HTML with its titles lowered (src/lib/markdown.ts). An
 * unknown slug and a draft answer 404 in French (E59). The structured data says `Article` and the breadcrumb.
 *
 * Top to bottom: the way back, the date, the reading time and the signature, the title, the excerpt as a
 * standfirst, the text in a reading column (with a table of contents for a long one), the foot with the
 * ways to share, the other articles, the makeup artists, then the call to action.
 */
export default async function ArticlePage({ params }: PageProps<'/blog/[slug]'>) {
	const { slug } = await params
	const article = await readArticle(slug)
	if (!article) notFound()
	const { html, headings } = await markdownToDocument(article.contenu)
	const [cards, related] = await Promise.all([readBlock(), readRelated(article.slug)])
	const minutes = readingMinutes(article.contenu)
	const outline = outlineOf(headings, minutes)
	const articleUrl = canonicalUrl(`/blog/${article.slug}`)
	const data = [
		articleStructuredData({
			titre: article.titreSeo || article.titre,
			description: article.descriptionSeo || article.extrait || article.titre,
			url: articleUrl,
			auteur: article.auteur,
			publieLe: article.publieLe,
			modifieLe: article.modifieLe,
		}),
		breadcrumbStructuredData([
			{ nom: 'Accueil', url: canonicalUrl('/') },
			{ nom: 'Blog', url: canonicalUrl('/blog') },
			{ nom: article.titre, url: articleUrl },
		]),
	]
	return (
		<main className={`${display.variable} ${body.variable} relative overflow-hidden bg-art-paper font-body text-ink`}>
			{data.map(bloc => (
				<script
					key={bloc['@type']}
					type="application/ld+json"
					// serializeJsonLd escapes <, > and &, so the data cannot close the tag.
					dangerouslySetInnerHTML={{ __html: serializeJsonLd(bloc) }}
				/>
			))}
			<GlowBlob size="md" tone="rose" className="-top-52 -right-72" />
			<GlowBlob size="sm" tone="indigo" className="top-[60rem] -left-72 opacity-40" />
			<div className="relative mx-auto max-w-5xl px-4 pt-10 md:px-8 md:pt-16">
				<article className="mx-auto max-w-3xl">
					<header className="border-ink border-t pt-6">
						<div className="enter flex flex-wrap items-center gap-x-4 gap-y-2" style={enterOrder(0)}>
							<Pill href="/blog" size="sm">
								← Tous les articles
							</Pill>
						</div>
						<p
							className="enter mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-mute text-xs uppercase tracking-[0.14em]"
							style={enterOrder(0)}
						>
							<time dateTime={article.modifieLe}>{articleDate(article.modifieLe)}</time>
							{minutes !== null && (
								<>
									<span aria-hidden="true" className="h-3 w-px bg-gray-300" />
									<span data-testid="temps-de-lecture">{minutes} min de lecture</span>
								</>
							)}
							{article.auteur && (
								<>
									<span aria-hidden="true" className="h-3 w-px bg-gray-300" />
									<span data-testid="auteur">Par {article.auteur}</span>
								</>
							)}
						</p>
						<h1
							className="enter-mask mt-5 text-balance font-display font-medium text-4xl text-ink leading-[1.08] tracking-tight md:text-6xl"
							style={enterOrder(1)}
						>
							{article.titre}
						</h1>
						{article.extrait && (
							<p className="enter mt-6 max-w-[60ch] text-mute text-xl leading-8" style={enterOrder(2)}>
								{article.extrait}
							</p>
						)}
					</header>
					<div className="reveal mt-10 md:mt-12">
						<BlogPanel slug={article.slug} shape="cover" />
					</div>
					<div className="mt-10 md:mt-14">
						<ArticleOutline headings={outline} />
						<ArticleBody html={html} />
						<ArticleShare title={article.titre} url={articleUrl} />
					</div>
				</article>
			</div>
			{/* The cards leave the reading column: they take the frame of the pages, like the grids of /blog and /search. */}
			<div className="page-frame relative">
				<RelatedArticles articles={related} />
				<div className="mt-4">
					<ProfileGrid titre="Des maquilleuses près de chez vous" cartes={cards} />
				</div>
			</div>
			<div className="mt-16 md:mt-24">
				<Cta />
			</div>
		</main>
	)
}
