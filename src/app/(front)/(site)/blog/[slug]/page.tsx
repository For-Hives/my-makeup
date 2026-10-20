import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'
import { Cta } from '@/components/blocs/Cta'
import { ContenuMarkdown } from '@/components/contenu/ContenuMarkdown'
import { markdownEnHtml } from '@/lib/markdown'
import {
	donneesStructureesDeLArticle,
	donneesStructureesDuFilDAriane,
	NOM_DU_SITE,
	serializeJsonLd,
} from '@/lib/seo/json-ld'
import { metadonneesEditoriales } from '@/lib/seo/metadonnees'
import { urlCanonique } from '@/lib/seo/url'
import { lArticleEnCache } from '@/services/public/cached'

// Rendered at each request: the build runs without a database. The article is read through the cache of
// Next, under its tag `article:<slug>`: a save of an article refreshes it (tickets 047 and 117).
export const dynamic = 'force-dynamic'

/** The page and its metadata read the same article: once per request. */
const lireLArticle = cache(async (slug: string) => lArticleEnCache(await getPayload({ config }), slug))

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
	const { slug } = await params
	const article = await lireLArticle(slug)
	// The page answers 404 below; its own metadata are those of the 404 page.
	if (!article) return {}
	return metadonneesEditoriales({
		titre: article.titreSeo || article.titre,
		descriptionRedigee: article.descriptionSeo,
		autres: [article.extrait, article.contenu],
		repli: `${article.titre} : un article du blog de ${NOM_DU_SITE} sur le maquillage et les maquilleuses professionnelles.`,
		chemin: `/blog/${article.slug}`,
		typeDePartage: 'article',
	})
}

/** « 17 septembre 2021 », as the site online writes the date of an article. */
function dateEnFrancais(iso: string): string {
	return new Date(iso).toLocaleDateString('fr-FR', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'Europe/Paris',
	})
}

function FlecheGauche() {
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
export default async function PageDeLArticle({ params }: PageProps<'/blog/[slug]'>) {
	const { slug } = await params
	const article = await lireLArticle(slug)
	if (!article) notFound()
	const html = await markdownEnHtml(article.contenu)
	const adresse = urlCanonique(`/blog/${article.slug}`)
	const donnees = [
		donneesStructureesDeLArticle({
			titre: article.titreSeo || article.titre,
			description: article.descriptionSeo || article.extrait || article.titre,
			url: adresse,
			auteur: article.auteur,
			publieLe: article.publieLe,
			modifieLe: article.modifieLe,
		}),
		donneesStructureesDuFilDAriane([
			{ nom: 'Accueil', url: urlCanonique('/') },
			{ nom: 'Blog', url: urlCanonique('/blog') },
			{ nom: article.titre, url: adresse },
		]),
	]
	return (
		<main className="relative">
			{donnees.map(bloc => (
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
						<FlecheGauche />
					</Link>
					<article>
						<header className="flex flex-col">
							<h1 className="mt-6 font-bold text-3xl text-gray-800 tracking-tight sm:text-4xl">{article.titre}</h1>
							<time dateTime={article.modifieLe} className="order-first flex items-center text-base text-gray-700">
								<span className="h-4 w-0.5 rounded-full bg-gray-200" />
								<span className="ml-3">{dateEnFrancais(article.modifieLe)}</span>
							</time>
						</header>
						<div className="flex flex-col">
							<ContenuMarkdown html={html} />
							{article.auteur && (
								<p className="flex items-center text-base text-gray-600">
									<span className="h-4 w-0.5 rounded-full bg-gray-200" />
									<span className="ml-3">Auteur.e : {article.auteur}</span>
								</p>
							)}
						</div>
					</article>
				</div>
			</div>
			<Cta />
		</main>
	)
}
