import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'
import { Cta } from '@/components/blocks/Cta'
import { ProfileBlock } from '@/components/blocks/ProfileBlock'
import { MarkdownContent } from '@/components/content/MarkdownContent'
import { markdownToHtml } from '@/lib/markdown'
import { articleStructuredData, breadcrumbStructuredData, SITE_NAME, serializeJsonLd } from '@/lib/seo/json-ld'
import { editorialMetadata } from '@/lib/seo/metadata'
import { canonicalUrl } from '@/lib/seo/url'
import { cachedArticle, cachedProfileBlock } from '@/services/public/cached'
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

/** « 17 septembre 2021 », as the site online writes the date of an article. */
function dateInFrench(iso: string): string {
	return new Date(iso).toLocaleDateString('fr-FR', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'Europe/Paris',
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

function LeftArrow() {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
			className="h-4 w-4 stroke-gray-500 transition group-hover:stroke-gray-700"
		>
			<path
				d="M7.25 11.25 3.75 8m0 0 3.5-3.25M3.75 8h8.5"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/**
 * The page of an article of the blog, rendered by the server (ticket 106): its title is the only h1, its
 * markdown is turned into sanitized HTML with its titles lowered (src/lib/markdown.ts). An unknown slug and
 * a draft answer 404 in French (E59). The structured data says `Article` and the breadcrumb.
 */
export default async function ArticlePage({ params }: PageProps<'/blog/[slug]'>) {
	const { slug } = await params
	const article = await readArticle(slug)
	if (!article) notFound()
	const html = await markdownToHtml(article.contenu)
	const cards = await readBlock()
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
		<main className="relative">
			{data.map(bloc => (
				<script
					key={bloc['@type']}
					type="application/ld+json"
					// serializeJsonLd escapes <, > and &, so the data cannot close the tag.
					dangerouslySetInnerHTML={{ __html: serializeJsonLd(bloc) }}
				/>
			))}
			<div className="relative mx-auto my-24 max-w-7xl px-4 md:my-48 md:px-8 2xl:px-0">
				<div className="mx-auto max-w-2xl">
					<Link
						href="/blog"
						aria-label="Retour aux articles"
						className="group mb-8 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-gray-800/5 shadow-md ring-1 ring-gray-900/5 transition 2xl:absolute 2xl:top-[-0.375rem] 2xl:left-0 2xl:mt-0"
					>
						<LeftArrow />
					</Link>
					<article>
						<header className="flex flex-col">
							<h1 className="mt-6 font-bold text-3xl text-gray-800 tracking-tight sm:text-4xl">{article.titre}</h1>
							<time dateTime={article.modifieLe} className="order-first flex items-center text-base text-gray-700">
								<span className="h-4 w-0.5 rounded-full bg-gray-200" />
								<span className="ml-3">{dateInFrench(article.modifieLe)}</span>
							</time>
						</header>
						<div className="flex flex-col">
							<MarkdownContent html={html} />
							{article.auteur && (
								<p data-testid="auteur" className="flex items-center text-base text-gray-600">
									<span className="h-4 w-0.5 rounded-full bg-gray-200" />
									<span className="ml-3">Par {article.auteur}</span>
								</p>
							)}
						</div>
					</article>
					<ProfileBlock titre="Des maquilleuses près de chez vous" cartes={cards} compact />
				</div>
			</div>
			<Cta />
		</main>
	)
}
